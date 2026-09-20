import { clientCache } from './client-cache.ts';
import { requestTranslateBatch } from './api.ts';
import { rowHold } from './hold.ts';
import { NonDestructiveTranslationMount } from './mount.ts';
import { StreamDebounceViewportObserver } from './viewport-observer.ts';

type TranslateTask = {
  element: HTMLElement;
  text: string;
};

class LazyTranslationQueue {
  private enabled = true;
  private viewportObserver: StreamDebounceViewportObserver;

  constructor() {
    this.viewportObserver = new StreamDebounceViewportObserver({
      rootMargin: '150px 0px',
      debounceMs: 400,
      onVisibleBatch: (items) => this.handleVisibleBatch(items),
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.viewportObserver.disconnect();
    }
  }

  observe(element: HTMLElement, text: string, immediate = false): void {
    if (!this.enabled || !element.isConnected) return;

    // 1. If cached, apply immediately non-destructively
    const cached = clientCache.get(text);
    if (cached) {
      this.applyTranslation(element, cached, text);
      return;
    }

    // 2. Delegate to streaming-debounced viewport observer
    this.viewportObserver.observeWithDebounce(element, text, immediate);
  }

  /**
   * 扣留行的取文本路径。命中缓存时同步就绪（没有需要遮住的等待），否则走无可见
   * 性判定的防抖批次；译文挂载由扣留队列在轮到这一行时执行，好让逐字与对数淡入
   * 从它真正上屏的那一刻开始。
   */
  observeHeld(element: HTMLElement, text: string): void {
    if (!this.enabled || !element.isConnected) return;

    const cached = clientCache.get(text);
    if (cached) {
      rowHold.ready(element, cached);
      return;
    }

    this.viewportObserver.observeHeld(element, text);
  }

  private async handleVisibleBatch(items: TranslateTask[]): Promise<void> {
    if (!this.enabled || items.length === 0) return;

    // Document order: translations appear in reading order (top-to-bottom),
    // never out-of-order even when IntersectionObserver fires entries randomly.
    const sorted = [...items].sort((a, b) => {
      if (a.element === b.element) return 0;
      const pos = a.element.compareDocumentPosition(b.element);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // Group elements by text to deduplicate API requests
    const textMap = new Map<string, HTMLElement[]>();
    for (const item of sorted) {
      if (!item.element.isConnected) continue;

      const cached = clientCache.get(item.text);
      if (cached) {
        if (this.stillMatches(item.element, item.text)) {
          if (rowHold.stateFor(item.element)) rowHold.ready(item.element, cached);
          else this.applyTranslation(item.element, cached, item.text);
        }
        continue;
      }

      const list = textMap.get(item.text) || [];
      list.push(item.element);
      textMap.set(item.text, list);
    }

    const uniqueTexts = Array.from(textMap.keys());
    if (uniqueTexts.length === 0) return;

    const results = await requestTranslateBatch(uniqueTexts);

    for (const res of results) {
      const entries = textMap.get(res.original) || [];
      if (
        res.translated &&
        res.translated.trim() &&
        res.channel !== 'fallback' &&
        res.channel !== 'fallback-client' &&
        res.translated.trim() !== res.original.trim()
      ) {
        clientCache.set(res.original, res.translated);
        for (const entry of entries) {
          if (!entry.isConnected || !this.enabled) continue;
          const held = rowHold.stateFor(entry);
          // 文本在请求在途时又变了：这一份结果已经过时，等新文本自己的结果。
          if (held && held.text !== res.original) continue;
          if (!this.stillMatches(entry, res.original)) continue;
          // 扣留行在这里只「就绪」：真正挂载与上屏由队列按阅读顺序执行。
          if (held) rowHold.ready(entry, res.translated);
          else this.applyTranslation(entry, res.translated, res.original);
        }
      } else {
        // 明确失败（降级 / 通道关闭 / 空译文 / 与原文相同）没有可等的译文，
        // 直接放行原文。
        for (const entry of entries) {
          const held = rowHold.stateFor(entry);
          if (held && held.text === res.original) rowHold.ready(entry, null);
        }
        console.debug(`[dsh-chat-translate] 翻译未成功 (降级保留原文): "${res.original.slice(0, 40)}"`);
      }
    }
  }

  /** 元素当前承载的原文是否仍是这次结果对应的那一份。 */
  private stillMatches(element: HTMLElement, original: string): boolean {
    const current = NonDestructiveTranslationMount.extractVisibleText(element);
    return !current || current === original;
  }

  private applyTranslation(element: HTMLElement, translated: string, original: string): void {
    if (!element.isConnected || !this.enabled) return;
    NonDestructiveTranslationMount.mount(element, translated, {
      originalText: original,
    });
  }

  disconnect(): void {
    this.viewportObserver.disconnect();
  }
}

export const lazyQueue = new LazyTranslationQueue();
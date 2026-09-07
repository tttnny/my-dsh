import { clientCache } from './client-cache.ts';
import { requestTranslateBatch } from './api.ts';
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
        this.applyTranslation(item.element, cached, item.text);
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
      if (
        res.translated &&
        res.translated.trim() &&
        res.channel !== 'fallback' &&
        res.channel !== 'fallback-client' &&
        res.translated.trim() !== res.original.trim()
      ) {
        clientCache.set(res.original, res.translated);
        const entries = textMap.get(res.original) || [];
        for (const entry of entries) {
          if (entry.isConnected && this.enabled) {
            this.applyTranslation(entry, res.translated, res.original);
          }
        }
      } else if (res.channel === 'fallback' || res.channel === 'fallback-client') {
        console.debug(`[dsh-chat-translate] 翻译未成功 (降级保留原文): "${res.original.slice(0, 40)}"`);
      }
    }
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
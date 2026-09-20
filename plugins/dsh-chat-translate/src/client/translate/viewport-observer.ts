/**
 * StreamDebounceViewportObserver
 *
 * Combines:
 * 1. True IntersectionObserver for viewport visibility detection (rootMargin: '150px 0px').
 * 2. Typing/streaming debounce (default 400ms) to avoid translating partial streaming sentences.
 * 3. Batch queuing to group multiple visible elements into efficient batch requests.
 *
 * 扣留行（{@link observeHeld}）复用同一条防抖与批次，只跳过可见性判定：
 * 行此刻是隐藏的，等不到 IntersectionObserver 回调。
 */

import { NonDestructiveTranslationMount } from './mount.ts';

export interface ViewportObserverOptions {
  rootMargin?: string;
  debounceMs?: number;
  onVisibleBatch: (items: Array<{ element: HTMLElement; text: string }>) => void;
}

export class StreamDebounceViewportObserver {
  private intersectionObserver: IntersectionObserver | null = null;
  /**
   * Pending per-element streaming debounce timers. A Map (not a WeakMap)
   * because disconnect() must enumerate and clear every pending timer: a
   * WeakMap cannot be iterated, so a debounce armed just before the switch was
   * turned off would still fire register() afterwards.
   */
  private streamingTimers = new Map<HTMLElement, number>();
  private pendingQueue: Array<{ element: HTMLElement; text: string }> = [];
  private batchFlushTimer: number | null = null;
  private options: Required<Omit<ViewportObserverOptions, 'onVisibleBatch'>> & {
    onVisibleBatch: ViewportObserverOptions['onVisibleBatch'];
  };

  constructor(options: ViewportObserverOptions) {
    this.options = {
      rootMargin: options.rootMargin ?? '150px 0px',
      debounceMs: options.debounceMs ?? 400,
      onVisibleBatch: options.onVisibleBatch,
    };
    this.initIntersectionObserver();
  }

  private initIntersectionObserver(): void {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            const el = entry.target;
            // Stop observing once it enters viewport and is queued
            this.intersectionObserver?.unobserve(el);
            const text = el.dataset.tidyPendingText
              || NonDestructiveTranslationMount.extractVisibleText(el)
              || '';
            if (text) {
              delete el.dataset.tidyPendingText;
              this.enqueueBatch(el, text);
            }
          }
        }
      },
      {
        root: null, // viewport
        rootMargin: this.options.rootMargin,
        threshold: 0,
      }
    );
  }

  /**
   * Observe an element with streaming debounce.
   * If streaming updates characterData repeatedly within debounceMs, the timer resets.
   */
  observeWithDebounce(element: HTMLElement, text: string, immediate = false): void {
    this.armDebounce(element, text, immediate, false);
  }

  /**
   * 扣留行的取文本路径：保留同一套流式防抖，跳过可见性判定——行此刻是
   * 隐藏的（永远不进入视口），放行由扣留控制器负责。
   */
  observeHeld(element: HTMLElement, text: string): void {
    this.armDebounce(element, text, false, true);
  }

  private armDebounce(
    element: HTMLElement,
    text: string,
    immediate: boolean,
    skipViewport: boolean
  ): void {
    if (!element || !text) return;

    // Clear any active streaming timer for this element
    const existingTimer = this.streamingTimers.get(element);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      this.streamingTimers.delete(element);
    }

    if (immediate || this.options.debounceMs <= 0) {
      this.register(element, text, skipViewport);
      return;
    }

    const timer = window.setTimeout(() => {
      // Stale-callback guard: disconnect() clears the map, so a callback that
      // is no longer the registered timer must not re-enter the observer.
      if (this.streamingTimers.get(element) !== timer) return;
      this.streamingTimers.delete(element);
      if (element.isConnected) {
        // Read latest text content after streaming settles. 已挂载的行必须
        // 排除我们自己的译文与原文容器，否则读到的会是两者的拼接。
        const latestText = NonDestructiveTranslationMount.extractVisibleText(element) || text;
        this.register(element, latestText, skipViewport);
      }
    }, this.options.debounceMs);

    this.streamingTimers.set(element, timer);
  }

  private register(element: HTMLElement, text: string, skipViewport: boolean): void {
    if (!element.isConnected) return;

    if (skipViewport || !this.intersectionObserver) {
      // 扣留行与不支持 IntersectionObserver 的环境都直接进批次。
      this.enqueueBatch(element, text);
      return;
    }

    element.dataset.tidyPendingText = text;
    this.intersectionObserver.observe(element);
  }

  private enqueueBatch(element: HTMLElement, text: string): void {
    this.pendingQueue.push({ element, text });
    if (this.batchFlushTimer === null && typeof window !== 'undefined') {
      this.batchFlushTimer = window.setTimeout(() => {
        this.batchFlushTimer = null;
        this.flushQueue();
      }, 50);
    }
  }

  private flushQueue(): void {
    if (this.pendingQueue.length === 0) return;
    const batch = [...this.pendingQueue];
    this.pendingQueue = [];
    this.options.onVisibleBatch(batch);
  }

  unobserve(element: HTMLElement): void {
    const timer = this.streamingTimers.get(element);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.streamingTimers.delete(element);
    }
    delete element.dataset.tidyPendingText;
    if (this.intersectionObserver) {
      this.intersectionObserver.unobserve(element);
    }
  }

  disconnect(): void {
    if (this.batchFlushTimer !== null) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }
    // Drop every pending streaming debounce: after a disable none of them may
    // fire registerForViewport() (the Map is iterable, so this is exhaustive).
    for (const timer of this.streamingTimers.values()) {
      clearTimeout(timer);
    }
    this.streamingTimers.clear();
    this.pendingQueue = [];
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.initIntersectionObserver();
    }
  }
}

/**
 * StreamDebounceViewportObserver
 *
 * Combines:
 * 1. True IntersectionObserver for viewport visibility detection (rootMargin: '150px 0px').
 * 2. Typing/streaming debounce (default 400ms) to avoid translating partial streaming sentences.
 * 3. Batch queuing to group multiple visible elements into efficient batch requests.
 */

export interface ViewportObserverOptions {
  rootMargin?: string;
  debounceMs?: number;
  onVisibleBatch: (items: Array<{ element: HTMLElement; text: string }>) => void;
}

export class StreamDebounceViewportObserver {
  private intersectionObserver: IntersectionObserver | null = null;
  private streamingTimers = new WeakMap<HTMLElement, number>();
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
            const text = el.dataset.tidyPendingText || el.textContent?.trim() || '';
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
    if (!element || !text) return;

    // Clear any active streaming timer for this element
    const existingTimer = this.streamingTimers.get(element);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      this.streamingTimers.delete(element);
    }

    if (immediate || this.options.debounceMs <= 0) {
      this.registerForViewport(element, text);
      return;
    }

    const timer = window.setTimeout(() => {
      this.streamingTimers.delete(element);
      if (element.isConnected) {
        // Read latest text content after streaming settles
        const latestText = element.textContent?.trim() || text;
        this.registerForViewport(element, latestText);
      }
    }, this.options.debounceMs);

    this.streamingTimers.set(element, timer);
  }

  private registerForViewport(element: HTMLElement, text: string): void {
    if (!element.isConnected) return;

    if (!this.intersectionObserver) {
      // Fallback if IntersectionObserver is unsupported: enqueue immediately
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
    this.pendingQueue = [];
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.initIntersectionObserver();
    }
  }
}

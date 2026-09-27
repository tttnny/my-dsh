import { replyTranslator } from './reply.ts';

/**
 * 视口懒翻译：正文容器在进入视口时才交给翻译器。历史会话因此只在真的被读到
 * 时花请求；已经命中缓存的回答，滚到的瞬间就整条显示中文（翻译器先查缓存）。
 */
const VIEWPORT_MARGIN = '150px 0px';

/** 进入视口后延迟多久再看一眼：正文容器刚出现时可能还在布局。 */
const SETTLE_DEBOUNCE_MS = 120;

class LazyTranslationQueue {
  private enabled = true;
  private observer: IntersectionObserver | null = null;
  private pending = new Map<HTMLElement, number>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.disconnect();
    }
  }

  observe(body: HTMLElement, immediate = false): void {
    if (!this.enabled || !body.isConnected) return;

    if (immediate || typeof IntersectionObserver === 'undefined') {
      void replyTranslator.translateBody(body);
      return;
    }

    const observer = this.intersectionObserver();
    if (observer === null) {
      void replyTranslator.translateBody(body);
      return;
    }
    observer.observe(body);
  }

  private intersectionObserver(): IntersectionObserver | null {
    if (typeof window === 'undefined') return null;
    if (this.observer !== null) return this.observer;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const body = entry.target;
          if (!(body instanceof HTMLElement)) continue;
          // 视口内只报一次：翻译后内容不再变化，继续观察没有意义。
          this.observer?.unobserve(body);
          this.scheduleTranslation(body);
        }
      },
      { root: null, rootMargin: VIEWPORT_MARGIN, threshold: 0 }
    );
    return this.observer;
  }

  /**
   * 进入视口后稍等一拍再翻，避开「刚出现、还在布局」的那一瞬。已经在等的那条
   * 不重复排队。
   */
  private scheduleTranslation(body: HTMLElement): void {
    if (typeof window === 'undefined') {
      void replyTranslator.translateBody(body);
      return;
    }
    if (this.pending.has(body)) return;
    const timer = window.setTimeout(() => {
      this.pending.delete(body);
      if (!this.enabled || !body.isConnected) return;
      void replyTranslator.translateBody(body);
    }, SETTLE_DEBOUNCE_MS);
    this.pending.set(body, timer);
  }

  disconnect(): void {
    if (typeof window !== 'undefined') {
      for (const timer of this.pending.values()) window.clearTimeout(timer);
    }
    this.pending.clear();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const lazyQueue = new LazyTranslationQueue();

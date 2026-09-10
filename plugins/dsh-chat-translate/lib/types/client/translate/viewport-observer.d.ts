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
    onVisibleBatch: (items: Array<{
        element: HTMLElement;
        text: string;
    }>) => void;
}
export declare class StreamDebounceViewportObserver {
    private intersectionObserver;
    /**
     * Pending per-element streaming debounce timers. A Map (not a WeakMap)
     * because disconnect() must enumerate and clear every pending timer: a
     * WeakMap cannot be iterated, so a debounce armed just before the switch was
     * turned off would still fire registerForViewport() afterwards.
     */
    private streamingTimers;
    private pendingQueue;
    private batchFlushTimer;
    private options;
    constructor(options: ViewportObserverOptions);
    private initIntersectionObserver;
    /**
     * Observe an element with streaming debounce.
     * If streaming updates characterData repeatedly within debounceMs, the timer resets.
     */
    observeWithDebounce(element: HTMLElement, text: string, immediate?: boolean): void;
    private registerForViewport;
    private enqueueBatch;
    private flushQueue;
    unobserve(element: HTMLElement): void;
    disconnect(): void;
}

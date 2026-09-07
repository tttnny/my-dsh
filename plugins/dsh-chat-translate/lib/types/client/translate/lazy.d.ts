declare class LazyTranslationQueue {
    private enabled;
    private viewportObserver;
    constructor();
    setEnabled(enabled: boolean): void;
    observe(element: HTMLElement, text: string, immediate?: boolean): void;
    private handleVisibleBatch;
    private applyTranslation;
    disconnect(): void;
}
export declare const lazyQueue: LazyTranslationQueue;
export {};

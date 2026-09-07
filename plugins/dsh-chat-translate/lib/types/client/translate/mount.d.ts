/**
 * Non-destructive translation DOM mount mechanism.
 *
 * Preserves the original React Fiber tree, event listeners, and nested DOM nodes
 * by wrapping them in a hidden container (<span class="dsh-tidy-original-hidden">)
 * rather than destroying them with `element.textContent = translated`.
 *
 * Displays the translated text in a companion container (<span class="dsh-tidy-translated-block">).
 * Clicking the translation toggles between original and translated text in-place.
 */
export declare const CLASS_ORIGINAL_HIDDEN = "dsh-tidy-original-hidden";
export declare const CLASS_ORIGINAL_SHOWN = "dsh-tidy-original-shown";
export declare const CLASS_TRANSLATED_BLOCK = "dsh-tidy-translated-block";
export interface MountOptions {
    originalText?: string;
    interactive?: boolean;
}
export declare class NonDestructiveTranslationMount {
    /**
     * Mounts a translated string onto the target element non-destructively.
     */
    static mount(element: HTMLElement, translated: string, options?: MountOptions): void;
    /**
     * Unmounts translation and restores original DOM nodes completely.
     */
    static unmount(element: HTMLElement): void;
    /**
     * Checks if an element has non-destructive translation mounted.
     */
    static isMounted(element: HTMLElement): boolean;
    /**
     * Gets the original text recorded on the element or contained in origWrapper.
     */
    static getOriginal(element: HTMLElement): string | undefined;
    /**
     * Extracts text content excluding our own translation wrappers.
     */
    static extractVisibleText(element: HTMLElement): string;
}

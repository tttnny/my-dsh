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

export const CLASS_ORIGINAL_HIDDEN = 'dsh-tidy-original-hidden';
export const CLASS_ORIGINAL_SHOWN = 'dsh-tidy-original-shown';
export const CLASS_TRANSLATED_BLOCK = 'dsh-tidy-translated-block';

export interface MountOptions {
  originalText?: string;
  interactive?: boolean;
}

export class NonDestructiveTranslationMount {
  /**
   * Mounts a translated string onto the target element non-destructively.
   */
  static mount(
    element: HTMLElement,
    translated: string,
    options: MountOptions = {}
  ): void {
    if (!element || !element.ownerDocument) return;
    const doc = element.ownerDocument;

    // Check if already mounted
    let transWrapper = element.querySelector<HTMLElement>(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
    let origWrapper = element.querySelector<HTMLElement>(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );

    if (transWrapper && origWrapper) {
      // Update existing translation
      transWrapper.textContent = translated;
      element.dataset.tidyTranslated = 'true';
      if (options.originalText) element.dataset.original = options.originalText;
      return;
    }

    const originalText = options.originalText ?? this.extractVisibleText(element);

    // Create wrapper for original children
    origWrapper = doc.createElement('span');
    origWrapper.className = CLASS_ORIGINAL_HIDDEN;
    origWrapper.style.display = 'none';

    // Move all existing child nodes into origWrapper
    while (element.firstChild) {
      origWrapper.appendChild(element.firstChild);
    }

    // Create translation block
    transWrapper = doc.createElement('span');
    transWrapper.className = CLASS_TRANSLATED_BLOCK;
    transWrapper.textContent = translated;

    // Interactive bilingual toggle
    const interactive = options.interactive !== false;
    if (interactive) {

      const showOriginal = (e: MouseEvent): void => {
        e.stopPropagation();
        if (!origWrapper || !transWrapper) return;
        origWrapper.style.display = 'inline';
        origWrapper.className = CLASS_ORIGINAL_SHOWN;
        transWrapper.style.display = 'none';
      };

      const showTranslated = (e: MouseEvent): void => {
        e.stopPropagation();
        if (!origWrapper || !transWrapper) return;
        origWrapper.style.display = 'none';
        origWrapper.className = CLASS_ORIGINAL_HIDDEN;
        transWrapper.style.display = 'inline';
      };

      transWrapper.addEventListener('click', showOriginal);
      origWrapper.addEventListener('click', showTranslated);
    }

    // Append both to target element
    element.appendChild(transWrapper);
    element.appendChild(origWrapper);

    element.dataset.tidyTranslated = 'true';
    element.dataset.original = originalText;
  }

  /**
   * Unmounts translation and restores original DOM nodes completely.
   */
  static unmount(element: HTMLElement): void {
    if (!element) return;

    const origWrapper = element.querySelector<HTMLElement>(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    const transWrapper = element.querySelector<HTMLElement>(`:scope > .${CLASS_TRANSLATED_BLOCK}`);

    if (origWrapper) {
      // Move all original children back to element
      while (origWrapper.firstChild) {
        element.insertBefore(origWrapper.firstChild, origWrapper);
      }
      origWrapper.remove();
    }

    if (transWrapper) {
      transWrapper.remove();
    }

    // Fallback if no wrapper was created but text was modified directly
    if (!origWrapper && element.dataset.original) {
      element.textContent = element.dataset.original;
    }

    delete element.dataset.tidyTranslated;
    delete element.dataset.original;
  }

  /**
   * Checks if an element has non-destructive translation mounted.
   */
  static isMounted(element: HTMLElement): boolean {
    return (
      element.dataset.tidyTranslated === 'true' &&
      !!element.querySelector(`:scope > .${CLASS_TRANSLATED_BLOCK}`)
    );
  }

  /**
   * Gets the original text recorded on the element or contained in origWrapper.
   */
  static getOriginal(element: HTMLElement): string | undefined {
    if (element.dataset.original) return element.dataset.original;
    const origWrapper = element.querySelector<HTMLElement>(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    return origWrapper ? origWrapper.textContent?.trim() : undefined;
  }

  /**
   * Extracts text content excluding our own translation wrappers.
   */
  static extractVisibleText(element: HTMLElement): string {
    const origWrapper = element.querySelector<HTMLElement>(
      `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
    );
    if (origWrapper) {
      return origWrapper.textContent?.trim() || '';
    }
    const transWrapper = element.querySelector<HTMLElement>(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
    if (transWrapper) {
      return transWrapper.textContent?.trim() || '';
    }
    return element.textContent?.trim() || '';
  }
}
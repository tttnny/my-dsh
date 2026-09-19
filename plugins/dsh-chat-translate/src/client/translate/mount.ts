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
/** 混合块里的行内片段容器（我们自建、自拆）。 */
export const CLASS_RUN = 'dsh-tidy-run';
const RUN_ATTRIBUTE = 'data-tidy-run';

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
   * 把一段连续的行内节点包进自建容器后挂载译文。
   *
   * 混合块（列表项文字 + 子列表 / 代码块）里的行内片段没有自己的元素，
   * 只能先包一层再走同一条非侵入式挂载；嵌套的块级子节点留在容器之外，
   * 排版原样保留。
   * @returns 自建容器；节点不再相邻或没有共同父节点时返回 null。
   */
  static mountRun(nodes: Node[], translated: string, options: MountOptions = {}): HTMLElement | null {
    const first = nodes[0];
    const parent = first?.parentNode;
    if (!first || !parent || !parent.ownerDocument) return null;
    if (!nodes.every((node) => node.parentNode === parent)) return null;

    const originalText =
      options.originalText ?? nodes.map((node) => node.textContent ?? '').join('').trim();
    if (!originalText) return null;

    const run = parent.ownerDocument.createElement('span');
    run.className = CLASS_RUN;
    run.setAttribute(RUN_ATTRIBUTE, 'true');
    parent.insertBefore(run, first);
    for (const node of nodes) run.appendChild(node);
    this.mount(run, translated, { originalText, interactive: options.interactive });
    return run;
  }

  /** 还原行内片段并撤掉自建容器。 */
  static unmountRun(run: HTMLElement): void {
    this.unmount(run);
    const parent = run.parentNode;
    if (!parent) return;
    while (run.firstChild) parent.insertBefore(run.firstChild, run);
    parent.removeChild(run);
  }

  /** 还原一个作用域内我们挂过的全部译文（元素单位与行内片段都算）。 */
  static restore(scope: ParentNode): void {
    const mounted = scope.querySelectorAll<HTMLElement>('[data-tidy-translated="true"]');
    for (const element of mounted) {
      if (element.getAttribute(RUN_ATTRIBUTE) === 'true') this.unmountRun(element);
      else this.unmount(element);
    }
  }

  /** 我们自己的挂载容器与还原容器，观察器必须跳过它们。 */
  static isOwnNode(element: HTMLElement): boolean {
    return (
      element.classList?.contains(CLASS_TRANSLATED_BLOCK) === true ||
      element.classList?.contains(CLASS_ORIGINAL_HIDDEN) === true ||
      element.classList?.contains(CLASS_ORIGINAL_SHOWN) === true ||
      element.classList?.contains(CLASS_RUN) === true
    );
  }

  /**
   * 把一个作用域里的全部挂载译文一起翻面。思考链只由卡片标题右侧的按钮调用
   * 它，正文里的点击不再改变原文与译文。
   */
  static toggleGroup(scope: ParentNode, showOriginal: boolean): void {
    const mounted = scope.querySelectorAll<HTMLElement>('[data-tidy-translated="true"]');
    for (const element of mounted) {
      const origWrapper = element.querySelector<HTMLElement>(
        `:scope > .${CLASS_ORIGINAL_HIDDEN}, :scope > .${CLASS_ORIGINAL_SHOWN}`
      );
      const transWrapper = element.querySelector<HTMLElement>(`:scope > .${CLASS_TRANSLATED_BLOCK}`);
      if (!origWrapper || !transWrapper) continue;
      if (showOriginal) {
        origWrapper.style.display = 'inline';
        origWrapper.className = CLASS_ORIGINAL_SHOWN;
        transWrapper.style.display = 'none';
      } else {
        origWrapper.style.display = 'none';
        origWrapper.className = CLASS_ORIGINAL_HIDDEN;
        transWrapper.style.display = 'inline';
      }
    }
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
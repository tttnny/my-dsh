import { lazyQueue } from './lazy.ts';
import { NonDestructiveTranslationMount } from './mount.ts';


/**
 * The assistant reply body, as the DSH Web UI emits it.
 *
 * A flow row carries `data-chat-flow-kind` (the node kind) and
 * `data-chat-group-part` (`"response"` for the answer prose, `"reasoning"` for
 * the Think card); the prose itself renders as
 * `<div class="<hash>_root" data-streaming><div class="<hash>_body">…</div></div>`.
 * Hashed CSS-module class names vary between DSH builds, so every selector here
 * anchors on the data attributes and treats the class name only as a fallback.
 */
const REPLY_ROW_SELECTOR = '[data-chat-flow-kind][data-chat-group-part="response"]';
const MARKDOWN_BODY_SELECTOR = '[class*="body" i]';

/** Every card that must never be translated: Think text and tool rows. */
const EXCLUDED_SELECTOR = [
  '[data-variant="think"]',
  '[data-chat-call-id]',
  '[data-slot="tool.call.toolview"]',
  '[data-chat-group-part="reasoning"]',
].join(',');

/**
 * Current-session scroll container (the conversation layout re-renders this
 * whole subtree when the active session changes), falling back to the chat
 * flow. Both are emitted by the DSH web UI.
 */
const SESSION_ROOT_SELECTOR = '[data-conversation-scroll], [data-chat-flow]';

/** How often (ms) we re-check that the observed root is still the live one. */
const ROOT_CHECK_INTERVAL_MS = 3000;

/**
 * 一条回答是「落定」还是「流式中」：`data-streaming` 由 markdown 根在流式
 * 期间挂着，流式结束就消失。流式中的正文会被渲染器反复重写，这时翻译只会被
 * 下一次重写冲掉，所以一律等到它落定。
 */
function isStreaming(root: HTMLElement): boolean {
  return root.hasAttribute('data-streaming');
}

export class ChatTranslateObserver {
  private observer: MutationObserver | null = null;
  private rootElement: HTMLElement | null = null;
  private rootCheckTimer: number | null = null;
  private isEnabled = true;
  /**
   * 已经交给翻译器的正文容器，避免同一条回答在每次 DOM 变动时重扫。总开关重开
   * 时清空：关着的那段时间落定的回答需要补翻。
   */
  private handled = new WeakSet<HTMLElement>();

  constructor() {
    this.handleMutations = this.handleMutations.bind(this);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;
    this.isEnabled = enabled;
    if (enabled) {
      lazyQueue.setEnabled(true);
      // 关着的时候扫过的回答要重新登记：那时它们没有被翻译（也可能正是没有
      // Key 的时候落定的），重开之后必须补上。
      this.handled = new WeakSet<HTMLElement>();
      this.observer?.disconnect();
      this.observer = null;
      this.start();
    } else {
      this.restoreOriginals();
      this.disconnect();
      lazyQueue.setEnabled(false);
    }
  }

  private restoreOriginals(): void {
    const scope = this.rootElement ?? document;
    NonDestructiveTranslationMount.restore(scope);
    this.handled = new WeakSet<HTMLElement>();
  }

  /**
   * The active session's scroll container. Only the currently-viewed session
   * is translated; switching sessions replaces this subtree and the observer
   * naturally follows the new content.
   */
  private isVisible(el: HTMLElement): boolean {
    if (el.hasAttribute('hidden')) return false;
    if (el.style.display === 'none') return false;
    try {
      return el.getClientRects().length > 0;
    } catch {
      return true;
    }
  }

  private findRoot(documentRef: Document): HTMLElement {
    if (!documentRef.body) {
      return documentRef.documentElement;
    }
    const candidates = documentRef.querySelectorAll<HTMLElement>(SESSION_ROOT_SELECTOR);
    for (const el of candidates) {
      if (this.isVisible(el)) {
        return el;
      }
    }
    return documentRef.body;
  }

  start(documentRef: Document = document): () => void {
    if (!this.isEnabled || typeof window === 'undefined') {
      return () => {};
    }

    const findAndObserveRoot = () => {
      const root = this.findRoot(documentRef);

      this.rootElement = root;

      // 1. Initial scan. Whatever is already on screen when a session root
      // appears is history: those replies are translated in place.
      this.scanContainer(root);

      // 2. Setup MutationObserver
      if (!this.observer) {
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          // `data-streaming` disappearing on the markdown root is the settle
          // signal this whole controller waits for.
          attributeFilter: ['data-streaming', 'data-chat-flow-kind', 'data-chat-group-part'],
        });
      }
    };

    findAndObserveRoot();

    // Defense: if the observed root is detached or hidden (e.g. the user
    // switched to another view), re-probe for the live session container.
    this.scheduleRootCheck();

    return () => {
      this.disconnect();
    };
  }

  private scheduleRootCheck(): void {
    if (this.rootCheckTimer !== null || typeof window === 'undefined') return;
    this.rootCheckTimer = window.setInterval(() => {
      if (this.rootElement && this.rootElement.isConnected && this.isVisible(this.rootElement)) {
        return;
      }
      this.restart();
    }, ROOT_CHECK_INTERVAL_MS);
  }

  private restart(): void {
    if (typeof window === 'undefined') return;
    const wasEnabled = this.isEnabled;
    this.disconnect();
    if (wasEnabled) {
      this.start();
    }
  }

  private handleMutations(mutations: MutationRecord[]): void {
    if (!this.isEnabled) return;

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        let addedElement = false;
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (NonDestructiveTranslationMount.isOwnNode(node)) continue;
            addedElement = true;
            this.scanNode(node);
          }
        }
        // 只换掉了文本节点（流式重渲染里最常见的一种提交）时，新增节点里没有
        // 元素，必须回到父元素重扫，否则新落定的段落永远等不到翻译。
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          if (!addedElement && !NonDestructiveTranslationMount.isOwnNode(target)) {
            this.scanNode(target);
          }
        }
      } else if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(target)) continue;
          this.scanNode(target);
        }
      } else if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(parent)) continue;
          this.scanNode(parent);
        }
      }
    }
  }

  private scanContainer(container: HTMLElement): void {
    if (this.tryBody(container)) return;
    container.querySelectorAll<HTMLElement>(REPLY_ROW_SELECTOR).forEach((row) => {
      this.scanRow(row);
    });
  }

  private scanNode(node: HTMLElement): void {
    // 落定事件就发生在这一个元素上（`data-streaming` 被摘掉），先看它自己。
    if (this.tryBody(node)) return;

    const row = node.closest<HTMLElement>(REPLY_ROW_SELECTOR);
    if (row !== null) this.scanRow(row);

    node.querySelectorAll<HTMLElement>(REPLY_ROW_SELECTOR).forEach((child) => {
      this.scanRow(child);
    });
  }

  /** 一行 flow item 里的正文容器；没有正文（工具行、Think 卡）就什么都不做。 */
  private scanRow(row: HTMLElement): void {
    row.querySelectorAll<HTMLElement>(MARKDOWN_BODY_SELECTOR).forEach((body) => {
      this.tryBody(body);
    });
  }

  /**
   * 判定并交给翻译器：这个元素自己是不是一条可翻译的正文容器（或其内部有）。
   * @returns 是否命中一条正文容器。
   */
  private tryBody(element: HTMLElement): boolean {
    const body = this.bodyOf(element);
    if (body === null) return false;
    this.requestTranslate(body);
    return true;
  }

  /**
   * 元素自己或它内部落定的正文容器。已排除 Think 卡与工具行；流式中的回答
   * 直接返回 null，等 `data-streaming` 消失时观察器会再进来一次。
   */
  private bodyOf(element: HTMLElement): HTMLElement | null {
    if (element.closest(EXCLUDED_SELECTOR) !== null) return null;

    const row = element.closest<HTMLElement>(REPLY_ROW_SELECTOR);
    const candidate =
      row !== null && element.matches(MARKDOWN_BODY_SELECTOR)
        ? element
        : element.querySelector<HTMLElement>(`${REPLY_ROW_SELECTOR} ${MARKDOWN_BODY_SELECTOR}`);
    if (candidate === null) return null;
    if (candidate.closest(EXCLUDED_SELECTOR) !== null) return null;

    // 流式中的正文要等落定：观察器在 `data-streaming` 消失时会再扫一次。
    const root = candidate.closest<HTMLElement>('[data-streaming]') ?? candidate;
    if (isStreaming(root)) return null;

    return candidate;
  }

  /**
   * 把一条落定的正文交给视口懒队列：视口内立刻翻、视口外的等滚到再翻，
   * 命中缓存的由翻译器立即挂上。同一条回答只登记一次。
   */
  private requestTranslate(body: HTMLElement): void {
    if (this.handled.has(body)) return;
    this.handled.add(body);
    lazyQueue.observe(body);
  }

  disconnect(): void {
    if (this.rootCheckTimer !== null) {
      clearInterval(this.rootCheckTimer);
      this.rootCheckTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    lazyQueue.disconnect();
    this.rootElement = null;
  }
}

export const chatTranslateObserver = new ChatTranslateObserver();

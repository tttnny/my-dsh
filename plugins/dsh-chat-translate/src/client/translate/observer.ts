import { lazyQueue } from './lazy.ts';
import { NonDestructiveTranslationMount } from './mount.ts';


/**
 * 要翻译的正文，以及它为什么是这一段。
 *
 * 一行 flow item（`data-chat-flow-kind`）里的 `data-chat-group-part="response"`
 * 正文有两处来源，内核用同一组属性渲染它们：
 *
 * - **过程折叠块**里每一步露出的正文（`processMember`）；
 * - **最终汇总**那一步的正文（`processAnswer`）。
 *
 * 内核自己就把这个区别标在 flow item 包装元素上（ui-chat 的 ChatNodeSeat）：
 * 折叠块成员带 `data-turn-process-member`，最终汇总带
 * `data-turn-process-answer`（compactAnswer）。因此判据直接沿用内核的属性,
 * 而不是自己按轮尾行的先后去猜——「轮尾行之前」需要轮尾行已经挂上，进行中的
 * 轮次一个字都匹配不到，会把折叠块里的正文整片漏掉。
 *
 * 这两个属性在流式期间不稳定，所以范围判定在**落定之后**做；流式中的正文等
 * `data-streaming` 消失时会再进来一次。
 *
 * 正文自身渲染成 `<div class="<hash>_root" data-streaming><div
 * class="<hash>_body">…</div></div>`。哈希类名随 DSH 构建而变，所以定位全走
 * 数据属性，类名只作兜底。
 */
const REPLY_ROW_SELECTOR = '[data-chat-flow-kind][data-chat-group-part="response"]';
const MARKDOWN_BODY_SELECTOR = '[class*="body" i]';

/** 折叠块里的正文：内核标了 `data-turn-process-member` 的 flow item。 */
const PROCESS_MEMBER_SELECTOR = '[data-turn-process-member]';
/** 最终汇总那一步：同一行上带 `data-turn-process-answer`，永不翻译。 */
const PROCESS_ANSWER_SELECTOR = '[data-turn-process-answer]';

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

/**
 * 这段正文是否落在过程折叠块里。判据就是内核自己的：所在 flow item 带
 * `data-turn-process-member`，且不带 `data-turn-process-answer`。
 *
 * 进行中的轮次同样带这个属性，所以折叠块里的正文不必等轮次结束就能翻。
 */
function isInsideProcessDisclosure(element: HTMLElement): boolean {
  const row = element.closest<HTMLElement>(PROCESS_MEMBER_SELECTOR);
  if (row === null || !row.contains(element)) return false;
  if (row.matches(PROCESS_ANSWER_SELECTOR)) return false;
  if (row.querySelector(PROCESS_ANSWER_SELECTOR) !== null) return false;
  return true;
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
      // 重开瞬间已经落定的正文要立刻进队列，而不是等下一次 DOM 变动——轮次
      // 结束后这条回答可能再也不变了。
      if (this.rootElement !== null) this.scanContainer(this.rootElement);
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
          // `data-streaming` 从 markdown 根上消失就是落定信号；`data-turn-process-*`
          // 是内核改判「哪些 flow item 属于折叠块」时动的属性，它一变就要重扫。
          attributeFilter: [
            'data-streaming',
            'data-chat-flow-kind',
            'data-chat-group-part',
            'data-turn-process-member',
            'data-turn-process-answer',
          ],
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

  /**
   * 扫一棵子树，把里面**全部**该翻的正文容器交给翻译器。
   *
   * 不再「命中第一个就返回」：一个容器里可以有好几行 response（折叠块里每一步
   * 露出的一段正文就是一行），只取第一个会把后面那些整片漏掉。
   */
  private scanContainer(container: Element | null): void {
    this.tryBodies(container);
    if (container === null) return;
    for (const row of container.querySelectorAll(REPLY_ROW_SELECTOR)) {
      this.tryRow(row);
    }
  }

  /** 扫一个刚变动过的节点（含它所在的这一行，以及它内部的每一行）。 */
  private scanNode(node: HTMLElement): void {
    // 落定事件就发生在这一个元素上（`data-streaming` 被摘掉），先看它自己。
    this.tryBodies(node);

    const row = node.closest(REPLY_ROW_SELECTOR);
    if (row !== null && row !== node) this.tryRow(row);

    for (const child of node.querySelectorAll(REPLY_ROW_SELECTOR)) {
      this.tryRow(child);
    }
  }

  /** 一行 flow item 里的**每一个**正文容器；工具行、Think 卡会被排除规则挡掉。 */
  private tryRow(row: Element | null): void {
    this.tryBodies(row);
    if (row === null) return;
    for (const body of row.querySelectorAll(MARKDOWN_BODY_SELECTOR)) {
      this.tryBody(body);
    }
  }

  /** 判定并交给翻译器：这个元素自己或它内部的每一条落定正文容器。 */
  private tryBodies(element: Element | null): void {
    this.tryBody(element);
    if (element === null) return;
    for (const body of element.querySelectorAll(MARKDOWN_BODY_SELECTOR)) {
      this.tryBody(body);
    }
  }

  /** 判定并交给翻译器：这一个元素自己是不是一条该翻的正文容器。 */
  private tryBody(element: Element | null): void {
    if (!(element instanceof HTMLElement)) return;
    if (!this.isTranslatableBody(element)) return;
    this.requestTranslate(element);
  }

  /**
   * 这个元素自己是不是一条该翻的正文容器：落定的、落在过程折叠块里的 markdown
   * 正文，且不被排除规则挡住（Think 卡、工具行、最终汇总都不算）。
   */
  private isTranslatableBody(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches(MARKDOWN_BODY_SELECTOR)) return false;
    if (element.closest(EXCLUDED_SELECTOR) !== null) return false;
    if (element.closest(REPLY_ROW_SELECTOR) === null) return false;
    if (!isInsideProcessDisclosure(element)) return false;

    // 流式中的正文要等落定：观察器在 `data-streaming` 消失时会再扫一次。
    const root = element.closest<HTMLElement>('[data-streaming]') ?? element;
    if (isStreaming(root)) return false;

    return true;
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

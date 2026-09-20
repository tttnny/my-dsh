import { clientCache } from './client-cache.ts';
import { rowHold } from './hold.ts';
import { lazyQueue } from './lazy.ts';
import {
  CLASS_ORIGINAL_HIDDEN,
  CLASS_ORIGINAL_SHOWN,
  NonDestructiveTranslationMount,
} from './mount.ts';
import { thinkTranslator } from './think.ts';

// Case-insensitive match: DSH builds vary the summary class casing across
// versions (MISisG_summary / _48RFeq_summary). Only tool-call rows are targets;
// a Think card's collapsed summary is excluded in isToolSummarySpan.
const TOOL_TITLE_SELECTOR = '[class*="summary" i]';

/** Think cards, the root both renderers mark. */
const THINK_CARD_SELECTOR = '[data-variant="think"]';

/**
 * Current-session scroll container (the conversation layout re-renders this
 * whole subtree when the active session changes), falling back to the chat
 * flow. Both are emitted by the DSH web UI.
 */
const SESSION_ROOT_SELECTOR = '[data-conversation-scroll], [data-chat-flow]';

/** How often (ms) we re-check that the observed root is still the live one. */
const ROOT_CHECK_INTERVAL_MS = 3000;

/**
 * 摘要旁边的后缀文本（`+2`、`+12 -3`）。它也命中摘要选择器、也会被翻译，
 * 但不参与整行扣留的放行判定。
 */
const SUMMARY_SUFFIX_PATTERN = /suffix/i;

/**
 * harness 的 turn 运行标记（ChatView 里的 TurnStatus），只在 turn 运行期间
 * 渲染在会话流里。它就是「当前 turn 还在产出」的判据。
 */
const LIVE_TURN_SELECTOR = '[role="status"][aria-live="polite"]';

/** 一行工具 / 命令行本身：图标、标题、分隔点、摘要、后缀、chevron 都在它里面。 */
const ROW_ROOT_SELECTOR = '[data-variant]';

/** 会话流的一行（harness 的 flowItem），行根包在它里面。 */
const FLOW_ITEM_SELECTOR = '[data-chat-flow-key]';

/** 会话流容器。 */
const FLOW_SELECTOR = '[data-chat-flow]';

function isSummarySuffixSpan(span: HTMLElement): boolean {
  return SUMMARY_SUFFIX_PATTERN.test(span.className || '');
}

function isToolSummarySpan(span: HTMLElement): boolean {
  if (!span || span.nodeType !== 1) return false;
  if (span.hasAttribute('aria-hidden')) return false;

  // The Think card's collapsed summary — the truncated first line of the
  // reasoning — is never translated. Its body is handled by thinkTranslator
  // instead, so exclude the whole card here.
  if (span.closest(THINK_CARD_SELECTOR)) return false;

  // Never match parent rows or containers that contain title, leading icon, chevron or nested summary
  if (span.querySelector?.('[class*="title"], [class*="leading"], [class*="chevron"], [class*="sep"], [class*="summary" i]')) {
    return false;
  }

  const cls = span.className || '';
  if (/title|leading|icon|badge|chevron|separator|sep\b|row\b|root\b|card\b/i.test(cls)) return false;

  // Never translate fold toggle ("展开"/"收起") or Think card's own title badge ("Think"/"思考")
  const rawToggle = (span.textContent || '').trim();
  if (
    rawToggle.length <= 12 &&
    /^(展开|收起|展开全部|收起全部|Expand|Collapse|Show more|Show less|Think|思考)$/i.test(rawToggle)
  ) {
    return false;
  }
  if (rawToggle === 'Think' || rawToggle === '思考') return false;
  if (
    span.closest('button, [role="button"]') &&
    rawToggle.length <= 12 &&
    /展开|收起|Expand|Collapse|Think|思考/i.test(rawToggle)
  ) {
    return false;
  }

  // Must belong to tool call or think block card
  if (
    span.closest(
      '[data-chat-call-id], [data-slot="tool.call.toolview"], [data-sample], [data-variant], [data-tool], [data-disclosure-row]'
    )
  ) {
    return true;
  }
  return false;
}

export class ChatTranslateObserver {
  private observer: MutationObserver | null = null;
  private rootElement: HTMLElement | null = null;
  private rootCheckTimer: number | null = null;
  private isEnabled = true;
  /** 设置里的思考链开关；与总开关一起决定按钮是否存在。 */
  private thinkEnabled = false;
  /**
   * 至少一条工具标题通道可用（AI 配置齐全或 Bing 打开）。两条都关时没有
   * 可等的译文，扣留立即失去意义。
   */
  private channelsAvailable = true;
  /**
   * 每个会话流已经见过的末尾行。追加在它之后的行算「新出现」，插在它之前
   * 的行（历史回放、加载更早）不算。
   */
  private flowTail = new WeakMap<HTMLElement, HTMLElement>();
  /** 初始扫描期间不扣留：那时看到的行都是历史。 */
  private suppressHold = false;

  constructor() {
    this.handleMutations = this.handleMutations.bind(this);
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    thinkTranslator.setEnabled(enabled && this.thinkEnabled);
    if (enabled) {
      lazyQueue.setEnabled(true);
      this.start();
    } else {
      rowHold.releaseAll();
      this.restoreOriginals();
      this.disconnect();
      lazyQueue.setEnabled(false);
    }
  }

  private restoreOriginals(): void {
    const scope = this.rootElement ?? document;
    NonDestructiveTranslationMount.restore(scope);
  }

  /**
   * 设置里的思考链开关：关掉就撤掉所有翻译按钮并还原思考卡里的译文，工具标题
   * 译文不动。
   */
  setThinkEnabled(enabled: boolean): void {
    this.thinkEnabled = enabled;
    thinkTranslator.setEnabled(this.isEnabled && enabled);
  }

  /**
   * AI 通道的可用性（通道开关打开且 Key / Base URL / 模型齐全）。不可用时同样
   * 不注入按钮：思考链翻译只能走这条通道。
   */
  setThinkConfigured(configured: boolean): void {
    thinkTranslator.setConfigured(configured);
  }

  /** 工具标题通道可用性：两条都关时不扣留，也没有译文可等。 */
  setChannelsAvailable(available: boolean): void {
    this.channelsAvailable = available;
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
      thinkTranslator.setScope(root);

      // 1. Initial scan of existing tool elements and think cards. Whatever is
      // already on screen when a session root appears is history: those rows
      // are translated in place and never held back.
      this.suppressHold = true;
      try {
        this.scanContainer(root);
      } finally {
        this.suppressHold = false;
      }
      this.scanThink(root);

      // 2. Setup MutationObserver
      if (!this.observer) {
        this.observer = new MutationObserver(this.handleMutations);
        this.observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          attributeFilter: [
            'data-state',
            'data-tool',
            'data-variant',
            'data-sample',
            'aria-expanded',
            'data-open',
            'data-expanded',
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
        let changedOwner: HTMLElement | null = null;
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            const owner = this.mountedOwner(node);
            if (owner) {
              changedOwner = owner;
              continue;
            }
            if (NonDestructiveTranslationMount.isOwnNode(node)) continue;
            addedElement = true;
            this.noteRevealHold(node);
            this.scanNode(node);
            this.scanThink(node);
          }
        }
        // 只换掉了文本节点（流式重渲染里最常见的一种提交）时，新增节点里没有
        // 元素，必须回到父元素重扫，否则流式中的新段落永远等不到翻译。
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          const owner = this.mountedOwner(target);
          if (owner) {
            changedOwner = owner;
          } else if (!addedElement && !NonDestructiveTranslationMount.isOwnNode(target)) {
            this.scanNode(target);
            this.scanThink(target);
          }
        }
        if (changedOwner) this.handleOriginalTextChange(changedOwner);
      } else if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(target)) continue;
          this.scanNode(target);
          this.scanThink(target);
        }
      } else if (mutation.type === 'characterData') {
        const owner = this.mountedOwner(mutation.target);
        if (owner) {
          this.handleOriginalTextChange(owner);
          continue;
        }
        const parent = mutation.target.parentElement;
        if (parent instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(parent)) continue;
          this.scanNode(parent);
          this.scanThink(parent);
        }
      }
    }
  }

  /**
   * 扣留期间新出现的会话流内容（下一个回答节点、下一个工具行）同样要先挂起：
   * 它们排在还没上屏的行后面，先出现就会占住那一行的位置。
   */
  private noteRevealHold(node: HTMLElement): void {
    rowHold.noteAppended(node);
  }

  /**
   * 变更发生在我们移进隐藏容器的原文里时，返回挂载了译文的那个元素。React
   * 就地改写它自己创建的文本节点，所以「原文变了」只能从这条路径看到。
   */
  private mountedOwner(node: Node): HTMLElement | null {
    const element = node instanceof HTMLElement ? node : node.parentElement;
    if (!element) return null;
    const wrapper = element.closest<HTMLElement>(
      `.${CLASS_ORIGINAL_HIDDEN}, .${CLASS_ORIGINAL_SHOWN}`
    );
    if (!wrapper) return null;
    const owner = wrapper.parentElement;
    return owner instanceof HTMLElement && owner.dataset.tidyTranslated === 'true' ? owner : null;
  }

  /**
   * 已挂载行的隐藏原文被上游改写了（ask_user 计数、失败摘要、todo 计数）：
   * 命中缓存就原地换译文，否则请求新译文后原地换。行始终可见，不出现英文。
   */
  private handleOriginalTextChange(owner: HTMLElement): void {
    if (!isToolSummarySpan(owner)) return;
    const current = NonDestructiveTranslationMount.extractVisibleText(owner);
    if (!current || current === owner.dataset.original) return;

    const cached = clientCache.get(current);
    if (cached) {
      NonDestructiveTranslationMount.mount(owner, cached, { originalText: current });
      return;
    }
    lazyQueue.observe(owner, current);
  }

  /**
   * 该行是否该被扣留：当前 turn 仍在产出、这行是新追加到流末尾的、不是后缀、
   * 通道可用，且不在初始扫描期间。判断顺带把每个会话流见过的末尾行推进到
   * 最新，供后续判定使用。
   */
  private shouldHold(span: HTMLElement): boolean {
    if (isSummarySuffixSpan(span)) return false;

    const flow = span.closest<HTMLElement>(FLOW_SELECTOR);
    if (!flow) return false;
    const item = span.closest<HTMLElement>(FLOW_ITEM_SELECTOR);
    if (!item) return false;

    const known = this.flowTail.get(flow);
    const appended =
      known === undefined ||
      known === item ||
      (known.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (appended) this.flowTail.set(flow, item);

    if (this.suppressHold || !appended) return false;
    if (!this.channelsAvailable) return false;
    return flow.querySelector(LIVE_TURN_SELECTOR) !== null;
  }

  private scanContainer(container: HTMLElement): void {
    const spans = container.querySelectorAll<HTMLElement>(TOOL_TITLE_SELECTOR);
    spans.forEach((span) => {
      if (isToolSummarySpan(span)) {
        this.processSpan(span);
      }
    });
  }

  private scanNode(node: HTMLElement): void {
    if (node.matches?.(TOOL_TITLE_SELECTOR) && isToolSummarySpan(node)) {
      this.processSpan(node);
    }

    const spans = node.querySelectorAll<HTMLElement>(TOOL_TITLE_SELECTOR);
    spans.forEach((span) => {
      if (isToolSummarySpan(span)) {
        this.processSpan(span);
      }
    });
  }

  /**
   * 交给思考正文翻译控制器：命中节点所在的卡片，以及它下面（或它就是）的
   * 全部思考卡片。
   */
  private scanThink(node: ParentNode): void {
    if (!thinkTranslator.isEnabled()) return;
    if (node instanceof HTMLElement) {
      const card = node.closest<HTMLElement>(THINK_CARD_SELECTOR);
      if (card) thinkTranslator.syncCard(card);
    }
    if (!node.querySelectorAll) return;
    node.querySelectorAll<HTMLElement>(THINK_CARD_SELECTOR).forEach((card) => {
      thinkTranslator.syncCard(card);
    });
  }

  private processSpan(span: HTMLElement): void {
    if (NonDestructiveTranslationMount.isMounted(span)) {
      // 已挂载的行由 handleOriginalTextChange 跟进原文变化。
      return;
    }

    const text = NonDestructiveTranslationMount.extractVisibleText(span);
    if (!text) return;

    // 新出现的行先整行扣住，等轮到它再放行；已经在扣留中的行走同一条路（文本被
    // 上游改写时更新等待的原文），否则它隐藏着等不到 IntersectionObserver。
    const root = span.closest<HTMLElement>(ROW_ROOT_SELECTOR);
    const held = rowHold.stateFor(span) !== undefined;
    if (root && (held || this.shouldHold(span))) {
      rowHold.hold(span, root, text);
      this.translateHeld(span, text);
      return;
    }

    // Check fast client cache
    const cached = clientCache.get(text);
    if (cached) {
      NonDestructiveTranslationMount.mount(span, cached, {
        originalText: text,
      });
      return;
    }

    // Send to viewport lazy queue
    lazyQueue.observe(span, text);
  }

  /**
   * 扣留行的取文本路径：命中缓存立即就绪，其余交给懒加载队列。译文真正挂载要等
   * 队列轮到它——提前挂上去会把逐字与对数淡入在被挂起期间跑完。
   */
  private translateHeld(span: HTMLElement, text: string): void {
    if (rowHold.stateFor(span)?.ready === true) return;
    const cached = clientCache.get(text);
    if (cached) {
      rowHold.ready(span, cached);
      return;
    }
    lazyQueue.observeHeld(span, text);
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
    rowHold.releaseAll();
    lazyQueue.disconnect();
    this.rootElement = null;
  }
}

export const chatTranslateObserver = new ChatTranslateObserver();
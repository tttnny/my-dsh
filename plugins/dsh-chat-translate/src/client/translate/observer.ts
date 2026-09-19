import { clientCache } from './client-cache.ts';
import { lazyQueue } from './lazy.ts';
import { NonDestructiveTranslationMount } from './mount.ts';
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

      // 1. Initial scan of existing tool elements and think cards
      this.scanContainer(root);
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
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement) {
            if (NonDestructiveTranslationMount.isOwnNode(node)) continue;
            addedElement = true;
            this.scanNode(node);
            this.scanThink(node);
          }
        }
        // 只换掉了文本节点（流式重渲染里最常见的一种提交）时，新增节点里没有
        // 元素，必须回到父元素重扫，否则流式中的新段落永远等不到翻译。
        const target = mutation.target;
        if (!addedElement && target instanceof HTMLElement) {
          if (!NonDestructiveTranslationMount.isOwnNode(target)) {
            this.scanNode(target);
            this.scanThink(target);
          }
        }
      } else if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(target)) continue;
          this.scanNode(target);
          this.scanThink(target);
        }
      } else if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent instanceof HTMLElement) {
          if (NonDestructiveTranslationMount.isOwnNode(parent)) continue;
          this.scanNode(parent);
          this.scanThink(parent);
        }
      }
    }
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
      const original = NonDestructiveTranslationMount.getOriginal(span);
      if (original) {
        const cached = clientCache.get(original);
        if (cached) return;
      }
      return;
    }

    const text = NonDestructiveTranslationMount.extractVisibleText(span);
    if (!text) return;

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

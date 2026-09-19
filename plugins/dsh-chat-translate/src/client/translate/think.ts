import { thinkClientCache } from './client-cache.ts';
import { requestTranslateThink } from './api.ts';
import { NonDestructiveTranslationMount, CLASS_TRANSLATED_BLOCK } from './mount.ts';
import { estimateTokens } from '../../server/pipeline/think.ts';
import { createThinkButton, THINK_BUTTON_CLASS, type ThinkButtonHandle, type ThinkButtonState } from './think-button.ts';

/**
 * 思考正文的翻译，只由卡片标题右侧那个按钮触发。
 *
 * 目标只取思考卡里的正文容器，翻译单位是 markdown 渲染出来的块级元素；混合块
 * （列表项文字 + 子列表 / 代码块）拆成行内片段，嵌套的块级子节点留在原位；
 * 代码块（pre）及其内部一律不动。
 *
 * 不自动翻译：展开只在该条全部单位都命中客户端缓存时直接显示中文（不发请求），
 * 其余情况一律等按钮被点击。
 */

/** Think cards, the root both renderers mark. */
const THINK_CARD_SELECTOR = '[data-variant="think"]';
/** 正文容器：内核与 smooth-stream 的类名都含 thinkBody。 */
const THINK_BODY_SELECTOR = '[class*="thinkBody" i]';
/** 展开的卡片会在这个容器上带 data-open。 */
const EXPANDED_SELECTOR = '[data-open]';

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'TD',
  'TH',
  'DT',
  'DD',
  'FIGCAPTION',
]);

const CONTAINER_TAGS = new Set(['UL', 'OL', 'DL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'DIV', 'SECTION']);

/** 出现这些后代就说明当前块是混合块，必须拆片段而不是整块当单位。 */
const NESTED_BOUNDARY_SELECTOR = [...BLOCK_TAGS, ...CONTAINER_TAGS, 'PRE']
  .join(',')
  .toLowerCase();

/**
 * 一次客户端请求装多少个单位：估算 token 低于宿主的打包上限，让每个请求在
 * 宿主侧通常只对应一次模型调用；请求逐块发出、译文逐块挂载。
 */
const REQUEST_TOKENS = 2048;

/** 观察器把卡片变化交给控制器，这里的防抖只用于合并同一批 DOM 变动。 */
const SYNC_DEBOUNCE_MS = 120;

/** 稳定的翻译单位：一块级元素，或一段行内节点。 */
export interface ThinkUnit {
  element?: HTMLElement;
  nodes?: Node[];
  text: string;
  anchor: Node;
}

function isMountedElement(element: HTMLElement): boolean {
  return element.dataset?.tidyTranslated === 'true';
}

function hasNestedBoundary(element: HTMLElement): boolean {
  return element.querySelector(NESTED_BOUNDARY_SELECTOR) !== null;
}

/** 收集正文里全部可翻译单位，跳过已挂译文的部分与代码块。 */
export function collectThinkUnits(body: HTMLElement): ThinkUnit[] {
  const units: ThinkUnit[] = [];

  const pushRun = (nodes: Node[]): void => {
    if (nodes.length === 0) return;
    const text = nodes.map((node) => node.textContent ?? '').join('').trim();
    if (!text) return;
    const anchor = nodes[0];
    if (anchor === undefined) return;
    units.push({ nodes, text, anchor });
  };

  const walk = (container: HTMLElement): void => {
    let run: Node[] = [];
    const flush = (): void => {
      pushRun(run);
      run = [];
    };

    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== 1) {
        run.push(node);
        continue;
      }
      const element = node as HTMLElement;
      if (NonDestructiveTranslationMount.isOwnNode(element)) {
        flush();
        continue;
      }
      if (element.tagName === 'PRE') {
        flush();
        continue;
      }
      if (BLOCK_TAGS.has(element.tagName)) {
        flush();
        collectBlock(element);
        continue;
      }
      if (CONTAINER_TAGS.has(element.tagName)) {
        flush();
        walk(element);
        continue;
      }
      // 行内元素（strong / code / a / em 等）与相邻文本合成一个片段
      run.push(element);
    }
    flush();
  };

  const collectBlock = (element: HTMLElement): void => {
    if (isMountedElement(element)) return;
    if (!hasNestedBoundary(element)) {
      const text = (element.textContent ?? '').trim();
      if (text) units.push({ element, text, anchor: element });
      return;
    }
    walk(element);
  };

  walk(body);
  return units;
}

/** 按估算 token 把单位切成若干次客户端请求，顺序不变。 */
export function chunkUnits(units: ThinkUnit[], maxTokens: number = REQUEST_TOKENS): ThinkUnit[][] {
  const chunks: ThinkUnit[][] = [];
  let current: ThinkUnit[] = [];
  let tokens = 0;
  for (const unit of units) {
    const cost = Math.max(estimateTokens(unit.text), 1);
    if (current.length > 0 && tokens + cost > maxTokens) {
      chunks.push(current);
      current = [];
      tokens = 0;
    }
    current.push(unit);
    tokens += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

interface CardState {
  button: ThinkButtonHandle | null;
  state: ThinkButtonState;
  /** 本次展开是否已经做过「全部命中缓存就直接显示」的判断。 */
  expandedHandled: boolean;
  /** 折叠状态下点了按钮：等正文挂进 DOM 后开始翻译。 */
  pendingActivate: boolean;
}

class ThinkTranslateController {
  /** 总开关与设置里的思考链开关同时打开。 */
  private enabled = false;
  /** AI 通道开关打开且已配置；缺任何一条都不注入按钮。 */
  private configured = false;
  private states = new WeakMap<HTMLElement, CardState>();
  private syncTimers = new WeakMap<HTMLElement, number>();
  /** 只处理当前会话的容器；由观察器在会话切换时更新。 */
  private scope: ParentNode | null = null;

  /** 观察器把当前会话的根交给控制器，插入按钮时只看这一棵子树。 */
  setScope(scope: ParentNode): void {
    this.scope = scope;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.applyVisibility();
  }

  setConfigured(configured: boolean): void {
    if (configured === this.configured) return;
    this.configured = configured;
    this.applyVisibility();
  }

  /** 按钮是否可以存在：两个开关与 AI 通道配置缺一不可。 */
  private usable(): boolean {
    return this.enabled && this.configured;
  }

  private applyVisibility(): void {
    if (typeof document === 'undefined') return;
    if (this.usable()) {
      this.syncAll();
      return;
    }
    for (const element of document.querySelectorAll<HTMLElement>('.' + THINK_BUTTON_CLASS)) {
      element.remove();
    }
    for (const card of document.querySelectorAll<HTMLElement>(THINK_CARD_SELECTOR)) {
      const state = this.states.get(card);
      if (state !== undefined) {
        state.button = null;
        state.state = 'idle';
        state.pendingActivate = false;
        state.expandedHandled = false;
      }
      NonDestructiveTranslationMount.restore(card);
    }
  }

  /** 扫描当前会话里的全部思考卡（开关、配置或会话变化后调用）。 */
  syncAll(): void {
    const scope = this.scope ?? (typeof document === 'undefined' ? null : document);
    if (scope === null) return;
    for (const card of scope.querySelectorAll<HTMLElement>(THINK_CARD_SELECTOR)) {
      this.syncCard(card);
    }
  }

  /** 防抖后同步一张卡片。 */
  syncCard(card: HTMLElement): void {
    if (typeof window === 'undefined') return;
    const existing = this.syncTimers.get(card);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      this.syncTimers.delete(card);
      this.runSync(card);
    }, SYNC_DEBOUNCE_MS);
    this.syncTimers.set(card, timer);
  }

  private stateFor(card: HTMLElement): CardState {
    let state = this.states.get(card);
    if (state === undefined) {
      state = { button: null, state: 'idle', expandedHandled: false, pendingActivate: false };
      this.states.set(card, state);
    }
    return state;
  }

  private runSync(card: HTMLElement): void {
    if (!card.isConnected) return;
    const state = this.stateFor(card);
    if (!this.usable()) {
      this.removeButton(card, state, true);
      return;
    }

    const expanded = card.querySelector(EXPANDED_SELECTOR) !== null;
    if (!expanded) state.expandedHandled = false;

    this.ensureButton(card, state);

    if (state.state !== 'working') {
      state.state = this.isShowingTranslation(card) ? 'translated' : 'idle';
    }
    state.button?.setState(state.state);
    this.updateDisabled(card, state);

    if (state.pendingActivate) {
      if (card.dataset.state === 'running') return;
      state.pendingActivate = false;
      this.translateCard(card, state);
      return;
    }

    if (!expanded || state.expandedHandled || state.state === 'working') return;
    state.expandedHandled = true;
    this.showCachedWhenComplete(card, state);
  }

  private updateDisabled(card: HTMLElement, state: CardState): void {
    const running = card.dataset.state === 'running';
    state.button?.setDisabled(running && state.state !== 'working', '思考输出中，结束后可翻译');
  }

  private ensureButton(card: HTMLElement, state: CardState): void {
    if (state.button !== null) return;
    const row = card.querySelector<HTMLElement>('[data-disclosure-row]');
    if (row === null) return;
    const button = createThinkButton(() => this.activate(card));
    const title = row.querySelector<HTMLElement>('[class*="title" i]');
    if (title !== null && title.parentElement === row) {
      row.insertBefore(button.element, title.nextSibling);
    } else {
      row.appendChild(button.element);
    }
    state.button = button;
    button.setState(state.state);
  }

  private removeButton(card: HTMLElement, state: CardState, restore: boolean): void {
    state.button?.element.remove();
    state.button = null;
    state.state = 'idle';
    state.pendingActivate = false;
    if (restore) NonDestructiveTranslationMount.restore(card);
  }

  /** 卡片当前显示的是译文（至少有一个译文块可见）。 */
  private isShowingTranslation(card: HTMLElement): boolean {
    const blocks = card.querySelectorAll<HTMLElement>('.' + CLASS_TRANSLATED_BLOCK);
    for (const block of blocks) {
      if (block.style.display !== 'none') return true;
    }
    return false;
  }

  private bodyOf(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(THINK_BODY_SELECTOR);
  }

  /** 展开时若整条都命中缓存，直接显示中文，不点按钮也不发请求。 */
  private showCachedWhenComplete(card: HTMLElement, state: CardState): void {
    const body = this.bodyOf(card);
    if (body === null || state.state === 'working') return;
    const units = collectThinkUnits(body);
    if (units.length === 0) return;
    const cached = units.map((unit) => thinkClientCache.get(unit.text));
    if (cached.some((value) => value === undefined)) return;

    units.forEach((unit, index) => this.applyUnit(unit, cached[index]!));
    state.state = this.isShowingTranslation(card) ? 'translated' : 'idle';
    state.button?.setState(state.state);
  }

  /** 按钮被点击。 */
  private activate(card: HTMLElement): void {
    const state = this.stateFor(card);
    if (!this.usable() || state.state === 'working') return;
    if (card.dataset.state === 'running') return;

    if (card.querySelector(EXPANDED_SELECTOR) === null) {
      // 先展开：内核渲染下正文此时才挂进 DOM，等下一次同步接着翻译。
      state.pendingActivate = true;
      const row = card.querySelector<HTMLElement>('[data-disclosure-row]') ?? card;
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      this.syncCard(card);
      return;
    }

    if (state.state === 'translated') {
      NonDestructiveTranslationMount.toggleGroup(card, true);
      state.state = 'idle';
      state.button?.setState('idle');
      return;
    }

    this.translateCard(card, state);
  }

  /** 翻译这张卡片的全部单位：命中缓存的先挂上，其余按块请求。 */
  private translateCard(card: HTMLElement, state: CardState): void {
    const body = this.bodyOf(card);
    if (body === null) return;
    // 之前翻过、当前面朝原文：先把已有译文翻回来，再补翻缺的部分。
    if (card.querySelector('.' + CLASS_TRANSLATED_BLOCK) !== null) {
      NonDestructiveTranslationMount.toggleGroup(card, false);
    }
    const units = collectThinkUnits(body);
    if (units.length === 0) {
      state.state = this.isShowingTranslation(card) ? 'translated' : 'idle';
      state.button?.setState(state.state);
      return;
    }

    const missing: ThinkUnit[] = [];
    for (const unit of units) {
      const cached = thinkClientCache.get(unit.text);
      if (cached === undefined) missing.push(unit);
      else this.applyUnit(unit, cached);
    }
    if (missing.length === 0) {
      state.state = this.isShowingTranslation(card) ? 'translated' : 'idle';
      state.button?.setState(state.state);
      return;
    }

    state.state = 'working';
    state.button?.setState('working');
    void this.translateUnits(card, state, missing);
  }

  private async translateUnits(
    card: HTMLElement,
    state: CardState,
    units: ThinkUnit[]
  ): Promise<void> {
    let failed = false;
    for (const chunk of chunkUnits(units, REQUEST_TOKENS)) {
      if (!this.usable()) {
        failed = true;
        break;
      }
      const texts = chunk.map((unit) => unit.text);
      let results: Awaited<ReturnType<typeof requestTranslateThink>> = [];
      try {
        results = await requestTranslateThink(texts);
      } catch {
        failed = true;
      }
      const byText = new Map(results.map((result) => [result.original, result]));
      for (const unit of chunk) {
        const result = byText.get(unit.text);
        // 与工具标题同一条判据：译文为空、与原文相同、或翻译失败都不挂载。
        if (
          result === undefined ||
          !result.ok ||
          !result.translated.trim() ||
          result.translated.trim() === unit.text.trim()
        ) {
          failed = true;
          continue;
        }
        thinkClientCache.set(unit.text, result.translated);
        this.applyUnit(unit, result.translated);
      }
    }

    state.state = !failed && this.isShowingTranslation(card) ? 'translated' : 'idle';
    state.button?.setState(state.state);
    this.updateDisabled(card, state);
  }

  /** 把译文挂到单位上；期间文本或节点已经变动的单位直接放弃（结果已进缓存）。 */
  private applyUnit(unit: ThinkUnit, translated: string): void {
    if (unit.element !== undefined) {
      const element = unit.element;
      if (!element.isConnected || isMountedElement(element)) return;
      if ((element.textContent ?? '').trim() !== unit.text) return;
      NonDestructiveTranslationMount.mount(element, translated, {
        originalText: unit.text,
        interactive: false,
      });
      return;
    }

    const nodes = unit.nodes ?? [];
    if (nodes.length === 0 || nodes.some((node) => !node.isConnected)) return;
    const parent = nodes[0]?.parentNode ?? null;
    if (parent === null || !nodes.every((node) => node.parentNode === parent)) return;
    const text = nodes.map((node) => node.textContent ?? '').join('').trim();
    if (text !== unit.text) return;
    NonDestructiveTranslationMount.mountRun(nodes, translated, {
      originalText: unit.text,
      interactive: false,
    });
  }

}

export const thinkTranslator = new ThinkTranslateController();

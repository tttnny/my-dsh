/**
 * 扣留队列：工具调用 / 命令行在标题译文就绪之前整行不可见，原文不落屏。
 *
 * 扣留按阅读顺序放行。队首那一行还在等译文时，排在它后面的每个流程条目都被挂上
 * {@link REVEAL_HOLD_ATTRIBUTE}——smooth-stream 看到标记就不推进那些条目里的逐字
 * 揭示：回答正文、思考正文、译文都不动，积压原样留着。队首一就绪，它先出现（译文
 * 挂载 + 整行对数淡入），再轮到下一条。没有这层顺序，靠后的行会先占住位置，等靠前
 * 的行出现时再被顶下去；被挂起的文字若在被挂起期间就把队列排空，放行时又会一次性
 * 砸出来。
 *
 * 等待有上限：超过 HOLD_DEADLINE_MS 仍无译文就放行原文，译文之后到达时再原地挂载。
 */

import { NonDestructiveTranslationMount } from './mount.ts';

/** 一行最多被扣留多久，到点放行原文。 */
export const HOLD_DEADLINE_MS = 5000;

/**
 * 挂起标记：打在会话流条目（`[data-chat-flow-key]`）上，表示「这条还没轮到上屏」。
 * smooth-stream 读它来暂停条目内的揭示引擎，字面量在两边各写一份
 * （`src/client/revealHold.ts`）。
 */
export const REVEAL_HOLD_ATTRIBUTE = 'data-dsh-reveal-hold';

/**
 * smooth-stream 的行入场包裹层。它用 `data-entrance` 门控整行的对数淡入，
 * 动画定义在它自己的样式里。
 */
const ROW_ENTRANCE_HOST_SELECTOR = '[data-entrance]';

/** 会话流容器与流条目。 */
const FLOW_SELECTOR = '[data-chat-flow]';
const FLOW_ITEM_SELECTOR = '[data-chat-flow-key]';

/** 工具行卡片（`[data-variant]`）与思考卡片（同一个属性，另一种变体）。 */
const TOOL_CARD_SELECTOR = '[data-variant]';
const THINK_CARD_SELECTOR = '[data-variant="think"]';

/**
 * 放行时重放行入场动画。
 *
 * 入场动画随 React 挂载就开始，而那一刻行还被我们藏着，于是它整段都在不可见
 * 状态下跑完；smooth-stream 只在「高度增长」时重放，而工具仍在运行的行被它
 * 有意跳过——这正是「有的行有流动效果、有的直接闪出来」的来源。
 *
 * 动画定义只有 smooth-stream 一处，这里只把它的 `data-entrance` 门控重新拨到
 * active，让浏览器按同一套样式从头发一遍；随挂载入场的老行与扣留放行的行因此
 * 看到的是同一段对数淡入。
 */
function replayRowEntrance(rowRoot: HTMLElement): void {
  const host = rowRoot.closest<HTMLElement>(ROW_ENTRANCE_HOST_SELECTOR);
  if (!host) return;

  if (host.getAttribute('data-entrance') === 'active') {
    // 规则已经挂着（上一次动画早已跑完）：清一次再恢复，让动画从头开始。
    host.style.animation = 'none';
    void host.offsetWidth;
    host.style.animation = '';
    return;
  }
  host.setAttribute('data-entrance', 'active');
}

export interface RowHoldEntry {
  /** 会话流条目：扣留的边界，挂在它上面的标记决定后面哪些条目被挂起。 */
  item: HTMLElement;
  /** 被翻译的摘要 span；React 可能在扣留期间换掉它。工具行本身不翻译时为 null。 */
  span: HTMLElement | null;
  /** 行根（`[data-variant]` 卡片），扣留期间隐藏它。 */
  root: HTMLElement;
  /** 当前正在等待译文的原文。 */
  text: string;
  /** 拿到的译文；null 表示这一行确定没有译文可等（失败 / 超时）。 */
  translation: string | null;
  /** 译文（或失败判定）已就绪，只等排到队首。没有译文可等的行入场即就绪。 */
  ready: boolean;
  /** 隐藏之前行根元素的行内 display 值。 */
  previousDisplay: string;
  timer: number | null;
}

class RowHoldQueue {
  /** 按阅读顺序排列的扣留行。 */
  private entries: RowHoldEntry[] = [];
  /** 结果回来时只知道 span，不知道条目，所以另留一份索引。 */
  private bySpan = new WeakMap<HTMLElement, RowHoldEntry>();
  /** 当前挂着挂起标记的流程条目。 */
  private marked = new Set<HTMLElement>();

  /**
   * 隐藏整行并启动放行上限。幂等：同一行在途请求期间文本又变了时只更新文本并
   * 重新等待，不重置不可见窗口。
   */
  hold(span: HTMLElement, root: HTMLElement, text: string): void {
    const existing = this.bySpan.get(span) ?? this.entries.find((entry) => entry.root === root);
    if (existing) {
      if (existing.span !== span) {
        if (existing.span !== null) this.bySpan.delete(existing.span);
        existing.span = span;
        this.bySpan.set(span, existing);
      }
      if (existing.text !== text) {
        // 原文被上游改写（ask_user 计数、失败摘要、todo 计数）：这一份译文作废，
        // 重新等新文本的结果；等待窗口照旧有上限。
        existing.text = text;
        existing.translation = null;
        existing.ready = false;
        if (existing.timer === null && typeof window !== 'undefined') {
          existing.timer = window.setTimeout(() => this.readyEntry(existing, null), HOLD_DEADLINE_MS);
        }
      }
      this.sync();
      return;
    }

    const item = root.closest<HTMLElement>(FLOW_ITEM_SELECTOR);
    if (!item) return;

    const entry: RowHoldEntry = {
      item,
      span,
      root,
      text,
      translation: null,
      ready: false,
      previousDisplay: root.style.display,
      timer: null,
    };
    root.style.display = 'none';
    if (typeof window !== 'undefined') {
      entry.timer = window.setTimeout(() => this.readyEntry(entry, null), HOLD_DEADLINE_MS);
    }
    this.insert(entry);
    this.bySpan.set(span, entry);
    this.sync();
  }

  /** 该文本所属行的扣留状态；返回 undefined 表示没有扣留。 */
  stateFor(span: HTMLElement): RowHoldEntry | undefined {
    return this.bySpan.get(span);
  }

  /**
   * 译文（或失败判定）就绪。真正上屏要等它排到队首：入队顺序就是阅读顺序。
   * @param span - 等待中的摘要 span。
   * @param translation - 译文；null 表示这一行没有译文可等，放行原文。
   */
  ready(span: HTMLElement, translation: string | null): void {
    const entry = this.bySpan.get(span);
    if (!entry) return;
    // 已经就绪的行只在「先前确定没有译文、现在译文又到了」时才改写；同一份原文
    // 的重复结果直接忽略。
    if (entry.ready && (translation === null || entry.translation !== null)) return;
    this.readyEntry(entry, translation);
  }

  /**
   * 扣留期间新出现的会话流内容：排在队首后面的一律先不上屏。
   *
   * 逐字揭示交给挂起标记——回答正文、思考正文、译文都只会积压、不会推进。
   * 工具卡片的文本不归揭示引擎管（smooth-stream 对工具行只做整行入场），所以
   * 那些卡片在这里直接藏起来，轮到自己时再放行：不翻译的行（如读写文件的链接
   * 摘要）也一样，否则它会先冒出来占住待出现行的位置。
   * @param node - 这次变更里新增的元素，或其祖先所在的那一片子树。
   */
  noteAppended(node: HTMLElement): void {
    const head = this.entries[0];
    if (!head) return;
    const enclosed = node.matches(FLOW_ITEM_SELECTOR)
      ? [node, ...node.querySelectorAll<HTMLElement>(FLOW_ITEM_SELECTOR)]
      : [...node.querySelectorAll<HTMLElement>(FLOW_ITEM_SELECTOR)];
    if (enclosed.length > 0) {
      for (const item of enclosed) this.holdItem(item, head);
      return;
    }
    // 落在已有条目里的一次提交（子代理的调用行、卡片内部重渲染）：受影响的
    // 是它所在的那个条目。
    const item = node.closest<HTMLElement>(FLOW_ITEM_SELECTOR);
    if (item !== null) this.holdItem(item, head);
  }

  /** 挂起一个条目，并藏住它里面还没轮到出场的工具卡片。 */
  private holdItem(item: HTMLElement, head: RowHoldEntry): void {
    if (!this.follows(head.item, item)) return;
    this.mark(item);
    for (const root of item.querySelectorAll<HTMLElement>(TOOL_CARD_SELECTOR)) {
      if (root.closest(THINK_CARD_SELECTOR)) continue;
      this.gate(item, root);
    }
  }

  private follows(head: HTMLElement, item: HTMLElement): boolean {
    return (head.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  private mark(item: HTMLElement): void {
    if (this.marked.has(item)) return;
    item.setAttribute(REVEAL_HOLD_ATTRIBUTE, '');
    this.marked.add(item);
  }

  /** 藏住一张还没有轮到出场的工具卡片。 */
  private gate(item: HTMLElement, root: HTMLElement): void {
    if (this.entries.some((entry) => entry.root === root)) return;
    const entry: RowHoldEntry = {
      item,
      span: null,
      root,
      text: '',
      translation: null,
      ready: true,
      previousDisplay: root.style.display,
      timer: null,
    };
    root.style.display = 'none';
    this.insert(entry);
  }

  /** 按阅读顺序入队：入队顺序就是上屏顺序。 */
  private insert(entry: RowHoldEntry): void {
    const index = this.entries.findIndex((other) => this.follows(entry.item, other.item));
    if (index === -1) this.entries.push(entry);
    else this.entries.splice(index, 0, entry);
  }

  private readyEntry(entry: RowHoldEntry, translation: string | null): void {
    if (entry.timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(entry.timer);
      entry.timer = null;
    }
    entry.translation = translation;
    entry.ready = true;
    this.drain();
  }

  /**
   * 按顺序放行：队首就绪就放它，然后看新的队首。放行时先把译文挂上再显示，
   * 所以屏幕上不会出现完整中文被画一帧再被截断的闪烁。
   */
  private drain(): void {
    this.entries = this.entries.filter((entry) => {
      if (entry.item.isConnected) return true;
      if (entry.span !== null) this.bySpan.delete(entry.span);
      return false;
    });

    while (this.entries.length > 0 && this.entries[0]!.ready) {
      const entry = this.entries.shift()!;
      if (entry.span !== null) this.bySpan.delete(entry.span);
      if (entry.span !== null && entry.translation !== null && entry.span.isConnected) {
        NonDestructiveTranslationMount.mount(entry.span, entry.translation, {
          originalText: entry.text,
        });
      }
      entry.root.style.display = entry.previousDisplay;
      replayRowEntrance(entry.root);
    }
    this.sync();
  }

  /**
   * 让挂起标记与队首对齐：队首自己以及排在它后面的每个流程条目都挂上，其余
   * 全部摘掉。放行让队首前移时，被它挡住的条目就在这一步解除挂起、继续流淌。
   */
  private sync(): void {
    const head = this.entries[0];
    const wanted = new Set<HTMLElement>();
    if (head) {
      const flow = head.item.closest<HTMLElement>(FLOW_SELECTOR);
      let reached = false;
      if (flow) {
        for (const item of flow.querySelectorAll<HTMLElement>(FLOW_ITEM_SELECTOR)) {
          if (item === head.item) reached = true;
          if (reached) wanted.add(item);
        }
      }
      if (!reached) wanted.add(head.item);
    }

    for (const item of this.marked) {
      if (!wanted.has(item)) item.removeAttribute(REVEAL_HOLD_ATTRIBUTE);
    }
    for (const item of wanted) {
      if (!this.marked.has(item)) item.setAttribute(REVEAL_HOLD_ATTRIBUTE, '');
    }
    this.marked = wanted;
  }

  /**
   * 全部放行：断开观察器与关闭总开关时用。批量放行不做入场动画，否则整屏会一起
   * 闪一遍。
   */
  releaseAll(): void {
    for (const entry of this.entries) {
      if (entry.timer !== null && typeof window !== 'undefined') {
        window.clearTimeout(entry.timer);
      }
      if (entry.span !== null) this.bySpan.delete(entry.span);
      entry.root.style.display = entry.previousDisplay;
    }
    this.entries = [];
    for (const item of this.marked) item.removeAttribute(REVEAL_HOLD_ATTRIBUTE);
    this.marked = new Set();
  }
}

export const rowHold = new RowHoldQueue();

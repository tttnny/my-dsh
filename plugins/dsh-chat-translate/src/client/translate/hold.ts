/**
 * 扣留队列：工具调用 / 命令行在标题译文就绪之前整行不可见，原文不落屏。
 *
 * 扣留按阅读顺序放行。队首那一行还在等译文时，排在它后面的每个流程条目整条不可见
 * 并挂上 {@link REVEAL_HOLD_ATTRIBUTE}：`display: none` 让条目里的任何东西都上不了屏
 * ——不翻译的行、宿主直接落盘的文本、已经写入一半的正文，都得等轮到它。队首一就绪，
 * 它先出现（译文挂载 + 整行入场淡入），再轮到下一条。没有这层顺序，靠后的行会先占住
 * 位置，等靠前的行出现时再被顶下去。
 *
 * 藏法是整条 `display: none`，不是「占着位置但透明」：条目一旦进入布局就带上了
 * 会话流的 16px 兄弟间距（`.column > :not(:empty) ~ :not(:empty)`），积压几行就是
 * 屏幕底部一条几十像素的空白，且这空白要等轮到它才被填上。移除整个盒子，等待期间
 * 的占位就是零。
 *
 * 放行是一步一行：队首解锁时排在它后面的行可能已经积了一长串（工具行、思考行都在
 * 继续产出），一次全放会让整屏同时淡入。所以解锁的行先进 {@link RowHoldQueue} 的
 * 放行队列，由定时器逐行吐出，待放行越多步长越短（见 RELEASE_BUDGET_MS），既不
 * 突兀也不会让长队拖住屏幕。
 *
 * 等待有上限：超过 HOLD_DEADLINE_MS 仍无译文就放行原文，译文之后到达时再原地挂载。
 */

import { NonDestructiveTranslationMount } from './mount.ts';

/** 一行最多被扣留多久，到点放行原文。 */
export const HOLD_DEADLINE_MS = 5000;

/**
 * 逐行放行的总预算：待放行 N 行时每一步约 BUDGET/N，夹在
 * {@link RELEASE_STEP_MIN_MS} 与 {@link RELEASE_STEP_MAX_MS} 之间。
 */
const RELEASE_BUDGET_MS = 900;
/** 步长下限：再长的队伍也不快于这个间隔，保住「一行一行」的观感。 */
const RELEASE_STEP_MIN_MS = 60;
/** 步长上限：队伍短时让上一行的入场淡入走完再放下一条。 */
const RELEASE_STEP_MAX_MS = 220;

/**
 * 挂起标记：打在会话流条目（`[data-chat-flow-key]`）上，表示「这条还没轮到上屏」。
 */
export const REVEAL_HOLD_ATTRIBUTE = 'data-dsh-reveal-hold';

/**
 * 会话流行入场的门控包裹层：`data-entrance` 是行入场淡入动画的开关。
 */
const ROW_ENTRANCE_HOST_SELECTOR = '[data-entrance]';

/** 会话流容器与流条目。 */
const FLOW_SELECTOR = '[data-chat-flow]';
const FLOW_ITEM_SELECTOR = '[data-chat-flow-key]';

/** 用户自己贴进流里的条目：扣留不能把它们也藏起来。 */
const USER_KINDS = new Set(['user', 'steering', 'command-input']);

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
function replayRowEntrance(element: HTMLElement): void {
  // 卡片条目往上找得到包裹层；整个流程条目要找它里面的那一个。
  const host = element.closest<HTMLElement>(ROW_ENTRANCE_HOST_SELECTOR)
    ?? element.querySelector<HTMLElement>(ROW_ENTRANCE_HOST_SELECTOR);
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
  /** 行根（`[data-variant]` 卡片）。它只用来辨认「同一行」是否已经入队。 */
  root: HTMLElement;
  /** 当前正在等待译文的原文。 */
  text: string;
  /** 拿到的译文；null 表示这一行确定没有译文可等（失败 / 超时）。 */
  translation: string | null;
  /** 译文（或失败判定）已就绪，只等排到队首。没有译文可等的行入场即就绪。 */
  ready: boolean;
  timer: number | null;
}

class RowHoldQueue {
  /** 按阅读顺序排列的扣留行。 */
  private entries: RowHoldEntry[] = [];
  /** 结果回来时只知道 span，不知道条目，所以另留一份索引。 */
  private bySpan = new WeakMap<HTMLElement, RowHoldEntry>();
  /** 当前挂起着的流程条目 → 隐藏之前它自己的行内 display。 */
  private marked = new Map<HTMLElement, string>();
  /** 已轮到上屏、正在按阅读顺序逐行吐出的条目。 */
  private releasing: HTMLElement[] = [];
  private releaseTimer: number | null = null;

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
      timer: null,
    };
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
   * 藏的是整个流程条目，不是某一张卡片：条目里的东西有的归揭示引擎管（回答正文、
   * 思考正文、译文，标记会让它们只积压不推进），有的宿主直接落盘（工具卡片正文、
   * 不翻译的读写文件行），只冻结揭示挡不住后者。整条藏起来两种都覆盖，而且条目
   * 本身在 React 重渲染里不会被换掉，卡片被换掉也照样藏得住。
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

  /** 挂起一个条目：整条不可见，并且不推进它里面的揭示。 */
  private holdItem(item: HTMLElement, head: RowHoldEntry): void {
    if (!this.follows(head.item, item)) return;
    const kind = item.getAttribute('data-chat-flow-kind');
    if (kind !== null && USER_KINDS.has(kind)) return;
    this.mark(item);
  }

  private follows(head: HTMLElement, item: HTMLElement): boolean {
    return (head.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  /**
   * 藏住整条流程条目。用 `display: none` 而不是 `opacity`/`visibility`：条目内部的
   * 节点可以显式声明 `visibility: visible`（系统提示卡片就是这么自管的），那样会从
   * 隐藏的祖先里逃出来；而且只要条目还参与布局，会话流的 16px 兄弟间距就还在——每
   * 一条被扣留的行都会在屏幕底部留一段等宽的空白。整个盒子移除，等待期间占位为零，
   * 轮到它时再连同入场淡入一起撑开。
   */
  private mark(item: HTMLElement): void {
    if (this.marked.has(item)) return;
    this.marked.set(item, item.style.display);
    item.setAttribute(REVEAL_HOLD_ATTRIBUTE, '');
    item.style.display = 'none';
  }

  /** 解除挂起；`animate` 为真时补一段行入场淡入，避免内容一下子蹦出来。 */
  private unmark(item: HTMLElement, animate: boolean): void {
    const previous = this.marked.get(item);
    if (previous === undefined) return;
    this.marked.delete(item);
    item.removeAttribute(REVEAL_HOLD_ATTRIBUTE);
    item.style.display = previous;
    if (animate) replayRowEntrance(item);
  }

  /**
   * 排进放行队列。按阅读顺序插入，所以逐行吐出的顺序就是行在流里的顺序。
   */
  private enqueueRelease(item: HTMLElement): void {
    if (this.releasing.includes(item)) return;
    const index = this.releasing.findIndex(
      (other) => (item.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    if (index === -1) this.releasing.push(item);
    else this.releasing.splice(index, 0, item);
  }

  /**
   * 取出下一个还连在文档里的待放行条目。
   * @returns 待放行条目；队列空或只剩已断开节点时返回 undefined。
   */
  private takeRelease(): HTMLElement | undefined {
    while (this.releasing.length > 0) {
      const item = this.releasing.shift()!;
      if (item.isConnected) return item;
      this.unmark(item, false);
    }
    return undefined;
  }

  /** 队伍越长步长越短：几行时让淡入跑完，几十行时也不至于让读者干等。 */
  private releaseStepMs(): number {
    const step = RELEASE_BUDGET_MS / (this.releasing.length + 1);
    return Math.min(RELEASE_STEP_MAX_MS, Math.max(RELEASE_STEP_MIN_MS, step));
  }

  /**
   * 逐行放行：每一步只让一行出现，然后按当时的队伍长度安排下一步。队首（刚解锁
   * 的那一行）走的是同步的那一步，所以它不会比译文晚一帧上屏。
   */
  private pumpRelease(): void {
    if (this.releaseTimer !== null || typeof window === 'undefined') return;
    const item = this.takeRelease();
    if (item === undefined) return;
    this.unmark(item, true);
    if (this.releasing.length === 0) return;
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null;
      this.pumpRelease();
    }, this.releaseStepMs());
  }

  /** 丢掉逐行放行的进度（关闭、换会话、断开观察器时用）。 */
  private clearReleases(): void {
    if (this.releaseTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.releaseTimer);
    }
    this.releaseTimer = null;
    this.releasing = [];
  }

  /** 按阅读顺序入队：入队顺序就是上屏顺序。 */
  private insert(entry: RowHoldEntry): void {
    const index = this.entries.findIndex((other) => this.follows(entry.item, other.item));
    if (index === -1) this.entries.push(entry);
    else this.entries.splice(index, 0, entry);
  }

  /** 译文（或超时判定）落地，交给队首判定。 */
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
   * 按顺序解锁：队首就绪就挂译文并把它交给逐行放行，然后看新的队首。译文在条目
   * 仍是 `display: none` 时挂上，所以屏幕上不会出现完整中文被画一帧再被截断的闪烁；
   * 真正撑开这一行由 {@link pumpRelease} 执行。
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
    }
    // 解锁的行交给逐行放行：这一步顺带补入场淡入，整条从不可见变可见就是它的出场。
    this.sync();
  }

  /**
   * 让挂起标记与队首对齐：队首自己以及排在它后面的每个流程条目都藏起来，其余
   * 交给逐行放行。放行让队首前移时，之前被它挡住的条目就在这一步进入放行队列。
   *
   * 没有「立即恢复」的旁路：放行一律排队逐行吐出，所以放行途中新到的队首不会把
   * 正在等的那些行一次性抖出来（`releaseAll` 是唯一的立即路径）。
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

    for (const item of [...this.marked.keys()]) {
      if (!wanted.has(item)) this.enqueueRelease(item);
    }
    // 重新被队首挡住的条目退出放行队列：它必须继续等。
    if (this.releasing.length > 0) {
      this.releasing = this.releasing.filter((item) => !wanted.has(item));
    }
    for (const item of wanted) this.mark(item);
    this.pumpRelease();
  }

  /**
   * 全部放行：断开观察器与关闭总开关时用。批量放行不做入场动画，也不排队，
   * 否则整屏会一起闪一遍、或者留下一个跑不完的定时器。
   */
  releaseAll(): void {
    this.clearReleases();
    for (const entry of this.entries) {
      if (entry.timer !== null && typeof window !== 'undefined') {
        window.clearTimeout(entry.timer);
      }
      if (entry.span !== null) this.bySpan.delete(entry.span);
    }
    this.entries = [];
    for (const item of [...this.marked.keys()]) this.unmark(item, false);
  }
}

export const rowHold = new RowHoldQueue();

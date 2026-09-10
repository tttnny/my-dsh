import { cssEscape } from "./cssEscape.ts";
import { flattenPromptText } from "./flattenPrompt.ts";
import { pickPinnedIndexBounded } from "./pickStuckRow.ts";

const HOST_ATTR = "data-oil-sticky-host";
const EASE = "220ms cubic-bezier(0.22, 1, 0.36, 1)";
const HIDE_DELAY_MS = 170;
const PLUGIN_NAME = "dsh-oil-sticky-prompt";

/**
 * DSH 对话流的内部 DOM 契约。CSS Module 哈希类名只能做后缀匹配，data-* 是
 * DSH 客户端自身的锚点；两族任一改名都会让插件静默失效，因此挂载后用
 * verifyContract() 做一次存在性冒烟断言，便于升级后快速定位。
 */
const CONTRACT_SELECTORS = [
  "[data-conversation-scroll]",
  '[data-chat-flow-kind="user"][data-chat-anchor-key]',
  "[class*=userstack i]",
  "[class*=bubble i]",
] as const;

/**
 * 会话已渲染的旁证（与吸顶契约不同族）：区分「契约失效」与「页面还没有会话」。
 *
 * 0.1.5-rc.1 适配：`[data-slot=conversation]` 已失效——官方把该槽位改名为 `main`
 * （槽位契约实测：0.1.3-alpha.2 有 conversation、无 main；0.1.5-rc.1 无 conversation、
 * 有 main/main.conversation/conversation.session）。这里保留 `[data-composer-seat]`
 * （两版都在，是主判据），并补上改名后的候选，避免旁证族整体失效后
 * verifyContract() 永不告警。
 */
const CHAT_SURFACE_SELECTOR = [
  "[data-composer-seat]",
  '[data-slot="main"]',
  '[data-slot="conversation.session"]',
  '[data-slot="main.conversation"]',
].join(", ");

interface FlowRow {
  readonly key: string;
  readonly row: HTMLElement;
}

interface StickyRuntime {
  /** scroller → 已排队的 rAF id：每个 scroller 各自合并，互不吞帧。 */
  readonly pendingFrames: Map<HTMLElement, number>;
  /** host → 挂起的淡出定时器：Map 可遍历，卸载时必须逐个 clearTimeout。 */
  readonly hideTimers: Map<HTMLElement, number>;
}

function reducedMotion(): boolean {
  return typeof matchMedia === "function"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function bubbleOf(row: HTMLElement): HTMLElement {
  // 现行 DSH：UserStyleBubble 的 userStack > bubble（CSS-module 哈希类名，仅以后缀匹配）。
  // querySelector 按文档序返回，命中 bubble 本体先于其内部嵌套块，可直接取用。
  const stack = row.querySelector<HTMLElement>("[class*=userstack i]");
  const bubble = stack?.querySelector<HTMLElement>("[class*=bubble i]") ?? null;
  if (bubble !== null) return bubble;
  if (stack !== null) return stack;
  return row;
}

function textOf(row: HTMLElement): string {
  return flattenPromptText(bubbleOf(row).textContent ?? "");
}

/** 只做 DOM 查询与 dataset 读取（无布局读），供有界测量按行号取值。 */
function flowRowsOf(scroller: HTMLElement): FlowRow[] {
  const rows: FlowRow[] = [];
  for (const row of scroller.querySelectorAll<HTMLElement>('[data-chat-flow-kind="user"][data-chat-anchor-key]')) {
    const key = row.dataset.chatAnchorKey;
    if (key === undefined || key === "") continue;
    rows.push({ key, row });
  }
  return rows;
}

function ensureHost(scroller: HTMLElement): HTMLElement {
  const existing = scroller.querySelector<HTMLElement>(`:scope > [${HOST_ATTR}]`);
  if (existing !== null) return existing;
  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "");
  host.innerHTML = '<div class="oilStickyBar" hidden><button type="button" class="oilStickyPrompt"><span class="oilStickyPromptText"></span></button></div>';
  scroller.prepend(host);
  return host;
}

function clearTransform(prompt: HTMLElement): void {
  prompt.style.transition = "";
  prompt.style.transform = "";
  prompt.style.transformOrigin = "";
}

function placeFrom(prompt: HTMLElement, from: DOMRect, to: DOMRect): void {
  const scaleX = from.width / Math.max(to.width, 1);
  const scaleY = from.height / Math.max(to.height, 1);
  prompt.style.transition = "none";
  prompt.style.transformOrigin = "top left";
  prompt.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
}

function animateToRest(prompt: HTMLElement): void {
  prompt.getBoundingClientRect();
  prompt.style.transition = `transform ${EASE}`;
  prompt.style.transform = "none";
}

function renderBar(scroller: HTMLElement, runtime: StickyRuntime): void {
  const host = ensureHost(scroller);
  const bar = host.querySelector<HTMLElement>(".oilStickyBar");
  const label = host.querySelector<HTMLElement>(".oilStickyPromptText");
  const prompt = host.querySelector<HTMLButtonElement>(".oilStickyPrompt");
  if (bar === null || label === null || prompt === null) return;

  const rows = flowRowsOf(scroller);
  const previous = host.dataset.oilPinnedKey;
  const currentIndex = previous === undefined
    ? -1
    : rows.findIndex((item) => item.key === previous);
  const scrollerTop = scroller.getBoundingClientRect().top;
  // 有界测量：二分定位边界，每帧只做 O(log 用户消息数) 次布局读（原先 O(用户消息数)）。
  const index = pickPinnedIndexBounded(rows.length, currentIndex, scrollerTop, (position) => {
    const item = rows[position];
    return item === undefined ? Number.NEGATIVE_INFINITY : item.row.getBoundingClientRect().top;
  });
  const match = index === -1 ? undefined : rows[index];
  const next = match?.key;

  if (next === undefined || match === undefined) {
    if (previous === undefined || bar.hidden || runtime.hideTimers.has(host)) return;
    hideBar(host, bar, prompt, runtime);
    return;
  }

  const pendingHide = runtime.hideTimers.get(host);
  if (pendingHide !== undefined) {
    window.clearTimeout(pendingHide);
    runtime.hideTimers.delete(host);
  }

  const text = textOf(match.row);
  if (text === "") {
    hideBar(host, bar, prompt, runtime);
    return;
  }

  const same = previous === next && !bar.hidden && pendingHide === undefined;
  if (same) {
    if (label.textContent !== text) label.textContent = text;
    bindJump(prompt, scroller, next);
    return;
  }

  const from = bubbleOf(match.row).getBoundingClientRect();
  label.textContent = text;
  host.dataset.oilPinnedKey = next;
  bar.hidden = false;
  bar.dataset.oilVisible = "1";
  bindJump(prompt, scroller, next);

  if (reducedMotion()) {
    clearTransform(prompt);
    return;
  }
  placeFrom(prompt, from, prompt.getBoundingClientRect());
  animateToRest(prompt);
}

function hideBar(
  host: HTMLElement,
  bar: HTMLElement,
  prompt: HTMLButtonElement,
  runtime: StickyRuntime,
): void {
  delete host.dataset.oilPinnedKey;
  if (bar.hidden) return;
  clearTransform(prompt);

  const finish = (): void => {
    runtime.hideTimers.delete(host);
    bar.hidden = true;
    delete bar.dataset.oilVisible;
    const label = bar.querySelector(".oilStickyPromptText");
    if (label !== null) label.textContent = "";
  };

  if (reducedMotion()) {
    finish();
    return;
  }

  delete bar.dataset.oilVisible;
  runtime.hideTimers.set(host, window.setTimeout(finish, HIDE_DELAY_MS));
}

function bindJump(prompt: HTMLButtonElement, scroller: HTMLElement, key: string): void {
  prompt.onclick = () => {
    const row = scroller.querySelector<HTMLElement>(
      `[data-chat-flow-kind="user"][data-chat-anchor-key="${cssEscape(key)}"]`,
    );
    row?.scrollIntoView({
      block: "start",
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };
}

export function installStickyUserRows(): () => void {
  const runtime: StickyRuntime = { pendingFrames: new Map(), hideTimers: new Map() };

  const scheduleRender = (scroller: HTMLElement): void => {
    if (runtime.pendingFrames.has(scroller)) return;
    runtime.pendingFrames.set(scroller, window.requestAnimationFrame(() => {
      runtime.pendingFrames.delete(scroller);
      renderBar(scroller, runtime);
    }));
  };

  // 契约存在性冒烟断言：命中即通过；只有「会话已渲染但关键选择器一个都不中」才告警，
  // 避免应用尚未打开会话时误报。判定一次即结束，不触碰正常渲染路径。
  let contractSettled = false;
  const verifyContract = (): void => {
    if (contractSettled) return;
    if (CONTRACT_SELECTORS.some((selector) => document.querySelector(selector) !== null)) {
      contractSettled = true;
      return;
    }
    if (document.querySelector(CHAT_SURFACE_SELECTOR) === null) return;
    contractSettled = true;
    console.warn(
      `[${PLUGIN_NAME}] 未匹配到任何 DSH 对话流 DOM 契约选择器（${CONTRACT_SELECTORS.join(" / ")}）：可能是 DSH 升级导致契约变更，吸顶提示将静默失效。`,
    );
  };

  const onScroll = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute("data-conversation-scroll")) return;
    scheduleRender(target);
  };

  const onMutate = (): void => {
    verifyContract();
    for (const scroller of document.querySelectorAll<HTMLElement>("[data-conversation-scroll]")) {
      scheduleRender(scroller);
    }
  };

  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onMutate);
  // 流式输出与 SPA 切会话不一定触发 scroll/resize：观察子树增删并经 rAF 合并刷新。
  const observer = new MutationObserver(() => { onMutate(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  onMutate();

  return () => {
    document.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onMutate);
    observer.disconnect();
    for (const id of runtime.pendingFrames.values()) window.cancelAnimationFrame(id);
    runtime.pendingFrames.clear();
    for (const id of runtime.hideTimers.values()) window.clearTimeout(id);
    runtime.hideTimers.clear();
    for (const host of document.querySelectorAll(`[${HOST_ATTR}]`)) host.remove();
  };
}

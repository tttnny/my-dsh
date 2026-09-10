window.__ModuleLoader__.load({
	id: "@lynn123411/dsh-oil-sticky-prompt",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/cssEscape.ts
		/**
		* CSS 属性选择器双引号值内的转义降级分支。
		*
		* 只需处理 \\ 与 "：反斜杠先转义，双引号必须转义成 \" —— 修复前误写成 \'，
		* 含双引号的 anchor key 会提前闭合属性选择器，querySelector 永远匹配不到。
		*/
		function escapeSelectorValue(value) {
			return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
		}
		/** 优先使用原生 CSS.escape；不可用时退回上面的属性选择器字符串转义。 */
		function cssEscape(value) {
			if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
			return escapeSelectorValue(value);
		}
		//#endregion
		//#region src/client/flattenPrompt.ts
		/** Collapse original line breaks so a short first line does not hide the rest after clamp. */
		function flattenPromptText(text) {
			return text.replace(/\s+/g, " ").trim();
		}
		//#endregion
		//#region src/client/pickStuckRow.ts
		const PIN = .5;
		const RELEASE = 8;
		/** 边界两侧允许的校正探测次数（正常单调布局下为 0 次）。 */
		const CORRECTION_LIMIT = 4;
		/**
		* 吸顶判定的唯一决策核：全量读取版 pickPinnedRow 与有界读取版
		* pickPinnedIndexBounded 共用它，保证两条读取路径语义不可能漂移。
		*
		* @param lastPastIndex 最后一条已越过滚动端口顶部的行号（-1 表示没有）
		* @param currentIndex  当前吸顶行号（-1 表示不在本次行列表中）
		* @param currentTop    当前吸顶行相对视口顶部的位置（仅在上面的分支需要时读取）
		*/
		function decidePinnedIndex(lastPastIndex, currentIndex, currentTop, scrollerTop) {
			if (lastPastIndex > currentIndex) return lastPastIndex;
			if (currentIndex >= 0 && currentTop <= scrollerTop + RELEASE) return currentIndex;
			return lastPastIndex;
		}
		/**
		* 有界读取版：滚动帧里只做 O(log n) 次 getBoundingClientRect，替代原先 O(用户消息数) 次。
		*
		* 对话流里的 user 行按文档序自上而下堆叠，top 随行号单调不减，因此“最后一条越过顶部的行”
		* 可以用二分定位，结果与全量扫描一致；定位后在边界两侧各做少量校正探测，容忍个别非单调行，
		* 且校正次数有硬上限，永不退化成全量扫描。topOf 只允许做布局读，不得写 DOM。
		*/
		function pickPinnedIndexBounded(rowCount, currentIndex, scrollerTop, topOf) {
			if (rowCount <= 0) return -1;
			const measured = /* @__PURE__ */ new Map();
			const top = (index) => {
				const cached = measured.get(index);
				if (cached !== void 0) return cached;
				const value = topOf(index);
				measured.set(index, value);
				return value;
			};
			let low = 0;
			let high = rowCount;
			while (low < high) {
				const middle = low + high >>> 1;
				if (top(middle) <= scrollerTop + PIN) low = middle + 1;
				else high = middle;
			}
			let lastPastIndex = low - 1;
			for (let step = 0; step < CORRECTION_LIMIT && lastPastIndex + 1 < rowCount; step += 1) {
				if (top(lastPastIndex + 1) > scrollerTop + PIN) break;
				lastPastIndex += 1;
			}
			for (let step = 0; step < CORRECTION_LIMIT && lastPastIndex >= 0; step += 1) {
				if (top(lastPastIndex) <= scrollerTop + PIN) break;
				lastPastIndex -= 1;
			}
			const currentTop = currentIndex !== -1 && lastPastIndex <= currentIndex ? top(currentIndex) : Number.POSITIVE_INFINITY;
			return decidePinnedIndex(lastPastIndex, currentIndex, currentTop, scrollerTop);
		}
		//#endregion
		//#region src/client/installSticky.ts
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
			"[data-chat-flow-kind=\"user\"][data-chat-anchor-key]",
			"[class*=userstack i]",
			"[class*=bubble i]"
		];
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
			"[data-slot=\"main\"]",
			"[data-slot=\"conversation.session\"]",
			"[data-slot=\"main.conversation\"]"
		].join(", ");
		function reducedMotion() {
			return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
		}
		function bubbleOf(row) {
			const stack = row.querySelector("[class*=userstack i]");
			const bubble = stack?.querySelector("[class*=bubble i]") ?? null;
			if (bubble !== null) return bubble;
			if (stack !== null) return stack;
			return row;
		}
		function textOf(row) {
			return flattenPromptText(bubbleOf(row).textContent ?? "");
		}
		/** 只做 DOM 查询与 dataset 读取（无布局读），供有界测量按行号取值。 */
		function flowRowsOf(scroller) {
			const rows = [];
			for (const row of scroller.querySelectorAll("[data-chat-flow-kind=\"user\"][data-chat-anchor-key]")) {
				const key = row.dataset.chatAnchorKey;
				if (key === void 0 || key === "") continue;
				rows.push({
					key,
					row
				});
			}
			return rows;
		}
		function ensureHost(scroller) {
			const existing = scroller.querySelector(`:scope > [${HOST_ATTR}]`);
			if (existing !== null) return existing;
			const host = document.createElement("div");
			host.setAttribute(HOST_ATTR, "");
			host.innerHTML = "<div class=\"oilStickyBar\" hidden><button type=\"button\" class=\"oilStickyPrompt\"><span class=\"oilStickyPromptText\"></span></button></div>";
			scroller.prepend(host);
			return host;
		}
		function clearTransform(prompt) {
			prompt.style.transition = "";
			prompt.style.transform = "";
			prompt.style.transformOrigin = "";
		}
		function placeFrom(prompt, from, to) {
			const scaleX = from.width / Math.max(to.width, 1);
			const scaleY = from.height / Math.max(to.height, 1);
			prompt.style.transition = "none";
			prompt.style.transformOrigin = "top left";
			prompt.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
		}
		function animateToRest(prompt) {
			prompt.getBoundingClientRect();
			prompt.style.transition = `transform ${EASE}`;
			prompt.style.transform = "none";
		}
		function renderBar(scroller, runtime) {
			const host = ensureHost(scroller);
			const bar = host.querySelector(".oilStickyBar");
			const label = host.querySelector(".oilStickyPromptText");
			const prompt = host.querySelector(".oilStickyPrompt");
			if (bar === null || label === null || prompt === null) return;
			const rows = flowRowsOf(scroller);
			const previous = host.dataset.oilPinnedKey;
			const currentIndex = previous === void 0 ? -1 : rows.findIndex((item) => item.key === previous);
			const scrollerTop = scroller.getBoundingClientRect().top;
			const index = pickPinnedIndexBounded(rows.length, currentIndex, scrollerTop, (position) => {
				const item = rows[position];
				return item === void 0 ? Number.NEGATIVE_INFINITY : item.row.getBoundingClientRect().top;
			});
			const match = index === -1 ? void 0 : rows[index];
			const next = match?.key;
			if (next === void 0 || match === void 0) {
				if (previous === void 0 || bar.hidden || runtime.hideTimers.has(host)) return;
				hideBar(host, bar, prompt, runtime);
				return;
			}
			const pendingHide = runtime.hideTimers.get(host);
			if (pendingHide !== void 0) {
				window.clearTimeout(pendingHide);
				runtime.hideTimers.delete(host);
			}
			const text = textOf(match.row);
			if (text === "") {
				hideBar(host, bar, prompt, runtime);
				return;
			}
			if (previous === next && !bar.hidden && pendingHide === void 0) {
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
		function hideBar(host, bar, prompt, runtime) {
			delete host.dataset.oilPinnedKey;
			if (bar.hidden) return;
			clearTransform(prompt);
			const finish = () => {
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
		function bindJump(prompt, scroller, key) {
			prompt.onclick = () => {
				scroller.querySelector(`[data-chat-flow-kind="user"][data-chat-anchor-key="${cssEscape(key)}"]`)?.scrollIntoView({
					block: "start",
					behavior: reducedMotion() ? "auto" : "smooth"
				});
			};
		}
		function installStickyUserRows() {
			const runtime = {
				pendingFrames: /* @__PURE__ */ new Map(),
				hideTimers: /* @__PURE__ */ new Map()
			};
			const scheduleRender = (scroller) => {
				if (runtime.pendingFrames.has(scroller)) return;
				runtime.pendingFrames.set(scroller, window.requestAnimationFrame(() => {
					runtime.pendingFrames.delete(scroller);
					renderBar(scroller, runtime);
				}));
			};
			let contractSettled = false;
			const verifyContract = () => {
				if (contractSettled) return;
				if (CONTRACT_SELECTORS.some((selector) => document.querySelector(selector) !== null)) {
					contractSettled = true;
					return;
				}
				if (document.querySelector(CHAT_SURFACE_SELECTOR) === null) return;
				contractSettled = true;
				console.warn(`[${PLUGIN_NAME}] 未匹配到任何 DSH 对话流 DOM 契约选择器（${CONTRACT_SELECTORS.join(" / ")}）：可能是 DSH 升级导致契约变更，吸顶提示将静默失效。`);
			};
			const onScroll = (event) => {
				const target = event.target;
				if (!(target instanceof HTMLElement) || !target.hasAttribute("data-conversation-scroll")) return;
				scheduleRender(target);
			};
			const onMutate = () => {
				verifyContract();
				for (const scroller of document.querySelectorAll("[data-conversation-scroll]")) scheduleRender(scroller);
			};
			document.addEventListener("scroll", onScroll, {
				capture: true,
				passive: true
			});
			window.addEventListener("resize", onMutate);
			const observer = new MutationObserver(() => {
				onMutate();
			});
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true
			});
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
		//#endregion
		//#region src/client/index.tsx
		const STYLE_ID = "dsh-oil-sticky-prompt";
		const STYLES = `
[data-oil-sticky-host]{
  position:sticky;
  top:0;
  z-index:5;
  height:0;
  overflow:visible;
  pointer-events:none;
}
.oilStickyBar{
  position:absolute;
  left:0;
  right:0;
  top:0;
  display:flex;
  justify-content:center;
  padding:8px calc(var(--dsh-composer-side-clearance, 16px) + 16px);
  background:var(--dsw-alias-bg-base);
  box-shadow:0 16px 16px -12px var(--dsw-alias-bg-base);
  opacity:0;
  transition:opacity 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.oilStickyBar[data-oil-visible]{opacity:1}
.oilStickyBar[hidden]{display:none}
.oilStickyPrompt{
  display:block;
  box-sizing:border-box;
  width:100%;
  max-width:var(--dsh-chat-content-width, 748px);
  margin:0;
  padding:6px 12px;
  border:none;
  border-radius:16px;
  background:var(--dsw-specific-bubble);
  color:var(--dsw-alias-label-primary);
  font:inherit;
  font-size:13px;
  line-height:20px;
  text-align:left;
  pointer-events:auto;
  cursor:pointer;
  will-change:transform;
}
.oilStickyPrompt:focus-visible{
  outline:none;
  box-shadow:0 0 0 2px var(--dsw-alias-border-l3);
}
.oilStickyPromptText{
  display:-webkit-box;
  overflow:hidden;
  overflow-wrap:anywhere;
  white-space:normal;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
}
@media (prefers-reduced-motion:reduce){
  .oilStickyBar{box-shadow:none;opacity:1;transition:none}
  .oilStickyPrompt{transition:none}
}
`;
		/** 浏览器插件名（与 cordis.patch.yml 的 insert id 一致）。 */
		const name = "dsh-oil-sticky-prompt";
		/** 无硬依赖的纯 DOM 观察插件：不等待任何服务，immediately 由 package.json 声明。 */
		const inject = [];
		function apply(ctx) {
			ctx.effect(() => {
				const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`);
				const tag = existing instanceof HTMLStyleElement ? existing : document.createElement("style");
				tag.dataset.plugin = "dsh-oil-sticky-prompt";
				tag.dataset.pluginCss = STYLE_ID;
				tag.textContent = STYLES;
				if (existing === null) document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "dsh-oil-sticky-prompt: styles");
			ctx.effect(() => installStickyUserRows(), "dsh-oil-sticky-prompt: stick");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
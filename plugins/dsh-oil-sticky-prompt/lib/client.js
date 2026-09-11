window.__ModuleLoader__.load({
	id: "@lynn123411/dsh-oil-sticky-prompt",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		//#region src/settings.ts
		/**
		* User-owned settings for the sticky-prompt plugin.
		*
		* The Host registers the namespace in the durable settings document and the
		* browser binds the same namespace through the native `settingsScope` service,
		* so both halves share this one contract module. Deliberately outside
		* `client/`: the Host half imports it too, and the client half must not own a
		* path the Host bundle would have to reach through.
		*/
		/**
		* Settings namespace registered by the Host and bound in the browser. It is
		* also the `id` this plugin's card registers under in the shared 「阅读体验」
		* page's item slot, and it must stay a lowercase hyphenated identifier (the
		* kernel validates it at registration).
		*/
		const STICKY_PROMPT_SETTINGS_NS = "lynn-sticky-prompt";
		/** Defaults shared by the Host schema and the browser-side fallback. */
		const DEFAULT_STICKY_PROMPT_SETTINGS = { enabled: true };
		//#endregion
		//#region src/client/StickyPromptCard.tsx
		/**
		* The sticky-prompt card inside the shared 「阅读体验」 settings page.
		*
		* One preference, written straight through the bound namespace scope: the Host
		* document stays the single authority, so the card keeps no draft state and the
		* browser half follows the committed value live. The chrome mirrors the shipped
		* plugin-card look with inline styles, because the Host cards' styles are not
		* exported for reuse and this plugin ships no CSS pipeline to keep it
		* dependency-light.
		*/
		/** Card chrome, mirroring the shipped plugin-card look through theme tokens. */
		const styles = {
			card: {
				listStyle: "none",
				display: "flex",
				flexDirection: "column",
				border: "1px solid var(--dsw-alias-border-l2)",
				borderRadius: "12px",
				background: "var(--dsw-alias-bg-layer-3)"
			},
			header: {
				display: "flex",
				flexDirection: "column",
				gap: "4px",
				padding: "14px 16px 12px"
			},
			name: {
				fontWeight: 600,
				fontSize: "15px",
				lineHeight: 1.4,
				color: "var(--dsw-alias-label-primary)"
			},
			description: {
				fontSize: "13px",
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary)"
			},
			body: {
				display: "flex",
				flexDirection: "column",
				margin: "0 16px",
				paddingBottom: "8px",
				borderTop: "1px solid var(--dsw-alias-border-l2)"
			},
			field: {
				display: "flex",
				flexDirection: "column",
				gap: "6px",
				padding: "12px 0"
			},
			fieldHead: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: "8px"
			},
			label: {
				flex: 1,
				minWidth: 0,
				fontSize: "13px",
				fontWeight: 500,
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-primary)"
			},
			toggle: {
				flex: "none",
				width: "16px",
				height: "16px",
				accentColor: "var(--dsw-alias-brand-primary)",
				cursor: "pointer"
			},
			hint: {
				margin: 0,
				fontSize: "12px",
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary)"
			},
			statusLine: {
				margin: 0,
				paddingBottom: "8px",
				fontSize: "12px",
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-tertiary)"
			},
			failure: {
				margin: 0,
				paddingBottom: "8px",
				fontSize: "12px",
				lineHeight: 1.5,
				color: "var(--dsw-alias-label-error)"
			}
		};
		/** Status copy for a scope that cannot serve an edit right now. */
		function statusKey(snapshot) {
			if (snapshot.status === "loading") return "loading";
			if (snapshot.status === "unavailable") return "unavailable";
			return snapshot.writable ? void 0 : "readOnly";
		}
		/** Render the sticky-prompt card independently of the core settings namespace allowlist. */
		function StickyPromptCard(props) {
			const { t, scope } = props;
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => scope.subscribe(listener), [scope]), (0, react.useCallback)(() => scope.getSnapshot(), [scope]));
			const [failed, setFailed] = (0, react.useState)(false);
			const status = statusKey(snapshot);
			const enabled = snapshot.value?.enabled ?? DEFAULT_STICKY_PROMPT_SETTINGS.enabled;
			const write = (next) => {
				setFailed(false);
				scope.set("enabled", next).catch(() => {
					setFailed(true);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: styles.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.name,
						children: t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: styles.description,
						children: t("description")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: styles.body,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: styles.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: styles.fieldHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: styles.label,
									children: t("enabled")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									style: styles.toggle,
									checked: enabled,
									disabled: status !== void 0,
									onChange: (event) => {
										write(event.target.checked);
									}
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: styles.hint,
								children: t("enabledHint")
							})]
						}),
						status === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: styles.statusLine,
							role: "status",
							children: t(status)
						}),
						failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: styles.failure,
							role: "status",
							children: t("writeFailed")
						}) : null
					]
				})]
			});
		}
		//#endregion
		//#region src/client/reading-settings-page.tsx
		/**
		* The shared 「阅读体验」 settings page.
		*
		* Several plugins contribute their configuration to ONE settings page, but the
		* kernel cannot declare that page jointly: `settings.section` is a list slot
		* that rejects a duplicate `id` at the same priority ("already has an entry
		* with id"), and a child slot may be declared exactly once ("slot … is already
		* declared"). Composing several cards into one page therefore takes one
		* declarer, so every participating plugin carries this same shell and the
		* FIRST one to activate claims the page; the others register their card into
		* {@link READING_ITEM_SLOT} and wait for the winner's declaration through
		* `slots.inject`. Uninstalling the winner promotes another participant on the
		* next boot, so no participant is a fixed owner.
		*
		* The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
		* child slot's own registrations (id + `label` + `order`, the same shape the
		* kernel's own Plugins page uses for its tabs), and each panel dispatches
		* through `renderSlot(READING_ITEM_SLOT, {}, { only: id })`. Every panel stays
		* mounted but hidden, so a card's local state survives a tab switch.
		*
		* Keep this file identical across the participating plugins
		* (`dsh-smooth-stream`, `dsh-oil-sticky-prompt`, `dsh-chat-translate`).
		* Participants own their own card component, locale dictionaries, settings
		* namespace and Host half — only the page shell below is shared, because
		* cross-plugin value imports are forbidden by the client bundle purity gate.
		* It imports nothing but `react` plus type-only DSH packages on purpose, so
		* every participant's build configuration compiles it unchanged.
		*/
		/** Page id claimed by the first participating plugin to activate. */
		const READING_PAGE_ID = "reading";
		/** The page's one child slot: every participant's card registers here. */
		const READING_ITEM_SLOT = "reading.settings.item";
		/** A registration label is a plain string or a thunk re-read per projection. */
		function readLabel(label) {
			if (typeof label === "function") return label();
			return typeof label === "string" ? label : "";
		}
		const TABLIST_STYLE = {
			display: "flex",
			gap: "4px",
			marginBottom: "12px",
			borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25))"
		};
		const TAB_STYLE = {
			appearance: "none",
			background: "transparent",
			border: "none",
			borderBottom: "2px solid transparent",
			marginBottom: "-1px",
			padding: "6px 12px",
			cursor: "pointer",
			font: "inherit",
			fontSize: "13px",
			color: "var(--dsw-alias-label-secondary, inherit)"
		};
		const TAB_ACTIVE_STYLE = {
			...TAB_STYLE,
			color: "var(--dsw-alias-label-primary, inherit)",
			borderBottomColor: "var(--dsw-alias-label-primary, currentColor)",
			fontWeight: 600
		};
		/** Panels stay mounted (hidden) so each card keeps its local state. */
		const PANEL_STYLE = {
			listStyle: "none",
			margin: 0,
			padding: 0
		};
		const PANEL_HIDDEN_STYLE = {
			...PANEL_STYLE,
			display: "none"
		};
		/**
		* Build the live tab roster over the child slot's registrations. `locale` is
		* read through `ctx.get`: a participant needs it only to re-read localized
		* labels on a language switch, and reaching an undeclared service as
		* `ctx.locale` would trip the kernel's inject guard.
		* @param ctx - browser context carrying the slot registry.
		* @returns The tab store consumed by the page component.
		*/
		function createReadingTabs(ctx) {
			const locale = ctx.get("locale");
			let version = -1;
			let revision = -1;
			let tabs = [];
			return {
				getSnapshot: () => {
					const nextVersion = ctx.slots.getVersion(READING_ITEM_SLOT);
					const nextRevision = locale === void 0 ? 0 : locale.getSnapshot().revision;
					if (nextVersion === version && nextRevision === revision) return tabs;
					version = nextVersion;
					revision = nextRevision;
					tabs = ctx.slots.entries(READING_ITEM_SLOT).map((entry) => ({
						id: entry.options.id ?? "",
						order: entry.options.order ?? 0,
						label: readLabel(entry.options.label)
					})).sort((left, right) => left.order - right.order);
					return tabs;
				},
				subscribe: (listener) => {
					const offSlots = ctx.slots.subscribe(READING_ITEM_SLOT, listener);
					const offLocale = locale?.subscribe(listener);
					return () => {
						offSlots();
						offLocale?.();
					};
				}
			};
		}
		/**
		* Page body: one tab per registered card, plus the selected card's panel.
		* The shell supplies the section's own seats and `renderSlot` bound to the
		* child slot declared at registration time.
		*/
		function ReadingSettingsSection({ renderSlot, readingTabs }) {
			const tabs = (0, react.useSyncExternalStore)(readingTabs.subscribe, readingTabs.getSnapshot, readingTabs.getSnapshot);
			const [requested, setRequested] = (0, react.useState)(null);
			const selected = requested !== null && tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id ?? null;
			if (selected === null) return null;
			return (0, react.createElement)("div", null, (0, react.createElement)("div", {
				role: "tablist",
				style: TABLIST_STYLE
			}, tabs.map((tab) => (0, react.createElement)("button", {
				key: tab.id,
				type: "button",
				role: "tab",
				"aria-selected": tab.id === selected,
				style: tab.id === selected ? TAB_ACTIVE_STYLE : TAB_STYLE,
				onClick: () => {
					setRequested(tab.id);
				}
			}, tab.label))), tabs.map((tab) => (0, react.createElement)("ul", {
				key: tab.id,
				role: "tabpanel",
				hidden: tab.id !== selected,
				style: tab.id === selected ? PANEL_STYLE : PANEL_HIDDEN_STYLE
			}, renderSlot(READING_ITEM_SLOT, {}, { only: tab.id }))));
		}
		/** Whether a participant already holds the shared page. */
		function readingPageClaimed(ctx) {
			return ctx.slots.entries("settings.section").some((entry) => entry.options.id === READING_PAGE_ID);
		}
		/**
		* Claim the shared page when no participant holds it yet. Call inside
		* `ctx.slots.inject('settings.section', …)`: injection order decides the
		* winner, and the losers stay silent instead of colliding with the kernel's
		* duplicate-id and duplicate-declaration guards.
		* @param ctx - browser context carrying the slot registry.
		* @param label - page label, re-read by the shell on every projection.
		* @param locale - locale namespace the label thunk translates through.
		* @returns The page registration's disposer, or a no-op when another
		* participant already holds the page.
		*/
		function claimReadingSettingsPage(ctx, label, locale) {
			if (readingPageClaimed(ctx)) return () => {};
			const readingTabs = createReadingTabs(ctx);
			return ctx.slots.register({
				name: "settings.section",
				id: READING_PAGE_ID,
				order: 110,
				label,
				locale,
				inject: () => ({ readingTabs }),
				children: { "reading.settings.item": {
					kind: "list",
					scope: "root"
				} }
			}, ReadingSettingsSection);
		}
		//#endregion
		//#region src/client/stickyPromptRuntime.ts
		/**
		* Owner of the sticky-prompt DOM behaviour, driven by the `enabled` preference.
		*
		* The installer already returns a disposer, so a toggle is a plain
		* install/dispose pair with no partial teardown. Routing both activation paths
		* (startup default, settings-driven flips) through one owner keeps a single
		* writer, so at most one installation — one listener set, one timer map, one
		* injected host per scroller — can exist at a time.
		*/
		/** Preference-driven lifecycle of the sticky-prompt installation. */
		var StickyPromptRuntime = class {
			install;
			release;
			/**
			* @param install - installer producing its own disposer. Injectable so the
			* toggle logic stays testable without a DOM; the production caller passes
			* {@link installStickyUserRows}.
			*/
			constructor(install = installStickyUserRows) {
				this.install = install;
			}
			/**
			* Apply a preference value: installs on the off→on edge, disposes the
			* listeners, timers, and injected DOM on the on→off edge, and does nothing
			* when the requested value already holds — so a redundant scope notification
			* never restarts the behaviour and drops the currently pinned row.
			* @param enabled - the value the user's section resolves to.
			*/
			setEnabled(enabled) {
				if (enabled === (this.release !== void 0)) return;
				if (!enabled) {
					this.release?.();
					this.release = void 0;
					return;
				}
				this.release = this.install();
			}
			/** Release the installation whatever the preference says (plugin or service teardown). */
			dispose() {
				this.release?.();
				this.release = void 0;
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/** Locale bundles for the sticky-prompt card inside the shared 「阅读体验」 settings page. */
		/** Dictionary namespace owned by this plugin's settings card. */
		const NS = "settings.oilStickyPrompt";
		/** English copy. */
		const en = {
			title: "Sticky prompt",
			description: "Pin the latest user message to the top of the conversation so the current question stays in view.",
			pageNav: "Reading",
			enabled: "Enable the sticky prompt",
			enabledHint: "Turn off to stop injecting the sticky bar; turning it back on restores it immediately.",
			loading: "Loading plugin settings…",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "Plugin settings are unavailable in this connection.",
			writeFailed: "The deployment did not accept this change; the effective value is unchanged."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "吸顶提示",
			description: "把最近的用户消息固定在对话流顶部，长上下文回看时不丢失当前问题。",
			pageNav: "阅读体验",
			enabled: "启用吸顶提示",
			enabledHint: "关闭后不再注入吸顶条；重新开启立即恢复。",
			loading: "正在加载插件设置…",
			readOnly: "本部署的设置为只读。",
			unavailable: "当前连接无法访问插件设置。",
			writeFailed: "本部署没有接受这次修改，当前生效值未改变。"
		};
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
		/**
		* 浏览器半边：把吸顶行为的生命周期接到用户偏好上。
		*
		* 样式表与 DOM 行为分开挂载：样式是惰性的（关闭时页面里没有宿主节点可命中），
		* 随插件卸载回收即可；行为则由 StickyPromptRuntime 单一持有，随 `enabled`
		* 偏好安装 / 拆除，因此不会出现两份监听器或重复注入的宿主节点。
		*/
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
			const runtime = new StickyPromptRuntime(installStickyUserRows);
			ctx.effect(() => {
				runtime.setEnabled(DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
				return () => {
					runtime.dispose();
				};
			}, "dsh-oil-sticky-prompt: stick");
			ctx.inject([
				"slots",
				"locale",
				"settingsScope"
			], (settingsCtx) => {
				const scope = settingsCtx.settingsScope.bind({ namespace: STICKY_PROMPT_SETTINGS_NS });
				const t = settingsCtx.locale.bind(NS);
				settingsCtx.effect(() => settingsCtx.locale.register(NS, {
					zh,
					en
				}), "dsh-oil-sticky-prompt: settings dictionaries");
				settingsCtx.effect(() => {
					const sync = () => {
						const snapshot = scope.getSnapshot();
						if (snapshot.status !== "ready") return;
						runtime.setEnabled(snapshot.value?.enabled ?? DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
					};
					const off = scope.subscribe(sync);
					sync();
					return () => {
						off();
						runtime.setEnabled(DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
					};
				}, "dsh-oil-sticky-prompt: enabled preference");
				settingsCtx.slots.inject("settings.section", () => claimReadingSettingsPage(settingsCtx, () => t("pageNav"), NS));
				settingsCtx.slots.inject(READING_ITEM_SLOT, () => settingsCtx.slots.register({
					name: READING_ITEM_SLOT,
					id: STICKY_PROMPT_SETTINGS_NS,
					order: 20,
					label: () => t("title"),
					locale: NS,
					inject: () => ({ scope })
				}, StickyPromptCard));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
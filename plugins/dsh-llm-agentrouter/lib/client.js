window.__ModuleLoader__.load({
	id: "@lynn123411/dsh-llm-agentrouter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let jsx = require("react/jsx-runtime");
		let react = require("react");

		//#region styles
		/*
		 * Written by hand rather than emitted from a CSS module: the `clientBundle`
		 * tsdown preset that produces those hashed class names is not published, so
		 * this bundle owns a prefixed class set and injects it once. Every colour is
		 * a shell design token, so the card follows the active theme.
		 */
		const CSS = [
			".dshAr_card{display:flex;flex-direction:column;gap:10px}",
			".dshAr_lead{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
			".dshAr_choices{display:flex;gap:10px;margin:0;padding:0;border:0;flex-wrap:wrap}",
			".dshAr_choice{flex:1 1 200px;min-width:0;display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);cursor:pointer}",
			".dshAr_choice:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dshAr_choice[data-selected=true]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary) inset}",
			".dshAr_choice[data-disabled=true]{cursor:default;opacity:.55}",
			".dshAr_choice input{margin:3px 0 0}",
			".dshAr_choiceText{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".dshAr_choiceTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}",
			".dshAr_choiceHost{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:12px;line-height:17px}",
			".dshAr_choiceHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}",
			".dshAr_status{margin:0;min-height:18px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".dshAr_status[data-kind=error]{color:var(--dsw-alias-state-error-primary)}",
		].join("");
		const CSS_TAG_ID = "dsh-llm-agentrouter/EndpointCard.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.setAttribute("data-plugin-css", CSS_TAG_ID);
			tag.textContent = CSS;
			document.head.append(tag);
		}
		//#endregion

		//#region locales
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			pageNav: "API中转",
			title: "AgentRouter 中转站",
			description: "选择请求发往的端点。切换后立即生效，无需重启；模型列表不受影响。",
			cn: "国内端点",
			cnHint: "如您区域处于中国大陆则更适用于该端点",
			intl: "国际端点",
			intlHint: "请确保您的网络环境支持访问该端点后切换",
			loading: "正在读取设置…",
			unavailable: "此浏览器无法读取该设置。",
			readOnly: "当前部署不允许写入设置。",
			saving: "正在保存…",
			saved: "已切换到%s。",
			failed: "保存失败，设置未更改。",
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			pageNav: "API relay",
			title: "AgentRouter relay",
			description: "Which endpoint requests are sent to. A switch applies to the next request; the model list is unaffected.",
			cn: "Domestic endpoint",
			cnHint: "Better suited if you are in mainland China",
			intl: "International endpoint",
			intlHint: "Make sure your network can reach this endpoint before switching",
			loading: "Reading settings…",
			unavailable: "This browser cannot read these settings.",
			readOnly: "This deployment does not accept settings writes.",
			saving: "Saving…",
			saved: "Switched to %s.",
			failed: "The save failed; the setting is unchanged.",
		};
		//#endregion

		//#region endpoint card
		/** The endpoint keys this card offers, in display order. */
		const ENDPOINTS = ["cn", "intl"];
		/** Field this card writes inside its namespace. */
		const FIELD = "endpoint";

		/**
		 * Read the endpoint from a resolved section, falling back to the default the
		 * schema documents when the section is not readable yet.
		 * @param {unknown} value - the scope snapshot's resolved value.
		 * @returns {string} an endpoint key.
		 */
		function endpointOf(value) {
			const endpoint = typeof value === "object" && value !== null ? value.endpoint : undefined;
			return ENDPOINTS.includes(endpoint) ? endpoint : "cn";
		}

		/**
		 * Read the host table from a resolved section so each choice can show the
		 * origin it actually means.
		 * @param {unknown} value - the scope snapshot's resolved value.
		 * @returns {Record<string, string>} host per endpoint key.
		 */
		function hostsOf(value) {
			const hosts = typeof value === "object" && value !== null ? value.endpoints : undefined;
			return typeof hosts === "object" && hosts !== null ? hosts : {};
		}

		/**
		 * The relay endpoint card: one radio group over this plugin's own settings
		 * namespace.
		 *
		 * A choice writes immediately rather than staging behind a Save button. The
		 * namespace has exactly one user-facing field and the write is reversible in
		 * one click, so a staged form would add a step without protecting anything —
		 * and `scope.set` already fences the write with the revision it read.
		 *
		 * @param {object} props - the injected scope face plus the bound translator.
		 * @returns {JSX.Element} the card.
		 */
		function EndpointCard({ scope, t }) {
			const snapshot = react.useSyncExternalStore(
				react.useCallback((listener) => scope.subscribe(listener), [scope]),
				() => scope.getSnapshot(),
			);
			const [pending, setPending] = react.useState(null);
			const [failed, setFailed] = react.useState(false);
			const groupName = react.useId();

			const selected = endpointOf(snapshot.value);
			const hosts = hostsOf(snapshot.value);
			const disabled = snapshot.status !== "ready" || !snapshot.writable || pending !== null;

			const choose = (endpoint) => {
				if (endpoint === selected || disabled) return;
				setPending(endpoint);
				setFailed(false);
				Promise.resolve()
					.then(() => scope.set(FIELD, endpoint))
					.then(
						() => {
							setPending(null);
						},
						() => {
							setPending(null);
							setFailed(true);
						},
					);
			};

			const status = () => {
				if (snapshot.status === "loading") return { kind: "info", text: t("loading") };
				if (snapshot.status === "unavailable") return { kind: "error", text: t("unavailable") };
				if (failed) return { kind: "error", text: t("failed") };
				if (pending !== null) return { kind: "info", text: t("saving") };
				if (!snapshot.writable) return { kind: "info", text: t("readOnly") };
				return { kind: "info", text: "" };
			};
			const shown = status();

			return jsx.jsxs("section", {
				className: "dshAr_card",
				"data-plugin-card": "llm-agentrouter",
				"aria-busy": snapshot.status === "loading" || pending !== null,
				children: [
					jsx.jsx("h3", { children: t("title") }),
					jsx.jsx("p", { className: "dshAr_lead", children: t("description") }),
					jsx.jsxs("fieldset", {
						className: "dshAr_choices",
						children: [
							jsx.jsx("legend", { hidden: true, children: t("title") }),
							...ENDPOINTS.map((endpoint) => {
								const active = (pending ?? selected) === endpoint;
								return jsx.jsxs(
									"label",
									{
										className: "dshAr_choice",
										"data-endpoint": endpoint,
										"data-selected": active ? "true" : undefined,
										"data-disabled": disabled ? "true" : undefined,
										children: [
											jsx.jsx("input", {
												type: "radio",
												name: groupName,
												value: endpoint,
												checked: active,
												disabled: disabled && !active,
												onChange: () => choose(endpoint),
											}),
											jsx.jsxs("span", {
												className: "dshAr_choiceText",
												children: [
													jsx.jsx("span", { className: "dshAr_choiceTitle", children: t(endpoint) }),
													jsx.jsx("span", {
														className: "dshAr_choiceHost",
														children: hosts[endpoint] ?? "",
													}),
													jsx.jsx("span", { className: "dshAr_choiceHint", children: t(endpoint + "Hint") }),
												],
											}),
										],
									},
									endpoint,
								);
							}),
						],
					}),
					jsx.jsx("p", {
						className: "dshAr_status",
						"data-kind": shown.kind,
						role: shown.kind === "error" ? "alert" : "status",
						children: shown.text,
					}),
				],
			});
		}
		//#endregion

		//#region shared relay settings page shell
		/**
		 * The shared 「API中转」 settings page.
		 *
		 * Several plugins contribute their configuration to ONE settings page, but the
		 * kernel cannot declare that page jointly: `settings.section` is a list slot
		 * that rejects a duplicate `id` at the same priority ("already has an entry
		 * with id"), and a child slot may be declared exactly once ("slot … is already
		 * declared"). Composing several cards into one page therefore takes one
		 * declarer, so every participating plugin carries this same shell and the
		 * FIRST one to activate claims the page; the others register their card into
		 * RELAY_ITEM_SLOT and wait for the winner's declaration through
		 * `slots.inject`. Uninstalling the winner promotes another participant on the
		 * next boot, so no participant is a fixed owner.
		 *
		 * The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
		 * child slot's own registrations (id + `label` + `order`, the same shape the
		 * kernel's own Plugins page uses for its tabs), and each panel dispatches
		 * through `renderSlot(RELAY_ITEM_SLOT, {}, { only: id })`. Every panel stays
		 * mounted but hidden, so a card's local state survives a tab switch.
		 *
		 * Keep the runtime body of this region identical to the one in
		 * `dsh-a6api`'s `src/client/relay-settings-page.js`. Participants own their own
		 * card component, locale dictionaries, settings namespace and Host half — only
		 * the page shell is shared, because cross-plugin value imports are forbidden by
		 * the client bundle purity gate. It needs nothing but `react` on purpose, so
		 * every participant's build configuration compiles it unchanged.
		 */
		/** Page id claimed by the first participating plugin to activate. */
		const RELAY_PAGE_ID = "relay";
		/** Sidebar position of the shared page; own plugins start at 110. */
		const RELAY_PAGE_ORDER = 120;
		/** The page's one child slot: every participant's card registers here. */
		const RELAY_ITEM_SLOT = "relay.settings.item";
		/**
		 * Tab chrome mirrors the kernel's own settings tabs (`.tabs` / `.tab` in
		 * `ui-settings-plugins`): tertiary label, 13px, 22px gutter. The marker is the
		 * ACTIVE TAB'S OWN bottom border and the bar draws no rail of its own — a
		 * shared underline reads as "every tab is selected".
		 */
		const TABLIST_STYLE = {
			display: "flex",
			alignItems: "flex-end",
			gap: "22px",
			marginTop: "2px",
			marginBottom: "16px",
		};
		const TAB_STYLE = {
			appearance: "none",
			background: "transparent",
			// No border on ANY tab: the marker below is the active tab's own element, so
			// an inactive tab has nothing that could render a line.
			border: "none",
			position: "relative",
			padding: "7px 1px 11px",
			cursor: "pointer",
			font: "inherit",
			fontSize: "13px",
			lineHeight: "20px",
			color: "var(--dsw-alias-label-tertiary, inherit)",
		};
		const TAB_ACTIVE_STYLE = Object.assign({}, TAB_STYLE, {
			color: "var(--dsw-alias-label-primary, inherit)",
		});
		/** The kernel's own tab marker: a 2px rounded bar under the active label. */
		const TAB_MARKER_STYLE = {
			position: "absolute",
			left: 0,
			right: 0,
			bottom: 0,
			height: "2px",
			borderRadius: "2px 2px 0 0",
			background: "var(--dsw-alias-label-primary, currentColor)",
		};
		/**
		 * Panels stay mounted (hidden) so each card keeps its local state. `display:
		 * none` is written explicitly because a card's own styles commonly set
		 * `display: flex` while the section's stylesheet loads after this one.
		 */
		const PANEL_STYLE = { margin: 0 };
		const PANEL_HIDDEN_STYLE = { margin: 0, display: "none" };
		/** A registration label is a plain string or a thunk re-read per projection. */
		function readLabel(label) {
			if (typeof label === "function") return label();
			return typeof label === "string" ? label : "";
		}
		/**
		 * Build the live tab roster over the child slot's registrations. `locale` is
		 * read through `ctx.get`: a participant needs it only to re-read localized
		 * labels on a language switch, and reaching an undeclared service as
		 * `ctx.locale` would trip the kernel's inject guard. Every participant passes a
		 * bound translator as its `label` thunk, so the label re-reads the active
		 * language on each projection.
		 *
		 * @param {object} ctx - browser context carrying the slot registry.
		 * @returns {object} the tab store consumed by the page component.
		 */
		function createRelayTabs(ctx) {
			const locale = ctx.get("locale");
			let version = -1;
			let revision = -1;
			let tabs = [];
			return {
				getSnapshot: () => {
					const nextVersion = ctx.slots.getVersion(RELAY_ITEM_SLOT);
					const nextRevision = locale === undefined ? 0 : locale.getSnapshot().revision;
					if (nextVersion === version && nextRevision === revision) return tabs;
					version = nextVersion;
					revision = nextRevision;
					tabs = ctx.slots.entries(RELAY_ITEM_SLOT)
						.map((entry) => ({
							id: entry.options.id ?? "",
							order: entry.options.order ?? 0,
							label: readLabel(entry.options.label),
						}))
						.sort((left, right) => left.order - right.order);
					return tabs;
				},
				subscribe: (listener) => {
					const offSlots = ctx.slots.subscribe(RELAY_ITEM_SLOT, listener);
					const offLocale = locale === undefined ? undefined : locale.subscribe(listener);
					return () => {
						offSlots();
						if (offLocale !== undefined) offLocale();
					};
				},
			};
		}
		/**
		 * Page body: one tab per registered card, plus the selected card's panel.
		 * The shell supplies the section's own seats and `renderSlot` bound to the
		 * child slot declared at registration time.
		 *
		 * @param {object} props - the injected render seat plus the tab roster.
		 * @returns {JSX.Element|null} the page body.
		 */
		function RelaySettingsSection({ renderSlot, relayTabs }) {
			const tabs = react.useSyncExternalStore(
				relayTabs.subscribe,
				relayTabs.getSnapshot,
				relayTabs.getSnapshot,
			);
			const [requested, setRequested] = react.useState(null);
			const selected = requested !== null && tabs.some((tab) => tab.id === requested)
				? requested
				: (tabs.length > 0 ? tabs[0].id : null);
			if (selected === null) return null;
			return react.createElement(
				"div",
				null,
				react.createElement(
					"div",
					{ role: "tablist", style: TABLIST_STYLE },
					tabs.map((tab) => react.createElement(
						"button",
						{
							key: tab.id,
							type: "button",
							role: "tab",
							"aria-selected": tab.id === selected,
							style: tab.id === selected ? TAB_ACTIVE_STYLE : TAB_STYLE,
							onClick: () => { setRequested(tab.id); },
						},
						tab.label,
						tab.id === selected ? react.createElement("span", { style: TAB_MARKER_STYLE, "aria-hidden": true }) : null,
					)),
				),
				tabs.map((tab) => react.createElement(
					"div",
					{
						key: tab.id,
						role: "tabpanel",
						hidden: tab.id !== selected,
						style: tab.id === selected ? PANEL_STYLE : PANEL_HIDDEN_STYLE,
					},
					renderSlot(RELAY_ITEM_SLOT, {}, { only: tab.id }),
				)),
			);
		}
		/** Whether a participant already holds the shared page. */
		function relayPageClaimed(ctx) {
			return ctx.slots.entries("settings.section").some((entry) => entry.options.id === RELAY_PAGE_ID);
		}
		/**
		 * Claim the shared page when no participant holds it yet. Call inside
		 * `ctx.slots.inject('settings.section', …)`: injection order decides the
		 * winner, and the losers stay silent instead of colliding with the kernel's
		 * duplicate-id and duplicate-declaration guards.
		 *
		 * @param {object} ctx - browser context carrying the slot registry.
		 * @param {Function} label - page label of the claiming participant, re-read by
		 * the shell on every projection so a language switch reaches the sidebar too.
		 * @returns {Function} the page registration's disposer, or a no-op when
		 * another participant already holds the page.
		 */
		function claimRelaySettingsPage(ctx, label) {
			if (relayPageClaimed(ctx)) return () => {};
			const relayTabs = createRelayTabs(ctx);
			const children = {};
			children[RELAY_ITEM_SLOT] = { kind: "list", scope: "root" };
			return ctx.slots.register({
				name: "settings.section",
				id: RELAY_PAGE_ID,
				order: RELAY_PAGE_ORDER,
				label,
				inject: () => ({ relayTabs }),
				children,
			}, RelaySettingsSection);
		}
		//#endregion

		//#region plugin
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.agentrouter";
		/**
		 * Settings namespace the Host half registers. Spelled rather than imported:
		 * a browser bundle must not depend on a Host package, so both halves state
		 * the same literal (the Host's is `AGENTROUTER_SETTINGS_NAMESPACE`).
		 */
		const SETTINGS_NS = "llm-agentrouter";
		/** Services this plugin needs from the browser runtime. */
		const inject = ["slots", "locale", "settingsScope"];

		/**
		 * Register the endpoint card inside the shared 「API中转」 page, which this
		 * plugin carries the shell for and claims when it activates first.
		 * @param {object} ctx - the browser plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "llm-agentrouter: dictionaries");
			const t = ctx.locale.bind(NS);
			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
			// The page is shared with dsh-a6api and the kernel cannot declare one page
			// twice, so whichever participant activates first claims it and the other
			// only contributes a card (see the shell region above).
			ctx.slots.inject("settings.section", () =>
				claimRelaySettingsPage(ctx, () => t("pageNav")));
			ctx.slots.inject(RELAY_ITEM_SLOT, () =>
				ctx.slots.register(
					{
						name: RELAY_ITEM_SLOT,
						// id = the Host settings namespace; the shared page filters its
						// panels by this id, so it must be the plugin's own key.
						id: SETTINGS_NS,
						order: 20,
						// Rendered as the card's tab title inside the shared page.
						label: () => t("title"),
						locale: NS,
						inject: () => ({ scope, t }),
					},
					EndpointCard,
				),
			);
		}
		//#endregion

		exports.NS = NS;
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.EndpointCard = EndpointCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

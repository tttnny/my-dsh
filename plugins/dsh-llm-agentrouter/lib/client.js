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
			".dshAr_models{display:flex;flex-direction:column;gap:8px;margin-top:4px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}",
			".dshAr_modelsHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
			".dshAr_modelsHead h4{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}",
			".dshAr_actions{display:flex;gap:8px;flex-wrap:wrap}",
			".dshAr_modelsHead .dshAr_actions{margin-left:auto}",
			".dshAr_button{appearance:none;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}",
			".dshAr_button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}",
			".dshAr_button:disabled{cursor:default;opacity:.5}",
			".dshAr_modelsList{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}",
			".dshAr_model{margin:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3)}",
			".dshAr_modelHead{display:flex;gap:8px;align-items:baseline;cursor:pointer;color:var(--dsw-alias-label-primary);font-size:13px;line-height:19px}",
			".dshAr_modelName{font-weight:600}",
			".dshAr_modelId{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:17px}",
			".dshAr_fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:10px}",
			".dshAr_field{display:flex;flex-direction:column;gap:3px;min-width:0}",
			".dshAr_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:15px}",
			".dshAr_input{min-width:0;padding:4px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px}",
			".dshAr_input:disabled{opacity:.55}",
			".dshAr_inputs{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}",
			".dshAr_toggle{display:flex;gap:5px;align-items:center;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}",
			".dshAr_efforts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px;margin-top:10px}",
			".dshAr_effort{display:flex;gap:6px;align-items:center;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}",
			".dshAr_effortLevel{min-width:38px;color:var(--dsw-alias-label-secondary)}",
			".dshAr_effortWire{flex:1 1 60px}",
			".dshAr_modelActions{display:flex;justify-content:flex-end;margin-top:10px}",
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
			modelsTitle: "模型列表",
			modelsLead: "这条路由当前提供的模型。「更新」向中转站询问它现有的模型 ID，只补入缺失的、不动已有的；参数改完点「保存」才写入，下一个请求即生效。",
			refresh: "更新",
			refreshing: "正在拉取…",
			refreshAdded: "中转站共 %s 个模型，已补入 %s 个新模型。",
			refreshNone: "中转站共 %s 个模型，没有新的。",
			refreshFailed: "更新失败：%s",
			refreshUnavailable: "当前浏览器读不到中转站能力，无法更新。",
			save: "保存",
			saveDone: "已保存，下一个请求即生效。",
			saveConflict: "设置已被其他地方改动，请重新打开本页再改（%s）。",
			saveFailed: "保存失败：%s",
			reset: "重置为内置默认",
			resetDone: "已恢复内置默认列表。",
			addModel: "添加模型",
			removeModel: "删除",
			newModel: "新模型",
			unsaved: "有未保存的改动。",
			readOnlyModels: "当前部署不允许写入设置，模型列表只读。",
			fieldId: "模型 ID",
			fieldName: "显示名",
			fieldContext: "上下文窗口",
			fieldMaxTokens: "最大输出",
			fieldInput: "输入模态",
			fieldEfforts: "推理档位",
			modalityText: "文本",
			modalityImage: "图片",
			wireNone: "留空 = 不发送",
			levelOff: "off",
			levelMinimal: "minimal",
			levelLow: "low",
			levelMedium: "medium",
			levelHigh: "high",
			levelXhigh: "xhigh",
			levelMax: "max",
			invalidEmpty: "至少保留一个模型：列表为空时这条路由没有任何可用模型。",
			invalidId: "第 %s 行的模型 ID 不能为空。",
			invalidDuplicate: "模型 ID 重复：%s",
			invalidNumber: "第 %s 行的「%s」必须是正整数。",
			invalidEffort: "第 %s 行的 %s 档位缺少发给中转站的取值。",
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
			modelsTitle: "Model list",
			modelsLead: "The models this route serves. Update asks the relay which model ids it currently offers and adds only the missing ones; an edit is written when you press Save and applies to the next request.",
			refresh: "Update",
			refreshing: "Fetching…",
			refreshAdded: "The relay lists %s models; %s new one(s) added.",
			refreshNone: "The relay lists %s models; nothing new.",
			refreshFailed: "Update failed: %s",
			refreshUnavailable: "This browser cannot interrogate the relay, so Update is unavailable.",
			save: "Save",
			saveDone: "Saved; the next request uses it.",
			saveConflict: "These settings changed elsewhere; reopen this tab and edit again (%s).",
			saveFailed: "Save failed: %s",
			reset: "Reset to built-in",
			resetDone: "Restored the built-in default list.",
			addModel: "Add model",
			removeModel: "Remove",
			newModel: "New model",
			unsaved: "Unsaved changes.",
			readOnlyModels: "This deployment does not accept settings writes; the model list is read-only.",
			fieldId: "Model id",
			fieldName: "Display name",
			fieldContext: "Context window",
			fieldMaxTokens: "Max output",
			fieldInput: "Input modalities",
			fieldEfforts: "Reasoning levels",
			modalityText: "Text",
			modalityImage: "Image",
			wireNone: "empty = send nothing",
			levelOff: "off",
			levelMinimal: "minimal",
			levelLow: "low",
			levelMedium: "medium",
			levelHigh: "high",
			levelXhigh: "xhigh",
			levelMax: "max",
			invalidEmpty: "Keep at least one model: an empty list leaves this route with nothing to serve.",
			invalidId: "Row %s has no model id.",
			invalidDuplicate: "Duplicate model id: %s",
			invalidNumber: "Row %s: %s must be a positive integer.",
			invalidEffort: "Row %s: the %s level names no wire value.",
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
		 * The relay card: the endpoint radio group over this plugin's own settings
		 * namespace, above the model list the route in `llm-pi-ai` actually serves.
		 *
		 * A choice writes immediately rather than staging behind a Save button. The
		 * namespace has exactly one user-facing field and the write is reversible in
		 * one click, so a staged form would add a step without protecting anything —
		 * and `scope.set` already fences the write with the revision it read. The
		 * two halves are independent: each reads and writes its own namespace, so a
		 * deployment that exposes only one of them still renders the other.
		 *
		 * @param {object} props - the injected scope faces plus the bound translator.
		 * @returns {JSX.Element} the card.
		 */
		function EndpointCard({ scope, t, routeScope, operations }) {
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
					routeScope === undefined ? null : jsx.jsx(ModelList, { routeScope, operations, t }),
				],
			});
		}
		//#endregion

		//#region model list
		/**
		 * The pi-ai settings namespace the relay route is declared in. This plugin's
		 * model list is NOT its own preference: it is the `agentrouter` route's
		 * `models` array, the same data the kernel's Models page edits, which is why
		 * editing it is what changes the model picker. Spelled rather than imported,
		 * for the same reason as SETTINGS_NS in the plugin region below: a browser
		 * bundle must not depend on a Host package.
		 */
		const PI_AI_SETTINGS_NS = "llm-pi-ai";
		/** The route key inside that namespace this plugin owns. */
		const RELAY_ROUTE = "agentrouter";
		/** Reasoning levels a model may offer, in pi-ai's escalation order. */
		const EFFORT_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
		/** Request modalities a model profile may declare. */
		const MODALITIES = ["text", "image"];
		/** Locale key of each modality's label. */
		const MODALITY_LABELS = { text: "modalityText", image: "modalityImage" };
		/**
		 * The parameter set a model discovered by 更新 starts from.
		 *
		 * The relay's listing carries ids only — no capacities — so a discovered row
		 * has nothing to inherit them from and starts from this declaration. A model
		 * already in the list is never re-seeded: its capacities and reasoning
		 * levels stay exactly as they are, because those are the values probed
		 * against the relay rather than generic guesses.
		 */
		const NEW_MODEL = Object.freeze({
			contextWindow: "1048576",
			maxTokens: "131072",
			input: MODALITIES,
		});

		/**
		 * Fill one `%s`-style template with values, in order. Missing values become
		 * empty strings rather than `undefined`, so a diagnostic never renders as
		 * the word.
		 * @param {string} template - the localized template.
		 * @param {string[]} values - replacements for its placeholders.
		 * @returns {string} the filled text.
		 */
		function fill(template, values) {
			let index = 0;
			return template.replace(/%s/g, () => (index < values.length ? values[index++] : ""));
		}

		/**
		 * The `agentrouter` profile out of one resolved (or stored) `llm-pi-ai`
		 * section.
		 * @param {unknown} value - a section's resolved value or raw user layer.
		 * @returns {object|undefined} the profile, when the shape is one.
		 */
		function routeProfile(value) {
			const providers = typeof value === "object" && value !== null ? value.providers : undefined;
			const route = typeof providers === "object" && providers !== null ? providers[RELAY_ROUTE] : undefined;
			return typeof route === "object" && route !== null ? route : undefined;
		}

		/**
		 * The models array inside one resolved `llm-pi-ai` section. The composition
		 * layer is the bundle patch's hand-declared list, so this is what the route
		 * serves whenever the user layer owns nothing.
		 * @param {unknown} value - the resolved section.
		 * @returns {object[]} the declared models, or an empty list.
		 */
		function modelsOf(value) {
			const models = routeProfile(value)?.models;
			return Array.isArray(models) ? models : [];
		}

		/**
		 * Whether the stored user layer owns the route's model list. Presence in the
		 * raw layer is what marks an override — a stored list equal to the
		 * composition's is still an override, so comparing values could not see it.
		 * @param {unknown} user - the raw user layer.
		 * @returns {boolean} whether 重置 has something to remove.
		 */
		function overridesModels(user) {
			return Array.isArray(routeProfile(user)?.models);
		}

		/**
		 * Whether a settings node is a nested dict — the shape a path op leaves
		 * behind when it removes the last key inside one.
		 * @param {unknown} value - a section node.
		 * @returns {boolean} whether it is a record.
		 */
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}

		/**
		 * The ops 重置 sends: the route's model list, plus every ancestor dict that
		 * removal empties. An empty dict is inert — the route resolves exactly as it
		 * did before a list was ever stored — but leaving one behind keeps the route
		 * looking user-owned to the kernel's Models page, and a reset that leaves
		 * litter is not a reset.
		 * @param {unknown} user - the raw user layer the card read.
		 * @returns {object[]} the ordered path ops.
		 */
		function resetOps(user) {
			const ops = [{ op: "unset", path: ["providers", RELAY_ROUTE, "models"] }];
			const providers = isRecord(user) ? user.providers : undefined;
			const route = isRecord(providers) ? providers[RELAY_ROUTE] : undefined;
			// Only an ancestor holding nothing else is removed: a sibling the user
			// set through another surface is never touched.
			if (!isRecord(route) || Object.keys(route).length !== 1) return ops;
			ops.push({ op: "unset", path: ["providers", RELAY_ROUTE] });
			if (isRecord(providers) && Object.keys(providers).length === 1) ops.push({ op: "unset", path: ["providers"] });
			return ops;
		}

		/**
		 * One editable draft row from a resolved model entry. Every field is a
		 * string while it is being edited, so a half-typed number is a legal value
		 * and only the save judges it.
		 * @param {object} model - one resolved model entry.
		 * @returns {object} the draft row.
		 */
		function rowOf(model) {
			const declared = typeof model.reasoningEfforts === "object" && model.reasoningEfforts !== null
				? model.reasoningEfforts
				: {};
			return {
				id: typeof model.id === "string" ? model.id : "",
				name: typeof model.name === "string" ? model.name : "",
				contextWindow: model.contextWindow === undefined ? "" : String(model.contextWindow),
				maxTokens: model.maxTokens === undefined ? "" : String(model.maxTokens),
				input: Array.isArray(model.input) ? MODALITIES.filter((modality) => model.input.includes(modality)) : [],
				efforts: EFFORT_LEVELS.map((level) => {
					const on = Object.prototype.hasOwnProperty.call(declared, level);
					const wire = declared[level];
					return { level, on, wire: typeof wire === "string" ? wire : "" };
				}),
			};
		}

		/** Every draft row for one section's model list. */
		function rowsOf(models) {
			return models.map(rowOf);
		}

		/**
		 * A draft row for a model the relay disclosed: the id it named, over
		 * {@link NEW_MODEL}'s defaults, with every level offered.
		 * @param {string} id - the model id the relay listed.
		 * @returns {object} the draft row.
		 */
		function freshRow(id) {
			return {
				id,
				name: id,
				contextWindow: NEW_MODEL.contextWindow,
				maxTokens: NEW_MODEL.maxTokens,
				input: [...NEW_MODEL.input],
				efforts: EFFORT_LEVELS.map((level) => ({ level, on: true, wire: level === "off" ? "" : level })),
			};
		}

		/**
		 * Serialize one draft row back into a pi-ai model entry. Unset optional
		 * fields are omitted rather than written blank: the Host validates the
		 * payload against the adapter's schema, and an empty string is not a
		 * capacity.
		 *
		 * `off` is the one level allowed to carry no wire value — "supported, send
		 * nothing" — which the schema spells `null`; every other offered level must
		 * name its wire spelling, so an empty one is dropped here and refused by
		 * {@link validateRows} before the write.
		 * @param {object} row - the draft row.
		 * @returns {object} the model entry.
		 */
		function modelOf(row) {
			const model = { id: row.id.trim() };
			const name = row.name.trim();
			if (name !== "") model.name = name;
			if (row.contextWindow.trim() !== "") model.contextWindow = Number(row.contextWindow.trim());
			if (row.maxTokens.trim() !== "") model.maxTokens = Number(row.maxTokens.trim());
			model.input = MODALITIES.filter((modality) => row.input.includes(modality));
			const efforts = {};
			for (const entry of row.efforts) {
				if (!entry.on) continue;
				const wire = entry.wire.trim();
				if (wire === "") {
					if (entry.level === "off") efforts.off = null;
					continue;
				}
				efforts[entry.level] = wire;
			}
			if (Object.keys(efforts).length > 0) model.reasoningEfforts = efforts;
			return model;
		}

		/**
		 * Judge a draft before it reaches the Host, so a refusal names the row the
		 * user must fix instead of surfacing a schema path.
		 * @param {object[]} rows - the draft rows.
		 * @param {Function} t - bound translator, for the field names in a message.
		 * @returns {{key: string, values: string[]}|undefined} the failure, if any.
		 */
		function validateRows(rows, t) {
			if (rows.length === 0) return { key: "invalidEmpty", values: [] };
			const seen = new Set();
			const capacities = [["contextWindow", "fieldContext"], ["maxTokens", "fieldMaxTokens"]];
			for (let index = 0; index < rows.length; index += 1) {
				const row = rows[index];
				const where = String(index + 1);
				const id = row.id.trim();
				if (id === "") return { key: "invalidId", values: [where] };
				if (seen.has(id)) return { key: "invalidDuplicate", values: [id] };
				seen.add(id);
				for (const [field, label] of capacities) {
					const value = row[field].trim();
					if (value !== "" && !/^\d+$/.test(value)) {
						return { key: "invalidNumber", values: [where, t(label)] };
					}
				}
				for (const entry of row.efforts) {
					if (!entry.on || entry.level === "off") continue;
					if (entry.wire.trim() === "") return { key: "invalidEffort", values: [where, entry.level] };
				}
			}
			return undefined;
		}

		/**
		 * One draft row: a collapsible entry carrying the id and display name, the
		 * two capacities, the modalities the model accepts, and one line per
		 * reasoning level — offered or not, and with which wire spelling.
		 *
		 * @param {object} props - the row, its index, and the handlers that change it.
		 * @returns {JSX.Element} the row.
		 */
		function ModelRow({ row, index, readOnly, onPatch, onEffort, onRemove, t }) {
			const field = (name, label) => jsx.jsxs(
				"label",
				{
					className: "dshAr_field",
					children: [
						jsx.jsx("span", { className: "dshAr_fieldLabel", children: t(label) }),
						jsx.jsx("input", {
							className: "dshAr_input",
							type: "text",
							value: row[name],
							disabled: readOnly,
							"data-model": String(index),
							"data-field": name,
							onChange: (event) => onPatch(index, { [name]: event.target.value }),
						}),
					],
				},
				name,
			);
			return jsx.jsxs(
				"li",
				{
					className: "dshAr_model",
					"data-model-id": row.id,
					"data-model-index": String(index),
					children: [
						jsx.jsxs("details", {
							children: [
								jsx.jsxs("summary", {
									className: "dshAr_modelHead",
									children: [
										jsx.jsx("span", {
											className: "dshAr_modelName",
											children: row.name.trim() !== "" ? row.name : (row.id.trim() !== "" ? row.id : t("newModel")),
										}),
										jsx.jsx("span", { className: "dshAr_modelId", children: row.id }),
									],
								}),
								jsx.jsxs("div", {
									className: "dshAr_fields",
									children: [
										field("id", "fieldId"),
										field("name", "fieldName"),
										field("contextWindow", "fieldContext"),
										field("maxTokens", "fieldMaxTokens"),
									],
								}),
								jsx.jsxs("div", {
									className: "dshAr_inputs",
									children: [
										jsx.jsx("span", { className: "dshAr_fieldLabel", children: t("fieldInput") }),
										...MODALITIES.map((modality) => jsx.jsxs(
											"label",
											{
												className: "dshAr_toggle",
												children: [
													jsx.jsx("input", {
														type: "checkbox",
														checked: row.input.includes(modality),
														disabled: readOnly,
														"data-model": String(index),
														"data-modality": modality,
														onChange: () => onPatch(index, {
															input: row.input.includes(modality)
																? row.input.filter((entry) => entry !== modality)
																: [...row.input, modality],
														}),
													}),
													jsx.jsx("span", { children: t(MODALITY_LABELS[modality]) }),
												],
											},
											modality,
										)),
									],
								}),
								jsx.jsxs("div", {
									className: "dshAr_efforts",
									"data-field": "reasoningEfforts",
									children: EFFORT_LEVELS.map((level) => {
										const entry = row.efforts.find((candidate) => candidate.level === level)
											?? { level, on: false, wire: "" };
										return jsx.jsxs(
											"label",
											{
												className: "dshAr_effort",
												"data-level": level,
												children: [
													jsx.jsx("input", {
														type: "checkbox",
														checked: entry.on,
														disabled: readOnly,
														"data-model": String(index),
														"data-effort": level,
														onChange: () => onEffort(index, level, { on: !entry.on }),
													}),
													jsx.jsx("span", {
														className: "dshAr_effortLevel",
														children: t("level" + level.charAt(0).toUpperCase() + level.slice(1)),
													}),
													jsx.jsx("input", {
														className: "dshAr_input dshAr_effortWire",
														type: "text",
														value: entry.wire,
														placeholder: level === "off" ? t("wireNone") : level,
														disabled: readOnly || !entry.on,
														"data-model": String(index),
														"data-wire": level,
														onChange: (event) => onEffort(index, level, { wire: event.target.value }),
													}),
												],
											},
											level,
										);
									}),
								}),
								jsx.jsx("div", {
									className: "dshAr_modelActions",
									children: jsx.jsx("button", {
										type: "button",
										className: "dshAr_button",
										"data-action": "remove",
										disabled: readOnly,
										onClick: () => onRemove(index),
										children: t("removeModel"),
									}),
								}),
							],
						}),
					],
				},
				index,
			);
		}

		/**
		 * Store faces for a caller that injects no Host operations — an older Host,
		 * or a test rendering this component directly.
		 */
		const NO_OPERATIONS_STORE = { subscribe: () => () => {}, snapshot: () => 0 };

		/**
		 * The relay's model list: one editable row per model the `agentrouter` route
		 * serves, the 更新 action that asks the relay what it currently offers, and
		 * the write that puts the result back on the route.
		 *
		 * Reads come from the shared settings mirror through the scope bound to
		 * `llm-pi-ai`, so the card and the kernel's Models page can never disagree
		 * about the route. Writes go through the Remote call the operations were
		 * built with, NOT through `scope.set`: the mirror's write path reports a
		 * refusal by silently reloading, while this card has to show the Host's own
		 * diagnostic — a stale revision, or a payload the adapter's schema refused.
		 *
		 * An edit lives in this component until 保存; 重置 drops the draft and, when
		 * the user layer owns the list, removes that override so the composition's
		 * hand-declared list serves again.
		 *
		 * @param {object} props - the route scope, the Host operations, and `t`.
		 * @returns {JSX.Element} the model list.
		 */
		function ModelList({ routeScope, operations, t }) {
			const snapshot = react.useSyncExternalStore(
				react.useCallback((listener) => routeScope.subscribe(listener), [routeScope]),
				() => routeScope.getSnapshot(),
			);
			const ops = operations ?? {};
			// The optional Remote faces mount after this plugin activates, so the
			// capability is re-read on every one of their announcements instead of
			// being frozen at the first render.
			const store = typeof ops.subscribe === "function" && typeof ops.snapshot === "function"
				? ops
				: NO_OPERATIONS_STORE;
			react.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
			const [draft, setDraft] = react.useState(null);
			const [busy, setBusy] = react.useState(null);
			const [status, setStatus] = react.useState(null);

			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const canWrite = typeof ops.write === "function";
			const canProbe = typeof ops.available === "function"
				? ops.available() === true
				: typeof ops.discover === "function";
			const rows = draft !== null ? draft.rows : rowsOf(modelsOf(snapshot.value));
			const overridden = overridesModels(snapshot.user);
			const readOnly = !writable || !canWrite || busy !== null;

			/**
			 * Stage one change as a draft. The first edit captures the namespace
			 * revision it was opened at, which is the fence the save carries, so a
			 * concurrent write elsewhere is refused instead of overwritten.
			 * @param {Function} change - rows in, next rows out.
			 */
			const edit = (change) => {
				setDraft((current) => {
					const base = current ?? { rows: rowsOf(modelsOf(snapshot.value)), revision: snapshot.revision };
					return { rows: change(base.rows), revision: base.revision };
				});
				setStatus({ kind: "info", key: "unsaved", values: [] });
			};
			const patchRow = (index, fields) => edit((list) => list.map(
				(row, at) => (at === index ? { ...row, ...fields } : row),
			));
			const patchEffort = (index, level, fields) => edit((list) => list.map((row, at) => {
				if (at !== index) return row;
				return {
					...row,
					efforts: row.efforts.map((entry) => (entry.level === level ? { ...entry, ...fields } : entry)),
				};
			}));
			const addRow = () => edit((list) => [...list, freshRow("")]);
			const removeRow = (index) => edit((list) => list.filter((row, at) => at !== index));
			const fail = (key, values) => setStatus({ kind: "error", key, values });
			const reasonOf = (error) => (error instanceof Error ? error.message : String(error));

			/** Ask the relay what it serves, and stage what is not in the list yet. */
			const refresh = () => {
				if (!canProbe || typeof ops.discover !== "function" || readOnly) return;
				const profile = routeProfile(snapshot.value);
				const baseURL = typeof profile?.baseURL === "string" ? profile.baseURL : "";
				if (baseURL === "") {
					fail("refreshFailed", [t("refreshUnavailable")]);
					return;
				}
				const request = { provider: RELAY_ROUTE, baseURL };
				if (typeof profile.api === "string") request.api = profile.api;
				setBusy("refresh");
				setStatus({ kind: "info", key: "refreshing", values: [] });
				Promise.resolve()
					.then(() => ops.discover(request))
					.then((outcome) => {
						if (!outcome.ok) {
							fail("refreshFailed", [outcome.message]);
							return;
						}
						// Merge, never replace: a discovered id that is already listed keeps
						// every hand-tuned parameter, and a local model the relay no longer
						// lists is left alone rather than silently dropped.
						const current = draft !== null ? draft.rows : rowsOf(modelsOf(snapshot.value));
						const known = new Set(current.map((row) => row.id.trim()));
						const added = [];
						for (const model of outcome.models) {
							const id = typeof model?.id === "string" ? model.id.trim() : "";
							if (id === "" || known.has(id)) continue;
							known.add(id);
							added.push(freshRow(id));
						}
						if (added.length > 0) {
							setDraft({
								rows: [...current, ...added],
								revision: draft !== null ? draft.revision : snapshot.revision,
							});
						}
						setStatus({
							kind: "info",
							key: added.length > 0 ? "refreshAdded" : "refreshNone",
							values: added.length > 0
								? [String(outcome.models.length), String(added.length)]
								: [String(outcome.models.length)],
						});
					}, (error) => fail("refreshFailed", [reasonOf(error)]))
					.then(() => setBusy(null));
			};

			/** Write the drafted list onto the route's own `models` key. */
			const save = () => {
				if (draft === null || !canWrite || readOnly) return;
				const failure = validateRows(draft.rows, t);
				if (failure !== undefined) {
					setStatus({ kind: "error", key: failure.key, values: failure.values });
					return;
				}
				const ops_ = [{
					op: "set",
					path: ["providers", RELAY_ROUTE, "models"],
					value: draft.rows.map(modelOf),
				}];
				setBusy("save");
				Promise.resolve()
					.then(() => ops.write(ops_, draft.revision))
					.then((outcome) => {
						if (!outcome.ok) {
							fail(outcome.code === "settings/conflict" ? "saveConflict" : "saveFailed", [outcome.message]);
							return;
						}
						setDraft(null);
						setStatus({ kind: "info", key: "saveDone", values: [] });
					}, (error) => fail("saveFailed", [reasonOf(error)]))
					.then(() => setBusy(null));
			};

			/** Drop the draft; with a user-owned list, remove that override too. */
			const reset = () => {
				if (readOnly) return;
				if (!overridden) {
					setDraft(null);
					setStatus({ kind: "info", key: "resetDone", values: [] });
					return;
				}
				if (!canWrite) return;
				setBusy("reset");
				Promise.resolve()
					.then(() => ops.write(resetOps(snapshot.user), snapshot.revision))
					.then((outcome) => {
						if (!outcome.ok) {
							fail(outcome.code === "settings/conflict" ? "saveConflict" : "saveFailed", [outcome.message]);
							return;
						}
						setDraft(null);
						setStatus({ kind: "info", key: "resetDone", values: [] });
					}, (error) => fail("saveFailed", [reasonOf(error)]))
					.then(() => setBusy(null));
			};

			const shown = status === null
				? { kind: "info", text: "" }
				: { kind: status.kind, text: fill(t(status.key), status.values) };
			const action = (name, label, disabled, onClick) => jsx.jsx("button", {
				type: "button",
				className: "dshAr_button",
				"data-action": name,
				disabled,
				onClick,
				children: label,
			});
			const hint = !writable
				? t("readOnlyModels")
				: (canProbe ? "" : t("refreshUnavailable"));

			return jsx.jsxs("section", {
				className: "dshAr_models",
				"data-model-list": RELAY_ROUTE,
				"aria-busy": busy !== null,
				children: [
					jsx.jsxs("div", {
						className: "dshAr_modelsHead",
						children: [
							jsx.jsx("h4", { children: t("modelsTitle") }),
							jsx.jsxs("div", {
								className: "dshAr_actions",
								children: [
									action("refresh", busy === "refresh" ? t("refreshing") : t("refresh"), readOnly || !canProbe, refresh),
									action("reset", t("reset"), readOnly || (draft === null && !overridden), reset),
									action("save", busy === "save" ? t("saving") : t("save"), readOnly || draft === null, save),
								],
							}),
						],
					}),
					jsx.jsx("p", { className: "dshAr_lead", children: t("modelsLead") }),
					jsx.jsxs("ul", {
						className: "dshAr_modelsList",
						children: rows.map((row, index) => jsx.jsx(ModelRow, {
							row,
							index,
							readOnly,
							onPatch: patchRow,
							onEffort: patchEffort,
							onRemove: removeRow,
							t,
						}, index)),
					}),
					jsx.jsx("div", {
						className: "dshAr_actions",
						children: action("add", t("addModel"), readOnly, addRow),
					}),
					jsx.jsx("p", {
						className: "dshAr_status",
						"data-kind": shown.kind,
						role: shown.kind === "error" ? "alert" : "status",
						children: shown.text,
					}),
					hint === "" ? null : jsx.jsx("p", { className: "dshAr_lead", children: hint }),
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
			// The model list is not this plugin's own section: it is the `agentrouter`
			// route inside the adapter's namespace, the same document the kernel's
			// Models page edits, so the card derives from that namespace's mirror.
			const routeScope = ctx.settingsScope.bind({ namespace: PI_AI_SETTINGS_NS });
			// Both Host faces are OPTIONAL reads: a deployment whose Client assembly
			// mounts neither still shows the endpoint switch, and the model list
			// degrades to read-only with the reason rendered instead of going blank.
			//
			// They are resolved per call rather than captured: the Remote namespaces
			// install asynchronously after this plugin activates, so a face captured
			// here could read as absent for the whole session. `ctx.inject`
			// re-announces every mount, and the store below turns that into the
			// re-render that re-reads the capability.
			let version = 0;
			const waiting = new Set();
			const announce = () => {
				version += 1;
				for (const listener of [...waiting]) listener();
			};
			const remoteOf = (name) => ctx.get(name);
			const operations = {
				available: () => remoteOf("remote.llm") !== undefined,
				subscribe: (listener) => {
					waiting.add(listener);
					return () => {
						waiting.delete(listener);
					};
				},
				snapshot: () => version,
				discover: (request) => {
					const llm = remoteOf("remote.llm");
					if (llm === undefined) return Promise.resolve({ ok: false, message: t("refreshUnavailable") });
					return llm.discoverModels(PI_AI_SETTINGS_NS, request).then(
						(response) => (response.ok
							? { ok: true, models: response.value }
							: { ok: false, message: response.error.message }),
						(error) => ({ ok: false, message: error instanceof Error ? error.message : String(error) }),
					);
				},
				write: (ops, revision) => {
					const settings = remoteOf("remote.settings");
					if (settings === undefined) {
						return Promise.resolve({ ok: false, code: "settings/unavailable", message: t("readOnlyModels") });
					}
					return settings.mutate(PI_AI_SETTINGS_NS, ops, revision).then(
						(response) => (response.ok
							? { ok: true, revision: response.value.revision }
							: { ok: false, code: response.error.code, message: response.error.message }),
						(error) => ({ ok: false, code: "settings/failed", message: error instanceof Error ? error.message : String(error) }),
					);
				},
			};
			// Announced per face rather than as one dependency set: a deployment that
			// mounts only one of them must still let the card observe it.
			ctx.inject(["remote.llm"], () => {
				announce();
			});
			ctx.inject(["remote.settings"], () => {
				announce();
			});
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
						inject: () => ({ scope, t, routeScope, operations }),
					},
					EndpointCard,
				),
			);
		}
		//#endregion

		exports.NS = NS;
		exports.SETTINGS_NS = SETTINGS_NS;
		exports.EndpointCard = EndpointCard;
		exports.ModelList = ModelList;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

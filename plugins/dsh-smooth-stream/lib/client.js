window.__ModuleLoader__.load({
	id: "@lynn123411/dsh-smooth-stream",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react_dom = require("react-dom");
		//#region \0dsh-css:/Users/tny/Desktop/work/my-dsh/plugins/dsh-smooth-stream/src/client/TypewriterAssistantNodeView.module.css.mjs
		const css$3 = "._07evbq_root{min-width:0;color:var(--dsw-alias-label-primary);flex-direction:column;font-size:16px;line-height:28px;display:flex}._07evbq_body{flex-direction:column;gap:16px;min-width:0;display:flex}._07evbq_think{flex-direction:column;display:flex}._07evbq_thinkRow{position:relative;overflow:hidden}._07evbq_think[data-state=running] ._07evbq_thinkRow:after{content:\"\";inset-block:0;background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite _07evbq_dsh-smooth-stream-think-sweep;position:absolute;left:0}@keyframes _07evbq_dsh-smooth-stream-think-sweep{0%{left:-300px}90%,to{left:100%}}._07evbq_thinkLeading{flex-shrink:0}._07evbq_thinkChevron{color:var(--dsw-alias-label-secondary)}._07evbq_thinkTitle{font-weight:400}._07evbq_thinkSeparator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}._07evbq_thinkSummary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:14px;line-height:24px;overflow:hidden}._07evbq_thinkSummary[data-follow-end]{text-overflow:clip}._07evbq_thinkBody{color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;word-break:break-word;padding:4px 0 4px 22px;font-size:14px;line-height:24px}._07evbq_disclosureRoot{flex-direction:column;width:100%;min-width:0;display:flex}._07evbq_disclosureRow{cursor:pointer;align-items:center;min-width:0;height:24px;display:flex;position:relative;overflow:hidden}._07evbq_disclosureLeading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex;position:relative}._07evbq_disclosureIconIdle{opacity:1;transition:opacity .1s;display:inline-flex}._07evbq_disclosureChevronHover{opacity:0;margin:auto;transition:opacity .1s;position:absolute;inset:0}._07evbq_disclosureRow:hover ._07evbq_disclosureIconIdle{opacity:0}._07evbq_disclosureRow:hover ._07evbq_disclosureChevronHover{opacity:1}._07evbq_disclosureTitle{color:var(--dsw-alias-label-secondary);flex:none;font-size:14px;line-height:24px}._07evbq_disclosureContent{visibility:visible;transition:grid-template-rows var(--ds-transition-duration,.2s) var(--ds-ease-in-out,cubic-bezier(.4, 0, .2, 1)), visibility 0s;grid-template-rows:1fr;display:grid}._07evbq_disclosureContent[data-collapsed]{visibility:hidden;transition:grid-template-rows var(--ds-transition-duration,.2s) var(--ds-ease-in-out,cubic-bezier(.4, 0, .2, 1)), visibility 0s var(--ds-transition-duration,.2s);grid-template-rows:0fr}._07evbq_disclosureContent[data-no-transition]{transition:none}._07evbq_disclosureContent>*{min-height:0;overflow:hidden}@media (prefers-reduced-motion:reduce){._07evbq_think[data-state=running] ._07evbq_thinkRow:after{animation:none}._07evbq_disclosureContent,._07evbq_disclosureContent[data-collapsed]{transition:none}}._07evbq_stopped{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}._07evbq_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}._07evbq_follow{contain:layout style;min-width:0}._07evbq_root :not(pre)>code{line-height:inherit;white-space:normal;overflow-wrap:anywhere;vertical-align:baseline;display:inline}@supports (text-box-trim:trim-both){._07evbq_root :is(p,h1,h2,h3,h4,h5,h6,blockquote){text-box-trim:trim-both;text-box-edge:text}}";
		const tagId$3 = "@lynn123411/dsh-smooth-stream/TypewriterAssistantNodeView.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "@lynn123411/dsh-smooth-stream";
				tag.dataset.pluginCss = tagId$3;
				document.head.appendChild(tag);
			}
			tag.textContent = css$3;
		}
		var TypewriterAssistantNodeView_module_css_default = {
			"disclosureContent": "_07evbq_disclosureContent",
			"thinkLeading": "_07evbq_thinkLeading",
			"thinkSummary": "_07evbq_thinkSummary",
			"disclosureRoot": "_07evbq_disclosureRoot",
			"disclosureChevronHover": "_07evbq_disclosureChevronHover",
			"disclosureTitle": "_07evbq_disclosureTitle",
			"thinkTitle": "_07evbq_thinkTitle",
			"dsh-smooth-stream-think-sweep": "_07evbq_dsh-smooth-stream-think-sweep",
			"thinkBody": "_07evbq_thinkBody",
			"disclosureRow": "_07evbq_disclosureRow",
			"root": "_07evbq_root",
			"think": "_07evbq_think",
			"thinkRow": "_07evbq_thinkRow",
			"thinkSeparator": "_07evbq_thinkSeparator",
			"disclosureLeading": "_07evbq_disclosureLeading",
			"disclosureIconIdle": "_07evbq_disclosureIconIdle",
			"stopped": "_07evbq_stopped",
			"body": "_07evbq_body",
			"thinkChevron": "_07evbq_thinkChevron",
			"follow": "_07evbq_follow",
			"visuallyHidden": "_07evbq_visuallyHidden"
		};
		//#endregion
		//#region src/client/AnimatedDisclosure.tsx
		/** Class-name join for optional overlay classes over the chrome defaults. */
		function cx(...parts) {
			return parts.filter((part) => part !== void 0 && part !== "").join(" ");
		}
		/**
		* Render one disclosure header whose expanded body is height-animated.
		* @param props - Visual content, controlled open state, and the toggle
		* callback fired by row click and Enter/Space.
		* @returns the animated disclosure row.
		*/
		function AnimatedDisclosure({ icon, title, open, onToggle, collapsedContent, children, rowClassName, leadingClassName, titleClassName, chevronClassName, bodyTransition = true }) {
			const toggleFromKeyboard = (event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				onToggle();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TypewriterAssistantNodeView_module_css_default.disclosureRoot,
				"data-open": open || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: cx(TypewriterAssistantNodeView_module_css_default.disclosureRow, rowClassName),
					"data-disclosure-row": true,
					"data-expandable": "",
					role: "button",
					tabIndex: 0,
					"aria-expanded": open,
					onClick: onToggle,
					onKeyDown: toggleFromKeyboard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cx(TypewriterAssistantNodeView_module_css_default.disclosureLeading, leadingClassName),
							children: open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: chevronClassName }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: TypewriterAssistantNodeView_module_css_default.disclosureIconIdle,
								children: icon
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: cx(chevronClassName, TypewriterAssistantNodeView_module_css_default.disclosureChevronHover) })] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: cx(TypewriterAssistantNodeView_module_css_default.disclosureTitle, titleClassName),
							children: title
						}),
						!open && collapsedContent
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: TypewriterAssistantNodeView_module_css_default.disclosureContent,
					"data-disclosure-content": true,
					"data-collapsed": open ? void 0 : "",
					"data-no-transition": bodyTransition ? void 0 : "",
					children
				})]
			});
		}
		//#endregion
		//#region src/settings.ts
		/**
		* User-owned settings for the smooth-stream plugin, exposed to the Host
		* settings service and edited from the Web Settings "plugin configuration"
		* page. This is the runtime-editable complement to {@link StreamConfig}: that
		* contract is composed at load and bridged once through the boot global, while
		* these preferences live in the durable user-settings document and take effect
		* live.
		*/
		/**
		* Settings namespace registered by the Host and bound in the browser through
		* the native `settingsScope` service. It is also the key this plugin's card
		* registers under in the `settings.plugin.item` slot.
		*/
		const STREAM_SETTINGS_NS = "lynn-smooth-stream";
		/** Defaults preserve the production engine exactly. */
		const DEFAULT_STREAM_DEBUG_TUNING = {
			revealScale: 1,
			queuePressure: .85,
			maxRevealCps: 600,
			springStiffness: 130,
			springDamping: 24,
			springMass: 1,
			runwayPx: 72,
			reserveResponseMs: 180,
			backpressureMinScale: .55
		};
		/** Defaults shared by the Host schema and the client-side fallback. */
		const DEFAULT_STREAM_SETTINGS = {
			enabled: true,
			controlScroll: true,
			motionPreference: "auto",
			thinkAutoExpand: true,
			debugEnabled: false,
			debugTuning: DEFAULT_STREAM_DEBUG_TUNING
		};
		//#endregion
		//#region src/client/clientStore.ts
		/**
		* Snapshot store engine.
		*
		* DSH 0.1.5-rc.1 seeds `@deepseek-ai/dsh-client-store` directly into the web
		* shell's static module table, so this fork imports it statically. The runtime
		* probe this file used to carry existed only for kernels on either side of the
		* 0.1.2 split (`dsh-client-runtime` no longer publishes past 0.1.1-rc.2); a
		* single-kernel fork does not need it.
		*/
		const createSnapshotStore = _deepseek_ai_dsh_client_store.createSnapshotStore;
		//#endregion
		//#region src/client/debugRuntime.ts
		/**
		* Shared browser-side diagnostics state.
		*
		* The settings card owns persistence. This module is the live bridge used by
		* the renderer and the chat-side panel: renderer loops publish measurements,
		* while panel edits are staged through the settings-card controller.
		*/
		const EMPTY_METRICS = {
			fps: null,
			frameMs: null,
			fpsDegraded: false,
			streamActive: false,
			streamBacklog: 0,
			streamSpeedCps: 0,
			streamTargetChars: 0,
			streamDisplayedChars: 0,
			followActive: false,
			followLagPx: 0,
			followVelocityPxPerSec: 0,
			followReservePx: 0,
			followCapacityPx: 0,
			followRevealScale: 1,
			followFollowing: false,
			followConstrained: false,
			scrollTop: null,
			scrollHeight: null,
			clientHeight: null,
			lastUpdatedMs: null
		};
		const INITIAL_STATE = {
			available: false,
			enabled: false,
			writable: false,
			dirty: false,
			status: "loading",
			tuning: { ...DEFAULT_STREAM_DEBUG_TUNING },
			metrics: EMPTY_METRICS
		};
		const store = createSnapshotStore(INITIAL_STATE);
		const streamMetrics = /* @__PURE__ */ new Map();
		const followMetrics = /* @__PURE__ */ new Map();
		let actions;
		let lastMetricPublish = 0;
		function resetMetrics() {
			streamMetrics.clear();
			followMetrics.clear();
			lastMetricPublish = 0;
		}
		function resetRuntime() {
			actions = void 0;
			resetMetrics();
			store.set({
				...INITIAL_STATE,
				metrics: EMPTY_METRICS
			});
		}
		function now() {
			return typeof performance === "undefined" ? Date.now() : performance.now();
		}
		function sameTuning(left, right) {
			return left.revealScale === right.revealScale && left.queuePressure === right.queuePressure && left.maxRevealCps === right.maxRevealCps && left.springStiffness === right.springStiffness && left.springDamping === right.springDamping && left.springMass === right.springMass && left.runwayPx === right.runwayPx && left.reserveResponseMs === right.reserveResponseMs && left.backpressureMinScale === right.backpressureMinScale;
		}
		function currentMetrics(timestamp) {
			let stream;
			for (const candidate of streamMetrics.values()) if (stream === void 0 || candidate.updatedAt > stream.updatedAt) stream = candidate;
			let follow;
			for (const candidate of followMetrics.values()) if (follow === void 0 || candidate.updatedAt > follow.updatedAt) follow = candidate;
			return {
				fps: store.getSnapshot().metrics.fps,
				frameMs: store.getSnapshot().metrics.frameMs,
				fpsDegraded: store.getSnapshot().metrics.fpsDegraded,
				streamActive: stream?.active ?? false,
				streamBacklog: stream?.backlog ?? 0,
				streamSpeedCps: stream?.speedCps ?? 0,
				streamTargetChars: stream?.targetChars ?? 0,
				streamDisplayedChars: stream?.displayedChars ?? 0,
				followActive: follow?.active ?? false,
				followLagPx: follow?.lagPx ?? 0,
				followVelocityPxPerSec: follow?.velocityPxPerSec ?? 0,
				followReservePx: follow?.reservePx ?? 0,
				followCapacityPx: follow?.capacityPx ?? 0,
				followRevealScale: follow?.revealScale ?? 1,
				followFollowing: follow?.following ?? false,
				followConstrained: follow?.constrained ?? false,
				scrollTop: follow?.scrollTop ?? null,
				scrollHeight: follow?.scrollHeight ?? null,
				clientHeight: follow?.clientHeight ?? null,
				lastUpdatedMs: timestamp
			};
		}
		function publishMetrics(force = false) {
			const timestamp = now();
			if (!force && timestamp - lastMetricPublish < 80) return;
			lastMetricPublish = timestamp;
			store.set({
				...store.getSnapshot(),
				metrics: currentMetrics(timestamp)
			});
		}
		const debugRuntime = {
			store,
			getSnapshot() {
				return store.getSnapshot();
			},
			subscribe(listener) {
				return store.subscribe(listener);
			},
			/** Whether hot-path instrumentation should do any work. */
			isEnabled() {
				return store.getSnapshot().enabled;
			},
			tuning() {
				return store.getSnapshot().tuning;
			},
			/** Production values remain untouched until the user explicitly enables diagnostics. */
			activeTuning() {
				return store.getSnapshot().enabled ? store.getSnapshot().tuning : DEFAULT_STREAM_DEBUG_TUNING;
			},
			bindSettings(nextActions) {
				actions = nextActions;
				return () => {
					if (actions !== nextActions) return;
					resetRuntime();
				};
			},
			syncSettings(input) {
				const current = store.getSnapshot();
				const available = input.available ?? true;
				const enabled = available && input.enabled;
				const availabilityChanged = current.available !== available;
				const enabledChanged = current.enabled !== enabled;
				if (availabilityChanged || enabledChanged) resetMetrics();
				const tuning = input.tuning === void 0 ? current.tuning : {
					...DEFAULT_STREAM_DEBUG_TUNING,
					...input.tuning
				};
				if (current.available === available && current.enabled === enabled && current.writable === input.writable && current.dirty === input.dirty && current.status === input.status && sameTuning(current.tuning, tuning)) return;
				store.set({
					...current,
					available,
					enabled,
					writable: input.writable,
					dirty: input.dirty,
					status: input.status,
					tuning,
					metrics: availabilityChanged || enabledChanged || !enabled ? EMPTY_METRICS : current.metrics
				});
			},
			edit(patch) {
				const current = store.getSnapshot();
				const enabled = patch.debugEnabled ?? current.enabled;
				const enabledChanged = current.enabled !== enabled;
				if (enabledChanged) resetMetrics();
				const tuning = patch.debugTuning === void 0 ? current.tuning : {
					...current.tuning,
					...patch.debugTuning
				};
				store.set({
					...current,
					enabled,
					dirty: true,
					tuning,
					metrics: enabledChanged || !enabled ? EMPTY_METRICS : current.metrics
				});
				actions?.edit({
					...patch.debugEnabled === void 0 ? {} : { debugEnabled: patch.debugEnabled },
					...patch.debugTuning === void 0 ? {} : { debugTuning: tuning }
				});
			},
			save() {
				actions?.save();
			},
			discard() {
				actions?.discard();
			},
			reset() {
				this.edit({ debugTuning: { ...DEFAULT_STREAM_DEBUG_TUNING } });
			},
			reportStream(id, metric) {
				if (!this.isEnabled()) return;
				if (metric === null) streamMetrics.delete(id);
				else streamMetrics.set(id, {
					...metric,
					updatedAt: now()
				});
				publishMetrics(metric === null);
			},
			reportFollow(port, metric) {
				if (!this.isEnabled()) return;
				if (metric === null) followMetrics.delete(port);
				else followMetrics.set(port, {
					...metric,
					updatedAt: now()
				});
				publishMetrics(metric === null);
			},
			reportFps(fps, frameMs, degraded) {
				if (!this.isEnabled()) return;
				const current = store.getSnapshot();
				store.set({
					...current,
					metrics: {
						...current.metrics,
						fps,
						frameMs,
						fpsDegraded: degraded,
						lastUpdatedMs: now()
					}
				});
			},
			clearFps() {
				if (!this.isEnabled()) return;
				const current = store.getSnapshot();
				store.set({
					...current,
					metrics: {
						...current.metrics,
						fps: null,
						frameMs: null,
						fpsDegraded: false,
						lastUpdatedMs: now()
					}
				});
			},
			panelFace() {
				return {
					hooks: { debugRuntime: store },
					edit: (patch) => {
						this.edit(patch);
					},
					save: () => {
						this.save();
					},
					discard: () => {
						this.discard();
					},
					reset: () => {
						this.reset();
					}
				};
			},
			resetRuntime() {
				resetRuntime();
			}
		};
		//#endregion
		//#region src/client/teleprompterGlide.ts
		/**
		* Conversation-port follow while an assistant reply streams.
		*
		* A sub-stepped spring physics engine drives a float `animatedH`, rather
		* than restarting native smooth-scroll animations as every glyph lands.
		* Remaining lag rides a small compositor transform while the real scrollport
		* stays at its floor. The transform is bounded by the measured paint gap
		* before conversation chrome. This follower:
		*
		* - marks programmatic writes via `data-follow-owned` for compatible hosts;
		* - sets `overflow-anchor: none` so CSS scroll-anchoring does not snap;
		* - restores `animatedH` in a ResizeObserver (before paint) so a layout
		*   pass cannot flash a snapped frame;
		* - expresses safe lag as a compositor transform on message rows;
		* - opens a speed-adaptive layout runway before fast output wraps, preserving
		*   the reference spring constants at every reveal speed;
		* - catches up any lag that cannot fit before turn status / composer chrome,
		*   so fixed chrome never has to counter-shift and the host stays at-bottom;
		* - never clips or overlays streamed text.
		*
		* A real reader gesture receives the effective visual position before the
		* transform clears. Lifecycle completion instead settles at the floor.
		*
		* Directional wheel/touch intent unpins immediately; pointer/key input falls
		* back to an upward scroll delta from the engine's own written position. A
		* reader release re-acquires only after returning to the real floor.
		*/
		/**
		* Programmatic follow marker retained for hosts that recognize external
		* scroll ownership. Current Harness also sees the write land at the floor.
		*/
		const FOLLOW_OWNED_ATTR = "data-follow-owned";
		/**
		* Duration of completion runway retirement. The final pad is visible motion:
		* its shrinking floor brings the transcript down to its natural resting
		* position. 1.5s keeps the default 72px runway at 48px/s (0.8px per 60Hz
		* frame), matching the configured default reading-follow velocity instead of
		* the old 160ms / 450px/s staircase that looked like repeated completion
		* jumps.
		*/
		const FOLLOW_RUNWAY_RETIRE_MS = 1500;
		/** Runway size emitted by bundles before the 72px predictive runway. */
		const LEGACY_RUNWAY_PX = 48;
		/** Safe-lag occupancy band over which reveal pressure is progressively reduced. */
		const FOLLOW_BACKPRESSURE_START_RATIO = .1;
		/** Effective-scroll acceleration budget, in px/ms². */
		const FOLLOW_TRAJECTORY_ACCELERATION = 22e-5;
		const GESTURE_EVENTS = [
			"wheel",
			"touchstart",
			"touchmove",
			"touchend",
			"touchcancel",
			"pointerdown",
			"keydown"
		];
		/** Visible runway needed for the current reveal pressure. */
		function computeFollowReserve(speedCps, runwayPx = 72) {
			const available = Math.max(0, runwayPx);
			if (available <= 0) return 0;
			if (speedCps <= 20) return 0;
			const normalized = Math.min(1, Math.max(0, (speedCps - 20) / 580));
			const minimum = Math.min(available, 31);
			return minimum + normalized * (available - minimum);
		}
		/**
		* Character-domain feed-forward for the stepped layout floor. Callers only
		* provide committed reveal progress and the measured floor; wrap capacity and
		* line height stay local to this module and adapt when a real wrap lands.
		*/
		var FollowRevealPhaseTracker = class {
			charsPerLine;
			lineHeightPx;
			floorPx = null;
			wrapRevealCount = 0;
			lastRevealCount = 0;
			constructor({ seedCharsPerLine = 50, seedLineHeightPx = 26 } = {}) {
				this.charsPerLine = Math.max(1, seedCharsPerLine);
				this.lineHeightPx = Math.max(1, seedLineHeightPx);
			}
			advance(floorPx, revealedChars) {
				const nextFloor = Math.max(0, floorPx);
				const nextRevealCount = Math.max(0, revealedChars);
				if (this.floorPx === null || nextRevealCount < this.lastRevealCount) {
					this.floorPx = nextFloor;
					this.wrapRevealCount = nextRevealCount;
					this.lastRevealCount = nextRevealCount;
					return this.snapshot(nextFloor, 0);
				}
				const floorDelta = nextFloor - this.floorPx;
				const lineStepThreshold = Math.max(4, this.lineHeightPx * .5);
				if (floorDelta >= lineStepThreshold) {
					const wrappedLines = Math.max(1, Math.round(floorDelta / this.lineHeightPx));
					const sampledLineHeight = floorDelta / wrappedLines;
					const revealedSinceWrap = nextRevealCount - this.wrapRevealCount;
					if (revealedSinceWrap >= this.charsPerLine * .5) {
						const sampledCharsPerLine = revealedSinceWrap / wrappedLines;
						const alpha = .25;
						this.charsPerLine += (sampledCharsPerLine - this.charsPerLine) * alpha;
						this.lineHeightPx += (sampledLineHeight - this.lineHeightPx) * alpha;
						this.wrapRevealCount = nextRevealCount;
					} else this.wrapRevealCount = nextRevealCount;
				} else if (floorDelta <= -lineStepThreshold) this.wrapRevealCount = nextRevealCount;
				this.floorPx = nextFloor;
				this.lastRevealCount = nextRevealCount;
				const phase = Math.min(1, Math.max(0, (nextRevealCount - this.wrapRevealCount) / this.charsPerLine));
				return this.snapshot(nextFloor, phase);
			}
			snapshot(floorPx, phase) {
				return {
					targetPx: floorPx + this.lineHeightPx * phase,
					phase,
					charsPerLine: this.charsPerLine,
					lineHeightPx: this.lineHeightPx
				};
			}
		};
		/** Advance a continuous effective scroll position behind a stepped floor. */
		function computeFollowTrajectoryStep(dtMs, input) {
			if (dtMs <= 0) return {
				positionPx: input.positionPx,
				shiftPx: Math.max(0, (input.paintFloorPx ?? input.targetPx) - input.positionPx),
				velocityPxPerMs: input.velocityPxPerMs
			};
			const elapsedMs = Math.min(32, dtMs);
			const currentLagPx = input.targetPx - input.positionPx;
			const maxLagPx = Math.max(0, input.maxLagPx);
			const minLagPx = Math.min(Math.max(0, input.minLagPx), maxLagPx);
			const centerLagPx = (minLagPx + maxLagPx) / 2;
			const desiredVelocity = Math.max(0, input.targetVelocityPxPerMs + (currentLagPx - centerLagPx) / 120);
			const maxVelocityChange = FOLLOW_TRAJECTORY_ACCELERATION * elapsedMs;
			const velocityPxPerMs = desiredVelocity >= input.velocityPxPerMs ? Math.min(desiredVelocity, input.velocityPxPerMs + maxVelocityChange) : Math.max(desiredVelocity, input.velocityPxPerMs - maxVelocityChange);
			const minPosition = input.targetPx - maxLagPx;
			const maxPosition = input.targetPx - minLagPx;
			const frameAdvancePx = velocityPxPerMs * elapsedMs;
			const boundedPositionPx = Math.min(maxPosition, Math.max(minPosition, input.positionPx + frameAdvancePx));
			const positionPx = Math.max(input.positionPx, boundedPositionPx);
			return {
				positionPx,
				shiftPx: Math.max(0, (input.paintFloorPx ?? input.targetPx) - positionPx),
				velocityPxPerMs
			};
		}
		/**
		* Reveal-rate multiplier needed to retain one-wrap headroom for the spring.
		* Throttling starts only after a quarter of the safe transform is occupied;
		* a constrained paint lands at the minimum immediately so the next reveal
		* commit cannot keep feeding an already-full visual buffer.
		*/
		function computeFollowRevealScale(lagPx, capacityPx, constrained = false, tuning = DEFAULT_STREAM_DEBUG_TUNING) {
			if (constrained) return tuning.backpressureMinScale;
			if (!Number.isFinite(capacityPx)) return 1;
			if (capacityPx <= 0) return lagPx > 0 ? tuning.backpressureMinScale : 1;
			const ratio = Math.min(1, Math.max(0, lagPx / capacityPx));
			if (ratio >= .75) return tuning.backpressureMinScale;
			const progress = Math.min(1, Math.max(0, (ratio - FOLLOW_BACKPRESSURE_START_RATIO) / .65));
			const eased = progress * progress * (3 - 2 * progress);
			return 1 - (1 - tuning.backpressureMinScale) * eased;
		}
		/** Semi-implicit spring integration with four substeps per <=32ms slice. */
		function computeFollowStep(dtMs, input, tuning = DEFAULT_STREAM_DEBUG_TUNING) {
			if (input.lag <= .1 || dtMs <= 0) return {
				advancePx: 0,
				lerpStep: 0,
				velocityPxPerSec: 0
			};
			let lag = input.lag;
			let velocity = Math.max(0, input.velocityPxPerSec ?? 0);
			const elapsedMs = Math.min(32, dtMs);
			const slices = Math.max(1, Math.ceil(elapsedMs / 32));
			const subDt = elapsedMs / 1e3 / slices / 4;
			for (let slice = 0; slice < slices; slice += 1) for (let substep = 0; substep < 4; substep += 1) {
				const acceleration = (tuning.springStiffness * lag - tuning.springDamping * velocity) / tuning.springMass;
				velocity = Math.max(0, velocity + acceleration * subDt);
				const advance = velocity * subDt;
				if (advance >= lag) return {
					advancePx: input.lag,
					lerpStep: 1,
					velocityPxPerSec: 0
				};
				lag -= advance;
			}
			const advancePx = input.lag - lag;
			return {
				advancePx,
				lerpStep: advancePx / input.lag,
				velocityPxPerSec: velocity
			};
		}
		/** Element whose resize signals flow growth for the before-paint restore. */
		function resizeProxyOf(port) {
			return port.querySelector("[data-chat-transcript]") ?? port.querySelector("[data-chat-flow]");
		}
		/**
		* Outermost message surfaces; nested tool rows ride their parent.
		*
		* Another plugin may insert its own element as a flow sibling of the Chat rows
		* (meow-memory's fold bar is one).
		* Such a row carries no `data-chat-anchor-key`, so selecting only anchored
		* rows would shift the conversation while leaving the foreign row at its
		* natural offset, letting the shifted rows paint over it. Every direct flow
		* child therefore rides the same transform, keeping the visual order of the
		* column intact.
		*/
		function shiftSurfacesOf(port) {
			const transcript = port.querySelector("[data-chat-transcript]");
			if (transcript !== null) return [transcript];
			const anchored = [...port.querySelectorAll("[data-chat-anchor-key]")].filter((row) => row.parentElement?.closest("[data-chat-anchor-key]") === null);
			const flow = port.querySelector("[data-chat-flow]");
			if (flow === null) return anchored;
			const status = turnStatusOf(port);
			const anchoredSet = new Set(anchored);
			return [...flow.children].filter((child) => child instanceof HTMLElement && child !== status && (anchoredSet.has(child) || child.querySelector("[data-chat-anchor-key]") === null));
		}
		function currentShiftOf(element) {
			return Number(/translate3d\(0(?:px)?,\s*(-?[\d.]+)px,\s*0(?:px)?\)/.exec(element.style.transform)?.[1] ?? 0);
		}
		function setDirectShift(element, px) {
			if (Math.abs(px) > .01) {
				if (Math.abs(currentShiftOf(element) - px) <= .01 && element.style.willChange === "transform" && element.style.clipPath === "") return;
				element.style.transform = `translate3d(0, ${px}px, 0)`;
				element.style.willChange = "transform";
			} else {
				if (element.style.transform === "" && element.style.willChange === "" && element.style.clipPath === "") return;
				element.style.transform = "";
				element.style.willChange = "";
			}
			element.style.clipPath = "";
		}
		function setShift(element, px) {
			if (Math.abs(px) > .01 && element.querySelector("[role=\"tooltip\"]") !== null) {
				setDirectShift(element, 0);
				return;
			}
			setDirectShift(element, px);
		}
		function turnStatusOf(port) {
			return port.querySelector("[data-chat-turn-status], [data-chat-flow] > [role=\"status\"]");
		}
		const FOLLOW_FLOW_FILL_SYMBOL = Symbol.for("dsh-smooth-stream.follow-flow-fill");
		const followFlowFillHost = globalThis;
		const followFlowFills = followFlowFillHost[FOLLOW_FLOW_FILL_SYMBOL] ?? /* @__PURE__ */ new WeakMap();
		followFlowFillHost[FOLLOW_FLOW_FILL_SYMBOL] = followFlowFills;
		const FOLLOW_FLOW_FILL_USERS_SYMBOL = Symbol.for("dsh-smooth-stream.follow-flow-fill-users");
		const followFlowFillUsersHost = globalThis;
		const followFlowFillUsers = followFlowFillUsersHost[FOLLOW_FLOW_FILL_USERS_SYMBOL] ?? /* @__PURE__ */ new WeakMap();
		followFlowFillUsersHost[FOLLOW_FLOW_FILL_USERS_SYMBOL] = followFlowFillUsers;
		function flowElementOf(port) {
			return port.querySelector("[data-chat-transcript]") ?? port.querySelector("[data-chat-flow]");
		}
		function ensureFlowFillsPort(port) {
			const element = flowElementOf(port);
			const owned = followFlowFills.get(port);
			if (element === null) {
				if (owned !== void 0) restoreFlowFill(port);
				return;
			}
			const client = Math.max(0, port.clientHeight);
			let overshoot = owned?.overshootPx;
			if (overshoot === void 0) {
				const pendingOriginal = element.style.minHeight;
				element.style.minHeight = `${client}px`;
				overshoot = Math.max(0, port.scrollHeight - client);
				element.style.minHeight = pendingOriginal;
				if (owned !== void 0) restoreFlowFill(port);
			}
			const target = `${Math.max(0, client - overshoot)}px`;
			if (owned !== void 0) {
				if (owned.element === element && owned.overshootPx === overshoot && element.style.minHeight === target) return;
				restoreFlowFill(port);
			}
			const original = element.style.minHeight;
			element.style.minHeight = target;
			followFlowFills.set(port, {
				element,
				original,
				overshootPx: overshoot
			});
		}
		function restoreFlowFill(port) {
			const owned = followFlowFills.get(port);
			if (owned === void 0) return;
			owned.element.style.minHeight = owned.original;
			followFlowFills.delete(port);
		}
		/** Height committed by one newly mounted Chat row, including its flex gap. */
		function entranceExtentOf(root) {
			const row = root.closest("[data-chat-flow-key]") ?? root;
			const rect = row.getBoundingClientRect();
			const height = Math.max(0, rect.height, rect.bottom - rect.top, row.offsetHeight);
			let previous = row.previousElementSibling;
			while (previous instanceof HTMLElement) {
				const previousRect = previous.getBoundingClientRect();
				if (previousRect.height > 0 || previousRect.bottom > previousRect.top) return Math.max(height, rect.bottom - previousRect.bottom);
				previous = previous.previousElementSibling;
			}
			return height;
		}
		/**
		* The plugin can be reinjected without replacing the conversation DOM. Keep
		* runway ownership in the page realm so a fresh bundle adopts the existing
		* margin instead of treating it as host layout and adding another 48px.
		*/
		const FOLLOW_RUNWAYS_SYMBOL = Symbol.for("dsh-smooth-stream.follow-runways");
		const followRunwayRegistry = globalThis;
		const followRunways = followRunwayRegistry[FOLLOW_RUNWAYS_SYMBOL] ?? /* @__PURE__ */ new WeakMap();
		followRunwayRegistry[FOLLOW_RUNWAYS_SYMBOL] = followRunways;
		const followPaintLimits = /* @__PURE__ */ new WeakMap();
		const followHadChrome = /* @__PURE__ */ new WeakSet();
		/** Last painted shift per port, to spread a wrap's one-line step over frames. */
		const followLastShiftPx = /* @__PURE__ */ new WeakMap();
		/** Last settled floor per port, to size the shift decay bound against extent collapse. */
		const followLastFloorPx = /* @__PURE__ */ new WeakMap();
		const followGuardAnchors = /* @__PURE__ */ new WeakMap();
		/**
		* Ports whose completion settle loop owns the follow. The settle drains the
		* reveal, retires the pad and guards the cascade; the swap that ends the
		* turn REMOUNTS the follower arms in the same frame cluster, and a freshly
		* mounted arm primes with a higher generation and would otherwise steal the
		* port mid-drain — its observers miss the cascade mutations (armed after
		* the fact) and its state initialization re-materializes engine space.
		* Ownership is released only when the settle finishes, the reader gestures,
		* or a genuinely NEW turn arrives (a user row joined since the handoff).
		*/
		const followCompletionSettle = /* @__PURE__ */ new WeakSet();
		/** User-row count at handoff, for the new-turn check above. */
		const followCompletionSettleRows = /* @__PURE__ */ new WeakMap();
		/** User rows below the flow, or -1 when the host does not label rows with
		*  `data-chat-flow-kind` (the engine's own audit benches): the new-turn
		*  check is unsupported there and ownership guarding must stay OFF. */
		function countUserRows(port) {
			const flow = flowElementOf(port);
			if (flow === null) return -1;
			let count = 0;
			let sawKind = false;
			for (const child of flow.children) {
				if (!(child instanceof HTMLElement)) continue;
				const kind = child.getAttribute("data-chat-flow-kind");
				if (kind !== null) sawKind = true;
				if (kind === "user") count++;
			}
			return sawKind ? count : -1;
		}
		/** True while this port's completion settle owns the follow and no new turn
		*  has arrived since the handoff. */
		function completionSettleGuardsPort(port) {
			if (!followCompletionSettle.has(port)) return false;
			const baseline = followCompletionSettleRows.get(port) ?? -1;
			const current = countUserRows(port);
			return baseline >= 0 && current >= 0 && current <= baseline;
		}
		/**
		* Ports whose completion settle loop owns the follow. A settle loop drains,
		* retires the pad and guards the cascade; an arm that primes while this is
		* set with `active === false` (the settled-side static arm mounting in the
		* very swap frame) must NOT seize leadership — the swap re-renders the node
		* view, a fresh arm would otherwise steal the port mid-drain with
		* `reservePx = ownedBottomSpace` (the pad!), re-materialize an equal runway
		* through applyVisual, double-count the extent and fight the settle's own
		* guard for the rest of the window. A streaming arm (active === true, the
		* next turn) still takes over normally and the settle yields.
		*/
		function readingAnchorOf(port) {
			const flow = flowElementOf(port);
			if (flow === null) return null;
			let anchor = null;
			for (const child of flow.children) {
				if (!(child instanceof HTMLElement)) continue;
				if (child.getAttribute("data-chat-flow-kind") === "assistant" || child.querySelector("[data-variant=\"think\"]") !== null) anchor = child;
			}
			return anchor ?? shiftSurfacesOf(port).at(-1) ?? null;
		}
		/**
		* Measure the reading surface's screen delta since the last guard pass.
		* Returns null when there is nothing comparable yet (first observation), or
		* when the anchor changed identity in a way that is NOT the in-place
		* live→settled replacement (a new turn's row joined — nothing jumped,
		* re-seed). Compensation sites must store the POST-compensation held
		* position via `holdGuardAnchor`, or the guard would read its own
		* correction as a fresh jump and oscillate.
		*/
		function measureReadingAnchor(port) {
			const anchor = readingAnchorOf(port);
			if (anchor === null) {
				followGuardAnchors.delete(port);
				return null;
			}
			const rect = anchor.getBoundingClientRect();
			if (!(rect.width > 0 || rect.height > 0)) return null;
			const top = rect.top;
			const shift = currentShiftOf(anchor);
			const pad = flowPadOf(port);
			const scrollTop = port.scrollTop;
			const scrollHeight = port.scrollHeight;
			const flow = flowElementOf(port);
			const index = flow === null ? -1 : [...flow.children].indexOf(anchor);
			const stored = followGuardAnchors.get(port);
			if (stored === void 0) {
				followGuardAnchors.set(port, {
					element: anchor,
					top,
					index,
					shift,
					pad,
					scrollTop,
					scrollHeight
				});
				return null;
			}
			if (Math.abs(scrollHeight - stored.scrollHeight) <= .5 && Math.abs(scrollTop - stored.scrollTop) > .5) {
				followScrollLedgers.set(port, scrollTop);
				followGuardAnchors.set(port, {
					element: anchor,
					top,
					index,
					shift,
					pad,
					scrollTop,
					scrollHeight
				});
				return null;
			}
			const delta = top - stored.top - (shift - stored.shift) + (pad - stored.pad);
			if (stored.element === anchor) {
				followGuardAnchors.set(port, {
					element: anchor,
					top,
					index,
					shift,
					pad,
					scrollTop,
					scrollHeight
				});
				return {
					anchor,
					index,
					top,
					delta
				};
			}
			if (!stored.element.isConnected && stored.index === index) return {
				anchor,
				index,
				top,
				delta
			};
			followGuardAnchors.set(port, {
				element: anchor,
				top,
				index,
				shift,
				pad,
				scrollTop,
				scrollHeight
			});
			return null;
		}
		/** Record the position the reader should keep seeing after a correction. */
		function holdGuardAnchor(port, measured, heldTop) {
			followGuardAnchors.set(port, {
				element: measured.anchor,
				index: measured.index,
				top: heldTop,
				shift: currentShiftOf(measured.anchor),
				pad: flowPadOf(port),
				scrollTop: port.scrollTop,
				scrollHeight: port.scrollHeight
			});
		}
		/** Last runway offset seen per port, to rebase the extent when the margin size changes. */
		const followRunwayOffsetHistory = /* @__PURE__ */ new WeakMap();
		/** Last observed scroll floor per port, for the slack→overflow runway re-measure. */
		const followFloorHistory = /* @__PURE__ */ new WeakMap();
		/** One-shot flag: the transition frame must paint the full runway as baseline. */
		const followSlackTransition = /* @__PURE__ */ new WeakSet();
		const followSettlePads = /* @__PURE__ */ new WeakMap();
		/**
		* Retired follower space lives as `padding-bottom` on the FLOW element — the
		* one node the engine already owns styles on (flow-fill min-height) and the
		* host never rewrites. Host completion commits routinely REPLACE row elements
		* (live→settled swap re-keys the assistant row, the status row unmounts), and
		* any engine space written on those rows dies with them, sinking the floor
		* and slamming the pinned transcript for a frame. The flow survives.
		*/
		function flowPadOf(port) {
			return followSettlePads.get(port)?.px ?? 0;
		}
		/**
		* After a loss is re-opened as pad, a registry entry whose element is no
		* longer connected claims extent that no longer exists; drop it so the next
		* `ensureRunway` re-measures fresh instead of double-counting.
		*/
		function pruneDeadRunway(port) {
			const runway = followRunways.get(port);
			if (runway !== void 0 && !runway.element.isConnected) {
				restoreRunway(port);
				return true;
			}
			return false;
		}
		function setFlowPad(port, px) {
			const flow = flowElementOf(port);
			if (flow === null) return;
			const existing = followSettlePads.get(port);
			const original = existing?.original ?? flow.style.paddingBottom;
			if (px <= .25) {
				if (existing !== void 0) {
					flow.style.paddingBottom = existing.original;
					followSettlePads.delete(port);
				}
				return;
			}
			flow.style.paddingBottom = original === "" ? `${px}px` : `calc(${original} + ${px}px)`;
			followSettlePads.set(port, {
				element: flow,
				original,
				px
			});
		}
		/** Extent the follower owns below the content: the live runway margin plus
		*  the retired completion pad. At adopt the pad is reclaimed into the fresh
		*  reservation (same frame, pre-paint), so the floor never steps. */
		function ownedBottomSpaceOf(port) {
			return runwayOffsetOf(port) + flowPadOf(port);
		}
		/**
		* Completion-window diagnostics. Armed when a follower hands off to its
		* settle loop; every engine decision and every externally-written scroll
		* position inside the window prints one compact console line, so a live
		* host session can be diffed against the lab without a debugger.
		*/
		let followTraceUntilMs = 0;
		function traceActive() {
			return debugRuntime.isEnabled() && performance.now() < followTraceUntilMs;
		}
		function followTrace(event, detail) {
			if (!traceActive()) return;
			console.log(`[dsh-follow] ${event}`, JSON.stringify(detail));
		}
		function hostShOf(port) {
			return port.scrollHeight;
		}
		function invalidatePaintLimit(port) {
			followPaintLimits.delete(port);
		}
		/** Logical position and velocity survive a React owner handoff and finish. */
		const followMotionStates = /* @__PURE__ */ new WeakMap();
		const followReaderHolds = /* @__PURE__ */ new WeakMap();
		/**
		* Commit-time correction channel. A reveal commit that lands after this
		* frame's ResizeObserver delivery would otherwise paint one intermediate
		* frame — content grown, scrollTop/transform not yet compensated — before
		* the next tick fixes it. Reveal arms call {@link notifyFollowCommit} right
		* after their commit; the leading follower re-runs its geometry in the same
		* task, so the intermediate state never reaches a paint.
		*/
		const followCommitListeners = /* @__PURE__ */ new WeakMap();
		function notifyFollowCommit(fromInsidePort) {
			if (fromInsidePort === null) return;
			const port = fromInsidePort.closest("[data-conversation-scroll]");
			const listeners = port === null ? void 0 : followCommitListeners.get(port);
			if (listeners === void 0) return;
			for (const listener of [...listeners]) listener();
		}
		function subscribeFollowCommit(port, fn) {
			let listeners = followCommitListeners.get(port);
			if (listeners === void 0) {
				listeners = /* @__PURE__ */ new Set();
				followCommitListeners.set(port, listeners);
			}
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		}
		function restoreRunway(port) {
			const runway = followRunways.get(port);
			if (runway === void 0) return;
			runway.element.style[runway.property] = runway.original;
			followRunways.delete(port);
			invalidatePaintLimit(port);
		}
		function isLegacyRunway(value) {
			if (value === "") return false;
			const terms = [...value.matchAll(/([\d.]+)px/g)];
			if (terms.length === 0 || value.replaceAll(/calc|px|[\d.+()\s]/g, "") !== "") return false;
			const values = terms.map(([, raw]) => Number(raw));
			if (values.some((px) => !Number.isFinite(px))) return false;
			return [LEGACY_RUNWAY_PX, 72].some((unit) => values.every((px) => px >= unit && Math.abs(px % unit) <= Number.EPSILON));
		}
		/** Remove unowned runway residue written by v0.3.3 and earlier bundles. */
		function migrateLegacyRunway(port, surfaces, status, composer) {
			if (followRunways.has(port)) return false;
			let migrated = false;
			if (status !== null && isLegacyRunway(status.style.marginTop)) {
				status.style.marginTop = "";
				migrated = true;
			}
			const last = surfaces.at(-1);
			if (status === null && composer !== null && last !== void 0 && isLegacyRunway(last.style.marginBottom)) {
				last.style.marginBottom = "";
				migrated = true;
			}
			if (migrated) invalidatePaintLimit(port);
			return migrated;
		}
		function ensureRunway(port, surfaces, runwayPx = 72) {
			const status = turnStatusOf(port);
			const composer = port.querySelector("[data-composer-seat]");
			if (status !== null && followRunways.get(port) === void 0) {
				const inlinePx = Number.parseFloat(status.style.marginTop ?? "") || 0;
				if (Math.abs(inlinePx - 72) <= .5) {
					followRunways.set(port, {
						element: status,
						offset: inlinePx,
						property: "marginTop",
						original: "",
						requestedPx: inlinePx
					});
					invalidatePaintLimit(port);
				}
			}
			const migratedLegacy = migrateLegacyRunway(port, surfaces, status, composer);
			const naturalHeight = Math.max(0, port.scrollHeight - runwayOffsetOf(port));
			const existing = followRunways.get(port);
			const requestedRunwayPx = migratedLegacy || existing?.normalizedLegacy === true ? 72 : runwayPx;
			if (requestedRunwayPx <= 0 || port.clientHeight <= 0 || naturalHeight <= port.clientHeight) {
				restoreRunway(port);
				return;
			}
			const target = status === null ? {
				element: composer === null ? void 0 : surfaces.at(-1),
				property: "marginBottom"
			} : {
				element: status,
				property: "marginTop"
			};
			if (target.element === void 0) {
				restoreRunway(port);
				return;
			}
			const element = target.element;
			const current = followRunways.get(port);
			if (current?.element === element && current.property === target.property && current.requestedPx === requestedRunwayPx) return;
			restoreRunway(port);
			const beforeHeight = port.scrollHeight;
			const original = element.style[target.property];
			element.style[target.property] = original === "" ? `${requestedRunwayPx}px` : `calc(${original} + ${requestedRunwayPx}px)`;
			const offset = Math.max(0, port.scrollHeight - beforeHeight);
			followRunways.set(port, {
				element,
				offset,
				property: target.property,
				original,
				requestedPx: requestedRunwayPx,
				normalizedLegacy: migratedLegacy || existing?.normalizedLegacy === true
			});
			invalidatePaintLimit(port);
		}
		function runwayOffsetOf(port) {
			return followRunways.get(port)?.offset ?? 0;
		}
		/**
		* Move owned runway margin into the persistent flow pad without changing the
		* scroll extent. Returns the actual layout pixels removed from the margin.
		*/
		function transferRunwayToFlowPad(port, requestedPx) {
			const runway = followRunways.get(port);
			if (runway === void 0 || requestedPx <= 0 || !runway.element.isConnected) return 0;
			const nextRequestedPx = Math.max(0, runway.requestedPx - requestedPx);
			const beforeOffset = runway.offset;
			const beforeHeight = port.scrollHeight;
			runway.element.style[runway.property] = nextRequestedPx <= .25 ? runway.original : runway.original === "" ? `${nextRequestedPx}px` : `calc(${runway.original} + ${nextRequestedPx}px)`;
			const nextOffset = Math.max(0, beforeOffset + port.scrollHeight - beforeHeight);
			const transferredPx = Math.max(0, beforeOffset - nextOffset);
			if (nextRequestedPx <= .25 || nextOffset <= .25) followRunways.delete(port);
			else followRunways.set(port, {
				...runway,
				offset: nextOffset,
				requestedPx: nextRequestedPx
			});
			if (transferredPx > 0) {
				setFlowPad(port, flowPadOf(port) + transferredPx);
				invalidatePaintLimit(port);
			}
			return transferredPx;
		}
		/** Available paint room below the last message before fixed conversation chrome. */
		function safeShiftLimit(port, surfaces) {
			const last = surfaces.at(-1);
			if (last === void 0) return 0;
			const status = turnStatusOf(port);
			const composer = port.querySelector("[data-composer-seat]");
			if (status !== null || composer !== null) followHadChrome.add(port);
			const cached = followPaintLimits.get(port);
			if (cached !== void 0 && performance.now() - cached.measuredAtMs <= 250 && cached.clientHeight === port.clientHeight && cached.surface === last && cached.status === status && cached.composer === composer) return cached.limit;
			const ceiling = [status, composer].filter((element) => element !== null).map((element) => ({
				element,
				rect: element.getBoundingClientRect()
			})).filter(({ rect }) => Number.isFinite(rect.top) && Number.isFinite(rect.bottom) && rect.bottom > rect.top).sort((first, second) => first.rect.top - second.rect.top)[0];
			if (ceiling === void 0) return status === null && composer === null ? followHadChrome.has(port) ? 0 : Number.POSITIVE_INFINITY : runwayOffsetOf(port);
			const ceilingTop = ceiling.rect.top - currentShiftOf(ceiling.element);
			const naturalBottom = last.getBoundingClientRect().bottom - currentShiftOf(last);
			const limit = Math.max(0, ceilingTop - naturalBottom - 1);
			followPaintLimits.set(port, {
				clientHeight: port.clientHeight,
				limit,
				measuredAtMs: performance.now(),
				composer,
				status,
				surface: last
			});
			return limit;
		}
		function setFollowScrollTop(port, nextTop) {
			const ledger = followScrollLedgers.get(port);
			if (port.getAttribute(FOLLOW_OWNED_ATTR) === null) port.setAttribute(FOLLOW_OWNED_ATTR, "active");
			if (ledger !== void 0 && traceActive() && Math.abs(port.scrollTop - ledger) > 1) followTrace("external-scroll", {
				from: Math.round(port.scrollTop),
				to: Math.round(nextTop),
				ledger: Math.round(ledger)
			});
			if (Math.abs(port.scrollTop - nextTop) > .01) port.scrollTop = nextTop;
			followScrollLedgers.set(port, port.scrollTop);
			const ownedTop = String(port.scrollTop);
			if (port.getAttribute(FOLLOW_OWNED_ATTR) !== ownedTop) port.setAttribute(FOLLOW_OWNED_ATTR, ownedTop);
		}
		/**
		* Last scrollTop this engine wrote or accepted, per port. Reader intent is a
		* real upward delta from this ledger; a key press or touch while pinned
		* (typing in the composer) must not release the pin, because a released pin
		* can never re-acquire while content streams away from the reader position.
		*/
		const followScrollLedgers = /* @__PURE__ */ new WeakMap();
		const followActivityAt = /* @__PURE__ */ new WeakMap();
		/**
		* Scroll ownership must survive follower-arm remounts. Per-closure state let a
		* new text/tool arm reset the strike counter, so the same host write kept
		* triggering another engine write and repainting the visible up/down fight.
		*/
		const followHostScrollPorts = /* @__PURE__ */ new WeakMap();
		/** Clear host ownership only when a new user turn actually starts. */
		function resetHostScrollOwnershipForNewTurn(port) {
			const ownership = followHostScrollPorts.get(port);
			if (ownership === void 0) return;
			const userRows = countUserRows(port);
			if (userRows >= 0 && userRows > ownership.userRows) followHostScrollPorts.delete(port);
		}
		/** Whether this port was owned recently enough to identify a closing tail row. */
		function hasRecentConversationFollow(port, windowMs = 250) {
			const last = followActivityAt.get(port);
			return last !== void 0 && performance.now() - last <= windowMs;
		}
		function readerScrolledUp(port) {
			return port.scrollTop < (followScrollLedgers.get(port) ?? 0) - 8;
		}
		/**
		* Paint a bounded visual lag and return the effective logical extent.
		*
		* This is the final geometry invariant, not merely an animation preference:
		* any lag beyond the real gap to status/composer chrome is caught up in the
		* same frame. Carrying that excess in `scrollTop` would move the transcript
		* toward fixed chrome and also make the host expose jump-to-bottom.
		*/
		function applyVisual(port, animatedH, reservePx, velocityPxPerSec = 0, runwayPx = 72, shiftCeilingPx = Number.POSITIVE_INFINITY, promoteAtRest = false, trajectoryShiftPx, dtMs = 16.7, writeScrollTop = true) {
			const surfaces = shiftSurfacesOf(port);
			ensureFlowFillsPort(port);
			{
				const preFloor = Math.max(0, port.scrollHeight - port.clientHeight);
				const lastFloorSeen = followFloorHistory.get(port);
				if (lastFloorSeen !== void 0 && lastFloorSeen === 0 && preFloor > 0 && followRunways.has(port)) {
					const owned = followRunways.get(port);
					restoreRunway(port);
					ensureRunway(port, surfaces, owned?.requestedPx ?? runwayPx);
					followSlackTransition.add(port);
				}
				if (preFloor !== lastFloorSeen) followFloorHistory.set(port, preFloor);
			}
			ensureRunway(port, surfaces, reservePx);
			const contentHeight2 = Math.max(0, port.scrollHeight);
			const runwayOffset2 = runwayOffsetOf(port);
			const prevOffset2 = followRunwayOffsetHistory.get(port);
			if (prevOffset2 !== void 0 && runwayOffset2 !== prevOffset2) animatedH = Math.max(0, animatedH - (runwayOffset2 - prevOffset2));
			followRunwayOffsetHistory.set(port, runwayOffset2);
			const contentHeight = contentHeight2;
			const runwayOffset = runwayOffset2;
			const targetHeight = Math.max(0, contentHeight - runwayOffset);
			const floor = Math.max(0, contentHeight - port.clientHeight);
			const extent = Math.min(targetHeight, Math.max(0, animatedH));
			if (port.style.overflowAnchor !== "none") port.style.overflowAnchor = "none";
			if (port.style.scrollBehavior !== "auto") port.style.scrollBehavior = "auto";
			if (floor <= 0) {
				followRunwayOffsetHistory.set(port, 0);
				if (writeScrollTop) setFollowScrollTop(port, 0);
				followMotionStates.set(port, {
					capacityPx: Number.POSITIVE_INFINITY,
					constrained: false,
					extent: targetHeight,
					lagPx: 0,
					reservePx: 0,
					velocityPxPerSec: 0
				});
				for (const surface of surfaces) setShift(surface, 0);
				followLastShiftPx.set(port, 0);
				const status = turnStatusOf(port);
				if (status !== null) setShift(status, 0);
				return targetHeight;
			}
			const limit = safeShiftLimit(port, surfaces);
			followSlackTransition.delete(port);
			const visibleReserve = Math.min(runwayOffset, Math.max(0, reservePx));
			const baselineShift = runwayOffset - visibleReserve;
			const requestedLag = Math.max(0, targetHeight - extent);
			const availableShift = Math.min(Math.max(0, limit), Math.max(0, shiftCeilingPx));
			const motionShift = Math.min(trajectoryShiftPx ?? baselineShift + requestedLag, availableShift);
			let shift = Math.max(motionShift, promoteAtRest && motionShift <= .01 && availableShift > 0 ? .1 : 0);
			const previousShift = followLastShiftPx.get(port);
			const previousFloor = followLastFloorPx.get(port);
			const floorDropPx = Math.max(0, (previousFloor ?? floor) - floor);
			const maxDecayPx = Math.max(dtMs <= 0 ? 8 : Math.max(1, 8 / 16.67 * dtMs), floorDropPx);
			followLastFloorPx.set(port, floor);
			if (previousShift !== void 0 && shift < previousShift - maxDecayPx) shift = previousShift - maxDecayPx;
			if (followCompletionSettle.has(port) && previousShift !== void 0 && previousFloor !== void 0) {
				const confirmedGrowthPx = Math.max(0, floor - previousFloor);
				if (shift > previousShift + confirmedGrowthPx) shift = previousShift + confirmedGrowthPx;
			}
			followLastShiftPx.set(port, shift);
			const requestedShift = trajectoryShiftPx ?? baselineShift + requestedLag;
			const effectiveLag = Math.max(0, shift - baselineShift);
			const capacityPx = Math.max(0, limit - baselineShift);
			const effectiveExtent = targetHeight - effectiveLag;
			const isConstrained = requestedShift > availableShift + .25 || limit <= 0 && requestedShift > baselineShift;
			if (writeScrollTop) setFollowScrollTop(port, floor);
			followMotionStates.set(port, {
				capacityPx,
				constrained: isConstrained,
				extent: effectiveExtent,
				lagPx: effectiveLag,
				reservePx: visibleReserve,
				velocityPxPerSec
			});
			for (const surface of surfaces) setShift(surface, shift);
			const status = turnStatusOf(port);
			if (status !== null) setShift(status, 0);
			return effectiveExtent;
		}
		function clearMotion(port) {
			port.removeAttribute(FOLLOW_OWNED_ATTR);
			port.style.overflowAnchor = "";
			port.style.scrollBehavior = "";
			for (const surface of shiftSurfacesOf(port)) setShift(surface, 0);
			const status = turnStatusOf(port);
			if (status !== null) setShift(status, 0);
		}
		function clearVisual(port) {
			clearMotion(port);
			restoreRunway(port);
			followMotionStates.delete(port);
			followLastShiftPx.delete(port);
			followLastFloorPx.delete(port);
			invalidatePaintLimit(port);
		}
		/** Keep an already-promoted surface at zero until one stable final paint lands. */
		function holdCompositorAtRest(element) {
			element.style.transform = "translate3d(0, 0px, 0)";
			element.style.willChange = "transform";
			element.style.clipPath = "";
		}
		/** Remove equal offsets, land on the floor, then retire the compositor quietly. */
		function finishAtNaturalFloor(port, retainCompositor = true, writeScrollTop = true) {
			followCompletionSettle.delete(port);
			followTraceUntilMs = Math.max(followTraceUntilMs, performance.now() + 1e4);
			followTrace("finish-enter", {
				sh: hostShOf(port),
				st: Math.round(port.scrollTop),
				pad: Math.round(flowPadOf(port)),
				retain: retainCompositor
			});
			const surfaces = shiftSurfacesOf(port);
			const status = turnStatusOf(port);
			if (!retainCompositor) {
				restoreRunway(port);
				if (writeScrollTop) settleAtFloor(port);
				clearMotion(port);
				followMotionStates.delete(port);
				return;
			}
			const promoted = [...surfaces, ...status === null ? [] : [status]].filter((element) => element.style.transform !== "" || element.style.willChange === "transform");
			const promotedSet = new Set(promoted);
			if (writeScrollTop) settleAtFloor(port);
			port.removeAttribute(FOLLOW_OWNED_ATTR);
			port.style.overflowAnchor = "";
			port.style.scrollBehavior = "";
			for (const surface of surfaces) if (promotedSet.has(surface)) holdCompositorAtRest(surface);
			else setShift(surface, 0);
			if (status !== null) {
				if (promotedSet.has(status)) holdCompositorAtRest(status);
				else setShift(status, 0);
			}
			followMotionStates.delete(port);
			if (promoted.length === 0) return;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					for (const element of promoted) if (Math.abs(currentShiftOf(element)) <= .01) setShift(element, 0);
				});
			});
		}
		function settleAtFloor(port) {
			setFollowScrollTop(port, Math.max(0, port.scrollHeight - port.clientHeight));
			followReaderHolds.delete(port);
		}
		/** Only the newest active follower may write one port's shared visual state. */
		const followLeaders = /* @__PURE__ */ new WeakMap();
		let followGeneration = 0;
		/** Ports with a live streaming arm; completion guards must not fight them. */
		const followActivePorts = /* @__PURE__ */ new WeakSet();
		/**
		* Own the conversation scrollport's bottom-follow while `active` is true.
		*
		* @param rootRef - An element inside the conversation scrollport.
		* @param active - True while the reply is still revealing.
		* @param speedCpsRef - Live reveal-rate EMA from the smoother.
		* @param revealScaleRef - Optional backpressure control for text reveal.
		* @param predictive - Whether to reserve paint room ahead of growth.
		* @param entrance - Whether the first committed row height should glide in.
		* @param onEntranceSettled - Releases a one-shot entrance owner after catch-up.
		* @param predictiveRef - Optional live visibility gate for predictive runway.
		* @param entranceExtentRef - Optional measured growth delta for a generic row.
		* @param revealedCharsRef - Committed code-point count for feed-forward phase.
		* @param controlScroll - When false, leave the scrollport entirely to the Host.
		*/
		function useConversationFollow(rootRef, active, speedCpsRef, revealScaleRef, predictive = true, entrance = false, onEntranceSettled, predictiveRef, entranceExtentRef, revealedCharsRef, controlScroll = true) {
			const activeRef = (0, react.useRef)(active);
			const entranceRef = (0, react.useRef)(entrance);
			const onEntranceSettledRef = (0, react.useRef)(onEntranceSettled);
			entranceRef.current = entrance;
			onEntranceSettledRef.current = onEntranceSettled;
			activeRef.current = active;
			const controlScrollRef = (0, react.useRef)(controlScroll);
			controlScrollRef.current = controlScroll;
			(0, react.useLayoutEffect)(() => {
				if (!controlScroll) return;
				if (!active) return;
				const startedAsEntrance = entrance;
				const owner = {};
				const generation = ++followGeneration;
				let rafId = 0;
				let last = performance.now();
				let following = true;
				let primed = false;
				let animatedH = 0;
				let reservePx = 0;
				let velocityPxPerSec = 0;
				let interacting = false;
				let readerGestureIntent = false;
				let readerReleased = false;
				let touchStartY = null;
				let interactTimer = null;
				let port = null;
				let resize = null;
				let mutations = null;
				let observedTail = null;
				let statusWasPresent = null;
				let lastStatusHeightPx = 0;
				let trajectoryPositionPx = null;
				let trajectoryVelocityPxPerMs = 0;
				let trajectoryTargetVelocityPxPerMs = 0;
				let trajectoryFloorPx = null;
				let trajectoryGrowthAtMs = null;
				let trajectoryAccumulatedGrowthPx = 0;
				let trajectoryAccumulatedGrowthMs = 0;
				let trajectoryGrowthSamples = 0;
				let trajectoryWasActive = false;
				const revealPhase = new FollowRevealPhaseTracker();
				let holding = null;
				let entrancePending = entranceRef.current;
				const finishEntrance = () => {
					if (!entrancePending) return;
					entrancePending = false;
					onEntranceSettledRef.current?.();
				};
				const updateRevealScale = (next, elapsedMs, urgent = false) => {
					if (revealScaleRef === void 0) return;
					const tuning = debugRuntime.activeTuning();
					const state = followMotionStates.get(next);
					const target = state === void 0 ? 1 : computeFollowRevealScale(state.lagPx, state.capacityPx, state.constrained, tuning);
					const current = Math.min(1, Math.max(tuning.backpressureMinScale, revealScaleRef.current));
					if (target < current || urgent) {
						revealScaleRef.current = Math.min(current, target);
						return;
					}
					const releaseStep = 1 - Math.exp(-Math.max(0, elapsedMs) / 240);
					revealScaleRef.current = current + (target - current) * releaseStep;
				};
				const releaseRevealScale = () => {
					if (revealScaleRef !== void 0) revealScaleRef.current = 1;
				};
				const reportFollow = (next, isActive) => {
					const state = followMotionStates.get(next);
					debugRuntime.reportFollow(next, {
						lagPx: state ? state.lagPx : -1,
						velocityPxPerSec: state?.velocityPxPerSec ?? 0,
						reservePx: state?.reservePx ?? 0,
						capacityPx: state ? state.capacityPx : -1,
						revealScale: revealScaleRef?.current ?? 1,
						following,
						constrained: state?.constrained ?? false,
						scrollTop: next.scrollTop,
						scrollHeight: next.scrollHeight,
						clientHeight: next.clientHeight,
						active: isActive
					});
				};
				const isLeader = (next) => followLeaders.get(next)?.owner === owner;
				const hold = (next) => {
					followActivityAt.set(next, performance.now());
					if (holding === next && isLeader(next)) return;
					holding = next;
					const leader = followLeaders.get(next);
					if ((leader === void 0 || generation > leader.generation) && !completionSettleGuardsPort(next)) {
						followCompletionSettle.delete(next);
						followLeaders.set(next, {
							generation,
							owner
						});
					}
				};
				const yieldScrollOwnership = (next, floor) => {
					if (hostOwnsScroll) return;
					hostOwnsScroll = true;
					followHostScrollPorts.set(next, { userRows: countUserRows(next) });
					followTrace("yield-scroll", {
						from: Math.round(next.scrollTop),
						to: Math.round(floor)
					});
					clearVisual(next);
					setFollowScrollTop(next, Math.max(0, next.scrollHeight - next.clientHeight));
					next.removeAttribute(FOLLOW_OWNED_ATTR);
					followLeaders.delete(next);
					releaseRevealScale();
					debugRuntime.reportFollow(next, null);
				};
				const detectHostScroll = (next, floor) => {
					if (followHostScrollPorts.has(next)) {
						hostOwnsScroll = true;
						return;
					}
					const ledger = followScrollLedgers.get(next);
					if (ledger === void 0 || Math.abs(next.scrollTop - ledger) <= 1) return;
					if (Math.abs(next.scrollTop - floor) <= 1) {
						followScrollLedgers.set(next, next.scrollTop);
						externalScrollStrikes = 0;
						return;
					}
					externalScrollStrikes += 1;
					if (externalScrollStrikes >= 2) yieldScrollOwnership(next, floor);
				};
				const drop = (next) => {
					if (holding === next) holding = null;
					if (isLeader(next)) {
						clearMotion(next);
						followMotionStates.delete(next);
						releaseRevealScale();
						debugRuntime.reportFollow(next, null);
					}
				};
				const handBackVisual = (next) => {
					const shift = currentShiftOf(shiftSurfacesOf(next).at(-1) ?? next);
					const transferableShift = shift > .25 ? shift : 0;
					const visualTop = Math.max(0, next.scrollTop - transferableShift);
					clearMotion(next);
					restoreRunway(next);
					const floor = Math.max(0, next.scrollHeight - next.clientHeight);
					next.scrollTop = Math.min(visualTop, Math.max(0, floor - 26));
					followScrollLedgers.set(next, next.scrollTop);
				};
				const markGesture = (event) => {
					interacting = true;
					if (event.type === "wheel") {
						const deltaY = event.deltaY;
						if (Number.isFinite(deltaY) && deltaY < 0) readerGestureIntent = true;
					} else if (event.type === "touchstart") touchStartY = event.touches[0]?.clientY ?? null;
					else if (event.type === "touchmove") {
						const touch = event.touches[0];
						if (touch !== void 0) {
							if (touchStartY === null) touchStartY = touch.clientY;
							if (touch.clientY - touchStartY > 1) readerGestureIntent = true;
						}
					} else if (event.type === "touchend" || event.type === "touchcancel") touchStartY = null;
					if (interactTimer !== null) clearTimeout(interactTimer);
					interactTimer = setTimeout(() => {
						interacting = false;
						readerGestureIntent = false;
						interactTimer = null;
					}, 800);
				};
				/**
				* Last observed scroll extent, shared by the pre-paint correction and the
				* settle loop so a host layout shrink is re-opened exactly once no matter
				* which observer sees it first. `-1` until the first owned observation.
				*/
				let settleRetiring = false;
				let hostOwnsScroll = false;
				let externalScrollStrikes = 0;
				Number.NEGATIVE_INFINITY;
				let handedOff = false;
				/**
				* Bring the reading surface back down toward its held position after an
				* upward host push (clamp jump, live→settled swap): spend persistent pad
				* first — lowering the floor lets the pin carry the text back down —
				* then raise the compositor shift for whatever pad cannot cover, and
				* rebase the spring extent so the raise survives the next applyVisual
				* (which otherwise recomputes the shift from lag and undoes it).
				*/
				const pullReadingAnchorBack = (host, measured, trace = false) => {
					holdGuardAnchor(host, measured, measured.top);
				};
				/**
				* THE screen-space anchor hold, shared by every entry point: the
				* structural-observer path (pre-paint cascade correction), the settle
				* loop's per-frame poll, and the ACTIVE loop's per-frame poll. The
				* shift-excluded delta filters the engine's own motion (reveal glide,
				* wrap lockstep) to ~0, so a live poll may compensate safely — which is
				* what saves the completion swap: the settled-side arm primes in its
				* layout effect and steals leadership IN the cascade frame, its own
				* observers miss the mutations (armed after the fact), and only this
				* poll sees the jump while it can still be corrected before paint.
				* Returns the measured delta (null when nothing was comparable).
				*/
				const enforceReadingAnchor = (host, trace = false) => {
					const measured = measureReadingAnchor(host);
					if (measured === null) return null;
					if (measured.delta > .5) {
						if (trace) followTrace("anchor-hold", {
							screenDelta: Math.round(measured.delta),
							st: Math.round(host.scrollTop)
						});
						if (pruneDeadRunway(host)) reservePx = 0;
						holdGuardAnchor(host, measured, measured.top);
					} else if (measured.delta < -.5) {
						if (pruneDeadRunway(host)) reservePx = 0;
						pullReadingAnchorBack(host, measured, trace);
					} else holdGuardAnchor(host, measured, measured.top);
					return measured.delta;
				};
				/** Pre-paint correction (observers, commit subscription). */
				const restoreBeforePaint = () => {
					if (!following || port === null) return;
					if (hostOwnsScroll || followHostScrollPorts.has(port)) {
						hostOwnsScroll = true;
						followScrollLedgers.set(port, port.scrollTop);
						return;
					}
					if (!activeRef.current) detectHostScroll(port, Math.max(0, port.scrollHeight - port.clientHeight));
					const leaderless = !isLeader(port);
					if (!activeRef.current && followActivePorts.has(port)) return;
					if (leaderless && (followLeaders.has(port) || !handedOff)) return;
					if (leaderless) {
						const sharedMotion = followMotionStates.get(port);
						if (sharedMotion !== void 0) {
							animatedH = Math.min(port.scrollHeight, Math.max(0, sharedMotion.extent));
							reservePx = sharedMotion.reservePx;
							velocityPxPerSec = sharedMotion.velocityPxPerSec;
						}
					}
					pruneDeadRunway(port);
					if (!settleRetiring) {
						const measured = measureReadingAnchor(port);
						if (measured !== null && measured.delta > .5) {
							if (pruneDeadRunway(port)) reservePx = 0;
							holdGuardAnchor(port, measured, measured.top);
						} else if (measured !== null && measured.delta < -.5) {
							if (pruneDeadRunway(port)) reservePx = 0;
							if (!activeRef.current) pullReadingAnchorBack(port, measured);
							else {
								const released = Math.min(flowPadOf(port), -measured.delta);
								if (released > .25) {
									setFlowPad(port, flowPadOf(port) - released);
									animatedH = Math.max(0, animatedH - released);
								}
								holdGuardAnchor(port, measured, measured.top + released);
							}
						} else if (measured !== null) holdGuardAnchor(port, measured, measured.top);
					}
					const tuning = debugRuntime.activeTuning();
					const predictGrowth = predictiveRef?.current ?? predictive;
					const floor = Math.max(0, port.scrollHeight - port.clientHeight);
					if (followFloorHistory.get(port) !== floor) invalidatePaintLimit(port);
					const isReasoningSurface = rootRef.current?.querySelector("[data-variant=\"think\"]") !== null;
					const trajectoryShift = predictive && !isReasoningSurface && runwayOffsetOf(port) > 0 && trajectoryPositionPx !== null ? floor - trajectoryPositionPx : void 0;
					animatedH = applyVisual(port, animatedH, reservePx, velocityPxPerSec, tuning.runwayPx, activeRef.current ? Number.POSITIVE_INFINITY : followLastShiftPx.get(port) ?? Number.POSITIVE_INFINITY, !predictGrowth, trajectoryShift, 0, activeRef.current && !hostOwnsScroll);
					if (trajectoryShift !== void 0) trajectoryPositionPx = floor - (followLastShiftPx.get(port) ?? floor - (trajectoryPositionPx ?? floor));
					updateRevealScale(port, 0, true);
					reportFollow(port, activeRef.current);
				};
				let unsubscribeCommit = null;
				const bindPort = (next) => {
					if (port === next) return;
					if (port !== null) {
						for (const name of GESTURE_EVENTS) port.removeEventListener(name, markGesture);
						resize?.disconnect();
						mutations?.disconnect();
					}
					unsubscribeCommit?.();
					port = next;
					invalidatePaintLimit(port);
					unsubscribeCommit = subscribeFollowCommit(port, () => {
						restoreBeforePaint();
					});
					for (const name of GESTURE_EVENTS) port.addEventListener(name, markGesture, { passive: true });
					if (typeof ResizeObserver !== "undefined") {
						resize = new ResizeObserver(() => restoreBeforePaint());
						resize.observe(port);
						const proxy = resizeProxyOf(port);
						if (proxy !== null) resize.observe(proxy);
					}
					if (typeof MutationObserver !== "undefined") {
						const flow = flowElementOf(port);
						if (flow !== null) {
							mutations = new MutationObserver(() => {
								restoreBeforePaint();
							});
							mutations.observe(flow, {
								childList: true,
								subtree: true
							});
						}
					}
				};
				/**
				* Keep the observer on the flow's TAIL surface. A flow locked to the
				* viewport by min-height does not resize when content grows inside it —
				* only the last message row does, and missing that resize means missing
				* the pre-paint correction for that frame's wrap.
				*/
				const observeTailSurface = () => {
					if (resize === null || port === null) return;
					const tail = shiftSurfacesOf(port).at(-1) ?? null;
					if (tail === observedTail) return;
					if (observedTail !== null) resize.unobserve(observedTail);
					observedTail = tail;
					if (tail !== null) resize.observe(tail);
				};
				const frame = (now) => {
					rafId = requestAnimationFrame(frame);
					const elapsedMs = Math.max(.001, now - last);
					const dt = Math.min(32, elapsedMs);
					const tuning = debugRuntime.activeTuning();
					last = now;
					const root = rootRef.current;
					if (root === null) return;
					const nextPort = root.closest("[data-conversation-scroll]");
					if (nextPort === null) return;
					bindPort(nextPort);
					observeTailSurface();
					resetHostScrollOwnershipForNewTurn(nextPort);
					hostOwnsScroll = followHostScrollPorts.has(nextPort);
					if (activeRef.current) followActivePorts.add(nextPort);
					else followActivePorts.delete(nextPort);
					if (nextPort.clientHeight <= 0) return;
					const floor = Math.max(0, nextPort.scrollHeight - nextPort.clientHeight);
					const reportedLag = floor - nextPort.scrollTop;
					const extent = Math.min(nextPort.scrollHeight, Math.max(0, nextPort.scrollHeight - reportedLag));
					if (!primed) {
						if (completionSettleGuardsPort(nextPort)) {
							primed = true;
							following = false;
							return;
						}
						const inherited = nextPort.hasAttribute(FOLLOW_OWNED_ATTR) ? followMotionStates.get(nextPort) : void 0;
						if (inherited === void 0) {
							const entranceExtent = entrancePending ? entranceExtentRef?.current ?? entranceExtentOf(root) : 0;
							const predictGrowth = predictiveRef?.current ?? predictive;
							animatedH = entrancePending ? Math.max(0, nextPort.scrollHeight - entranceExtent) : nextPort.scrollHeight;
							const hasStatus = turnStatusOf(nextPort) !== null;
							reservePx = Math.max(ownedBottomSpaceOf(nextPort), predictGrowth && (hasStatus || speedCpsRef.current > 90) ? computeFollowReserve(speedCpsRef.current, tuning.runwayPx) : 0);
							if (!completionSettleGuardsPort(nextPort)) setFlowPad(nextPort, 0);
							statusWasPresent = hasStatus;
							velocityPxPerSec = 0;
							following = !readerScrolledUp(nextPort) && !followReaderHolds.has(nextPort);
						} else {
							animatedH = Math.min(nextPort.scrollHeight, inherited.extent);
							reservePx = inherited.reservePx;
							velocityPxPerSec = inherited.velocityPxPerSec;
							following = true;
						}
						if (following) {
							hold(nextPort);
							if (isLeader(nextPort)) {
								animatedH = applyVisual(nextPort, animatedH, reservePx, velocityPxPerSec, tuning.runwayPx, Number.POSITIVE_INFINITY, !(predictiveRef?.current ?? predictive), void 0, 0, !hostOwnsScroll);
								if (predictive && root.querySelector("[data-variant=\"think\"]") === null && runwayOffsetOf(nextPort) > 0) {
									const floor = Math.max(0, nextPort.scrollHeight - nextPort.clientHeight);
									const requestedMinLagPx = Math.max(20, runwayOffsetOf(nextPort) - 32);
									const paintMaxLagPx = Math.max(0, safeShiftLimit(nextPort, shiftSurfacesOf(nextPort)) - 1);
									const minLagPx = Math.min(requestedMinLagPx, paintMaxLagPx);
									const currentShift = currentShiftOf(shiftSurfacesOf(nextPort).at(-1) ?? nextPort);
									trajectoryPositionPx = floor - Math.min(paintMaxLagPx, Math.max(minLagPx, currentShift));
									trajectoryTargetVelocityPxPerMs = Math.max(0, speedCpsRef.current) * .4 / 1e3;
									trajectoryVelocityPxPerMs = trajectoryTargetVelocityPxPerMs;
									trajectoryFloorPx = floor;
									trajectoryGrowthAtMs = now;
									trajectoryAccumulatedGrowthPx = 0;
									trajectoryAccumulatedGrowthMs = 0;
									trajectoryGrowthSamples = 0;
									trajectoryWasActive = true;
								}
								updateRevealScale(nextPort, elapsedMs);
								reportFollow(nextPort, activeRef.current);
								const runwayOffset = runwayOffsetOf(nextPort);
								if (Math.max(0, nextPort.scrollHeight - animatedH - runwayOffset) <= .25) finishEntrance();
							} else finishEntrance();
						} else finishEntrance();
						primed = true;
						return;
					}
					if (!following && (!interacting || readerReleased && !readerGestureIntent && reportedLag <= 1) && reportedLag <= (readerReleased ? 1 : 25)) {
						following = true;
						readerReleased = false;
						followReaderHolds.delete(nextPort);
						animatedH = extent;
						reservePx = 0;
						velocityPxPerSec = 0;
						followScrollLedgers.set(nextPort, nextPort.scrollTop);
						hold(nextPort);
					} else if (following && interacting && (readerGestureIntent || readerScrolledUp(nextPort))) {
						following = false;
						readerGestureIntent = false;
						readerReleased = true;
						followReaderHolds.set(nextPort, { atMs: performance.now() });
						handBackVisual(nextPort);
						animatedH = nextPort.scrollHeight;
						reservePx = 0;
						velocityPxPerSec = 0;
						drop(nextPort);
						finishEntrance();
					}
					if (!activeRef.current || !following) {
						followScrollLedgers.set(nextPort, nextPort.scrollTop);
						reportFollow(nextPort, activeRef.current);
						return;
					}
					detectHostScroll(nextPort, floor);
					if (hostOwnsScroll) {
						followScrollLedgers.set(nextPort, nextPort.scrollTop);
						reportFollow(nextPort, false);
						return;
					}
					hold(nextPort);
					if (!isLeader(nextPort)) {
						finishEntrance();
						return;
					}
					const predictGrowth = predictiveRef?.current ?? predictive;
					const statusElement = turnStatusOf(nextPort);
					const hasStatus = statusElement !== null;
					if (statusElement !== null) lastStatusHeightPx = statusElement.offsetHeight;
					const statusJustRemoved = predictGrowth && statusWasPresent === true && !hasStatus;
					if (statusJustRemoved) reservePx = Math.max(reservePx, tuning.runwayPx) + lastStatusHeightPx;
					statusWasPresent = hasStatus;
					const reserveEnabled = hasStatus || statusJustRemoved || reservePx > .25 || speedCpsRef.current > 90;
					const pressureReserveTarget = predictGrowth && reserveEnabled ? computeFollowReserve(speedCpsRef.current, tuning.runwayPx) : 0;
					const effectiveReserveTarget = Math.max(reservePx, pressureReserveTarget);
					const reserveStep = 1 - Math.exp(-elapsedMs / tuning.reserveResponseMs);
					reservePx += (effectiveReserveTarget - reservePx) * reserveStep;
					if (predictGrowth || runwayOffsetOf(nextPort) > .5) ensureRunway(nextPort, shiftSurfacesOf(nextPort), reservePx);
					const runwayOffset = runwayOffsetOf(nextPort);
					const contentHeight = nextPort.scrollHeight;
					const floorNow = Math.max(0, contentHeight - nextPort.clientHeight);
					const trajectoryActive = predictive && root.querySelector("[data-variant=\"think\"]") === null && runwayOffset > 0;
					let trajectoryShift;
					if (trajectoryActive) {
						const requestedMinLagPx = Math.max(20, runwayOffset - 32);
						const paintLimit = safeShiftLimit(nextPort, shiftSurfacesOf(nextPort));
						const maxLagPx = Math.max(0, paintLimit - 1);
						const minLagPx = Math.min(requestedMinLagPx, maxLagPx);
						if (trajectoryPositionPx === null || trajectoryFloorPx === null) {
							const currentShift = currentShiftOf(shiftSurfacesOf(nextPort).at(-1) ?? nextPort);
							trajectoryPositionPx = floorNow - Math.min(maxLagPx, Math.max(minLagPx, currentShift));
							trajectoryTargetVelocityPxPerMs = Math.max(0, speedCpsRef.current) * .4 / 1e3;
							trajectoryVelocityPxPerMs = trajectoryTargetVelocityPxPerMs;
							trajectoryGrowthAtMs = now;
						} else if (floorNow > trajectoryFloorPx + .5) {
							const intervalMs = Math.max(1, now - (trajectoryGrowthAtMs ?? now));
							if (trajectoryGrowthSamples > 0) {
								trajectoryAccumulatedGrowthPx += floorNow - trajectoryFloorPx;
								trajectoryAccumulatedGrowthMs += intervalMs;
								const measuredVelocity = trajectoryAccumulatedGrowthPx / trajectoryAccumulatedGrowthMs;
								const targetBlend = 1 - Math.exp(-intervalMs / 240);
								trajectoryTargetVelocityPxPerMs += (measuredVelocity - trajectoryTargetVelocityPxPerMs) * targetBlend;
							}
							trajectoryGrowthSamples += 1;
							trajectoryGrowthAtMs = now;
						} else if (floorNow < trajectoryFloorPx - .5) {
							trajectoryPositionPx = floorNow - minLagPx;
							trajectoryGrowthAtMs = now;
							trajectoryAccumulatedGrowthPx = 0;
							trajectoryAccumulatedGrowthMs = 0;
							trajectoryGrowthSamples = 0;
						}
						trajectoryFloorPx = floorNow;
						const phaseTarget = revealedCharsRef === void 0 ? floorNow : revealPhase.advance(floorNow, revealedCharsRef.current).targetPx;
						const trajectoryStep = computeFollowTrajectoryStep(elapsedMs, {
							positionPx: trajectoryPositionPx,
							velocityPxPerMs: trajectoryVelocityPxPerMs,
							targetPx: phaseTarget,
							targetVelocityPxPerMs: trajectoryTargetVelocityPxPerMs,
							minLagPx,
							maxLagPx,
							paintFloorPx: floorNow
						});
						trajectoryPositionPx = trajectoryStep.positionPx;
						trajectoryVelocityPxPerMs = trajectoryStep.velocityPxPerMs;
						trajectoryShift = trajectoryStep.shiftPx;
						trajectoryWasActive = true;
						const baselineShift = runwayOffset - Math.min(runwayOffset, Math.max(0, reservePx));
						animatedH = contentHeight - runwayOffset - Math.max(0, trajectoryShift - baselineShift);
						velocityPxPerSec = trajectoryVelocityPxPerMs * 1e3;
					} else {
						if (trajectoryWasActive) {
							const currentShift = currentShiftOf(shiftSurfacesOf(nextPort).at(-1) ?? nextPort);
							animatedH = contentHeight - runwayOffset - Math.max(0, currentShift);
							velocityPxPerSec = trajectoryVelocityPxPerMs * 1e3;
							trajectoryPositionPx = null;
							trajectoryWasActive = false;
						}
						const lag = Math.max(0, contentHeight - animatedH - runwayOffset);
						const step = computeFollowStep(dt, {
							lag,
							speedEma: speedCpsRef.current,
							velocityPxPerSec
						}, tuning);
						if (lag <= .1) {
							animatedH = contentHeight - runwayOffset;
							velocityPxPerSec = 0;
						} else {
							animatedH = Math.min(contentHeight - runwayOffset, animatedH + step.advancePx);
							velocityPxPerSec = step.velocityPxPerSec;
						}
					}
					animatedH = applyVisual(nextPort, animatedH, reservePx, velocityPxPerSec, tuning.runwayPx, Number.POSITIVE_INFINITY, !predictGrowth, trajectoryShift, elapsedMs, !hostOwnsScroll);
					if (trajectoryActive) trajectoryPositionPx = floorNow - (followLastShiftPx.get(nextPort) ?? trajectoryShift ?? 0);
					updateRevealScale(nextPort, elapsedMs);
					reportFollow(nextPort, true);
					if (isLeader(nextPort)) {
						if (!activeRef.current) enforceReadingAnchor(nextPort);
						else measureReadingAnchor(nextPort);
					}
					if (Math.max(0, nextPort.scrollHeight - animatedH - runwayOffsetOf(nextPort)) <= .25) finishEntrance();
				};
				frame(performance.now());
				return () => {
					if (!controlScrollRef.current) {
						cancelAnimationFrame(rafId);
						if (port !== null) followActivePorts.delete(port);
						unsubscribeCommit?.();
						resize?.disconnect();
						mutations?.disconnect();
						if (port !== null) for (const name of GESTURE_EVENTS) port.removeEventListener(name, markGesture);
						if (interactTimer !== null) clearTimeout(interactTimer);
						const disabledHost = rootRef.current?.closest("[data-conversation-scroll]") ?? port;
						if (disabledHost !== null) {
							clearVisual(disabledHost);
							followLeaders.delete(disabledHost);
							debugRuntime.reportFollow(disabledHost, null);
						}
						releaseRevealScale();
						return;
					}
					cancelAnimationFrame(rafId);
					if (port !== null) followActivePorts.delete(port);
					unsubscribeCommit?.();
					if (interactTimer !== null) clearTimeout(interactTimer);
					resize?.disconnect();
					mutations?.disconnect();
					if (port !== null) for (const name of GESTURE_EVENTS) port.removeEventListener(name, markGesture);
					const host = rootRef.current?.closest("[data-conversation-scroll]") ?? port;
					if (host === null) return;
					holding = null;
					if (!isLeader(host)) return;
					const preserveReader = interacting && (readerGestureIntent || readerScrolledUp(host));
					if (!following || !primed) {
						if (!following && primed) followReaderHolds.set(host, { atMs: performance.now() });
						clearVisual(host);
						followLeaders.delete(host);
						releaseRevealScale();
						debugRuntime.reportFollow(host, null);
						return;
					}
					if (preserveReader) {
						handBackVisual(host);
						followReaderHolds.set(host, { atMs: performance.now() });
						clearVisual(host);
						followLeaders.delete(host);
						releaseRevealScale();
						debugRuntime.reportFollow(host, null);
						return;
					}
					let settleQuietMs = 0;
					let settleSig = "";
					const lagBeforeCompletionPaint = Math.max(0, host.scrollHeight - animatedH - runwayOffsetOf(host));
					const currentRunway = runwayOffsetOf(host);
					const currentShift = Math.abs(currentShiftOf(shiftSurfacesOf(host).at(-1) ?? host));
					if (!activeRef.current && lagBeforeCompletionPaint <= 25 && currentRunway <= .25 && currentShift <= .25 && flowPadOf(host) <= .25) {
						followTraceUntilMs = Math.max(followTraceUntilMs, performance.now() + 1e4);
						followTrace("fast-gate", {
							sh: host.scrollHeight,
							st: Math.round(host.scrollTop),
							pad: Math.round(flowPadOf(host))
						});
						finishAtNaturalFloor(host, !startedAsEntrance);
						followLeaders.delete(host);
						releaseRevealScale();
						debugRuntime.reportFollow(host, null);
						return;
					}
					const completionShift = currentShiftOf(shiftSurfacesOf(host).at(-1) ?? host);
					const completionShiftCeiling = startedAsEntrance && completionShift <= .25 ? Number.POSITIVE_INFINITY : completionShift;
					if (hostOwnsScroll) {
						clearVisual(host);
						setFollowScrollTop(host, Math.max(0, host.scrollHeight - host.clientHeight));
						host.removeAttribute(FOLLOW_OWNED_ATTR);
						followLeaders.delete(host);
						releaseRevealScale();
						debugRuntime.reportFollow(host, null);
						return;
					}
					followTraceUntilMs = performance.now() + 15e3;
					if (pruneDeadRunway(host)) {
						followTrace("cleanup-dead-margin", {
							sh: host.scrollHeight,
							st: Math.round(host.scrollTop),
							pad: Math.round(flowPadOf(host))
						});
						reservePx = 0;
					}
					const completionTuning = debugRuntime.activeTuning();
					const previousCompletionRunway = runwayOffsetOf(host);
					ensureRunway(host, shiftSurfacesOf(host), Math.max(reservePx, Math.max(0, completionTuning.runwayPx - flowPadOf(host))));
					const completionRunway = runwayOffsetOf(host);
					measureReadingAnchor(host);
					animatedH = Math.max(0, animatedH - (completionRunway - previousCompletionRunway));
					if (!hostOwnsScroll) settleAtFloor(host);
					animatedH = applyVisual(host, animatedH, reservePx, velocityPxPerSec, completionRunway, completionShiftCeiling, false, void 0, 0, !hostOwnsScroll);
					reportFollow(host, false);
					const runwayOffset = runwayOffsetOf(host);
					if (Math.max(0, host.scrollHeight - animatedH - runwayOffset) <= .25 && runwayOffset <= .25 && reservePx <= .25) {
						finishAtNaturalFloor(host, !startedAsEntrance, !hostOwnsScroll);
						followLeaders.delete(host);
						releaseRevealScale();
						debugRuntime.reportFollow(host, null);
						return;
					}
					for (const name of GESTURE_EVENTS) host.addEventListener(name, markGesture, { passive: true });
					const stopSettleListeners = () => {
						for (const name of GESTURE_EVENTS) host.removeEventListener(name, markGesture);
						resize?.disconnect();
						mutations?.disconnect();
						if (interactTimer !== null) {
							clearTimeout(interactTimer);
							interactTimer = null;
						}
					};
					if (typeof ResizeObserver !== "undefined") {
						resize = new ResizeObserver(() => restoreBeforePaint());
						resize.observe(host);
						const proxy = resizeProxyOf(host);
						if (proxy !== null) resize.observe(proxy);
					}
					if (typeof MutationObserver !== "undefined") {
						const flow = flowElementOf(host);
						if (flow !== null) {
							mutations = new MutationObserver(() => {
								restoreBeforePaint();
							});
							mutations.observe(flow, {
								childList: true,
								subtree: true
							});
						}
					}
					followCompletionSettle.add(host);
					followCompletionSettleRows.set(host, countUserRows(host));
					handedOff = true;
					let settleLast = performance.now();
					const settleFrame = (now) => {
						if (!isLeader(host)) {
							stopSettleListeners();
							return;
						}
						if (interacting && (readerGestureIntent || readerScrolledUp(host))) {
							readerGestureIntent = false;
							handBackVisual(host);
							clearVisual(host);
							followCompletionSettle.delete(host);
							followLeaders.delete(host);
							releaseRevealScale();
							debugRuntime.reportFollow(host, null);
							stopSettleListeners();
							return;
						}
						const dt = Math.min(32, Math.max(0, now - settleLast));
						const tuning = debugRuntime.activeTuning();
						settleLast = now;
						detectHostScroll(host, Math.max(0, host.scrollHeight - host.clientHeight));
						if (hostOwnsScroll) {
							clearVisual(host);
							setFollowScrollTop(host, Math.max(0, host.scrollHeight - host.clientHeight));
							host.removeAttribute(FOLLOW_OWNED_ATTR);
							followCompletionSettle.delete(host);
							followLeaders.delete(host);
							releaseRevealScale();
							debugRuntime.reportFollow(host, null);
							stopSettleListeners();
							return;
						}
						const guardDelta = !settleRetiring && !followActivePorts.has(host) ? enforceReadingAnchor(host, true) : null;
						settleQuietMs = !settleRetiring && (guardDelta === null || Math.abs(guardDelta) <= .5) ? settleQuietMs + dt : 0;
						const settleStatus = turnStatusOf(host);
						const ownedRunwayPx = runwayOffsetOf(host);
						if (ownedRunwayPx > .25) {
							const requestedTransferPx = settleStatus === null ? ownedRunwayPx : Math.min(reservePx, (tuning.runwayPx || 72) / FOLLOW_RUNWAY_RETIRE_MS * dt);
							const transferredPx = transferRunwayToFlowPad(host, requestedTransferPx);
							if (transferredPx > 0) setFlowPad(host, Math.max(0, flowPadOf(host) - transferredPx));
							reservePx = Math.max(0, reservePx - transferredPx);
							animatedH += transferredPx;
						}
						const runwayOffset = runwayOffsetOf(host);
						const lag = Math.max(0, host.scrollHeight - animatedH - runwayOffset);
						if (!settleRetiring && lag <= .25 && reservePx <= .25 && settleQuietMs >= 240 && flowPadOf(host) > .25) {
							followTrace("retire-start", {
								pad: Math.round(flowPadOf(host)),
								sh: host.scrollHeight,
								st: Math.round(host.scrollTop)
							});
							settleRetiring = true;
						}
						if (settleRetiring) {
							const padPx = flowPadOf(host);
							const retirePx = Math.min(padPx, (tuning.runwayPx || 72) / FOLLOW_RUNWAY_RETIRE_MS * dt);
							if (padPx - retirePx <= .25) {
								setFlowPad(host, 0);
								settleRetiring = false;
							} else setFlowPad(host, padPx - retirePx);
						}
						if (lag <= .25 && (reservePx <= .25 || settleStatus === null) && flowPadOf(host) <= .25 && settleQuietMs >= 240) {
							followTrace("finish", {
								st: Math.round(host.scrollTop),
								sh: host.scrollHeight,
								pad: Math.round(flowPadOf(host))
							});
							animatedH = host.scrollHeight;
							velocityPxPerSec = 0;
							finishAtNaturalFloor(host, !startedAsEntrance, !hostOwnsScroll);
							followLeaders.delete(host);
							releaseRevealScale();
							debugRuntime.reportFollow(host, null);
							stopSettleListeners();
							return;
						}
						const step = computeFollowStep(dt, {
							lag,
							speedEma: speedCpsRef.current,
							velocityPxPerSec
						}, tuning);
						animatedH = Math.min(host.scrollHeight - runwayOffset, animatedH + step.advancePx);
						velocityPxPerSec = step.velocityPxPerSec;
						if (!hostOwnsScroll) settleAtFloor(host);
						animatedH = applyVisual(host, animatedH, reservePx, velocityPxPerSec, runwayOffset, Number.POSITIVE_INFINITY, false, void 0, 0, !hostOwnsScroll);
						if (traceActive()) {
							const sig = `${Math.round(host.scrollTop)}|${host.scrollHeight}|${Math.round(flowPadOf(host))}|${Math.round(reservePx)}|${settleRetiring}`;
							if (sig !== settleSig) {
								followTrace("settle", {
									st: Math.round(host.scrollTop),
									sh: host.scrollHeight,
									pad: Math.round(flowPadOf(host)),
									reserve: Math.round(reservePx),
									lag: Math.round(lag * 10) / 10,
									retiring: settleRetiring
								});
								settleSig = sig;
							}
						}
						reportFollow(host, false);
						requestAnimationFrame(settleFrame);
					};
					requestAnimationFrame(settleFrame);
				};
			}, [
				active,
				rootRef,
				speedCpsRef,
				revealScaleRef,
				predictive,
				predictiveRef,
				controlScroll
			]);
			(0, react.useLayoutEffect)(() => {
				const host = rootRef.current?.closest("[data-conversation-scroll]") ?? null;
				if (host !== null) followFlowFillUsers.set(host, (followFlowFillUsers.get(host) ?? 0) + 1);
				return () => {
					if (host === null) return;
					const remaining = Math.max(0, (followFlowFillUsers.get(host) ?? 1) - 1);
					if (remaining > 0) {
						followFlowFillUsers.set(host, remaining);
						return;
					}
					followFlowFillUsers.delete(host);
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							if (!followLeaders.has(host) && !followFlowFillUsers.has(host)) restoreFlowFill(host);
						});
					});
				};
			}, [rootRef]);
		}
		//#endregion
		//#region src/client/useSmoothStreamContent.ts
		/**
		* Stream-smoothing reveal hook.
		*
		* Buffers the model's chunked text and reveals it at a cadence that tracks
		* the observed arrival rate, so a long reply never dumps whole paragraphs at
		* once and a fast stream never stutters. Port of lobe-ui's smoother: EMA
		* arrival cps + chunk size, backlog pressure, commit-interval widening with
		* tail length, and a flush-speed settle drain once the input idles. The
		* reveal decision is the pure {@link computeRevealStep} for unit tests.
		*
		* `shouldHoldBack` is the performance guard's veto: while it returns true the
		* loop keeps measuring but skips the DOM commit, so an offscreen reply never
		* competes with visible frames when the frame rate is degraded.
		*/
		const PRESET_CONFIG = {
			balanced: {
				activeInputWindowMs: 220,
				defaultCps: 80,
				emaAlpha: .35,
				flushCps: 180,
				largeAppendChars: 120,
				maxActiveCps: 360,
				maxCps: 240,
				maxFlushCps: 480,
				minCps: 24,
				settleAfterMs: 280,
				settleDrainMaxMs: 420,
				settleDrainMinMs: 120,
				targetBufferMs: 40
			},
			realtime: {
				activeInputWindowMs: 140,
				defaultCps: 120,
				emaAlpha: .45,
				flushCps: 240,
				largeAppendChars: 180,
				maxActiveCps: 480,
				maxCps: 320,
				maxFlushCps: 640,
				minCps: 32,
				settleAfterMs: 200,
				settleDrainMaxMs: 280,
				settleDrainMinMs: 100,
				targetBufferMs: 24
			},
			silky: {
				activeInputWindowMs: 280,
				defaultCps: 64,
				emaAlpha: .28,
				flushCps: 140,
				largeAppendChars: 100,
				maxActiveCps: 280,
				maxCps: 180,
				maxFlushCps: 400,
				minCps: 20,
				settleAfterMs: 360,
				settleDrainMaxMs: 520,
				settleDrainMinMs: 160,
				targetBufferMs: 56
			}
		};
		const QUEUE_ACCEL_EXPONENT = 1.25;
		const CATCHUP_SECONDS = .15;
		const clamp = (value, min, max) => {
			return Math.min(max, Math.max(min, value));
		};
		/** Float-debt queue integration from `ultimate_stream_physics_scroller.html`. */
		function computeAdaptiveQueueStep(backlog, dtMs, debt, revealScale = 1, tuning = DEFAULT_STREAM_DEBUG_TUNING) {
			if (backlog <= 0 || dtMs <= 0) return {
				revealChars: 0,
				debt: 0,
				speedCps: 0
			};
			const speedCps = Math.min(tuning.maxRevealCps, 90 + Math.pow(backlog, QUEUE_ACCEL_EXPONENT) * tuning.queuePressure);
			const effectiveScale = clamp(revealScale * tuning.revealScale, .05, 2);
			const accumulated = Math.max(0, debt) + speedCps * effectiveScale * (dtMs / 1e3);
			const revealChars = Math.min(backlog, Math.floor(accumulated));
			return {
				revealChars,
				debt: revealChars >= backlog ? 0 : accumulated - revealChars,
				speedCps
			};
		}
		/** Counts user-perceived characters (code points), not UTF-16 units. */
		const countChars = (text) => {
			let count = 0;
			for (const char of text) count += 1;
			return count;
		};
		/** Pure settle-drain decision shared by the frame loop and its tests. */
		function computeSettleDrain(config, input) {
			if (input.inputActive || !input.settling) return 0;
			const overflowCps = Math.max(0, input.backlog - 300) * 1e3 / 2;
			const drainTargetMs = clamp(input.backlog * 8, config.settleDrainMinMs, config.settleDrainMaxMs);
			const settleCps = input.backlog * 1e3 / drainTargetMs;
			return clamp(Math.max(settleCps, overflowCps), config.flushCps, config.maxFlushCps);
		}
		/**
		* Fixed velocity that closes a producer-complete queue within its deadline.
		* This completion-only target may exceed the live-stream flush ceiling.
		*/
		function computeCompletionDrain(config, backlog, initialCps = 0) {
			if (backlog <= 0) return 0;
			const deadlineSeconds = clamp(backlog * 8, config.settleDrainMinMs, config.settleDrainMaxMs) / 1e3;
			const rampAreaSeconds = SETTLE_RAMP_TAU_S * (1 - Math.exp(-deadlineSeconds / SETTLE_RAMP_TAU_S));
			const deadlineCps = (backlog - Math.max(0, initialCps) * rampAreaSeconds) / Math.max(.001, deadlineSeconds - rampAreaSeconds);
			return Math.max(deadlineCps, computeSettleDrain(config, {
				backlog,
				inputActive: false,
				settling: true
			}));
		}
		/**
		* Drain rate multiplier once the input ends: leftover backlog reveals at
		* this multiple of the steady rate, so the end never drags.
		*/
		const SETTLE_DRAIN_MULTIPLIER = 1.8;
		/** Time constant for ramping the completion-drain velocity up from streaming pace. */
		const SETTLE_RAMP_TAU_S = .09;
		/** Pure per-frame reveal decision shared by the loop and its tests. */
		function computeRevealStep(config, input, dtSeconds) {
			const trackedCps = Math.max(input.emaCps, input.arrivalCpsEma);
			const baseCps = clamp(trackedCps, config.minCps, config.maxFlushCps);
			const targetLagChars = input.inputActive ? Math.max(2, Math.round(baseCps * config.targetBufferMs / 1e3)) : 0;
			let currentCps;
			if (input.steadyCps !== void 0) currentCps = input.inputActive || input.settling ? clamp(input.steadyCps * (input.inputActive ? 1 : SETTLE_DRAIN_MULTIPLIER), config.minCps, config.maxFlushCps) : 0;
			else if (input.inputActive) {
				const overflow = Math.max(0, input.backlog - 32);
				const catchup = overflow > 0 ? overflow / CATCHUP_SECONDS : 0;
				currentCps = clamp(baseCps * 1.08 + catchup, config.minCps, config.maxFlushCps);
			} else if (input.settling) currentCps = computeSettleDrain(config, input);
			else {
				const idleFlushCps = Math.max(config.flushCps, baseCps * 1.8, input.arrivalCpsEma * .8);
				currentCps = clamp(idleFlushCps, config.flushCps, config.maxFlushCps);
			}
			const minRevealChars = input.inputActive ? 1 : 2;
			return {
				revealChars: Math.max(minRevealChars, Math.round(currentCps * dtSeconds)),
				targetLagChars
			};
		}
		/**
		* Smooth a chunked content stream into a reveal-paced display string.
		*
		* @param content - The full accumulated input so far.
		* @param options - Preset, guard, and steady-rate wiring.
		* @returns The displayed content, revealed at the smoothed cadence.
		*/
		function useSmoothStreamContent(content, { enabled = true, inputComplete = false, preset = "balanced", shouldHoldBack, steadyCps, defaultCps, speedCpsRef, revealedCharsRef, revealScaleRef, onRevealCommit } = {}) {
			const config = PRESET_CONFIG[preset];
			const seedCps = defaultCps ?? config.defaultCps;
			const initialContent = enabled ? "" : content;
			const [displayedContent, setDisplayedContent] = (0, react.useState)(initialContent);
			const displayedContentRef = (0, react.useRef)(initialContent);
			const displayedCountRef = (0, react.useRef)(countChars(initialContent));
			const targetContentRef = (0, react.useRef)(initialContent);
			const targetCharsRef = (0, react.useRef)([...initialContent]);
			const targetCountRef = (0, react.useRef)(countChars(initialContent));
			const emaCpsRef = (0, react.useRef)(seedCps);
			const lastInputTsRef = (0, react.useRef)(0);
			const lastInputCountRef = (0, react.useRef)(countChars(initialContent));
			const chunkSizeEmaRef = (0, react.useRef)(1);
			const arrivalCpsEmaRef = (0, react.useRef)(seedCps);
			const rafRef = (0, react.useRef)(null);
			const lastFrameTsRef = (0, react.useRef)(null);
			const queueDebtRef = (0, react.useRef)(0);
			const settleCpsRef = (0, react.useRef)(null);
			const lastDrainCpsRef = (0, react.useRef)(0);
			const holdBackRef = (0, react.useRef)(shouldHoldBack);
			const speedOutRef = (0, react.useRef)(speedCpsRef);
			speedOutRef.current = speedCpsRef;
			const revealedCharsOutRef = (0, react.useRef)(revealedCharsRef);
			revealedCharsOutRef.current = revealedCharsRef;
			const revealScaleOutRef = (0, react.useRef)(revealScaleRef);
			revealScaleOutRef.current = revealScaleRef;
			const onRevealCommitOutRef = (0, react.useRef)(onRevealCommit);
			onRevealCommitOutRef.current = onRevealCommit;
			const inputCompleteRef = (0, react.useRef)(inputComplete);
			inputCompleteRef.current = inputComplete;
			const streamIdRef = (0, react.useRef)(`stream-${Math.random().toString(36).slice(2)}`);
			(0, react.useEffect)(() => {
				holdBackRef.current = shouldHoldBack;
			}, [shouldHoldBack]);
			const stopFrameLoop = (0, react.useCallback)(() => {
				if (rafRef.current !== null) {
					cancelAnimationFrame(rafRef.current);
					rafRef.current = null;
				}
				lastFrameTsRef.current = null;
			}, []);
			const startFrameLoopRef = (0, react.useRef)(() => {});
			const syncImmediate = (0, react.useCallback)((nextContent) => {
				stopFrameLoop();
				const chars = [...nextContent];
				const now = performance.now();
				targetContentRef.current = nextContent;
				targetCharsRef.current = chars;
				targetCountRef.current = chars.length;
				displayedContentRef.current = nextContent;
				displayedCountRef.current = chars.length;
				queueDebtRef.current = 0;
				settleCpsRef.current = null;
				lastDrainCpsRef.current = 0;
				const speedOut = speedOutRef.current;
				if (speedOut !== void 0) speedOut.current = seedCps;
				setDisplayedContent(nextContent);
				emaCpsRef.current = seedCps;
				chunkSizeEmaRef.current = 1;
				arrivalCpsEmaRef.current = seedCps;
				lastInputTsRef.current = now;
				lastInputCountRef.current = chars.length;
			}, [seedCps, stopFrameLoop]);
			const startFrameLoop = (0, react.useCallback)(() => {
				if (rafRef.current !== null) return;
				const tick = (now) => {
					const targetCount = targetCountRef.current;
					const displayedCount = displayedCountRef.current;
					const backlog = targetCount - displayedCount;
					if (backlog <= 0) {
						queueDebtRef.current = 0;
						settleCpsRef.current = null;
						const speedOut = speedOutRef.current;
						if (speedOut !== void 0) speedOut.current = seedCps;
						debugRuntime.reportStream(streamIdRef.current, null);
						stopFrameLoop();
						return;
					}
					if (lastFrameTsRef.current === null) {
						lastFrameTsRef.current = now;
						rafRef.current = requestAnimationFrame(tick);
						return;
					}
					const frameIntervalMs = Math.max(0, now - lastFrameTsRef.current);
					const dtSeconds = Math.max(.001, Math.min(frameIntervalMs / 1e3, .12));
					lastFrameTsRef.current = now;
					const idleMs = now - lastInputTsRef.current;
					const producerComplete = inputCompleteRef.current;
					const debugTuning = debugRuntime.activeTuning();
					const inputActive = !producerComplete && idleMs <= config.activeInputWindowMs;
					const settling = producerComplete || !inputActive && idleMs >= config.settleAfterMs;
					if (!producerComplete) settleCpsRef.current = null;
					let revealChars;
					let revealSpeedCps;
					let nextQueueDebt = 0;
					if (producerComplete) {
						const previousCps = lastDrainCpsRef.current > 0 ? lastDrainCpsRef.current : Math.max(config.minCps, emaCpsRef.current);
						const drainTargetCps = settleCpsRef.current ?? computeCompletionDrain(config, backlog, previousCps);
						settleCpsRef.current = drainTargetCps;
						const rampedCps = previousCps + (drainTargetCps - previousCps) * (1 - Math.exp(-dtSeconds / SETTLE_RAMP_TAU_S));
						const settleCps = Math.min(drainTargetCps, Math.max(previousCps, rampedCps));
						lastDrainCpsRef.current = Math.min(drainTargetCps, rampedCps);
						const accumulated = Math.max(0, queueDebtRef.current) + settleCps * dtSeconds;
						revealChars = Math.min(backlog, Math.floor(accumulated));
						revealSpeedCps = settleCps;
						nextQueueDebt = revealChars >= backlog ? 0 : accumulated - revealChars;
						if (revealChars >= backlog) lastDrainCpsRef.current = 0;
					} else if (steadyCps !== void 0) {
						const step = computeRevealStep(config, {
							backlog,
							chunkSizeEma: chunkSizeEmaRef.current,
							arrivalCpsEma: arrivalCpsEmaRef.current,
							emaCps: emaCpsRef.current,
							inputActive,
							settling,
							steadyCps
						}, dtSeconds);
						revealChars = Math.min(Math.round(step.revealChars * debugTuning.revealScale), backlog);
						revealSpeedCps = frameIntervalMs > 0 ? revealChars * 1e3 / frameIntervalMs : 0;
					} else {
						const step = computeAdaptiveQueueStep(backlog, frameIntervalMs, queueDebtRef.current, revealScaleOutRef.current?.current ?? 1, debugTuning);
						revealChars = step.revealChars;
						revealSpeedCps = step.speedCps;
						nextQueueDebt = step.debt;
					}
					debugRuntime.reportStream(streamIdRef.current, {
						backlog,
						speedCps: revealSpeedCps,
						targetChars: targetCount,
						displayedChars: displayedCount,
						active: !producerComplete
					});
					if (holdBackRef.current?.() === true) {
						rafRef.current = requestAnimationFrame(tick);
						return;
					}
					queueDebtRef.current = nextQueueDebt;
					const speedOut = speedOutRef.current;
					if (speedOut !== void 0) speedOut.current = revealSpeedCps;
					if (revealChars <= 0) {
						rafRef.current = requestAnimationFrame(tick);
						return;
					}
					const nextCount = displayedCount + revealChars;
					const segment = targetCharsRef.current.slice(displayedCount, nextCount).join("");
					if (segment) {
						const nextDisplayed = displayedContentRef.current + segment;
						displayedContentRef.current = nextDisplayed;
						displayedCountRef.current = nextCount;
						setDisplayedContent(nextDisplayed);
					} else {
						displayedContentRef.current = targetContentRef.current;
						displayedCountRef.current = targetCount;
						setDisplayedContent(targetContentRef.current);
					}
					rafRef.current = requestAnimationFrame(tick);
				};
				rafRef.current = requestAnimationFrame(tick);
			}, [
				config,
				seedCps,
				stopFrameLoop,
				steadyCps
			]);
			(0, react.useLayoutEffect)(() => {
				const revealedCharsOut = revealedCharsOutRef.current;
				if (revealedCharsOut !== void 0) revealedCharsOut.current = displayedCountRef.current;
				if (displayedContent === "") return;
				onRevealCommitOutRef.current?.();
			}, [displayedContent]);
			(0, react.useEffect)(() => {
				startFrameLoopRef.current = startFrameLoop;
			}, [startFrameLoop]);
			(0, react.useEffect)(() => {
				if (!enabled) {
					syncImmediate(content);
					return;
				}
				const prevTargetContent = targetContentRef.current;
				if (content === prevTargetContent) return;
				const now = performance.now();
				if (!content.startsWith(prevTargetContent)) {
					syncImmediate(content);
					return;
				}
				const appendedChars = [...content.slice(prevTargetContent.length)];
				const appendedCount = appendedChars.length;
				targetContentRef.current = content;
				targetCharsRef.current.push(...appendedChars);
				targetCountRef.current += appendedCount;
				settleCpsRef.current = null;
				const hadSample = lastInputTsRef.current > 0;
				const deltaChars = targetCountRef.current - lastInputCountRef.current;
				const deltaMs = Math.max(1, now - lastInputTsRef.current);
				if (hadSample && deltaChars > 0) {
					const instantCps = deltaChars * 1e3 / deltaMs;
					const normalizedInstantCps = clamp(instantCps, config.minCps, config.maxFlushCps * 3);
					const chunkEmaAlpha = .45;
					chunkSizeEmaRef.current = chunkSizeEmaRef.current * .55 + appendedCount * chunkEmaAlpha;
					arrivalCpsEmaRef.current = arrivalCpsEmaRef.current * .55 + normalizedInstantCps * chunkEmaAlpha;
					emaCpsRef.current = emaCpsRef.current * (1 - config.emaAlpha) + normalizedInstantCps * config.emaAlpha;
				}
				lastInputTsRef.current = now;
				lastInputCountRef.current = targetCountRef.current;
				startFrameLoop();
			}, [
				content,
				enabled,
				config,
				startFrameLoop,
				syncImmediate
			]);
			(0, react.useEffect)(() => {
				return () => {
					stopFrameLoop();
					debugRuntime.reportStream(streamIdRef.current, null);
				};
			}, [stopFrameLoop]);
			return displayedContent;
		}
		//#endregion
		//#region src/client/useFpsGuard.ts
		/**
		* Performance guard for the streaming reveal.
		*
		* Feeds an EMA-smoothed frame-rate monitor from a rAF loop while streaming
		* and tracks whether the reply is on-screen. The returned `shouldHoldBack`
		* predicate is true only while the frame rate is below the threshold AND the
		* reply is offscreen — exactly the spec's "skip offscreen DOM updates when
		* FPS < 30" rule. The smoother consumes the predicate as its commit veto.
		*/
		const FPS_THRESHOLD = 30;
		const FPS_ALPHA = .12;
		const RECOVER_FRAMES = 6;
		const MAX_FRAME_MS = 100;
		function useFpsGuard(active) {
			const fpsRef = (0, react.useRef)({
				emaMs: 0,
				lastMs: 0,
				healthyRun: 0,
				degraded: false
			});
			const visibleRef = (0, react.useRef)(true);
			const elementRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!active) return;
				let rafId = 0;
				let lastDebugReport = 0;
				const frame = (now) => {
					rafId = requestAnimationFrame(frame);
					const fps = fpsRef.current;
					if (fps.lastMs === 0) {
						fps.lastMs = now;
						return;
					}
					const delta = Math.min(MAX_FRAME_MS, Math.max(1, now - fps.lastMs));
					fps.lastMs = now;
					fps.emaMs = fps.emaMs === 0 ? delta : fps.emaMs + FPS_ALPHA * (delta - fps.emaMs);
					const currentFps = 1e3 / fps.emaMs;
					if (currentFps < FPS_THRESHOLD) {
						fps.healthyRun = 0;
						fps.degraded = true;
					} else if (fps.degraded) {
						fps.healthyRun += 1;
						if (fps.healthyRun >= RECOVER_FRAMES) fps.degraded = false;
					}
					if (now - lastDebugReport >= 100) {
						debugRuntime.reportFps(currentFps, fps.emaMs, fps.degraded);
						lastDebugReport = now;
					}
				};
				rafId = requestAnimationFrame(frame);
				return () => {
					cancelAnimationFrame(rafId);
					fpsRef.current = {
						emaMs: 0,
						lastMs: 0,
						healthyRun: 0,
						degraded: false
					};
					debugRuntime.clearFps();
				};
			}, [active]);
			const ref = (0, react.useCallback)((element) => {
				elementRef.current = element;
			}, []);
			(0, react.useEffect)(() => {
				const element = elementRef.current;
				if (element === null || typeof IntersectionObserver === "undefined") return;
				const observer = new IntersectionObserver((entries) => {
					for (const entry of entries) visibleRef.current = entry.isIntersecting;
				}, { rootMargin: "120px 0px" });
				observer.observe(element);
				return () => observer.disconnect();
			});
			return {
				ref,
				shouldHoldBack: (0, react.useCallback)(() => {
					return active && fpsRef.current.degraded && !visibleRef.current;
				}, [active])
			};
		}
		//#endregion
		//#region src/client/FollowHost.tsx
		/**
		* Document-flow host that owns conversation-port follow while `active`.
		* Shared by assistant blocks and every other Agent Chat row. `onGrowth` lets
		* generic wrapped renderers re-arm one glide when their DOM grows without
		* requiring a business-kind-specific lifecycle predicate.
		*/
		function FollowHost({ active, entrance = false, onEntranceSettled, onGrowth, entranceExtentRef, speedCpsRef, revealedCharsRef, revealScaleRef, predictive = true, predictiveRef, controlScroll = true, hostRef, className, entranceActive, children }) {
			const localRootRef = (0, react.useRef)(null);
			const rootRef = hostRef ?? localRootRef;
			useConversationFollow(rootRef, active || entrance, speedCpsRef, revealScaleRef, predictive, entrance, onEntranceSettled, predictiveRef, entranceExtentRef, revealedCharsRef, controlScroll);
			(0, react.useEffect)(() => {
				if (onGrowth === void 0 || typeof ResizeObserver === "undefined") return;
				const root = rootRef.current;
				if (root === null) return;
				let previousHeight = null;
				let pendingGrowth = 0;
				let growthFrame = null;
				const flushGrowth = () => {
					growthFrame = null;
					if (pendingGrowth <= 0) return;
					const delta = pendingGrowth;
					pendingGrowth = 0;
					onGrowth(delta);
				};
				const observer = new ResizeObserver((entries) => {
					const measuredHeight = entries[0]?.contentRect.height;
					if (measuredHeight === void 0 || !Number.isFinite(measuredHeight)) return;
					const nextHeight = measuredHeight;
					if (previousHeight !== null && nextHeight > previousHeight + .5) {
						pendingGrowth += nextHeight - previousHeight;
						if (growthFrame === null) growthFrame = requestAnimationFrame(flushGrowth);
					}
					previousHeight = nextHeight;
				});
				observer.observe(root);
				return () => {
					observer.disconnect();
					if (growthFrame !== null) cancelAnimationFrame(growthFrame);
				};
			}, [onGrowth]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				className: className === void 0 ? TypewriterAssistantNodeView_module_css_default.follow : `${TypewriterAssistantNodeView_module_css_default.follow} ${className}`,
				"data-entrance": entranceActive === void 0 ? void 0 : entranceActive ? "active" : "idle",
				children
			});
		}
		//#endregion
		//#region src/config.ts
		/** Defaults shared by the Host schema and the client-side fallback. */
		const DEFAULT_STREAM_CONFIG = {
			mode: "typewriter",
			preset: "balanced",
			revealCharsPerSec: 80,
			scrollSpeedPxPerSec: 48,
			maxScrollSpeedPxPerSec: 1e3
		};
		/**
		* Window global the Host writes into the served index HTML. The browser boot
		* graph carries no per-entry config, so this inline script is the only
		* Host-to-client configuration channel for a composed web plugin.
		*/
		const STREAM_BOOT_GLOBAL = "__DSH_SMOOTH_STREAM_CONFIG__";
		//#endregion
		//#region src/client/TypewriterAssistantNodeView.tsx
		function usePrefersReducedMotion() {
			const [reduced, setReduced] = (0, react.useState)(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
			(0, react.useEffect)(() => {
				if (typeof window === "undefined" || window.matchMedia === void 0) return;
				const query = window.matchMedia("(prefers-reduced-motion: reduce)");
				const onChange = () => setReduced(query.matches);
				query.addEventListener("change", onChange);
				return () => query.removeEventListener("change", onChange);
			}, []);
			return reduced;
		}
		/**
		* Resolve whether the reveal engine should stay off for this view. The OS
		* preference wins only in `auto` mode: `force-smooth` keeps the engine on
		* machines where a system-wide reduce-motion switch (or a forced browser
		* flag) would otherwise silently bypass smoothing, and `force-reduced`
		* disables it even when the OS asks for motion. Credit: three-state design
		* proposed by @Zn-Dk in #21/#22.
		*/
		function useMotionReduced(preference) {
			const system = usePrefersReducedMotion();
			if (preference === "force-smooth") return false;
			if (preference === "force-reduced") return true;
			return system;
		}
		/** Conservative fallback before the streaming Markdown tail has geometry. */
		const PREDICTIVE_WRAP_FALLBACK_CHARS = 32;
		const STREAM_ANNOUNCEMENT_INTERVAL_MS = 800;
		const STREAM_ANNOUNCEMENT_MAX_CHARS = 320;
		function approximateInlineWidth(text, emPx) {
			let width = 0;
			for (const char of text) if (/\s/u.test(char)) width += emPx * .33;
			else if (/^[\x00-\x7f]$/u.test(char)) width += emPx * .56;
			else width += emPx;
			return width;
		}
		function measurePendingTextGeometry(root, visibleText) {
			if (typeof document.createTreeWalker !== "function" || typeof NodeFilter === "undefined") return {
				root,
				visibleText,
				fontSize: 14,
				wrapThresholdWidth: null
			};
			const rootRect = root.getBoundingClientRect();
			const rootWidth = Math.max(0, rootRect.width, rootRect.right - rootRect.left, root.clientWidth);
			if (rootWidth <= 0) return {
				root,
				visibleText,
				fontSize: 14,
				wrapThresholdWidth: null
			};
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let tail = null;
			for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) if ((node.textContent ?? "").length > 0) tail = node;
			const parent = tail?.parentElement ?? root;
			const fontSize = Number.parseFloat(getComputedStyle(parent).fontSize) || 14;
			if (tail === null || typeof document.createRange !== "function") return {
				root,
				visibleText,
				fontSize,
				wrapThresholdWidth: rootWidth
			};
			try {
				const length = tail.textContent?.length ?? 0;
				if (length <= 0) return {
					root,
					visibleText,
					fontSize,
					wrapThresholdWidth: rootWidth
				};
				const range = document.createRange();
				range.setStart(tail, Math.max(0, length - 1));
				range.setEnd(tail, length);
				const tailRect = range.getBoundingClientRect();
				const contentRight = rootRect.right;
				if (!Number.isFinite(tailRect.right) || tailRect.right <= rootRect.left || contentRight <= rootRect.left) return {
					root,
					visibleText,
					fontSize,
					wrapThresholdWidth: rootWidth
				};
				return {
					root,
					visibleText,
					fontSize,
					wrapThresholdWidth: Math.max(0, contentRight - tailRect.right) + fontSize * .35
				};
			} catch {
				return {
					root,
					visibleText,
					fontSize,
					wrapThresholdWidth: rootWidth
				};
			}
		}
		/** Whether buffered source can reach a new visual line before it drains. */
		function pendingTextCanGrow(root, visibleText, pending, geometryRef) {
			if (pending === "") return false;
			if (/[\r\n]/u.test(pending)) return true;
			const pendingChars = [...pending];
			if (root === null) return pendingChars.length >= PREDICTIVE_WRAP_FALLBACK_CHARS;
			let geometry = geometryRef.current;
			if (geometry?.root !== root || geometry.visibleText !== visibleText) {
				geometry = measurePendingTextGeometry(root, visibleText);
				geometryRef.current = geometry;
			}
			if (geometry.wrapThresholdWidth === null) return pendingChars.length >= PREDICTIVE_WRAP_FALLBACK_CHARS;
			return approximateInlineWidth(pending, geometry.fontSize) >= geometry.wrapThresholdWidth;
		}
		function announcementChunkEnd(source, start) {
			const hardEnd = Math.min(source.length, start + STREAM_ANNOUNCEMENT_MAX_CHARS);
			if (hardEnd === source.length) return hardEnd;
			const softStart = start + Math.floor(STREAM_ANNOUNCEMENT_MAX_CHARS * .6);
			for (let index = hardEnd - 1; index >= softStart; index -= 1) if (/[\s.,;:!?]/u.test(source[index] ?? "")) return index + 1;
			return hardEnd;
		}
		/** A commit-driven live region isolated from the visible Markdown subtree. */
		const StreamAnnouncement = (0, react.memo)(function StreamAnnouncement({ text, active }) {
			const [announcement, setAnnouncement] = (0, react.useState)({
				text: "",
				revision: 0,
				present: active
			});
			const sourceRef = (0, react.useRef)(text);
			const activeRef = (0, react.useRef)(active);
			const announcedOffsetRef = (0, react.useRef)(active ? 0 : text.length);
			const drainSourceRef = (0, react.useRef)(null);
			const timerRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const clearTimer = () => {
					if (timerRef.current === null) return;
					clearTimeout(timerRef.current);
					timerRef.current = null;
				};
				const publishNext = (source) => {
					const start = Math.min(announcedOffsetRef.current, source.length);
					const end = announcementChunkEnd(source, start);
					if (end <= start) return false;
					announcedOffsetRef.current = end;
					setAnnouncement((previous) => ({
						text: source.slice(start, end),
						revision: previous.revision + 1,
						present: true
					}));
					return end < source.length;
				};
				const hideAfterLinger = () => {
					timerRef.current = setTimeout(() => {
						timerRef.current = null;
						if (activeRef.current) return;
						drainSourceRef.current = null;
						setAnnouncement((previous) => ({
							...previous,
							present: false
						}));
					}, STREAM_ANNOUNCEMENT_INTERVAL_MS);
				};
				const drainNext = () => {
					const source = drainSourceRef.current;
					if (source === null) return;
					if (!publishNext(source)) {
						hideAfterLinger();
						return;
					}
					timerRef.current = setTimeout(() => {
						timerRef.current = null;
						if (activeRef.current) return;
						drainNext();
					}, STREAM_ANNOUNCEMENT_INTERVAL_MS);
				};
				const scheduleLive = () => {
					if (timerRef.current !== null || announcedOffsetRef.current >= sourceRef.current.length) return;
					timerRef.current = setTimeout(() => {
						timerRef.current = null;
						if (!activeRef.current) return;
						const source = sourceRef.current;
						if (publishNext(source)) scheduleLive();
					}, STREAM_ANNOUNCEMENT_INTERVAL_MS);
				};
				const wasActive = activeRef.current;
				const previousSource = sourceRef.current;
				if (!(!active && !wasActive && drainSourceRef.current !== null) && (!text.startsWith(previousSource) || announcedOffsetRef.current > text.length)) announcedOffsetRef.current = 0;
				sourceRef.current = text;
				activeRef.current = active;
				if (active) {
					if (!wasActive) {
						clearTimer();
						drainSourceRef.current = null;
						setAnnouncement((previous) => ({
							text: "",
							revision: previous.revision + 1,
							present: true
						}));
					}
					scheduleLive();
					return;
				}
				if (!wasActive) {
					if (drainSourceRef.current === null) announcedOffsetRef.current = text.length;
					return;
				}
				clearTimer();
				drainSourceRef.current = text;
				drainNext();
			}, [active, text]);
			(0, react.useEffect)(() => () => {
				if (timerRef.current !== null) clearTimeout(timerRef.current);
				timerRef.current = null;
			}, []);
			if (!active && !announcement.present) return null;
			const activating = active && !activeRef.current;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: TypewriterAssistantNodeView_module_css_default.visuallyHidden,
				"aria-live": "polite",
				"aria-atomic": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: activating ? "" : announcement.text }, announcement.revision)
			});
		});
		/**
		* Smooth streaming text arm. While the reply runs, the accumulated source is
		* revealed through the smoother at a rate that tracks the model's arrival
		* and rendered by the Harness `MarkdownText`
		* streaming arm (incremental parse, frozen non-tail blocks), so there is no
		* raw-text tail and no text-to-markdown swap: the tree stays markdown
		* throughout. The last text block owns conversation-port follow so wraps
		* glide instead of snapping. Once the stream closes and the reveal queue
		* drains, the settled full parse (KaTeX math, fence highlighting, file
		* mentions) swaps in exactly once.
		*/
		function AnimatedMarkdownText({ text, labels, fileMentions, streaming, motionReduced, ownFollow, followSpeedCpsRef, followRevealedCharsRef, followRevealScaleRef, onPredictiveChange, preset, shouldHoldBack, controlScroll = true }) {
			const reduced = motionReduced;
			const [typing, setTyping] = (0, react.useState)(streaming);
			const localSpeedCpsRef = (0, react.useRef)(35);
			const followRootRef = (0, react.useRef)(null);
			const predictionSourceRef = (0, react.useRef)(null);
			const predictionStateRef = (0, react.useRef)(false);
			const predictionGeometryRef = (0, react.useRef)(null);
			const speedCpsRef = followSpeedCpsRef ?? localSpeedCpsRef;
			const displayed = useSmoothStreamContent(text, {
				enabled: typing && !reduced,
				inputComplete: !streaming,
				preset,
				shouldHoldBack,
				speedCpsRef,
				revealedCharsRef: followRevealedCharsRef,
				revealScaleRef: followRevealScaleRef,
				onRevealCommit: () => {
					notifyFollowCommit(followRootRef.current);
				}
			});
			const shown = reduced ? text : displayed;
			const live = typing && !reduced;
			(0, react.useEffect)(() => {
				const root = followRootRef.current;
				if (root === null || typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(() => {
					if (predictionGeometryRef.current?.root === root) predictionGeometryRef.current = null;
				});
				observer.observe(root);
				return () => {
					observer.disconnect();
				};
			}, []);
			(0, react.useLayoutEffect)(() => {
				if (onPredictiveChange === void 0) return;
				const pending = text.slice(shown.length);
				const sourceChanged = predictionSourceRef.current !== text;
				const next = !live || !streaming || pending === "" ? false : sourceChanged ? pendingTextCanGrow(followRootRef.current, shown, pending, predictionGeometryRef) : predictionStateRef.current;
				predictionSourceRef.current = text;
				predictionStateRef.current = next;
				onPredictiveChange(next);
			}, [
				live,
				onPredictiveChange,
				shown,
				streaming,
				text
			]);
			(0, react.useEffect)(() => {
				if (typing && !streaming && shown.length === text.length) setTyping(false);
			}, [
				shown,
				streaming,
				text,
				typing
			]);
			(0, react.useEffect)(() => {
				if (streaming) setTyping(true);
			}, [streaming]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FollowHost, {
				active: live && ownFollow,
				speedCpsRef,
				revealedCharsRef: followRevealedCharsRef,
				revealScaleRef: followRevealScaleRef,
				predictive: streaming,
				controlScroll,
				hostRef: followRootRef,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text: live ? shown : text,
					streaming: live,
					labels,
					fileMentions: live ? void 0 : fileMentions
				})
			});
		}
		/**
		* Apply searchable hidden state without unmounting a stable subtree — the
		* Host's completion fold hides the answer-inline reasoning this way, so the
		* takeover renderer must reproduce it to stay inside the contract: the row
		* disappears into the Host's process summary and comes back on find-in-page.
		* (Mirrors the Harness chat kit's `useSearchableHidden`.)
		*/
		function useSearchableHidden(hidden, reveal) {
			const ref = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const element = ref.current;
				if (element === null) return;
				if (hidden && element.contains(element.ownerDocument.activeElement)) {
					reveal();
					return;
				}
				if (hidden) element.setAttribute("hidden", "until-found");
				else element.removeAttribute("hidden");
			}, [hidden, reveal]);
			(0, react.useEffect)(() => {
				const element = ref.current;
				if (element === null) return;
				element.addEventListener("beforematch", reveal);
				return () => {
					element.removeEventListener("beforematch", reveal);
				};
			}, [reveal]);
			return ref;
		}
		/**
		* One answer-inline reasoning block wrapped in the Host's fold contract. The
		* Host computes the fold decision (turn closed, compact transcript, this node
		* is the answer) and delivers it through the `turnProcess` owner prop; when
		* folded the block hides into the Host's "thought" summary row instead of
		* staying mounted above the answer.
		*/
		function FoldableReasoning({ hidden, reveal, children }) {
			const ref = useSearchableHidden(hidden, reveal);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref,
				"data-turn-process-inline": hidden || void 0,
				children
			});
		}
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		function latestLine(text) {
			const visible = text.trimEnd();
			const newline = visible.lastIndexOf("\n");
			return newline === -1 ? visible : visible.slice(newline + 1);
		}
		/**
		* Built-in Think disclosure with a smoothed `text` feed. Chevron and row
		* click stay on the disclosure chrome, which the plugin's AnimatedDisclosure
		* renders with a height-animated body (the harness primitive would mount and
		* unmount it, which cannot glide). The row opens only while this block is
		* the streaming tail and closes as soon as thinking ends — a later block,
		* or the assistant node settling — not when the rest of the reply is
		* still streaming.
		*/
		function AnimatedReasoning({ text, running, preset, thinkAutoExpand, motionReduced, shouldHoldBack, followSpeedCpsRef, followRevealScaleRef, t }) {
			const reduced = motionReduced;
			const [expanded, setExpanded] = (0, react.useState)(running && thinkAutoExpand);
			const [autoClosed, setAutoClosed] = (0, react.useState)(false);
			const summaryRef = (0, react.useRef)(null);
			const commitAnchorRef = (0, react.useRef)(null);
			const displayed = useSmoothStreamContent(text, {
				enabled: running && !reduced,
				preset,
				shouldHoldBack,
				speedCpsRef: followSpeedCpsRef,
				revealScaleRef: followRevealScaleRef,
				onRevealCommit: () => {
					notifyFollowCommit(commitAnchorRef.current);
				}
			});
			const shown = running && !reduced ? displayed : text;
			const summary = running ? latestLine(shown) : firstLine(text);
			(0, react.useLayoutEffect)(() => {
				if (thinkAutoExpand) {
					setExpanded(running);
					setAutoClosed(!running);
				}
				notifyFollowCommit(commitAnchorRef.current);
			}, [running, thinkAutoExpand]);
			(0, react.useEffect)(() => {
				const element = summaryRef.current;
				if (element === null) return;
				element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0;
			}, [running, summary]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: TypewriterAssistantNodeView_module_css_default.follow,
				ref: commitAnchorRef,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: TypewriterAssistantNodeView_module_css_default.think,
					"data-variant": "think",
					"data-state": running ? "running" : "ok",
					children: [running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TypewriterAssistantNodeView_module_css_default.visuallyHidden,
						children: t("row.running")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnimatedDisclosure, {
						rowClassName: TypewriterAssistantNodeView_module_css_default.thinkRow,
						leadingClassName: TypewriterAssistantNodeView_module_css_default.thinkLeading,
						titleClassName: TypewriterAssistantNodeView_module_css_default.thinkTitle,
						chevronClassName: TypewriterAssistantNodeView_module_css_default.thinkChevron,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 }),
						title: "Think",
						open: expanded,
						onToggle: () => {
							setAutoClosed(false);
							setExpanded((value) => !value);
						},
						bodyTransition: !autoClosed,
						collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TypewriterAssistantNodeView_module_css_default.thinkSeparator,
							"aria-hidden": true
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							ref: summaryRef,
							className: TypewriterAssistantNodeView_module_css_default.thinkSummary,
							"data-follow-end": running || void 0,
							children: summary
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: TypewriterAssistantNodeView_module_css_default.thinkBody,
							children: shown
						})
					})]
				})
			});
		}
		/**
		* Assistant node renderer for the typewriter overlay. Text observed while
		* streaming is revealed by the smoother through the Harness Markdown
		* renderer at a rate that tracks arrival. Reasoning blocks keep the
		* built-in Think disclosure and only receive a smoothed text feed; the
		* outer node owns conversation-port follow while streaming; the final text
		* block keeps ownership while its settled reveal queue drains. The FPS guard
		* holds offscreen reveals when the frame rate is degraded. Settled text
		* renders with the full Markdown pipeline.
		*/
		const TypewriterAssistantNodeView = (0, react.memo)(function TypewriterAssistantNodeView({ mode: _mode = DEFAULT_STREAM_CONFIG.mode, preset = DEFAULT_STREAM_CONFIG.preset, revealCharsPerSec: _revealCharsPerSec = DEFAULT_STREAM_CONFIG.revealCharsPerSec, scrollSpeedPxPerSec: _scrollSpeedPxPerSec = DEFAULT_STREAM_CONFIG.scrollSpeedPxPerSec, maxScrollSpeedPxPerSec: _maxScrollSpeedPxPerSec = DEFAULT_STREAM_CONFIG.maxScrollSpeedPxPerSec, thinkAutoExpand = DEFAULT_STREAM_SETTINGS.thinkAutoExpand, controlScroll = true, motionPreference = DEFAULT_STREAM_SETTINGS.motionPreference, node, useTurnData, openFile, renderMessageImages, fileMentions, turnProcess, t }) {
			const data = node.data;
			const streaming = data.status === "running";
			const reduced = useMotionReduced(motionPreference);
			const reasoningHidden = turnProcess !== void 0 && turnProcess.foldable && turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning && !turnProcess.open;
			const revealProcess = (0, react.useCallback)(() => {
				turnProcess?.setOpen(true);
			}, [turnProcess]);
			const { ref: guardRef, shouldHoldBack } = useFpsGuard(streaming);
			const rootSpeedRef = (0, react.useRef)(35);
			const rootRevealedCharsRef = (0, react.useRef)(0);
			const rootRevealScaleRef = (0, react.useRef)(1);
			const reasoningTailIndex = streaming && data.blocks[data.blocks.length - 1]?.kind === "reasoning" ? data.blocks.length - 1 : -1;
			const reasoningOwnsSpeed = reasoningTailIndex !== -1;
			const rootPredictiveRef = (0, react.useRef)(false);
			const previousReasoningTailRef = (0, react.useRef)(-1);
			if (reasoningTailIndex !== previousReasoningTailRef.current) {
				rootPredictiveRef.current = false;
				if (!reasoningOwnsSpeed) rootSpeedRef.current = 35;
				previousReasoningTailRef.current = reasoningTailIndex;
			}
			const updateTextPrediction = (0, react.useMemo)(() => (predictive) => {
				rootPredictiveRef.current = predictive;
			}, []);
			const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
			const tail = useTurnData("turn-tail");
			const owner = (0, react.useMemo)(() => {
				if (turn?.status !== "closed" || data.finalNode === void 0) return void 0;
				if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return void 0;
				return {
					turn,
					seq: data.finalNode.seq,
					openFile
				};
			}, [
				data.finalNode,
				openFile,
				tail,
				turn
			]);
			const mentions = (0, react.useMemo)(() => owner === void 0 ? void 0 : fileMentions(owner), [fileMentions, owner]);
			const markdownLabels = (0, react.useMemo)(() => ({
				code: {
					copyLabel: t("copy"),
					copiedLabel: t("copied")
				},
				footnotes: t("markdown.footnotes")
			}), [t]);
			if (!(streaming || data.status === "interrupted" || data.blocks.some((block) => block.kind !== "tool-call"))) return null;
			const announcementText = data.blocks.filter((block) => block.kind === "text").map((block) => block.text).join("\n");
			const rendered = [];
			const last = data.blocks.length - 1;
			let lastFollow = -1;
			for (let index = 0; index < data.blocks.length; index += 1) {
				const kind = data.blocks[index]?.kind;
				if (kind === "text" || kind === "reasoning") lastFollow = index;
			}
			for (let index = 0; index < data.blocks.length; index += 1) {
				const block = data.blocks[index];
				if (block === void 0) continue;
				switch (block.kind) {
					case "text":
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnimatedMarkdownText, {
							text: block.text,
							labels: markdownLabels,
							fileMentions: mentions,
							streaming,
							motionReduced: reduced,
							ownFollow: !streaming && index === lastFollow,
							followSpeedCpsRef: index === lastFollow ? rootSpeedRef : void 0,
							followRevealedCharsRef: index === lastFollow ? rootRevealedCharsRef : void 0,
							followRevealScaleRef: index === lastFollow ? rootRevealScaleRef : void 0,
							onPredictiveChange: index === lastFollow ? updateTextPrediction : void 0,
							preset,
							shouldHoldBack,
							controlScroll
						}, index));
						break;
					case "reasoning":
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FoldableReasoning, {
							hidden: reasoningHidden,
							reveal: revealProcess,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnimatedReasoning, {
								text: block.text,
								running: streaming && index === last,
								preset,
								thinkAutoExpand,
								motionReduced: reduced,
								shouldHoldBack,
								followSpeedCpsRef: reasoningOwnsSpeed && index === last ? rootSpeedRef : void 0,
								followRevealScaleRef: reasoningOwnsSpeed && index === last ? rootRevealScaleRef : void 0,
								t
							})
						}, index));
						break;
					case "image": {
						const start = index;
						const group = [{ attachment: block.attachment }];
						while (index + 1 < data.blocks.length) {
							const next = data.blocks[index + 1];
							if (next === void 0 || next.kind !== "image") break;
							group.push({ attachment: next.attachment });
							index += 1;
						}
						rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderMessageImages({
							images: group,
							align: "start"
						}) }, start));
						break;
					}
					case "tool-call": break;
					case "other": rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
						label: t("message.unknownBlock"),
						payload: block.block,
						truncatedLabel: (total) => t("json.truncated", { total })
					}, index));
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: guardRef,
				className: TypewriterAssistantNodeView_module_css_default.root,
				"data-streaming": streaming || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StreamAnnouncement, {
					text: announcementText,
					active: streaming && !reduced
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FollowHost, {
					active: streaming && !reduced,
					speedCpsRef: rootSpeedRef,
					revealedCharsRef: rootRevealedCharsRef,
					revealScaleRef: rootRevealScaleRef,
					predictiveRef: rootPredictiveRef,
					controlScroll,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TypewriterAssistantNodeView_module_css_default.body,
						children: [rendered, data.status === "interrupted" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TypewriterAssistantNodeView_module_css_default.stopped,
							children: t("message.stopped")
						})]
					})
				})]
			});
		});
		//#endregion
		//#region src/client/useProgressiveDomText.ts
		/**
		* Progressive text reveal for opaque Agent renderers.
		*
		* Slot renderers own arbitrary React trees, so the generic integration cannot
		* clone or classify their business components. This hook leaves that tree and
		* all of its event handlers in place, and only paces visible Text node data
		* while the row belongs to the live Agent turn. No clip, mask, overlay, or
		* duplicate accessibility tree is introduced.
		*/
		/** Last presented text per root, retained across follow lifecycle flips. */
		const ledgerByRoot = /* @__PURE__ */ new WeakMap();
		const SKIP_TEXT_SELECTOR = [
			"[aria-hidden=\"true\"]",
			"[aria-live]",
			"[contenteditable=\"true\"]",
			"script",
			"style",
			"textarea"
		].join(",");
		function revealable(node, root) {
			if (node.data.trim() === "") return false;
			const parent = node.parentElement;
			return parent !== null && root.contains(parent) && parent.closest(SKIP_TEXT_SELECTOR) === null;
		}
		function commonPrefix(left, right) {
			const limit = Math.min(left.length, right.length);
			let index = 0;
			while (index < limit && left[index] === right[index]) index += 1;
			return index;
		}
		/**
		* Pace text inside a renderer whose React component is intentionally opaque.
		* Initial content is revealed only for a genuinely new row; later mutations
		* stay paced until `enabled` becomes false, at which point the full renderer
		* content is restored synchronously before paint.
		* @param rootRef - Host element whose Text nodes this hook owns.
		* @param enabled - Whether the row currently belongs to the live Agent turn.
		* @param revealInitial - Whether a freshly mounted row's existing text is paced.
		* @param speedCpsRef - Shared reveal-cadence ref also read by the follower.
		* @param onSettled - Invoked once each time the queue drains.
		* @param pace - False renders every text node at full length while keeping the
		* ledger, settle announcements, and lifecycle identical to a finished reveal.
		* Rows that must not type (the fork's Tool cards) use it so their content
		* appears instantly without losing the shared entrance/follow bookkeeping.
		*/
		function useProgressiveDomText(rootRef, enabled, revealInitial, speedCpsRef, onSettled, pace = true) {
			(0, react.useLayoutEffect)(() => {
				const root = rootRef.current;
				if (root === null || typeof document === "undefined") return;
				let records = ledgerByRoot.get(root);
				if (!enabled && records === void 0) return;
				if (records === void 0) {
					records = /* @__PURE__ */ new Map();
					ledgerByRoot.set(root, records);
				}
				const forEachText = (from, callback) => {
					if (from.nodeType === Node.TEXT_NODE) {
						callback(from);
						return;
					}
					const walker = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
					let current = walker.nextNode();
					while (current !== null) {
						callback(current);
						current = walker.nextNode();
					}
				};
				const settle = (text) => {
					if (!revealable(text, root)) return;
					const chars = [...text.data];
					records.set(text, {
						chars,
						full: text.data,
						shown: chars.length
					});
				};
				const snapshotVisible = () => {
					const current = /* @__PURE__ */ new Set();
					forEachText(root, (text) => {
						if (!revealable(text, root)) return;
						current.add(text);
						settle(text);
					});
					for (const text of records.keys()) if (!current.has(text)) records.delete(text);
				};
				if (!enabled) {
					snapshotVisible();
					const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(snapshotVisible);
					observer?.observe(root, {
						childList: true,
						characterData: true,
						subtree: true
					});
					return () => {
						observer?.disconnect();
					};
				}
				const pending = /* @__PURE__ */ new Set();
				const internalWrites = /* @__PURE__ */ new WeakMap();
				let rafId = 0;
				let lastFrame = null;
				let debt = 0;
				let stopped = false;
				let announcedSettled = false;
				const streamId = `dom-${Math.random().toString(36).slice(2)}`;
				const announceSettled = () => {
					lastFrame = null;
					debt = 0;
					speedCpsRef.current = 35;
					debugRuntime.reportStream(streamId, null);
					if (announcedSettled) return;
					announcedSettled = true;
					onSettled?.();
				};
				const write = (node, value) => {
					if (node.data === value) return;
					internalWrites.set(node, value);
					node.data = value;
				};
				const enqueue = (node, full, preserve) => {
					if (!revealable(node, root)) return;
					if (!pace) {
						settle(node);
						return;
					}
					const chars = [...full];
					const preserved = preserve === void 0 ? 0 : Math.min(preserve.shown, commonPrefix(preserve.chars, chars));
					const record = {
						chars,
						full,
						shown: preserved
					};
					records.set(node, record);
					if (preserved < chars.length) {
						pending.add(node);
						announcedSettled = false;
					} else pending.delete(node);
					write(node, chars.slice(0, preserved).join(""));
				};
				const visit = (from, reveal) => {
					forEachText(from, (text) => {
						if (!revealable(text, root)) return;
						if (reveal) {
							enqueue(text, text.data, records.get(text));
							return;
						}
						settle(text);
					});
				};
				const forget = (from) => {
					forEachText(from, (text) => {
						if (root.contains(text)) return;
						records.delete(text);
						pending.delete(text);
					});
				};
				const scheduleFrame = () => {
					if (stopped || pending.size === 0 || rafId !== 0) return;
					rafId = requestAnimationFrame(frame);
				};
				const frame = (now) => {
					rafId = 0;
					if (stopped) return;
					if (pending.size === 0) {
						announceSettled();
						return;
					}
					announcedSettled = false;
					if (lastFrame === null) {
						lastFrame = now;
						scheduleFrame();
						return;
					}
					const elapsed = Math.max(0, now - lastFrame);
					lastFrame = now;
					let backlog = 0;
					for (const node of pending) {
						const record = records.get(node);
						if (record !== void 0) backlog += record.chars.length - record.shown;
					}
					const step = computeAdaptiveQueueStep(backlog, elapsed, debt, 1, debugRuntime.activeTuning());
					debt = step.debt;
					speedCpsRef.current = step.speedCps;
					let remaining = step.revealChars;
					for (const node of [...pending]) {
						if (remaining <= 0) break;
						const record = records.get(node);
						if (record === void 0 || !node.isConnected) {
							pending.delete(node);
							records.delete(node);
							continue;
						}
						const amount = Math.min(remaining, record.chars.length - record.shown);
						const shown = record.shown + amount;
						const next = {
							...record,
							shown
						};
						records.set(node, next);
						write(node, next.chars.slice(0, shown).join(""));
						remaining -= amount;
						if (shown >= next.chars.length) pending.delete(node);
					}
					let targetChars = 0;
					let displayedChars = 0;
					let nextBacklog = 0;
					for (const [node, record] of records) {
						if (!node.isConnected) {
							records.delete(node);
							pending.delete(node);
							continue;
						}
						targetChars += record.chars.length;
						displayedChars += record.shown;
						if (pending.has(node)) nextBacklog += record.chars.length - record.shown;
					}
					debugRuntime.reportStream(streamId, {
						backlog: nextBacklog,
						speedCps: step.speedCps,
						targetChars,
						displayedChars,
						active: pending.size > 0
					});
					if (pending.size === 0) announceSettled();
					else scheduleFrame();
				};
				visit(root, revealInitial);
				const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver((mutations) => {
					for (const mutation of mutations) {
						if (mutation.type === "characterData") {
							const node = mutation.target;
							if (internalWrites.get(node) === node.data) {
								internalWrites.delete(node);
								continue;
							}
							enqueue(node, node.data, records.get(node));
							continue;
						}
						for (const removed of mutation.removedNodes) forget(removed);
						for (const added of mutation.addedNodes) visit(added, true);
					}
					if (pending.size === 0) announceSettled();
					else scheduleFrame();
				});
				observer?.observe(root, {
					childList: true,
					characterData: true,
					subtree: true
				});
				if (pending.size === 0) announceSettled();
				else scheduleFrame();
				return () => {
					stopped = true;
					cancelAnimationFrame(rafId);
					observer?.disconnect();
					for (const [node, record] of records) {
						const controlled = record.chars.slice(0, record.shown).join("");
						if (node.isConnected && node.data === controlled) write(node, record.full);
					}
					pending.clear();
					speedCpsRef.current = 35;
					debugRuntime.reportStream(streamId, null);
				};
			}, [
				enabled,
				onSettled,
				pace,
				revealInitial,
				rootRef,
				speedCpsRef
			]);
		}
		//#endregion
		//#region \0dsh-css:/Users/tny/Desktop/work/my-dsh/plugins/dsh-smooth-stream/src/client/AgentRowEntrance.module.css.mjs
		const css$2 = "._72ZBkW_surface{min-width:0}._72ZBkW_surface[data-entrance=active]{will-change:opacity, transform;animation:.22s cubic-bezier(.2,.8,.2,1) both _72ZBkW_dsh-smooth-stream-agent-row-in}@keyframes _72ZBkW_dsh-smooth-stream-agent-row-in{0%{opacity:0;clip-path:inset(0 100% 0 0);transform:translateY(4px)}55%{opacity:1;clip-path:inset(0 18% 0 0)}to{opacity:1;clip-path:inset(0);transform:translate(0,0)}}@media (prefers-reduced-motion:reduce){._72ZBkW_surface[data-entrance=active]{opacity:1;clip-path:none;will-change:auto;animation:none;transform:none}}";
		const tagId$2 = "@lynn123411/dsh-smooth-stream/AgentRowEntrance.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "@lynn123411/dsh-smooth-stream";
				tag.dataset.pluginCss = tagId$2;
				document.head.appendChild(tag);
			}
			tag.textContent = css$2;
		}
		var AgentRowEntrance_module_css_default = {
			"dsh-smooth-stream-agent-row-in": "_72ZBkW_dsh-smooth-stream-agent-row-in",
			"surface": "_72ZBkW_surface"
		};
		//#endregion
		//#region src/client/TypewriterToolNodeView.tsx
		function openAgentLocation(node) {
			if (node === null || typeof node !== "object" || !("location" in node)) return false;
			const location = node.location;
			if (location === null || typeof location !== "object" || !("kind" in location)) return false;
			const kind = location.kind;
			if (!("turn" in location)) return false;
			const turn = location.turn;
			if (turn === null || typeof turn !== "object" || !("status" in turn)) return false;
			if (kind === "turn") return turn.status === "open";
			if (kind !== "step" || !("step" in location)) return false;
			const step = location.step;
			return step !== null && typeof step === "object" && "status" in step && step.status === "open";
		}
		/**
		* True while a Chat node has an explicitly unfinished lifecycle: an
		* assistant/workflow `status: 'running'` payload, a Tool root that has not
		* settled (`kind` absent), or a model-retry whose current attempt is still
		* `scheduled`. Open-but-otherwise-unknown rows are covered by
		* `isFollowableChatNode` below.
		* @param node - The Chat node's view `node` prop.
		* @returns whether this row should own conversation follow.
		*/
		function isGrowingChatNode(node) {
			if (node === null || typeof node !== "object" || !("data" in node)) return false;
			const data = node.data;
			if (data === null || typeof data !== "object") return false;
			if ("status" in data && data.status === "running") return true;
			if ("kind" in data && data.kind === "command" && "outcome" in data && data.outcome === null) return true;
			if ("command" in data) {
				const command = data.command;
				if (command !== null && typeof command === "object" && "outcome" in command && command.outcome === null) return true;
			}
			if ("root" in data) {
				const root = data.root;
				if (root !== null && typeof root === "object" && !("kind" in root)) return true;
			}
			if ("current" in data) {
				const current = data.current;
				if (current !== null && typeof current === "object" && "retryState" in current && current.retryState === "scheduled") return true;
			}
			return false;
		}
		/**
		* True for any Agent-owned Chat row in the currently open turn/step. This is
		* the extensibility boundary: a newly registered Context, Command, Tool, or
		* workflow renderer is followed without adding another kind-specific branch.
		*/
		function isFollowableChatNode(node) {
			return isGrowingChatNode(node) || openAgentLocation(node);
		}
		/**
		* True when a newly mounted Agent-owned row belongs to the current open
		* Turn/Step, or is itself an unresolved growing lifecycle.
		* @param node - The Chat node's view `node` prop.
		* @returns whether its initial height should enter through conversation follow.
		*/
		function shouldAnimateChatNodeEntrance(node) {
			return isFollowableChatNode(node);
		}
		/** Runtime-only fallback for unknown or terminal rows at the active flow tip. */
		function liveAgentTailMode(root) {
			const port = root.closest("[data-conversation-scroll]");
			if (port === null) return null;
			const row = root.closest("[data-chat-flow-key]");
			if (row !== null) {
				let sibling = row.nextElementSibling;
				while (sibling !== null) {
					if (sibling instanceof HTMLElement && sibling.hasAttribute("data-chat-flow-key")) return null;
					sibling = sibling.nextElementSibling;
				}
			}
			const flow = root.closest("[data-chat-flow]");
			if (flow !== null && [...flow.children].some((child) => child instanceof HTMLElement && child.getAttribute("role") === "status" && !child.hasAttribute("data-chat-flow-key"))) return "turn";
			return hasRecentConversationFollow(port) ? "handoff" : null;
		}
		/**
		* Wrap a prior Agent Chat renderer so its entrance and later growth share
		* conversation follow. Presentation stays with the wrapped component; kit
		* seats (`renderSlot`, locale, inject) pass through unchanged.
		* @param Inner - The already-registered row component.
		* @param useControlScroll - Live scroll-ownership preference.
		* @param options - `reveal: false` keeps the row's entrance and follow
		* lifecycle but never paces its own text (the fork's Tool-row opt-out).
		* @returns A follow-hosted row.
		*/
		function wrapFollowNodeView(Inner, useControlScroll, options) {
			const reveal = options?.reveal ?? true;
			return function TypewriterFollowNodeView(props) {
				const controlScroll = useControlScroll?.() ?? true;
				const speedCpsRef = (0, react.useRef)(35);
				const hostRef = (0, react.useRef)(null);
				const growing = isGrowingChatNode(props.node);
				const structurallyFollowable = isFollowableChatNode(props.node);
				const structuralRef = (0, react.useRef)(structurallyFollowable);
				const [runtimeFollowable, setRuntimeFollowable] = (0, react.useState)(false);
				const runtimePersistentRef = (0, react.useRef)(false);
				const runtimeHandledRef = (0, react.useRef)(false);
				const followable = structurallyFollowable || runtimeFollowable;
				const revealInitialRef = (0, react.useRef)(true);
				const [entering, setEntering] = (0, react.useState)(() => shouldAnimateChatNodeEntrance(props.node));
				const [growthPulse, setGrowthPulse] = (0, react.useState)(false);
				const followableRef = (0, react.useRef)(false);
				const growingRef = (0, react.useRef)(growing);
				const entranceActiveRef = (0, react.useRef)(entering || growthPulse);
				const growthExtentRef = (0, react.useRef)(null);
				const mountedRef = (0, react.useRef)(true);
				const pulseTimerRef = (0, react.useRef)(null);
				structuralRef.current = structurallyFollowable;
				followableRef.current = followable;
				growingRef.current = growing;
				entranceActiveRef.current = entering || growthPulse;
				const finishRuntimeReveal = (0, react.useCallback)(() => {
					if (structuralRef.current || runtimePersistentRef.current) return;
					runtimeHandledRef.current = true;
					setRuntimeFollowable(false);
				}, []);
				useProgressiveDomText(hostRef, followable, revealInitialRef.current, speedCpsRef, runtimeFollowable ? finishRuntimeReveal : void 0, reveal);
				(0, react.useLayoutEffect)(() => {
					if (structurallyFollowable) return;
					const root = hostRef.current;
					if (root === null) return;
					const mode = liveAgentTailMode(root);
					if (runtimeFollowable) {
						if (runtimePersistentRef.current && mode !== "turn") {
							runtimePersistentRef.current = false;
							runtimeHandledRef.current = true;
							setRuntimeFollowable(false);
						}
						return;
					}
					if (runtimeHandledRef.current || mode === null) return;
					runtimePersistentRef.current = mode === "turn";
					setRuntimeFollowable(true);
					setEntering(true);
				}, [runtimeFollowable, structurallyFollowable]);
				const finishEntrance = (0, react.useCallback)(() => {
					growthExtentRef.current = null;
					if (pulseTimerRef.current !== null) {
						clearTimeout(pulseTimerRef.current);
						pulseTimerRef.current = null;
					}
					setEntering(false);
					setGrowthPulse(false);
				}, []);
				const onGrowth = (0, react.useCallback)((deltaPx) => {
					if (!mountedRef.current || !followableRef.current || growingRef.current || entranceActiveRef.current) return;
					growthExtentRef.current = deltaPx;
					setGrowthPulse(true);
					if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
					pulseTimerRef.current = setTimeout(() => {
						pulseTimerRef.current = null;
						setGrowthPulse(false);
					}, 1200);
				}, []);
				(0, react.useEffect)(() => {
					mountedRef.current = true;
					return () => {
						mountedRef.current = false;
						if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
					};
				}, []);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FollowHost, {
					active: growing,
					entrance: entering || growthPulse,
					onEntranceSettled: finishEntrance,
					onGrowth: followable ? onGrowth : void 0,
					entranceExtentRef: growthExtentRef,
					speedCpsRef,
					controlScroll,
					predictive: false,
					hostRef,
					className: AgentRowEntrance_module_css_default.surface,
					entranceActive: entering || growthPulse,
					children: (0, react.createElement)(Inner, props)
				});
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/tny/Desktop/work/my-dsh/plugins/dsh-smooth-stream/src/client/SmoothStreamCard.module.css.mjs
		const css$1 = ".QGTmaa_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;list-style:none;transition:border-color .16s,background .16s;display:flex}.QGTmaa_card:hover{border-color:var(--dsw-alias-label-dimmed)}.QGTmaa_cardOpen{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2)}.QGTmaa_header{appearance:none;cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.QGTmaa_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.QGTmaa_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.QGTmaa_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.QGTmaa_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.QGTmaa_version{text-overflow:ellipsis;white-space:nowrap;max-width:16rem;color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:1.5;overflow:hidden}.QGTmaa_pending{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.QGTmaa_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.QGTmaa_chevronOpen{transform:rotate(180deg)}.QGTmaa_body{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;margin:0 16px;padding-bottom:8px;display:flex}.QGTmaa_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.QGTmaa_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.QGTmaa_field+.QGTmaa_field{border-top:1px solid var(--dsw-alias-border-l2)}.QGTmaa_fieldDisabled{opacity:.5}.QGTmaa_fieldHead{justify-content:space-between;align-items:center;gap:8px;display:flex}.QGTmaa_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.QGTmaa_toggle{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}.QGTmaa_toggle:disabled{cursor:default}.QGTmaa_toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.QGTmaa_choiceRow{flex-wrap:wrap;gap:6px 14px;margin:2px 0 0;padding:0;display:flex}.QGTmaa_choice{color:var(--dsw-alias-label-secondary);cursor:pointer;align-items:center;gap:5px;font-size:12px;line-height:1.5;display:flex}.QGTmaa_choiceInput{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}.QGTmaa_choice:has(.QGTmaa_choiceInput:disabled){cursor:default;opacity:.55}.QGTmaa_choiceInput:disabled{cursor:default}.QGTmaa_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.QGTmaa_failure{justify-content:space-between;align-items:center;gap:12px;padding:12px 0;display:flex}.QGTmaa_updateRow{border-top:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:12px;padding:12px 0;display:flex}.QGTmaa_updateCopy{flex-direction:column;gap:4px;min-width:0;display:flex}.QGTmaa_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.QGTmaa_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}.QGTmaa_save,.QGTmaa_discard,.QGTmaa_update{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.QGTmaa_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.QGTmaa_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.QGTmaa_discard:hover:not(:disabled),.QGTmaa_update:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}.QGTmaa_update{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0;flex:none;align-items:center;gap:6px;display:inline-flex}.QGTmaa_discard:disabled,.QGTmaa_save:disabled,.QGTmaa_update:disabled{opacity:.4;cursor:default}.QGTmaa_discard:focus-visible,.QGTmaa_save:focus-visible,.QGTmaa_update:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
		const tagId$1 = "@lynn123411/dsh-smooth-stream/SmoothStreamCard.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "@lynn123411/dsh-smooth-stream";
				tag.dataset.pluginCss = tagId$1;
				document.head.appendChild(tag);
			}
			tag.textContent = css$1;
		}
		var SmoothStreamCard_module_css_default = {
			"discard": "QGTmaa_discard",
			"update": "QGTmaa_update",
			"failure": "QGTmaa_failure",
			"header": "QGTmaa_header",
			"chevron": "QGTmaa_chevron",
			"toggle": "QGTmaa_toggle",
			"failed": "QGTmaa_failed",
			"cardOpen": "QGTmaa_cardOpen",
			"description": "QGTmaa_description",
			"save": "QGTmaa_save",
			"version": "QGTmaa_version",
			"readOnly": "QGTmaa_readOnly",
			"choiceRow": "QGTmaa_choiceRow",
			"card": "QGTmaa_card",
			"choiceInput": "QGTmaa_choiceInput",
			"headText": "QGTmaa_headText",
			"field": "QGTmaa_field",
			"chevronOpen": "QGTmaa_chevronOpen",
			"footer": "QGTmaa_footer",
			"updateRow": "QGTmaa_updateRow",
			"body": "QGTmaa_body",
			"fieldHead": "QGTmaa_fieldHead",
			"updateCopy": "QGTmaa_updateCopy",
			"fieldDisabled": "QGTmaa_fieldDisabled",
			"label": "QGTmaa_label",
			"hint": "QGTmaa_hint",
			"pending": "QGTmaa_pending",
			"choice": "QGTmaa_choice",
			"name": "QGTmaa_name"
		};
		//#endregion
		//#region src/client/SmoothStreamCard.tsx
		/**
		* The smooth-stream card inside the shared 「阅读体验」 settings page.
		* Preferences are staged until the user saves — the same shape as the
		* Host-shipped cards, hand-drawn because the Host cards' chrome is not
		* exported for reuse.
		*/
		/** Render the smooth-stream card independently of the core settings namespace allowlist. */
		function SmoothStreamCard(props) {
			const { t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const state = props.useSmoothStreamCard((snapshot) => snapshot);
			const blocked = !state.dirty || state.saving || state.status !== "ready";
			const versionLabel = state.version === void 0 ? null : t(state.installation === "development" ? "developmentVersion" : "version").replace("{version}", state.version);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? `${SmoothStreamCard_module_css_default.card} ${SmoothStreamCard_module_css_default.cardOpen}` : SmoothStreamCard_module_css_default.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: SmoothStreamCard_module_css_default.header,
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SmoothStreamCard_module_css_default.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SmoothStreamCard_module_css_default.name,
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SmoothStreamCard_module_css_default.description,
								children: t("description")
							})]
						}),
						versionLabel === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SmoothStreamCard_module_css_default.version,
							children: versionLabel
						}),
						state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SmoothStreamCard_module_css_default.pending,
							children: t("unsaved")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? `${SmoothStreamCard_module_css_default.chevron} ${SmoothStreamCard_module_css_default.chevronOpen}` : SmoothStreamCard_module_css_default.chevron })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SmoothStreamCard_module_css_default.body,
					children: [
						state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: SmoothStreamCard_module_css_default.readOnly,
							role: "status",
							children: t("loading")
						}) : null,
						state.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SmoothStreamCard_module_css_default.failure,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: SmoothStreamCard_module_css_default.readOnly,
								role: "status",
								children: t("unavailable")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SmoothStreamCard_module_css_default.discard,
								onClick: props.reload,
								children: t("retry")
							})]
						}) : null,
						state.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: SmoothStreamCard_module_css_default.readOnly,
								role: "status",
								children: t("readOnly")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SmoothStreamCard_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SmoothStreamCard_module_css_default.fieldHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.label,
										children: t("enabled")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: SmoothStreamCard_module_css_default.toggle,
										checked: state.enabled,
										disabled: !state.writable || state.saving,
										onChange: (event) => {
											props.edit({ enabled: event.target.checked });
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SmoothStreamCard_module_css_default.hint,
									children: t("enabledHint")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: state.enabled ? SmoothStreamCard_module_css_default.field : `${SmoothStreamCard_module_css_default.field} ${SmoothStreamCard_module_css_default.fieldDisabled}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SmoothStreamCard_module_css_default.fieldHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.label,
										children: t("controlScroll")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: SmoothStreamCard_module_css_default.toggle,
										checked: state.controlScroll,
										disabled: !state.writable || state.saving || !state.enabled,
										onChange: (event) => {
											props.edit({ controlScroll: event.target.checked });
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SmoothStreamCard_module_css_default.hint,
									children: t("controlScrollHint")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: state.enabled ? SmoothStreamCard_module_css_default.field : `${SmoothStreamCard_module_css_default.field} ${SmoothStreamCard_module_css_default.fieldDisabled}`,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.fieldHead,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SmoothStreamCard_module_css_default.label,
											children: t("motionPreference")
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.hint,
										children: t("motionPreferenceHint")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.choiceRow,
										role: "radiogroup",
										"aria-label": t("motionPreference"),
										children: [
											[
												"auto",
												"motionAuto",
												"motionAutoHint"
											],
											[
												"force-smooth",
												"motionForceSmooth",
												"motionForceSmoothHint"
											],
											[
												"force-reduced",
												"motionForceReduced",
												"motionForceReducedHint"
											]
										].map(([value, label, hint]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: SmoothStreamCard_module_css_default.choice,
											title: t(hint),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "radio",
												className: SmoothStreamCard_module_css_default.choiceInput,
												name: "smooth-stream-motion",
												checked: state.motionPreference === value,
												disabled: !state.writable || state.saving || !state.enabled,
												onChange: () => {
													props.edit({ motionPreference: value });
												}
											}), t(label)]
										}, value))
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: state.enabled ? SmoothStreamCard_module_css_default.field : `${SmoothStreamCard_module_css_default.field} ${SmoothStreamCard_module_css_default.fieldDisabled}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SmoothStreamCard_module_css_default.fieldHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.label,
										children: t("thinkAutoExpand")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: SmoothStreamCard_module_css_default.toggle,
										checked: state.thinkAutoExpand,
										disabled: !state.writable || state.saving || !state.enabled,
										onChange: (event) => {
											props.edit({ thinkAutoExpand: event.target.checked });
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SmoothStreamCard_module_css_default.hint,
									children: t("thinkAutoExpandHint")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: state.debugAvailable ? SmoothStreamCard_module_css_default.field : `${SmoothStreamCard_module_css_default.field} ${SmoothStreamCard_module_css_default.fieldDisabled}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SmoothStreamCard_module_css_default.fieldHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.label,
										children: t("debugEnabled")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: SmoothStreamCard_module_css_default.toggle,
										checked: state.debugEnabled,
										disabled: !state.debugAvailable || !state.writable || state.saving,
										onChange: (event) => {
											props.edit({ debugEnabled: event.target.checked });
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SmoothStreamCard_module_css_default.hint,
									children: state.debugAvailable ? t("debugEnabledHint") : t("debugUnavailable")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SmoothStreamCard_module_css_default.updateRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SmoothStreamCard_module_css_default.updateCopy,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.label,
										children: t("updates")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SmoothStreamCard_module_css_default.hint,
										children: state.restartRequired ? t("restartRequired") : state.installation !== "npm" ? state.installation === "development" ? t("developmentBuild") : t("updateUnavailable") : state.canUpgrade ? t("updateHint") : t("updateLocalOnly")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: SmoothStreamCard_module_css_default.update,
									disabled: !state.canUpgrade || state.upgrading || state.restartRequired,
									title: state.canUpgrade ? void 0 : state.installation === "npm" ? t("updateLocalOnly") : t("updateUnavailable"),
									onClick: props.upgrade,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {})
									}), t(state.upgrading ? "updating" : "update")]
								})]
							}),
							state.upgradeFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: SmoothStreamCard_module_css_default.failed,
								role: "status",
								children: t("updateFailed")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SmoothStreamCard_module_css_default.footer,
								children: [
									state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: SmoothStreamCard_module_css_default.failed,
										role: "status",
										children: t("saveFailed")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: SmoothStreamCard_module_css_default.discard,
										disabled: !state.dirty || state.saving,
										onClick: props.discard,
										children: t("discard")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: SmoothStreamCard_module_css_default.save,
										disabled: blocked,
										onClick: props.save,
										children: t(state.saving ? "saving" : "save")
									})
								]
							})
						] }) : null
					]
				}) : null]
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
		* declared"). Composing three cards into one page therefore takes one
		* declarer, so every participating plugin carries this same shell and the
		* FIRST one to activate claims the page; the others register their card into
		* {@link READING_ITEM_SLOT} and wait for the winner's declaration through
		* `slots.inject`. Uninstalling the winner promotes another participant on the
		* next boot, so no participant is a fixed owner.
		*
		* Keep this file identical across the participating plugins
		* (`dsh-smooth-stream`, `dsh-oil-sticky-prompt`, `dsh-chat-translate`).
		* Participants own their own card component, locale dictionaries, settings
		* namespace and Host half — only the page shell below is shared, because
		* cross-plugin value imports are forbidden by the client bundle purity gate.
		*/
		/** Page id claimed by the first participating plugin to activate. */
		const READING_PAGE_ID = "reading";
		/** The page's one child slot: every participant's card registers here. */
		const READING_ITEM_SLOT = "reading.settings.item";
		/**
		* Page body. The shell supplies the section's own seats plus `renderSlot`
		* bound to the child slot declared at registration time; the page itself owns
		* only the stack. Cards render `<li>` roots, so the stack is a markerless
		* list — a stray `<li>` under a plain container would draw a bullet.
		*/
		function ReadingSettingsSection({ renderSlot }) {
			return (0, react.createElement)("ul", { style: {
				listStyle: "none",
				margin: 0,
				padding: 0,
				display: "grid",
				gap: "12px"
			} }, renderSlot(READING_ITEM_SLOT, {}));
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
			return ctx.slots.register({
				name: "settings.section",
				id: READING_PAGE_ID,
				order: 110,
				label,
				locale,
				children: { "reading.settings.item": {
					kind: "list",
					scope: "root"
				} }
			}, ReadingSettingsSection);
		}
		//#endregion
		//#region src/client/smooth-stream-card-controller.ts
		/** Bridges the native settings namespace onto a staged settings form. */
		var SmoothStreamCardController = class {
			store;
			scope;
			pluginApi;
			isLoopback;
			info;
			staged;
			saving = false;
			failed = false;
			upgrading = false;
			upgradeFailed = false;
			restartRequired = false;
			detachScope;
			detached = false;
			constructor(options) {
				this.scope = options.scope;
				this.pluginApi = options.pluginApi;
				this.isLoopback = options.isLoopback;
				this.store = createSnapshotStore(this.projection());
			}
			/** Follow the scope and read the Host-side package provenance. */
			start() {
				this.detachScope = this.scope.subscribe(() => {
					this.publish();
				});
				this.loadInfo();
			}
			/** Release the scope subscription when the optional services unload. */
			stop() {
				this.detached = true;
				this.detachScope?.();
				this.detachScope = void 0;
			}
			/** Current card snapshot, also consumed by the streaming preference cell. */
			getSnapshot() {
				return this.store.getSnapshot();
			}
			/** Subscribe to state changes. */
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			/** Build the face consumed by the settings slot renderer. */
			inject() {
				return {
					hooks: { smoothStreamCard: this.store },
					edit: (patch) => {
						this.edit(patch);
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged === void 0 && !this.failed) return;
						this.staged = void 0;
						this.failed = false;
						this.publish();
					},
					reload: () => {
						this.staged = void 0;
						this.failed = false;
						this.loadInfo();
						this.publish();
					},
					upgrade: () => {
						this.upgrade();
					}
				};
			}
			edit(patch) {
				if (this.saving) return;
				const current = this.values();
				const next = { ...this.staged };
				if (patch.enabled !== void 0) next.enabled = patch.enabled;
				if (patch.controlScroll !== void 0) next.controlScroll = patch.controlScroll;
				if (patch.motionPreference !== void 0) next.motionPreference = patch.motionPreference;
				if (patch.thinkAutoExpand !== void 0) next.thinkAutoExpand = patch.thinkAutoExpand;
				if (patch.debugEnabled !== void 0) next.debugEnabled = patch.debugEnabled;
				if (patch.debugTuning !== void 0) next.debugTuning = {
					...current.debugTuning,
					...patch.debugTuning
				};
				this.staged = next;
				this.failed = false;
				this.publish();
			}
			/** Resolved preferences: the staged draft over the Host section over defaults. */
			values() {
				return {
					...this.scope.getSnapshot().value ?? DEFAULT_STREAM_SETTINGS,
					...this.staged
				};
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				return {
					status: snapshot.status,
					writable: snapshot.writable,
					dirty: this.staged !== void 0,
					saving: this.saving,
					failed: this.failed,
					...this.values(),
					debugAvailable: snapshot.status === "ready",
					version: this.info?.version,
					installation: this.info?.installation ?? "unmanaged",
					canUpgrade: this.info?.canUpgrade === true && this.isLoopback,
					upgrading: this.upgrading,
					upgradeFailed: this.upgradeFailed,
					restartRequired: this.restartRequired
				};
			}
			async loadInfo() {
				if (this.pluginApi === void 0) {
					this.publish();
					return;
				}
				try {
					const info = await this.pluginApi.info();
					if (this.detached) return;
					this.info = info;
				} catch {
					if (this.detached) return;
					this.info = void 0;
				}
				this.publish();
			}
			async save() {
				const staged = this.staged;
				if (staged === void 0 || this.saving || !this.scope.getSnapshot().writable) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				try {
					for (const [field, value] of Object.entries(staged)) await this.scope.set(field, value);
					this.staged = void 0;
				} catch {
					this.failed = true;
				}
				this.saving = false;
				this.publish();
			}
			async upgrade() {
				if (this.pluginApi === void 0 || !this.projection().canUpgrade || this.upgrading) return;
				this.upgrading = true;
				this.upgradeFailed = false;
				this.restartRequired = false;
				this.publish();
				try {
					const result = await this.pluginApi.upgrade();
					this.restartRequired = result.restartRequired;
				} catch {
					this.upgradeFailed = true;
				}
				this.upgrading = false;
				this.publish();
			}
			publish() {
				this.store.set(this.projection());
			}
		};
		//#endregion
		//#region src/settings-api.ts
		/**
		* Shared wire vocabulary for the plugin-owned Connection channel.
		*
		* Preferences no longer ride this channel: they live in the Host-registered
		* settings namespace and reach the browser through the native `settingsScope`
		* service. Only the package's version line and the one-click profile update —
		* both of which need the Host process and the profile manifest — stay here.
		*/
		/** Dedicated RPC channel registered by the Host half. */
		const STREAM_RPC_CHANNEL = "/lynn-smooth-stream";
		/** Endpoints accepted by {@link STREAM_RPC_CHANNEL}. */
		const STREAM_RPC = {
			info: "plugin.info",
			upgrade: "plugin.upgrade"
		};
		//#endregion
		//#region src/client/smooth-stream-settings-api.ts
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function infoView(value) {
			const data = record(value);
			if (data === void 0 || typeof data.version !== "string" || ![
				"npm",
				"development",
				"unmanaged"
			].includes(data.installation) || typeof data.canUpgrade !== "boolean") throw new Error("dsh-smooth-stream: malformed plugin info response");
			return {
				version: data.version,
				installation: data.installation,
				canUpgrade: data.canUpgrade
			};
		}
		function upgradeView(value) {
			if (record(value)?.restartRequired !== true) throw new Error("dsh-smooth-stream: malformed update response");
			return { restartRequired: true };
		}
		function accepted(result) {
			if (!result.ok) throw new Error(result.error.message);
			return result.value;
		}
		/** Build the typed facade over the generic Connection RPC service. */
		function createSmoothStreamPluginApi(connection) {
			return {
				async info() {
					return infoView(accepted(await connection.rpc.call(STREAM_RPC_CHANNEL, STREAM_RPC.info, {})));
				},
				async upgrade() {
					return upgradeView(accepted(await connection.rpc.call(STREAM_RPC_CHANNEL, STREAM_RPC.upgrade, {})));
				}
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/tny/Desktop/work/my-dsh/plugins/dsh-smooth-stream/src/client/DebugPanel.module.css.mjs
		const css = ".fE600W_trigger,.fE600W_iconButton{appearance:none;width:32px;height:32px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:6px;justify-content:center;align-items:center;padding:0;display:inline-flex}.fE600W_trigger:hover,.fE600W_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.fE600W_iconButton:disabled{opacity:.45;cursor:not-allowed}.fE600W_triggerActive{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary)}.fE600W_trigger:focus-visible,.fE600W_iconButton:focus-visible,.fE600W_secondaryButton:focus-visible,.fE600W_primaryButton:focus-visible,.fE600W_number:focus-visible,.fE600W_range:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.fE600W_panel{z-index:30;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:min(328px,100vw - 32px);min-height:280px;box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);color:var(--dsw-alias-label-primary);border-radius:8px;flex-direction:column;display:flex;position:fixed;top:88px;bottom:16px;right:16px;overflow:hidden}.fE600W_panelHeader{border-bottom:1px solid var(--dsw-alias-border-l2);flex:none;align-items:center;gap:8px;min-height:48px;padding:0 8px 0 14px;display:flex}.fE600W_statusDot{background:var(--dsw-alias-label-caption);border-radius:50%;flex:none;width:7px;height:7px}.fE600W_statusLive{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent)}.fE600W_title{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}.fE600W_state,.fE600W_unsaved{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;font-size:10px;line-height:16px}.fE600W_unsaved{color:var(--dsw-alias-state-warn-primary)}.fE600W_scrollArea{overscroll-behavior:contain;min-height:0;overflow-y:auto}.fE600W_section{padding:14px}.fE600W_guide{border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);margin:0;padding:12px 14px;font-size:11px;line-height:1.55}.fE600W_section+.fE600W_section{border-top:1px solid var(--dsw-alias-border-l2)}.fE600W_section h2{color:var(--dsw-alias-label-secondary);margin:0 0 10px;font-size:12px;font-weight:600;line-height:18px}.fE600W_metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;margin:0;display:grid}.fE600W_metric{border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 65%, transparent);justify-content:space-between;align-items:baseline;gap:8px;min-width:0;padding:5px 0;display:flex}.fE600W_metric dt{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.fE600W_metric dd{min-width:0;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px;overflow:hidden}.fE600W_metric dd[data-tone=good]{color:var(--dsw-alias-state-success-primary)}.fE600W_metric dd[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}.fE600W_control{flex-direction:column;gap:5px;padding:6px 0;display:flex}.fE600W_controlHead{color:var(--dsw-alias-label-secondary);justify-content:space-between;align-items:center;gap:10px;font-size:11px;line-height:18px;display:flex}.fE600W_controlLabel{align-items:center;gap:4px;min-width:0;display:inline-flex}.fE600W_infoButton{appearance:none;width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:help;background:0 0;border:0;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex}.fE600W_infoButton:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.fE600W_infoButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.fE600W_numberWrap{flex:none;align-items:center;gap:4px;display:inline-flex}.fE600W_number{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:68px;height:26px;color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;text-align:right;border-radius:5px;padding:2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.fE600W_unit{width:30px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px}.fE600W_range{width:100%;height:18px;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;margin:0}.fE600W_range:disabled,.fE600W_number:disabled{opacity:.5;cursor:default}.fE600W_footer{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex:none;align-items:center;gap:6px;min-height:50px;padding:8px 10px;display:flex}.fE600W_footerSpacer{flex:1}.fE600W_secondaryButton,.fE600W_primaryButton{appearance:none;border:1px solid var(--dsw-alias-border-l2);min-height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;justify-content:center;align-items:center;gap:5px;padding:4px 9px;font-size:11px;line-height:18px;display:inline-flex}.fE600W_primaryButton{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:#0000}.fE600W_secondaryButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.fE600W_secondaryButton:disabled,.fE600W_primaryButton:disabled{opacity:.4;cursor:default}.fE600W_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}@media (width<=900px){.fE600W_trigger,.fE600W_iconButton{width:44px;height:44px}.fE600W_panel{top:auto;right:12px;bottom:max(12px, env(safe-area-inset-bottom));width:auto;max-height:min(70dvh,640px);left:12px}.fE600W_secondaryButton,.fE600W_primaryButton{min-height:44px}}@media (prefers-reduced-motion:reduce){.fE600W_statusLive{box-shadow:none}}";
		const tagId = "@lynn123411/dsh-smooth-stream/DebugPanel.module.css";
		if (typeof document !== "undefined") {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "@lynn123411/dsh-smooth-stream";
				tag.dataset.pluginCss = tagId;
				document.head.appendChild(tag);
			}
			tag.textContent = css;
		}
		var DebugPanel_module_css_default = {
			"unit": "fE600W_unit",
			"visuallyHidden": "fE600W_visuallyHidden",
			"range": "fE600W_range",
			"iconButton": "fE600W_iconButton",
			"statusLive": "fE600W_statusLive",
			"scrollArea": "fE600W_scrollArea",
			"metric": "fE600W_metric",
			"footer": "fE600W_footer",
			"controlLabel": "fE600W_controlLabel",
			"footerSpacer": "fE600W_footerSpacer",
			"numberWrap": "fE600W_numberWrap",
			"statusDot": "fE600W_statusDot",
			"title": "fE600W_title",
			"number": "fE600W_number",
			"section": "fE600W_section",
			"trigger": "fE600W_trigger",
			"metrics": "fE600W_metrics",
			"infoButton": "fE600W_infoButton",
			"primaryButton": "fE600W_primaryButton",
			"secondaryButton": "fE600W_secondaryButton",
			"panelHeader": "fE600W_panelHeader",
			"state": "fE600W_state",
			"guide": "fE600W_guide",
			"panel": "fE600W_panel",
			"control": "fE600W_control",
			"triggerActive": "fE600W_triggerActive",
			"unsaved": "fE600W_unsaved",
			"controlHead": "fE600W_controlHead"
		};
		//#endregion
		//#region src/client/DebugPanel.tsx
		const REVEAL_CONTROLS = [
			{
				key: "revealScale",
				label: "debugRevealMultiplier",
				tip: "debugTipRevealMultiplier",
				min: .25,
				max: 2,
				step: .05,
				unit: "x"
			},
			{
				key: "queuePressure",
				label: "debugQueuePressure",
				tip: "debugTipQueuePressure",
				min: 0,
				max: 2,
				step: .05,
				unit: "x"
			},
			{
				key: "maxRevealCps",
				label: "debugMaxReveal",
				tip: "debugTipMaxReveal",
				min: 120,
				max: 1e3,
				step: 10,
				unit: "cps"
			}
		];
		const FOLLOW_CONTROLS = [
			{
				key: "springStiffness",
				label: "debugSpringStiffness",
				tip: "debugTipSpringStiffness",
				min: 40,
				max: 320,
				step: 5,
				unit: ""
			},
			{
				key: "springDamping",
				label: "debugSpringDamping",
				tip: "debugTipSpringDamping",
				min: 8,
				max: 80,
				step: 1,
				unit: ""
			},
			{
				key: "springMass",
				label: "debugSpringMass",
				tip: "debugTipSpringMass",
				min: .5,
				max: 3,
				step: .05,
				unit: ""
			},
			{
				key: "runwayPx",
				label: "debugRunway",
				tip: "debugTipRunway",
				min: 0,
				max: 120,
				step: 2,
				unit: "px"
			},
			{
				key: "reserveResponseMs",
				label: "debugReserveResponse",
				tip: "debugTipReserveResponse",
				min: 60,
				max: 600,
				step: 10,
				unit: "ms"
			},
			{
				key: "backpressureMinScale",
				label: "debugBackpressureMin",
				tip: "debugTipBackpressureMin",
				min: .25,
				max: 1,
				step: .05,
				unit: "x"
			}
		];
		function fixed(value, digits = 1) {
			return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits);
		}
		function Metric({ label, value, tone }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: DebugPanel_module_css_default.metric,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
					"data-tone": tone,
					children: value
				})]
			});
		}
		function TuningField({ control, state, edit, label, t }) {
			const value = state.tuning[control.key];
			const labelId = `smooth-stream-debug-${control.key}`;
			const update = (next) => {
				if (!Number.isFinite(next)) return;
				const clamped = Math.min(control.max, Math.max(control.min, next));
				edit({ debugTuning: {
					...state.tuning,
					[control.key]: clamped
				} });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: DebugPanel_module_css_default.control,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: DebugPanel_module_css_default.controlHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: DebugPanel_module_css_default.controlLabel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							id: labelId,
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
							label: t(control.tip),
							side: "right",
							maxWidth: 300,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: DebugPanel_module_css_default.infoButton,
								type: "button",
								"aria-label": label,
								title: t(control.tip),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutline14, {})
							})
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: DebugPanel_module_css_default.numberWrap,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: DebugPanel_module_css_default.number,
							type: "number",
							"aria-labelledby": labelId,
							min: control.min,
							max: control.max,
							step: control.step,
							value,
							disabled: !state.writable,
							onChange: (event) => {
								update(event.currentTarget.valueAsNumber);
							}
						}), control.unit === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: DebugPanel_module_css_default.unit,
							children: control.unit
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: DebugPanel_module_css_default.range,
					type: "range",
					"aria-labelledby": labelId,
					min: control.min,
					max: control.max,
					step: control.step,
					value,
					disabled: !state.writable,
					onChange: (event) => {
						update(event.currentTarget.valueAsNumber);
					}
				})]
			});
		}
		function DebugPanel(props) {
			const { t } = props;
			const state = props.useDebugRuntime((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(true);
			const [copied, setCopied] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!copied) return;
				const timer = setTimeout(() => {
					setCopied(false);
				}, 1400);
				return () => {
					clearTimeout(timer);
				};
			}, [copied]);
			(0, react.useEffect)(() => {
				if (state.enabled) setOpen(true);
			}, [state.enabled]);
			if (!state.available || !state.enabled || !open) return null;
			const metrics = state.metrics;
			const live = metrics.streamActive || metrics.followActive;
			const progress = metrics.streamTargetChars <= 0 ? "-" : `${String(metrics.streamDisplayedChars)} / ${String(metrics.streamTargetChars)}`;
			const copyDiagnostics = async () => {
				if (await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(JSON.stringify({
					tuning: state.tuning,
					metrics: state.metrics
				}, null, 2))) setCopied(true);
			};
			const panel = !state.enabled || !open ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: DebugPanel_module_css_default.panel,
				role: "complementary",
				"aria-label": t("debugPanelTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: DebugPanel_module_css_default.panelHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: live ? `${DebugPanel_module_css_default.statusDot} ${DebugPanel_module_css_default.statusLive}` : DebugPanel_module_css_default.statusDot,
								"aria-hidden": true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DebugPanel_module_css_default.title,
								children: t("debugPanelTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DebugPanel_module_css_default.state,
								children: t(live ? "debugLive" : "debugIdle")
							}),
							state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DebugPanel_module_css_default.unsaved,
								children: t("debugUnsaved")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: DebugPanel_module_css_default.iconButton,
								type: "button",
								title: t("debugCopy"),
								"aria-label": t("debugCopy"),
								onClick: () => {
									copyDiagnostics();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: DebugPanel_module_css_default.iconButton,
								type: "button",
								title: t("debugPanelClose"),
								"aria-label": t("debugPanelClose"),
								disabled: !state.writable,
								onClick: () => {
									setOpen(false);
									props.edit({ debugEnabled: false });
									props.save();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: DebugPanel_module_css_default.visuallyHidden,
								"aria-live": "polite",
								children: copied ? t("debugCopied") : ""
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: DebugPanel_module_css_default.scrollArea,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: DebugPanel_module_css_default.guide,
								children: t("debugGuide")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: DebugPanel_module_css_default.section,
								"aria-labelledby": "smooth-stream-live-heading",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									id: "smooth-stream-live-heading",
									children: t("debugSectionLive")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: DebugPanel_module_css_default.metrics,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugFps"),
											value: fixed(metrics.fps, 0),
											tone: (metrics.fps ?? 60) < 45 ? "warn" : "good"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugFrameTime"),
											value: `${fixed(metrics.frameMs)} ms`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugBacklog"),
											value: String(metrics.streamBacklog),
											tone: metrics.streamBacklog > 32 ? "warn" : void 0
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugRevealSpeed"),
											value: `${fixed(metrics.streamSpeedCps, 0)} cps`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugProgress"),
											value: progress
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugFollowState"),
											value: t(metrics.followFollowing ? "debugFollowing" : "debugReleased")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugLag"),
											value: `${fixed(metrics.followLagPx)} px`,
											tone: metrics.followConstrained ? "warn" : void 0
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugVelocity"),
											value: `${fixed(metrics.followVelocityPxPerSec, 0)} px/s`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugReserve"),
											value: `${fixed(metrics.followReservePx)} px`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugCapacity"),
											value: `${fixed(metrics.followCapacityPx)} px`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
											label: t("debugAppliedScale"),
											value: `${fixed(metrics.followRevealScale, 2)}x`
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: DebugPanel_module_css_default.section,
								"aria-labelledby": "smooth-stream-reveal-heading",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									id: "smooth-stream-reveal-heading",
									children: t("debugSectionReveal")
								}), REVEAL_CONTROLS.map((control) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TuningField, {
									control,
									state,
									edit: props.edit,
									label: t(control.label),
									t
								}, control.key))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: DebugPanel_module_css_default.section,
								"aria-labelledby": "smooth-stream-follow-heading",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									id: "smooth-stream-follow-heading",
									children: t("debugSectionFollow")
								}), FOLLOW_CONTROLS.map((control) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TuningField, {
									control,
									state,
									edit: props.edit,
									label: t(control.label),
									t
								}, control.key))]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: DebugPanel_module_css_default.footer,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: DebugPanel_module_css_default.secondaryButton,
								type: "button",
								disabled: !state.writable,
								onClick: props.reset,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {}), t("debugReset")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: DebugPanel_module_css_default.footerSpacer }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: DebugPanel_module_css_default.secondaryButton,
								type: "button",
								disabled: !state.writable || !state.dirty,
								onClick: props.discard,
								children: t("debugDiscard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: DebugPanel_module_css_default.primaryButton,
								type: "button",
								disabled: !state.writable || !state.dirty,
								onClick: props.save,
								children: t("debugSave")
							})
						]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: state.enabled && open ? `${DebugPanel_module_css_default.trigger} ${DebugPanel_module_css_default.triggerActive}` : DebugPanel_module_css_default.trigger,
				"aria-expanded": state.enabled && open,
				"aria-label": t("debugPanelToggle"),
				title: t("debugPanelToggle"),
				onClick: () => {
					setOpen((current) => !current);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, {})
			}), typeof document === "undefined" || panel === null ? null : (0, react_dom.createPortal)(panel, document.body)] });
		}
		//#endregion
		//#region src/client/locales.ts
		/** Locale bundles for the smooth-stream plugin configuration card. */
		/** Dictionary namespace owned by this plugin's settings card. */
		const NS = "settings.smoothStream";
		/** English copy. */
		const en = {
			title: "Smooth stream",
			description: "How replies are revealed while they stream.",
			pageNav: "Reading",
			enabled: "Enable smooth streaming",
			enabledHint: "Let this plugin render and follow streaming replies. Turn off to use the built-in Harness renderer.",
			controlScroll: "Take over scrolling",
			controlScrollHint: "On by default; smooth-stream writes the conversation scroll position. Turn off to leave bottom-follow to Harness.",
			motionPreference: "Motion",
			motionPreferenceHint: "How streaming responds to the system reduce-motion setting.",
			motionAuto: "Follow system",
			motionAutoHint: "Reduced-motion systems get raw text (accessibility first).",
			motionForceSmooth: "Always smooth",
			motionForceSmoothHint: "Keep the smoothing engine even when the system asks for reduced motion.",
			motionForceReduced: "Always raw",
			motionForceReducedHint: "Render raw text even when the system allows motion.",
			thinkAutoExpand: "Auto-expand thinking",
			thinkAutoExpandHint: "Open the thinking block while it streams. Turn off to keep it collapsed.",
			debugEnabled: "Show render diagnostics",
			debugEnabledHint: "Show live streaming and scroll metrics on the right side of the chat. Tune values there, then save them here.",
			debugUnavailable: "Live diagnostics require a newer plugin Host.",
			debugPanelTitle: "Render diagnostics",
			debugPanelToggle: "Toggle render diagnostics",
			debugPanelClose: "Hide diagnostics panel",
			debugGuide: "Tune one value at a time while a reply streams. Keep FPS stable and backlog near zero. If text lags, raise the reveal multiplier, queue pressure, or maximum reveal; if a blank gap appears, reduce Predictive runway. Increase damping when the scroll feels springy. Save only after the behavior is stable; Reset restores the production defaults.",
			debugLive: "Streaming",
			debugIdle: "Idle",
			debugUnsaved: "Unsaved tuning",
			debugSave: "Save tuning",
			debugDiscard: "Discard changes",
			debugReset: "Reset tuning",
			debugCopy: "Copy diagnostics",
			debugCopied: "Copied",
			debugSectionLive: "Live renderer",
			debugSectionReveal: "Reveal tuning",
			debugSectionFollow: "Scroll tuning",
			debugFps: "FPS",
			debugFrameTime: "Frame",
			debugBacklog: "Backlog",
			debugRevealSpeed: "Reveal",
			debugProgress: "Progress",
			debugFollowState: "Follow",
			debugFollowing: "Pinned",
			debugReleased: "Released",
			debugLag: "Visual lag",
			debugVelocity: "Velocity",
			debugReserve: "Reserve",
			debugCapacity: "Capacity",
			debugAppliedScale: "Applied scale",
			debugRevealMultiplier: "Reveal multiplier",
			debugQueuePressure: "Queue pressure",
			debugMaxReveal: "Maximum reveal",
			debugSpringStiffness: "Spring stiffness",
			debugSpringDamping: "Spring damping",
			debugSpringMass: "Spring mass",
			debugRunway: "Predictive runway",
			debugReserveResponse: "Runway response",
			debugBackpressureMin: "Minimum backpressure",
			debugTipRevealMultiplier: "Overall reveal speed multiplier. Higher reveals text faster and clears backlog sooner, but can feel jumpy. Lower is smoother but takes longer to finish.",
			debugTipQueuePressure: "Backlog acceleration strength. Higher catches up to a growing queue more aggressively; lower keeps speed steadier but may leave backlog.",
			debugTipMaxReveal: "Hard cap for reveal speed in characters per second. Higher allows faster catch-up; lower limits bursts and keeps motion calmer.",
			debugTipSpringStiffness: "Scroll spring strength. Higher closes visual lag faster but can feel sharp; lower feels softer but follows more slowly.",
			debugTipSpringDamping: "Scroll energy damping. Higher suppresses overshoot and jitter but feels heavier; lower feels livelier but may oscillate.",
			debugTipSpringMass: "Scroll inertia. Higher makes movement slower and heavier; lower makes it react faster but can feel abrupt.",
			debugTipRunway: "Predictive blank space reserved while content grows. Higher absorbs growth and protects the bottom follow, but can create a larger visible gap; lower reduces blank space but leaves less room to absorb lag.",
			debugTipReserveResponse: "How quickly the reserved runway opens or closes. Higher changes more gradually; lower reacts faster but can look abrupt.",
			debugTipBackpressureMin: "Slowest reveal multiplier under scroll pressure. Higher keeps text moving but may increase visual lag; lower slows text more to protect smooth following.",
			readOnly: "This deployment stores settings read-only.",
			loading: "Loading plugin settings…",
			unavailable: "Plugin settings are unavailable in this connection.",
			retry: "Retry",
			version: "Version {version}",
			developmentVersion: "Development version {version}",
			updates: "Updates",
			updateHint: "Install the newest npm version, then restart Harness.",
			developmentBuild: "Linked source; updates are managed in the checkout.",
			updateUnavailable: "Updates are available only for an npm profile installation.",
			updateLocalOnly: "Updates run on the Host machine, so this page cannot start one.",
			update: "Update",
			updating: "Updating…",
			restartRequired: "Updated. Restart Harness to load the new version.",
			updateFailed: "The package update failed; your current version is unchanged.",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			unsaved: "Unsaved",
			saveFailed: "The deployment did not accept these values; they were left for you to correct."
		};
		/** Simplified Chinese copy. */
		const zh = {
			title: "丝滑流式",
			description: "回复在流式输出时如何逐字展现。",
			pageNav: "阅读体验",
			enabled: "启用丝滑流式渲染",
			enabledHint: "由本插件渲染并跟随流式回复；关闭后使用 Harness 内置渲染。",
			controlScroll: "接管滚动",
			controlScrollHint: "默认开启，由丝滑流式写入会话滚动位置；关闭后贴底滚动交给 Harness。",
			motionPreference: "动效偏好",
			motionPreferenceHint: "流式渲染如何响应系统的「减少动态效果」设置。",
			motionAuto: "跟随系统",
			motionAutoHint: "系统开启减少动态效果时直接呈现原始文本（优先无障碍）。",
			motionForceSmooth: "始终平滑",
			motionForceSmoothHint: "即使系统要求减少动态效果，仍保持平滑流式渲染。",
			motionForceReduced: "始终原始",
			motionForceReducedHint: "即使系统允许动效，也直接呈现原始文本。",
			thinkAutoExpand: "自动展开思考",
			thinkAutoExpandHint: "思考块在流式时自动展开；关闭后保持折叠，可手动展开。",
			debugEnabled: "显示渲染调试面板",
			debugEnabledHint: "在聊天右侧显示流式渲染和滚动的实时参数，可在面板中调节并在这里保存。",
			debugUnavailable: "当前 Host 版本不支持实时调试，请先更新插件 Host。",
			debugPanelTitle: "渲染诊断",
			debugPanelToggle: "显示或隐藏渲染诊断",
			debugPanelClose: "收起诊断面板",
			debugGuide: "流式输出时一次只调一个参数，观察帧率、积压和视觉滞后。优先保持帧率稳定、积压接近 0；如果文字滞后，提高揭示倍率、队列压力或最大揭示速度；如果底部出现空白，降低“预测预留空间”。滚动有回弹或抖动时提高阻尼。确认表现稳定后再保存；“恢复默认参数”会回到生产默认值。",
			debugLive: "正在流式输出",
			debugIdle: "空闲",
			debugUnsaved: "参数尚未保存",
			debugSave: "保存参数",
			debugDiscard: "放弃修改",
			debugReset: "恢复默认参数",
			debugCopy: "复制诊断数据",
			debugCopied: "已复制",
			debugSectionLive: "实时渲染",
			debugSectionReveal: "流式参数",
			debugSectionFollow: "滚动参数",
			debugFps: "帧率",
			debugFrameTime: "帧耗时",
			debugBacklog: "积压字符",
			debugRevealSpeed: "揭示速度",
			debugProgress: "渲染进度",
			debugFollowState: "跟随状态",
			debugFollowing: "跟随底部",
			debugReleased: "用户已释放",
			debugLag: "视觉滞后",
			debugVelocity: "滚动速度",
			debugReserve: "预留空间",
			debugCapacity: "安全容量",
			debugAppliedScale: "实际倍率",
			debugRevealMultiplier: "揭示倍率",
			debugQueuePressure: "队列压力",
			debugMaxReveal: "最大揭示速度",
			debugSpringStiffness: "弹簧刚度",
			debugSpringDamping: "弹簧阻尼",
			debugSpringMass: "弹簧质量",
			debugRunway: "预测预留空间",
			debugReserveResponse: "预留响应时间",
			debugBackpressureMin: "最小背压倍率",
			debugTipRevealMultiplier: "整体文字揭示速度倍率。调大能更快清空积压，但可能显得跳；调小更平滑，但完成回复需要更久。",
			debugTipQueuePressure: "积压对加速的影响强度。调大能更积极追赶增长中的队列；调小速度更稳定，但积压可能持续。",
			debugTipMaxReveal: "每秒揭示字符数上限。调大允许更快追赶；调小限制突发速度，让动作更平稳。",
			debugTipSpringStiffness: "滚动弹簧刚度。调大更快收拢视觉滞后，但感觉更硬；调小更柔和，但跟随更慢。",
			debugTipSpringDamping: "滚动能量阻尼。调大能抑制过冲和抖动，但感觉更沉；调小更灵活，但可能回弹。",
			debugTipSpringMass: "滚动惯性。调大移动更慢更沉；调小反应更快，但可能显得突兀。",
			debugTipRunway: "内容增长时预留的预测空白。调大更能吸收增长、保护底部跟随，但可能产生更大的可见空区；调小能减少空白，但可吸收滞后的空间也更少。",
			debugTipReserveResponse: "预留空间打开或关闭的响应时间。调大变化更渐进；调小反应更快，但可能显得突变。",
			debugTipBackpressureMin: "滚动压力下允许的最低揭示倍率。调大文字仍会较快前进，但视觉滞后可能增加；调小会更积极减速，以保护跟随平滑。",
			readOnly: "本部署的设置为只读。",
			loading: "正在加载插件设置…",
			unavailable: "当前连接无法访问插件设置。",
			retry: "重试",
			version: "版本 {version}",
			developmentVersion: "开发版本 {version}",
			updates: "更新",
			updateHint: "安装最新 npm 版本后重启 Harness。",
			developmentBuild: "当前为本地链接版本，请在源码目录管理更新。",
			updateUnavailable: "只有 profile 使用 npm 包时才能更新。",
			updateLocalOnly: "更新命令在宿主本机执行，此页面无法发起。",
			update: "更新",
			updating: "更新中…",
			restartRequired: "已更新；重启 Harness 后加载新版本。",
			updateFailed: "包更新失败，当前版本未改变。",
			save: "保存",
			saving: "保存中…",
			discard: "放弃修改",
			unsaved: "未保存",
			saveFailed: "本部署没有接受这些值，已保留供你修改。"
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* Cordis services required by the browser half. Only `slots` is load-bearing
		* for the stream itself; locale, the native settings scope and Connection power
		* the configuration card and are wired through `ctx.inject` below, so a
		* deployment without them still streams with defaults.
		*/
		const inject = ["slots"];
		const STREAM_MODES = ["typewriter", "teleprompter"];
		const STREAM_PRESETS = [
			"realtime",
			"balanced",
			"silky"
		];
		/**
		* The assistant renderer owns its own character queue and conversation
		* follower, so wrapping it again would create two scroll owners. Human input
		* stays immediate; every Agent-owned output renderer goes through the same
		* generic follow boundary. This is deliberately keyed by the owner that
		* provides the renderer, not by individual tool names, so new Context,
		* Command, and Tool rows are covered automatically.
		*/
		const SKIP_WRAP = /* @__PURE__ */ new Set([
			"assistant-step",
			"user",
			"steering",
			"command-input"
		]);
		/**
		* Rows that keep the shared entrance and follow lifecycle but never pace their
		* own text. Tool cards are this fork's deliberate exception: their content
		* arrives instantly — nothing inside a Tool card types itself out — while the
		* row still enters, glides, and follows with the rest of the transcript.
		*/
		const REVEAL_SKIP = /* @__PURE__ */ new Set(["tool-call"]);
		/** React function/class or an exotic component such as memo/forwardRef/lazy. */
		function isWrappableComponent(value) {
			return typeof value === "function" || value !== null && typeof value === "object" && "$$typeof" in value;
		}
		/**
		* Read the Host-bridged boot config. The inline script is produced by this
		* plugin's Host half from a schema-validated value, so only the structural
		* guarantees that could break between the two halves are re-checked: the
		* global is absent when the client runs without its Host entry (defaults
		* apply), and any present-but-malformed value fails loudly instead of
		* rendering a half-configured view.
		* @returns The resolved configuration for the assistant node view.
		*/
		function readBootConfig() {
			const raw = globalThis[STREAM_BOOT_GLOBAL];
			if (raw === void 0) {
				console.info("[dsh-smooth-stream] no host config bridge; using defaults");
				return DEFAULT_STREAM_CONFIG;
			}
			if (typeof raw !== "object" || raw === null || !STREAM_MODES.includes(raw.mode) || !STREAM_PRESETS.includes(raw.preset) || typeof raw.revealCharsPerSec !== "number" || typeof raw.scrollSpeedPxPerSec !== "number" || typeof raw.maxScrollSpeedPxPerSec !== "number") throw new Error(`[dsh-smooth-stream] malformed ${STREAM_BOOT_GLOBAL} boot global: ${JSON.stringify(raw)}`);
			return raw;
		}
		/**
		* Wrap every Agent-owned keyed Chat row except the assistant renderer in
		* place. A second
		* register with the same `children` table throws because the child slot is
		* already declared, and only the winning entry receives `renderSlot`;
		* swapping `entry.component` keeps the original children, locale, and inject
		* seats. `assistant-step` is replaced below so text and Think use the
		* typewriter reveal. The wrapper owns only the shared layout-growth/follow
		* lifecycle; the Harness keeps each renderer's controls, disclosures, and
		* cards intact.
		* @param ctx - Browser context carrying the slot registry.
		* @returns Restorer that puts the original components back.
		*/
		function wrapAgentChatRows(ctx, useControlScroll) {
			const restores = [];
			const wrapped = /* @__PURE__ */ new WeakSet();
			const wrapAll = () => {
				for (const entry of ctx.slots.entries("conversation.chat.node")) {
					const key = entry.options.key;
					if (key === void 0 || SKIP_WRAP.has(key)) continue;
					const current = entry.component;
					if (!isWrappableComponent(current) || wrapped.has(current)) continue;
					const inner = current;
					const next = wrapFollowNodeView(inner, useControlScroll, { reveal: !REVEAL_SKIP.has(key) });
					wrapped.add(next);
					entry.component = next;
					restores.push(() => {
						if (entry.component === next) entry.component = inner;
					});
				}
			};
			wrapAll();
			const off = ctx.on("slots/changed", (key) => {
				if (key === "conversation.chat.node") wrapAll();
			});
			return () => {
				off();
				for (const restore of restores) restore();
			};
		}
		/**
		* A live settings cell shared by the renderer lifecycle and React views. It
		* starts on the shared defaults and follows the native settings scope once the
		* `settingsScope` service binds this plugin's namespace.
		*/
		var SettingsCell = class {
			listeners = /* @__PURE__ */ new Set();
			scope;
			detach;
			value = DEFAULT_STREAM_SETTINGS;
			pending = false;
			/** Re-point the cell at the native namespace scope. */
			attach(scope) {
				this.scope = scope;
				this.refresh();
				const unsubscribe = scope.subscribe(() => {
					this.refresh();
				});
				const release = () => {
					unsubscribe();
					if (this.scope !== scope) return;
					this.scope = void 0;
					this.refresh();
				};
				this.detach = release;
				return () => {
					if (this.detach === release) this.detach = void 0;
					release();
				};
			}
			read() {
				const value = this.scope?.getSnapshot().value;
				return value === void 0 ? this.value : value;
			}
			refresh() {
				const next = this.read();
				const pending = this.scope?.getSnapshot().status === "loading";
				if (pending === this.pending && next.enabled === this.value.enabled && next.controlScroll === this.value.controlScroll && next.motionPreference === this.value.motionPreference && next.thinkAutoExpand === this.value.thinkAutoExpand && next.debugEnabled === this.value.debugEnabled && next.debugTuning === this.value.debugTuning) return;
				this.pending = pending;
				this.value = next;
				for (const listener of this.listeners) listener();
			}
			/** False while an available settings service is resolving its authority. */
			takeoverEnabled() {
				return !this.pending && this.value.enabled;
			}
			getSnapshot = () => this.value;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
		};
		/**
		* Register the typewriter renderer after the Chat package declares the keyed
		* Chat node seat. A lower priority shadows the built-in assistant row; every
		* other keyed renderer is wrapped in place so Context, commands, Tool cards,
		* retries, and workflow runs share one extensible follow boundary — with the
		* Tool row's own text left unpaced (see {@link REVEAL_SKIP}). The Host-bridged
		* configuration selects the render direction, smoothing preset, and glide
		* speed, while the native settings namespace supplies the live preferences.
		* @param ctx - Browser context carrying the shared slot registry.
		*/
		function apply(ctx) {
			const config = readBootConfig();
			const settings = new SettingsCell();
			const useControlScroll = () => (0, react.useSyncExternalStore)(settings.subscribe, () => settings.getSnapshot().controlScroll, () => settings.getSnapshot().controlScroll);
			ctx.inject([
				"slots",
				"locale",
				"settingsScope"
			], (settingsCtx) => {
				const scope = settingsCtx.settingsScope.bind({ namespace: STREAM_SETTINGS_NS });
				const connection = settingsCtx.get("connection");
				const card = new SmoothStreamCardController({
					scope,
					pluginApi: connection === void 0 ? void 0 : createSmoothStreamPluginApi(connection),
					isLoopback: connection?.isLoopback === true
				});
				const detachSettings = settings.attach(scope);
				const syncDebug = () => {
					const snapshot = card.getSnapshot();
					debugRuntime.syncSettings({
						available: snapshot.debugAvailable,
						enabled: snapshot.debugEnabled,
						writable: snapshot.writable && !snapshot.saving,
						dirty: snapshot.dirty,
						status: snapshot.status,
						tuning: snapshot.debugTuning
					});
				};
				const detachBinding = debugRuntime.bindSettings({
					edit: (patch) => {
						card.inject().edit(patch);
					},
					save: () => {
						card.inject().save();
					},
					discard: () => {
						card.inject().discard();
					}
				});
				const detachDebug = card.subscribe(syncDebug);
				syncDebug();
				card.start();
				const t = settingsCtx.locale.bind(NS);
				settingsCtx.effect(() => settingsCtx.locale.register(NS, {
					zh,
					en
				}), "dsh-smooth-stream: settings dictionaries");
				settingsCtx.slots.inject("settings.section", () => claimReadingSettingsPage(settingsCtx, () => t("pageNav"), NS));
				settingsCtx.slots.inject(READING_ITEM_SLOT, () => settingsCtx.slots.register({
					name: READING_ITEM_SLOT,
					id: STREAM_SETTINGS_NS,
					order: 10,
					locale: NS,
					inject: () => card.inject()
				}, SmoothStreamCard));
				settingsCtx.slots.inject("conversation.session.header.utilities", () => settingsCtx.slots.register({
					name: "conversation.session.header.utilities",
					id: "smooth-stream-debug",
					order: 40,
					locale: NS,
					inject: () => debugRuntime.panelFace()
				}, DebugPanel));
				return () => {
					card.stop();
					detachDebug();
					detachSettings();
					detachBinding();
				};
			});
			const configured = function StreamConfiguredView(props) {
				const preferences = (0, react.useSyncExternalStore)(settings.subscribe, settings.getSnapshot, settings.getSnapshot);
				return (0, react.createElement)(TypewriterAssistantNodeView, {
					...props,
					mode: config.mode,
					preset: config.preset,
					revealCharsPerSec: config.revealCharsPerSec,
					scrollSpeedPxPerSec: config.scrollSpeedPxPerSec,
					maxScrollSpeedPxPerSec: config.maxScrollSpeedPxPerSec,
					thinkAutoExpand: preferences.thinkAutoExpand,
					controlScroll: preferences.controlScroll,
					motionPreference: preferences.motionPreference
				});
			};
			ctx.slots.inject("conversation.chat.node", () => {
				let releaseTakeover;
				const syncTakeover = () => {
					if (!settings.takeoverEnabled()) {
						releaseTakeover?.();
						releaseTakeover = void 0;
						return;
					}
					if (releaseTakeover !== void 0) return;
					const unwrap = wrapAgentChatRows(ctx, useControlScroll);
					const unshadow = ctx.slots.register({
						name: "conversation.chat.node",
						key: "assistant-step",
						priority: -100,
						locale: "chat",
						registrant: "@lynn123411/dsh-smooth-stream"
					}, configured);
					releaseTakeover = () => {
						unwrap();
						unshadow();
					};
				};
				const unsubscribe = settings.subscribe(syncTakeover);
				syncTakeover();
				return () => {
					unsubscribe();
					releaseTakeover?.();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
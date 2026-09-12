window.__ModuleLoader__.load({
	id: "@lynn123411/dsh-antigravity-auth",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/status.ts
		const CAPABILITY_ROW_IDS = [
			"auth-llm",
			"search",
			"image",
			"video"
		];
		Object.freeze(CAPABILITY_ROW_IDS.map((id) => Object.freeze({
			id,
			state: "disabled",
			reasonCode: "unauthenticated"
		})));
		//#endregion
		//#region src/login-types.ts
		/** Browser-safe login state shared by the Host OAuth flow and settings RPC. */
		const LOGIN_PHASES = [
			"idle",
			"pending",
			"success",
			"cancelled",
			"expired",
			"port-conflict",
			"failed"
		];
		const LOGIN_ERROR_CODES = [
			"invalid-method",
			"invalid-path",
			"invalid-host",
			"duplicate-parameter",
			"invalid-parameters",
			"missing-state",
			"state-mismatch",
			"missing-code",
			"oauth-error",
			"no-pending-flow",
			"expired",
			"cancelled",
			"port-conflict",
			"token-exchange-failed",
			"project-unavailable",
			"project-authentication-failed",
			"project-forbidden",
			"project-rate-limited",
			"project-offline",
			"project-malformed",
			"project-protocol-drift",
			"project-validation-failed",
			"persistence-failed",
			"credential-conflict",
			"invalid-callback-url",
			"risk-acknowledgement-required",
			"internal"
		];
		function isLoginPhase(value) {
			return typeof value === "string" && LOGIN_PHASES.includes(value);
		}
		function isLoginErrorCode(value) {
			return typeof value === "string" && LOGIN_ERROR_CODES.includes(value);
		}
		//#endregion
		//#region src/model-catalog.ts
		/** Browser-safe advisory model-catalog state shared by Host RPC and settings. */
		const ANTIGRAVITY_MODEL_CATALOG_STATES = [
			"snapshot",
			"live-available",
			"refresh-failed",
			"protocol-drift"
		];
		//#endregion
		//#region src/rpc-vocabulary.ts
		/** Closed, browser-safe RPC error vocabulary shared by Host and client. */
		const OPERATION_ERROR_CODES = [
			"loopback-required",
			"invalid-grant",
			"network",
			"timeout",
			"rate-limited",
			"server-error",
			"http-error",
			"invalid-response",
			"conflict",
			"storage"
		];
		const SAFE_RPC_ERROR_CODES = [
			"bad-request",
			...LOGIN_ERROR_CODES,
			...OPERATION_ERROR_CODES
		];
		const SAFE_RPC_ERROR_MESSAGES = Object.freeze({
			"bad-request": "antigravity-auth: invalid request",
			"loopback-required": "Antigravity account controls require a loopback-bound DSH Host",
			cancelled: "The operation was cancelled",
			"risk-acknowledgement-required": "Risk acknowledgement is required before login",
			"port-conflict": "The fixed OAuth callback port is already in use",
			"invalid-method": "The OAuth callback method is not accepted",
			"invalid-path": "The OAuth callback path is not accepted",
			"invalid-host": "The OAuth callback host is not accepted",
			"duplicate-parameter": "The OAuth callback contains duplicate parameters",
			"invalid-parameters": "The OAuth callback parameters are not accepted",
			"missing-state": "The OAuth callback state is missing",
			"state-mismatch": "The OAuth callback state was not accepted",
			"missing-code": "The OAuth callback code is missing",
			"oauth-error": "The OAuth provider rejected authorization",
			expired: "The OAuth login expired",
			"no-pending-flow": "There is no pending OAuth login",
			"project-unavailable": "No usable project is available for this account",
			"project-authentication-failed": "The Antigravity project probe requires authentication",
			"project-forbidden": "The Antigravity project probe was forbidden",
			"project-rate-limited": "The Antigravity project probe is rate-limited",
			"project-offline": "The Antigravity project probe is offline",
			"project-malformed": "The Antigravity project response was malformed",
			"project-protocol-drift": "The Antigravity project protocol changed",
			"project-validation-failed": "Project validation failed",
			"credential-conflict": "The login changed while it was completing",
			"persistence-failed": "The login could not be saved",
			"token-exchange-failed": "The authorization code could not be exchanged",
			"invalid-callback-url": "The callback URL is invalid",
			"invalid-grant": "The account must be authenticated again",
			network: "The operation could not reach the provider",
			timeout: "The operation timed out",
			"rate-limited": "The operation is rate-limited",
			"server-error": "The provider is unavailable",
			"http-error": "The provider rejected the operation",
			"invalid-response": "The provider response was not accepted",
			conflict: "The account changed while the operation was running",
			storage: "The local account state could not be updated"
		});
		function isSafeRpcErrorCode(value) {
			return typeof value === "string" && SAFE_RPC_ERROR_CODES.includes(value);
		}
		function safeRpcErrorMessage(code) {
			return SAFE_RPC_ERROR_MESSAGES[code] ?? "antigravity-auth: operation failed";
		}
		//#endregion
		//#region src/safe-text.ts
		/** Shared bounded text predicate for Host trust-boundary values. */
		function isBoundedSafeText(value, maxLength, minLength = 1) {
			if (typeof value !== "string" || !Number.isSafeInteger(maxLength) || !Number.isSafeInteger(minLength) || minLength < 0 || maxLength < minLength || value.length < minLength || value.length > maxLength) return false;
			for (let index = 0; index < value.length; index += 1) {
				const codePoint = value.charCodeAt(index);
				if (codePoint < 32 || codePoint === 127) return false;
			}
			return true;
		}
		//#endregion
		//#region src/rpc-contract.ts
		const ANTIGRAVITY_AUTH_RPC_CHANNEL = "/api";
		const ANTIGRAVITY_AUTH_RPC_NAMESPACE = "antigravity-auth";
		/** Build the browser face over the plugin-owned guarded account channel. */
		function createAntigravityAuthRpcClient(rpc) {
			return {
				status: (signal) => callValidated(rpc, "status", {}, signal, (value) => {
					const status = parseStatusResult(value);
					return status === void 0 ? void 0 : { status };
				}),
				acknowledgeRisk: (signal) => callValidated(rpc, "acknowledge-risk", { acknowledge: true }, signal, parseAcknowledgementResult),
				login: (signal) => callValidated(rpc, "login", {}, signal, parseLoginResult),
				completeCallback: (callbackUrl, signal) => callValidated(rpc, "complete-callback", { callbackUrl }, signal, parseLoginCompletionResult),
				cancelLogin: (signal) => callValidated(rpc, "cancel", {}, signal, parseActionResult),
				logout: (signal) => callValidated(rpc, "logout", {}, signal, parseLogoutResult),
				revoke: (signal) => callValidated(rpc, "revoke", { confirmed: true }, signal, parseRevokeResult),
				models: (signal, force = false) => callValidated(rpc, "models", { force }, signal, parseModelCatalogResult),
				usage: (signal, force = false) => callValidated(rpc, "usage", { force }, signal, parseUsageResult)
			};
		}
		async function callValidated(rpc, endpoint, payload, signal, parse) {
			let result;
			try {
				result = await rpc.call(ANTIGRAVITY_AUTH_RPC_CHANNEL, `${ANTIGRAVITY_AUTH_RPC_NAMESPACE}/${endpoint}`, payload, signal);
			} catch {
				return invalidResponse(endpoint);
			}
			if (!result.ok) return sanitizeFailure(result, endpoint);
			const value = parse(result.value);
			return value === void 0 ? invalidResponse(endpoint) : {
				ok: true,
				value
			};
		}
		function sanitizeFailure(result, endpoint) {
			const error = result.error;
			if (!isRecord$1(error) || !hasExactKeys(error, [
				"code",
				"message",
				"details"
			]) || !isSafeRpcErrorCode(error.code) || typeof error.message !== "string" || !isBoundedSafeText(error.message, 512) || !isSafeErrorDetails(error.details)) return invalidResponse(endpoint);
			return {
				ok: false,
				error: {
					code: error.code,
					message: safeRpcErrorMessage(error.code),
					details: {}
				}
			};
		}
		function isSafeErrorDetails(value) {
			if (!isRecord$1(value)) return false;
			if (Object.keys(value).length === 0) return true;
			return hasExactKeys(value, ["issues"]) && Array.isArray(value.issues) && value.issues.length === 0;
		}
		/** Parse a closed, value-safe advisory model catalog received by the browser. */
		function parseModelCatalogResult(value) {
			if (!isRecord$1(value) || !hasExactKeys(value, [
				"state",
				"models",
				...value.checkedAt === void 0 ? [] : ["checkedAt"]
			]) || !ANTIGRAVITY_MODEL_CATALOG_STATES.includes(value.state) || !Array.isArray(value.models) || value.models.length === 0 || value.models.length > 64 || value.checkedAt !== void 0 && !isIsoTime(value.checkedAt)) return void 0;
			const models = [];
			const ids = /* @__PURE__ */ new Set();
			for (const model of value.models) {
				if (!isRecord$1(model) || !hasExactKeys(model, [
					"id",
					"name",
					"state"
				]) || !isBoundedSafeText(model.id, 256) || !isBoundedSafeText(model.name, 256) || model.state !== "snapshot" && model.state !== "live-available" && model.state !== "unavailable" || ids.has(model.id)) return void 0;
				if (value.state === "live-available" ? model.state === "snapshot" : model.state !== "snapshot") return void 0;
				ids.add(model.id);
				models.push({
					id: model.id,
					name: model.name,
					state: model.state
				});
			}
			return {
				state: value.state,
				models,
				...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}
			};
		}
		/** Parse a value-safe, normalized quota envelope received by the browser. */
		function parseUsageResult(value) {
			if (!isRecord$1(value) || !hasExactKeys(value, [
				"state",
				...value.checkedAt === void 0 ? [] : ["checkedAt"],
				...value.groups === void 0 ? [] : ["groups"]
			])) return void 0;
			if (!isQuotaState(value.state)) return void 0;
			if (value.checkedAt !== void 0 && !isIsoTime(value.checkedAt)) return void 0;
			if (value.state === "available" && value.groups === void 0) return void 0;
			if (value.groups !== void 0) {
				if (!Array.isArray(value.groups) || value.groups.length === 0 || value.groups.length > 2) return void 0;
				const groups = [];
				const groupNames = /* @__PURE__ */ new Set();
				for (const rawGroup of value.groups) {
					if (!isRecord$1(rawGroup) || !hasExactKeys(rawGroup, [
						"group",
						"modelCount",
						"windows"
					]) || rawGroup.group !== "gemini" && rawGroup.group !== "non-gemini" || !Number.isSafeInteger(rawGroup.modelCount) || rawGroup.modelCount < 0 || !Array.isArray(rawGroup.windows)) return void 0;
					if (groupNames.has(rawGroup.group)) return void 0;
					groupNames.add(rawGroup.group);
					const modelCount = rawGroup.modelCount;
					if (rawGroup.windows.length === 0 || rawGroup.windows.length > 2) return void 0;
					const windows = [];
					const windowKinds = /* @__PURE__ */ new Set();
					for (const rawWindow of rawGroup.windows) {
						if (!isRecord$1(rawWindow) || !hasExactKeys(rawWindow, [
							"window",
							"remainingFraction",
							"resetTime"
						]) || rawWindow.window !== "5h" && rawWindow.window !== "weekly" || windowKinds.has(rawWindow.window) || typeof rawWindow.remainingFraction !== "number" || !Number.isFinite(rawWindow.remainingFraction) || rawWindow.remainingFraction < 0 || rawWindow.remainingFraction > 1 || !isIsoTime(rawWindow.resetTime)) return void 0;
						windowKinds.add(rawWindow.window);
						windows.push({
							window: rawWindow.window,
							remainingFraction: rawWindow.remainingFraction,
							resetTime: rawWindow.resetTime
						});
					}
					groups.push({
						group: rawGroup.group,
						modelCount,
						windows
					});
				}
				return {
					state: value.state,
					...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {},
					groups
				};
			}
			return {
				state: value.state,
				...typeof value.checkedAt === "string" ? { checkedAt: value.checkedAt } : {}
			};
		}
		/** Parse the closed status envelope received by the browser. */
		function parseStatusResult(value) {
			if (!isRecord$1(value) || !hasExactKeys(value, ["status"])) return void 0;
			return parseStatus(value.status);
		}
		function parseStatus(value) {
			if (!isRecord$1(value) || !hasAllowedKeys(value, [
				"pluginId",
				"phase",
				"privateSelfUse",
				"singleAccount",
				"riskAcknowledgementRequired",
				"riskAcknowledged",
				"login",
				"credential",
				"revoke",
				"capabilities"
			]) || value.pluginId !== "dsh-antigravity-auth" || value.phase !== "bootstrap" || value.privateSelfUse !== true || value.singleAccount !== true || value.riskAcknowledgementRequired !== true || typeof value.riskAcknowledged !== "boolean" || !Array.isArray(value.capabilities)) return void 0;
			const login = parseLoginStatus(value.login);
			if (login === void 0) return void 0;
			const credential = value.credential === void 0 ? void 0 : parseCredentialStatus(value.credential);
			if (value.credential !== void 0 && credential === void 0) return void 0;
			const revoke = value.revoke === void 0 ? void 0 : parseRevokeStatus(value.revoke);
			if (value.revoke !== void 0 && revoke === void 0) return void 0;
			const seen = /* @__PURE__ */ new Set();
			const capabilities = [];
			for (const capability of value.capabilities) {
				const parsed = parseCapability(capability);
				if (parsed === void 0 || seen.has(parsed.id)) return void 0;
				seen.add(parsed.id);
				capabilities.push(parsed);
			}
			if (seen.size !== CAPABILITY_ROW_IDS.length || CAPABILITY_ROW_IDS.some((id) => !seen.has(id))) return void 0;
			return {
				pluginId: "dsh-antigravity-auth",
				phase: "bootstrap",
				privateSelfUse: true,
				singleAccount: true,
				riskAcknowledgementRequired: true,
				riskAcknowledged: value.riskAcknowledged,
				login,
				...credential === void 0 ? {} : { credential },
				...revoke === void 0 ? {} : { revoke },
				capabilities
			};
		}
		function parseCredentialStatus(value) {
			if (!isRecord$1(value) || typeof value.state !== "string" || !isCredentialState(value.state) || typeof value.configured !== "boolean" || !hasAllowedKeys(value, [
				"state",
				"configured",
				"expiresAt",
				"lastRefreshAt",
				"errorCode"
			])) return void 0;
			if (value.expiresAt !== void 0 && !isIsoTime(value.expiresAt)) return void 0;
			if (value.lastRefreshAt !== void 0 && !isIsoTime(value.lastRefreshAt)) return void 0;
			if (value.errorCode !== void 0 && (typeof value.errorCode !== "string" || !isCredentialErrorCode(value.errorCode))) return void 0;
			return {
				state: value.state,
				configured: value.configured,
				...typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {},
				...typeof value.lastRefreshAt === "string" ? { lastRefreshAt: value.lastRefreshAt } : {},
				...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
			};
		}
		function parseRevokeStatus(value) {
			if (!isRecord$1(value) || typeof value.state !== "string" || !isRevokeState(value.state) || !hasAllowedKeys(value, ["state", "errorCode"])) return void 0;
			if (value.errorCode !== void 0 && (typeof value.errorCode !== "string" || !isRevokeErrorCode(value.errorCode))) return void 0;
			return {
				state: value.state,
				...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
			};
		}
		function parseLoginStatus(value) {
			if (!isRecord$1(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase) || typeof value.configured !== "boolean" || typeof value.projectAvailable !== "boolean") return void 0;
			const allowed = [
				"phase",
				"configured",
				"projectAvailable",
				"authorizationUrl",
				"expiresAt",
				"maskedEmail",
				"errorCode"
			];
			if (Object.keys(value).some((key) => !allowed.includes(key))) return void 0;
			if (value.authorizationUrl !== void 0 && !isSafeAuthorizationUrl(value.authorizationUrl)) return void 0;
			if (value.expiresAt !== void 0 && !isIsoTime(value.expiresAt)) return void 0;
			if (value.maskedEmail !== void 0 && (typeof value.maskedEmail !== "string" || !isMaskedEmail(value.maskedEmail))) return void 0;
			if (value.errorCode !== void 0 && !isLoginErrorCode(value.errorCode)) return void 0;
			if (isErrorPhase(value.phase) ? typeof value.errorCode !== "string" : value.errorCode !== void 0) return void 0;
			if (value.phase === "pending" ? typeof value.authorizationUrl !== "string" || typeof value.expiresAt !== "string" : value.authorizationUrl !== void 0) return void 0;
			return {
				phase: value.phase,
				configured: value.configured,
				projectAvailable: value.projectAvailable,
				...typeof value.authorizationUrl === "string" ? { authorizationUrl: value.authorizationUrl } : {},
				...typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {},
				...typeof value.maskedEmail === "string" ? { maskedEmail: value.maskedEmail } : {},
				...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
			};
		}
		function parseCapability(value) {
			if (!isRecord$1(value) || !hasExactKeys(value, [
				"id",
				"state",
				"reasonCode"
			])) return void 0;
			if (!isCapabilityRowId(value.id) || !isCapabilityGateState(value.state) || !isCapabilityReasonCode(value.reasonCode)) return;
			return {
				id: value.id,
				state: value.state,
				reasonCode: value.reasonCode
			};
		}
		function parseAcknowledgementResult(value) {
			return isRecord$1(value) && hasExactKeys(value, ["acknowledged"]) && value.acknowledged === true ? { acknowledged: true } : void 0;
		}
		function parseLoginResult(value) {
			return isRecord$1(value) && hasExactKeys(value, [
				"started",
				"phase",
				"authorizationUrl",
				"expiresAt"
			]) && value.started === true && value.phase === "pending" && isSafeAuthorizationUrl(value.authorizationUrl) && isIsoTime(value.expiresAt) ? {
				started: true,
				phase: "pending",
				authorizationUrl: value.authorizationUrl,
				expiresAt: value.expiresAt
			} : void 0;
		}
		function parseLoginCompletionResult(value) {
			if (!isRecord$1(value) || typeof value.completed !== "boolean" || typeof value.phase !== "string") return void 0;
			if (value.completed === true) {
				if (value.phase !== "success") return void 0;
				if (!hasExactKeys(value, ["completed", "phase"])) return void 0;
				return {
					completed: true,
					phase: "success"
				};
			}
			if (value.completed === false) {
				if (value.phase !== "failed" && value.phase !== "cancelled") return void 0;
				if (!hasExactKeys(value, [
					"completed",
					"phase",
					"errorCode"
				])) return void 0;
				if (!isLoginErrorCode(value.errorCode)) return void 0;
				return {
					completed: false,
					phase: value.phase,
					errorCode: value.errorCode
				};
			}
		}
		function parseActionResult(value) {
			if (!isRecord$1(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase)) return void 0;
			if (Object.keys(value).some((key) => key !== "phase" && key !== "errorCode")) return void 0;
			if (value.errorCode !== void 0 && !isLoginErrorCode(value.errorCode)) return void 0;
			return {
				phase: value.phase,
				...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
			};
		}
		function parseLogoutResult(value) {
			return isRecord$1(value) && hasExactKeys(value, ["state"]) && value.state === "logged-out" ? { state: "logged-out" } : void 0;
		}
		function parseRevokeResult(value) {
			if (!isRecord$1(value) || typeof value.state !== "string") return void 0;
			if (value.state === "confirmation-required" || value.state === "revoked" || value.state === "logged-out" || value.state === "superseded") return hasExactKeys(value, ["state"]) ? { state: value.state } : void 0;
			if (value.state === "failed" && hasExactKeys(value, ["state", "errorCode"]) && typeof value.errorCode === "string" && isRevokeErrorCode(value.errorCode)) return {
				state: "failed",
				errorCode: value.errorCode
			};
		}
		function isSafeAuthorizationUrl(value) {
			if (typeof value !== "string" || value.length === 0 || value.length > 8192) return false;
			try {
				const parsed = new URL(value);
				const allowed = /* @__PURE__ */ new Set([
					"client_id",
					"response_type",
					"redirect_uri",
					"scope",
					"code_challenge",
					"code_challenge_method",
					"state",
					"access_type",
					"prompt"
				]);
				for (const [key, parameter] of parsed.searchParams) if (!allowed.has(key) || parsed.searchParams.getAll(key).length !== 1 || !isBoundedSafeText(parameter, 4096)) return false;
				const state = parsed.searchParams.get("state");
				const clientId = parsed.searchParams.get("client_id");
				const challenge = parsed.searchParams.get("code_challenge");
				return parsed.protocol === "https:" && parsed.hostname === "accounts.google.com" && parsed.port === "" && parsed.username === "" && parsed.password === "" && parsed.pathname === "/o/oauth2/v2/auth" && parsed.hash.length === 0 && typeof state === "string" && /^[A-Za-z0-9_-]{43}$/u.test(state) && (clientId === null || clientId.length <= 256 && clientId.endsWith(".apps.googleusercontent.com")) && (challenge === null || /^[A-Za-z0-9_-]{43}$/u.test(challenge)) && (parsed.searchParams.get("response_type") === null || parsed.searchParams.get("response_type") === "code") && (parsed.searchParams.get("redirect_uri") === null || parsed.searchParams.get("redirect_uri") === "http://localhost:51121/oauth-callback") && (parsed.searchParams.get("code_challenge_method") === null || parsed.searchParams.get("code_challenge_method") === "S256") && (parsed.searchParams.get("access_type") === null || parsed.searchParams.get("access_type") === "offline") && (parsed.searchParams.get("prompt") === null || parsed.searchParams.get("prompt") === "consent");
			} catch {
				return false;
			}
		}
		function isMaskedEmail(value) {
			return isBoundedSafeText(value, 256) && /^.[*]{3}[^@]*@[^@\s]+$/u.test(value);
		}
		function isErrorPhase(value) {
			return value === "cancelled" || value === "expired" || value === "port-conflict" || value === "failed";
		}
		function isQuotaState(value) {
			return value === "available" || value === "unauthenticated" || value === "forbidden" || value === "rate-limited" || value === "offline" || value === "timeout" || value === "protocol-drift";
		}
		function isIsoTime(value) {
			if (typeof value !== "string" || value.length > 64) return false;
			const timestamp = Date.parse(value);
			return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
		}
		function isCapabilityRowId(value) {
			return typeof value === "string" && CAPABILITY_ROW_IDS.includes(value);
		}
		function isCapabilityGateState(value) {
			return value === "available" || value === "disabled" || value === "poc-pending" || value === "protocol-drift";
		}
		function isCapabilityReasonCode(value) {
			return value === "gate-not-run" || value === "project-unavailable" || value === "capability-ready" || value === "unauthenticated" || value === "rate-limited" || value === "cancelled" || value === "gate-0-failed" || value === "gate-failed" || value === "unsupported-video" || value === "protocol-drift";
		}
		function isCredentialState(value) {
			return value === "logged-out" || value === "logged-in" || value === "refreshing" || value === "refresh-failed" || value === "re-login-required";
		}
		function isCredentialErrorCode(value) {
			return value === "invalid-grant" || value === "network" || value === "timeout" || value === "rate-limited" || value === "server-error" || value === "http-error" || value === "invalid-response" || value === "conflict" || value === "storage" || value === "cancelled";
		}
		function isRevokeState(value) {
			return value === "idle" || value === "pending" || value === "confirmation-required" || value === "revoked" || value === "logged-out" || value === "failed" || value === "superseded";
		}
		function isRevokeErrorCode(value) {
			return value === "network" || value === "timeout" || value === "rate-limited" || value === "server-error" || value === "http-error" || value === "invalid-response" || value === "storage";
		}
		function hasAllowedKeys(value, allowed) {
			return Object.keys(value).every((key) => allowed.includes(key));
		}
		function hasExactKeys(value, expected) {
			const keys = Object.keys(value).sort();
			const sortedExpected = [...expected].sort();
			return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
		}
		function invalidResponse(endpoint) {
			return {
				ok: false,
				error: {
					code: "internal",
					message: `antigravity-auth: invalid ${endpoint} response from Host`,
					details: {}
				}
			};
		}
		function isRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		//#endregion
		//#region src/client/styles.ts
		/** Embedded CSS stylesheet for value-safe Antigravity settings UI. */
		const SETTINGS_CSS = `
.agy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 4px 0 32px;
  color: var(--dsw-alias-label-primary, #e6edf3);
  font-family: var(--dsw-font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

.agy-settings *,
.agy-settings *::before,
.agy-settings *::after {
  box-sizing: border-box;
}

.agy-bundle-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.agy-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-bundle-title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
  flex: none;
}

.agy-bundle-intro,
.agy-card-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  line-height: 20px;
}

.agy-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.agy-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.agy-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agy-card-identity {
  min-width: 0;
  flex: 1;
}

.agy-card-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-card-title {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-card-action {
  flex: none;
  display: flex;
  align-items: center;
}

.agy-risk-card {
  background: rgba(234, 179, 8, 0.04);
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agy-risk-text {
  color: var(--dsw-alias-label-secondary, #9ca3af);
  font-size: 13px;
  line-height: 19px;
  margin: 0;
}

.agy-link-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.agy-link {
  color: var(--dsw-alias-interactive-text, #38bdf8);
  font-size: 12px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.agy-link:hover {
  text-decoration: underline;
  color: #7dd3fc;
}

.agy-ack-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-checkbox {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--dsw-alias-button-primary-fill, #3b82f6);
  cursor: pointer;
}

.agy-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.agy-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 16px;
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
}

.agy-fact {
  min-width: 0;
}

.agy-fact dt {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8b949e);
}

.agy-fact dd {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

/* Quota Section */
.agy-quota-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.agy-quota-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.15));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.03));
}

.agy-quota-group-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agy-quota-group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #a1a1aa);
}

.agy-quota-group-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #71717a);
}

.agy-quota-buckets {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}

.agy-quota-bucket {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agy-quota-bucket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  line-height: 18px;
}

.agy-quota-bucket-name {
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}

.agy-quota-bucket-val {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  color: var(--dsw-alias-label-primary, #ffffff);
  animation: agy-fade-in 250ms ease;
}

.agy-quota-bucket-val[data-tone='normal'] {
  color: var(--dsw-alias-state-success-label, #10b981);
}

.agy-quota-bucket-val[data-tone='warning'] {
  color: var(--dsw-alias-state-warn-label, #f59e0b);
}

.agy-quota-bucket-val[data-tone='error'] {
  color: var(--dsw-alias-state-error-label, #ef4444);
}

.agy-quota-querying {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 12px;
  line-height: 18px;
  animation: agy-fade-in 200ms ease;
}

.agy-querying-spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  border-top-color: var(--dsw-alias-brand-primary, #4f6ef7);
  animation: agy-spin 0.8s linear infinite;
  display: inline-block;
  flex: none;
}

.agy-progress-track {
  position: relative;
  height: 6px;
  width: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

@keyframes agy-fill-progress {
  from {
    transform: scaleX(0);
    opacity: 0.7;
  }
  to {
    transform: scaleX(1);
    opacity: 1;
  }
}

.agy-progress-bar {
  height: 100%;
  border-radius: 999px;
  transform-origin: left center;
  animation: agy-fill-progress 650ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: width 400ms cubic-bezier(0.16, 1, 0.3, 1), background 400ms ease;
}

.agy-progress-bar[data-tone='normal'] {
  background: linear-gradient(90deg, #f59e0b 0%, #10b981 35%, #059669 100%);
}

.agy-progress-bar[data-tone='warning'] {
  background: linear-gradient(90deg, #ef4444 0%, #f97316 40%, #f59e0b 100%);
}

.agy-progress-bar[data-tone='error'] {
  background: linear-gradient(90deg, #f87171 0%, #ef4444 50%, #dc2626 100%);
}

.agy-shimmer-track {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) 25%,
    var(--dsw-alias-fill-secondary, rgba(255, 255, 255, 0.14)) 50%,
    var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) 75%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: agy-shimmer-stream 1.6s ease-in-out infinite;
}

@keyframes agy-shimmer-stream {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes agy-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.agy-quota-subtext {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-variant-numeric: tabular-nums;
}

/* Actions */
.agy-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.agy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, #e6edf3);
  text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.agy-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.12));
}

.agy-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.agy-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #18181b);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
}

.agy-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #27272a);
}

.agy-btn-outline {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-btn-outline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}

.agy-btn-ghost {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--dsw-alias-label-secondary, #a1a1aa) !important;
  padding: 0 10px !important;
  border-radius: 6px !important;
}

.agy-btn-ghost:hover:not(:disabled) {
  background: var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) !important;
  color: var(--dsw-alias-label-primary, #ffffff) !important;
}

.agy-refresh-btn {
  margin-left: auto;
}

.agy-footer-notice {
  margin: 6px 0 0;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 11px;
  line-height: 17px;
}

.agy-privacy {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #6e7681);
  margin: 4px 0 0;
}

.agy-alert {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 18px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.agy-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agy-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
  border-radius: 8px;
}

.agy-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  flex: none;
}

.agy-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

.agy-badge-available {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.agy-badge-available .agy-badge-dot {
  background: #22c55e;
}

.agy-badge-disabled {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.agy-badge-disabled .agy-badge-dot {
  background: #64748b;
}

.agy-badge-warning {
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
  border: 1px solid rgba(234, 179, 8, 0.25);
}

.agy-badge-warning .agy-badge-dot {
  background: #eab308;
}

.agy-badge-error {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.agy-badge-error .agy-badge-dot {
  background: #ef4444;
}

/* Switch Component */
.agy-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 20px;
  cursor: pointer;
  user-select: none;
}

.agy-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.agy-switch-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--dsw-alias-bg-layer-4, rgba(255, 255, 255, 0.15));
  border-radius: 20px;
  transition: 0.2s ease;
}

.agy-switch-slider::before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.agy-switch input:checked + .agy-switch-slider {
  background-color: var(--dsw-alias-button-primary-fill, #2563eb);
}

.agy-switch input:checked + .agy-switch-slider::before {
  transform: translateX(16px);
}

.agy-switch input:disabled + .agy-switch-slider {
  opacity: 0.4;
  cursor: not-allowed;
}

.agy-spin-icon {
  display: inline-flex;
  animation: agy-spin 1s linear infinite;
}

@keyframes agy-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agy-manual-callback-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.04));
  border: 1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
}

.agy-manual-callback-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  color: var(--dsw-alias-label-primary, #e6edf3);
  font-size: 13px;
  outline: none;
}

.agy-input:focus {
  border-color: var(--dsw-alias-color-primary, #10b981);
}

.agy-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #8b949e);
}
`;
		const STYLE_ELEMENT_ID = "dsh-antigravity-auth-styles";
		function ensureSettingsStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ELEMENT_ID)) return;
			const style = document.createElement("style");
			style.id = STYLE_ELEMENT_ID;
			style.textContent = SETTINGS_CSS;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/AntigravityAuthSettings.tsx
		/** Settings shell for value-safe Antigravity login status. */
		const EMPTY_SETTINGS_SNAPSHOT = {
			status: "unavailable",
			value: void 0,
			base: void 0,
			user: void 0,
			revision: void 0,
			writable: false,
			mode: "memory"
		};
		function useCapabilitySettings(scope) {
			const subscribe = (0, react.useCallback)((listener) => scope?.subscribe(listener) ?? (() => {}), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope?.getSnapshot() ?? EMPTY_SETTINGS_SNAPSHOT, [scope]);
			return (0, react.useSyncExternalStore)(subscribe, getSnapshot, () => EMPTY_SETTINGS_SNAPSHOT);
		}
		function useUnmountSignal() {
			const controller = (0, react.useRef)(new AbortController());
			(0, react.useEffect)(() => {
				const active = new AbortController();
				controller.current = active;
				return () => active.abort();
			}, []);
			return (0, react.useCallback)(() => controller.current.signal, []);
		}
		/** One navigable settings section; credentials remain Host-only and actions use typed RPC. */
		function AntigravityAuthSettings({ rpc, t, subscribe, searchScope, imageScope, videoScope }) {
			const [status, setStatus] = (0, react.useState)(null);
			const searchSettings = useCapabilitySettings(searchScope);
			const imageSettings = useCapabilitySettings(imageScope);
			const videoSettings = useCapabilitySettings(videoScope);
			const [quota, setQuota] = (0, react.useState)(null);
			const [quotaBusy, setQuotaBusy] = (0, react.useState)(false);
			const [quotaError, setQuotaError] = (0, react.useState)(null);
			const [loadState, setLoadState] = (0, react.useState)("loading");
			const [_error, setError] = (0, react.useState)(null);
			const [loginBusy, setLoginBusy] = (0, react.useState)(false);
			const [actionBusy, setActionBusy] = (0, react.useState)(false);
			const [callbackUrlInput, setCallbackUrlInput] = (0, react.useState)("");
			const [callbackSubmitting, setCallbackSubmitting] = (0, react.useState)(false);
			const [callbackError, setCallbackError] = (0, react.useState)(null);
			const [resetTick, setResetTick] = (0, react.useState)(0);
			const statusGeneration = (0, react.useRef)(0);
			const quotaGeneration = (0, react.useRef)(0);
			const unmountSignal = useUnmountSignal();
			(0, react.useEffect)(() => {
				ensureSettingsStyles();
			}, []);
			(0, react.useEffect)(() => subscribe(() => {
				setResetTick((value) => value + 1);
			}), [subscribe]);
			const load = (0, react.useCallback)(async (signal, silent = false) => {
				const generation = ++statusGeneration.current;
				if (!silent) {
					setLoadState((prev) => prev === "ready" ? "ready" : "loading");
					setError(null);
				}
				try {
					const result = await rpc.status(signal);
					if (signal?.aborted === true || generation !== statusGeneration.current) return;
					if (!result.ok) {
						setLoadState("error");
						setError(result.error.message || t("statusFailed"));
						return;
					}
					setStatus(result.value.status);
					setLoadState("ready");
				} catch (cause) {
					if (signal?.aborted === true || generation !== statusGeneration.current) return;
					setLoadState("error");
					setError(messageOf(cause, t("statusFailed")));
				}
			}, [rpc, t]);
			const loadQuota = (0, react.useCallback)(async (force = false, signal) => {
				if (rpc.usage === void 0) return;
				const generation = ++quotaGeneration.current;
				setQuotaBusy(true);
				setQuotaError(null);
				try {
					const result = await rpc.usage(signal, force);
					if (signal?.aborted === true || generation !== quotaGeneration.current) return;
					if (!result.ok) {
						setQuotaError(result.error.message || t("quotaFailed"));
						return;
					}
					setQuota(result.value);
				} catch (cause) {
					if (signal?.aborted === true || generation !== quotaGeneration.current) return;
					setQuotaError(messageOf(cause, t("quotaFailed")));
				} finally {
					if (signal?.aborted !== true && generation === quotaGeneration.current) setQuotaBusy(false);
				}
			}, [rpc, t]);
			(0, react.useEffect)(() => {
				if (status?.login.projectAvailable !== true || rpc.usage === void 0) {
					setQuota(null);
					return;
				}
				const controller = new AbortController();
				loadQuota(false, controller.signal);
				return () => controller.abort();
			}, [
				loadQuota,
				rpc.usage,
				status?.login.projectAvailable,
				resetTick
			]);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				load(controller.signal);
				return () => controller.abort();
			}, [load, resetTick]);
			(0, react.useEffect)(() => {
				if (status?.login.phase !== "pending") return;
				const controller = new AbortController();
				const timer = globalThis.setInterval(() => {
					load(controller.signal, true);
				}, 1e3);
				return () => {
					globalThis.clearInterval(timer);
					controller.abort();
				};
			}, [load, status?.login.phase]);
			const startLogin = (0, react.useCallback)(async () => {
				const signal = unmountSignal();
				setLoginBusy(true);
				setError(null);
				try {
					if (status?.riskAcknowledged !== true) await rpc.acknowledgeRisk(signal);
					const result = await rpc.login(signal);
					if (signal.aborted) return;
					if (!result.ok) {
						setError(result.error.message || t("loginFailed"));
						await load(signal);
						return;
					}
					setStatus((previous) => {
						if (previous === null) return previous;
						const { errorCode: _ignoredErrorCode, ...login } = previous.login;
						return {
							...previous,
							riskAcknowledged: true,
							login: {
								...login,
								phase: "pending",
								authorizationUrl: result.value.authorizationUrl,
								expiresAt: result.value.expiresAt
							}
						};
					});
				} catch (cause) {
					if (!signal.aborted) setError(messageOf(cause, t("loginFailed")));
				} finally {
					if (!signal.aborted) setLoginBusy(false);
				}
			}, [
				load,
				rpc,
				status?.riskAcknowledged,
				t,
				unmountSignal
			]);
			const cancelLogin = (0, react.useCallback)(async () => {
				const signal = unmountSignal();
				setLoginBusy(true);
				setError(null);
				try {
					const result = await rpc.cancelLogin(signal);
					if (signal.aborted) return;
					if (!result.ok) {
						setError(result.error.message || t("cancelLoginFailed"));
						return;
					}
					setStatus((previous) => {
						if (previous === null) return previous;
						const { errorCode: _ignoredErrorCode, ...login } = previous.login;
						return {
							...previous,
							login: result.value.errorCode === void 0 ? {
								...login,
								phase: result.value.phase
							} : {
								...login,
								phase: result.value.phase,
								errorCode: result.value.errorCode
							}
						};
					});
				} catch (cause) {
					if (!signal.aborted) setError(messageOf(cause, t("cancelLoginFailed")));
				} finally {
					if (!signal.aborted) setLoginBusy(false);
				}
			}, [
				rpc,
				t,
				unmountSignal
			]);
			const submitCallbackUrl = (0, react.useCallback)(async () => {
				const url = callbackUrlInput.trim();
				if (!url) return;
				const signal = unmountSignal();
				setCallbackSubmitting(true);
				setCallbackError(null);
				try {
					if (rpc.completeCallback === void 0) {
						setCallbackError(t("completeLoginFailed"));
						return;
					}
					const result = await rpc.completeCallback(url, signal);
					if (signal.aborted) return;
					if (!result.ok) {
						setCallbackError(result.error.message || t("completeLoginFailed"));
						return;
					}
					if (result.value.completed) {
						setCallbackUrlInput("");
						await load(signal);
					} else setCallbackError(result.value.errorCode ? t(result.value.errorCode) || t("completeLoginFailed") : t("completeLoginFailed"));
				} catch (cause) {
					if (!signal.aborted) setCallbackError(messageOf(cause, t("completeLoginFailed")));
				} finally {
					if (!signal.aborted) setCallbackSubmitting(false);
				}
			}, [
				callbackUrlInput,
				load,
				rpc,
				t,
				unmountSignal
			]);
			const logout = (0, react.useCallback)(async () => {
				const signal = unmountSignal();
				setActionBusy(true);
				setError(null);
				try {
					const result = await rpc.logout(signal);
					if (signal.aborted) return;
					if (!result.ok) {
						setError(result.error.message || t("logoutFailed"));
						return;
					}
					await load(signal);
				} catch (cause) {
					if (!signal.aborted) setError(messageOf(cause, t("logoutFailed")));
				} finally {
					if (!signal.aborted) setActionBusy(false);
				}
			}, [
				load,
				rpc,
				t,
				unmountSignal
			]);
			const projectError = projectErrorText(status?.login.errorCode, t);
			const isConfigured = status?.login.configured === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "agy-settings",
				"data-plugin": "dsh-antigravity-auth",
				"aria-labelledby": "antigravity-auth-title",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
					className: "agy-bundle-header",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "agy-title-line",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							id: "antigravity-auth-title",
							className: "agy-bundle-title",
							children: t("title")
						}), isConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "agy-status-dot",
							role: "status",
							"aria-label": t("ready")
						}) : null]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "agy-bundle-intro",
						children: t("intro")
					})] })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "agy-cards",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: "agy-card",
							"aria-labelledby": "antigravity-auth-card-title",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "agy-card-header",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "agy-card-identity",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
											id: "antigravity-auth-card-title",
											className: "agy-card-title",
											children: t("authCardTitle")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "agy-card-intro",
											children: t("authCardIntro")
										})]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaVisualDashboard, {
									quota,
									busy: quotaBusy,
									error: quotaError,
									onRefresh: () => {
										loadQuota(true, unmountSignal());
									},
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "agy-action-row",
									children: [
										status?.login.phase === "pending" && typeof status.login.authorizationUrl === "string" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
											className: "agy-btn agy-btn-primary",
											href: status.login.authorizationUrl,
											target: "_blank",
											rel: "noreferrer",
											children: t("openAuthorization")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "agy-btn agy-btn-outline",
											type: "button",
											disabled: loginBusy,
											onClick: () => {
												cancelLogin();
											},
											children: t("cancelLogin")
										})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "agy-btn agy-btn-primary",
											type: "button",
											disabled: status === null || loginBusy,
											onClick: () => {
												startLogin();
											},
											children: loginBusy ? t("startingLogin") : isConfigured ? t("relogin") : t("login")
										}),
										status?.credential?.configured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "agy-btn agy-btn-outline",
											type: "button",
											disabled: actionBusy,
											onClick: () => {
												logout();
											},
											children: t("logout")
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: "agy-btn agy-btn-ghost agy-refresh-btn",
											type: "button",
											disabled: loadState === "loading" || quotaBusy,
											onClick: () => {
												const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
												Promise.all([
													load(unmountSignal()),
													loadQuota(true, unmountSignal()),
													minDelay
												]);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: quotaBusy || loadState === "loading" ? "agy-spin-icon" : "",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
													width: "15",
													height: "15",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "2",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 3v5h5" }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M16 21h5v-5" })
													]
												})
											}), quotaBusy || loadState === "loading" ? t("queryingQuota") : t("refreshStatus")]
										})
									]
								}),
								status?.login.phase === "pending" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "agy-manual-callback-block",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "agy-card-subtext",
											children: t("manualCallbackHelp")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "agy-manual-callback-row",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "text",
												className: "agy-input",
												value: callbackUrlInput,
												onChange: (e) => {
													setCallbackUrlInput(e.target.value);
													setCallbackError(null);
												},
												placeholder: t("manualCallbackPlaceholder"),
												disabled: callbackSubmitting
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "agy-btn agy-btn-primary",
												type: "button",
												disabled: callbackSubmitting || callbackUrlInput.trim().length === 0,
												onClick: () => {
													submitCallbackUrl();
												},
												children: callbackSubmitting ? t("completingLogin") : t("completeLogin")
											})]
										}),
										callbackError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "agy-alert",
											role: "alert",
											children: callbackError
										}) : null
									]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-footer-notice",
									children: t("quotaFooterNotice")
								}),
								status?.login.phase === "expired" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-alert",
									role: "alert",
									children: t("loginExpired")
								}) : null,
								status?.login.phase === "port-conflict" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-alert",
									role: "alert",
									children: t("loginPortConflict")
								}) : null,
								status?.login.phase === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-alert",
									role: "alert",
									children: t("loginFailed")
								}) : null,
								projectError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-alert",
									role: "alert",
									children: projectError
								}),
								status?.login.phase === "pending" && status.login.expiresAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "agy-card-subtext",
									children: [
										t("expiresAt"),
										": ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
											dateTime: status.login.expiresAt,
											children: status.login.expiresAt
										})
									]
								}) : null,
								status?.revoke === void 0 || status.revoke.state === "idle" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "agy-card-subtext",
									role: "status",
									children: revokeStatusText(status.revoke.state, t)
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
							className: "agy-card",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "agy-card-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "agy-card-identity",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
										className: "agy-card-title",
										children: t("search")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "agy-card-intro",
										children: t("searchCardIntro")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "agy-card-action",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("toggleSearch"),
										checked: searchSettings.value?.enabled ?? false,
										disabled: !capabilityAvailable(status, "search") || searchSettings.status !== "ready" || !searchSettings.writable,
										onChange: (next) => {
											searchScope?.set("enabled", next);
										}
									})
								})]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
							className: "agy-card",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "agy-card-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "agy-card-identity",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
										className: "agy-card-title",
										children: t("image")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "agy-card-intro",
										children: t("imageCardIntro")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "agy-card-action",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("toggleImage"),
										checked: imageSettings.value?.enabled ?? false,
										disabled: !capabilityAvailable(status, "image") || imageSettings.status !== "ready" || !imageSettings.writable,
										onChange: (next) => {
											imageScope?.set("enabled", next);
										}
									})
								})]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
							className: "agy-card",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "agy-card-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "agy-card-identity",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
										className: "agy-card-title",
										children: t("video")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "agy-card-intro",
										children: t("videoCardIntro")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "agy-card-action",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("toggleVideo"),
										checked: videoSettings.value?.enabled ?? false,
										disabled: !capabilityAvailable(status, "video") || videoSettings.status !== "ready" || !videoSettings.writable,
										onChange: (next) => {
											videoScope?.set("enabled", next);
										}
									})
								})]
							})
						})
					]
				})]
			});
		}
		function capabilityAvailable(status, id) {
			return status?.login.projectAvailable === true && status.capabilities.some((capability) => capability.id === id && capability.state === "available");
		}
		function Switch({ label, checked, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "agy-switch",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					"aria-label": label,
					checked,
					disabled,
					onChange: (e) => {
						onChange(e.target.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "agy-switch-slider" })]
			});
		}
		function formatRefreshTime(resetTime, dayUnit, now = Date.now()) {
			const target = new Date(resetTime).getTime();
			if (Number.isNaN(target)) return resetTime;
			const diffMs = target - now;
			if (diffMs <= 0) return "0m";
			const diffMinutes = Math.floor(diffMs / 6e4);
			const hours = Math.floor(diffMinutes / 60);
			const remMinutes = diffMinutes % 60;
			if (hours >= 24) return `${Math.floor(hours / 24)}${dayUnit} ${hours % 24}h ${remMinutes}m`;
			if (hours > 0) return `${hours}h ${remMinutes}m`;
			return `${remMinutes}m`;
		}
		function quotaTone(fraction) {
			if (fraction < .3) return "error";
			if (fraction <= .6) return "warning";
			return "normal";
		}
		function QuotaVisualDashboard({ quota, busy, error, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "agy-quota-section",
				children: [quota?.state === "available" && quota.groups !== void 0 && quota.groups.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "agy-quota-groups",
					children: quota.groups.map((group) => {
						const groupTitle = group.group === "gemini" ? t("geminiGroupTitle") : t("claudeGptGroupTitle");
						const groupDesc = group.group === "gemini" ? t("geminiGroupDesc") : t("claudeGptGroupDesc");
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "agy-quota-group",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "agy-quota-group-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "agy-quota-group-title",
									children: groupTitle
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "agy-quota-group-desc",
									children: groupDesc
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "agy-quota-buckets",
								children: group.windows.map((window) => {
									const windowName = window.window === "5h" ? t("window5hTitle") : t("windowWeeklyTitle");
									const pctFormatted = (window.remainingFraction * 100).toFixed(2) + "%";
									const pctRounded = Math.round(window.remainingFraction * 100);
									const refreshStr = formatRefreshTime(window.resetTime, t("quotaDayUnit"));
									const subtext = `${pctRounded}% ${t("remaining")} · ${t("refreshesIn").replace("{time}", refreshStr)}`;
									const widthPct = Math.max(0, Math.min(100, window.remainingFraction * 100));
									const tone = quotaTone(window.remainingFraction);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "agy-quota-bucket",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "agy-quota-bucket-head",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "agy-quota-bucket-name",
													children: windowName
												}), busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "agy-quota-querying",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "agy-querying-spinner",
														"aria-hidden": "true"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("queryingQuota") })]
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "agy-quota-bucket-val",
													"data-tone": tone,
													children: pctFormatted
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "agy-progress-track",
												children: busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "agy-shimmer-track",
													"aria-hidden": "true"
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "agy-progress-bar",
													"data-tone": tone,
													style: { width: `${widthPct}%` }
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "agy-quota-subtext",
												children: subtext
											})
										]
									}, window.window);
								})
							})]
						}, group.group);
					})
				}) : null, error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "agy-alert",
					role: "alert",
					children: error
				})]
			});
		}
		const PROJECT_ERROR_KEYS = {
			"project-unavailable": "projectUnavailable",
			"project-authentication-failed": "projectAuthenticationFailed",
			"project-forbidden": "projectForbidden",
			"project-rate-limited": "projectRateLimited",
			"project-offline": "projectOffline",
			"project-malformed": "projectMalformed",
			"project-protocol-drift": "projectProtocolDrift"
		};
		const REVOKE_STATE_KEYS = {
			idle: "credentialLoggedOut",
			"logged-out": "credentialLoggedOut",
			pending: "revokePending",
			revoked: "revokeSuccess",
			failed: "revokeFailed",
			superseded: "revokeSuperseded",
			"confirmation-required": "revokeConfirmationRequired"
		};
		function projectErrorText(errorCode, t) {
			if (errorCode === void 0) return void 0;
			const key = PROJECT_ERROR_KEYS[errorCode];
			return key === void 0 ? void 0 : t(key);
		}
		function revokeStatusText(state, t) {
			return t(REVOKE_STATE_KEYS[state]);
		}
		function messageOf(_error, fallback) {
			return fallback;
		}
		//#endregion
		//#region src/client/relay-settings-page.js
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
		* {@link RELAY_ITEM_SLOT} and wait for the winner's declaration through
		* `slots.inject`. Uninstalling the winner promotes another participant on the
		* next boot, so no participant is a fixed owner.
		*
		* The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
		* child slot's own registrations (id + `label` + `order`, the same shape the
		* kernel's own Plugins page uses for its tabs), and each panel dispatches
		* through `renderSlot(RELAY_ITEM_SLOT, {}, { only: id })`. Every panel stays
		* mounted but hidden, so a card's local state survives a tab switch.
		*
		* Keep the runtime body of this file identical across the participating
		* plugins (`dsh-a6api`, `dsh-llm-agentrouter`). Participants own their own card
		* component, locale dictionaries, settings namespace and Host half — only the
		* page shell is shared, because cross-plugin value imports are forbidden by
		* the client bundle purity gate. It imports nothing but `react` on purpose, so
		* every participant's build configuration compiles it unchanged.
		*/
		/** Page id claimed by the first participating plugin to activate. */
		const RELAY_PAGE_ID = "relay";
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
			marginBottom: "16px"
		};
		const TAB_STYLE = {
			appearance: "none",
			background: "transparent",
			border: "none",
			position: "relative",
			padding: "7px 1px 11px",
			cursor: "pointer",
			font: "inherit",
			fontSize: "13px",
			lineHeight: "20px",
			color: "var(--dsw-alias-label-tertiary, inherit)"
		};
		const TAB_ACTIVE_STYLE = Object.assign({}, TAB_STYLE, { color: "var(--dsw-alias-label-primary, inherit)" });
		/** The kernel's own tab marker: a 2px rounded bar under the active label. */
		const TAB_MARKER_STYLE = {
			position: "absolute",
			left: 0,
			right: 0,
			bottom: 0,
			height: "2px",
			borderRadius: "2px 2px 0 0",
			background: "var(--dsw-alias-label-primary, currentColor)"
		};
		/**
		* Panels stay mounted (hidden) so each card keeps its local state. `display:
		* none` is written explicitly because a card's own styles commonly set
		* `display: flex` while the section's stylesheet loads after this one.
		*/
		const PANEL_STYLE = { margin: 0 };
		const PANEL_HIDDEN_STYLE = {
			margin: 0,
			display: "none"
		};
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
		* @param ctx - browser context carrying the slot registry.
		* @returns The tab store consumed by the page component.
		*/
		function createRelayTabs(ctx) {
			const locale = ctx.get("locale");
			let version = -1;
			let revision = -1;
			let tabs = [];
			return {
				getSnapshot: () => {
					const nextVersion = ctx.slots.getVersion(RELAY_ITEM_SLOT);
					const nextRevision = locale === void 0 ? 0 : locale.getSnapshot().revision;
					if (nextVersion === version && nextRevision === revision) return tabs;
					version = nextVersion;
					revision = nextRevision;
					tabs = ctx.slots.entries(RELAY_ITEM_SLOT).map((entry) => ({
						id: entry.options.id ?? "",
						order: entry.options.order ?? 0,
						label: readLabel(entry.options.label)
					})).sort((left, right) => left.order - right.order);
					return tabs;
				},
				subscribe: (listener) => {
					const offSlots = ctx.slots.subscribe(RELAY_ITEM_SLOT, listener);
					const offLocale = locale === void 0 ? void 0 : locale.subscribe(listener);
					return () => {
						offSlots();
						if (offLocale !== void 0) offLocale();
					};
				}
			};
		}
		/**
		* Page body: one tab per registered card, plus the selected card's panel.
		* The shell supplies the section's own seats and `renderSlot` bound to the
		* child slot declared at registration time.
		*/
		function RelaySettingsSection({ renderSlot, relayTabs }) {
			const tabs = (0, react.useSyncExternalStore)(relayTabs.subscribe, relayTabs.getSnapshot, relayTabs.getSnapshot);
			const [requested, setRequested] = (0, react.useState)(null);
			const selected = requested !== null && tabs.some((tab) => tab.id === requested) ? requested : tabs.length > 0 ? tabs[0].id : null;
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
			}, tab.label, tab.id === selected ? (0, react.createElement)("span", {
				style: TAB_MARKER_STYLE,
				"aria-hidden": true
			}) : null))), tabs.map((tab) => (0, react.createElement)("div", {
				key: tab.id,
				role: "tabpanel",
				hidden: tab.id !== selected,
				style: tab.id === selected ? PANEL_STYLE : PANEL_HIDDEN_STYLE
			}, renderSlot(RELAY_ITEM_SLOT, {}, { only: tab.id }))));
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
		* @param ctx - browser context carrying the slot registry.
		* @param label - page label of the claiming participant, re-read by the shell
		* on every projection so a language switch reaches the sidebar too.
		* @returns The page registration's disposer, or a no-op when another
		* participant already holds the page.
		*/
		function claimRelaySettingsPage(ctx, label) {
			if (relayPageClaimed(ctx)) return () => {};
			const relayTabs = createRelayTabs(ctx);
			const children = {};
			children[RELAY_ITEM_SLOT] = {
				kind: "list",
				scope: "root"
			};
			return ctx.slots.register({
				name: "settings.section",
				id: RELAY_PAGE_ID,
				order: 120,
				label,
				inject: () => ({ relayTabs }),
				children
			}, RelaySettingsSection);
		}
		//#endregion
		//#region src/client/locales.ts
		/** English and Chinese copy for the private bootstrap settings section. */
		const en = {
			nav: "Antigravity",
			title: "Antigravity Auth",
			intro: "Sign in with Antigravity Auth to access language models, image generation, web search, and video understanding.",
			riskTitle: "Before you continue",
			risk: "Google does not support third-party Antigravity login tools. Your account may be suspended or terminated.",
			terms: "Review the Google FAQ before continuing.",
			additionalTerms: "Review the Additional Terms.",
			singleAccount: "Single-account only. This bundle does not provide an account pool.",
			riskAcknowledgement: "I understand the unofficial third-party login risk and want to continue.",
			acknowledgeBusy: "Saving acknowledgement…",
			acknowledgeFailed: "The risk acknowledgement could not be recorded.",
			login: "Start Antigravity login",
			startingLogin: "Starting login…",
			cancelLogin: "Cancel login",
			cancelLoginFailed: "The login cancellation failed.",
			openAuthorization: "Open the Google authorization page",
			loginReady: "Login is ready to start.",
			loginRequiresAck: "Acknowledge the risk before login can begin.",
			loginPending: "Login is waiting for the browser authorization callback.",
			loginSuccess: "Login completed successfully.",
			loginCancelled: "Login was cancelled.",
			loginExpired: "The login expired. Start again to receive a new authorization link.",
			loginPortConflict: "The fixed callback port is already in use. Close the conflicting process and try again.",
			loginFailed: "The login could not be completed safely.",
			credentialLoggedIn: "The Antigravity account is ready.",
			credentialRefreshing: "Refreshing the Antigravity access token…",
			credentialRefreshFailed: "The access token could not be refreshed. No fallback account or endpoint was used.",
			credentialReloginRequired: "The Antigravity grant requires login again.",
			credentialLoggedOut: "The Antigravity account is logged out on this Host.",
			logout: "Log out locally",
			logoutFailed: "The local logout could not be completed.",
			revoke: "Revoke Google grant",
			revokeConfirm: "Revoke this Google grant? This is separate from local logout.",
			revokePending: "Revoking the Google grant…",
			revokeSuccess: "The Google grant was revoked and local state was cleared.",
			revokeFailed: "The Google grant could not be revoked. Local state was retained.",
			revokeSuperseded: "The account changed before revocation completed. No newer account was cleared.",
			revokeConfirmationRequired: "Confirm revocation before contacting Google.",
			account: "Account",
			projectAvailable: "Read-only project validation is available.",
			projectUnavailable: "No usable project is available.",
			projectAuthenticationFailed: "Project discovery requires a fresh authenticated grant.",
			projectForbidden: "This account is not allowed to use the discovered project.",
			projectRateLimited: "Project discovery was rate-limited. No fallback project was used.",
			projectOffline: "Project discovery is temporarily offline. No fallback project was used.",
			projectMalformed: "Project discovery returned a malformed response.",
			projectProtocolDrift: "Project discovery no longer matches the audited protocol.",
			expiresAt: "Authorization link expires",
			statusLoading: "Loading capability status…",
			statusFailed: "Capability status is unavailable.",
			retry: "Retry",
			capabilityTitle: "Capability gates",
			authLlm: "Auth / LLM",
			search: "Web Search",
			image: "Image",
			video: "Video",
			available: "Available",
			ready: "Ready",
			disabled: "Disabled",
			pocPending: "POC pending",
			protocolDrift: "Protocol drift",
			gateNotRun: "This capability gate has not been run.",
			gateUnauthenticated: "This gate requires a fresh authenticated grant.",
			gateRateLimited: "This gate was rate-limited; no fallback was attempted.",
			gateCancelled: "This gate run was cancelled.",
			gate0Failed: "The fixed Wire Identity was rejected by Gate 0.",
			gateFailed: "This capability gate failed safely.",
			unsupportedVideo: "The private endpoint rejected native video input.",
			acknowledged: "Risk acknowledged for this Host session.",
			settingsTitle: "Capability settings",
			toggleSearch: "Enable grounded Web Search",
			toggleImage: "Enable image generation and editing",
			toggleVideo: "Enable video understanding POC",
			settingsUnavailable: "Unavailable until login, project validation, the live gate, and a writable Host settings scope are ready.",
			modelsTitle: "Models",
			modelsSnapshot: "Showing the pinned audited snapshot; live availability has not been refreshed.",
			modelsLiveAvailable: "Live account availability was intersected with the pinned snapshot.",
			modelsRefreshFailed: "Live availability refresh failed safely; the pinned snapshot remains advisory.",
			modelsProtocolDrift: "Live model discovery no longer matches the audited protocol.",
			modelsSnapshotEntry: "Snapshot",
			modelsAvailableEntry: "Live available",
			modelsUnavailableEntry: "Unavailable to this account",
			modelsFailed: "Model availability could not be loaded safely.",
			modelsLoading: "Refreshing models…",
			modelsRefresh: "Refresh model availability",
			quotaTitle: "Usage and quota",
			quotaAvailable: "Quota is available from the current account.",
			quotaUnknown: "Quota has not been queried.",
			quotaUnauthenticated: "Log in to query quota.",
			quotaForbidden: "This account is not allowed to query quota.",
			quotaRateLimited: "Quota is rate-limited; try again later.",
			quotaOffline: "Quota is temporarily unavailable.",
			quotaProtocolDrift: "Quota protocol drift was detected; raw provider data was discarded.",
			quotaFailed: "Quota could not be loaded safely.",
			quotaLoading: "Refreshing quota…",
			quotaRefresh: "Refresh quota",
			quotaFiveHour: "Five-hour window",
			quotaWeekly: "Weekly window",
			searchCardIntro: "Google Antigravity Search Provider used by the stock web_search tool. While enabled and authenticated, it takes over as that tool's backend instead of the host default provider.",
			imageCardIntro: "Durable image generation tools for image-capable models (gemini-3.1-flash-image).",
			videoCardIntro: "Workspace MP4 video understanding tools for multimodal models (gemini-3.7-flash).",
			privacyNotice: "Share Antigravity login state and model routing.",
			relogin: "Log in again with Google",
			authCardTitle: "Login",
			authCardIntro: "Share Antigravity session and Antigravity model routing.",
			queryingQuota: "Querying quota…",
			geminiGroupTitle: "GEMINI MODELS",
			geminiGroupDesc: "Models within this group: Gemini Flash, Gemini Pro",
			claudeGptGroupTitle: "CLAUDE AND GPT MODELS",
			claudeGptGroupDesc: "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
			window5hTitle: "Five Hour Limit Remaining",
			windowWeeklyTitle: "Weekly Limit Remaining",
			quotaFooterNotice: "No token value is ever sent to the Web client, settings, logs, events, or tool metadata.",
			refreshStatus: "Refresh status",
			remaining: "remaining",
			refreshesIn: "Refreshes in {time}",
			quotaDayUnit: "d",
			pageNav: "API relay",
			tabNav: "Antigravity",
			manualCallbackTitle: "Manual callback submission",
			manualCallbackHelp: "If you are accessing DSH remotely or in a container, your browser will redirect to localhost:51121 and show connection failed. Copy the full URL from your address bar (http://localhost:51121/oauth-callback?...) and paste it here to complete login.",
			manualCallbackPlaceholder: "Paste http://localhost:51121/oauth-callback?... here",
			completeLogin: "Complete login",
			completingLogin: "Completing login…",
			completeLoginFailed: "Failed to complete login from callback URL."
		};
		const zh = {
			nav: "Antigravity",
			title: "Antigravity Auth",
			intro: "通过 Antigravity Auth 登录，使用语言模型、图片生成、网页搜索和视频理解能力。",
			riskTitle: "继续前请确认",
			risk: "Google 不支持第三方 Antigravity 登录工具，账号可能被暂停或终止。",
			terms: "继续前请阅读 Google FAQ。",
			additionalTerms: "请阅读 Additional Terms。",
			singleAccount: "仅支持单账号。本能力包不提供账号池。",
			riskAcknowledgement: "我已了解非官方第三方登录风险，并确认继续。",
			acknowledgeBusy: "正在保存确认…",
			acknowledgeFailed: "无法记录风险确认。",
			login: "开始 Antigravity 登录",
			startingLogin: "正在启动登录…",
			cancelLogin: "取消登录",
			cancelLoginFailed: "取消登录失败。",
			openAuthorization: "打开 Google 授权页面",
			loginReady: "可以开始登录。",
			loginRequiresAck: "请先确认风险，才能开始登录。",
			loginPending: "等待浏览器授权回调。",
			loginSuccess: "登录已成功完成。",
			loginCancelled: "登录已取消。",
			loginExpired: "登录已过期，请重新开始以获取新的授权链接。",
			loginPortConflict: "固定回调端口已被占用，请关闭冲突进程后重试。",
			loginFailed: "登录无法安全完成。",
			credentialLoggedIn: "Antigravity 账号已就绪。",
			credentialRefreshing: "正在刷新 Antigravity access token…",
			credentialRefreshFailed: "无法刷新 access token，未使用备用账号或 endpoint。",
			credentialReloginRequired: "该 Antigravity grant 需要重新登录。",
			credentialLoggedOut: "该 Host 上的 Antigravity 账号已登出。",
			logout: "在本地登出",
			logoutFailed: "本地登出未完成。",
			revoke: "撤销 Google grant",
			revokeConfirm: "确定撤销此 Google grant 吗？这与本地登出是分开的操作。",
			revokePending: "正在撤销 Google grant…",
			revokeSuccess: "Google grant 已撤销，本地状态已清除。",
			revokeFailed: "无法撤销 Google grant，本地状态已保留。",
			revokeSuperseded: "账号在撤销完成前发生变化，未清除新账号。",
			revokeConfirmationRequired: "请先确认撤销，再联系 Google。",
			account: "账号",
			projectAvailable: "只读 project 验证可用。",
			projectUnavailable: "没有可用的 project。",
			projectAuthenticationFailed: "project discovery 需要重新认证的 grant。",
			projectForbidden: "该账号没有权限使用已发现的 project。",
			projectRateLimited: "project discovery 被限流，未使用备用 project。",
			projectOffline: "project discovery 暂时离线，未使用备用 project。",
			projectMalformed: "project discovery 返回了格式错误的响应。",
			projectProtocolDrift: "project discovery 已偏离经过审计的协议。",
			expiresAt: "授权链接过期时间",
			statusLoading: "正在加载能力状态…",
			statusFailed: "能力状态不可用。",
			retry: "重试",
			capabilityTitle: "能力门禁",
			authLlm: "认证 / LLM",
			search: "网页搜索",
			image: "图片",
			video: "视频",
			available: "可用",
			ready: "就绪",
			disabled: "已禁用",
			pocPending: "POC 待验证",
			protocolDrift: "协议漂移",
			gateNotRun: "该能力门禁尚未运行。",
			gateUnauthenticated: "该门禁需要新的有效认证 grant。",
			gateRateLimited: "该门禁运行被限流，未尝试任何 fallback。",
			gateCancelled: "该门禁运行已取消。",
			gate0Failed: "固定 Wire Identity 未通过 Gate 0。",
			gateFailed: "该能力门禁已安全失败。",
			unsupportedVideo: "私有 endpoint 拒绝了原生视频输入。",
			acknowledged: "本 Host 会话已确认风险。",
			settingsTitle: "能力设置",
			toggleSearch: "启用有依据的网页搜索",
			toggleImage: "启用图片生成与编辑",
			toggleVideo: "启用视频理解 POC",
			settingsUnavailable: "登录、project 验证、对应 live gate 和可写 Host 设置范围就绪后才能使用。",
			modelsTitle: "模型",
			modelsSnapshot: "当前显示已审计的固定快照；尚未刷新真实账号可用性。",
			modelsLiveAvailable: "已将真实账号可用性与固定快照取交集。",
			modelsRefreshFailed: "真实可用性刷新已安全失败；固定快照仍仅供参考。",
			modelsProtocolDrift: "真实模型发现已不再符合已审计协议。",
			modelsSnapshotEntry: "固定快照",
			modelsAvailableEntry: "真实可用",
			modelsUnavailableEntry: "当前账号不可用",
			modelsFailed: "无法安全加载模型可用性。",
			modelsLoading: "正在刷新模型…",
			modelsRefresh: "刷新模型可用性",
			quotaTitle: "用量与配额",
			quotaAvailable: "当前账号的配额可用。",
			quotaUnknown: "尚未查询配额。",
			quotaUnauthenticated: "登录后才能查询配额。",
			quotaForbidden: "该账号无权查询配额。",
			quotaRateLimited: "配额查询被限流，请稍后重试。",
			quotaOffline: "配额暂时不可用。",
			quotaProtocolDrift: "检测到配额协议漂移，已丢弃原始 provider 数据。",
			quotaFailed: "无法安全加载配额。",
			quotaLoading: "正在刷新配额…",
			quotaRefresh: "刷新配额",
			quotaFiveHour: "五小时窗口",
			quotaWeekly: "每周窗口",
			searchCardIntro: "供内置 web_search 工具使用的 Google Antigravity 全局搜索能力；开启且账号就绪后接管为搜索后端，取代宿主默认提供方。",
			imageCardIntro: "面向支持图片模型的持久化 generate_image 工具（gemini-3.1-flash-image）。",
			videoCardIntro: "面向本地 MP4 视频文件的多模态 analyze_video 理解工具。",
			privacyNotice: "共享 Antigravity 登录态与模型路由。",
			relogin: "重新登录 Google",
			authCardTitle: "登录",
			authCardIntro: "共享 Antigravity 登录态与 Antigravity 模型路由。",
			queryingQuota: "正在查询额度…",
			geminiGroupTitle: "GEMINI 模型",
			geminiGroupDesc: "包含模型：Gemini Flash, Gemini Pro",
			claudeGptGroupTitle: "CLAUDE 与 GPT 模型",
			claudeGptGroupDesc: "包含模型：Claude Opus, Claude Sonnet, GPT-OSS",
			window5hTitle: "5 小时限额剩余",
			windowWeeklyTitle: "周限额剩余",
			quotaFooterNotice: "任何 Token 值都不会发送到 Web 客户端、设置、日志、事件或工具元数据。",
			refreshStatus: "刷新状态",
			remaining: "剩余",
			refreshesIn: "{time} 后刷新",
			quotaDayUnit: "天",
			pageNav: "API中转",
			tabNav: "Antigravity",
			manualCallbackTitle: "手动提交授权回调",
			manualCallbackHelp: "若在远程或容器环境下访问 DSH，Google 授权完成后本地浏览器跳转至 localhost:51121 可能提示无法连接。请将地址栏中的完整 URL（http://localhost:51121/oauth-callback?...）复制并粘贴至此处以完成登录。",
			manualCallbackPlaceholder: "在此粘贴 http://localhost:51121/oauth-callback?...",
			completeLogin: "完成登录",
			completingLogin: "正在完成登录…",
			completeLoginFailed: "通过回调链接完成登录失败。"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "settings.antigravityAuth";
		/** Client services required by the settings section and its loopback RPC. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope"
		];
		/** Register one disposable settings section and no capability controls. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "antigravity-auth: copy dictionaries");
			const connection = ctx.connection;
			const rpc = createAntigravityAuthRpcClient(connection.rpc);
			const t = ctx.locale.bind(NS);
			const settingsScope = ctx.settingsScope;
			const searchScope = settingsScope?.bind({
				namespace: "antigravity-search",
				decode: decodeSearchSettings
			});
			const imageScope = settingsScope?.bind({
				namespace: "antigravity-image",
				decode: decodeImageSettings
			});
			const videoScope = settingsScope?.bind({
				namespace: "antigravity-video",
				decode: decodeVideoSettings
			});
			const listeners = /* @__PURE__ */ new Set();
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const reset = () => {
				for (const listener of listeners) listener();
			};
			ctx.effect(() => ctx.on("connection/reset", reset), "antigravity-auth: connection invalidation");
			ctx.slots.inject("settings.section", () => {
				return claimRelaySettingsPage(ctx, () => t("pageNav"));
			});
			ctx.slots.inject(RELAY_ITEM_SLOT, () => ctx.slots.register({
				name: RELAY_ITEM_SLOT,
				id: "antigravity-auth",
				order: 30,
				label: () => t("tabNav"),
				inject: () => ({
					rpc,
					t,
					subscribe,
					searchScope,
					imageScope,
					videoScope
				})
			}, AntigravityAuthSettings));
		}
		function decodeSearchSettings(value) {
			if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.model !== "string" || value.model.length === 0 || !positiveInteger(value.maxResults) || value.maxResults > 50) return void 0;
			return {
				enabled: value.enabled,
				model: value.model,
				maxResults: value.maxResults
			};
		}
		function decodeImageSettings(value) {
			if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.model !== "string" || value.model.length === 0 || !positiveInteger(value.n) || value.n > 4) return void 0;
			return {
				enabled: value.enabled,
				model: value.model,
				n: value.n
			};
		}
		function decodeVideoSettings(value) {
			if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.model !== "string" || value.model.length === 0) return void 0;
			if (value.maxBytes !== void 0 && (!positiveInteger(value.maxBytes) || value.maxBytes > 134217728)) return void 0;
			return {
				enabled: value.enabled,
				model: value.model,
				...typeof value.maxBytes === "number" ? { maxBytes: value.maxBytes } : {}
			};
		}
		function positiveInteger(value) {
			return Number.isSafeInteger(value) && value > 0;
		}
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		//#endregion
		exports.AntigravityAuthSettings = AntigravityAuthSettings;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.cjs.map
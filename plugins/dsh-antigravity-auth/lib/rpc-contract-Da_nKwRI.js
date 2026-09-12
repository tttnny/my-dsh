import { t as isBoundedSafeText } from "./safe-text-AlEyN8q_.js";
import { r as CAPABILITY_ROW_IDS } from "./status-D0-em3Ru.js";
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
//#region src/model-catalog.ts
/** Browser-safe advisory model-catalog state shared by Host RPC and settings. */
const ANTIGRAVITY_MODEL_CATALOG_STATES = [
	"snapshot",
	"live-available",
	"refresh-failed",
	"protocol-drift"
];
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
	if (!isRecord(error) || !hasExactKeys(error, [
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
	if (!isRecord(value)) return false;
	if (Object.keys(value).length === 0) return true;
	return hasExactKeys(value, ["issues"]) && Array.isArray(value.issues) && value.issues.length === 0;
}
/** Parse a closed, value-safe advisory model catalog received by the browser. */
function parseModelCatalogResult(value) {
	if (!isRecord(value) || !hasExactKeys(value, [
		"state",
		"models",
		...value.checkedAt === void 0 ? [] : ["checkedAt"]
	]) || !ANTIGRAVITY_MODEL_CATALOG_STATES.includes(value.state) || !Array.isArray(value.models) || value.models.length === 0 || value.models.length > 64 || value.checkedAt !== void 0 && !isIsoTime(value.checkedAt)) return void 0;
	const models = [];
	const ids = /* @__PURE__ */ new Set();
	for (const model of value.models) {
		if (!isRecord(model) || !hasExactKeys(model, [
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
	if (!isRecord(value) || !hasExactKeys(value, [
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
			if (!isRecord(rawGroup) || !hasExactKeys(rawGroup, [
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
				if (!isRecord(rawWindow) || !hasExactKeys(rawWindow, [
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
	if (!isRecord(value) || !hasExactKeys(value, ["status"])) return void 0;
	return parseStatus(value.status);
}
function parseStatus(value) {
	if (!isRecord(value) || !hasAllowedKeys(value, [
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
	if (!isRecord(value) || typeof value.state !== "string" || !isCredentialState(value.state) || typeof value.configured !== "boolean" || !hasAllowedKeys(value, [
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
	if (!isRecord(value) || typeof value.state !== "string" || !isRevokeState(value.state) || !hasAllowedKeys(value, ["state", "errorCode"])) return void 0;
	if (value.errorCode !== void 0 && (typeof value.errorCode !== "string" || !isRevokeErrorCode(value.errorCode))) return void 0;
	return {
		state: value.state,
		...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
	};
}
function parseLoginStatus(value) {
	if (!isRecord(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase) || typeof value.configured !== "boolean" || typeof value.projectAvailable !== "boolean") return void 0;
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
	if (!isRecord(value) || !hasExactKeys(value, [
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
	return isRecord(value) && hasExactKeys(value, ["acknowledged"]) && value.acknowledged === true ? { acknowledged: true } : void 0;
}
function parseLoginResult(value) {
	return isRecord(value) && hasExactKeys(value, [
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
	if (!isRecord(value) || typeof value.completed !== "boolean" || typeof value.phase !== "string") return void 0;
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
	if (!isRecord(value) || typeof value.phase !== "string" || !isLoginPhase(value.phase)) return void 0;
	if (Object.keys(value).some((key) => key !== "phase" && key !== "errorCode")) return void 0;
	if (value.errorCode !== void 0 && !isLoginErrorCode(value.errorCode)) return void 0;
	return {
		phase: value.phase,
		...typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}
	};
}
function parseLogoutResult(value) {
	return isRecord(value) && hasExactKeys(value, ["state"]) && value.state === "logged-out" ? { state: "logged-out" } : void 0;
}
function parseRevokeResult(value) {
	if (!isRecord(value) || typeof value.state !== "string") return void 0;
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
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { parseStatusResult as a, isSafeRpcErrorCode as c, parseModelCatalogResult as i, safeRpcErrorMessage as l, ANTIGRAVITY_AUTH_RPC_NAMESPACE as n, parseUsageResult as o, createAntigravityAuthRpcClient as r, ANTIGRAVITY_MODEL_CATALOG_STATES as s, ANTIGRAVITY_AUTH_RPC_CHANNEL as t };

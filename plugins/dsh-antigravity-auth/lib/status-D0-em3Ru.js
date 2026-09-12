//#region src/status.ts
const ANTIGRAVITY_PLUGIN_ID = "dsh-antigravity-auth";
const CAPABILITY_ROW_IDS = [
	"auth-llm",
	"search",
	"image",
	"video"
];
const LLM_FAMILY_IDS = [
	"gemini",
	"claude",
	"gpt-oss"
];
const CAPABILITY_GATE_OUTCOMES = [
	"passed",
	"unauthenticated",
	"rate-limited",
	"cancelled",
	"attribution-rejected",
	"protocol-drift",
	"unsupported-video",
	"failed"
];
const CAPABILITY_DEFINITIONS = Object.freeze(CAPABILITY_ROW_IDS.map((id) => Object.freeze({
	id,
	state: "disabled",
	reasonCode: "unauthenticated"
})));
const PROJECT_DISCOVERY_FAILURES = /* @__PURE__ */ new Set([
	"project-unavailable",
	"project-authentication-failed",
	"project-forbidden",
	"project-rate-limited",
	"project-offline",
	"project-malformed",
	"project-protocol-drift"
]);
function createStatusView(riskAcknowledged, login, credential, revoke, gates = {}) {
	return Object.freeze({
		pluginId: ANTIGRAVITY_PLUGIN_ID,
		phase: "bootstrap",
		privateSelfUse: true,
		singleAccount: true,
		riskAcknowledgementRequired: true,
		riskAcknowledged,
		login: Object.freeze({ ...login }),
		...credential === void 0 ? {} : { credential: Object.freeze({ ...credential }) },
		...revoke === void 0 ? {} : { revoke: Object.freeze({ ...revoke }) },
		capabilities: Object.freeze(capabilitiesFor(login, gates).map((capability) => Object.freeze({ ...capability })))
	});
}
function capabilitiesFor(login, gates) {
	if (!login.projectAvailable && (login.configured || login.errorCode !== void 0 && PROJECT_DISCOVERY_FAILURES.has(login.errorCode))) return CAPABILITY_DEFINITIONS.map((capability) => ({
		id: capability.id,
		state: "disabled",
		reasonCode: "project-unavailable"
	}));
	if (!login.projectAvailable) return CAPABILITY_DEFINITIONS;
	if (gates.gate0?.outcome !== "passed") return CAPABILITY_ROW_IDS.map((id) => gate0Status(id, gates.gate0));
	return CAPABILITY_ROW_IDS.map((id) => gateStatus(id, id === "auth-llm" ? llmFamilyResult(gates) : gates.capabilities?.[id]));
}
function llmFamilyResult(gates) {
	const results = LLM_FAMILY_IDS.map((family) => gates.llmFamilies?.[family]);
	const failure = results.find((result) => result !== void 0 && result.outcome !== "passed");
	if (failure !== void 0) return failure;
	if (results.some((result) => result?.outcome !== "passed")) return void 0;
	return results.reduce((latest, result) => latest === void 0 || Date.parse(result.checkedAt) > Date.parse(latest.checkedAt) ? result : latest, void 0);
}
function gate0Status(id, result) {
	if (result?.outcome === "failed" || result?.outcome === "attribution-rejected") return {
		id,
		state: "disabled",
		reasonCode: "gate-0-failed"
	};
	return gateStatus(id, result);
}
function gateStatus(id, result) {
	if (result === void 0) return {
		id,
		state: "poc-pending",
		reasonCode: "gate-not-run"
	};
	if (result.outcome === "passed") return {
		id,
		state: "available",
		reasonCode: "capability-ready"
	};
	if (result.outcome === "protocol-drift") return {
		id,
		state: "protocol-drift",
		reasonCode: "protocol-drift"
	};
	if (result.outcome === "attribution-rejected") return {
		id,
		state: "disabled",
		reasonCode: "gate-0-failed"
	};
	if (result.outcome === "unauthenticated") return {
		id,
		state: "disabled",
		reasonCode: "unauthenticated"
	};
	if (result.outcome === "rate-limited") return {
		id,
		state: "disabled",
		reasonCode: "rate-limited"
	};
	if (result.outcome === "cancelled") return {
		id,
		state: "disabled",
		reasonCode: "cancelled"
	};
	if (result.outcome === "unsupported-video") return {
		id,
		state: "disabled",
		reasonCode: "unsupported-video"
	};
	return {
		id,
		state: "disabled",
		reasonCode: "gate-failed"
	};
}
//#endregion
export { createStatusView as a, LLM_FAMILY_IDS as i, CAPABILITY_GATE_OUTCOMES as n, CAPABILITY_ROW_IDS as r, ANTIGRAVITY_PLUGIN_ID as t };

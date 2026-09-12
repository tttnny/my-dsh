import { d as privateStatusError, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, n as DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, o as DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, p as readPrivateText } from "./private-transport-DvkyFFK_.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-nHkfjLiA.js";
import { buildAntigravityLoadCodeAssistMetadata } from "@cortexkit/antigravity-auth-core";
//#region src/project-context.ts
/** Host-only, read-only project discovery and safe project normalization. */
const PROJECT_DISCOVERY_PATH = "/v1internal:loadCodeAssist";
const PROJECT_DISCOVERY_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}${PROJECT_DISCOVERY_PATH}`;
const MAX_RESPONSE_BYTES = Math.min(DEFAULT_PRIVATE_RESPONSE_BYTES, 65536);
const DEFAULT_OPERATION_TIMEOUT_MS = 1e4;
const MAX_OPERATION_TIMEOUT_MS = 6e5;
const MAX_PROJECT_ID_LENGTH = 128;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{2,127}$/u;
var ProjectDiscoveryError = class extends Error {
	code;
	constructor(code, message = projectDiscoveryErrorMessage(code)) {
		super(message);
		this.name = "ProjectDiscoveryError";
		this.code = code;
	}
};
/** Create the fixed, read-only loadCodeAssist project probe. */
function createProjectDiscovery(options = {}) {
	const timeoutMs = boundedTimeout(options.operationTimeoutMs);
	const transport = options.transport ?? createPrivateTransport({
		...options.transportOptions?.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: options.transportOptions.responseHeaderTimeoutMs },
		...options.transportOptions?.maxRequestBytes === void 0 ? {} : { maxRequestBytes: options.transportOptions.maxRequestBytes }
	});
	return { discover: async (accessToken, signal) => {
		if (signal?.aborted === true) throw new ProjectDiscoveryError("cancelled");
		const body = JSON.stringify({ metadata: buildAntigravityLoadCodeAssistMetadata() });
		let response;
		try {
			response = await transport.request({
				url: PROJECT_DISCOVERY_ENDPOINT,
				accessToken,
				body,
				...signal === void 0 ? {} : { signal },
				responseHeaderTimeoutMs: timeoutMs
			});
		} catch (error) {
			throw mapTransportError(error);
		}
		const statusError = privateStatusError(response.status);
		if (statusError !== void 0) {
			await response.body?.cancel().catch(() => {});
			throw mapTransportError(statusError);
		}
		try {
			const text = await readPrivateText(response, {
				...signal === void 0 ? {} : { signal },
				idleTimeoutMs: Math.min(timeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS),
				totalTimeoutMs: Math.min(timeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS),
				maxBytes: MAX_RESPONSE_BYTES
			});
			let value;
			try {
				value = JSON.parse(text);
			} catch {
				throw new ProjectDiscoveryError("malformed");
			}
			return parseProjectResponse(value);
		} catch (error) {
			if (error instanceof ProjectDiscoveryError) throw error;
			throw mapTransportError(error);
		}
	} };
}
/** Compatibility name used by the parent capability design. */
const createProjectContext = createProjectDiscovery;
/** Normalize the only project field that may cross into the credential store. */
function normalizeProjectId(value) {
	if (typeof value !== "string") return void 0;
	const normalized = value.trim();
	if (normalized.length === 0 || normalized.length > MAX_PROJECT_ID_LENGTH) return void 0;
	return PROJECT_ID_PATTERN.test(normalized) ? normalized : void 0;
}
function parseProjectResponse(value) {
	if (!isRecord(value)) throw new ProjectDiscoveryError("malformed");
	if (!Object.prototype.hasOwnProperty.call(value, "cloudaicompanionProject")) return void 0;
	const candidate = value.cloudaicompanionProject;
	if (candidate === null || candidate === void 0) return void 0;
	if (typeof candidate === "string") {
		if (candidate.trim().length === 0) return void 0;
		return projectFromValue(candidate);
	}
	if (!isRecord(candidate)) throw new ProjectDiscoveryError("protocol-drift");
	if (!Object.prototype.hasOwnProperty.call(candidate, "id")) return void 0;
	if (candidate.id === null || candidate.id === void 0) throw new ProjectDiscoveryError("protocol-drift");
	return projectFromValue(candidate.id);
}
function projectFromValue(value) {
	const projectId = normalizeProjectId(value);
	if (projectId === void 0) throw new ProjectDiscoveryError("protocol-drift");
	return { projectId };
}
function boundedTimeout(value) {
	if (value === void 0 || !Number.isFinite(value) || value <= 0) return DEFAULT_OPERATION_TIMEOUT_MS;
	return Math.min(Math.floor(value), MAX_OPERATION_TIMEOUT_MS);
}
const PROJECT_FAILURE_CODES = {
	authentication: "authentication",
	forbidden: "forbidden",
	"rate-limited": "rate-limited",
	cancelled: "cancelled",
	timeout: "offline",
	"attribution-rejected": "protocol-drift",
	"protocol-drift": "protocol-drift",
	"response-limit": "protocol-drift",
	"request-limit": "protocol-drift",
	upstream: "offline",
	network: "offline",
	failed: "offline"
};
function mapTransportError(error) {
	if (error instanceof ProjectDiscoveryError) return error;
	if (error instanceof PrivateTransportError) return new ProjectDiscoveryError(PROJECT_FAILURE_CODES[classifyPrivateFailure(error)]);
	return new ProjectDiscoveryError("offline");
}
function projectDiscoveryErrorMessage(code) {
	if (code === "authentication") return "The Antigravity project probe requires authentication";
	if (code === "forbidden") return "The Antigravity project probe was forbidden";
	if (code === "rate-limited") return "The Antigravity project probe is rate-limited";
	if (code === "offline") return "The Antigravity project probe is offline";
	if (code === "malformed") return "The Antigravity project response was malformed";
	if (code === "protocol-drift") return "The Antigravity project protocol changed";
	return "The Antigravity project probe was cancelled";
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { PROJECT_DISCOVERY_ENDPOINT, PROJECT_DISCOVERY_PATH, ProjectDiscoveryError, createProjectContext, createProjectDiscovery, normalizeProjectId };

import { i as createAntigravityAuthService, t as mountCapabilityLifecycle } from "./capability-lifecycle-DPNblVcJ.js";
import { d as privateStatusError, l as createPrivateTransport, m as PrivateTransportError, n as DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, o as DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, t as DEFAULT_PRIVATE_FRAME_BYTES, u as iteratePrivateSse } from "./private-transport-DvkyFFK_.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-nHkfjLiA.js";
import { randomUUID } from "node:crypto";
import { SEARCH_SYSTEM_INSTRUCTION, resolveModelWithTier } from "@cortexkit/antigravity-auth-core";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
//#region src/search.ts
const name = "antigravity-search";
const inject = ["web", "antigravityAuth"];
const ANTIGRAVITY_SEARCH_PROVIDER_ID = "antigravity";
const ANTIGRAVITY_SEARCH_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
const ANTIGRAVITY_SEARCH_MODEL = "antigravity-gemini-3.7-flash";
const ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE = "antigravity-search";
const Config = z.object({
	enabled: z.boolean().default(true),
	model: z.string().default(ANTIGRAVITY_SEARCH_MODEL),
	maxResults: z.number().step(1).min(1).max(50).default(10)
});
var AntigravitySearchProvider = class {
	options;
	id = ANTIGRAVITY_SEARCH_PROVIDER_ID;
	enabled;
	transport;
	constructor(options) {
		this.options = options;
		this.enabled = options.enabled ?? (() => options.settings?.().enabled ?? true);
		this.transport = options.transport ?? createPrivateTransport();
	}
	available() {
		return this.enabled();
	}
	async search(request, signal) {
		if (!this.enabled()) throw new WebError("Antigravity Web Search is disabled by its capability gate", "ANTIGRAVITY_SEARCH_DISABLED");
		if (signal?.aborted === true) throw new WebError("Antigravity Web Search was cancelled", "ANTIGRAVITY_SEARCH_CANCELLED");
		if (typeof request.query !== "string" || request.query.trim().length === 0 || request.query.length > 16384) throw new WebError("Antigravity Web Search requires a bounded query", "ANTIGRAVITY_SEARCH_INVALID_QUERY");
		const settings = this.options.settings?.() ?? {
			enabled: true,
			model: "antigravity-gemini-3.7-flash",
			maxResults: 10
		};
		const configuredMax = boundedInteger(settings.maxResults, 1, 50);
		const requestedMax = request.maxResults === void 0 ? configuredMax : boundedInteger(request.maxResults, 1, 50);
		const maxResults = Math.min(configuredMax, requestedMax);
		const credential = await this.options.auth.credential(signal);
		if (credential === void 0) throw new WebError("Antigravity Web Search requires a logged-in account", "ANTIGRAVITY_SEARCH_AUTH_REQUIRED");
		const response = await this.transport.request({
			url: ANTIGRAVITY_SEARCH_ENDPOINT,
			accessToken: credential.accessToken,
			body: JSON.stringify(buildGroundedSearchPayload(request.query.trim(), credential, settings.model)),
			...signal === void 0 ? {} : { signal }
		}).catch((error) => {
			throw toWebError(error);
		});
		const statusError = privateStatusError(response.status);
		if (statusError !== void 0) {
			await response.body?.cancel().catch(() => {});
			throw toWebError(statusError);
		}
		const sources = [];
		const seen = /* @__PURE__ */ new Set();
		const content = [];
		let truncated = false;
		try {
			for await (const event of iteratePrivateSse(response, {
				...signal === void 0 ? {} : { signal },
				idleTimeoutMs: DEFAULT_PRIVATE_IDLE_TIMEOUT_MS,
				totalTimeoutMs: DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS,
				maxBytes: this.options.maxResponseBytes ?? 8388608,
				maxFrameBytes: DEFAULT_PRIVATE_FRAME_BYTES
			})) {
				if (event.data.trim() === "[DONE]") continue;
				const value = parseJson(event.data);
				truncated ||= collectSearchFacts(value, content, sources, seen, maxResults);
			}
		} catch (error) {
			throw toWebError(error);
		}
		if (sources.length === 0) throw new WebError("Antigravity Search returned no validated grounding sources", "ANTIGRAVITY_SEARCH_NO_SOURCES");
		return {
			...content.length === 0 ? {} : { content: content.join("").slice(0, 65536) },
			sources: await resolvePublishedSources(sources, signal),
			truncated
		};
	}
};
/**
* Hostname serving Google's opaque grounding redirects. A grounded response
* carries only these token URLs, so the publisher is invisible in a citation
* until the redirect is read.
*/
const GROUNDING_REDIRECT_HOSTNAME = "vertexaisearch.cloud.google.com";
const GROUNDING_REDIRECT_PATH = "/grounding-api-redirect/";
/** Upper bound on resolutions per search; the remainder keep their opaque URI. */
const MAX_SOURCE_RESOLUTIONS = 10;
/** Cooperative budget for one redirect read. */
const SOURCE_RESOLUTION_TIMEOUT_MS = 2500;
/** Whether one grounding URI hides its publisher behind a redirect token. */
function isOpaqueGroundingRedirect(value) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === GROUNDING_REDIRECT_HOSTNAME && url.pathname.startsWith(GROUNDING_REDIRECT_PATH);
	} catch {
		return false;
	}
}
/**
* Read the publisher URL behind one opaque grounding redirect.
*
* `redirect: 'manual'` exposes the `Location` header without following it, so
* this contacts only the redirect service and never the publisher. Every failure
* — timeout, cancellation, transport error, a missing or still-opaque target —
* keeps the original token, so an unreachable redirect service can only cost the
* readability of one citation and never the search itself.
*/
async function resolvePublishedUrl(value, signal) {
	const probe = typeof globalThis.fetch === "function" ? globalThis.fetch : void 0;
	if (probe === void 0) return value;
	const budget = AbortSignal.timeout(SOURCE_RESOLUTION_TIMEOUT_MS);
	const scope = signal === void 0 ? budget : AbortSignal.any([signal, budget]);
	try {
		const response = await probe(value, {
			method: "HEAD",
			redirect: "manual",
			signal: scope
		});
		await response.body?.cancel().catch(() => {});
		const location = response.headers.get("location");
		if (location === null || location.length === 0 || location.length > 8192) return value;
		const target = new URL(location, value).toString();
		return isHttpUrl(target) && !isOpaqueGroundingRedirect(target) ? target : value;
	} catch {
		return value;
	}
}
/**
* Replace every opaque grounding redirect with the publisher URL it points at,
* keeping first-occurrence order and dropping sources that collapse onto the
* same publisher. Sources are enriched concurrently; anything unresolved keeps
* its original URI.
*/
async function resolvePublishedSources(sources, signal) {
	const targets = sources.filter((source) => isOpaqueGroundingRedirect(source.url));
	if (targets.length === 0) return [...sources];
	const resolutions = await Promise.all(targets.slice(0, MAX_SOURCE_RESOLUTIONS).map(async (source) => [source.url, await resolvePublishedUrl(source.url, signal)]));
	const resolved = new Map(resolutions);
	const published = [];
	const seen = /* @__PURE__ */ new Set();
	for (const source of sources) {
		const url = resolved.get(source.url) ?? source.url;
		if (seen.has(url)) continue;
		seen.add(url);
		published.push(url === source.url ? source : {
			...source,
			url
		});
	}
	return published;
}
/**
* Outer-envelope identity the private endpoint requires before it will generate
* an answer instead of grounding alone. Captured from the audited community
* implementation (`packages/opencode/src/plugin/search.ts`): without `requestId`,
* `userAgent`, `requestType`, and a request `sessionId`, the same call returns
* grounding chunks with no `candidates[].content.parts[].text`.
*/
const SEARCH_REQUEST_ID_PREFIX = "agent";
const SEARCH_REQUEST_ID_SUFFIX = "2";
const SEARCH_USER_AGENT = "antigravity";
const SEARCH_REQUEST_TYPE = "agent";
const SEARCH_SESSION_PREFIX = `search-${Date.now().toString(36)}`;
let searchSessionCounter = 0;
/** One search call's session id, in the captured `search-<base36>-<n>` shape. */
function nextSearchSessionId() {
	searchSessionCounter += 1;
	return `${SEARCH_SESSION_PREFIX}-${String(searchSessionCounter)}`;
}
/** Captured `agent/<uuid>/<epoch ms>/<uuid>/2` request-id shape. */
function buildSearchRequestId(now) {
	return `${SEARCH_REQUEST_ID_PREFIX}/${randomUUID()}/${String(now)}/${randomUUID()}/${SEARCH_REQUEST_ID_SUFFIX}`;
}
/**
* Build the dedicated grounded request.
*
* Field order, envelope identity, and the system instruction mirror the audited
* community capture, because that shape is the one observed to return an answer
* alongside `groundingMetadata`. `generationConfig` pins temperature 0 so repeats
* of one query stay stable.
*/
function buildGroundedSearchPayload(query, credential, model = ANTIGRAVITY_SEARCH_MODEL, now = Date.now()) {
	return {
		project: credential.projectId,
		requestId: buildSearchRequestId(now),
		request: {
			systemInstruction: { parts: [{ text: SEARCH_SYSTEM_INSTRUCTION }] },
			contents: [{
				role: "user",
				parts: [{ text: query }]
			}],
			tools: [{ googleSearch: {} }],
			generationConfig: {
				temperature: 0,
				topP: 1
			},
			sessionId: nextSearchSessionId()
		},
		model: resolveModelWithTier(model, { cli_first: false }).actualModel,
		userAgent: SEARCH_USER_AGENT,
		requestType: SEARCH_REQUEST_TYPE
	};
}
/** Mount only the public Web Search seam; no fetch provider is registered. */
function apply(ctx, config = {
	enabled: true,
	model: ANTIGRAVITY_SEARCH_MODEL,
	maxResults: 10
}) {
	if (ctx === void 0) return;
	const candidate = ctx;
	if (candidate.web === void 0) return;
	let current = () => config;
	let lifecycle;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE, Config, config, {
			setSource: (source) => {
				current = source;
				lifecycle?.sync();
			},
			onChange: () => {
				lifecycle?.sync();
			}
		});
	});
	const provided = candidate.get?.("antigravityAuth");
	const auth = isAuthService(provided) ? provided : createAntigravityAuthService();
	lifecycle = mountCapabilityLifecycle({
		ctx,
		auth,
		id: "search",
		enabled: () => current().enabled,
		register: () => {
			const web = candidate.web;
			const previousProviderId = web.searchProviderId;
			web.searchProviderId = ANTIGRAVITY_SEARCH_PROVIDER_ID;
			const unregister = web.registerSearchProvider(new AntigravitySearchProvider({
				auth,
				settings: () => current()
			}));
			return () => {
				if (web.searchProviderId === "antigravity") web.searchProviderId = previousProviderId;
				unregister();
			};
		},
		ownsAuth: auth !== provided,
		label: "antigravity-search: provider lifecycle"
	});
}
function collectSearchFacts(value, content, sources, seen, maxResults) {
	if (!isRecord(value)) return false;
	const root = isRecord(value.response) ? value.response : value;
	const texts = [findText(root)];
	const metadataValues = [
		root.groundingMetadata,
		root.grounding_metadata,
		value.groundingMetadata
	];
	if (Array.isArray(root.candidates)) {
		if (root.candidates.length > 512) throw new WebError("Antigravity Search returned too many candidates", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
		for (const candidate of root.candidates) {
			if (!isRecord(candidate)) continue;
			if (Array.isArray(candidate.parts)) texts.push(findText(candidate));
			if (isRecord(candidate.content)) texts.push(findText(candidate.content));
			metadataValues.push(candidate.groundingMetadata, candidate.grounding_metadata);
		}
	}
	for (const text of texts) appendBounded(content, text);
	let truncated = false;
	for (const rawMetadata of metadataValues) {
		if (!isRecord(rawMetadata)) continue;
		const chunks = rawMetadata.groundingChunks ?? rawMetadata.grounding_chunks;
		if (!Array.isArray(chunks)) continue;
		if (chunks.length > 4096) throw new WebError("Antigravity Search returned too many grounding sources", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
		for (const chunk of chunks) {
			if (!isRecord(chunk)) continue;
			const web = isRecord(chunk.web) ? chunk.web : isRecord(chunk.webSource) ? chunk.webSource : void 0;
			if (web === void 0 || typeof web.uri !== "string" || !isHttpUrl(web.uri)) continue;
			const url = web.uri;
			if (seen.has(url)) continue;
			if (sources.length >= maxResults) {
				truncated = true;
				break;
			}
			seen.add(url);
			const title = safeSourceText(web.title, 1024);
			const snippet = safeSourceText(web.snippet, 4096);
			sources.push({
				url,
				...title === void 0 ? {} : { title },
				...snippet === void 0 ? {} : { snippet }
			});
		}
	}
	return truncated;
}
function appendBounded(output, value) {
	if (value === void 0 || value.length === 0) return;
	const used = output.reduce((total, item) => total + item.length, 0);
	if (used < 65536) output.push(value.slice(0, 65536 - used));
}
function findText(value) {
	const parts = Array.isArray(value.parts) ? value.parts : isRecord(value.content) && Array.isArray(value.content.parts) ? value.content.parts : [];
	const output = [];
	let length = 0;
	for (const part of parts) {
		if (!isRecord(part) || typeof part.text !== "string" || hasControl(part.text)) continue;
		const text = part.text.slice(0, 65536 - length);
		output.push(text);
		length += text.length;
		if (length >= 65536) break;
	}
	return output.length === 0 ? void 0 : output.join("");
}
function safeSourceText(value, max) {
	return typeof value === "string" && value.length > 0 && value.length <= max && !hasControl(value) ? value : void 0;
}
function hasControl(value) {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
function parseJson(value) {
	const normalized = value.trim().replace(/^\)\]\}'(?:\r?\n)?/u, "");
	try {
		return JSON.parse(normalized);
	} catch {
		throw new WebError("Antigravity Search returned malformed provider data", "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT");
	}
}
const SEARCH_FAILURE_CODES = {
	authentication: "ANTIGRAVITY_SEARCH_AUTH_REQUIRED",
	forbidden: "ANTIGRAVITY_SEARCH_FORBIDDEN",
	"rate-limited": "ANTIGRAVITY_SEARCH_RATE_LIMITED",
	cancelled: "ANTIGRAVITY_SEARCH_CANCELLED",
	timeout: "ANTIGRAVITY_SEARCH_TIMEOUT",
	"attribution-rejected": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
	"protocol-drift": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
	"response-limit": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
	"request-limit": "ANTIGRAVITY_SEARCH_PROTOCOL_DRIFT",
	upstream: "ANTIGRAVITY_SEARCH_FAILED",
	network: "ANTIGRAVITY_SEARCH_FAILED",
	failed: "ANTIGRAVITY_SEARCH_FAILED"
};
function toWebError(error) {
	if (error instanceof WebError) return error;
	if (error instanceof PrivateTransportError) return new WebError("The Antigravity Search request failed safely", SEARCH_FAILURE_CODES[classifyPrivateFailure(error)]);
	return new WebError("The Antigravity Search request failed safely", "ANTIGRAVITY_SEARCH_FAILED");
}
function isAuthService(value) {
	return isRecord(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function isHttpUrl(value) {
	if (value.length === 0 || value.length > 8192 || value.trim() !== value || hasControl(value)) return false;
	try {
		const url = new URL(value);
		return (url.protocol === "http:" || url.protocol === "https:") && url.username.length === 0 && url.password.length === 0;
	} catch {
		return false;
	}
}
function boundedInteger(value, min, max) {
	if (!Number.isSafeInteger(value) || value < min || value > max) throw new WebError("Antigravity Search result limit is invalid", "ANTIGRAVITY_SEARCH_INVALID_QUERY");
	return value;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { ANTIGRAVITY_SEARCH_ENDPOINT, ANTIGRAVITY_SEARCH_MODEL, ANTIGRAVITY_SEARCH_PROVIDER_ID, ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE, AntigravitySearchProvider, Config, apply, buildGroundedSearchPayload, inject, name };

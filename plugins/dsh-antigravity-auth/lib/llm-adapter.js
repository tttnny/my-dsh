import { a as DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS, d as privateStatusError, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, n as DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, o as DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, p as readPrivateText, t as DEFAULT_PRIVATE_FRAME_BYTES, u as iteratePrivateSse } from "./private-transport-BQshWFmk.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-DaQoTCkz.js";
import { antigravityModelFamily, buildFunctionDeclarations, compatibleReplayState, createReplayState } from "./replay.js";
import { AgyRequestSessionStore, CLAUDE_DESCRIPTION_PROMPT, CLAUDE_TOOL_SYSTEM_INSTRUCTION, SKIP_THOUGHT_SIGNATURE, applyClaudeTransforms, applyGeminiTransforms, buildAgyAgentRequestMetadata, fnv1a64Signed, getPublicModelDefinitions, getResolverAliasMap, orderAgyRequestPayloadInPlace, resolveModelWithTier } from "@cortexkit/antigravity-auth-core";
import { Buffer } from "node:buffer";
import { CONTEXT_WINDOW_EXCEEDED_CODE, LlmAdapter, LlmError, ReasoningEffortId, ToolCallId, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
//#region src/llm-adapter.ts
/** Public DSH LLM adapter for the single Antigravity provider route. */
const ANTIGRAVITY_PROVIDER = "google-antigravity";
const ANTIGRAVITY_STREAM_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:streamGenerateContent?alt=sse`;
const ANTIGRAVITY_GENERATE_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
const ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:fetchAvailableModels`;
const ANTIGRAVITY_LLM_ROUTE = ANTIGRAVITY_PROVIDER;
const MODEL_CATALOG_TTL_MS = 3e4;
const MAX_MODEL_CATALOG_BYTES = 262144;
const MAX_PROVIDER_ERROR_BYTES = 65536;
const MAX_PROVIDER_ERROR_FRAME_BYTES = 16384;
const MAX_PROVIDER_ERROR_JSON_DEPTH = 8;
const MAX_PROVIDER_PARTS = 4096;
/** Adapter that owns exactly one provider route and no fallback route. */
var AntigravityAdapter = class extends LlmAdapter {
	adapterOptions;
	transport;
	sessions = new AgyRequestSessionStore("dsh-antigravity-auth");
	options;
	definitions = getPublicModelDefinitions();
	catalogProjectId;
	catalogExpiresAt = 0;
	catalogModelIds = /* @__PURE__ */ new Set();
	catalogFailureCode;
	catalogView;
	constructor(adapterOptions) {
		super();
		this.adapterOptions = adapterOptions;
		this.transport = adapterOptions.transport ?? createPrivateTransport(adapterOptions.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: adapterOptions.responseHeaderTimeoutMs });
		this.options = {
			responseHeaderTimeoutMs: boundedTimeout(adapterOptions.responseHeaderTimeoutMs, DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS),
			idleTimeoutMs: boundedTimeout(adapterOptions.idleTimeoutMs, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS),
			totalTimeoutMs: boundedTimeout(adapterOptions.totalTimeoutMs, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS),
			maxResponseBytes: boundedLimit(adapterOptions.maxResponseBytes, DEFAULT_PRIVATE_RESPONSE_BYTES),
			maxFrameBytes: boundedLimit(adapterOptions.maxFrameBytes, DEFAULT_PRIVATE_FRAME_BYTES)
		};
		this.catalogView = createCatalogView(this.definitions, "snapshot");
	}
	providerInfo(provider) {
		if (provider !== "google-antigravity") throw new LlmError("Unknown Antigravity provider route", "NO_ADAPTER");
		return {
			id: ANTIGRAVITY_PROVIDER,
			name: "Google Antigravity"
		};
	}
	providerRetryPolicy() {
		return resolveRetryPolicy({
			mode: "normal",
			maxRetries: 0
		}, "google-antigravity");
	}
	/** Forget account-bound availability when Gate 0 or the credential is replaced. */
	invalidateModelCatalog() {
		this.catalogProjectId = void 0;
		this.catalogExpiresAt = 0;
		this.catalogModelIds = /* @__PURE__ */ new Set();
		this.catalogFailureCode = void 0;
		this.catalogView = createCatalogView(this.definitions, "snapshot");
	}
	/** Return the pinned catalog without performing credential or network work. */
	catalogSnapshot() {
		return cloneCatalogView(createCatalogView(this.definitions, "snapshot"));
	}
	/** Refresh the advisory catalog and collapse failures into browser-safe state. */
	async modelCatalog(signal, forceRefresh = false) {
		try {
			const available = await this.readLiveModelIds(signal, forceRefresh);
			this.catalogView = createCatalogView(this.definitions, "live-available", available, (/* @__PURE__ */ new Date()).toISOString());
		} catch (error) {
			const state = error instanceof LlmError && error.code === "PROTOCOL_DRIFT" ? "protocol-drift" : "refresh-failed";
			this.catalogView = createCatalogView(this.definitions, state, void 0, (/* @__PURE__ */ new Date()).toISOString());
		}
		return cloneCatalogView(this.catalogView);
	}
	async listModels(provider, signal) {
		this.providerInfo(provider);
		const snapshot = this.pinnedTextModelInfos();
		let available;
		try {
			available = await this.readLiveModelIds(signal);
			this.catalogView = createCatalogView(this.definitions, "live-available", available, (/* @__PURE__ */ new Date()).toISOString());
		} catch (error) {
			const state = error instanceof LlmError && error.code === "PROTOCOL_DRIFT" ? "protocol-drift" : "refresh-failed";
			this.catalogView = createCatalogView(this.definitions, state, void 0, (/* @__PURE__ */ new Date()).toISOString());
			if (!canFallBackToPinnedTextSnapshot(error)) throw error;
			return snapshot;
		}
		return snapshot.filter((model) => available.has(model.id));
	}
	pinnedTextModelInfos() {
		return Object.values(this.definitions).filter((definition) => !definition.modalities.output.includes("image")).map((definition) => ({
			provider: ANTIGRAVITY_PROVIDER,
			id: definition.id,
			name: cleanModelDisplayName(definition.name),
			inputModalities: definition.modalities.input.filter((item) => item === "text" || item === "image")
		}));
	}
	async resolveModel(provider, model, _signal) {
		this.providerInfo(provider);
		if (typeof model !== "string" || model.trim().length === 0 || model.length > 256) throw new LlmError("The Antigravity model id is invalid", "INVALID_MODEL");
		const definition = this.definitions[model];
		if (definition === void 0 || definition.modalities.output.includes("image")) throw new LlmError("The Antigravity model is not in the audited text model snapshot", "INVALID_MODEL");
		const reasoning = getModelReasoningEfforts(model);
		return {
			provider: ANTIGRAVITY_PROVIDER,
			id: definition.id,
			name: cleanModelDisplayName(definition.name),
			inputModalities: definition.modalities.input.filter((item) => item === "text" || item === "image"),
			context: { contextWindow: definition.limit.context },
			defaultMaxTokens: definition.limit.output,
			...reasoning === void 0 ? {} : { reasoning }
		};
	}
	async *stream(options) {
		if (options.provider !== "google-antigravity") throw new LlmError("The Antigravity adapter received an unknown provider route", "NO_ADAPTER");
		const signal = options.signal;
		const requestedDefinition = this.definitions[options.model];
		if (requestedDefinition === void 0 || requestedDefinition.modalities.output.includes("image")) throw new LlmError("The Antigravity model is not in the audited text model snapshot", "INVALID_MODEL");
		if (isAborted(signal)) {
			yield finishChunk("aborted", "CANCELLED");
			return;
		}
		const hasEmitted = { value: false };
		let replayed = false;
		for (;;) {
			const credential = await this.readCredential(signal, replayed);
			if (credential === void 0) throw new LlmError("Antigravity login is required before model use", "AUTH");
			const sessionKey = requestSessionKey(options);
			const requestScope = this.sessions.beginRequest(sessionKey);
			let payload;
			try {
				payload = await buildAntigravityGeneratePayloadForAdapter(options, credential, requestScope.session, requestScope.timestamp, this.adapterOptions.attachments);
			} catch (error) {
				if (error instanceof LlmError) throw error;
				throw new LlmError("The Antigravity image input could not be admitted safely", "UNSUPPORTED_MODALITY");
			}
			let response;
			try {
				response = await this.transport.request({
					url: ANTIGRAVITY_STREAM_ENDPOINT,
					accessToken: credential.accessToken,
					body: JSON.stringify(payload),
					...signal === void 0 ? {} : { signal },
					responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
				});
			} catch (error) {
				throw toLlmError(error);
			}
			const statusError = privateStatusError(response.status);
			if (statusError !== void 0) {
				if (statusError.code === "authentication" && !replayed && !hasEmitted.value && !isAborted(signal)) {
					await cancelResponse(response);
					replayed = true;
					continue;
				}
				if (response.status === 400 && await responseReportsContextWindowExceeded(response, {
					...signal === void 0 ? {} : { signal },
					idleTimeoutMs: this.options.idleTimeoutMs,
					totalTimeoutMs: this.options.totalTimeoutMs,
					maxResponseBytes: this.options.maxResponseBytes,
					maxFrameBytes: this.options.maxFrameBytes
				})) throw contextWindowExceededError(response.status);
				await cancelResponse(response);
				throw toLlmError(statusError);
			}
			try {
				yield* this.streamResponse(response, options, hasEmitted);
				this.sessions.completeExecution(sessionKey);
				return;
			} catch (error) {
				if ((error instanceof PrivateTransportError ? error : void 0)?.code === "authentication" && !replayed && !hasEmitted.value && !isAborted(signal)) {
					replayed = true;
					continue;
				}
				throw toLlmError(error);
			}
		}
	}
	async *streamResponse(response, options, hasEmitted) {
		const states = [];
		let current;
		let usage;
		let finish;
		let eventError;
		for await (const sse of iteratePrivateSse(response, {
			...options.signal === void 0 ? {} : { signal: options.signal },
			idleTimeoutMs: this.options.idleTimeoutMs,
			totalTimeoutMs: this.options.totalTimeoutMs,
			maxBytes: this.options.maxResponseBytes,
			maxFrameBytes: this.options.maxFrameBytes
		})) {
			if (sse.data.trim() === "[DONE]") continue;
			const event = parseProviderEvent(sse.data);
			if (event.error !== void 0) {
				eventError = event.error;
				if (event.error.status === 401 || isAuthenticationCode(event.error.code)) throw new PrivateTransportError("authentication", "The private endpoint requires authentication", { status: event.error.status ?? 401 });
				break;
			}
			if (event.usage !== void 0) usage = event.usage;
			if (event.finish !== void 0) finish = event.finish;
			for (const part of event.parts) {
				if (current === void 0 || !sameBlock(current, part)) {
					if (current !== void 0) yield endBlock(current);
					current = beginBlock(states, part);
					yield {
						type: "block-start",
						index: current.index,
						blockType: current.kind
					};
				}
				if (part.kind === "tool-call") {
					if (part.name !== void 0) current.name = assembleFunctionName(current.name, part.name);
					current.text += part.arguments;
					hasEmitted.value ||= part.arguments.length > 0 || part.name !== void 0;
					yield {
						type: "tool-call-delta",
						index: current.index,
						id: current.id,
						...part.name === void 0 ? {} : { name: part.name },
						argumentsDelta: part.arguments
					};
					if (part.signature !== void 0) current.signature = part.signature;
				} else if (part.kind === "reasoning") {
					current.text += part.text;
					hasEmitted.value ||= part.text.length > 0;
					if (part.text.length > 0) yield {
						type: "reasoning-delta",
						index: current.index,
						text: part.text
					};
				} else {
					current.text += part.text;
					hasEmitted.value ||= part.text.length > 0;
					if (part.text.length > 0) yield {
						type: "text-delta",
						index: current.index,
						text: part.text
					};
				}
			}
		}
		if (current !== void 0) yield endBlock(current);
		if (usage !== void 0) yield {
			type: "usage",
			usage
		};
		if (eventError !== void 0) {
			yield finishChunk("error", eventError.contextWindowExceeded === true ? CONTEXT_WINDOW_EXCEEDED_CODE : safeProviderErrorCode(eventError.code), safeProviderStatus(eventError.status));
			return;
		}
		if (isAborted(options.signal)) {
			yield finishChunk("aborted", "CANCELLED");
			return;
		}
		if (states.length === 0) {
			yield finishChunk("error", "EMPTY_RESPONSE");
			return;
		}
		const replayBlocks = states.map((state) => ({
			kind: state.kind,
			...state.signature === void 0 ? {} : { signature: state.signature }
		}));
		const replayState = createReplayState(options.model, antigravityModelFamily(options.model), finish, replayBlocks);
		yield finishChunk(mapFinishReason(finish), finish ?? "STOP", void 0, replayState);
	}
	async readLiveModelIds(signal, bypassCache = false, forceCredentialRefresh = false) {
		const credential = await this.readCredential(signal, forceCredentialRefresh);
		if (credential === void 0) throw new LlmError("Antigravity login is required before model discovery", "AUTH");
		if (!bypassCache && this.catalogProjectId === credential.projectId && Date.now() < this.catalogExpiresAt) {
			if (this.catalogFailureCode !== void 0) throw new LlmError("The Antigravity live model catalog refresh remains unavailable", this.catalogFailureCode);
			return this.catalogModelIds;
		}
		let response;
		const body = credential.projectId ? { project: credential.projectId } : {};
		try {
			response = await this.transport.request({
				url: ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT,
				accessToken: credential.accessToken,
				body: JSON.stringify(body),
				...signal === void 0 ? {} : { signal },
				responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
			});
		} catch (error) {
			const failure = toModelCatalogError(error, signal, "provider");
			this.rememberCatalogFailure(credential.projectId, failure);
			throw failure;
		}
		if (response.status === 403 && credential.projectId) try {
			const retryResponse = await this.transport.request({
				url: ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT,
				accessToken: credential.accessToken,
				body: JSON.stringify({}),
				...signal === void 0 ? {} : { signal },
				responseHeaderTimeoutMs: this.options.responseHeaderTimeoutMs
			});
			if (retryResponse.ok) {
				await cancelResponse(response);
				response = retryResponse;
			} else await cancelResponse(retryResponse);
		} catch (error) {
			const failure = toModelCatalogError(error, signal, "provider");
			if (failure.code === "CANCELLED" || failure.code === "GATE_0_ATTRIBUTION") {
				await cancelResponse(response);
				this.rememberCatalogFailure(credential.projectId, failure);
				throw failure;
			}
		}
		const statusError = privateStatusError(response.status);
		if (statusError !== void 0) {
			await cancelResponse(response);
			if (statusError.code === "authentication" && !forceCredentialRefresh && !isAborted(signal)) {
				this.catalogExpiresAt = 0;
				return this.readLiveModelIds(signal, true, true);
			}
			const failure = toLlmError(statusError);
			this.rememberCatalogFailure(credential.projectId, failure);
			throw failure;
		}
		let value;
		try {
			value = JSON.parse(await readPrivateText(response, {
				...signal === void 0 ? {} : { signal },
				idleTimeoutMs: this.options.idleTimeoutMs,
				totalTimeoutMs: this.options.totalTimeoutMs,
				maxBytes: Math.min(this.options.maxResponseBytes, MAX_MODEL_CATALOG_BYTES)
			}));
		} catch (error) {
			const failure = toModelCatalogError(error, signal, "protocol");
			this.rememberCatalogFailure(credential.projectId, failure);
			throw failure;
		}
		let ids;
		try {
			ids = parseLiveModelIds(value, this.definitions);
		} catch (error) {
			const failure = error instanceof LlmError ? error : new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
			this.rememberCatalogFailure(credential.projectId, failure);
			throw failure;
		}
		this.catalogProjectId = credential.projectId;
		this.catalogModelIds = ids;
		this.catalogFailureCode = void 0;
		this.catalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
		return ids;
	}
	rememberCatalogFailure(projectId, failure) {
		if (failure.code === "AUTH" || failure.code === "CANCELLED") return;
		this.catalogProjectId = projectId;
		this.catalogModelIds = /* @__PURE__ */ new Set();
		this.catalogFailureCode = failure.code;
		this.catalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
	}
	async readCredential(signal, forceRefresh) {
		try {
			return await this.adapterOptions.auth.credential(signal, forceRefresh ? { forceRefresh: true } : void 0);
		} catch (error) {
			throw toLlmError(error);
		}
	}
};
function cleanModelDisplayName(name) {
	return name.replace(/\s*\([^)]*\)\s*$/u, "").trim();
}
function getModelReasoningEfforts(modelId) {
	const lower = modelId.toLowerCase();
	if (lower.includes("flash") && !lower.includes("image")) return {
		efforts: [
			{
				id: ReasoningEffortId("low"),
				name: "Low"
			},
			{
				id: ReasoningEffortId("medium"),
				name: "Medium"
			},
			{
				id: ReasoningEffortId("high"),
				name: "High"
			}
		],
		defaultEffort: ReasoningEffortId(lower.includes("gemini-3.8-flash") ? "medium" : "high")
	};
	if (lower.includes("pro")) return {
		efforts: [{
			id: ReasoningEffortId("low"),
			name: "Low"
		}, {
			id: ReasoningEffortId("high"),
			name: "High"
		}],
		defaultEffort: ReasoningEffortId("high")
	};
}
function createCatalogView(definitions, state, available, checkedAt) {
	return {
		state,
		models: Object.values(definitions).filter((definition) => !definition.modalities.output.includes("image")).map((definition) => ({
			id: definition.id,
			name: cleanModelDisplayName(definition.name),
			state: state === "live-available" ? available?.has(definition.id) === true ? "live-available" : "unavailable" : "snapshot"
		})),
		...checkedAt === void 0 ? {} : { checkedAt }
	};
}
function cloneCatalogView(value) {
	return {
		state: value.state,
		models: value.models.map((model) => ({ ...model })),
		...value.checkedAt === void 0 ? {} : { checkedAt: value.checkedAt }
	};
}
function parseLiveModelIds(value, definitions) {
	const root = isRecord(value) && isRecord(value.response) ? value.response : value;
	if (!isRecord(root) || !isRecord(root.models)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
	const entries = Object.entries(root.models);
	if (entries.length > 512) throw new LlmError("The Antigravity live model catalog exceeded the model limit", "PROTOCOL_DRIFT");
	const aliases = getResolverAliasMap();
	const live = /* @__PURE__ */ new Set();
	for (const [id, rawEntry] of entries) {
		if (!safeModelId(id) || !isRecord(rawEntry)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
		const cleanId = cleanModelId(id);
		live.add(canonicalWireModel(cleanId, aliases));
		live.add(cleanId);
		live.add(id);
		if (cleanId === "gemini-3-flash" || cleanId === "gemini-3-flash-agent" || cleanId === "gemini-3.7-flash-tiered" || cleanId.startsWith("gemini-3-flash") || cleanId.startsWith("gemini-3.7-flash")) {
			live.add("gemini-3.7-flash");
			live.add("gemini-3.7-flash-medium");
			live.add("gemini-3.7-flash-low");
			live.add("gemini-3.7-flash-high");
		}
		if (cleanId === "gemini-3.8-flash-tiered" || cleanId.startsWith("gemini-3.8-flash")) {
			live.add("gemini-3.8-flash");
			live.add("gemini-3.8-flash-medium");
			live.add("gemini-3.8-flash-low");
			live.add("gemini-3.8-flash-high");
		}
		if (rawEntry.modelName !== void 0 && typeof rawEntry.modelName === "string") {
			if (!safeModelId(rawEntry.modelName)) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
			const cleanName = cleanModelId(rawEntry.modelName);
			live.add(canonicalWireModel(cleanName, aliases));
			live.add(cleanName);
		}
		if (rawEntry.displayName !== void 0 && (typeof rawEntry.displayName !== "string" || rawEntry.displayName.length > 512 || containsControl(rawEntry.displayName))) throw new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
	}
	const available = /* @__PURE__ */ new Set();
	for (const definition of Object.values(definitions)) {
		const resolved = resolveModelWithTier(definition.id).actualModel;
		const cleanResolved = cleanModelId(resolved);
		const canonical = canonicalWireModel(cleanResolved, aliases);
		if (live.has(canonical) || live.has(cleanResolved) || live.has(resolved) || live.has(definition.id) || definition.id === "antigravity-gemini-3.7-flash" && (live.has("gemini-3-flash") || live.has("gemini-3-flash-agent") || live.has("gemini-3.7-flash-tiered") || live.has("gemini-3.7-flash") || live.has("gemini-3.7-flash-medium"))) available.add(definition.id);
	}
	return available;
}
function cleanModelId(value) {
	return value.replace(/^(?:publishers\/[^/]+\/)?models\//, "");
}
function canonicalWireModel(value, aliases) {
	return aliases[value] ?? value;
}
function safeModelId(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 256 && !containsControl(value);
}
function containsControl(value) {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
function beginBlock(states, part) {
	const index = states.length;
	const block = part.kind === "tool-call" ? {
		index,
		kind: "tool-call",
		id: ToolCallId(part.id ?? `antigravity-call-${String(index)}`),
		...part.name === void 0 ? {} : { name: part.name },
		text: "",
		...part.signature === void 0 ? {} : { signature: part.signature }
	} : {
		index,
		kind: part.kind,
		id: ToolCallId(`antigravity-block-${String(index)}`),
		text: "",
		...part.signature === void 0 ? {} : { signature: part.signature }
	};
	states.push(block);
	return block;
}
function sameBlock(state, part) {
	if (state.kind !== part.kind) return false;
	return part.kind !== "tool-call" || part.id === void 0 || part.id === String(state.id);
}
function assembleFunctionName(current, fragment) {
	if (fragment.length === 0 || fragment.length > 256 || containsControl(fragment)) throw new PrivateTransportError("protocol-drift", "The private tool-call name was invalid");
	if (current === void 0 || current.length === 0) return fragment;
	if (fragment === current) return current;
	if (fragment.startsWith(current)) return fragment;
	const combined = `${current}${fragment}`;
	if (combined.length > 256) throw new PrivateTransportError("protocol-drift", "The private tool-call name exceeded the byte limit");
	return combined;
}
function endBlock(state) {
	if (state.kind === "text") return {
		type: "block-end",
		index: state.index,
		block: {
			type: "text",
			text: state.text
		}
	};
	if (state.kind === "reasoning") return {
		type: "block-end",
		index: state.index,
		block: {
			type: "reasoning",
			text: state.text
		}
	};
	let parsed;
	try {
		parsed = JSON.parse(state.text);
	} catch {
		throw new PrivateTransportError("protocol-drift", "The private tool-call arguments were incomplete JSON");
	}
	if (!isRecord(parsed)) throw new PrivateTransportError("protocol-drift", "The private tool-call arguments were not an object");
	const args = state.text;
	if (state.name === void 0 || !/^[A-Za-z_][A-Za-z0-9_.:-]{0,255}$/u.test(state.name)) throw new PrivateTransportError("protocol-drift", "The private tool-call name was missing or invalid");
	return {
		type: "block-end",
		index: state.index,
		block: {
			type: "tool-call",
			id: state.id,
			name: state.name,
			arguments: args
		}
	};
}
function buildAntigravityGeneratePayload(options, credential) {
	const toolNames = /* @__PURE__ */ new Map();
	return buildPayloadFromContents(options, credential, options.messages.filter((message) => message.role !== "system").map((message) => mapMessage(message, options.model, toolNames)));
}
async function buildAntigravityGeneratePayloadForAdapter(options, credential, session, timestamp, attachments) {
	const contents = [];
	const toolNames = /* @__PURE__ */ new Map();
	for (const message of options.messages) {
		if (message.role === "system") continue;
		contents.push(await mapMessageWithAttachments(message, options.model, toolNames, attachments, options.signal));
	}
	const payload = buildPayloadFromContents(options, credential, contents);
	const metadata = buildAgyAgentRequestMetadata(session, payload.request, resolveWireModel(options.model, options.reasoningEffort), timestamp);
	const request = payload.request;
	request.labels = metadata.labels;
	request.sessionId = metadata.sessionId;
	orderAgyRequestPayloadInPlace(request);
	return {
		...payload.project === void 0 ? {} : { project: payload.project },
		requestId: metadata.requestId,
		request,
		model: payload.model,
		userAgent: "antigravity",
		requestType: "agent"
	};
}
function groupClaudeFunctionResponses(contents, model) {
	if (antigravityModelFamily(model) !== "claude") return contents;
	const grouped = [];
	let pendingResponses = [];
	const flushResponses = () => {
		if (pendingResponses.length === 0) return;
		grouped.push({
			role: "user",
			parts: pendingResponses
		});
		pendingResponses = [];
	};
	for (const content of contents) {
		const rawParts = Array.isArray(content.parts) ? content.parts : [];
		const responseParts = rawParts.filter((part) => isRecord(part) && isRecord(part.functionResponse));
		if (content.role === "user" && rawParts.length > 0 && responseParts.length === rawParts.length) {
			pendingResponses.push(...responseParts);
			continue;
		}
		flushResponses();
		grouped.push(content);
	}
	flushResponses();
	return grouped;
}
function buildPayloadFromContents(options, credential, contents) {
	const wireModel = resolveWireModel(options.model, options.reasoningEffort);
	const usesCapturedGemini38ThinkingBudget = /^gemini-3\.8-flash-(?:low|medium|high)$/u.test(wireModel);
	const request = { contents: groupClaudeFunctionResponses(contents, options.model) };
	const systemParts = [...options.system?.trim() ? [{ text: options.system }] : [], ...options.messages.flatMap((message) => message.role === "system" ? message.content.flatMap((block) => block.type === "text" && block.text.trim() ? [{ text: block.text }] : []) : [])];
	if (systemParts.length > 0) request.systemInstruction = { parts: systemParts };
	const generationConfig = {};
	if (options.maxTokens !== void 0) generationConfig.maxOutputTokens = boundedInteger(options.maxTokens, 1, 1e6, "maxTokens");
	else if (usesCapturedGemini38ThinkingBudget) generationConfig.maxOutputTokens = 65536;
	if (options.temperature !== void 0) generationConfig.temperature = boundedNumber(options.temperature, -100, 100, "temperature");
	if (options.stop !== void 0) generationConfig.stopSequences = options.stop.slice(0, 16).map((item) => item.slice(0, 256));
	if (options.reasoningEffort !== void 0) generationConfig.thinkingConfig = { thinkingLevel: String(options.reasoningEffort) };
	if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig;
	if (options.tools !== void 0 && options.tools.length > 0) {
		const declarations = buildFunctionDeclarations(options.tools);
		if (declarations.length > 0) request.tools = [{ functionDeclarations: declarations }];
	}
	const resolved = resolveModelWithTier(usesCapturedGemini38ThinkingBudget ? wireModel : options.model, { cli_first: false });
	const thinkingLevel = normalizeReasoningEffort(options.reasoningEffort) ?? resolved.thinkingLevel;
	if (wireModel.toLowerCase().includes("claude")) {
		applyClaudeToolHardening(request);
		applyClaudeTransforms(request, {
			model: wireModel,
			...resolved.thinkingBudget === void 0 ? {} : { tierThinkingBudget: resolved.thinkingBudget },
			...options.reasoningEffort === void 0 && resolved.thinkingBudget === void 0 ? {} : { normalizedThinking: {
				includeThoughts: true,
				...resolved.thinkingBudget === void 0 ? {} : { thinkingBudget: resolved.thinkingBudget }
			} },
			cleanJSONSchema: (value) => isRecord(value) ? value : {
				type: "object",
				properties: {}
			}
		});
	} else {
		applyGeminiTransforms(request, {
			model: wireModel,
			...thinkingLevel === void 0 || usesCapturedGemini38ThinkingBudget ? {} : { tierThinkingLevel: thinkingLevel },
			...resolved.thinkingBudget === void 0 ? {} : { tierThinkingBudget: resolved.thinkingBudget },
			...options.reasoningEffort === void 0 && resolved.thinkingBudget === void 0 ? {} : { normalizedThinking: {
				includeThoughts: true,
				...resolved.thinkingBudget === void 0 ? {} : { thinkingBudget: resolved.thinkingBudget }
			} }
		});
		if (usesCapturedGemini38ThinkingBudget) {
			const transformedConfig = request.generationConfig;
			if (!isRecord(transformedConfig) || typeof resolved.thinkingBudget !== "number") throw new LlmError("The Gemini 3.8 captured thinking configuration could not be resolved", "PROTOCOL_DRIFT");
			transformedConfig.thinkingConfig = {
				includeThoughts: true,
				thinkingBudget: resolved.thinkingBudget
			};
		}
	}
	const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
	return {
		...project === void 0 ? {} : { project },
		model: wireModel,
		request
	};
}
function applyClaudeToolHardening(request) {
	if (!Array.isArray(request.tools) || request.tools.length === 0) return;
	request.tools = request.tools.map((tool) => {
		if (!isRecord(tool) || !Array.isArray(tool.functionDeclarations)) return tool;
		return {
			...tool,
			functionDeclarations: tool.functionDeclarations.map((declaration) => hardenClaudeToolDeclaration(declaration))
		};
	});
	const instructionPart = { text: CLAUDE_TOOL_SYSTEM_INSTRUCTION };
	const existing = request.systemInstruction;
	if (isRecord(existing) && Array.isArray(existing.parts)) {
		if (existing.parts.some((part) => isRecord(part) && typeof part.text === "string" && part.text.includes("CRITICAL TOOL USAGE INSTRUCTIONS"))) return;
		request.systemInstruction = {
			...existing,
			parts: [...existing.parts, instructionPart]
		};
	} else if (typeof existing === "string") request.systemInstruction = {
		role: "user",
		parts: [{ text: existing }, instructionPart]
	};
	else request.systemInstruction = {
		role: "user",
		parts: [instructionPart]
	};
}
function hardenClaudeToolDeclaration(value) {
	if (!isRecord(value)) return value;
	const description = typeof value.description === "string" ? value.description : "";
	if (description.includes("STRICT PARAMETERS:")) return value;
	const schema = isRecord(value.parameters) ? value.parameters : void 0;
	const properties = schema !== void 0 && isRecord(schema.properties) ? schema.properties : void 0;
	if (properties === void 0 || Object.keys(properties).length === 0) return value;
	const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((item) => typeof item === "string") : []);
	const parameters = Object.entries(properties).map(([name, property]) => {
		const requiredHint = required.has(name) ? ", REQUIRED" : "";
		return `${name} (${claudeToolTypeHint(property)}${requiredHint})`;
	});
	return {
		...value,
		description: description + CLAUDE_DESCRIPTION_PROMPT.replace("{params}", parameters.join(", "))
	};
}
function claudeToolTypeHint(value) {
	if (!isRecord(value)) return "unknown";
	if (Array.isArray(value.enum)) return value.enum.length <= 5 ? `string ENUM[${value.enum.map((item) => JSON.stringify(item)).join(", ")}]` : `string ENUM[${value.enum.length} options]`;
	const type = typeof value.type === "string" ? value.type : "unknown";
	if (type === "array") {
		if (!isRecord(value.items)) return "ARRAY";
		const itemType = typeof value.items.type === "string" ? value.items.type : "unknown";
		if (itemType !== "object") return `ARRAY_OF_${itemType.toUpperCase()}`;
		if (!isRecord(value.items.properties)) return "ARRAY_OF_OBJECTS";
		const nestedRequired = new Set(Array.isArray(value.items.required) ? value.items.required.filter((item) => typeof item === "string") : []);
		return `ARRAY_OF_OBJECTS[${Object.entries(value.items.properties).map(([name, property]) => {
			return `${name}: ${isRecord(property) && typeof property.type === "string" ? property.type : "unknown"}${nestedRequired.has(name) ? " REQUIRED" : ""}`;
		}).join(", ")}]`;
	}
	if (type === "object" && isRecord(value.properties)) {
		const nestedRequired = new Set(Array.isArray(value.required) ? value.required.filter((item) => typeof item === "string") : []);
		return `object{${Object.entries(value.properties).map(([name, property]) => {
			return `${name}: ${isRecord(property) && typeof property.type === "string" ? property.type : "unknown"}${nestedRequired.has(name) ? " REQUIRED" : ""}`;
		}).join(", ")}}`;
	}
	return type;
}
function mapMessage(message, model, toolNames) {
	const parts = [];
	const replayBlocks = compatibleReplayState(message, "google-antigravity", model, contentKinds(message))?.blocks ?? [];
	const isClaude = antigravityModelFamily(model) === "claude";
	let replayIndex = 0;
	let sawClaudeFunctionCall = false;
	for (const block of message.content) {
		const replayKind = block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? block.type : void 0;
		const replayBlock = replayKind === void 0 ? void 0 : replayBlocks[replayIndex++];
		const replaySignature = replayBlock !== void 0 && replayBlock.kind === replayKind ? replayBlock.signature : void 0;
		const blockSignature = block.signature ?? block.thoughtSignature ?? replaySignature;
		if (block.type === "text") {
			if (block.text.length === 0 && message.content.length > 1) continue;
			parts.push({
				text: block.text,
				...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature }
			});
		} else if (block.type === "reasoning") {
			if (isClaude && blockSignature === void 0) continue;
			parts.push({
				text: block.text,
				thought: true,
				...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature }
			});
		} else if (block.type === "tool-call") {
			const callId = rememberToolName(toolNames, block.id, block.name);
			const signature = isClaude ? sawClaudeFunctionCall ? void 0 : blockSignature ?? SKIP_THOUGHT_SIGNATURE : blockSignature;
			sawClaudeFunctionCall ||= isClaude;
			parts.push({
				functionCall: {
					...isClaude ? { id: callId } : {},
					name: block.name,
					args: parseJsonObject(block.arguments)
				},
				...signature === void 0 ? {} : { thoughtSignature: signature }
			});
		} else if (block.type === "tool-result") {
			const callId = requireToolCallId(block.toolCallId);
			parts.push({ functionResponse: {
				...isClaude ? { id: callId } : {},
				name: requireToolName(toolNames, callId),
				response: { content: blocksToText(block.content) }
			} });
		} else if (block.type === "image") throw new LlmError("Antigravity text requests do not accept unresolved image blocks", "UNSUPPORTED_MODALITY");
	}
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts
	};
}
async function mapMessageWithAttachments(message, model, toolNames, attachments, signal) {
	if (!message.content.some((block) => block.type === "image")) return mapMessage(message, model, toolNames);
	if (attachments === void 0) throw new LlmError("Antigravity image input requires the Host AttachmentStore", "UNSUPPORTED_MODALITY");
	const replayBlocks = compatibleReplayState(message, "google-antigravity", model, contentKinds(message))?.blocks ?? [];
	const parts = [];
	const isClaude = antigravityModelFamily(model) === "claude";
	let replayIndex = 0;
	let sawClaudeFunctionCall = false;
	for (const block of message.content) {
		const replayKind = block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? block.type : void 0;
		const replayBlock = replayKind === void 0 ? void 0 : replayBlocks[replayIndex++];
		const replaySignature = replayBlock !== void 0 && replayBlock.kind === replayKind ? replayBlock.signature : void 0;
		const blockSignature = block.signature ?? block.thoughtSignature ?? replaySignature;
		if (block.type === "image") {
			const stored = await attachments.readImage(block.attachment, signal);
			parts.push({ inlineData: {
				mimeType: stored.ref.mediaType,
				data: Buffer.from(stored.data).toString("base64")
			} });
		} else if (block.type === "text") {
			if (block.text.length === 0 && message.content.length > 1) continue;
			parts.push({
				text: block.text,
				...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature }
			});
		} else if (block.type === "reasoning") {
			if (isClaude && blockSignature === void 0) continue;
			parts.push({
				text: block.text,
				thought: true,
				...blockSignature === void 0 ? {} : { thoughtSignature: blockSignature }
			});
		} else if (block.type === "tool-call") {
			const callId = rememberToolName(toolNames, block.id, block.name);
			const signature = isClaude ? sawClaudeFunctionCall ? void 0 : blockSignature ?? SKIP_THOUGHT_SIGNATURE : blockSignature;
			sawClaudeFunctionCall ||= isClaude;
			parts.push({
				functionCall: {
					...isClaude ? { id: callId } : {},
					name: block.name,
					args: parseJsonObject(block.arguments)
				},
				...signature === void 0 ? {} : { thoughtSignature: signature }
			});
		} else if (block.type === "tool-result") {
			const callId = requireToolCallId(block.toolCallId);
			parts.push({ functionResponse: {
				...isClaude ? { id: callId } : {},
				name: requireToolName(toolNames, callId),
				response: { content: blocksToText(block.content) }
			} });
		}
	}
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts
	};
}
function rememberToolName(toolNames, callId, name) {
	if (name.length === 0 || name.length > 256 || containsControl(name)) throw new LlmError("The tool call name is invalid", "INVALID_ARGS");
	const id = requireToolCallId(callId);
	const existing = toolNames.get(id);
	if (existing !== void 0 && existing !== name) throw new LlmError("A tool call id was reused with a different name", "INVALID_ARGS");
	toolNames.set(id, name);
	return id;
}
function requireToolName(toolNames, callId) {
	const name = toolNames.get(requireToolCallId(callId));
	if (name === void 0) throw new LlmError("A tool result did not match a prior tool call", "INVALID_ARGS");
	return name;
}
function requireToolCallId(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 512 || containsControl(value)) throw new LlmError("The tool call id is invalid", "INVALID_ARGS");
	return value;
}
function normalizeReasoningEffort(value) {
	if (value === void 0) return void 0;
	const normalized = String(value).toLowerCase();
	return [
		"minimal",
		"low",
		"medium",
		"high"
	].includes(normalized) ? normalized : void 0;
}
function resolveWireModel(model, reasoningEffort) {
	if (model === "antigravity-gemini-3.7-flash" || model === "gemini-3.7-flash") return "gemini-3-flash";
	const effort = normalizeReasoningEffort(reasoningEffort);
	const routeModel = effort !== void 0 && (model === "antigravity-gemini-3.8-flash" || model === "gemini-3.8-flash") ? `${model}-${effort}` : model;
	const resolved = resolveModelWithTier(routeModel, { cli_first: false });
	if (resolved.actualModel.startsWith("gemini-3.7-flash")) return "gemini-3-flash";
	return resolved.actualModel;
}
function requestSessionKey(options) {
	return options.sessionId === void 0 ? "default" : `session:${fnv1a64Signed(String(options.sessionId))}`;
}
function contentKinds(message) {
	return message.content.flatMap((block) => block.type === "text" || block.type === "reasoning" || block.type === "tool-call" ? [block.type] : []);
}
function parseProviderEvent(data) {
	const normalized = data.trim().replace(/^\)\]\}'(?:\r?\n)?/u, "");
	let value;
	try {
		value = JSON.parse(normalized);
	} catch {
		throw new PrivateTransportError("invalid-response", "The private response contained invalid JSON");
	}
	if (!isRecord(value)) throw new PrivateTransportError("protocol-drift", "The private response event was not an object");
	if (isRecord(value.error)) return {
		parts: [],
		error: errorDetails(value.error)
	};
	const root = isRecord(value.response) ? value.response : value;
	if (isRecord(root.error)) return {
		parts: [],
		error: errorDetails(root.error)
	};
	const partsValue = findParts(root);
	const parts = [];
	for (const part of partsValue) {
		const parsed = parsePart(part);
		if (parsed !== void 0) parts.push(parsed);
	}
	const usage = parseUsage(root.usageMetadata ?? value.usageMetadata);
	const finish = findFinish(root);
	return {
		parts,
		...usage === void 0 ? {} : { usage },
		...finish === void 0 ? {} : { finish }
	};
}
function findParts(value) {
	if (Array.isArray(value.parts)) return boundedParts(value.parts);
	if (isRecord(value.content) && Array.isArray(value.content.parts)) return boundedParts(value.content.parts);
	if (isRecord(value.modelTurn) && Array.isArray(value.modelTurn.parts)) return boundedParts(value.modelTurn.parts);
	if (Array.isArray(value.candidates)) {
		const output = [];
		for (const candidate of value.candidates) {
			if (!isRecord(candidate)) continue;
			const content = isRecord(candidate.content) ? candidate.content : candidate;
			if (Array.isArray(content.parts)) {
				if (output.length + content.parts.length > MAX_PROVIDER_PARTS) throw new PrivateTransportError("protocol-drift", "The private response contained too many parts");
				output.push(...content.parts);
			}
		}
		return output;
	}
	if (isRecord(value.serverContent) && isRecord(value.serverContent.modelTurn) && Array.isArray(value.serverContent.modelTurn.parts)) return boundedParts(value.serverContent.modelTurn.parts);
	return [];
}
function boundedParts(value) {
	if (value.length > MAX_PROVIDER_PARTS) throw new PrivateTransportError("protocol-drift", "The private response contained too many parts");
	return value;
}
function parsePart(value) {
	if (!isRecord(value)) throw new PrivateTransportError("protocol-drift", "The private response part was malformed");
	const functionCall = isRecord(value.functionCall) ? value.functionCall : isRecord(value.function_call) ? value.function_call : void 0;
	if (functionCall !== void 0) {
		const name = stringValue(functionCall.name);
		const id = stringValue(functionCall.id);
		const signature = signatureOf(value) ?? signatureOf(functionCall);
		const args = typeof functionCall.args === "string" ? functionCall.args : JSON.stringify(functionCall.args ?? {});
		return {
			kind: "tool-call",
			...name === void 0 ? {} : { name },
			...id === void 0 ? {} : { id },
			arguments: args,
			...signature === void 0 ? {} : { signature }
		};
	}
	if (typeof value.text === "string" || signatureOf(value) !== void 0) {
		const kind = value.thought === true || value.reasoning === true || value.thinking === true ? "reasoning" : "text";
		const signature = signatureOf(value);
		return {
			kind,
			text: typeof value.text === "string" ? value.text : "",
			...signature === void 0 ? {} : { signature }
		};
	}
	if (value.inlineData !== void 0 || value.inline_data !== void 0) throw new PrivateTransportError("protocol-drift", "The text model returned unsupported media output");
	throw new PrivateTransportError("protocol-drift", "The private response contained an unknown part type");
}
function errorDetails(value) {
	const status = numberValue(value.status);
	const code = stringValue(value.code);
	const contextWindowExceeded = providerErrorReportsContextWindowExceeded(value, 0);
	return {
		...status === void 0 ? {} : { status },
		...code === void 0 ? {} : { code },
		...contextWindowExceeded ? { contextWindowExceeded: true } : {}
	};
}
async function responseReportsContextWindowExceeded(response, options) {
	try {
		for await (const event of iteratePrivateSse(response, {
			...options.signal === void 0 ? {} : { signal: options.signal },
			idleTimeoutMs: options.idleTimeoutMs,
			totalTimeoutMs: options.totalTimeoutMs,
			maxBytes: Math.min(MAX_PROVIDER_ERROR_BYTES, options.maxResponseBytes),
			maxFrameBytes: Math.min(MAX_PROVIDER_ERROR_FRAME_BYTES, options.maxFrameBytes)
		})) if (providerErrorEnvelopeReportsContextWindowExceeded(event.data.replace(/^\)\]\}'(?:\r?\n)?/u, ""), 0)) return true;
		return false;
	} catch (error) {
		if (error instanceof PrivateTransportError && error.code === "cancelled") throw toLlmError(error);
		if (isAborted(options.signal)) throw new LlmError("The Antigravity request was cancelled", "CANCELLED");
		return false;
	}
}
function providerErrorReportsContextWindowExceeded(value, depth) {
	if (depth > MAX_PROVIDER_ERROR_JSON_DEPTH) return false;
	if (typeof value.message === "string") {
		if (isExactContextWindowExceededMessage(value.message)) return true;
		if (providerErrorEnvelopeReportsContextWindowExceeded(value.message, depth + 1)) return true;
	}
	return isRecord(value.error) && providerErrorReportsContextWindowExceeded(value.error, depth + 1);
}
function providerErrorEnvelopeReportsContextWindowExceeded(value, depth) {
	if (depth > MAX_PROVIDER_ERROR_JSON_DEPTH || value.length === 0 || value.length > MAX_PROVIDER_ERROR_BYTES) return false;
	const json = value.trim();
	if (!json.startsWith("{") || !jsonDepthIsBounded(json, MAX_PROVIDER_ERROR_JSON_DEPTH)) return false;
	try {
		const parsed = JSON.parse(json);
		return isRecord(parsed) && isRecord(parsed.error) ? providerErrorReportsContextWindowExceeded(parsed.error, depth + 1) : false;
	} catch {
		return false;
	}
}
function isExactContextWindowExceededMessage(value) {
	const match = /^prompt is too long: ([0-9]{1,16}) tokens > ([0-9]{1,16}) maximum$/u.exec(value);
	const actual = match?.[1];
	const maximum = match?.[2];
	return actual !== void 0 && maximum !== void 0 && BigInt(actual) > BigInt(maximum);
}
function jsonDepthIsBounded(value, maxDepth) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (const character of value) {
		if (inString) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === "\"") inString = false;
			continue;
		}
		if (character === "\"") {
			inString = true;
			continue;
		}
		if (character === "{" || character === "[") {
			depth += 1;
			if (depth > maxDepth) return false;
		} else if (character === "}" || character === "]") {
			depth -= 1;
			if (depth < 0) return false;
		}
	}
	return depth === 0 && !inString && !escaped;
}
function contextWindowExceededError(status) {
	const message = "The Antigravity request exceeded the model context window";
	return status === void 0 ? new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE) : new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE, { status });
}
function parseUsage(value) {
	if (!isRecord(value)) return void 0;
	const input = numberValue(value.promptTokenCount ?? value.inputTokenCount);
	const output = numberValue(value.candidatesTokenCount ?? value.outputTokenCount);
	const reasoning = numberValue(value.thoughtsTokenCount ?? value.reasoningTokenCount);
	const cached = numberValue(value.cachedContentTokenCount ?? value.cacheReadTokens);
	if (input === void 0 && output === void 0 && reasoning === void 0 && cached === void 0) return void 0;
	return {
		inputTokens: input ?? 0,
		outputTokens: output ?? 0,
		...cached === void 0 ? {} : { cacheReadTokens: cached },
		...reasoning === void 0 ? {} : { reasoningTokens: reasoning }
	};
}
function findFinish(value) {
	const candidate = value.finishReason ?? value.finish_reason;
	if (typeof candidate === "string") return candidate;
	if (isRecord(value.serverContent) && typeof value.serverContent.finishReason === "string") return value.serverContent.finishReason;
	if (Array.isArray(value.candidates)) {
		for (const item of value.candidates) if (isRecord(item) && typeof item.finishReason === "string") return item.finishReason;
	}
}
function signatureOf(value) {
	return stringValue(value.thoughtSignature ?? value.thought_signature ?? value.signature);
}
function parseJsonObject(value) {
	try {
		const parsed = JSON.parse(value);
		if (isRecord(parsed)) return parsed;
	} catch {}
	throw new LlmError("The Antigravity tool-call history is malformed", "PROTOCOL_DRIFT");
}
function blocksToText(blocks) {
	return blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").slice(0, 65536);
}
function isAuthenticationCode(value) {
	const normalized = value?.toUpperCase();
	return normalized === "UNAUTHENTICATED" || normalized === "AUTHENTICATION" || normalized === "INVALID_GRANT" || normalized === "UNAUTHENTICATED_REQUEST";
}
function mapFinishReason(value) {
	const normalized = value?.toUpperCase();
	if (normalized === "MAX_TOKENS" || normalized === "LENGTH") return "max-tokens";
	if (normalized === "SAFETY" || normalized === "BLOCKLIST" || normalized === "ERROR") return "error";
	if (normalized === "TOOL_CALLS" || normalized === "FUNCTION_CALL") return "tool-calls";
	return "stop";
}
function finishChunk(kind, code, status, replayState) {
	return {
		type: "finish",
		reason: kind === "aborted" ? {
			kind: "aborted",
			failure: {
				code,
				message: "The Antigravity request was cancelled"
			}
		} : kind === "error" ? {
			kind: "error",
			failure: {
				code,
				message: "The Antigravity provider request failed",
				...status === void 0 ? {} : { status }
			}
		} : kind === "max-tokens" ? { kind: "max-tokens" } : kind === "tool-calls" ? { kind: "tool-calls" } : { kind: "stop" },
		...replayState === void 0 ? {} : { replayState }
	};
}
const LLM_FAILURE_CODES = {
	authentication: "AUTH",
	forbidden: "FORBIDDEN",
	"rate-limited": "RATE_LIMIT",
	cancelled: "CANCELLED",
	timeout: "TIMEOUT",
	"attribution-rejected": "GATE_0_ATTRIBUTION",
	"protocol-drift": "PROTOCOL_DRIFT",
	"response-limit": "RESPONSE_LIMIT",
	"request-limit": "REQUEST_LIMIT",
	upstream: "UPSTREAM",
	network: "NETWORK",
	failed: "PROVIDER_ERROR"
};
function canFallBackToPinnedTextSnapshot(error) {
	if (!(error instanceof LlmError)) return false;
	return error.code === "RATE_LIMIT" || error.code === "TIMEOUT" || error.code === "PROTOCOL_DRIFT" || error.code === "RESPONSE_LIMIT" || error.code === "UPSTREAM" || error.code === "NETWORK";
}
function toModelCatalogError(error, signal, fallback) {
	if (isAborted(signal)) return new LlmError("The Antigravity live model catalog request was cancelled", "CANCELLED");
	if (error instanceof LlmError) return error;
	if (error instanceof PrivateTransportError || fallback === "provider") return toLlmError(error);
	return new LlmError("The Antigravity live model catalog did not match the audited schema", "PROTOCOL_DRIFT");
}
function toLlmError(error) {
	if (error instanceof LlmError) return error;
	if (error instanceof PrivateTransportError) {
		const kind = classifyPrivateFailure(error);
		const code = LLM_FAILURE_CODES[kind];
		const message = kind === "rate-limited" ? "Antigravity rate limit reached (Google returned 429 Resource Exhausted); please wait for your quota window to refresh" : "The Antigravity private request failed safely";
		return error.status === void 0 ? new LlmError(message, code) : new LlmError(message, code, { status: error.status });
	}
	return new LlmError("The Antigravity provider request failed safely", "PROVIDER_ERROR");
}
function boundedTimeout(value, fallback) {
	return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 6e5);
}
function boundedLimit(value, fallback) {
	return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), fallback);
}
function boundedInteger(value, min, max, field) {
	if (!Number.isSafeInteger(value) || value < min || value > max) throw new LlmError(`The Antigravity ${field} option is invalid`, "INVALID_OPTIONS");
	return value;
}
function boundedNumber(value, min, max, field) {
	if (!Number.isFinite(value) || value < min || value > max) throw new LlmError(`The Antigravity ${field} option is invalid`, "INVALID_OPTIONS");
	return value;
}
function numberValue(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : void 0;
}
function stringValue(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 16384 && !containsControl(value) ? value : void 0;
}
function safeProviderErrorCode(value) {
	const normalized = value?.toUpperCase();
	return normalized === "SAFETY" || normalized === "BLOCKED" || normalized === "RESOURCE_EXHAUSTED" || normalized === "INVALID_ARGUMENT" ? normalized : "UPSTREAM_ERROR";
}
function safeProviderStatus(value) {
	return value !== void 0 && Number.isInteger(value) && value >= 400 && value <= 599 ? value : void 0;
}
async function cancelResponse(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
function isAborted(signal) {
	return signal !== void 0 && signal.aborted;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_LLM_ROUTE, ANTIGRAVITY_PROVIDER, ANTIGRAVITY_STREAM_ENDPOINT, AntigravityAdapter, buildAntigravityGeneratePayload };

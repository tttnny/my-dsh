import { i as createAntigravityAuthService, t as mountCapabilityLifecycle } from "./capability-lifecycle-DPNblVcJ.js";
import { d as privateStatusError, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, p as readPrivateText } from "./private-transport-DvkyFFK_.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-nHkfjLiA.js";
import { admitWorkspaceVideo } from "./media-admission.js";
import { resolveModelWithTier } from "@cortexkit/antigravity-auth-core";
import { Buffer } from "node:buffer";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
//#region src/video.ts
/** Gated workspace-video understanding proof of concept. */
const name = "antigravity-video";
const inject = [
	"tools",
	"fs",
	"antigravityAuth"
];
const ANALYZE_VIDEO_TOOL_NAME = "analyze_video";
const UNDERSTAND_VIDEO_TOOL_NAME = ANALYZE_VIDEO_TOOL_NAME;
const ANTIGRAVITY_VIDEO_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
const ANTIGRAVITY_VIDEO_MODEL = "antigravity-gemini-3.7-flash";
const ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE = "antigravity-video";
const Config = z.object({
	enabled: z.boolean().default(true),
	model: z.string().default(ANTIGRAVITY_VIDEO_MODEL),
	maxBytes: z.number().step(1).min(1).max(33554432).default(33554432)
});
var AntigravityVideoError = class extends HarnessError {};
function createAntigravityVideoTools(options) {
	const fixedOptions = {
		...options,
		transport: options.transport ?? createPrivateTransport({ maxRequestBytes: 50331648 })
	};
	return [{
		name: ANALYZE_VIDEO_TOOL_NAME,
		description: "Analyze an explicit MP4 file inside the active workspace with the gated Antigravity video POC.",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					minLength: 1,
					maxLength: 4096
				},
				prompt: {
					type: "string",
					minLength: 1,
					maxLength: 16384
				},
				model: {
					type: "string",
					maxLength: 256
				}
			},
			required: ["path", "prompt"],
			additionalProperties: false
		},
		output: {
			schema: videoSchema,
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}],
			presentationMeta: (_args, value) => value
		},
		execute: async (args, exec) => executeVideo(fixedOptions, args, exec),
		isConcurrencySafe: () => false
	}];
}
async function executeVideo(options, rawArgs, exec) {
	const settings = options.settings?.() ?? {
		enabled: true,
		model: "antigravity-gemini-3.7-flash"
	};
	if (!settings.enabled) throw new AntigravityVideoError("Antigravity Video is disabled by its capability gate", "VIDEO_DISABLED");
	const args = parseArgs(rawArgs, settings);
	const agent = requireAgent(exec);
	const credential = await options.auth.credential(exec.signal);
	if (credential === void 0) throw new AntigravityVideoError("Antigravity Video requires a logged-in account", "VIDEO_AUTH_REQUIRED");
	const cwd = workspaceCwd(agent);
	const admitted = await admitWorkspaceVideo({
		fs: options.fs,
		...settings.maxBytes === void 0 ? {} : { maxVideoBytes: settings.maxBytes }
	}, cwd, args.path, exec.signal);
	const transport = options.transport;
	if (transport === void 0) throw new AntigravityVideoError("The Antigravity Video transport is unavailable", "VIDEO_FAILED");
	let response;
	try {
		response = await transport.request({
			url: ANTIGRAVITY_VIDEO_ENDPOINT,
			accessToken: credential.accessToken,
			body: JSON.stringify(buildVideoPayload(args.prompt, args.model, credential, admitted.data)),
			signal: exec.signal
		});
	} catch (error) {
		throw toVideoError(error);
	}
	const statusError = privateStatusError(response.status);
	if (statusError !== void 0) {
		await response.body?.cancel().catch(() => {});
		throw toVideoError(statusError);
	}
	let value;
	try {
		value = JSON.parse(await readPrivateText(response, {
			signal: exec.signal,
			maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES
		}));
	} catch (error) {
		throw toVideoError(error);
	}
	const text = extractText(value);
	if (text === void 0) throw new AntigravityVideoError("Antigravity Video returned no text understanding", "VIDEO_RESPONSE_EMPTY");
	const usage = extractUsage(value);
	return {
		text,
		...usage === void 0 ? {} : { usage }
	};
}
function buildVideoPayload(prompt, model, credential, data) {
	const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
	const resolved = resolveModelWithTier(model, { cli_first: false });
	const wireModel = resolved.actualModel.startsWith("gemini-3.7-flash") ? "gemini-3-flash" : resolved.actualModel;
	return {
		...project === void 0 ? {} : { project },
		model: wireModel,
		request: { contents: [{
			role: "user",
			parts: [{ text: prompt }, { inlineData: {
				mimeType: "video/mp4",
				data: Buffer.from(data).toString("base64")
			} }]
		}] }
	};
}
function apply(ctx, config = {
	enabled: true,
	model: ANTIGRAVITY_VIDEO_MODEL,
	maxBytes: 33554432
}) {
	if (ctx === void 0) return;
	const candidate = ctx;
	if (candidate.tools === void 0 || candidate.fs === void 0) return;
	let current = () => config;
	let lifecycle;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE, Config, config, {
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
		id: "video",
		enabled: () => current().enabled,
		register: () => {
			const disposers = createAntigravityVideoTools({
				auth,
				fs: candidate.fs,
				settings: () => current()
			}).map((tool) => candidate.tools.register(tool));
			return () => {
				for (const dispose of disposers.reverse()) dispose();
			};
		},
		ownsAuth: auth !== provided,
		label: "antigravity-video: tool lifecycle"
	});
}
function isAuthService(value) {
	return isRecord(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function extractText(value) {
	const output = [];
	let outputLength = 0;
	const visit = (item, depth = 0) => {
		if (depth > 32 || outputLength >= 65536) return;
		if (Array.isArray(item)) {
			for (const child of item) visit(child, depth + 1);
			return;
		}
		if (!isRecord(item)) return;
		if (Array.isArray(item.parts)) for (const part of item.parts) {
			if (!isRecord(part) || typeof part.text !== "string" || hasControl(part.text)) continue;
			const text = part.text.slice(0, 65536 - outputLength);
			output.push(text);
			outputLength += text.length;
		}
		if (isRecord(item.response)) visit(item.response, depth + 1);
		if (isRecord(item.content)) visit(item.content, depth + 1);
		if (Array.isArray(item.candidates)) visit(item.candidates, depth + 1);
		if (isRecord(item.serverContent)) visit(item.serverContent, depth + 1);
		if (isRecord(item.modelTurn)) visit(item.modelTurn, depth + 1);
	};
	visit(value);
	const text = output.join("").trim();
	return text.length === 0 ? void 0 : text.slice(0, 65536);
}
function extractUsage(value) {
	const visit = (item, depth = 0) => {
		if (depth > 32) return void 0;
		if (Array.isArray(item)) {
			for (const child of item) {
				const result = visit(child, depth + 1);
				if (result !== void 0) return result;
			}
			return;
		}
		if (!isRecord(item)) return void 0;
		const raw = isRecord(item.usageMetadata) ? item.usageMetadata : isRecord(item.usage_metadata) ? item.usage_metadata : isRecord(item.usage) ? item.usage : void 0;
		if (raw !== void 0) {
			const input = safeCount(raw.promptTokenCount ?? raw.inputTokenCount);
			const output = safeCount(raw.candidatesTokenCount ?? raw.outputTokenCount);
			const cached = safeCount(raw.cachedContentTokenCount ?? raw.cacheReadTokens);
			const reasoning = safeCount(raw.thoughtsTokenCount ?? raw.reasoningTokenCount);
			if (input !== void 0 || output !== void 0 || cached !== void 0 || reasoning !== void 0) return {
				inputTokens: input ?? 0,
				outputTokens: output ?? 0,
				...cached === void 0 ? {} : { cacheReadTokens: cached },
				...reasoning === void 0 ? {} : { reasoningTokens: reasoning }
			};
		}
		for (const key of [
			"response",
			"candidates",
			"serverContent"
		]) {
			const result = visit(item[key], depth + 1);
			if (result !== void 0) return result;
		}
	};
	return visit(value);
}
function safeCount(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function parseArgs(value, settings) {
	if (!isRecord(value) || hasExtra(value, [
		"path",
		"prompt",
		"model"
	]) || typeof value.path !== "string" || typeof value.prompt !== "string" || value.path.length === 0 || value.path.length > 4096 || value.prompt.trim().length === 0 || value.prompt.length > 16384) throw new AntigravityVideoError("analyze_video expects a closed path and prompt object", "INVALID_ARGS");
	const model = value.model === void 0 ? settings.model : value.model;
	if (typeof model !== "string" || model.trim().length === 0 || model.length > 256) throw new AntigravityVideoError("The video model is invalid", "INVALID_ARGS");
	return {
		path: value.path,
		prompt: value.prompt.trim().slice(0, 16384),
		model: model.trim()
	};
}
function requireAgent(exec) {
	if (exec.agent === void 0) throw new AntigravityVideoError("Video analysis requires an active workspace", "VIDEO_WORKSPACE_REQUIRED");
	workspaceCwd(exec.agent);
	return exec.agent;
}
function workspaceCwd(agent) {
	const cwd = agent.session.header.cwd;
	if (typeof cwd !== "string" || cwd.length === 0) throw new AntigravityVideoError("Video analysis requires an active workspace", "VIDEO_WORKSPACE_REQUIRED");
	return cwd;
}
const VIDEO_FAILURE_CODES = {
	authentication: "VIDEO_AUTH_REQUIRED",
	forbidden: "VIDEO_FORBIDDEN",
	"rate-limited": "VIDEO_RATE_LIMITED",
	cancelled: "VIDEO_CANCELLED",
	timeout: "VIDEO_TIMEOUT",
	"attribution-rejected": "VIDEO_PROTOCOL_DRIFT",
	"protocol-drift": "VIDEO_PROTOCOL_DRIFT",
	"response-limit": "VIDEO_PROTOCOL_DRIFT",
	"request-limit": "VIDEO_PROTOCOL_DRIFT",
	upstream: "VIDEO_FAILED",
	network: "VIDEO_FAILED",
	failed: "VIDEO_FAILED"
};
function toVideoError(error) {
	if (error instanceof AntigravityVideoError) return error;
	if (error instanceof PrivateTransportError) return new AntigravityVideoError("The Antigravity Video request failed safely", VIDEO_FAILURE_CODES[classifyPrivateFailure(error)]);
	return new AntigravityVideoError("The Antigravity Video request failed safely", "VIDEO_FAILED");
}
function hasControl(value) {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
function hasExtra(value, allowed) {
	return Object.keys(value).some((key) => !allowed.includes(key));
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
const videoSchema = {
	type: "object",
	properties: {
		text: { type: "string" },
		usage: {
			type: "object",
			properties: {
				inputTokens: { type: "integer" },
				outputTokens: { type: "integer" },
				cacheReadTokens: { type: "integer" },
				reasoningTokens: { type: "integer" }
			},
			required: ["inputTokens", "outputTokens"],
			additionalProperties: false
		}
	},
	required: ["text"],
	additionalProperties: false
};
//#endregion
export { ANALYZE_VIDEO_TOOL_NAME, ANTIGRAVITY_VIDEO_ENDPOINT, ANTIGRAVITY_VIDEO_MODEL, ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE, AntigravityVideoError, Config, UNDERSTAND_VIDEO_TOOL_NAME, apply, buildVideoPayload, createAntigravityVideoTools, inject, name };

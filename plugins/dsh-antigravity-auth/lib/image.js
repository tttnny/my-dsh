import { i as createAntigravityAuthService, n as registerCapabilitySet, t as mountCapabilityLifecycle } from "./capability-lifecycle-DPNblVcJ.js";
import { d as privateStatusError, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, p as readPrivateText } from "./private-transport-DvkyFFK_.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-nHkfjLiA.js";
import { IMAGE_HANDLE_PATTERN, admitBase64Image, admitSessionImage, admitWorkspaceImage, imageHandle, sessionImageCatalog } from "./media-admission.js";
import { resolveModelWithTier } from "@cortexkit/antigravity-auth-core";
import { Buffer } from "node:buffer";
import { HarnessError } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
//#region src/image.ts
/** Antigravity image generation/editing tools and session-authorized image catalog. */
const name = "antigravity-image";
const inject = [
	"tools",
	"attachments",
	"fs",
	"antigravityAuth"
];
const GENERATE_IMAGE_TOOL_NAME = "generate_image";
const LIST_IMAGES_TOOL_NAME = "list_images";
const ANTIGRAVITY_IMAGE_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:generateContent`;
const ANTIGRAVITY_IMAGE_MODEL = "antigravity-gemini-3.1-flash-image";
const ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE = "antigravity-image";
const Config = z.object({
	enabled: z.boolean().default(true),
	model: z.string().default(ANTIGRAVITY_IMAGE_MODEL),
	n: z.number().step(1).min(1).max(4).default(1)
});
const MAX_REFERENCES = 5;
const MAX_IMAGES = 4;
const IMAGE_ORIGINS = [
	"all",
	"generated",
	"reference",
	"user"
];
const generateSchema = {
	type: "object",
	properties: {
		operation: {
			type: "string",
			enum: ["generate", "edit"]
		},
		images: {
			type: "array",
			items: { type: "object" }
		},
		references: {
			type: "array",
			items: { type: "object" }
		},
		warnings: {
			type: "array",
			items: { type: "object" }
		}
	},
	required: [
		"operation",
		"images",
		"references",
		"warnings"
	],
	additionalProperties: false
};
const listSchema = {
	type: "object",
	properties: {
		items: {
			type: "array",
			items: { type: "object" }
		},
		nextCursor: { type: "string" }
	},
	required: ["items"],
	additionalProperties: false
};
var AntigravityImageError = class extends HarnessError {};
function createAntigravityImageTools(options) {
	const fixedOptions = {
		...options,
		transport: options.transport ?? createPrivateTransport()
	};
	return [createGenerateTool(fixedOptions), createListTool(fixedOptions)];
}
function createGenerateTool(options) {
	return {
		name: GENERATE_IMAGE_TOOL_NAME,
		description: "Generate or edit bounded Antigravity images and return durable session image handles.",
		parameters: {
			type: "object",
			properties: {
				prompt: {
					type: "string",
					minLength: 1,
					maxLength: 16384
				},
				references: {
					type: "array",
					maxItems: MAX_REFERENCES,
					items: { oneOf: [{
						type: "object",
						properties: {
							kind: { const: "session" },
							handle: { type: "string" }
						},
						required: ["kind", "handle"],
						additionalProperties: false
					}, {
						type: "object",
						properties: {
							kind: { const: "workspace" },
							path: { type: "string" }
						},
						required: ["kind", "path"],
						additionalProperties: false
					}] }
				},
				model: { type: "string" },
				n: {
					type: "integer",
					minimum: 1,
					maximum: MAX_IMAGES
				}
			},
			required: ["prompt"],
			additionalProperties: false
		},
		output: {
			schema: generateSchema,
			render: (_args, value) => renderGenerate(value),
			presentationMeta: (_args, value) => value
		},
		execute: async (args, exec) => executeGenerate(options, args, exec),
		isConcurrencySafe: () => false
	};
}
function createListTool(options) {
	return {
		name: LIST_IMAGES_TOOL_NAME,
		description: "List durable image handles authorized by the current session with bounded pagination.",
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "integer",
					minimum: 1,
					maximum: 20
				},
				cursor: { type: "string" },
				origin: {
					type: "string",
					enum: [...IMAGE_ORIGINS]
				}
			},
			additionalProperties: false
		},
		output: {
			schema: listSchema,
			render: (_args, value) => renderList(value),
			presentationMeta: (_args, value) => value
		},
		execute: async (args, exec) => executeList(options, args, exec),
		isConcurrencySafe: () => true
	};
}
async function executeGenerate(options, rawArgs, exec) {
	const settings = options.settings?.() ?? {
		enabled: true,
		model: "antigravity-gemini-3.1-flash-image",
		n: 1
	};
	if (!settings.enabled) throw new AntigravityImageError("Antigravity Image is disabled by its capability gate", "IMAGE_DISABLED");
	const args = parseGenerateArgs(rawArgs, settings);
	const credential = await requireCredential(options.auth, exec.signal);
	const agent = requireAgent(exec);
	const cwd = workspaceCwd(agent);
	const admission = {
		attachments: options.attachments,
		fs: options.fs
	};
	const references = [];
	const referenceParts = [];
	for (const [index, reference] of args.references.entries()) {
		const admitted = reference.kind === "session" ? await admitSessionImage(admission, agent, reference.handle, exec.signal) : await admitWorkspaceImage(admission, cwd, reference.path, exec.signal);
		const stored = admitted.stored ?? {
			ref: await options.attachments.saveImage(admitted.input),
			data: admitted.input.data
		};
		const item = {
			handle: imageHandle(stored.ref),
			attachment: stored.ref,
			origin: "reference",
			seq: index
		};
		references.push(item);
		referenceParts.push({ inlineData: {
			mimeType: stored.ref.mediaType,
			data: Buffer.from(stored.data).toString("base64")
		} });
	}
	const transport = options.transport;
	if (transport === void 0) throw new AntigravityImageError("The Antigravity Image transport is unavailable", "IMAGE_FAILED");
	const body = buildImagePayload(args.prompt, args.model, credential, referenceParts);
	const images = [];
	const warnings = [];
	let firstFailure;
	for (let index = 0; index < args.n; index += 1) {
		let response;
		try {
			response = await transport.request({
				url: ANTIGRAVITY_IMAGE_ENDPOINT,
				accessToken: credential.accessToken,
				body: JSON.stringify(body),
				signal: exec.signal
			});
		} catch (error) {
			const failure = toImageError(error);
			if (failure.code === "IMAGE_CANCELLED") throw failure;
			firstFailure ??= failure;
			warnings.push({
				index,
				code: imageRequestWarning(failure.code)
			});
			continue;
		}
		const statusError = privateStatusError(response.status);
		if (statusError !== void 0) {
			await response.body?.cancel().catch(() => {});
			const failure = toImageError(statusError);
			firstFailure ??= failure;
			warnings.push({
				index,
				code: imageRequestWarning(failure.code)
			});
			continue;
		}
		let envelope;
		try {
			envelope = JSON.parse(await readPrivateText(response, {
				signal: exec.signal,
				maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES
			}));
		} catch (error) {
			const failure = toImageError(error);
			if (failure.code === "IMAGE_CANCELLED") throw failure;
			firstFailure ??= failure;
			warnings.push({
				index,
				code: "IMAGE_RESPONSE_INVALID"
			});
			continue;
		}
		const candidate = collectInlineData(envelope)[0];
		if (candidate === void 0) {
			firstFailure ??= new AntigravityImageError("Antigravity Image returned no admitted inlineData", "IMAGE_RESPONSE_EMPTY");
			warnings.push({
				index,
				code: "IMAGE_RESPONSE_EMPTY"
			});
			continue;
		}
		try {
			const admitted = await admitBase64Image(options, candidate.data, "inline", `generated-${String(index + 1)}`, exec.signal);
			if (candidate.mediaType !== void 0 && normalizeImageMime(candidate.mediaType) !== admitted.input.mediaType) throw new AntigravityImageError("The declared image MIME did not match the admitted magic bytes", "IMAGE_MIME_MISMATCH");
			const attachment = await options.attachments.saveImage(admitted.input);
			images.push({
				handle: imageHandle(attachment),
				attachment,
				origin: "generated",
				seq: index
			});
		} catch (error) {
			if (exec.signal?.aborted === true) throw new AntigravityImageError("Antigravity Image generation was cancelled", "IMAGE_CANCELLED");
			if (error instanceof AntigravityImageError && error.code === "MEDIA_CANCELLED") throw new AntigravityImageError("Antigravity Image generation was cancelled", "IMAGE_CANCELLED");
			const failure = error instanceof AntigravityImageError && error.code === "IMAGE_MIME_MISMATCH" ? error : new AntigravityImageError("The generated image failed media admission", "IMAGE_ADMISSION_FAILED");
			firstFailure ??= failure;
			warnings.push({
				index,
				code: failure.code
			});
		}
	}
	if (images.length === 0) {
		if (firstFailure !== void 0) throw firstFailure;
		throw new AntigravityImageError("No generated image passed media admission", "IMAGE_RESPONSE_INVALID");
	}
	return {
		operation: references.length === 0 ? "generate" : "edit",
		images,
		references,
		warnings
	};
}
async function executeList(options, rawArgs, exec) {
	if (!(options.settings?.() ?? {
		enabled: true,
		model: "antigravity-gemini-3.1-flash-image",
		n: 1
	}).enabled) throw new AntigravityImageError("Antigravity Image is disabled by its capability gate", "IMAGE_DISABLED");
	await requireCredential(options.auth, exec.signal);
	const agent = requireAgent(exec);
	const args = parseListArgs(rawArgs);
	let items = collectImages(agent);
	if (args.origin !== "all") items = items.filter((item) => item.origin === args.origin);
	if (args.cursor !== void 0) items = afterCursor(items, args.cursor, args.origin);
	const selected = items.slice(0, args.limit);
	return {
		items: selected,
		...items.length > selected.length && selected.length > 0 ? { nextCursor: encodeCursor(selected[selected.length - 1], args.origin) } : {}
	};
}
function buildImagePayload(prompt, model, credential, referenceParts) {
	const resolved = resolveModelWithTier(model, { cli_first: false });
	if (resolved.isImageModel !== true) throw new AntigravityImageError("The selected Antigravity model is not an image model", "INVALID_ARGS");
	const project = credential.projectId === "inductive-dreamer-qrkws" || !credential.projectId ? void 0 : credential.projectId;
	return {
		...project === void 0 ? {} : { project },
		model: resolved.actualModel,
		request: {
			contents: [{
				role: "user",
				parts: [{ text: prompt }, ...referenceParts]
			}],
			generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
		}
	};
}
function normalizeImageMime(value) {
	const normalized = value.trim().toLowerCase();
	return normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp" || normalized === "image/gif" ? normalized : void 0;
}
function collectInlineData(value) {
	const output = [];
	const visit = (item, depth = 0) => {
		if (output.length >= MAX_IMAGES || depth > 32) return;
		if (Array.isArray(item)) {
			for (const child of item) visit(child, depth + 1);
			return;
		}
		if (!isRecord(item)) return;
		const inline = isRecord(item.inlineData) ? item.inlineData : isRecord(item.inline_data) ? item.inline_data : void 0;
		if (inline !== void 0 && typeof inline.data === "string") {
			const mediaType = inline.mimeType ?? inline.mime_type;
			output.push({
				data: inline.data,
				...typeof mediaType === "string" ? { mediaType } : {}
			});
			return;
		}
		for (const child of Object.values(item)) visit(child, depth + 1);
	};
	visit(value);
	return output;
}
function collectImages(agent) {
	return sessionImageCatalog(agent).map((entry) => ({
		handle: entry.handle,
		attachment: entry.attachment,
		origin: entry.origin,
		seq: entry.sequence
	})).sort((left, right) => right.seq - left.seq || String(right.attachment.attachmentId).localeCompare(String(left.attachment.attachmentId)));
}
function renderGenerate(value) {
	return [
		{
			type: "text",
			text: `Created ${String(value.images.length)} durable image(s): ${value.images.map((item) => item.handle).join(", ")}.`
		},
		...value.references.map((item) => ({
			type: "image",
			attachment: item.attachment
		})),
		...value.images.map((item) => ({
			type: "image",
			attachment: item.attachment
		}))
	];
}
function renderList(value) {
	return [{
		type: "text",
		text: value.items.length === 0 ? "No authorized session images matched." : value.items.map((item) => `${item.handle} (${item.origin})`).join(", ")
	}, ...value.items.map((item) => ({
		type: "image",
		attachment: item.attachment
	}))];
}
/** Mount tools when a ToolRuntime is available; the tool bodies recheck the credential gate. */
function apply(ctx, config = {
	enabled: true,
	model: ANTIGRAVITY_IMAGE_MODEL,
	n: 1
}) {
	if (ctx === void 0) return;
	const candidate = ctx;
	if (candidate.tools === void 0 || candidate.attachments === void 0 || candidate.fs === void 0) return;
	let current = () => config;
	let lifecycle;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE, Config, config, {
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
	const options = {
		auth,
		attachments: candidate.attachments,
		fs: candidate.fs,
		settings: () => current()
	};
	lifecycle = mountCapabilityLifecycle({
		ctx,
		auth,
		id: "image",
		enabled: () => current().enabled,
		register: () => registerCapabilitySet(createAntigravityImageTools(options), (tool) => candidate.tools.register(tool)),
		ownsAuth: auth !== provided,
		label: "antigravity-image: tool lifecycle"
	});
}
async function requireCredential(auth, signal) {
	const credential = await auth.credential(signal);
	if (credential === void 0) throw new AntigravityImageError("Antigravity Image requires a logged-in account", "IMAGE_AUTH_REQUIRED");
	return credential;
}
function requireAgent(exec) {
	if (exec.agent === void 0) throw new AntigravityImageError("Antigravity Image requires an active session", "IMAGE_AGENT_REQUIRED");
	workspaceCwd(exec.agent);
	return exec.agent;
}
function workspaceCwd(agent) {
	const cwd = agent.session.header.cwd;
	if (typeof cwd !== "string" || cwd.length === 0) throw new AntigravityImageError("Antigravity Image requires an active workspace", "IMAGE_WORKSPACE_REQUIRED");
	return cwd;
}
function parseGenerateArgs(value, settings) {
	if (!isRecord(value) || hasExtra(value, [
		"prompt",
		"references",
		"model",
		"n"
	]) || typeof value.prompt !== "string" || value.prompt.trim().length === 0 || value.prompt.length > 16384) throw new AntigravityImageError("generate_image expects a closed prompt object", "INVALID_ARGS");
	const refs = value.references === void 0 ? [] : parseReferences(value.references);
	const model = nonBlank(value.model ?? settings.model);
	const n = integer(value.n ?? settings.n, 1, MAX_IMAGES);
	return {
		prompt: value.prompt.trim().slice(0, 16384),
		references: refs,
		model,
		n
	};
}
function parseReferences(value) {
	if (!Array.isArray(value) || value.length > MAX_REFERENCES) throw new AntigravityImageError("references exceed the bounded limit", "INVALID_ARGS");
	return value.map((item) => {
		if (!isRecord(item) || hasExtra(item, [
			"kind",
			"handle",
			"path"
		]) || typeof item.kind !== "string") throw new AntigravityImageError("reference is invalid", "INVALID_ARGS");
		if (item.kind === "session" && typeof item.handle === "string" && IMAGE_HANDLE_PATTERN.test(item.handle)) return {
			kind: "session",
			handle: item.handle
		};
		if (item.kind === "workspace" && typeof item.path === "string" && item.path.length > 0) return {
			kind: "workspace",
			path: item.path
		};
		throw new AntigravityImageError("reference is invalid", "INVALID_ARGS");
	});
}
function parseListArgs(value) {
	if (!isRecord(value) || hasExtra(value, [
		"limit",
		"cursor",
		"origin"
	])) throw new AntigravityImageError("list_images expects a closed object", "INVALID_ARGS");
	const limit = value.limit === void 0 ? 5 : integer(value.limit, 1, 20);
	const cursor = value.cursor === void 0 ? void 0 : nonBlank(value.cursor);
	const origin = value.origin === void 0 ? "all" : enumValue(value.origin, IMAGE_ORIGINS);
	return {
		limit,
		...cursor === void 0 ? {} : { cursor },
		origin
	};
}
function afterCursor(items, cursor, origin) {
	let value;
	try {
		value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
	} catch {
		throw new AntigravityImageError("The image cursor is invalid", "IMAGE_CURSOR_INVALID");
	}
	if (!isRecord(value) || Object.keys(value).length !== 3 || hasExtra(value, [
		"id",
		"seq",
		"origin"
	]) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 256 || !Number.isSafeInteger(value.seq) || value.origin !== origin) throw new AntigravityImageError("The image cursor is invalid", "IMAGE_CURSOR_INVALID");
	const index = items.findIndex((item) => item.seq === value.seq && String(item.attachment.attachmentId) === value.id);
	if (index < 0) throw new AntigravityImageError("The image cursor is stale", "IMAGE_CURSOR_INVALID");
	return items.slice(index + 1);
}
function encodeCursor(item, origin) {
	return Buffer.from(JSON.stringify({
		id: String(item.attachment.attachmentId),
		seq: item.seq,
		origin
	})).toString("base64url");
}
function isAuthService(value) {
	return isRecord(value) && typeof value.credential === "function" && typeof value.status === "function";
}
function imageRequestWarning(code) {
	if (code === "IMAGE_AUTH_REQUIRED") return "IMAGE_REQUEST_UNAUTHENTICATED";
	if (code === "IMAGE_RATE_LIMITED") return "IMAGE_REQUEST_RATE_LIMITED";
	if (code === "IMAGE_TIMEOUT") return "IMAGE_REQUEST_TIMEOUT";
	if (code === "IMAGE_PROTOCOL_DRIFT") return "IMAGE_REQUEST_PROTOCOL_DRIFT";
	return "IMAGE_REQUEST_FAILED";
}
const IMAGE_FAILURE_CODES = {
	authentication: "IMAGE_AUTH_REQUIRED",
	forbidden: "IMAGE_FORBIDDEN",
	"rate-limited": "IMAGE_RATE_LIMITED",
	cancelled: "IMAGE_CANCELLED",
	timeout: "IMAGE_TIMEOUT",
	"attribution-rejected": "IMAGE_PROTOCOL_DRIFT",
	"protocol-drift": "IMAGE_PROTOCOL_DRIFT",
	"response-limit": "IMAGE_PROTOCOL_DRIFT",
	"request-limit": "IMAGE_PROTOCOL_DRIFT",
	upstream: "IMAGE_FAILED",
	network: "IMAGE_FAILED",
	failed: "IMAGE_FAILED"
};
function toImageError(error) {
	if (error instanceof AntigravityImageError) return error;
	if (error instanceof PrivateTransportError) return new AntigravityImageError("The Antigravity Image request failed safely", IMAGE_FAILURE_CODES[classifyPrivateFailure(error)]);
	return new AntigravityImageError("The Antigravity Image request failed safely", "IMAGE_FAILED");
}
function hasExtra(value, allowed) {
	return Object.keys(value).some((key) => !allowed.includes(key));
}
function nonBlank(value) {
	if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
	return value.trim();
}
function integer(value, min, max) {
	if (!Number.isSafeInteger(value) || value < min || value > max) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
	return value;
}
function enumValue(value, values) {
	if (typeof value !== "string" || !values.includes(value)) throw new AntigravityImageError("The image option is invalid", "INVALID_ARGS");
	return value;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { ANTIGRAVITY_IMAGE_ENDPOINT, ANTIGRAVITY_IMAGE_MODEL, ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE, AntigravityImageError, Config, GENERATE_IMAGE_TOOL_NAME, LIST_IMAGES_TOOL_NAME, apply, createAntigravityImageTools, inject, name };

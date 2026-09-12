import { t as isBoundedSafeText } from "./safe-text-AlEyN8q_.js";
import { Buffer } from "node:buffer";
import { HarnessError } from "@deepseek-ai/dsh-llm";
//#region src/media-admission.ts
/** Shared Host-only media admission for image editing and the video POC. */
const DEFAULT_VIDEO_BYTES = 33554432;
const DEFAULT_INLINE_IMAGE_BYTES = 20971520;
const IMAGE_HANDLE_PATTERN = /^image:[^\s\p{C}]{1,256}$/u;
var MediaAdmissionError = class extends HarnessError {
	constructor(message, code, options = {}) {
		super(message, code, options);
	}
};
function imageHandle(ref) {
	return `image:${String(ref.attachmentId)}`;
}
/** Admit bounded, canonical image bytes and let AttachmentStore perform full decode validation. */
async function admitImageBytes(options, data, source, name = "antigravity-image", signal) {
	throwIfAborted(signal);
	const limits = options.attachments.imageLimits;
	if (data.byteLength === 0 || data.byteLength > limits.maxImageBytes) throw new MediaAdmissionError("The image exceeds the deployment byte limit", "MEDIA_IMAGE_TOO_LARGE");
	const mediaType = detectImageMediaType(data);
	if (mediaType === void 0 || !limits.mediaTypes.includes(mediaType)) throw new MediaAdmissionError("The image media type or magic bytes are not supported", "MEDIA_IMAGE_INVALID");
	const input = {
		data,
		mediaType,
		name: safeName(name)
	};
	try {
		await options.attachments.validateImage(input);
	} catch {
		throw new MediaAdmissionError("The image failed AttachmentStore admission", "MEDIA_IMAGE_INVALID");
	}
	return {
		kind: "image",
		input,
		source
	};
}
async function admitBase64Image(options, encoded, source = "inline", name, signal) {
	const maxEncoded = Math.ceil(options.attachments.imageLimits.maxImageBytes / 3) * 4 + 4;
	if (encoded.length === 0 || encoded.length > maxEncoded || !isCanonicalBase64(encoded)) throw new MediaAdmissionError("The encoded image is not bounded canonical base64", "MEDIA_IMAGE_INVALID");
	let data;
	try {
		data = new Uint8Array(Buffer.from(encoded, "base64"));
	} catch {
		throw new MediaAdmissionError("The encoded image could not be decoded", "MEDIA_IMAGE_INVALID");
	}
	return admitImageBytes(options, data, source, name, signal);
}
/** Resolve one explicit session handle from durable session history; handles are not bearer capabilities. */
async function admitSessionImage(options, agent, handle, signal) {
	throwIfAborted(signal);
	if (!IMAGE_HANDLE_PATTERN.test(handle)) throw new MediaAdmissionError("The image handle is invalid", "MEDIA_HANDLE_INVALID");
	const ref = authorizedSessionImages(agent).get(handle);
	if (ref === void 0) throw new MediaAdmissionError("The image handle is not authorized by this session", "MEDIA_HANDLE_UNAUTHORIZED");
	try {
		const stored = await options.attachments.readImage(ref, signal);
		return {
			kind: "image",
			input: {
				data: stored.data,
				mediaType: stored.ref.mediaType,
				...stored.ref.name === void 0 ? {} : { name: stored.ref.name }
			},
			stored,
			source: "session"
		};
	} catch {
		throw new MediaAdmissionError("The authorized image could not be read", "MEDIA_IMAGE_READ_FAILED");
	}
}
/** Resolve an image only after containment and regular-file checks, then admit its bytes. */
async function admitWorkspaceImage(options, workspace, path, signal) {
	throwIfAborted(signal);
	if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) throw new MediaAdmissionError("The workspace image reference is invalid", "MEDIA_WORKSPACE_INVALID");
	return admitImageBytes(options, await readStableWorkspaceBytes(options.fs, workspace, path, options.attachments.imageLimits.maxImageBytes, "image", signal), "workspace", basename(path), signal);
}
/** Admit an MP4 container without claiming native video attachment support. */
async function admitWorkspaceVideo(options, workspace, path, signal) {
	throwIfAborted(signal);
	if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) throw new MediaAdmissionError("The workspace video reference is invalid", "MEDIA_VIDEO_INVALID");
	const maxBytes = positive(options.maxVideoBytes, DEFAULT_VIDEO_BYTES);
	const data = await readStableWorkspaceBytes(options.fs, workspace, path, maxBytes, "video", signal);
	if (data.byteLength === 0 || data.byteLength > maxBytes || !isMp4(data)) throw new MediaAdmissionError("The workspace file is not a bounded MP4 video", "MEDIA_VIDEO_INVALID");
	return {
		kind: "video",
		data,
		mediaType: "video/mp4"
	};
}
async function readStableWorkspaceBytes(fs, workspace, path, maxBytes, kind, signal) {
	const symlinkCode = kind === "image" ? "MEDIA_WORKSPACE_SYMLINK" : "MEDIA_VIDEO_SYMLINK";
	const regularCode = kind === "image" ? "MEDIA_WORKSPACE_NOT_REGULAR" : "MEDIA_VIDEO_NOT_REGULAR";
	const containmentCode = kind === "image" ? "MEDIA_WORKSPACE_CONTAINMENT" : "MEDIA_VIDEO_CONTAINMENT";
	const changedCode = kind === "image" ? "MEDIA_WORKSPACE_CHANGED" : "MEDIA_VIDEO_CHANGED";
	const initialPath = await fs.lstat(path, { cwd: workspace }, signal);
	if (initialPath?.type === "symlink") throw new MediaAdmissionError(`The workspace ${kind} is a symbolic link`, symlinkCode);
	if (initialPath === void 0 || initialPath.type !== "file") throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode);
	const root = await fs.resolve(workspace, fsResolveOptions(workspace, signal));
	const target = await fs.resolve(path, fsResolveOptions(workspace, signal));
	if (!fs.contains(root, target)) throw new MediaAdmissionError(`The workspace ${kind} is outside the active workspace`, containmentCode);
	const before = await fs.stat(target, signal);
	if (before === void 0 || before.type !== "file") throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode);
	if (before.version !== initialPath.version) throw new MediaAdmissionError(`The workspace ${kind} changed before it could be read`, changedCode);
	const data = await fs.readBytes(target, signal, maxBytes);
	const finalPath = await fs.lstat(path, { cwd: workspace }, signal);
	const finalTarget = await fs.resolve(path, fsResolveOptions(workspace, signal));
	const after = await fs.stat(target, signal);
	if (finalPath === void 0 || finalPath.type !== "file" || finalPath.version !== initialPath.version || finalTarget.targetKey !== target.targetKey || !fs.contains(root, finalTarget) || after === void 0 || after.type !== "file" || after.version !== before.version) throw new MediaAdmissionError(`The workspace ${kind} changed while it was being read`, changedCode);
	return data;
}
function detectImageMediaType(data) {
	if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return "image/png";
	if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
	if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
	if (data.length >= 6 && (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a")) return "image/gif";
}
function isMp4(data) {
	return data.length >= 12 && ascii(data, 4, 8) === "ftyp";
}
/** Traverse durable session history once for both authorization and image listing. */
function sessionImageCatalog(agent) {
	const result = /* @__PURE__ */ new Map();
	const visited = /* @__PURE__ */ new WeakSet();
	let sequence = 0;
	let visitedNodes = 0;
	const visit = (value, origin, depth = 0) => {
		if (typeof value !== "object" || value === null || depth > 64 || visitedNodes >= 1e4 || visited.has(value)) return;
		visited.add(value);
		visitedNodes += 1;
		if (Array.isArray(value)) {
			for (const nested of value) visit(nested, origin, depth + 1);
			return;
		}
		if (!isRecord(value)) return;
		const attachment = value.type === "image" ? parseImageRef(value.attachment) : void 0;
		if (attachment !== void 0) {
			const handle = imageHandle(attachment);
			if (!result.has(handle)) result.set(handle, {
				handle,
				attachment,
				origin,
				sequence: sequence++
			});
		}
		if (value.type === "tool-result" && Array.isArray(value.content)) visit(value.content, origin, depth + 1);
	};
	for (const event of agent.session.snapshotEvents()) {
		const rawEvent = event;
		if (!isRecord(rawEvent) || !isRecord(rawEvent.data)) continue;
		if (rawEvent.type === "user/message") visit(rawEvent.data.content, "user");
		else if (rawEvent.type === "assistant/message" && isRecord(rawEvent.data.message)) visit(rawEvent.data.message.content, "reference");
		else if (rawEvent.type === "tool/result" && isRecord(rawEvent.data.message)) visit(rawEvent.data.message.content, "generated");
	}
	return [...result.values()];
}
function authorizedSessionImages(agent) {
	return new Map(sessionImageCatalog(agent).map((entry) => [entry.handle, entry.attachment]));
}
function parseImageRef(value) {
	if (!isRecord(value) || !isBoundedSafeText(value.attachmentId, 256) || value.mediaType !== "image/png" && value.mediaType !== "image/jpeg" && value.mediaType !== "image/webp" && value.mediaType !== "image/gif" || !isPositiveSafeInteger(value.bytes, 1073741824) || !isPositiveSafeInteger(value.width, 1e6) || !isPositiveSafeInteger(value.height, 1e6)) return void 0;
	const name = typeof value.name === "string" && isBoundedSafeText(value.name, 256) ? safeName(value.name) : void 0;
	return {
		attachmentId: value.attachmentId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		...name === void 0 ? {} : { name }
	};
}
function isPositiveSafeInteger(value, max) {
	return Number.isSafeInteger(value) && value > 0 && value <= max;
}
function isCanonicalBase64(value) {
	return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}
function safeName(value) {
	const base = [...basename(value)].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "/" || character === "\\" ? "_" : character).join("").slice(0, 256);
	return base.length > 0 ? base : "antigravity-image";
}
function basename(value) {
	const normalized = value.replaceAll("\\", "/");
	return normalized.slice(normalized.lastIndexOf("/") + 1);
}
function fsResolveOptions(cwd, signal) {
	return signal === void 0 ? { cwd } : {
		cwd,
		signal
	};
}
function ascii(data, start, end) {
	return String.fromCharCode(...data.slice(start, end));
}
function positive(value, fallback) {
	return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 134217728);
}
function throwIfAborted(signal) {
	if (signal !== void 0 && signal.aborted) throw new MediaAdmissionError("Media admission was cancelled", "MEDIA_CANCELLED");
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { DEFAULT_INLINE_IMAGE_BYTES, DEFAULT_VIDEO_BYTES, IMAGE_HANDLE_PATTERN, MediaAdmissionError, admitBase64Image, admitImageBytes, admitSessionImage, admitWorkspaceImage, admitWorkspaceVideo, detectImageMediaType, imageHandle, isMp4, sessionImageCatalog };

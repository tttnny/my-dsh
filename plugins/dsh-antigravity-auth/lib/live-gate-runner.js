import { t as isBoundedSafeText } from "./safe-text-AlEyN8q_.js";
import { _ as defaultAuthStorePath, c as defaultCapabilityGatePath, i as createAntigravityAuthService, o as createFileCapabilityGates } from "./capability-lifecycle-DPNblVcJ.js";
import { ANTIGRAVITY_PROVIDER, AntigravityAdapter } from "./llm-adapter.js";
import { AntigravitySearchProvider } from "./search.js";
import { ANTIGRAVITY_IMAGE_MODEL, createAntigravityImageTools } from "./image.js";
import { ANTIGRAVITY_VIDEO_MODEL, createAntigravityVideoTools } from "./video.js";
import { createHash, randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";
//#region src/live-gate-auth.ts
const AUTH_WAIT_MS = 6e5;
const POLL_MS = 250;
async function runAuthGate(auth, output) {
	await auth.acknowledgeRisk();
	const started = await auth.startLogin();
	output(JSON.stringify({
		gate: "A",
		action: "open-authorization",
		authorizationUrl: started.authorizationUrl
	}));
	const deadline = Date.now() + AUTH_WAIT_MS;
	while (Date.now() < deadline) {
		const status = await auth.status();
		if (status.login.phase === "success") return {
			gate: "A",
			outcome: await auth.credential(void 0, { forceRefresh: true }) === void 0 ? "unauthenticated" : "passed"
		};
		if (status.login.phase === "failed" || status.login.phase === "cancelled" || status.login.phase === "expired") return {
			gate: "A",
			outcome: status.login.phase === "cancelled" ? "cancelled" : "failed"
		};
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	await auth.cancelLogin();
	return {
		gate: "A",
		outcome: "cancelled"
	};
}
//#endregion
//#region src/live-gate-attachments.ts
/** Durable, content-addressed AttachmentStore seam used only by explicitly run Gate I. */
const MAX_LIVE_IMAGE_BYTES = 20971520;
const MAX_LIVE_IMAGE_DIMENSION = 16384;
const MAX_LIVE_IMAGE_PIXELS = 16777216;
const MAX_DECODED_IMAGE_BYTES = 67108864;
const ID_PREFIX = "live-sha256-";
const PNG_SIGNATURE = Uint8Array.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
/** Create a persistent, owner-only PNG store for controlled live image fixtures. */
function createDurableLiveAttachmentStore(root, options = {}) {
	const platform = options.platform ?? process.platform;
	const imageLimits = Object.freeze({
		maxImageBytes: MAX_LIVE_IMAGE_BYTES,
		maxImagesPerMessage: 2,
		maxMessageImageBytes: MAX_LIVE_IMAGE_BYTES * 2,
		maxImagePixels: MAX_LIVE_IMAGE_PIXELS,
		maxImageDimension: MAX_LIVE_IMAGE_DIMENSION,
		mediaTypes: Object.freeze(["image/png"])
	});
	const validateImage = async (input) => {
		inspectPng(input);
	};
	const saveImage = async (input) => {
		const dimensions = inspectPng(input);
		await ensureRoot(root);
		const data = Uint8Array.from(input.data);
		const digest = createHash("sha256").update(data).digest("hex");
		const target = join(root, `${digest}.png`);
		const temporary = join(root, `.${digest}.${process.pid}.${randomUUID()}.tmp`);
		try {
			await writeFile(temporary, data, {
				flag: "wx",
				mode: 384
			});
			try {
				await link(temporary, target);
			} catch (error) {
				if (error.code !== "EEXIST") throw error;
				const existing = await readBounded(target, platform);
				if (createHash("sha256").update(existing).digest("hex") !== digest) throw new Error("collision");
			}
			await chmod(target, 384);
		} catch {
			throw admissionError();
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
		return {
			attachmentId: `${ID_PREFIX}${digest}`,
			mediaType: "image/png",
			bytes: data.byteLength,
			width: dimensions.width,
			height: dimensions.height,
			...input.name === void 0 ? {} : { name: safeName(input.name) }
		};
	};
	const readImage = async (ref, signal) => {
		signal?.throwIfAborted();
		const id = String(ref.attachmentId);
		const digest = id.startsWith(ID_PREFIX) ? id.slice(12) : "";
		if (!/^[a-f0-9]{64}$/u.test(digest) || ref.mediaType !== "image/png") throw admissionError();
		let data;
		try {
			data = await readBounded(join(root, `${digest}.png`), platform);
		} catch {
			throw admissionError();
		}
		signal?.throwIfAborted();
		if (createHash("sha256").update(data).digest("hex") !== digest) throw admissionError();
		const dimensions = inspectPng({
			data,
			mediaType: "image/png"
		});
		if (ref.bytes !== data.byteLength || ref.width !== dimensions.width || ref.height !== dimensions.height) throw admissionError();
		return {
			ref: { ...ref },
			data: Uint8Array.from(data)
		};
	};
	return {
		imageLimits,
		validateImage,
		saveImage,
		saveImages: async (inputs) => {
			for (const input of inputs) await validateImage(input);
			const output = [];
			for (const input of inputs) output.push(await saveImage(input));
			return output;
		},
		readImage
	};
}
function inspectPng(input) {
	try {
		return decodePng(input);
	} catch {
		throw admissionError();
	}
}
function decodePng(input) {
	const data = input.data;
	if (input.mediaType !== "image/png" || data.byteLength < 57 || data.byteLength > MAX_LIVE_IMAGE_BYTES) throw new Error("invalid PNG");
	for (let index = 0; index < PNG_SIGNATURE.length; index += 1) if (data[index] !== PNG_SIGNATURE[index]) throw new Error("invalid PNG signature");
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	let offset = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let channels = 0;
	let sawHeader = false;
	let sawData = false;
	let sawEnd = false;
	const compressed = [];
	while (offset < data.byteLength) {
		if (offset + 12 > data.byteLength) throw new Error("truncated PNG chunk");
		const length = view.getUint32(offset);
		const typeOffset = offset + 4;
		const payloadOffset = offset + 8;
		const end = payloadOffset + length;
		if (length > MAX_LIVE_IMAGE_BYTES || end + 4 > data.byteLength) throw new Error("oversized PNG chunk");
		const type = String.fromCharCode(data[typeOffset], data[typeOffset + 1], data[typeOffset + 2], data[typeOffset + 3]);
		if (!/^[A-Za-z]{4}$/u.test(type) || view.getUint32(end) !== crc32(data.subarray(typeOffset, end))) throw new Error("invalid PNG chunk");
		const payload = data.subarray(payloadOffset, end);
		if (!sawHeader && type !== "IHDR") throw new Error("missing PNG header");
		if (type === "IHDR") {
			if (sawHeader || length !== 13) throw new Error("duplicate PNG header");
			width = view.getUint32(payloadOffset);
			height = view.getUint32(payloadOffset + 4);
			const bitDepth = data[payloadOffset + 8];
			const colorType = data[payloadOffset + 9];
			if (bitDepth !== 8 || colorType !== 2 && colorType !== 6 || data[payloadOffset + 10] !== 0 || data[payloadOffset + 11] !== 0 || data[payloadOffset + 12] !== 0) throw new Error("unsupported PNG encoding");
			channels = colorType === 6 ? 4 : 3;
			if (width < 1 || height < 1 || width > MAX_LIVE_IMAGE_DIMENSION || height > MAX_LIVE_IMAGE_DIMENSION || width * height > MAX_LIVE_IMAGE_PIXELS) throw new Error("invalid PNG dimensions");
			sawHeader = true;
		} else if (type === "IDAT") {
			if (!sawHeader || sawEnd || length === 0) throw new Error("invalid PNG data");
			sawData = true;
			compressed.push(payload);
		} else if (type === "IEND") {
			if (!sawData || sawEnd || length !== 0 || end + 4 !== data.byteLength) throw new Error("invalid PNG end");
			sawEnd = true;
		} else if (type[0] === type[0]?.toUpperCase() && type !== "PLTE") throw new Error("unknown critical PNG chunk");
		offset = end + 4;
	}
	if (!sawHeader || !sawData || !sawEnd || offset !== data.byteLength) throw new Error("incomplete PNG");
	const rowBytes = width * channels;
	const decodedBytes = (rowBytes + 1) * height;
	if (!Number.isSafeInteger(decodedBytes) || decodedBytes > MAX_DECODED_IMAGE_BYTES) throw new Error("oversized decoded PNG");
	const decoded = inflateSync(Buffer.concat(compressed.map((part) => Buffer.from(part))), { maxOutputLength: decodedBytes + 1 });
	if (decoded.byteLength !== decodedBytes) throw new Error("invalid decoded PNG length");
	for (let row = 0; row < height; row += 1) if (decoded[row * (rowBytes + 1)] > 4) throw new Error("invalid PNG row filter");
	return {
		width,
		height
	};
}
function crc32(data) {
	let crc = 4294967295;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
	}
	return (crc ^ 4294967295) >>> 0;
}
async function ensureRoot(root) {
	try {
		await mkdir(root, {
			recursive: true,
			mode: 448
		});
		const info = await lstat(root);
		if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("unsafe root");
		await chmod(root, 448);
	} catch {
		throw admissionError();
	}
}
async function readBounded(path, platform) {
	const info = await lstat(path);
	const unsafePosixMode = platform !== "win32" && (info.mode & 63) !== 0;
	if (info.isSymbolicLink() || !info.isFile() || info.size < 1 || info.size > MAX_LIVE_IMAGE_BYTES || unsafePosixMode) throw admissionError();
	const data = await readFile(path);
	if (data.byteLength !== info.size) throw admissionError();
	return data;
}
function safeName(value) {
	const name = value.replaceAll("\\", "/").split("/").at(-1)?.slice(0, 128);
	return name !== void 0 && isBoundedSafeText(name, 128) ? name : "live-gate-output.png";
}
function admissionError() {
	return /* @__PURE__ */ new Error("The live image output could not be admitted durably");
}
//#endregion
//#region src/live-gate-image.ts
async function runImageGate(auth, attachmentRoot) {
	const attachments = createDurableLiveAttachmentStore(attachmentRoot);
	const events = [];
	const context = {
		agent: { session: {
			header: { cwd: process.cwd() },
			events
		} },
		signal: new AbortController().signal
	};
	const tool = createAntigravityImageTools({
		auth,
		attachments,
		fs: createUnavailableFileSystem(),
		settings: () => ({
			enabled: true,
			model: ANTIGRAVITY_IMAGE_MODEL,
			n: 1
		})
	})[0];
	if (tool === void 0) throw new Error("The image gate tool is unavailable");
	const reference = (await tool.execute({
		prompt: "A single small blue circle on a plain white background.",
		n: 1
	}, context)).images[0];
	if (reference === void 0) throw new Error("The image generation gate returned no image");
	events.push({
		type: "tool/result",
		data: { message: { content: [{
			type: "image",
			attachment: reference.attachment
		}] } }
	});
	const edited = await tool.execute({
		prompt: "Keep the image simple and change the blue circle to green.",
		references: [{
			kind: "session",
			handle: reference.handle
		}],
		n: 1
	}, context);
	if (edited.images.length === 0 || edited.references.length !== 1) throw new Error("The image edit gate returned no admitted output");
	await auth.recordCapabilityGate("image", "passed");
	return {
		gate: "I",
		outcome: "passed"
	};
}
function createUnavailableFileSystem() {
	const unavailable = async () => {
		throw new Error("Workspace media is unavailable in Gate I");
	};
	return {
		resolve: unavailable,
		contains: () => false,
		readBytes: unavailable,
		lstat: unavailable,
		stat: unavailable
	};
}
//#endregion
//#region src/live-gate-outcome.ts
const CAPABILITY_BY_GATE = Object.freeze({
	S: "search",
	I: "image",
	V: "video"
});
async function recordGateFailure(auth, gate, outcome, family) {
	if (gate === "0L") {
		if (family === void 0) await auth.recordGate0(outcome);
		else await auth.recordLlmFamilyGate(family, outcome);
		return;
	}
	const id = CAPABILITY_BY_GATE[gate];
	if (id !== void 0) await auth.recordCapabilityGate(id, outcome);
}
function classifyGate0Outcome(error) {
	const code = errorCode(error);
	if (code === "GATE_0_ATTRIBUTION" || code.includes("ATTRIBUTION_REJECTED")) return "attribution-rejected";
	return classifyOutcome(error);
}
function classifyOutcome(error) {
	const code = errorCode(error);
	if (code === "GATE_0_ATTRIBUTION" || code.includes("ATTRIBUTION_REJECTED")) return "attribution-rejected";
	if (code.includes("AUTH") || code.includes("GRANT") || code.includes("LOGIN")) return "unauthenticated";
	if (code.includes("RATE") || code.includes("RESOURCE_EXHAUSTED")) return "rate-limited";
	if (code.includes("CANCEL") || code.includes("ABORT")) return "cancelled";
	if (code.includes("UNSUPPORTED_VIDEO") || code.includes("VIDEO_UNSUPPORTED")) return "unsupported-video";
	if (code.includes("PROTOCOL") || code.includes("MALFORMED") || code.includes("RESPONSE")) return "protocol-drift";
	return "failed";
}
function errorCode(error) {
	return typeof error === "object" && error !== null && "code" in error ? String(error.code).toUpperCase() : "";
}
//#endregion
//#region src/live-gate-llm.ts
const LIVE_TEXT_MODEL = "antigravity-gemini-3.7-flash";
const LIVE_TEXT_MODEL_BY_FAMILY = Object.freeze({
	gemini: LIVE_TEXT_MODEL,
	claude: "antigravity-claude-sonnet-4-6-thinking",
	"gpt-oss": "antigravity-gpt-oss-120b-medium"
});
async function runLlmGate(auth, gates, family, adapter = new AntigravityAdapter({ auth })) {
	if (family === void 0) await gates.clear();
	const model = family === void 0 ? LIVE_TEXT_MODEL : LIVE_TEXT_MODEL_BY_FAMILY[family];
	try {
		const chunks = [];
		for await (const chunk of adapter.stream(minimalGenerateOptions(model))) chunks.push(chunk);
		const finish = chunks.at(-1);
		if (finish?.type !== "finish") throw new Error("The live text gate did not finish normally");
		if (finish.reason.kind === "error" || finish.reason.kind === "aborted") throw Object.assign(/* @__PURE__ */ new Error("The live text gate did not finish normally"), { code: finish.reason.failure.code });
		if (!chunks.some((chunk) => chunk.type === "text-delta" || chunk.type === "reasoning-delta" || chunk.type === "block-end")) throw new Error("The live text gate returned no content");
	} catch (error) {
		const outcome = classifyGate0Outcome(error);
		if (family === void 0) await auth.recordGate0(outcome);
		else await auth.recordLlmFamilyGate(family, outcome);
		return {
			gate: "0L",
			outcome
		};
	}
	if (family === void 0) await auth.recordGate0("passed");
	else await auth.recordLlmFamilyGate(family, "passed");
	return {
		gate: "0L",
		outcome: "passed"
	};
}
function minimalGenerateOptions(model) {
	return {
		provider: ANTIGRAVITY_PROVIDER,
		model,
		messages: [{
			id: "antigravity-live-gate-message",
			role: "user",
			source: { kind: "user" },
			content: [{
				type: "text",
				text: "Reply with exactly: OK"
			}]
		}]
	};
}
//#endregion
//#region src/live-gate-search.ts
async function runSearchGate(auth) {
	if ((await new AntigravitySearchProvider({
		auth,
		settings: () => ({
			enabled: true,
			model: "antigravity-gemini-3.7-flash",
			maxResults: 3
		})
	}).search({
		query: "What is the official Google domain?",
		maxResults: 3
	})).sources.length === 0) throw new Error("The grounded search gate returned no sources");
	await auth.recordCapabilityGate("search", "passed");
	return {
		gate: "S",
		outcome: "passed"
	};
}
//#endregion
//#region src/live-gate-video.ts
/** Controlled pixel-fact verification for explicit live Gate V. */
const LIVE_VIDEO_BYTES = 33554432;
const LIVE_VIDEO_QUESTION = "What exact uppercase word is visibly shown in the center of the video? Reply with that word only.";
const LIVE_VIDEO_EXPECTED_ANSWER = "KUMQUAT";
async function runVideoGate(auth, options) {
	if (options.videoFile === void 0) return {
		gate: "V",
		outcome: "failed"
	};
	const absolute = resolve(options.videoFile);
	const workspace = dirname(absolute);
	const path = relative(workspace, absolute);
	const context = {
		agent: { session: {
			header: { cwd: workspace },
			events: []
		} },
		signal: new AbortController().signal
	};
	const tool = createAntigravityVideoTools({
		auth,
		fs: createNodeFileSystem(workspace),
		settings: () => ({
			enabled: true,
			model: ANTIGRAVITY_VIDEO_MODEL,
			maxBytes: LIVE_VIDEO_BYTES
		})
	})[0];
	if (tool === void 0) throw new Error("The video gate tool is unavailable");
	if (!isDeterministicVideoAnswer((await tool.execute({
		path,
		prompt: "What exact uppercase word is visibly shown in the center of the video? Reply with that word only."
	}, context)).text)) throw new Error("The video gate did not verify the fixture pixel fact");
	await auth.recordCapabilityGate("video", "passed");
	return {
		gate: "V",
		outcome: "passed"
	};
}
function isDeterministicVideoAnswer(value) {
	return typeof value === "string" && value === "KUMQUAT";
}
function createNodeFileSystem(workspace) {
	const target = (path) => ({
		targetKey: path,
		displayPath: path
	});
	const resolveTarget = async (path, options) => {
		const absolute = isAbsolute(path) ? path : join(options?.cwd ?? workspace, path);
		return target(await realpath(absolute));
	};
	const version = (value) => `${String(value.dev)}:${String(value.ino)}:${String(value.size)}:${String(value.mtimeMs)}`;
	return {
		resolve: resolveTarget,
		contains: (parent, child) => {
			const childRelative = relative(String(parent.targetKey), String(child.targetKey));
			return childRelative === "" || !childRelative.startsWith("..") && !isAbsolute(childRelative);
		},
		lstat: async (path, options) => {
			const absolute = isAbsolute(path) ? path : join(options?.cwd ?? workspace, path);
			const info = await lstat(absolute, { bigint: true });
			return {
				type: info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : info.isDirectory() ? "directory" : "other",
				version: version(info),
				size: Number(info.size)
			};
		},
		stat: async (value) => {
			const info = await stat(String(value.targetKey), { bigint: true });
			return {
				type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other",
				version: version(info),
				size: Number(info.size)
			};
		},
		readBytes: async (value, signal, maxBytes) => {
			signal?.throwIfAborted();
			if ((await stat(String(value.targetKey))).size > maxBytes) throw new Error("Fixture exceeds gate bound");
			const data = await readFile(String(value.targetKey));
			signal?.throwIfAborted();
			if (data.byteLength > maxBytes) throw new Error("Fixture exceeds gate bound");
			return new Uint8Array(data);
		}
	};
}
//#endregion
//#region src/live-gate-runner.ts
/** Small production dispatcher for explicitly authorized, one-at-a-time live gates. */
function createProductionLiveGateRunner(options = {}) {
	const authPath = defaultAuthStorePath();
	const gates = options.gates ?? createFileCapabilityGates(defaultCapabilityGatePath(authPath));
	const auth = options.auth ?? createAntigravityAuthService({
		storePath: authPath,
		gates
	});
	const ownsAuth = options.auth === void 0;
	const output = options.output ?? (() => {});
	const attachmentRoot = options.attachmentRoot ?? join(dirname(authPath), "live-gate-attachments");
	return {
		run: async (gate, runOptions) => {
			try {
				if (gate === "A") return await runAuthGate(auth, output);
				if (gate === "0L") {
					if (runOptions.llmFamily !== void 0 && !await auth.gate0Passed()) return {
						gate,
						outcome: "failed"
					};
					return await runLlmGate(auth, gates, runOptions.llmFamily);
				}
				if (!await auth.gate0Passed()) {
					await recordGateFailure(auth, gate, "failed");
					return {
						gate,
						outcome: "failed"
					};
				}
				if (gate === "S") return await runSearchGate(auth);
				if (gate === "I") return await runImageGate(auth, attachmentRoot);
				return await runVideoGate(auth, runOptions);
			} catch (error) {
				const outcome = gate === "0L" ? classifyGate0Outcome(error) : classifyOutcome(error);
				await recordGateFailure(auth, gate, outcome, runOptions.llmFamily).catch(() => {});
				return {
					gate,
					outcome
				};
			}
		},
		dispose: async () => {
			if (ownsAuth) await auth.dispose();
		}
	};
}
//#endregion
export { LIVE_TEXT_MODEL, LIVE_TEXT_MODEL_BY_FAMILY, LIVE_VIDEO_EXPECTED_ANSWER, LIVE_VIDEO_QUESTION, classifyGate0Outcome, createProductionLiveGateRunner, isDeterministicVideoAnswer, runLlmGate };

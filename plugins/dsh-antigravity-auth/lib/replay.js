//#region src/replay.ts
const ANTIGRAVITY_REPLAY_VERSION = 1;
const MAX_SIGNATURE_LENGTH = 16384;
const MAX_BLOCKS = 128;
/** Keep only provider-issued signatures and bounded response facts. */
function createReplayState(model, family, finish, blocks) {
	const boundedBlocks = blocks.slice(0, MAX_BLOCKS).map((block) => {
		const signature = safeSignature(block.signature);
		return {
			kind: block.kind,
			...signature === void 0 ? {} : { signature }
		};
	});
	const boundedFinish = safeFinish(finish);
	return {
		response: {
			version: 1,
			provider: "google-antigravity",
			model: model.slice(0, 256),
			family,
			...boundedFinish === void 0 ? {} : { finish: boundedFinish }
		},
		blocks: boundedBlocks
	};
}
/** Validate replay metadata before it can affect a later private request. */
function compatibleReplayState(message, provider, model, blockKinds) {
	if (provider !== "google-antigravity" || message.role !== "assistant") return void 0;
	const provenance = isRecord(message.source) ? message.source : void 0;
	if (provenance !== void 0 && provenance.kind === "model" && (provenance.provider !== provider || provenance.model !== model)) return void 0;
	const value = isRecord(provenance?.replayState) ? provenance.replayState : isRecord(message.replayState) ? message.replayState : void 0;
	if (!isRecord(value) || !isRecord(value.response) || !Array.isArray(value.blocks)) return void 0;
	const family = value.response.family;
	if (value.response.version !== 1 || value.response.provider !== provider || value.response.model !== model || !isFamily(family) || value.blocks.length > MAX_BLOCKS) return void 0;
	const blocks = [];
	for (const item of value.blocks) {
		if (!isRecord(item) || typeof item.kind !== "string") continue;
		const kind = item.kind;
		const signature = typeof item.signature === "string" && safeSignature(item.signature) !== void 0 ? item.signature : void 0;
		blocks.push({
			kind,
			...signature === void 0 ? {} : { signature }
		});
	}
	if (blockKinds !== void 0 && (blocks.length !== blockKinds.length || blocks.some((block, index) => block.kind !== blockKinds[index]))) return void 0;
	const finish = value.response.finish === void 0 ? void 0 : safeFinish(value.response.finish);
	if (value.response.finish !== void 0 && finish === void 0) return void 0;
	return {
		response: {
			version: 1,
			provider: "google-antigravity",
			model,
			family,
			...finish === void 0 ? {} : { finish }
		},
		blocks
	};
}
/** Return the block family without allowing a model alias to cross families. */
function antigravityModelFamily(model) {
	const value = model.toLowerCase();
	if (value.includes("gemini")) return "gemini";
	if (value.includes("claude")) return "claude";
	if (value.includes("gpt-oss")) return "gpt-oss";
	return "unknown";
}
/** Convert DSH schemas to the small function-declaration subset accepted privately. */
function sanitizeToolSchemas(tools) {
	if (tools === void 0) return [];
	return tools.slice(0, 64).map((tool) => ({
		name: boundedName(tool.name),
		description: boundedText(tool.description, 4096),
		parameters: sanitizeSchema(tool.parameters)
	}));
}
function buildFunctionDeclarations(tools) {
	return sanitizeToolSchemas(tools).map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}
function sanitizeSchema(value, depth = 0) {
	if (depth > 8 || !isRecord(value)) return {
		type: "object",
		properties: {}
	};
	const type = typeof value.type === "string" && [
		"object",
		"array",
		"string",
		"number",
		"integer",
		"boolean",
		"null"
	].includes(value.type) ? value.type : "object";
	const output = { type };
	if (typeof value.description === "string") output.description = boundedText(value.description, 1024);
	if (Array.isArray(value.required)) output.required = value.required.filter((item) => typeof item === "string").slice(0, 128);
	if (Array.isArray(value.enum)) output.enum = value.enum.slice(0, 128).filter((item) => [
		"string",
		"number",
		"boolean",
		"null"
	].includes(typeof item));
	if (type === "object" && isRecord(value.properties)) {
		const properties = {};
		for (const [key, item] of Object.entries(value.properties).slice(0, 128)) if (!hasControl(key) && key.length > 0) properties[key.slice(0, 128)] = sanitizeSchema(item, depth + 1);
		output.properties = properties;
	}
	if (type === "array") output.items = sanitizeSchema(value.items, depth + 1);
	if (Array.isArray(value.oneOf)) output.oneOf = value.oneOf.slice(0, 8).map((item) => sanitizeSchema(item, depth + 1));
	return output;
}
function safeFinish(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128) return void 0;
	const normalized = value.toUpperCase();
	return [
		"STOP",
		"MAX_TOKENS",
		"LENGTH",
		"TOOL_CALLS",
		"FUNCTION_CALL",
		"SAFETY",
		"BLOCKLIST",
		"ERROR"
	].includes(normalized) ? normalized : void 0;
}
function safeSignature(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_SIGNATURE_LENGTH) return void 0;
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return void 0;
	}
	return value;
}
function boundedName(value) {
	return typeof value === "string" && value.length > 0 && !hasControl(value) ? value.slice(0, 128) : "unnamed_tool";
}
function boundedText(value, limit) {
	return typeof value === "string" && !hasControl(value) ? value.slice(0, limit) : "";
}
function hasControl(value) {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
function isFamily(value) {
	return value === "gemini" || value === "claude" || value === "gpt-oss" || value === "unknown";
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { ANTIGRAVITY_REPLAY_VERSION, antigravityModelFamily, buildFunctionDeclarations, compatibleReplayState, createReplayState, sanitizeToolSchemas };

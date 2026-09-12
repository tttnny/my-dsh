import { ANTIGRAVITY_ENDPOINT, ANTIGRAVITY_ENDPOINT_PROD, buildAgyCliHeaderPairs, buildAntigravityHarnessUserAgent } from "@cortexkit/antigravity-auth-core";
import { Buffer } from "node:buffer";
import { attributionHeaders } from "@deepseek-ai/dsh-llm";
//#region src/wire-identity.ts
/**
* The only identity seam for Antigravity private requests.
*
* The community transport snapshot owns the audited provider framing. This
* module owns the provider headers that identify that framing and carries the
* truthful DSH application identity in a plugin-owned secondary header. No
* caller may supply, suppress, rename, or replace either identity.
*/
const DSH_ATTRIBUTION_HEADER = "X-DeepSeek-Harness-Attribution";
const AGY_PROVIDER_USER_AGENT = buildAntigravityHarnessUserAgent();
const ANTIGRAVITY_WIRE_ORIGIN = new URL(ANTIGRAVITY_ENDPOINT).origin;
const ANTIGRAVITY_WIRE_ORIGINS = Object.freeze([new URL(ANTIGRAVITY_ENDPOINT).origin, new URL(ANTIGRAVITY_ENDPOINT_PROD).origin]);
const ANTIGRAVITY_WIRE_PATHS = Object.freeze([
	"/v1internal:loadCodeAssist",
	"/v1internal:streamGenerateContent",
	"/v1internal:generateContent",
	"/v1internal:retrieveUserQuotaSummary",
	"/v1internal:fetchAvailableModels"
]);
const MAX_HEADER_VALUE_LENGTH = 1024;
const ATTRIBUTION_KEYS = /* @__PURE__ */ new Set(["user-agent", "User-Agent"]);
var WireIdentityError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "WireIdentityError";
		this.code = code;
	}
};
/** Build the fixed provider identity plus the one required DSH carrier. */
function buildWireIdentityHeaders() {
	const attribution = readAttributionValue();
	assertSafeHeaderValue("User-Agent", AGY_PROVIDER_USER_AGENT, "WIRE_PROVIDER_HEADER_UNSAFE");
	return Object.freeze({
		"User-Agent": AGY_PROVIDER_USER_AGENT,
		[DSH_ATTRIBUTION_HEADER]: attribution
	});
}
/** Create one immutable identity policy for all private operation callers. */
function createWireIdentity() {
	const headers = buildWireIdentityHeaders();
	const headerPairs = (url, request) => {
		assertHttpsEndpoint(url);
		assertClosedObject(request, ["authorization", "body"], "WIRE_REQUEST_OVERRIDE");
		if (typeof request.body !== "string" && !(request.body instanceof Uint8Array)) throw new WireIdentityError("WIRE_REQUEST_BODY_INVALID", "The private request body is not bounded bytes");
		const authorization = validateAuthorization(request.authorization);
		const basePairs = buildAgyCliHeaderPairs(url, {
			method: "POST",
			body: request.body,
			headers: {
				"User-Agent": headers["User-Agent"],
				Authorization: authorization,
				"Content-Type": "application/json",
				"Accept-Encoding": "gzip"
			}
		});
		const result = [];
		for (const pair of basePairs) {
			const immutablePair = Object.freeze([pair[0], pair[1]]);
			result.push(immutablePair);
			if (pair[0] === "User-Agent") result.push(Object.freeze([DSH_ATTRIBUTION_HEADER, headers[DSH_ATTRIBUTION_HEADER]]));
		}
		return Object.freeze(result);
	};
	const serialize = (url, request) => {
		const parsed = new URL(url);
		const pairs = headerPairs(url, request);
		const body = typeof request.body === "string" ? Buffer.from(request.body) : Buffer.from(request.body);
		const lines = pairs.map(([name, value]) => `${name}: ${value}`).join("\r\n");
		const head = Buffer.from(`POST ${parsed.pathname}${parsed.search} HTTP/1.1\r\n${lines}\r\n\r\n`);
		if (!pairs.some(([name]) => name === "Transfer-Encoding")) return body.byteLength === 0 ? head : Buffer.concat([head, body]);
		if (body.byteLength === 0) return Buffer.concat([head, Buffer.from("0\r\n\r\n")]);
		return Buffer.concat([
			head,
			Buffer.from(`${body.byteLength.toString(16)}\r\n`),
			body,
			Buffer.from("\r\n0\r\n\r\n")
		]);
	};
	return Object.freeze({
		headers: () => headers,
		headerPairs,
		serialize
	});
}
/** Validate one complete, provider-fixed Wire Identity header set. */
function assertWireIdentityInvariant(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity headers must be an object");
	const headers = value;
	const expected = ["User-Agent", DSH_ATTRIBUTION_HEADER].sort();
	const keys = Object.keys(headers).sort();
	if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity headers contain an unexpected field");
	if (headers["User-Agent"] !== AGY_PROVIDER_USER_AGENT) throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity provider headers changed");
	if (headers["X-DeepSeek-Harness-Attribution"] === AGY_PROVIDER_USER_AGENT) throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity attribution was replaced by the provider");
	for (const key of expected) {
		const header = headers[key];
		if (typeof header !== "string") throw new WireIdentityError("WIRE_IDENTITY_INVARIANT", "Wire identity contains a non-text field");
		assertSafeHeaderValue(key, header, "WIRE_IDENTITY_INVARIANT");
	}
}
function readAttributionValue() {
	let value;
	try {
		value = attributionHeaders();
	} catch {
		throw new WireIdentityError("WIRE_ATTRIBUTION_UNAVAILABLE", "DSH attribution could not be constructed");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WireIdentityError("WIRE_ATTRIBUTION_INVALID", "DSH attribution returned an invalid header set");
	const keys = Object.keys(value);
	if (keys.length === 0) throw new WireIdentityError("WIRE_ATTRIBUTION_MISSING", "DSH attribution did not contain a User-Agent");
	for (const key of keys) if (!ATTRIBUTION_KEYS.has(key)) throw new WireIdentityError("WIRE_ATTRIBUTION_UNEXPECTED", "DSH attribution contained an unapproved header");
	const lower = value["user-agent"];
	const title = value["User-Agent"];
	if (lower !== void 0 && title !== void 0) throw new WireIdentityError("WIRE_ATTRIBUTION_DUPLICATE", "DSH attribution contained duplicate User-Agent fields");
	const attribution = lower ?? title;
	if (attribution === void 0) throw new WireIdentityError("WIRE_ATTRIBUTION_MISSING", "DSH attribution did not contain a User-Agent");
	if (attribution === AGY_PROVIDER_USER_AGENT) throw new WireIdentityError("WIRE_ATTRIBUTION_PROVIDER_OVERRIDE", "DSH attribution was replaced by the Antigravity provider identity");
	assertSafeHeaderValue(DSH_ATTRIBUTION_HEADER, attribution, "WIRE_ATTRIBUTION_UNSAFE");
	return attribution;
}
function validateAuthorization(value) {
	if (typeof value !== "string" || !/^Bearer\s+\S+$/u.test(value)) throw new WireIdentityError("WIRE_REQUEST_UNSAFE_AUTHORIZATION", "The private request authorization value is invalid");
	assertSafeHeaderValue("Authorization", value, "WIRE_REQUEST_UNSAFE_AUTHORIZATION");
	return value;
}
function assertSafeHeaderValue(name, value, code) {
	if (typeof value !== "string" || value.length === 0 || value.length > MAX_HEADER_VALUE_LENGTH) throw new WireIdentityError(code, `${name} is outside the safe header-value bounds`);
	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);
		if (codePoint < 32 || codePoint === 127) throw new WireIdentityError(code, `${name} contains an unsafe header character`);
	}
}
function assertHttpsEndpoint(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new WireIdentityError("WIRE_REQUEST_ENDPOINT_INVALID", "The private request endpoint is invalid");
	}
	if (parsed.protocol !== "https:" || !ANTIGRAVITY_WIRE_ORIGINS.some((origin) => origin === parsed.origin) || !ANTIGRAVITY_WIRE_PATHS.some((path) => path === parsed.pathname) || parsed.search.length > 0 && parsed.search !== "?alt=sse" || parsed.hash.length > 0) throw new WireIdentityError("WIRE_REQUEST_ENDPOINT_INVALID", "The private request endpoint is not allowlisted");
}
function assertClosedObject(value, allowedKeys, code) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new WireIdentityError(code, "The wire identity input must be a closed object");
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new WireIdentityError(code, "The wire identity input contains an unapproved override");
}
//#endregion
export { AGY_PROVIDER_USER_AGENT, ANTIGRAVITY_WIRE_ORIGIN, ANTIGRAVITY_WIRE_ORIGINS, ANTIGRAVITY_WIRE_PATHS, DSH_ATTRIBUTION_HEADER, WireIdentityError, assertWireIdentityInvariant, buildWireIdentityHeaders, createWireIdentity };

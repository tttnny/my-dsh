import { d as privateStatusError, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, p as readPrivateText } from "./private-transport-BQshWFmk.js";
import { ANTIGRAVITY_WIRE_ORIGIN } from "./wire-identity.js";
import { t as classifyPrivateFailure } from "./private-failure-DaQoTCkz.js";
//#region src/quota.ts
/** Single-account Antigravity quota normalization and bounded Host service. */
const ANTIGRAVITY_QUOTA_ENDPOINT = `${ANTIGRAVITY_WIRE_ORIGIN}/v1internal:retrieveUserQuotaSummary`;
const QUOTA_REFRESH_MIN_INTERVAL_MS = 3e4;
/** Normalize only validated, display-safe quota facts from a provider response. */
function normalizeQuotaResponse(value, now = Date.now()) {
	const groups = [];
	const sourceValue = isRecord(value) && isRecord(value.response) ? value.response : value;
	const source = isRecord(sourceValue) ? sourceValue : void 0;
	const candidates = source === void 0 ? [] : [
		...Array.isArray(source.groups) ? source.groups : [],
		...Array.isArray(source.buckets) ? source.buckets : [],
		...Array.isArray(source.quotaBuckets) ? source.quotaBuckets : [],
		...Array.isArray(source.quota_buckets) ? source.quota_buckets : [],
		...Array.isArray(source.userQuotaSummary) ? source.userQuotaSummary : [],
		...Array.isArray(source.quotas) ? source.quotas : []
	];
	for (const candidate of candidates) {
		if (!isRecord(candidate)) continue;
		const buckets = Array.isArray(candidate.buckets) ? candidate.buckets : Array.isArray(candidate.quotaBuckets) ? candidate.quotaBuckets : Array.isArray(candidate.windows) ? candidate.windows : [candidate];
		for (const rawBucket of buckets) {
			if (!isRecord(rawBucket)) continue;
			const window = identifyWindow(rawBucket);
			const resetTime = normalizeResetTime(rawBucket.resetTime ?? rawBucket.reset_time ?? rawBucket.resetAt ?? rawBucket.reset_at, now);
			const fraction = normalizeFraction(rawBucket.remainingFraction ?? rawBucket.remaining_fraction ?? rawBucket.fraction ?? rawBucket.remaining ?? rawBucket.remaining_percent ?? rawBucket.percentage);
			if (window === void 0 || resetTime === void 0 || fraction === void 0) continue;
			const group = identifyGroup(candidate, rawBucket);
			if (group === void 0) continue;
			const modelCount = boundedCount(candidate.modelCount ?? candidate.model_count ?? candidate.models ?? descriptionModelCount(candidate.description));
			const existing = groups.find((item) => item.group === group);
			if (existing === void 0) groups.push({
				group,
				modelCount,
				windows: [{
					window,
					remainingFraction: fraction,
					resetTime
				}]
			});
			else if (!existing.windows.some((item) => item.window === window)) {
				const updated = {
					group,
					modelCount: Math.max(existing.modelCount, modelCount),
					windows: [...existing.windows, {
						window,
						remainingFraction: fraction,
						resetTime
					}].sort(windowOrder)
				};
				groups.splice(groups.indexOf(existing), 1, updated);
			} else {
				const updatedWindows = existing.windows.map((item) => item.window === window ? {
					window,
					remainingFraction: Math.min(item.remainingFraction, fraction),
					resetTime: item.resetTime
				} : item);
				const updated = {
					group,
					modelCount: Math.max(existing.modelCount, modelCount),
					windows: updatedWindows.sort(windowOrder)
				};
				groups.splice(groups.indexOf(existing), 1, updated);
			}
		}
	}
	if (groups.length === 0) {
		if (isRecord(source)) return {
			state: "available",
			checkedAt: new Date(now).toISOString(),
			groups: []
		};
		throw new QuotaNormalizationError("The quota response did not contain recognized windows");
	}
	return {
		state: "available",
		checkedAt: new Date(now).toISOString(),
		groups: groups.sort((left, right) => left.group.localeCompare(right.group))
	};
}
var QuotaNormalizationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "QuotaNormalizationError";
	}
};
function createQuotaService(options) {
	const now = options.now ?? (() => Date.now());
	const minInterval = positive(options.minIntervalMs, QUOTA_REFRESH_MIN_INTERVAL_MS);
	const transport = options.transport ?? createPrivateTransport({
		...options.transportOptions?.responseHeaderTimeoutMs === void 0 ? {} : { responseHeaderTimeoutMs: options.transportOptions.responseHeaderTimeoutMs },
		...options.transportOptions?.maxRequestBytes === void 0 ? {} : { maxRequestBytes: options.transportOptions.maxRequestBytes }
	});
	let current = { state: "unauthenticated" };
	let checkedAt = 0;
	let inFlight;
	let inFlightAbort;
	const lifecycleController = new AbortController();
	let disposed = false;
	return {
		refresh: async (signal, force = false) => {
			if (disposed) return current;
			if (!force && checkedAt > 0 && now() - checkedAt < minInterval) return current;
			if (inFlight !== void 0) return await waitForCaller(inFlight, signal);
			const combined = mergeAbortSignals(void 0, lifecycleController.signal);
			inFlightAbort = combined.dispose;
			inFlight = refreshQuota(options.auth, transport, combined.signal, now).then((value) => {
				current = value;
				checkedAt = now();
				return value;
			}).catch((error) => {
				current = mapQuotaError(error, now());
				checkedAt = now();
				return current;
			}).finally(() => {
				combined.dispose();
				inFlightAbort = void 0;
				inFlight = void 0;
			});
			return await waitForCaller(inFlight, signal);
		},
		status: () => current,
		dispose: async () => {
			disposed = true;
			lifecycleController.abort();
			inFlightAbort?.();
			await inFlight?.catch(() => {});
		}
	};
}
async function refreshQuota(auth, transport, signal, now) {
	const credential = await auth.credential(signal);
	if (credential === void 0) return { state: "unauthenticated" };
	const body = credential.projectId ? { project: credential.projectId } : {};
	let response = await transport.request({
		url: ANTIGRAVITY_QUOTA_ENDPOINT,
		accessToken: credential.accessToken,
		body: JSON.stringify(body),
		...signal === void 0 ? {} : { signal }
	});
	if (response.status === 403 && credential.projectId) try {
		const retryResponse = await transport.request({
			url: ANTIGRAVITY_QUOTA_ENDPOINT,
			accessToken: credential.accessToken,
			body: JSON.stringify({}),
			...signal === void 0 ? {} : { signal }
		});
		if (retryResponse.ok) response = retryResponse;
	} catch {}
	const statusError = privateStatusError(response.status);
	if (statusError !== void 0) {
		await response.body?.cancel().catch(() => {});
		throw statusError;
	}
	let value;
	try {
		value = JSON.parse(await readPrivateText(response, {
			...signal === void 0 ? {} : { signal },
			maxBytes: DEFAULT_PRIVATE_RESPONSE_BYTES
		}));
	} catch (error) {
		if (error instanceof PrivateTransportError) throw error;
		throw new QuotaNormalizationError("The quota response was not valid JSON");
	}
	return normalizeQuotaResponse(value, now());
}
const QUOTA_FAILURE_STATES = {
	authentication: "unauthenticated",
	forbidden: "forbidden",
	"rate-limited": "rate-limited",
	cancelled: "offline",
	timeout: "timeout",
	"attribution-rejected": "protocol-drift",
	"protocol-drift": "protocol-drift",
	"response-limit": "protocol-drift",
	"request-limit": "protocol-drift",
	upstream: "offline",
	network: "offline",
	failed: "offline"
};
function mapQuotaError(error, checkedAt) {
	return {
		state: error instanceof PrivateTransportError ? QUOTA_FAILURE_STATES[classifyPrivateFailure(error)] : error instanceof QuotaNormalizationError ? "protocol-drift" : "offline",
		checkedAt: new Date(checkedAt).toISOString()
	};
}
function identifyWindow(value) {
	const raw = String(value.window ?? value.windowType ?? value.window_type ?? value.bucketId ?? value.bucket_id ?? "").toLowerCase();
	if (raw.includes("5h") || raw.includes("5-hour") || raw.includes("five")) return "5h";
	if (raw.includes("week") || raw.includes("weekly") || raw.includes("7d")) return "weekly";
	const seconds = numberValue(value.durationSeconds ?? value.duration_seconds);
	if (seconds !== void 0) {
		if (seconds <= 18e3) return "5h";
		if (seconds <= 691200) return "weekly";
	}
}
function identifyGroup(candidate, bucket) {
	const raw = [
		candidate.displayName,
		candidate.group,
		candidate.quotaGroup,
		candidate.quota_group,
		candidate.modelFamily,
		candidate.title,
		candidate.name,
		candidate.description,
		bucket?.bucketId,
		bucket?.bucket_id,
		bucket?.displayName
	].filter(Boolean).map(String).join(" ").toLowerCase();
	if (raw.includes("3p") || raw.includes("non") || raw.includes("claude") || raw.includes("gpt") || raw.includes("openai") || raw.includes("anthropic") || raw.includes("third-party") || raw.includes("external")) return "non-gemini";
	if (raw.includes("gemini") || raw.includes("google") || raw.includes("chat") || raw.includes("code") || raw.includes("default") || raw.length === 0) return "gemini";
	return "gemini";
}
function normalizeFraction(value) {
	const number = numberValue(value);
	if (number === void 0) return void 0;
	if (number >= 0 && number <= 1) return number;
	if (number <= 100) return number / 100;
}
function normalizeResetTime(value, now) {
	const parsed = typeof value === "number" ? value < 1e10 ? value * 1e3 : value : typeof value === "string" ? Date.parse(value) : NaN;
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x5af3107a4000) return void 0;
	const iso = new Date(parsed).toISOString();
	return Number.isFinite(Date.parse(iso)) && parsed >= now - 31536e6 ? iso : void 0;
}
function boundedCount(value) {
	if (Array.isArray(value)) return Math.min(value.length, 1e4);
	const number = numberValue(value);
	return number === void 0 ? 0 : Math.min(Math.floor(number), 1e4);
}
function descriptionModelCount(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 16384) return 0;
	if (!/^[^:]{1,256}:\s*/u.test(value)) return 0;
	const payload = value.replace(/^[^:]{1,256}:\s*/u, "");
	return Math.min(payload.split(",").map((item) => item.trim()).filter((item) => item.length > 0).length, 1e4);
}
function windowOrder(left, right) {
	return left.window === right.window ? 0 : left.window === "5h" ? -1 : 1;
}
function positive(value, fallback) {
	return value === void 0 || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 864e5);
}
function numberValue(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
async function waitForCaller(promise, signal) {
	if (signal === void 0) return await promise;
	if (signal.aborted) throw new PrivateTransportError("cancelled", "The quota request was cancelled", { accepted: false });
	let remove;
	const cancellation = new Promise((_, reject) => {
		const abort = () => reject(new PrivateTransportError("cancelled", "The quota request was cancelled", { accepted: false }));
		remove = () => signal.removeEventListener("abort", abort);
		signal.addEventListener("abort", abort, { once: true });
	});
	try {
		return await Promise.race([promise, cancellation]);
	} finally {
		remove?.();
	}
}
function mergeAbortSignals(first, second) {
	const controller = new AbortController();
	const abort = (event) => {
		if (!controller.signal.aborted) controller.abort(event.target.reason);
	};
	const signals = first === void 0 ? [second] : [first, second];
	for (const signal of signals) if (signal.aborted) controller.abort(signal.reason);
	else signal.addEventListener("abort", abort, { once: true });
	return {
		signal: controller.signal,
		dispose: () => {
			for (const signal of signals) signal.removeEventListener("abort", abort);
		}
	};
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
export { ANTIGRAVITY_QUOTA_ENDPOINT, QUOTA_REFRESH_MIN_INTERVAL_MS, QuotaNormalizationError, createQuotaService, normalizeQuotaResponse };

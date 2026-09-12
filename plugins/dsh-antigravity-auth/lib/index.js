import { _ as defaultAuthStorePath, a as maskEmail, c as defaultCapabilityGatePath, d as ANTIGRAVITY_TOKEN_ENDPOINT, f as CredentialOperationError, g as credentialErrorMessage, h as createGoogleRevokeTransport, i as createAntigravityAuthService, l as OAuthFlowError, m as createGoogleRefreshTransport, o as createFileCapabilityGates, p as createCredentialCoordinator, r as AntigravityAuthService, s as createMemoryCapabilityGates, t as mountCapabilityLifecycle, u as ANTIGRAVITY_REVOKE_ENDPOINT } from "./capability-lifecycle-DPNblVcJ.js";
import { a as DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS, c as assertPrivateEndpoint, d as privateStatusError, f as readPrivateBytes, i as DEFAULT_PRIVATE_RESPONSE_BYTES, l as createPrivateTransport, m as PrivateTransportError, n as DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, o as DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, p as readPrivateText, r as DEFAULT_PRIVATE_REQUEST_BYTES, s as MAX_PRIVATE_REQUEST_BYTES, t as DEFAULT_PRIVATE_FRAME_BYTES, u as iteratePrivateSse } from "./private-transport-DvkyFFK_.js";
import { AGY_PROVIDER_USER_AGENT, ANTIGRAVITY_WIRE_ORIGIN, ANTIGRAVITY_WIRE_ORIGINS, ANTIGRAVITY_WIRE_PATHS, DSH_ATTRIBUTION_HEADER, WireIdentityError, assertWireIdentityInvariant, buildWireIdentityHeaders, createWireIdentity } from "./wire-identity.js";
import { PROJECT_DISCOVERY_ENDPOINT, PROJECT_DISCOVERY_PATH, ProjectDiscoveryError, createProjectContext, createProjectDiscovery, normalizeProjectId } from "./project-context.js";
import { a as createStatusView, i as LLM_FAMILY_IDS, n as CAPABILITY_GATE_OUTCOMES, r as CAPABILITY_ROW_IDS, t as ANTIGRAVITY_PLUGIN_ID } from "./status-D0-em3Ru.js";
import { ANTIGRAVITY_QUOTA_ENDPOINT, QUOTA_REFRESH_MIN_INTERVAL_MS, QuotaNormalizationError, createQuotaService, normalizeQuotaResponse } from "./quota.js";
import { ANTIGRAVITY_REPLAY_VERSION, antigravityModelFamily, buildFunctionDeclarations, compatibleReplayState, createReplayState, sanitizeToolSchemas } from "./replay.js";
import { ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_LLM_ROUTE, ANTIGRAVITY_PROVIDER, ANTIGRAVITY_STREAM_ENDPOINT, AntigravityAdapter, buildAntigravityGeneratePayload } from "./llm-adapter.js";
import { a as parseStatusResult, c as isSafeRpcErrorCode, i as parseModelCatalogResult, l as safeRpcErrorMessage, n as ANTIGRAVITY_AUTH_RPC_NAMESPACE, o as parseUsageResult, r as createAntigravityAuthRpcClient, s as ANTIGRAVITY_MODEL_CATALOG_STATES, t as ANTIGRAVITY_AUTH_RPC_CHANNEL } from "./rpc-contract-Da_nKwRI.js";
import { DEFAULT_INLINE_IMAGE_BYTES, DEFAULT_VIDEO_BYTES, IMAGE_HANDLE_PATTERN, MediaAdmissionError, admitBase64Image, admitImageBytes, admitSessionImage, admitWorkspaceImage, admitWorkspaceVideo, detectImageMediaType, imageHandle, isMp4, sessionImageCatalog } from "./media-admission.js";
import { LIVE_ACKNOWLEDGEMENT, LIVE_GATE_IDS, runLiveGateCli } from "./live-gates.js";
import { spawn } from "node:child_process";
import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";
//#region src/loopback-rpc.ts
const LOOPBACK_REQUIRED_MESSAGE = "Antigravity account controls require a loopback-bound DSH Host";
/**
* Decide the account RPC activation from the public WebServer bind.
* By default in this plugin, we allow non-loopback binds (e.g. 0.0.0.0, LAN, Docker)
* and trust the outer DSH authentication mechanisms.
*/
function loopbackMode(_webServerHost) {
	return "enabled";
}
/** Command-entry denial shown when the Host exposes the commands seam beyond loopback. */
const ACCOUNT_COMMAND_DENIED_MESSAGE = "Antigravity account commands require a local DSH Host (no WebServer or 127.0.0.1-bound)";
/**
* Decide slash-command activation for one Host composition.
* Terminal and WebServer binds are all enabled.
*/
function commandAccountMode(_webServer) {
	return "enabled";
}
/**
* Select the real RPC dispatcher only for an explicitly loopback-bound Web
* service; any other composition registers a value-free inert dispatcher that
* never calls the delegate.
*/
function createLoopbackRpcGuard(webServerHost, delegate) {
	if (loopbackMode(webServerHost) === "blocked") return {
		mode: "blocked",
		handler: async () => ({
			ok: false,
			error: {
				code: "loopback-required",
				message: LOOPBACK_REQUIRED_MESSAGE,
				details: {}
			}
		})
	};
	return {
		mode: "enabled",
		handler: delegate
	};
}
//#endregion
//#region src/open-authorization-url.ts
/**
* Best-effort Host browser launch that hands the terminal user the OAuth
* authorization URL without persisting it in the session's `command/done`
* event (that event follows ordinary session persistence).
*
* DSH exposes no public transient-presentation or browser-authority API for
* plugins to hand off an external login URL, so this module spawns the
* platform default opener directly, mirroring the best-effort helper the DSH
* TUI renderer uses for its own hrefs, and reports every failure as `false`: a
* Host without a desktop browser simply cannot complete interactive Google
* sign-in from the terminal (documented limitation; no public Host API exists
* to close it).
*
* @module antigravity-auth/open-authorization-url
*/
/** The Google authorization endpoint this plugin starts logins against. */
const AUTHORIZATION_HOST = "accounts.google.com";
/**
* Resolve the host default-browser opener. Darwin uses `open`, Windows
* `cmd /c start`, elsewhere `xdg-open`.
*
* The Windows command line is `cmd /c start "" "<url>"`: the empty quoted token
* is the `start` window title (without it `start` treats the URL as the title),
* and the quoted URL keeps its `&`-separated query parameters from being read
* as command separators. Both quotes reach `cmd` verbatim because Node's
* default argument handling would leave a `&`-only argument unquoted.
* @param platform - `process.platform` snapshot.
* @param url - already-validated https authorization URL.
*/
function openerSpec(platform, url) {
	if (platform === "darwin") return {
		command: "open",
		args: [url],
		verbatimArguments: false
	};
	if (platform === "win32") return {
		command: "cmd",
		args: [
			"/c",
			"start",
			"\"\"",
			`"${url}"`
		],
		verbatimArguments: true
	};
	return {
		command: "xdg-open",
		args: [url],
		verbatimArguments: false
	};
}
/**
* Whether a candidate is the Google authorization endpoint this plugin starts.
* @param value - candidate authorization URL.
*/
function isAntigravityAuthorizationUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" && parsed.hostname === AUTHORIZATION_HOST && parsed.pathname.startsWith("/o/oauth2/");
	} catch {
		return false;
	}
}
/**
* Open the authorization URL in the host default browser, best effort.
* @param url - the Google authorization URL returned by `OAuthFlow.start()`.
* @param spawnFn - injectable spawn.
* @param platform - injectable platform.
* @returns true once the opener process spawned; false when the URL is not an
* Antigravity authorization URL, spawn threw, or the opener could not start.
* The URL never enters the returned value or a diagnostic.
*/
async function openAuthorizationUrl(url, spawnFn = spawn, platform = process.platform) {
	if (!isAntigravityAuthorizationUrl(url)) return false;
	const spec = openerSpec(platform, url);
	try {
		const child = spawnFn(spec.command, spec.args, {
			detached: true,
			stdio: "ignore",
			windowsVerbatimArguments: spec.verbatimArguments
		});
		return await new Promise((resolve) => {
			child.once("error", () => {
				resolve(false);
			});
			child.once("spawn", () => {
				child.unref();
				resolve(true);
			});
		});
	} catch {
		return false;
	}
}
//#endregion
//#region src/auth-command.ts
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function formatStatus(status) {
	const login = status.login;
	const parts = [login.configured ? "configured" : "not configured", login.projectAvailable ? "project available" : "no project"];
	if (login.maskedEmail !== void 0) parts.push(login.maskedEmail);
	if (login.phase === "pending") parts.push("authorization pending");
	else if (login.phase !== "idle" && login.phase !== "success") parts.push(`phase ${login.phase}`);
	if (login.errorCode !== void 0) parts.push(`error ${login.errorCode}`);
	const available = status.capabilities.filter((capability) => capability.state === "available").map((capability) => capability.id);
	if (available.length > 0) parts.push(`available: ${available.join(", ")}`);
	return `Antigravity auth: ${parts.join("; ")}`;
}
/**
* Build the slash command shared by every interactive DSH surface.
* @param service - the shared Host auth service.
* @param accountMode - live account-control activation for this Host
* composition (enabled on a local terminal Host with no WebServer or a
* loopback-bound WebServer, blocked on a public Web bind); when blocked the
* command denies every operation without touching the auth service.
* @param openUrl - best-effort Host browser launcher for the authorization
* URL; the URL is delivered there and never echoed into the command result,
* because `CommandResult.text` is persisted verbatim into `command/done`. The
* resolved false value means the Host has no usable browser launch, which the
* command reports without reproducing the URL.
*/
function createAntigravityAuthCommand(service, accountMode, openUrl = openAuthorizationUrl) {
	return {
		name: "antigravity-auth",
		description: "Inspect or start the Antigravity OAuth login",
		input: { hint: "[status|login|cancel|logout]" },
		handler: async ({ rawInput }) => {
			if (accountMode() === "blocked") return {
				kind: "error",
				text: ACCOUNT_COMMAND_DENIED_MESSAGE
			};
			const operation = rawInput.trim() || "status";
			if (operation === "status") try {
				return {
					kind: "success",
					text: formatStatus(await service.status())
				};
			} catch (error) {
				return {
					kind: "error",
					text: `reading Antigravity auth status failed: ${errorMessage(error)}`
				};
			}
			if (operation === "login") try {
				const replaced = (await service.status()).login.phase === "pending";
				await service.acknowledgeRisk();
				if (!await openUrl((await service.startLogin()).authorizationUrl)) return {
					kind: "error",
					text: "Antigravity authorization started, but this Host could not open a browser automatically; complete sign-in in a browser on this Host, then run /antigravity-auth status."
				};
				return {
					kind: "success",
					text: replaced ? "Previous Antigravity authorization cancelled and a new one started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status." : "Antigravity authorization started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status."
				};
			} catch (error) {
				return {
					kind: "error",
					text: `starting Antigravity login failed: ${errorMessage(error)}`
				};
			}
			if (operation === "cancel") try {
				const result = await service.cancelLogin();
				return result.phase === "cancelled" ? {
					kind: "success",
					text: "Antigravity authorization cancelled."
				} : {
					kind: "error",
					text: `Antigravity authorization could not be cancelled (phase ${result.phase}).`
				};
			} catch (error) {
				return {
					kind: "error",
					text: `cancelling Antigravity login failed: ${errorMessage(error)}`
				};
			}
			if (operation === "logout") try {
				await service.logout();
				return {
					kind: "success",
					text: "Antigravity logged out."
				};
			} catch (error) {
				return {
					kind: "error",
					text: `logging out of Antigravity failed: ${errorMessage(error)}`
				};
			}
			return {
				kind: "error",
				text: `unknown operation "${operation}" (available: status, login, cancel, logout)`
			};
		}
	};
}
//#endregion
//#region src/account-routes.ts
/** Plugin-owned account RPC carried by Connection's authenticated /api routes. */
/** Register exact routes without creating a separate physical RPC carrier. */
function registerAccountRoutes(connection, namespace, endpoints, handler) {
	const disposers = endpoints.map((endpoint) => connection.fetch.register({
		path: `/api/${namespace}/${endpoint}`,
		methods: ["POST"],
		requestBody: "buffered",
		fetch: async (request) => {
			if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return new Response("content type must be application/json", { status: 415 });
			let body;
			try {
				body = await request.json();
			} catch {
				return new Response("invalid JSON", { status: 400 });
			}
			const envelope = clientRequestSchema.safeParse(body);
			if (!envelope.success) return new Response("invalid account request", { status: 400 });
			const { rpcId, method, payload } = envelope.data;
			const failure = (code, message) => ({
				ok: false,
				error: {
					code,
					message,
					details: {}
				}
			});
			let result;
			try {
				result = method === `${namespace}/${endpoint}` ? await handler(endpoint, payload, request.signal) : failure("bad-request", "Account request method does not match its endpoint");
			} catch {
				result = failure("internal", "Account request failed");
			}
			return Response.json({
				type: "server-response",
				rpcId,
				result
			});
		}
	}));
	return async () => {
		await Promise.all(disposers.map((dispose) => dispose()));
	};
}
//#endregion
//#region src/rpc.ts
/** Dispatch closed, value-safe requests; callback URLs are never echoed. */
async function handleAntigravityAuthRpc(service, endpoint, payload, signal, modelCatalog) {
	if (signal?.aborted === true) return cancelled();
	try {
		if (endpoint === "status") {
			if (!isEmptyRecord(payload)) return badRequest("status expects an empty payload");
			return {
				ok: true,
				value: { status: await service.status() }
			};
		}
		if (endpoint === "models") {
			if (!isRefreshPayload(payload)) return badRequest("models expects {} or { force: boolean }");
			if (modelCatalog === void 0) return badRequest("model catalog is unavailable");
			const status = await service.status();
			return {
				ok: true,
				value: status.login.projectAvailable && status.capabilities.some((capability) => capability.id === "auth-llm" && capability.state === "available") ? await modelCatalog.modelCatalog(signal, payload.force) : modelCatalog.catalogSnapshot()
			};
		}
		if (endpoint === "usage") {
			if (!isRefreshPayload(payload)) return badRequest("usage expects {} or { force: boolean }");
			if (service.usage === void 0) return {
				ok: true,
				value: { state: "protocol-drift" }
			};
			return {
				ok: true,
				value: await service.usage(signal, payload.force)
			};
		}
		if (endpoint === "acknowledge-risk") {
			if (!isAcknowledgement(payload)) return badRequest("acknowledge-risk expects { acknowledge: true }");
			return {
				ok: true,
				value: await service.acknowledgeRisk()
			};
		}
		if (endpoint === "login") {
			if (!isEmptyRecord(payload)) return badRequest("login expects an empty payload");
			return {
				ok: true,
				value: await service.startLogin()
			};
		}
		if (endpoint === "complete-callback") {
			if (!isCompleteCallbackPayload(payload)) return badRequest("complete-callback expects { callbackUrl: string }");
			if (service.completeCallback === void 0) return badRequest("complete-callback is unavailable");
			return {
				ok: true,
				value: await service.completeCallback(payload.callbackUrl)
			};
		}
		if (endpoint === "cancel" || endpoint === "cancel-login") {
			if (!isEmptyRecord(payload)) return badRequest("cancel expects an empty payload");
			return {
				ok: true,
				value: await service.cancelLogin()
			};
		}
		if (endpoint === "logout") {
			if (!isEmptyRecord(payload)) return badRequest("logout expects an empty payload");
			return {
				ok: true,
				value: await service.logout()
			};
		}
		if (endpoint === "revoke") {
			if (!isRevokePayload(payload)) return badRequest("revoke expects { confirmed: true }");
			return {
				ok: true,
				value: await service.revoke(true, signal)
			};
		}
		return badRequest("unknown Antigravity auth endpoint");
	} catch (error) {
		return safeFailure(error);
	}
}
function badRequest(message) {
	return {
		ok: false,
		error: {
			code: "bad-request",
			message,
			details: { issues: [] }
		}
	};
}
function cancelled() {
	return {
		ok: false,
		error: {
			code: "cancelled",
			message: "antigravity-auth: request cancelled",
			details: {}
		}
	};
}
function safeFailure(error) {
	const credentialError = error instanceof CredentialOperationError ? error : void 0;
	const candidate = error instanceof OAuthFlowError ? error.code : credentialError?.code ?? "internal";
	const code = isSafeRpcErrorCode(candidate) ? candidate : "internal";
	return {
		ok: false,
		error: {
			code,
			message: credentialError === void 0 ? safeRpcErrorMessage(code) : credentialErrorMessage(credentialError.code) ?? safeRpcErrorMessage(code),
			details: {}
		}
	};
}
function isEmptyRecord(value) {
	return isRecord(value) && Object.keys(value).length === 0;
}
function isRefreshPayload(value) {
	return isRecord(value) && Object.keys(value).every((key) => key === "force") && (value.force === void 0 || typeof value.force === "boolean");
}
function isAcknowledgement(value) {
	return isRecord(value) && Object.keys(value).length === 1 && value.acknowledge === true;
}
function isRevokePayload(value) {
	return isRecord(value) && Object.keys(value).length === 1 && value.confirmed === true;
}
function isCompleteCallbackPayload(value) {
	return isRecord(value) && typeof value.callbackUrl === "string" && value.callbackUrl.length > 0 && value.callbackUrl.length <= 4096;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region src/index.ts
const name = "antigravity-auth";
const inject = ["llm", "attachments"];
/** Mount the Host-only OAuth service and its guarded account RPC channel. */
function apply(ctx) {
	const service = createAntigravityAuthService({
		storePath: defaultAuthStorePath(),
		autoActivateGates: true
	});
	let accountMode = "enabled";
	const runtime = ctx;
	const adapter = new AntigravityAdapter({
		auth: service,
		...runtime.attachments === void 0 ? {} : { attachments: runtime.attachments }
	});
	const unprovide = ctx.provide?.("antigravityAuth", service) ?? (() => {});
	ctx.inject(["connection"], (connectionCtx) => {
		const webServer = connectionCtx.get("webServer");
		accountMode = commandAccountMode(webServer);
		const guard = createLoopbackRpcGuard(webServer?.host, (endpoint, payload, signal) => handleAntigravityAuthRpc(service, endpoint, payload, signal, adapter));
		if (guard.mode === "blocked") connectionCtx.logger.warn("antigravity-auth: account RPC is disabled because the WebServer is not loopback-bound");
		return registerAccountRoutes(connectionCtx.connection, ANTIGRAVITY_AUTH_RPC_NAMESPACE, [
			"status",
			"models",
			"usage",
			"acknowledge-risk",
			"login",
			"complete-callback",
			"cancel",
			"cancel-login",
			"logout",
			"revoke"
		], guard.handler);
	});
	mountCapabilityLifecycle({
		ctx,
		auth: service,
		id: "auth-llm",
		enabled: () => runtime.llm?.registerAdapter !== void 0,
		register: () => {
			if (runtime.llm?.registerAdapter === void 0) return void 0;
			if (runtime.llm.listProviders?.().some((provider) => provider.id === "google-antigravity")) return void 0;
			const dispose = runtime.llm.registerAdapter([ANTIGRAVITY_PROVIDER], adapter);
			return () => {
				try {
					dispose();
				} finally {
					adapter.invalidateModelCatalog();
				}
			};
		},
		ownsAuth: true,
		cleanup: unprovide,
		label: "antigravity-auth: OAuth and LLM operations"
	});
	ctx.inject(["commands"], (commandCtx) => commandCtx.commands.register(createAntigravityAuthCommand(service, () => accountMode)));
}
//#endregion
export { AGY_PROVIDER_USER_AGENT, ANTIGRAVITY_AUTH_RPC_CHANNEL, ANTIGRAVITY_AUTH_RPC_NAMESPACE, ANTIGRAVITY_AVAILABLE_MODELS_ENDPOINT, ANTIGRAVITY_GENERATE_ENDPOINT, ANTIGRAVITY_LLM_ROUTE, ANTIGRAVITY_MODEL_CATALOG_STATES, ANTIGRAVITY_PLUGIN_ID, ANTIGRAVITY_PROVIDER, ANTIGRAVITY_QUOTA_ENDPOINT, ANTIGRAVITY_REPLAY_VERSION, ANTIGRAVITY_REVOKE_ENDPOINT, ANTIGRAVITY_STREAM_ENDPOINT, ANTIGRAVITY_TOKEN_ENDPOINT, ANTIGRAVITY_WIRE_ORIGIN, ANTIGRAVITY_WIRE_ORIGINS, ANTIGRAVITY_WIRE_PATHS, AntigravityAdapter, AntigravityAuthService, CAPABILITY_GATE_OUTCOMES, CAPABILITY_ROW_IDS, CredentialOperationError, DEFAULT_INLINE_IMAGE_BYTES, DEFAULT_PRIVATE_FRAME_BYTES, DEFAULT_PRIVATE_IDLE_TIMEOUT_MS, DEFAULT_PRIVATE_REQUEST_BYTES, DEFAULT_PRIVATE_RESPONSE_BYTES, DEFAULT_PRIVATE_RESPONSE_HEADER_TIMEOUT_MS, DEFAULT_PRIVATE_TOTAL_TIMEOUT_MS, DEFAULT_VIDEO_BYTES, DSH_ATTRIBUTION_HEADER, IMAGE_HANDLE_PATTERN, LIVE_ACKNOWLEDGEMENT, LIVE_GATE_IDS, LLM_FAMILY_IDS, MAX_PRIVATE_REQUEST_BYTES, MediaAdmissionError, PROJECT_DISCOVERY_ENDPOINT, PROJECT_DISCOVERY_PATH, PrivateTransportError, ProjectDiscoveryError, QUOTA_REFRESH_MIN_INTERVAL_MS, QuotaNormalizationError, WireIdentityError, admitBase64Image, admitImageBytes, admitSessionImage, admitWorkspaceImage, admitWorkspaceVideo, antigravityModelFamily, apply, assertPrivateEndpoint, assertWireIdentityInvariant, buildAntigravityGeneratePayload, buildFunctionDeclarations, buildWireIdentityHeaders, compatibleReplayState, createAntigravityAuthRpcClient, createAntigravityAuthService, createCredentialCoordinator, createFileCapabilityGates, createGoogleRefreshTransport, createGoogleRevokeTransport, createMemoryCapabilityGates, createPrivateTransport, createProjectContext, createProjectDiscovery, createQuotaService, createReplayState, createStatusView, createWireIdentity, credentialErrorMessage, defaultCapabilityGatePath, detectImageMediaType, imageHandle, inject, isMp4, iteratePrivateSse, maskEmail, name, normalizeProjectId, normalizeQuotaResponse, parseModelCatalogResult, parseStatusResult, parseUsageResult, privateStatusError, readPrivateBytes, readPrivateText, runLiveGateCli, sanitizeToolSchemas, sessionImageCatalog };

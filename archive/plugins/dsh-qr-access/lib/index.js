// src/index.ts
import { networkInterfaces } from "node:os";

// src/host/urls.ts
function isIpv4Literal(value) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function parseAuthority(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return null;
  try {
    const url = new URL(`http://${value}`);
    if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
    const canonical = url.port === "" ? url.hostname : `${url.hostname}:${url.port}`;
    return canonical === value.toLowerCase() ? url : null;
  } catch {
    return null;
  }
}
function dedupe(urls) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const url of urls) {
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
function buildQrAccessUrls(facts) {
  const scheme = facts.pageScheme === "https:" ? "https:" : "http:";
  const mint = (origin) => {
    try {
      const url = facts.authenticate(origin);
      return typeof url === "string" && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  };
  const { port } = facts;
  const localUrl = port === null ? null : mint(`http://127.0.0.1:${String(port)}`);
  const lanUrls = port === null ? [] : facts.lanAddresses.filter((address) => isIpv4Literal(address) && !isLoopbackHostname(address)).map((address) => mint(`http://${address}:${String(port)}`)).filter((url) => url !== null);
  const lanAuthorities = new Set(facts.lanAddresses.map((address) => address.toLowerCase()));
  const trustedUrls = facts.trustedHosts.filter((entry) => {
    const parsed = parseAuthority(entry);
    if (parsed === null) return false;
    if (isLoopbackHostname(parsed.hostname)) return false;
    return !lanAuthorities.has(parsed.hostname.toLowerCase());
  }).map((entry) => mint(`${scheme}//${entry}`)).filter((url) => url !== null);
  const pageUrl = facts.pageAuthority === null ? null : mint(`${scheme}//${facts.pageAuthority}`);
  return {
    mode: "generic",
    boundHost: facts.boundHost,
    port: facts.port,
    localUrl,
    lanUrls: dedupe(lanUrls),
    trustedUrls: dedupe(trustedUrls),
    pageUrl
  };
}

// src/index.ts
var name = "dsh-qr-access";
var ROUTE_PATH = "/api/qr-access/urls";
var ALL_INTERFACES_HOST = "0.0.0.0";
function lookup(ctx, name2) {
  try {
    return typeof ctx.get === "function" ? ctx.get(name2) : void 0;
  } catch {
    return void 0;
  }
}
function ownLanAddresses() {
  try {
    return Object.values(networkInterfaces()).flat().filter((iface) => iface.family === "IPv4" && !iface.internal).map((iface) => iface.address);
  } catch {
    return [];
  }
}
function collectFacts(ctx, connection, request) {
  const webServer = lookup(ctx, "webServer");
  const webRuntime = lookup(ctx, "webRuntime");
  const boundHost = typeof webServer?.host === "string" ? webServer.host : null;
  const port = typeof webServer?.port === "number" ? webServer.port : null;
  const runtimeLan = Array.isArray(webRuntime?.lanAddresses) ? webRuntime.lanAddresses.filter((ip) => typeof ip === "string") : [];
  const trustedHosts = Array.isArray(webRuntime?.trustedHosts) ? webRuntime.trustedHosts.filter((entry) => typeof entry === "string") : [];
  const protocol = new URL(request.url).searchParams.get("protocol");
  const headers = request.headers;
  return {
    boundHost,
    port,
    lanAddresses: runtimeLan.length > 0 ? runtimeLan : boundHost === ALL_INTERFACES_HOST ? ownLanAddresses() : [],
    trustedHosts,
    pageAuthority: typeof headers?.get === "function" ? headers.get("host") : null,
    pageScheme: protocol === "https:" ? "https:" : "http:",
    authenticate: (origin) => {
      try {
        const url = connection.authenticatedUrl?.(origin);
        return typeof url === "string" && url.length > 0 ? url : null;
      } catch {
        return null;
      }
    }
  };
}
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function registerRoutes(ctx, connection) {
  if (typeof connection.fetch?.register !== "function") {
    console.warn("[dsh-qr-access] connection.fetch \u4E0D\u53EF\u7528\uFF1A\u901A\u7528\u6A21\u5F0F\u8DEF\u7531 /api/qr-access/urls \u672A\u6CE8\u518C\uFF0C\u9762\u677F\u5C06\u56DE\u843D\u5230 DSH Desktop \u6570\u636E\u6E90\u6216\u663E\u793A\u4E0D\u53EF\u7528");
    return false;
  }
  try {
    connection.fetch.register({
      path: ROUTE_PATH,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        try {
          return jsonResponse(buildQrAccessUrls(collectFacts(ctx, connection, request)));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn("[dsh-qr-access] \u7EC4\u88C5\u8BBF\u95EE\u5730\u5740\u5931\u8D25\uFF1A", reason);
          return jsonResponse({ error: reason }, 500);
        }
      }
    });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-qr-access] /api/qr-access/urls \u6CE8\u518C\u5931\u8D25\uFF1A", reason);
    return false;
  }
}
function apply(ctx) {
  const start = (ready) => {
    const connection = lookup(ready, "connection");
    if (connection === void 0) {
      console.warn("[dsh-qr-access] connection \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u901A\u7528\u6A21\u5F0F\u8DEF\u7531\u672A\u6CE8\u518C\uFF08\u975E web \u8F7D\u4F53\u5B9E\u4F8B\u5C5E\u6B63\u5E38\u60C5\u51B5\uFF09");
      return;
    }
    registerRoutes(ready, connection);
  };
  if (typeof ctx.inject === "function") {
    ctx.inject(["connection"], (ready) => start(ready));
    return;
  }
  start(ctx);
}
export {
  apply,
  name
};
//# sourceMappingURL=index.js.map

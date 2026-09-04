// src/server/catalog.ts
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

// node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.1.2-alpha.2_@deepseek-ai+cordis@4.0.2_@deepseek-ai+dsh-in_201e0f99eb7c6b9ed77157bb5f14e24e/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js
import { opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
var DSH_HOME_DIR_NAME = ".dsh";
var DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`;
var DSH_HOME_ENV = "DSH_HOME";
function defaultDshHome() {
  return join(homedir(), DSH_HOME_DIR_NAME);
}
function expandHomePath(path3) {
  if (path3 === "~") return homedir();
  if (path3.startsWith("~/") || path3.startsWith("~\\")) return join(homedir(), path3.slice(2));
  return path3;
}
function resolveDshHome(configured, env = process.env) {
  const fromEnv = env[DSH_HOME_ENV];
  return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
function dshHomePath(...segments) {
  return join(resolveDshHome(), ...segments);
}

// src/server/catalog.ts
var CATALOG_VERSION = 1;
function catalogFile() {
  return dshHomePath("dsh-a6api", "catalog.json");
}
function legacyCatalogFile() {
  return dshHomePath("dsh-a6api-catalog.json");
}
function ensureRelocated() {
  const target = catalogFile();
  const legacy = legacyCatalogFile();
  try {
    fs.accessSync(target);
    try {
      fs.unlinkSync(legacy);
    } catch {
    }
    return;
  } catch {
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(legacy, target);
  } catch {
  }
}
var catalogCache = null;
function ensureLoaded() {
  if (catalogCache) return catalogCache;
  ensureRelocated();
  const sources = [catalogFile(), legacyCatalogFile()];
  for (const file of sources) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const j = JSON.parse(raw);
      catalogCache = Array.isArray(j?.entries) ? j.entries.filter((e) => e && typeof e.id === "string") : [];
      if (file !== catalogFile()) {
        try {
          fs.unlinkSync(file);
        } catch {
        }
      }
      return catalogCache;
    } catch {
    }
  }
  catalogCache = [];
  return catalogCache;
}
function getCatalog() {
  return ensureLoaded();
}
function getCatalogEntry(id) {
  const t = id.toLowerCase();
  return ensureLoaded().find((e) => e.id.toLowerCase() === t);
}
var writeChain = Promise.resolve();
function enqueueWrite(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => {
    },
    () => {
    }
  );
  return next;
}
async function writeCatalog(entries) {
  const file = catalogFile();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ version: CATALOG_VERSION, entries }, null, 2), {
    encoding: "utf8",
    mode: 420
  });
  await fsp.rename(tmp, file);
  catalogCache = entries;
}
async function upsertCatalogEntries(entries) {
  await enqueueWrite(async () => {
    const cur = ensureLoaded();
    const map = /* @__PURE__ */ new Map();
    for (const e of cur) map.set(e.id.toLowerCase(), e);
    for (const e of entries) {
      const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== void 0));
      const key = clean.id.toLowerCase();
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...clean } : clean);
    }
    await writeCatalog([...map.values()]);
  });
}
async function clearCatalog() {
  await enqueueWrite(async () => {
    await writeCatalog([]);
  });
}
async function updateCatalogEntry(id, patch) {
  let result = null;
  await enqueueWrite(async () => {
    const cur = ensureLoaded();
    const idx = cur.findIndex((e) => e.id.toLowerCase() === id.toLowerCase());
    if (idx < 0) return;
    const next = { ...cur[idx], ...patch, id: cur[idx].id, updatedAt: Date.now() };
    for (const k of Object.keys(patch)) {
      if (patch[k] === null) delete next[k];
    }
    const list = cur.slice();
    list[idx] = next;
    await writeCatalog(list);
    result = next;
  });
  return result;
}
var BRAND_NORMALIZE = {
  meituan: "MeiTuan",
  tencent: "Tencent",
  xiaomi: "Xiaomi",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  zhipu: "Zhipu",
  moonshot: "Moonshot",
  alibaba: "Alibaba",
  minimax: "MiniMax"
};
function normalizeBrand(raw) {
  const k = String(raw || "").toLowerCase();
  return BRAND_NORMALIZE[k] || raw || "Other";
}
function inferBrand(modelId) {
  const m = modelId.toLowerCase();
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("chatgpt")) return "OpenAI";
  if (m.startsWith("claude")) return "Anthropic";
  if (m.startsWith("gemini") || m.startsWith("google") || m.startsWith("imagen")) return "Google";
  if (m.startsWith("deepseek")) return "DeepSeek";
  if (m.startsWith("grok")) return "xAI";
  if (m.startsWith("glm") || m.startsWith("zhipu") || m.startsWith("cog")) return "Zhipu";
  if (m.startsWith("kimi") || m.startsWith("moonshot")) return "Moonshot";
  if (m.startsWith("qwen")) return "Alibaba";
  if (m.startsWith("minimax")) return "MiniMax";
  if (m.startsWith("mimo") || m.startsWith("xiaomi")) return "Xiaomi";
  if (m.startsWith("hunyuan") || m.startsWith("tencent") || m.startsWith("hy")) return "Tencent";
  return "Other";
}
var DEFAULT_REASONING_EFFORTS = {
  off: null,
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
};
function resolveModelMeta(modelId) {
  const entry = getCatalogEntry(modelId);
  if (entry) {
    return {
      id: entry.id,
      name: entry.name || entry.id,
      brand: entry.brand || inferBrand(entry.id),
      contextWindow: entry.contextWindow ?? 262144,
      maxTokens: entry.maxTokens ?? 32768,
      modalities: entry.input && entry.input.length > 0 ? [...entry.input] : ["text"],
      ...entry.reasoningEfforts && typeof entry.reasoningEfforts === "object" && Object.keys(entry.reasoningEfforts).length > 0 ? {
        reasoningEfforts: Object.fromEntries(
          Object.entries(entry.reasoningEfforts).filter(([, v]) => v !== null && v !== void 0)
        )
      } : {}
    };
  }
  const lowerId = modelId.toLowerCase();
  const isVision = lowerId.includes("vision") || lowerId.includes("vl") || lowerId.includes("image");
  const hasReasoning = lowerId.includes("think") || lowerId.includes("reason") || lowerId.includes("pro") || lowerId.includes("sol");
  return {
    id: modelId,
    name: modelId,
    brand: inferBrand(modelId),
    contextWindow: 262144,
    maxTokens: 32768,
    modalities: isVision ? ["text", "image"] : ["text"],
    ...hasReasoning ? { thinkingFormat: "deepseek" } : {}
  };
}
var MARKET_SEARCH = "https://a6api.com/api/marketplace/channels/search";
var PAGE_SIZE = 500;
var CONCURRENCY = 6;
function buildWebHeaders(userId, accessToken) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  };
  const uid = userId ? String(userId).trim() : "";
  const token = accessToken ? String(accessToken).trim() : "";
  if (uid) headers["New-Api-User"] = uid;
  if (token) {
    headers["Authorization"] = token;
    headers["Cookie"] = `session=${token}`;
  }
  return headers;
}
async function fetchMarketplaceModels(userId, accessToken) {
  if (!userId && !accessToken) {
    throw new Error("\u9700\u5148\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u624D\u80FD\u83B7\u53D6\u5E02\u573A\u6A21\u578B");
  }
  const headers = buildWebHeaders(userId, accessToken);
  const first = await (async () => {
    const res = await fetch(`${MARKET_SEARCH}?view=list&page=1&page_size=${PAGE_SIZE}`, {
      headers,
      signal: AbortSignal.timeout(15e3)
    });
    if (!res.ok) throw new Error(`A6API \u5E02\u573A\u63A5\u53E3 HTTP ${res.status}`);
    return res.json();
  })();
  const total = Number(first?.data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const all = [...first?.data?.items || []];
  let failedPages = 0;
  let idx = 2;
  const worker = async () => {
    while (idx <= pages) {
      const p = idx++;
      try {
        const res = await fetch(`${MARKET_SEARCH}?view=list&page=${p}&page_size=${PAGE_SIZE}`, {
          headers,
          signal: AbortSignal.timeout(15e3)
        });
        const j = await res.json();
        all.push(...j?.data?.items || []);
      } catch (err) {
        failedPages++;
        console.warn("[dsh-a6api] fetchMarketplaceModels page", p, "failed:", err?.message || err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const byModel = /* @__PURE__ */ new Map();
  for (const it of all) {
    const name2 = it?.model_name;
    if (!name2) continue;
    if (!byModel.has(name2)) {
      byModel.set(name2, {
        id: String(name2),
        brand: normalizeBrand(it?.brand),
        // 默认声明 DSH 全部思考档位（用户可修改；upsert 仅补缺失字段，已有自定义不受影响）
        reasoningEfforts: { ...DEFAULT_REASONING_EFFORTS }
      });
    }
  }
  const models = [...byModel.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { models, failedPages };
}
var OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
var OR_TTL_MS = 60 * 60 * 1e3;
var orCache = null;
async function getOpenRouterModels() {
  if (orCache && Date.now() - orCache.at < OR_TTL_MS) return orCache.models;
  try {
    const res = await fetch(OPENROUTER_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(2e4)
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const j = await res.json();
    if (!Array.isArray(j?.data)) throw new Error("OpenRouter \u8FD4\u56DE\u683C\u5F0F\u5F02\u5E38");
    orCache = { at: Date.now(), models: j.data };
    return orCache.models;
  } catch (err) {
    if (orCache) return orCache.models;
    throw err;
  }
}
var tailOf = (s) => String(s).split("/").pop() || "";
function matchOpenRouter(models, target) {
  const t = target.toLowerCase();
  const tTail = tailOf(t);
  const norm = (s) => s.toLowerCase().replace(/[\s_.]+/g, "-");
  const byTail = models.find((m) => tailOf(String(m.id)).toLowerCase() === tTail);
  if (byTail) return byTail;
  const nTail = norm(tTail);
  const byNorm = models.find((m) => norm(tailOf(String(m.id))) === nTail);
  if (byNorm) return byNorm;
  const stripped = tTail.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8}|-\d{2,4}|\d\.\d+)$/, "");
  if (stripped && stripped !== tTail) {
    const byStripped = models.find((m) => tailOf(String(m.id)).toLowerCase() === stripped);
    if (byStripped) return byStripped;
  }
  const tSeg = t.split("/").pop() || t;
  return models.find((m) => {
    const id = String(m.id).toLowerCase();
    if (!id.includes(t)) return false;
    const tailSeg = id.split("/").pop() || "";
    return tailSeg === t || tailSeg.split("-").includes(tSeg);
  }) || null;
}
function orModalities(m) {
  const set = /* @__PURE__ */ new Set();
  const input = m?.architecture?.input_modalities || [];
  for (const mod of input) {
    const k = String(mod).toLowerCase();
    if (k === "text") set.add("text");
    else if (k === "image") set.add("image");
  }
  return [...set];
}
async function queryOpenRouter(ids) {
  const uniq = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
  if (uniq.length === 0) return { updated: [], notFound: [] };
  const models = await getOpenRouterModels();
  const updated = [];
  const notFound = [];
  for (const id of uniq) {
    const hit = matchOpenRouter(models, id);
    if (!hit) {
      notFound.push(id);
      continue;
    }
    const patch = {
      updatedAt: Date.now()
    };
    const ctx = hit.context_length ?? hit.top_provider?.context_length;
    if (ctx != null && Number(ctx) > 0) patch.contextWindow = Number(ctx);
    const maxOut = hit.top_provider?.max_completion_tokens ?? hit.max_completion_tokens;
    if (maxOut != null && Number(maxOut) > 0) patch.maxTokens = Number(maxOut);
    const mods = orModalities(hit);
    if (mods.length > 0) patch.input = mods;
    updated.push({ id, ...patch });
  }
  if (updated.length > 0) {
    await upsertCatalogEntries(updated);
  }
  return { updated, notFound };
}

// src/server/a6api-client.ts
function cleanBaseUrl(url) {
  if (!url) return "https://api.a6api.com";
  return url.trim().replace(/\/+$/, "");
}
function formatRelativeTime(timestampSec) {
  if (!timestampSec || timestampSec <= 0) return "\u521A\u521A";
  const now = Math.floor(Date.now() / 1e3);
  const diff = now - timestampSec;
  if (diff < 0) return "\u521A\u521A";
  if (diff < 60) return "\u521A\u521A";
  if (diff < 3600) return `${Math.floor(diff / 60)} \u5206\u949F\u524D`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(diff / 86400)} \u5929\u524D`;
}
function formatCnyPrice(micros, exchangeRate = 6.7209) {
  if (micros === void 0 || micros === null) return "\u2014";
  if (micros === 0) return "\xA50";
  const usd = micros / 1e6;
  const cny = usd * exchangeRate;
  if (cny < 1e-4) return `\xA5${cny.toFixed(6)}`;
  if (cny < 0.01) return `\xA5${cny.toFixed(4)}`;
  if (cny < 1) return `\xA5${cny.toFixed(4)}`;
  return `\xA5${cny.toFixed(3)}`;
}
var BLENDED_OUT_SHARE = 35e-4;
function computeBlendedPrice100m(inMicros, cacheReadMicros, outMicros, cacheHitRatePct, exchangeRate) {
  const inY = inMicros / 1e6 * exchangeRate;
  const hitY = cacheReadMicros / 1e6 * exchangeRate;
  const outY = outMicros / 1e6 * exchangeRate;
  if (inY <= 0 && hitY <= 0 && outY <= 0) return void 0;
  const h = Math.min(1, Math.max(0, cacheHitRatePct / 100));
  const inShare = 1 - BLENDED_OUT_SHARE;
  const per1M = h * inShare * hitY + (1 - h) * inShare * inY + BLENDED_OUT_SHARE * outY;
  return per1M * 100;
}
function buildWebHeaders2(userId, accessToken) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  };
  const uid = userId ? String(userId).trim() : "";
  if (uid) {
    headers["New-Api-User"] = uid;
  }
  if (accessToken && accessToken.trim()) {
    const raw = accessToken.trim();
    if (raw.startsWith("session=")) {
      headers["Cookie"] = raw;
    } else if (raw.includes(";")) {
      headers["Cookie"] = raw;
    } else {
      headers["Authorization"] = raw;
      headers["Cookie"] = `session=${raw}`;
    }
  }
  return headers;
}
async function fetchBalance(baseURL, apiKey, userId, accessToken) {
  const cleanUrl = cleanBaseUrl(baseURL);
  let hasAccountAuth = false;
  let accountBalanceUsd = 0;
  let accountBalanceFormatted = "\u672A\u8FDE\u63A5";
  let accountBalanceCnyFormatted = "";
  let username;
  let responseUserId = userId;
  let usedUsd = 0;
  let requestCount = 0;
  if (userId || accessToken) {
    const candidates = ["https://a6api.com/api/user/self", `${cleanUrl}/api/user/self`];
    const uniqueCandidates = [...new Set(candidates)];
    for (const url of uniqueCandidates) {
      try {
        const res = await fetch(url, {
          headers: buildWebHeaders2(userId, accessToken),
          signal: AbortSignal.timeout(6e3)
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.data && json.data.quota !== void 0) {
            const quota = Number(json.data.quota || 0);
            const rawUsed = Number(json.data.used_quota || 0);
            const usd = Number((quota / 5e5).toFixed(4));
            const cny = Number((usd * 6.7209).toFixed(2));
            const used = Number((rawUsed / 5e5).toFixed(4));
            hasAccountAuth = true;
            accountBalanceUsd = usd;
            accountBalanceFormatted = `$${usd.toFixed(2)}`;
            accountBalanceCnyFormatted = `\u2248 \xA5${cny.toFixed(2)}`;
            usedUsd = used;
            requestCount = Number(json.data.request_count || 0);
            username = json.data.username || json.data.display_name || void 0;
            if (json.data.id) responseUserId = json.data.id;
            break;
          }
        }
      } catch {
      }
    }
  }
  if (!hasAccountAuth && apiKey && apiKey.trim()) {
    try {
      const usageRes = await fetch(`${cleanUrl}/v1/dashboard/billing/usage?start_date=2024-01-01&end_date=2030-12-31`, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(6e3)
      }).catch(() => null);
      if (usageRes && usageRes.ok) {
        const usageJson = await usageRes.json();
        usedUsd = Number(usageJson?.total_usage || 0);
      }
    } catch {
    }
  }
  if (!hasAccountAuth && (!apiKey || !apiKey.trim()) && (!userId || !userId.trim())) {
    return null;
  }
  return {
    hasAccountAuth,
    accountBalanceUsd,
    accountBalanceFormatted,
    accountBalanceCnyFormatted,
    usedUsd,
    usedFormatted: `$${usedUsd.toFixed(2)}`,
    requestCount,
    username,
    userId: responseUserId,
    isLow: hasAccountAuth ? accountBalanceUsd < 0.5 : false,
    updatedAt: Date.now()
  };
}
async function fetchTokenModels(baseURL, apiKey) {
  const cleanUrl = cleanBaseUrl(baseURL);
  if (!apiKey || !apiKey.trim()) return [];
  const endpoints = [`${cleanUrl}/v1/models`, `${cleanUrl}/models`];
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(8e3)
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data.map((m) => String(m.id || m.name)).filter(Boolean);
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    console.warn("[dsh-a6api] fetchTokenModels failed:", lastErr);
  }
  return [];
}
async function fetchRecentLogs(userId, accessToken, limit = 30) {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch(`https://a6api.com/api/log/self?p=1&page_size=${limit}&type=0`, {
      headers: buildWebHeaders2(userId, accessToken),
      signal: AbortSignal.timeout(8e3)
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data?.items)) {
        return json.data.items.map((it) => {
          const rawQuota = Number(it.quota || 0);
          const costUsd = rawQuota / 5e5;
          let costFormatted = "$0.00";
          if (costUsd > 0) {
            if (costUsd < 1e-4) costFormatted = `$${costUsd.toFixed(6)}`;
            else if (costUsd < 0.01) costFormatted = `$${costUsd.toFixed(4)}`;
            else costFormatted = `$${costUsd.toFixed(4)}`;
          }
          const rawChannel = Number(it.channel || 0);
          let channelId = rawChannel > 0 ? rawChannel : void 0;
          if (!channelId && it.other) {
            try {
              const otherObj = JSON.parse(it.other);
              if (otherObj.actual_channel_id && Number(otherObj.actual_channel_id) > 0) {
                channelId = Number(otherObj.actual_channel_id);
              } else if (otherObj.billed_channel_id && Number(otherObj.billed_channel_id) > 0) {
                channelId = Number(otherObj.billed_channel_id);
              }
            } catch {
            }
          }
          const isError = it.type !== 2 || it.other && (it.other.includes('"request_final_status":"failed"') || it.other.includes('"request_final_status":"error"') || it.other.includes('"request_final_status":"upstream_error"')) || Boolean(it.content && it.content.startsWith("status_code="));
          return {
            id: it.id || it.request_id || String(Math.random()),
            created_at: Number(it.created_at || Date.now() / 1e3),
            model_name: it.model_name || it.marketplace_model_name || "",
            channel: channelId,
            channel_name: it.channel_name || (channelId ? `\u5546\u6237 #${channelId}` : void 0),
            token_id: it.token_id !== void 0 && it.token_id !== null ? Number(it.token_id) : void 0,
            prompt_tokens: Number(it.prompt_tokens || 0),
            completion_tokens: Number(it.completion_tokens || 0),
            use_time: Number(it.use_time || 0),
            quota: rawQuota,
            cost_usd: costUsd,
            cost_formatted: costFormatted,
            token_name: it.token_name || "API",
            status: isError ? "error" : "success",
            other: it.other,
            raw: it
          };
        });
      }
    }
  } catch (err) {
    console.warn("[dsh-a6api] fetchRecentLogs error:", err);
  }
  return [];
}
async function fetchChannelDetails(channelId, userId, accessToken, targetModelName, logSnapshot) {
  if (!channelId) return null;
  const targetName = targetModelName || "";
  const meta = resolveModelMeta(targetName);
  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/search?channel_id=${channelId}&view=list&page=1&page_size=20`,
      {
        headers: buildWebHeaders2(userId, accessToken),
        signal: AbortSignal.timeout(8e3)
      }
    );
    if (res.ok) {
      const json = await res.json();
      const items = json?.data?.items || [];
      if (items.length > 0) {
        const item = (targetName ? items.find((it) => it.model_name?.toLowerCase() === targetName.toLowerCase()) : null) || items[0];
        const rate = Number(item.realtime_ratio_exchange_rate || 6.7209);
        const inMicros = Number(item.input_price_micros || 0);
        const outMicros = Number(item.output_price_micros || 0);
        const cacheReadMicros = Number(item.cache_read_price_micros || 0);
        const cacheWriteMicros = Number(item.cache_write_price_micros || 0);
        const labels = [];
        if (item.authenticity_guaranteed) {
          const badge = item.authenticity_guarantee_badge_key;
          if (badge === "gold") labels.push("\u4FDD\u771F \xB7 \u91D1\u6807");
          else if (badge === "silver") labels.push("\u4FDD\u771F \xB7 \u94F6\u6807");
          else if (badge === "bronze") labels.push("\u4FDD\u771F \xB7 \u94DC\u6807");
          else labels.push("\u4FDD\u771F");
        }
        if (Array.isArray(item.smart_routing_labels)) {
          for (const l of item.smart_routing_labels) {
            if (l === "stable" && !labels.includes("\u7A33\u5B9A")) labels.push("\u7A33\u5B9A");
            if (l === "cheap" && !labels.includes("\u4F4E\u4EF7")) labels.push("\u4F4E\u4EF7");
            if (l === "fast" && !labels.includes("\u9AD8\u901F")) labels.push("\u9AD8\u901F");
            if (l === "quality" && !labels.includes("\u9AD8\u8D28")) labels.push("\u9AD8\u8D28");
          }
        }
        if (labels.length === 0) {
          labels.push("\u7A33\u5B9A", "\u4F4E\u4EF7", "\u9AD8\u901F", "\u9AD8\u8D28");
        }
        let official_price;
        if (item.official_price && item.official_price.input_price_micros !== void 0) {
          const offIn = Number(item.official_price.input_price_micros || 0);
          const offOut = Number(item.official_price.output_price_micros || 0);
          const offCR = Number(item.official_price.cache_read_price_micros || 0);
          const offCW = Number(item.official_price.cache_write_price_micros || 0);
          official_price = {
            input_price_micros: offIn,
            output_price_micros: offOut,
            cache_read_price_micros: offCR,
            cache_write_price_micros: offCW,
            input_cny: formatCnyPrice(offIn, rate),
            output_cny: formatCnyPrice(offOut, rate),
            cache_read_cny: formatCnyPrice(offCR, rate),
            cache_write_cny: formatCnyPrice(offCW, rate)
          };
        } else if (meta.officialPriceMicros) {
          const offIn = meta.officialPriceMicros.input;
          const offOut = meta.officialPriceMicros.output;
          const offCR = meta.officialPriceMicros.cacheRead;
          const offCW = meta.officialPriceMicros.cacheWrite;
          official_price = {
            input_price_micros: offIn,
            output_price_micros: offOut,
            cache_read_price_micros: offCR,
            cache_write_price_micros: offCW,
            input_cny: formatCnyPrice(offIn, rate),
            output_cny: formatCnyPrice(offOut, rate),
            cache_read_cny: formatCnyPrice(offCR, rate),
            cache_write_cny: formatCnyPrice(offCW, rate)
          };
        }
        const successRate24h = item.success_rate_24h !== void 0 ? Number(item.success_rate_24h) / 100 : 99.3;
        const recentSuccessRate = item.recent_success_rate !== void 0 ? Number(item.recent_success_rate) / 100 : 100;
        const cacheHitRate = item.cache_hit_rate_24h !== void 0 ? Number(item.cache_hit_rate_24h) / 100 : 72;
        const lastSuccessAt = Number(item.last_success_at || item.last_test_time || 0);
        const blended100m = computeBlendedPrice100m(inMicros, cacheReadMicros, outMicros, cacheHitRate, rate);
        const ratioCny = Number(item.realtime_ratio_cny || inMicros / 1e6 * rate || 0.0341);
        const ratioFormatted = ratioCny.toFixed(4);
        return {
          listing_id: item.listing_id,
          // 归一化为数字，避免官方返回字符串 channel_id 导致严格相等比较失效（接管/固定判定依赖）
          channel_id: item.channel_id !== void 0 && item.channel_id !== null ? Number(item.channel_id) : channelId,
          channel_name: item.channel_name || `\u5546\u6237 #${channelId}`,
          supplier_name: item.supplier_name || item.supplier_nickname || "GPT\u4F4E\u4EF7",
          supplier_id: item.supplier_id || 290,
          model_name: item.model_name || targetName,
          brand: item.brand || meta.brand || "OpenAI",
          description: item.description || "\u9AD8\u5E76\u53D1 \u4E3B\u6253\u4FBF\u5B9C \u7A33\u5B9A",
          charge_type: item.charge_type || "per_token",
          charge_type_text: item.charge_type === "per_token" ? "\u6309\u91CF" : "\u6309\u91CF",
          sample_count: Number(item.sample_count || 100),
          sample_count_text: `\u8FD1 ${item.sample_count || 100} \u6B21\u6837\u672C`,
          input_price_micros: inMicros,
          output_price_micros: outMicros,
          cache_read_price_micros: cacheReadMicros,
          cache_write_price_micros: cacheWriteMicros,
          input_price_cny: formatCnyPrice(inMicros, rate),
          output_price_cny: formatCnyPrice(outMicros, rate),
          cache_read_price_cny: formatCnyPrice(cacheReadMicros, rate),
          cache_write_price_cny: formatCnyPrice(cacheWriteMicros, rate),
          official_price,
          realtime_ratio_cny: ratioCny,
          realtime_ratio_formatted: ratioFormatted,
          recent_success_rate_pct: recentSuccessRate,
          success_rate_24h_pct: successRate24h,
          success_rate_7d_pct: item.success_rate_7d !== void 0 ? Number(item.success_rate_7d) / 100 : void 0,
          success_buckets: Array.isArray(item.success_buckets) ? item.success_buckets : void 0,
          b24: Array.isArray(item.b24) ? item.b24 : void 0,
          b7d: Array.isArray(item.b7d) ? item.b7d : void 0,
          sr_24h_state: item.sr_24h_state || "rate",
          sr_7d_state: item.sr_7d_state || "no_data",
          p50_ttft_ms: Number(item.p50_ttft_ms || 2273),
          recent_p50_ms: Number(item.recent_p50_ms || item.last_test_response_ms || 2340),
          cache_hit_rate_pct: cacheHitRate,
          blended_price_100m_cny: blended100m,
          labels,
          last_success_at: lastSuccessAt,
          last_success_text: formatRelativeTime(lastSuccessAt),
          authenticity_guaranteed: Boolean(item.authenticity_guaranteed),
          authenticity_badge: item.authenticity_guarantee_badge_key,
          // 官方固定状态值是 pin_here / pin_elsewhere（早期代码误用 'pinned'，已修正）
          is_pinned: item.pin_status === "pin_here" || item.route_status === "pin_here",
          pin_status: typeof item.pin_status === "string" ? item.pin_status : void 0,
          user_channel_disabled: Boolean(item.user_channel_disabled || item.route_status === "user_disabled"),
          supplier_channel_disabled: Boolean(item.supplier_channel_disabled),
          raw: item
        };
      }
    }
  } catch (err) {
    console.warn("[dsh-a6api] fetchChannelDetails error:", err);
  }
  if (logSnapshot) {
    const rate = 6.7209;
    const inMicros = Number(logSnapshot.marketplace_price_input_micros || 20300);
    const outMicros = Number(logSnapshot.marketplace_price_output_micros || 101502);
    const cacheReadMicros = Number(logSnapshot.marketplace_price_cache_read_micros || 2030);
    const cacheWriteMicros = Number(logSnapshot.marketplace_price_cache_write_micros || 25375);
    let official_price;
    if (meta.officialPriceMicros) {
      const offIn = meta.officialPriceMicros.input;
      const offOut = meta.officialPriceMicros.output;
      const offCR = meta.officialPriceMicros.cacheRead;
      const offCW = meta.officialPriceMicros.cacheWrite;
      official_price = {
        input_price_micros: offIn,
        output_price_micros: offOut,
        cache_read_price_micros: offCR,
        cache_write_price_micros: offCW,
        input_cny: formatCnyPrice(offIn, rate),
        output_cny: formatCnyPrice(offOut, rate),
        cache_read_cny: formatCnyPrice(offCR, rate),
        cache_write_cny: formatCnyPrice(offCW, rate)
      };
    }
    const ratioCny = Number(inMicros / 1e6 * rate || 0.0341);
    return {
      listing_id: logSnapshot.marketplace_listing_id,
      channel_id: channelId,
      channel_name: logSnapshot.channel_name || `\u5546\u6237 #${channelId}`,
      supplier_name: logSnapshot.supplier_nickname || logSnapshot.channel_name || "GPT\u4F4E\u4EF7",
      supplier_id: 290,
      model_name: targetName || logSnapshot.model_name || "",
      brand: meta.brand || "OpenAI",
      description: "\u9AD8\u5E76\u53D1 \u4E3B\u6253\u4FBF\u5B9C \u7A33\u5B9A",
      charge_type: "per_token",
      charge_type_text: "\u6309\u91CF",
      sample_count: 100,
      sample_count_text: "\u8FD1 100 \u6B21\u6837\u672C",
      input_price_micros: inMicros,
      output_price_micros: outMicros,
      cache_read_price_micros: cacheReadMicros,
      cache_write_price_micros: cacheWriteMicros,
      input_price_cny: formatCnyPrice(inMicros, rate),
      output_price_cny: formatCnyPrice(outMicros, rate),
      cache_read_price_cny: formatCnyPrice(cacheReadMicros, rate),
      cache_write_price_cny: formatCnyPrice(cacheWriteMicros, rate),
      official_price,
      realtime_ratio_cny: ratioCny,
      realtime_ratio_formatted: ratioCny.toFixed(4),
      recent_success_rate_pct: 100,
      success_rate_24h_pct: 99.3,
      recent_p50_ms: Number(logSnapshot.use_time ? logSnapshot.use_time * 1e3 : 2340),
      p50_ttft_ms: 2273,
      cache_hit_rate_pct: 72,
      blended_price_100m_cny: computeBlendedPrice100m(inMicros, cacheReadMicros, outMicros, 72, rate),
      labels: ["\u7A33\u5B9A", "\u4F4E\u4EF7", "\u9AD8\u901F", "\u9AD8\u8D28"],
      last_success_at: Math.floor(Date.now() / 1e3),
      last_success_text: "\u521A\u521A",
      authenticity_guaranteed: false,
      is_pinned: false,
      user_channel_disabled: false
    };
  }
  return null;
}
async function fetchPriceFluctuation(userId, accessToken) {
  const token = (accessToken || "").trim();
  const uid = (userId || "").trim();
  if (!uid && !token) {
    return { pendingCount: 0, unseenCount: 0, totalCount: 0, authError: false };
  }
  const headers = buildWebHeaders2(uid || void 0, token || void 0);
  const url = "https://a6api.com/api/marketplace/price-notices";
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8e3) });
    if (res.status === 401 || res.status === 403) {
      console.warn("[dsh-a6api] fetchPriceFluctuation auth failed", res.status);
      return { pendingCount: 0, unseenCount: 0, totalCount: 0, authError: true };
    }
    if (!res.ok) {
      console.warn("[dsh-a6api] fetchPriceFluctuation HTTP", res.status);
      return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
    }
    const json = await res.json().catch(() => null);
    if (!json) return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
    if (json.success === false) return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
    let arr = [];
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.data)) arr = json.data;
    else if (Array.isArray(json.data?.notices)) arr = json.data.notices;
    else if (Array.isArray(json.data?.items)) arr = json.data.items;
    else if (Array.isArray(json.notices)) arr = json.notices;
    else if (Array.isArray(json.items)) arr = json.items;
    const pickWithPresent = (keys) => {
      for (const k of keys) {
        const v = json?.data?.[k] ?? json?.[k];
        if (v !== void 0 && v !== null) {
          const n = Number(v);
          if (!Number.isNaN(n)) return { value: n, present: true };
        }
      }
      return { value: 0, present: false };
    };
    const pendingPick = pickWithPresent(["pendingCount", "pending_count", "pending", "openCount"]);
    const unseenPick = pickWithPresent(["unseenCount", "unseen_count", "unseen", "has_unseen_count"]);
    let pending = pendingPick.value;
    let unseen = unseenPick.value;
    const total = arr.length;
    if (!pendingPick.present && arr.length > 0) {
      const isPendingNotice = (n) => {
        if (n?.pending === true) return true;
        const rels = Array.isArray(n?.relations) ? n.relations : [];
        if (rels.length > 0) {
          return rels.some((r) => String(r?.state ?? "").toLowerCase() === "open");
        }
        const s = String(n?.state ?? n?.status ?? "").toLowerCase();
        return s === "open" || s === "pending" || s === "effective";
      };
      const counted = arr.filter(isPendingNotice).length;
      const hasState = arr.some(
        (n) => n.state !== void 0 || n.status !== void 0 || Array.isArray(n.relations) && n.relations.length > 0
      );
      if (hasState) pending = counted;
    }
    if (!unseenPick.present && arr.length > 0) {
      unseen = arr.filter((n) => n.has_unseen === true || n.hasUnseen === true || n.unseen === true || n.is_unread === true).length;
    }
    return { pendingCount: pending, unseenCount: unseen, totalCount: total, notices: arr };
  } catch (err) {
    console.warn("[dsh-a6api] fetchPriceFluctuation error", err);
    return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
  }
}
function parseMarketplaceResult(json) {
  if (!json) return { ok: false, message: "\u7A7A\u54CD\u5E94" };
  const top = json.success === false ? json : null;
  const inner = json.data && json.data.success === false ? json.data : null;
  if (top) return { ok: false, message: top.message || "\u64CD\u4F5C\u5931\u8D25" };
  if (inner) return { ok: false, message: inner.message || "\u64CD\u4F5C\u5931\u8D25" };
  return { ok: true, data: json.data };
}
function extractArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (json.data && Array.isArray(json.data.data)) return json.data.data;
  if (json.data && Array.isArray(json.data.items)) return json.data.items;
  if (json.data && json.data.data && Array.isArray(json.data.data.items)) return json.data.data.items;
  return [];
}
async function fetchMarketplacePins(userId, accessToken) {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch("https://a6api.com/api/marketplace/pins", {
      headers: buildWebHeaders2(userId, accessToken),
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) {
      console.warn("[dsh-a6api] fetchMarketplacePins HTTP", res.status);
      return [];
    }
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) return [];
    return extractArray(json).filter((it) => it && it.model_name).map((it) => ({
      id: it.id !== void 0 ? Number(it.id) : void 0,
      token_id: Number(it.token_id || 0),
      token_name: it.token_name || void 0,
      model_name: String(it.model_name),
      channel_id: it.channel_id !== void 0 && Number(it.channel_id) > 0 ? Number(it.channel_id) : void 0,
      channel_name: it.channel_name || void 0,
      supplier_name: it.supplier_name || void 0,
      supplier_nickname: it.supplier_nickname || void 0,
      fallback_to_smart_routing: it.fallback_to_smart_routing !== void 0 ? Boolean(it.fallback_to_smart_routing) : void 0,
      created_at: it.created_at !== void 0 ? Number(it.created_at) : void 0
      // 不下发 raw：客户端 60s 轮询用 JSON 对比判断变化，raw 含易变字段会导致误判整页刷新
    }));
  } catch (err) {
    console.warn("[dsh-a6api] fetchMarketplacePins error:", err);
    return [];
  }
}
async function fetchTokens(userId, accessToken) {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch("https://a6api.com/api/token/?p=1&size=100", {
      headers: buildWebHeaders2(userId, accessToken),
      signal: AbortSignal.timeout(8e3)
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    if (!json || json.success === false) return [];
    return extractArray(json).filter((it) => it && Number(it.id) > 0).map((it) => ({
      id: Number(it.id),
      name: it.name || void 0,
      key: typeof it.key === "string" ? it.key : void 0,
      status: it.status !== void 0 ? Number(it.status) : void 0,
      raw: it
    }));
  } catch (err) {
    console.warn("[dsh-a6api] fetchTokens error:", err);
    return [];
  }
}
function friendlyActionError(err) {
  const raw = err?.message || String(err);
  if (raw.includes("aborted due to timeout") || err?.name === "TimeoutError") {
    return "\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5";
  }
  return raw;
}
async function marketplacePin(userId, accessToken, payload) {
  try {
    const res = await fetch("https://a6api.com/api/marketplace/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildWebHeaders2(userId, accessToken)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1e4)
    });
    const json = await res.json().catch(() => null);
    const result = parseMarketplaceResult(json);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return result;
  } catch (err) {
    console.warn("[dsh-a6api] marketplacePin error:", err);
    return { ok: false, message: friendlyActionError(err) };
  }
}
async function marketplaceUnpin(userId, accessToken, payload) {
  try {
    const res = await fetch("https://a6api.com/api/marketplace/unpin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildWebHeaders2(userId, accessToken)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1e4)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err) {
    console.warn("[dsh-a6api] marketplaceUnpin error:", err);
    return { ok: false, message: friendlyActionError(err) };
  }
}
async function marketplaceDisableChannel(userId, accessToken, channelId, model) {
  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/${channelId}/disable?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: buildWebHeaders2(userId, accessToken),
        signal: AbortSignal.timeout(1e4)
      }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err) {
    console.warn("[dsh-a6api] marketplaceDisableChannel error:", err);
    return { ok: false, message: friendlyActionError(err) };
  }
}
async function marketplaceRestoreChannel(userId, accessToken, channelId, model) {
  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/${channelId}/restore?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: buildWebHeaders2(userId, accessToken),
        signal: AbortSignal.timeout(1e4)
      }
    );
    const json = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err) {
    console.warn("[dsh-a6api] marketplaceRestoreChannel error:", err);
    return { ok: false, message: friendlyActionError(err) };
  }
}

// src/server/probe.ts
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
async function probeSingleModel(baseURL, apiKey, userId, accessToken, modelName) {
  const targetModel = modelName || "";
  const cleanUrl = cleanBaseUrl(baseURL);
  if (!apiKey) {
    return { modelName: targetModel, success: false, error: "\u672A\u914D\u7F6E API Key" };
  }
  const startTime = Date.now();
  let requestOk = false;
  let requestError = "";
  try {
    const res = await fetch(`${cleanUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: "user", content: "1" }],
        max_tokens: 1
      }),
      // 推理模型(如 grok-4.6)实测单次响应可达 40-90s+,阈值过短会被频繁掐断导致探测失败
      signal: AbortSignal.timeout(18e4)
    });
    if (res.ok) {
      requestOk = true;
    } else {
      const errText = await res.text();
      requestError = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
    }
  } catch (err) {
    const raw = err?.message || String(err);
    if (raw.includes("aborted due to timeout") || err?.name === "TimeoutError") {
      requestError = "\u63A2\u6D4B\u8D85\u65F6(\u9608\u503C180\u79D2) \u2014 \u63A8\u7406\u6A21\u578B\u54CD\u5E94\u8F83\u6162,\u5DF2\u4FDD\u7559\u4E0A\u6B21\u5546\u6237\u6570\u636E,\u8BF7\u7A0D\u540E\u91CD\u8BD5";
    } else {
      requestError = raw;
    }
  }
  const durationMs = Date.now() - startTime;
  if (requestOk && (userId || accessToken)) {
    await sleep(1200);
    try {
      const logs = await fetchRecentLogs(userId, accessToken, 15);
      const minTimestamp = Math.floor(startTime / 1e3) - 10;
      const log = logs.find(
        (it) => it.model_name?.toLowerCase() === targetModel.toLowerCase() && Number(it.created_at || 0) >= minTimestamp
      ) || logs.find((it) => it.model_name?.toLowerCase() === targetModel.toLowerCase());
      if (log && log.channel) {
        const channelId = Number(log.channel);
        let logSnapshot = null;
        if (log.other) {
          try {
            logSnapshot = { ...JSON.parse(log.other), channel_name: log.channel_name, model_name: log.model_name };
          } catch {
          }
        }
        const merchant = await fetchChannelDetails(channelId, userId, accessToken, targetModel, logSnapshot);
        return {
          modelName: targetModel,
          success: true,
          channelId,
          channelName: log.channel_name,
          // 该次请求由 API Key 发起，日志中记录的 token_id 即该 Key 的令牌 ID
          tokenId: log.token_id !== void 0 && Number(log.token_id) > 0 ? Number(log.token_id) : void 0,
          merchant,
          durationMs
        };
      }
    } catch (err) {
      console.warn(`[dsh-a6api] Log lookup error for ${targetModel}:`, err);
    }
  }
  return {
    modelName: targetModel,
    success: requestOk,
    durationMs,
    error: requestOk ? void 0 : requestError
  };
}
async function getKnownMerchantsFromLogs(userId, accessToken, modelNames = [], logs) {
  if (!userId && !accessToken || modelNames.length === 0) return {};
  const result = {};
  try {
    const items = logs !== void 0 ? logs : await fetchRecentLogs(userId, accessToken, 50);
    const sorted = items.slice().sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
    const modelToLog = /* @__PURE__ */ new Map();
    for (const log of sorted) {
      const mName = log.model_name;
      const chId = Number(log.channel);
      if (mName && chId && !modelToLog.has(mName.toLowerCase())) {
        modelToLog.set(mName.toLowerCase(), log);
      }
    }
    const matchedEntries = [];
    for (const name2 of modelNames) {
      const log = modelToLog.get(name2.toLowerCase());
      if (log) {
        matchedEntries.push({ modelName: name2, log });
      }
    }
    for (let i = 0; i < matchedEntries.length; i += 4) {
      const batch = matchedEntries.slice(i, i + 4);
      await Promise.all(
        batch.map(async ({ modelName, log }) => {
          try {
            const channelId = Number(log.channel);
            let logSnapshot = null;
            if (log.other) {
              try {
                logSnapshot = { ...JSON.parse(log.other), channel_name: log.channel_name, model_name: log.model_name };
              } catch {
              }
            }
            const card = await fetchChannelDetails(channelId, userId, accessToken, modelName, logSnapshot);
            if (card) {
              result[modelName] = card;
            }
          } catch {
          }
        })
      );
    }
  } catch (err) {
    console.warn("[dsh-a6api] getKnownMerchantsFromLogs error:", err);
  }
  return result;
}

// src/server/sync.ts
import * as fs2 from "node:fs";
import * as fsp2 from "node:fs/promises";
import * as path2 from "node:path";
import * as os from "node:os";
var A6API_CRED_REF = "A6API_API_KEY";
var A6API_TOKEN_REF = "A6API_ACCESS_TOKEN";
var A6API_USER_REF = "A6API_USER_ID";
var SETTINGS_NS = "llm-pi-ai";
var PROVIDER_KEY = "a6api";
var DEFAULT_BASE_URL = "https://api.a6api.com";
var LEGACY_CONFIG_NAME = "dsh-a6api-config.json";
async function atomicWriteFile(filePath, content, mode = 384) {
  const dir = path2.dirname(filePath);
  await fsp2.mkdir(dir, { recursive: true });
  const tmpPath = path2.join(dir, `.${path2.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fsp2.writeFile(tmpPath, content, { mode });
  await fsp2.rename(tmpPath, filePath);
}
function dshHome() {
  return process.env.DSH_HOME || path2.join(os.homedir(), ".dsh");
}
function legacyConfigFile() {
  return path2.join(dshHome(), LEGACY_CONFIG_NAME);
}
function credentialsFile() {
  return path2.join(dshHome(), ".credentials.yaml");
}
function settingsFile() {
  return path2.join(dshHome(), "settings.yaml");
}
function getCredentials(ctx) {
  try {
    if (ctx && typeof ctx.get === "function") return ctx.get("credentials");
  } catch {
  }
  return void 0;
}
function getSettings(ctx) {
  try {
    if (ctx && typeof ctx.get === "function") return ctx.get("settings");
  } catch {
  }
  return void 0;
}
function stripV1(baseURL) {
  return baseURL.replace(/\/v1\/?$/, "");
}
async function readCredentialKey(refKey) {
  try {
    const yaml = await fsp2.readFile(credentialsFile(), "utf8");
    let inRefs = false;
    for (const line of yaml.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 0) {
        inRefs = trimmed.startsWith("refs:");
        continue;
      }
      if (!inRefs) continue;
      const m = /^([A-Za-z0-9_.\-]+):\s*(.*)$/.exec(trimmed);
      if (m && m[1] === refKey) {
        let val = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        }
        return val || null;
      }
    }
  } catch {
  }
  return null;
}
async function writeCredentialKey(refKey, value) {
  const cFile = credentialsFile();
  let yaml = "";
  try {
    yaml = await fsp2.readFile(cFile, "utf8");
  } catch {
    yaml = "version: 1\nrefs:\n";
  }
  const lines = yaml.split(/\r?\n/);
  let inRefs = false;
  let refsLineIdx = -1;
  let foundIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent === 0) {
      if (trimmed.startsWith("refs:")) {
        inRefs = true;
        refsLineIdx = i;
      } else {
        inRefs = false;
      }
      continue;
    }
    if (inRefs) {
      const m = /^([A-Za-z0-9_.\-]+):/.exec(trimmed);
      if (m && m[1] === refKey) {
        foundIdx = i;
        break;
      }
    }
  }
  if (value === "") {
    if (foundIdx >= 0) lines.splice(foundIdx, 1);
  } else {
    if (foundIdx >= 0) {
      lines[foundIdx] = `  ${refKey}: ${JSON.stringify(value)}`;
    } else {
      if (refsLineIdx >= 0) {
        lines.splice(refsLineIdx + 1, 0, `  ${refKey}: ${JSON.stringify(value)}`);
      } else {
        lines.push("refs:", `  ${refKey}: ${JSON.stringify(value)}`);
      }
    }
  }
  await atomicWriteFile(cFile, lines.join("\n"), 384);
}
async function readRawConfiguredModels() {
  try {
    const yaml = await fsp2.readFile(settingsFile(), "utf8");
    const lines = yaml.split(/\r?\n/);
    let inA6 = false;
    let inModels = false;
    const modelIds = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 4 && trimmed.startsWith("a6api:")) {
        inA6 = true;
        inModels = false;
        continue;
      }
      if (inA6 && indent <= 4 && !trimmed.startsWith("a6api:")) {
        inA6 = false;
        inModels = false;
      }
      if (inA6 && indent === 6 && trimmed.startsWith("models:")) {
        inModels = true;
        continue;
      }
      if (inModels && indent === 8 && trimmed.startsWith("- id:")) {
        const id = trimmed.replace(/^- id:\s*/, "").trim();
        if (id) modelIds.push(id);
      }
    }
    return modelIds;
  } catch {
    return [];
  }
}
async function readRawA6apiBaseURL() {
  try {
    const yaml = await fsp2.readFile(settingsFile(), "utf8");
    let inA6 = false;
    for (const line of yaml.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 4 && trimmed.startsWith("a6api:")) {
        inA6 = true;
        continue;
      }
      if (inA6 && indent <= 4 && !trimmed.startsWith("a6api:")) inA6 = false;
      if (inA6 && indent === 6 && trimmed.startsWith("baseURL:")) {
        return trimmed.replace(/^baseURL:\s*/, "").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
  }
  return "";
}
function scanA6apiBlockRange(lines) {
  let inLlm = false;
  let inProviders = false;
  let inA6 = false;
  let a6Start = -1;
  let a6End = -1;
  let providersLineIdx = -1;
  let llmLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent === 0) {
      inLlm = trimmed.startsWith("llm-pi-ai:");
      if (inLlm) llmLineIdx = i;
      inProviders = false;
      inA6 = false;
      continue;
    }
    if (inLlm && indent === 2 && trimmed.startsWith("providers:")) {
      inProviders = true;
      providersLineIdx = i;
      inA6 = false;
      continue;
    }
    if (inProviders && indent === 4) {
      if (trimmed.startsWith("a6api:")) {
        inA6 = true;
        a6Start = i;
        a6End = i + 1;
      } else {
        if (inA6) {
          a6End = i;
          inA6 = false;
        }
      }
      continue;
    }
    if (inA6 && indent > 4) {
      a6End = i + 1;
    } else if (inA6 && indent <= 4) {
      a6End = i;
      inA6 = false;
    }
  }
  return { a6Start, a6End, providersLineIdx, llmLineIdx };
}
async function writeRawA6apiBlock(baseURL, modelIds) {
  const sFile = settingsFile();
  let yaml = "";
  try {
    yaml = await fsp2.readFile(sFile, "utf8");
  } catch {
    yaml = "llm-pi-ai:\n  providers:\n";
  }
  const modelEntries = modelIds.map((id) => {
    const entry = getCatalogEntry(id);
    const lines2 = [`        - id: ${id}`];
    if (entry?.name) lines2.push(`          name: ${JSON.stringify(String(entry.name).replace(/\r?\n/g, " "))}`);
    if (entry?.contextWindow != null) lines2.push(`          contextWindow: ${entry.contextWindow}`);
    if (entry?.maxTokens != null) lines2.push(`          maxTokens: ${entry.maxTokens}`);
    if (entry?.input && entry.input.length > 0) {
      lines2.push(`          input:`);
      for (const m of entry.input) lines2.push(`            - ${m}`);
    }
    if (entry?.reasoningEfforts && typeof entry.reasoningEfforts === "object") {
      lines2.push(`          reasoningEfforts:`);
      for (const [k, v] of Object.entries(entry.reasoningEfforts)) {
        lines2.push(v ? `            ${k}: ${v}` : `            ${k}: `);
      }
    }
    return lines2.join("\n");
  });
  const dshBaseUrl = baseURL.endsWith("/v1") ? baseURL : `${baseURL.replace(/\/+$/, "")}/v1`;
  const a6apiBlockLines = [
    `    a6api:`,
    `      displayName: A6API`,
    `      apiKeyEnv: ${A6API_CRED_REF}`,
    `      api: openai-completions`,
    `      baseURL: ${dshBaseUrl}`,
    `      models:`,
    ...modelEntries
  ];
  const lines = yaml.split(/\r?\n/);
  const { a6Start, a6End, providersLineIdx, llmLineIdx } = scanA6apiBlockRange(lines);
  if (a6Start >= 0) {
    lines.splice(a6Start, a6End - a6Start, ...a6apiBlockLines);
  } else if (providersLineIdx >= 0) {
    lines.splice(providersLineIdx + 1, 0, ...a6apiBlockLines);
  } else if (llmLineIdx >= 0) {
    lines.splice(llmLineIdx + 1, 0, `  providers:`, ...a6apiBlockLines);
  } else {
    lines.push(`llm-pi-ai:`, `  providers:`, ...a6apiBlockLines);
  }
  await atomicWriteFile(sFile, lines.join("\n"), 420);
}
async function removeRawA6apiBlock() {
  const sFile = settingsFile();
  let yaml = "";
  try {
    yaml = await fsp2.readFile(sFile, "utf8");
  } catch {
    return;
  }
  const lines = yaml.split(/\r?\n/);
  const { a6Start, a6End, providersLineIdx, llmLineIdx } = scanA6apiBlockRange(lines);
  if (a6Start < 0) return;
  lines.splice(a6Start, a6End - a6Start);
  if (providersLineIdx >= 0) {
    let hasProvider = false;
    for (let i = providersLineIdx + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = lines[i].match(/^\s*/)?.[0].length ?? 0;
      if (indent <= 2) break;
      if (indent === 4) {
        hasProvider = true;
        break;
      }
    }
    if (!hasProvider) lines.splice(providersLineIdx, 1);
  }
  if (llmLineIdx >= 0) {
    let hasLlmKey = false;
    for (let i = llmLineIdx + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = lines[i].match(/^\s*/)?.[0].length ?? 0;
      if (indent === 0) break;
      if (indent === 2) {
        hasLlmKey = true;
        break;
      }
    }
    if (!hasLlmKey) lines.splice(llmLineIdx, 1);
  }
  await atomicWriteFile(sFile, lines.join("\n"), 420);
}
function normalizeLegacy(parsed) {
  return {
    apiKey: typeof parsed?.apiKey === "string" ? parsed.apiKey : "",
    accessToken: String(parsed?.accessToken || parsed?.systemAccessToken || parsed?.sessionCookie || ""),
    userId: String(parsed?.userId || ""),
    baseURL: typeof parsed?.baseURL === "string" && parsed.baseURL ? parsed.baseURL : DEFAULT_BASE_URL,
    activeModels: Array.isArray(parsed?.activeModels) ? parsed.activeModels.filter((m) => typeof m === "string") : []
  };
}
async function readLegacyConfig() {
  try {
    const raw = await fsp2.readFile(legacyConfigFile(), "utf8");
    const legacy = normalizeLegacy(JSON.parse(raw));
    return {
      baseURL: legacy.baseURL,
      apiKey: legacy.apiKey,
      accessToken: legacy.accessToken || void 0,
      userId: legacy.userId || void 0,
      activeModels: legacy.activeModels
    };
  } catch {
    return null;
  }
}
function buildA6apiBlock(baseURL, modelIds) {
  const models = modelIds.map((id) => {
    const entry = getCatalogEntry(id);
    const m = { id };
    if (entry?.name) m.name = entry.name;
    if (entry?.contextWindow != null) m.contextWindow = entry.contextWindow;
    if (entry?.maxTokens != null) m.maxTokens = entry.maxTokens;
    if (entry?.input && entry.input.length > 0) m.input = [...entry.input];
    if (entry?.reasoningEfforts !== void 0 && entry.reasoningEfforts !== null) {
      m.reasoningEfforts = entry.reasoningEfforts;
    }
    return m;
  });
  return {
    displayName: "A6API",
    apiKeyEnv: A6API_CRED_REF,
    api: "openai-completions",
    baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL.replace(/\/+$/, "")}/v1`,
    models
  };
}
function createConfigAccess(ctx) {
  let migration = null;
  const ensureMigrated = () => {
    if (!migration) {
      migration = doMigrate().catch((err) => {
        console.warn("[dsh-a6api] \u65E7\u914D\u7F6E\u8FC1\u79FB\u5931\u8D25\uFF08\u4FDD\u7559\u65E7\u6587\u4EF6\u8BFB\u53D6\u515C\u5E95\uFF09:", err?.message || err);
      });
    }
    return migration;
  };
  const resolveRef = async (creds, ref) => {
    try {
      if (creds && typeof creds.resolve === "function") {
        const r = await creds.resolve(ref);
        return r && typeof r.value === "string" ? r.value : "";
      }
    } catch (err) {
      console.warn(`[dsh-a6api] credentials.resolve(${ref}) failed:`, err?.message || err);
    }
    return await readCredentialKey(ref) || "";
  };
  const readA6apiBlock = async (settings) => {
    try {
      if (settings && typeof settings.get === "function") {
        const llm = settings.get(SETTINGS_NS);
        const block = llm && llm.providers ? llm.providers[PROVIDER_KEY] : void 0;
        if (block && typeof block === "object") {
          return {
            baseURL: typeof block.baseURL === "string" ? block.baseURL : void 0,
            models: Array.isArray(block.models) ? block.models.map((m) => typeof m === "string" ? m : m && typeof m.id === "string" ? m.id : "").filter(Boolean) : []
          };
        }
      }
    } catch (err) {
      console.warn("[dsh-a6api] settings.get(llm-pi-ai) failed:", err?.message || err);
    }
    return null;
  };
  const readConfig = async () => {
    await ensureMigrated();
    const creds = getCredentials(ctx);
    const settings = getSettings(ctx);
    const apiKey = await resolveRef(creds, A6API_CRED_REF);
    const accessToken = await resolveRef(creds, A6API_TOKEN_REF);
    const userId = await resolveRef(creds, A6API_USER_REF);
    let baseURL = DEFAULT_BASE_URL;
    let activeModels = [];
    const block = await readA6apiBlock(settings);
    if (block) {
      if (block.baseURL) baseURL = stripV1(block.baseURL) || DEFAULT_BASE_URL;
      activeModels = block.models;
    } else {
      const rawBase = await readRawA6apiBaseURL();
      if (rawBase) baseURL = stripV1(rawBase) || DEFAULT_BASE_URL;
      activeModels = await readRawConfiguredModels();
    }
    if (!apiKey && !accessToken && fs2.existsSync(legacyConfigFile())) {
      const legacy = await readLegacyConfig();
      if (legacy) {
        return {
          baseURL: baseURL || legacy.baseURL,
          apiKey: apiKey || legacy.apiKey,
          accessToken: accessToken || legacy.accessToken,
          userId: userId || legacy.userId,
          activeModels: activeModels.length > 0 ? activeModels : legacy.activeModels
        };
      }
    }
    return { baseURL, apiKey, accessToken, userId, activeModels };
  };
  const writeConfig = async (parts) => {
    await ensureMigrated();
    const creds = getCredentials(ctx);
    const entries = [
      [A6API_CRED_REF, parts.apiKey],
      [A6API_TOKEN_REF, parts.accessToken],
      [A6API_USER_REF, parts.userId]
    ];
    for (const [ref, value] of entries) {
      if (value === void 0) continue;
      const v = value.trim();
      try {
        if (creds && typeof creds.set === "function" && typeof creds.unset === "function") {
          if (v) await creds.set(ref, v);
          else await creds.unset(ref);
        } else {
          await writeCredentialKey(ref, v);
        }
      } catch (err) {
        console.warn(`[dsh-a6api] \u5199\u5165\u51ED\u636E ${ref} \u5931\u8D25\uFF08\u5DF2\u8DF3\u8FC7\uFF09:`, err?.message || err);
      }
    }
  };
  const syncModels = async (baseURL, modelIds) => {
    const settings = getSettings(ctx);
    if (modelIds.length === 0) {
      if (settings && typeof settings.mutate === "function") {
        try {
          await settings.mutate(SETTINGS_NS, [{ op: "unset", path: ["providers", PROVIDER_KEY] }]);
          return;
        } catch (err) {
          console.warn("[dsh-a6api] settings.mutate(llm-pi-ai) \u79FB\u9664 a6api \u5757\u5931\u8D25\uFF0C\u56DE\u9000\u88F8\u5199 settings.yaml:", err?.message || err);
        }
      }
      await removeRawA6apiBlock();
      return;
    }
    const block = buildA6apiBlock(baseURL, modelIds);
    if (settings && typeof settings.update === "function") {
      try {
        await settings.update(SETTINGS_NS, { providers: { [PROVIDER_KEY]: block } });
        return;
      } catch (err) {
        console.warn("[dsh-a6api] settings.update(llm-pi-ai) \u5931\u8D25\uFF0C\u56DE\u9000\u88F8\u5199 settings.yaml:", err?.message || err);
      }
    }
    await writeRawA6apiBlock(baseURL, modelIds);
  };
  const getDshConfiguredModels = async () => {
    const block = await readA6apiBlock(getSettings(ctx));
    if (block) return block.models;
    return readRawConfiguredModels();
  };
  const fillRef = async (creds, ref, value) => {
    if (!value) return true;
    try {
      const current = await resolveRef(creds, ref);
      if (current) return true;
      if (creds && typeof creds.set === "function") await creds.set(ref, value);
      else await writeCredentialKey(ref, value);
      return true;
    } catch (err) {
      console.warn(`[dsh-a6api] \u8FC1\u79FB ${ref} \u5931\u8D25\uFF08\u8DF3\u8FC7\uFF0C\u4FDD\u7559\u65E7\u6587\u4EF6\uFF09:`, err?.message || err);
      return false;
    }
  };
  const archiveLegacy = async (filePath) => {
    try {
      await fsp2.rename(filePath, `${filePath}.bak`);
      console.log("[dsh-a6api] \u65E7\u914D\u7F6E\u5DF2\u8FC1\u79FB\u81F3 DSH \u539F\u751F\u914D\u7F6E\u5E76\u5F52\u6863: dsh-a6api-config.json.bak");
    } catch (err) {
      console.warn("[dsh-a6api] \u65E7\u914D\u7F6E\u5F52\u6863\u5931\u8D25\uFF08\u8FC1\u79FB\u503C\u5DF2\u5199\u5165\uFF0C\u65E7\u6587\u4EF6\u4FDD\u7559\uFF0C\u4E0B\u6B21\u542F\u52A8\u91CD\u8BD5\uFF09:", err?.message || err);
    }
  };
  const doMigrate = async () => {
    const filePath = legacyConfigFile();
    let raw = "";
    try {
      raw = await fsp2.readFile(filePath, "utf8");
    } catch {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[dsh-a6api] \u65E7\u914D\u7F6E\u6587\u4EF6\u635F\u574F\uFF0C\u8DF3\u8FC7\u8FC1\u79FB\u5E76\u5F52\u6863:", err?.message || err);
      await archiveLegacy(filePath);
      return;
    }
    const legacy = normalizeLegacy(parsed);
    const creds = getCredentials(ctx);
    const fillResults = [
      await fillRef(creds, A6API_CRED_REF, legacy.apiKey),
      await fillRef(creds, A6API_TOKEN_REF, legacy.accessToken),
      await fillRef(creds, A6API_USER_REF, legacy.userId)
    ];
    if (fillResults.some((ok) => !ok)) {
      console.warn("[dsh-a6api] \u51ED\u636E\u8FC1\u79FB\u672A\u5168\u90E8\u6210\u529F\uFF0C\u8DF3\u8FC7\u5F52\u6863\uFF0C\u4FDD\u7559\u65E7\u6587\u4EF6\u8BFB\u53D6\u515C\u5E95\uFF08\u4E0B\u6B21\u542F\u52A8\u91CD\u8BD5\uFF09");
      return;
    }
    const block = await readA6apiBlock(getSettings(ctx));
    const blockExists = Boolean(block) || (await readRawConfiguredModels()).length > 0;
    if (!blockExists && legacy.activeModels.length > 0) {
      await syncModels(legacy.baseURL, legacy.activeModels);
    }
    await archiveLegacy(filePath);
  };
  return { ensureMigrated, readConfig, writeConfig, syncModels, getDshConfiguredModels };
}

// src/types.ts
var THINKING_LEVEL_KEYS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function validateReasoningEfforts(value) {
  if (value === false) return { ok: true, value: false };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "reasoningEfforts \u5FC5\u987B\u662F\u6863\u4F4D\u5B57\u5178\u6216 false" };
  }
  const dict = value;
  const keys = Object.keys(dict);
  if (keys.length === 0) return { ok: false, error: "reasoningEfforts \u4E0D\u80FD\u4E3A\u7A7A\u5B57\u5178" };
  const out = {};
  for (const k of keys) {
    if (!THINKING_LEVEL_KEYS.includes(k)) {
      return { ok: false, error: `reasoningEfforts \u952E "${k}" \u4E0D\u662F DSH \u652F\u6301\u7684\u6863\u4F4D\uFF08off/minimal/low/medium/high/xhigh/max\uFF09` };
    }
    const v = dict[k];
    if (v === null) {
      if (k !== "off") {
        return { ok: false, error: `reasoningEfforts.${k} \u5FC5\u987B\u63D0\u4F9B wire \u503C\uFF0C\u4EC5 off \u5141\u8BB8\u7559\u7A7A` };
      }
      out[k] = null;
    } else if (typeof v === "string" && v.length > 0) {
      out[k] = v;
    } else {
      return { ok: false, error: `reasoningEfforts.${k} \u7684\u503C\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u6216 null` };
    }
  }
  if (!keys.some((k) => k !== "off")) {
    return { ok: false, error: "reasoningEfforts \u9664 off \u5916\u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u601D\u8003\u6863\u4F4D\uFF08\u975E\u63A8\u7406\u6A21\u578B\u8BF7\u7528 false\uFF09" };
  }
  return { ok: true, value: out };
}

// src/index.ts
var name = "@lynn123411/dsh-a6api";
var inject = ["webServer"];
var PREFIX = "/api/dsh-a6api";
var MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
function maskConfig(c) {
  return {
    ...c,
    apiKey: c.apiKey ? MASK : "",
    accessToken: c.accessToken ? MASK : "",
    userId: c.userId ? MASK : "",
    hasApiKey: Boolean(c.apiKey),
    hasToken: Boolean(c.accessToken)
  };
}
function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
    // 不设 access-control-allow-origin：仅允许同源调用，阻断跨站读取与 CSRF 预检
  });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve2, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve2(data.trim()));
    req.on("error", reject);
  });
}
async function parseJsonBody(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body");
  }
}
var merchantCardCache = /* @__PURE__ */ new Map();
var MERCHANT_CARD_TTL_MS = 15 * 60 * 1e3;
var tokenResolveCache = null;
var TOKEN_RESOLVE_TTL_MS = 10 * 60 * 1e3;
async function resolveTokenId(config) {
  if (tokenResolveCache && Date.now() - tokenResolveCache.at < TOKEN_RESOLVE_TTL_MS) {
    return tokenResolveCache.tokenId;
  }
  const token = config.accessToken || "";
  if (!config.userId || !token) return null;
  try {
    const tokens = await fetchTokens(config.userId, token);
    let tokenId = null;
    const key = (config.apiKey || "").trim();
    if (key) {
      const hit = tokens.find((t) => t.key && t.key === key);
      if (hit) tokenId = hit.id;
    }
    if (!tokenId && tokens.length === 1) tokenId = tokens[0].id;
    if (tokenId && tokenId > 0) {
      tokenResolveCache = { tokenId, at: Date.now() };
      return tokenId;
    }
  } catch (err) {
    console.warn("[dsh-a6api] resolveTokenId error:", err);
  }
  return null;
}
function webAuthOf(config) {
  return { userId: config.userId || void 0, token: config.accessToken || void 0 };
}
function cachedMerchantOf(modelName) {
  const entry = merchantCardCache.get(modelName.toLowerCase());
  return entry && Date.now() - entry.at < MERCHANT_CARD_TTL_MS ? entry.card : void 0;
}
function overlayPinsOnModels(models, pins, tokenId) {
  const byModel = /* @__PURE__ */ new Map();
  for (const p of pins) {
    const key = (p.model_name || "").toLowerCase();
    if (!key) continue;
    const list = byModel.get(key);
    if (list) list.push(p);
    else byModel.set(key, [p]);
  }
  return models.map((m) => {
    const list = byModel.get(m.model_name.toLowerCase());
    if (!list || list.length === 0) return m;
    const pick = (tokenId ? list.find((p) => Number(p.token_id) === tokenId) : void 0) || list[0];
    const cardChannel = m.merchant?.channel_id;
    const pinChannel = pick.channel_id;
    return {
      ...m,
      // Number() 归一化：官方接口可能返回字符串渠道 ID，严格相等会误判
      pinStatus: pinChannel ? cardChannel && Number(cardChannel) === Number(pinChannel) ? "pin_here" : "pin_elsewhere" : void 0,
      pinnedChannelId: pinChannel,
      pinnedSupplierName: pick.supplier_nickname || pick.supplier_name,
      pinnedFallback: pick.fallback_to_smart_routing,
      pinTokenMatched: Boolean(tokenId && Number(pick.token_id) === tokenId)
    };
  });
}
function createUpstreamMemo(ttlMs, shouldCache) {
  let cache = /* @__PURE__ */ new Map();
  const inflight = /* @__PURE__ */ new Map();
  let epoch = 0;
  return {
    /**
     * 数据变更后调用：旧结果立即不可用。
     * 同时清空在途构建表：变更完成后才到达的请求不会「加入」变更前已开始的旧构建
     * （旧构建的写缓存仍有代际校验兜底），而是必然发起一次新构建拿到最新数据。
     */
    invalidate() {
      epoch += 1;
      cache.clear();
      inflight.clear();
    },
    async get(key, fetcher) {
      const hit = cache.get(key);
      if (hit && hit.epoch === epoch && Date.now() - hit.at < ttlMs) return hit.data;
      let pending = inflight.get(key);
      if (!pending) {
        const buildEpoch = epoch;
        const run = Promise.resolve().then(fetcher).then((data) => {
          if (buildEpoch === epoch && (!shouldCache || shouldCache(data))) {
            cache.set(key, { data, at: Date.now(), epoch: buildEpoch });
          }
          return data;
        }).finally(() => {
          if (inflight.get(key) === run) inflight.delete(key);
        });
        inflight.set(key, run);
        pending = run;
      }
      return pending;
    }
  };
}
var stateMemo = createUpstreamMemo(12e4);
var priceCountsMemo = createUpstreamMemo(12e4, (counts) => !counts.authError);
function stateCacheKeyOf(config) {
  const fingerprint = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
    return (h >>> 0).toString(36);
  };
  return `${config.baseURL || ""}|${config.userId || ""}|${fingerprint(config.apiKey || "")}|${fingerprint(config.accessToken || "")}`;
}
async function getCachedStateResponse(config, configAccess) {
  return stateMemo.get(stateCacheKeyOf(config), () => buildStateResponse(config, configAccess));
}
async function buildStateResponse(config, configAccess) {
  const token = config.accessToken || "";
  const [balance, dshConfiguredModels, modelIdsRaw, allLogs, pins] = await Promise.all([
    fetchBalance(config.baseURL, config.apiKey, config.userId, token),
    configAccess.getDshConfiguredModels(),
    config.apiKey ? fetchTokenModels(config.baseURL, config.apiKey) : Promise.resolve([]),
    fetchRecentLogs(config.userId, token, 100),
    config.userId && token ? fetchMarketplacePins(config.userId, token).catch(() => []) : Promise.resolve([])
  ]);
  if (balance?.userId && String(balance.userId) !== config.userId) {
    tokenResolveCache = null;
    config.userId = String(balance.userId);
    await configAccess.writeConfig({ userId: config.userId });
  }
  let modelIds = modelIdsRaw;
  if (modelIds.length === 0) {
    modelIds = [
      .../* @__PURE__ */ new Set([
        ...dshConfiguredModels,
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "claude-fable-5",
        "claude-opus-5",
        "grok-4.6"
      ])
    ];
  }
  allLogs.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
  if (config.userId || token) {
    const missing = modelIds.filter((m) => {
      const entry = merchantCardCache.get(m.toLowerCase());
      return !entry || Date.now() - entry.at >= MERCHANT_CARD_TTL_MS;
    });
    if (missing.length > 0) {
      let found = {};
      try {
        found = await Promise.race([
          getKnownMerchantsFromLogs(config.userId, token, missing, allLogs),
          new Promise((resolve2) => setTimeout(() => resolve2({}), 1e4))
        ]);
      } catch {
        found = {};
      }
      for (const [mName, card] of Object.entries(found)) {
        merchantCardCache.set(mName.toLowerCase(), { card, at: Date.now() });
      }
    }
  }
  const lastRoutedMap = /* @__PURE__ */ new Map();
  for (const log of allLogs) {
    const mName = log.model_name;
    const chId = Number(log.channel);
    const ts = Number(log.created_at) || 0;
    if (mName && chId > 0 && ts > 0 && !lastRoutedMap.has(mName.toLowerCase())) {
      lastRoutedMap.set(mName.toLowerCase(), ts);
    }
  }
  const dshSet = new Set(dshConfiguredModels);
  let models = modelIds.map((mId) => {
    const meta = resolveModelMeta(mId);
    const cacheEntry = merchantCardCache.get(mId.toLowerCase());
    const cachedCard = cacheEntry && Date.now() - cacheEntry.at < MERCHANT_CARD_TTL_MS ? cacheEntry.card : void 0;
    const routedAt = lastRoutedMap.get(mId.toLowerCase());
    return {
      model_name: mId,
      brand: meta.brand,
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
      modalities: meta.modalities,
      hasReasoning: Boolean(meta.reasoningEfforts || meta.thinkingFormat),
      inDsh: dshSet.has(mId),
      merchant: cachedCard,
      probeStatus: cachedCard ? "success" : "idle",
      lastRoutedAt: routedAt,
      lastRoutedText: routedAt ? formatRelativeTime(routedAt) : void 0
    };
  });
  const resolvedTokenId = pins.length > 0 ? await resolveTokenId(config) : null;
  models = overlayPinsOnModels(models, pins, resolvedTokenId);
  const rePointTargets = models.filter(
    (m) => m.pinStatus === "pin_elsewhere" && m.pinTokenMatched === true && m.pinnedChannelId && m.pinnedChannelId > 0
  ).map((m) => ({ modelName: m.model_name, channelId: m.pinnedChannelId }));
  if (rePointTargets.length > 0 && config.userId && token) {
    try {
      await Promise.race([
        (async () => {
          for (let i = 0; i < rePointTargets.length; i += 4) {
            const batch = rePointTargets.slice(i, i + 4);
            await Promise.all(
              batch.map(async ({ modelName, channelId }) => {
                try {
                  const pinnedCard = await fetchChannelDetails(
                    channelId,
                    config.userId,
                    token,
                    modelName
                  );
                  if (pinnedCard && Number(pinnedCard.channel_id) === Number(channelId)) {
                    merchantCardCache.set(modelName.toLowerCase(), { card: pinnedCard, at: Date.now() });
                  }
                } catch {
                }
              })
            );
          }
        })(),
        new Promise((resolve2) => setTimeout(() => resolve2(), 1e4))
      ]);
    } catch {
    }
    models = models.map((m) => {
      if (m.pinStatus !== "pin_elsewhere" || m.pinTokenMatched !== true) return m;
      const entry = merchantCardCache.get(m.model_name.toLowerCase());
      const card = entry && Date.now() - entry.at < MERCHANT_CARD_TTL_MS ? entry.card : void 0;
      if (card && Number(card.channel_id) === Number(m.pinnedChannelId)) {
        const pinnedLog = allLogs.find(
          (l) => l.model_name?.toLowerCase() === m.model_name.toLowerCase() && Number(l.channel) === m.pinnedChannelId
        );
        const pinnedAt = pinnedLog ? Number(pinnedLog.created_at) || 0 : void 0;
        return {
          ...m,
          merchant: card,
          pinStatus: "pin_here",
          probeStatus: "success",
          lastRoutedAt: pinnedAt,
          lastRoutedText: pinnedAt ? formatRelativeTime(pinnedAt) : void 0
        };
      }
      return m;
    });
  }
  const recentLogs = allLogs.slice(0, 20);
  return {
    config: maskConfig(config),
    balance,
    models,
    dshConfiguredModels,
    recentLogs,
    pins
  };
}
function apply(ctx) {
  const configAccess = createConfigAccess(ctx);
  void configAccess.ensureMigrated();
  const webServer = ctx.webServer || (ctx.get ? ctx.get("webServer") : null);
  if (webServer && typeof webServer.register === "function") {
    ctx.effect(() => {
      const unregister = webServer.register({
        kind: "prefix",
        path: PREFIX,
        handler: async (req, res) => {
          const url = new URL(req.url || "/", "http://localhost");
          const pathname = url.pathname.replace(PREFIX, "") || "/";
          if (req.method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
          }
          if (req.method === "POST" && !String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
            return sendJson(res, 415, { ok: false, error: "Content-Type must be application/json" });
          }
          try {
            if (pathname === "/state" && (req.method === "GET" || req.method === "HEAD")) {
              const config = await configAccess.readConfig();
              const response = await getCachedStateResponse(config, configAccess);
              return sendJson(res, 200, { ok: true, data: response });
            }
            if (pathname === "/config" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const current = await configAccess.readConfig();
              const rawToken = body.accessToken !== void 0 && body.accessToken !== MASK ? body.accessToken : body.sessionCookie !== void 0 && body.sessionCookie !== MASK ? body.sessionCookie : current.accessToken;
              const newApiKey = body.apiKey !== void 0 && body.apiKey !== MASK ? body.apiKey : current.apiKey;
              const credChanged = newApiKey !== current.apiKey || rawToken !== (current.accessToken || "") || body.userId !== void 0 && body.userId !== MASK && body.userId !== current.userId;
              if (credChanged) {
                tokenResolveCache = null;
              }
              const updated = {
                baseURL: body.baseURL !== void 0 ? body.baseURL : current.baseURL,
                apiKey: newApiKey,
                accessToken: rawToken,
                userId: body.userId !== void 0 && body.userId !== MASK ? body.userId : current.userId,
                activeModels: Array.isArray(body.activeModels) ? body.activeModels : current.activeModels
              };
              const balance = await fetchBalance(updated.baseURL, updated.apiKey, updated.userId, updated.accessToken);
              if (balance?.userId) {
                updated.userId = String(balance.userId);
              }
              const credWrites = {};
              if (updated.apiKey !== current.apiKey) credWrites.apiKey = updated.apiKey;
              if ((updated.accessToken || "") !== (current.accessToken || "")) credWrites.accessToken = updated.accessToken;
              if ((updated.userId || "") !== (current.userId || "")) credWrites.userId = updated.userId;
              if (Object.keys(credWrites).length > 0) {
                await configAccess.writeConfig(credWrites);
              }
              if (updated.activeModels.length > 0) {
                await configAccess.syncModels(updated.baseURL, updated.activeModels);
              }
              stateMemo.invalidate();
              priceCountsMemo.invalidate();
              return sendJson(res, 200, { ok: true, config: maskConfig(updated), balance });
            }
            if (pathname === "/balance" && (req.method === "GET" || req.method === "HEAD")) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || "";
              const balance = await fetchBalance(config.baseURL, config.apiKey, config.userId, token);
              const recentLogs = await fetchRecentLogs(config.userId, token, 20);
              return sendJson(res, 200, { ok: true, balance, recentLogs });
            }
            if (pathname === "/logs" && (req.method === "GET" || req.method === "HEAD")) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || "";
              const recentLogs = await fetchRecentLogs(config.userId, token, 30);
              return sendJson(res, 200, { ok: true, logs: recentLogs });
            }
            if (pathname === "/probe" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const token = config.accessToken || "";
              const modelName = body.modelName;
              if (modelName && modelName !== "all") {
                const result = await probeSingleModel(config.baseURL, config.apiKey, config.userId, token, modelName);
                if (result.merchant) {
                  merchantCardCache.set(modelName.toLowerCase(), { card: result.merchant, at: Date.now() });
                }
                stateMemo.invalidate();
                return sendJson(res, 200, { ok: true, result });
              }
              let modelIds = body.modelNames;
              if (!Array.isArray(modelIds) || modelIds.length === 0) {
                modelIds = await fetchTokenModels(config.baseURL, config.apiKey);
              }
              if (modelIds.length === 0) {
                modelIds = await configAccess.getDshConfiguredModels();
              }
              const results = [];
              for (const m of modelIds) {
                const r = await probeSingleModel(config.baseURL, config.apiKey, config.userId, token, m);
                if (r.merchant) {
                  merchantCardCache.set(m.toLowerCase(), { card: r.merchant, at: Date.now() });
                }
                results.push(r);
              }
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, results });
            }
            if (pathname === "/sync-models" && req.method === "POST") {
              const body = await parseJsonBody(req);
              await configAccess.ensureMigrated();
              const config = await configAccess.readConfig();
              const modelIds = Array.isArray(body.modelIds) ? body.modelIds : [];
              const baseURL = body.baseURL || config.baseURL;
              await configAccess.syncModels(baseURL, modelIds);
              const dshConfiguredModels = await configAccess.getDshConfiguredModels();
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, dshConfiguredModels });
            }
            if (pathname === "/pin" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || "").trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11\u6A21\u578B\u540D\u79F0" });
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: "\u9700\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u586B\u5199\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD\u540E\u624D\u80FD\u56FA\u5B9A\u5546\u5BB6" });
              }
              let card = cachedMerchantOf(modelName);
              let tokenId = await resolveTokenId(config);
              if ((!card || !tokenId) && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, userId, token, modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (!tokenId && probe.tokenId && Number(probe.tokenId) > 0) tokenId = Number(probe.tokenId);
                  if (!card && probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {
                }
                if (probedOk) stateMemo.invalidate();
              }
              if (!card) {
                return sendJson(res, 400, { ok: false, error: "\u8BE5\u6A21\u578B\u6682\u65E0\u5546\u5BB6\u6570\u636E\uFF0C\u8BF7\u5148\u300C\u63A2\u6D4B\u5546\u5BB6\u300D" });
              }
              if (!tokenId) {
                return sendJson(res, 400, { ok: false, error: "\u65E0\u6CD5\u81EA\u52A8\u89E3\u6790 API Key \u5BF9\u5E94\u7684\u4EE4\u724C ID\uFF0C\u8BF7\u68C0\u67E5\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u662F\u5426\u6709\u6548\uFF0C\u6216\u5230\u5B98\u7F51\u300C\u4EE4\u724C\u300D\u9875\u624B\u52A8\u56FA\u5B9A" });
              }
              if (!card.channel_id) {
                return sendJson(res, 400, { ok: false, error: "\u5546\u5BB6\u5361\u7247\u7F3A\u5C11\u6E20\u9053 ID\uFF0C\u8BF7\u91CD\u65B0\u63A2\u6D4B" });
              }
              const pinResult = await marketplacePin(userId, token, {
                token_id: tokenId,
                channel_id: card.channel_id,
                model_name: modelName,
                // 平台默认兜底：渠道异常时自动切换智能优选（不暴露 UI 开关）
                fallback_to_smart_routing: true
              });
              if (!pinResult.ok) {
                return sendJson(res, 400, { ok: false, error: pinResult.message || "\u56FA\u5B9A\u5931\u8D25" });
              }
              tokenResolveCache = { tokenId, at: Date.now() };
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, is_pinned: true, pin_status: "pin_here" },
                at: Date.now()
              });
              const pinList = await fetchMarketplacePins(userId, token);
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `\u5DF2\u56FA\u5B9A ${modelName} \u81F3\u5546\u6237 #${card.channel_id}`, pins: pinList, tokenId });
            }
            if (pathname === "/unpin" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || "").trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11\u6A21\u578B\u540D\u79F0" });
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: "\u9700\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u586B\u5199\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD\u540E\u624D\u80FD\u53D6\u6D88\u56FA\u5B9A" });
              }
              const tokenId = await resolveTokenId(config);
              if (!tokenId) {
                return sendJson(res, 400, { ok: false, error: "\u65E0\u6CD5\u89E3\u6790 API Key \u5BF9\u5E94\u7684\u4EE4\u724C ID\uFF0C\u8BF7\u68C0\u67E5\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u662F\u5426\u6709\u6548" });
              }
              const unpinResult = await marketplaceUnpin(userId, token, { token_id: tokenId, model_name: modelName });
              if (!unpinResult.ok) {
                return sendJson(res, 400, { ok: false, error: unpinResult.message || "\u53D6\u6D88\u56FA\u5B9A\u5931\u8D25" });
              }
              const card = cachedMerchantOf(modelName);
              if (card) {
                merchantCardCache.set(modelName.toLowerCase(), {
                  card: { ...card, is_pinned: false, pin_status: void 0 },
                  at: Date.now()
                });
              }
              const pinList = await fetchMarketplacePins(userId, token);
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `\u5DF2\u53D6\u6D88\u56FA\u5B9A ${modelName}`, pins: pinList, tokenId });
            }
            if (pathname === "/disable" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || "").trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11\u6A21\u578B\u540D\u79F0" });
              let card = cachedMerchantOf(modelName);
              if (!card && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, config.userId, config.accessToken || "", modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {
                }
                if (probedOk) stateMemo.invalidate();
              }
              if (!card || !card.channel_id) {
                return sendJson(res, 400, { ok: false, error: "\u8BE5\u6A21\u578B\u6682\u65E0\u5546\u5BB6\u6570\u636E\uFF0C\u8BF7\u5148\u300C\u63A2\u6D4B\u5546\u5BB6\u300D" });
              }
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: "\u9700\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u586B\u5199\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD\u540E\u624D\u80FD\u7981\u7528\u5546\u5BB6" });
              }
              const disableResult = await marketplaceDisableChannel(userId, token, card.channel_id, modelName);
              if (!disableResult.ok) {
                return sendJson(res, 400, { ok: false, error: disableResult.message || "\u7981\u7528\u5931\u8D25" });
              }
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, user_channel_disabled: true },
                at: Date.now()
              });
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `\u5DF2\u7981\u7528\u5546\u6237 #${card.channel_id} \u5BF9\u8BE5\u6A21\u578B\u7684\u670D\u52A1` });
            }
            if (pathname === "/restore" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || "").trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11\u6A21\u578B\u540D\u79F0" });
              let card = cachedMerchantOf(modelName);
              if (!card && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, config.userId, config.accessToken || "", modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {
                }
                if (probedOk) stateMemo.invalidate();
              }
              if (!card || !card.channel_id) {
                return sendJson(res, 400, { ok: false, error: "\u8BE5\u6A21\u578B\u6682\u65E0\u5546\u5BB6\u6570\u636E\uFF0C\u8BF7\u5148\u300C\u63A2\u6D4B\u5546\u5BB6\u300D" });
              }
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: "\u9700\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u586B\u5199\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD\u540E\u624D\u80FD\u6062\u590D\u5546\u5BB6" });
              }
              const restoreResult = await marketplaceRestoreChannel(userId, token, card.channel_id, modelName);
              if (!restoreResult.ok) {
                return sendJson(res, 400, { ok: false, error: restoreResult.message || "\u6062\u590D\u5931\u8D25" });
              }
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, user_channel_disabled: false },
                at: Date.now()
              });
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `\u5DF2\u6062\u590D\u5546\u6237 #${card.channel_id} \u5BF9\u8BE5\u6A21\u578B\u7684\u670D\u52A1` });
            }
            if (pathname === "/price-fluctuation" && (req.method === "GET" || req.method === "HEAD")) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || "";
              if (!token || !config.userId) {
                return sendJson(res, 200, { ok: true, data: { pendingCount: 0, unseenCount: 0, totalCount: 0, hasAuth: false, authError: false, updatedAt: Date.now() } });
              }
              const counts = await priceCountsMemo.get(stateCacheKeyOf(config), async () => {
                const result = await fetchPriceFluctuation(config.userId, token);
                const { notices, ...rest } = result;
                return rest;
              });
              const hasAuth = !counts.authError;
              return sendJson(res, 200, { ok: true, data: { pendingCount: counts.pendingCount, unseenCount: counts.unseenCount, totalCount: counts.totalCount, hasAuth, authError: Boolean(counts.authError), updatedAt: Date.now() } });
            }
            if (pathname === "/pins" && (req.method === "GET" || req.method === "HEAD")) {
              const config = await configAccess.readConfig();
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 200, { ok: true, pins: [] });
              }
              try {
                const pins = await fetchMarketplacePins(userId, token);
                return sendJson(res, 200, { ok: true, pins });
              } catch (err) {
                console.warn("[dsh-a6api] GET /pins error:", err);
                return sendJson(res, 200, { ok: true, pins: [] });
              }
            }
            if (pathname === "/catalog" && (req.method === "GET" || req.method === "HEAD")) {
              return sendJson(res, 200, { ok: true, catalog: getCatalog() });
            }
            if (pathname === "/catalog/clear" && req.method === "POST") {
              await clearCatalog();
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true });
            }
            if (pathname === "/catalog/fetch-models" && req.method === "POST") {
              const config = await configAccess.readConfig();
              const { userId, token } = webAuthOf(config);
              let result;
              try {
                result = await fetchMarketplaceModels(userId, token);
              } catch (err) {
                return sendJson(res, 400, { ok: false, error: err?.message || "\u83B7\u53D6\u5E02\u573A\u6A21\u578B\u5931\u8D25" });
              }
              const models = result.models;
              const before = new Set(getCatalog().map((e) => e.id.toLowerCase()));
              let added = 0;
              for (const m of models) {
                if (!before.has(m.id.toLowerCase())) added++;
              }
              await upsertCatalogEntries(
                models.map((m) => ({ id: m.id, brand: m.brand, reasoningEfforts: m.reasoningEfforts }))
              );
              stateMemo.invalidate();
              return sendJson(res, 200, {
                ok: true,
                total: models.length,
                added,
                failedPages: result.failedPages
              });
            }
            if (pathname === "/catalog/query-openrouter" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const catalog = getCatalog();
              const modelIds = Array.isArray(body.modelIds) && body.modelIds.length > 0 ? body.modelIds.map((s) => String(s)) : catalog.map((e) => e.id);
              if (modelIds.length === 0) {
                return sendJson(res, 400, { ok: false, error: "\u76EE\u5F55\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u300C\u4ECE A6API \u83B7\u53D6\u5E02\u573A\u6A21\u578B\u300D" });
              }
              const result = await queryOpenRouter(modelIds);
              stateMemo.invalidate();
              return sendJson(res, 200, {
                ok: true,
                updated: result.updated.length,
                notFound: result.notFound
              });
            }
            if (pathname === "/catalog/update" && req.method === "POST") {
              const body = await parseJsonBody(req);
              const id = String(body.id || "").trim();
              if (!id) return sendJson(res, 400, { ok: false, error: "\u7F3A\u5C11\u6A21\u578B ID" });
              const patch = {};
              if (body.name !== void 0) {
                if (body.name === null) {
                  patch.name = null;
                } else if (typeof body.name !== "string") {
                  return sendJson(res, 400, { ok: false, error: "name \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" });
                } else {
                  const name2 = body.name.trim();
                  patch.name = name2 || null;
                }
              }
              for (const key of ["contextWindow", "maxTokens"]) {
                if (body[key] === null) {
                  patch[key] = null;
                } else if (body[key] !== void 0) {
                  const n = Number(body[key]);
                  if (!Number.isInteger(n) || n < 1) {
                    return sendJson(res, 400, { ok: false, error: `${key} \u5FC5\u987B\u662F\u6B63\u6574\u6570` });
                  }
                  patch[key] = n;
                }
              }
              if (body.input !== void 0) {
                if (body.input === null) {
                  patch.input = null;
                } else if (!Array.isArray(body.input)) {
                  return sendJson(res, 400, { ok: false, error: "input \u5FC5\u987B\u662F\u6570\u7EC4" });
                } else {
                  const mods = body.input.filter((m) => m === "text" || m === "image");
                  patch.input = mods.length > 0 ? mods : null;
                }
              }
              if (body.reasoningEfforts !== void 0) {
                if (body.reasoningEfforts === null) {
                  patch.reasoningEfforts = null;
                } else {
                  const v = validateReasoningEfforts(body.reasoningEfforts);
                  if (!v.ok) return sendJson(res, 400, { ok: false, error: v.error });
                  patch.reasoningEfforts = v.value;
                }
              }
              const entry = await updateCatalogEntry(id, patch);
              if (!entry) return sendJson(res, 404, { ok: false, error: "\u76EE\u5F55\u4E2D\u4E0D\u5B58\u5728\u8BE5\u6A21\u578B" });
              try {
                const config = await configAccess.readConfig();
                const dshModels = await configAccess.getDshConfiguredModels();
                if (dshModels.some((m) => m.toLowerCase() === entry.id.toLowerCase()) && config.activeModels.length > 0) {
                  await configAccess.syncModels(config.baseURL, config.activeModels);
                }
              } catch (err) {
                console.warn("[dsh-a6api] catalog update: resync settings failed:", err?.message || err);
              }
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, entry });
            }
            return sendJson(res, 404, { ok: false, error: "Not found" });
          } catch (err) {
            console.error("[dsh-a6api] API error:", err);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
          }
        }
      });
      return () => {
        if (typeof unregister === "function") unregister();
      };
    }, "dsh-a6api: web API router");
  }
}
export {
  A6API_CRED_REF,
  A6API_TOKEN_REF,
  A6API_USER_REF,
  apply,
  clearCatalog,
  createConfigAccess,
  fetchBalance,
  fetchChannelDetails,
  fetchMarketplaceModels,
  fetchMarketplacePins,
  fetchRecentLogs,
  fetchTokenModels,
  getCatalog,
  getCatalogEntry,
  getKnownMerchantsFromLogs,
  inferBrand,
  inject,
  name,
  probeSingleModel,
  queryOpenRouter,
  resolveModelMeta,
  updateCatalogEntry
};
//# sourceMappingURL=index.js.map

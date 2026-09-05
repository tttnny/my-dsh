window.__ModuleLoader__.load({ id: "@lynn123411/dsh-a6api", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react7 = __toESM(require("react"), 1);

// src/client/components/A6ApiSettings.tsx
var import_react5 = require("react");

// src/client/store.ts
function formatRelativeNow(tsSec) {
  const diff = Math.floor(Date.now() / 1e3) - tsSec;
  if (diff < 60) return "\u521A\u521A";
  if (diff < 3600) return `${Math.floor(diff / 60)} \u5206\u949F\u524D`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.floor(diff / 86400)} \u5929\u524D`;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var RATE_LIMIT_RE = /\b429\b|Too Many Requests|rate\s*limit/i;
var A6ApiStore = class {
  state = {
    loading: true,
    config: {
      baseURL: "https://api.a6api.com",
      apiKey: "",
      userId: "",
      activeModels: []
    },
    balance: null,
    models: [],
    dshConfiguredModels: [],
    recentLogs: [],
    probingModelNames: /* @__PURE__ */ new Set(),
    actionBusyModels: /* @__PURE__ */ new Set(),
    probeAllActive: false,
    probeAllTotal: 0,
    probeAllDoneCount: 0,
    pins: [],
    catalog: [],
    catalogBusy: null,
    error: null,
    priceFluctuation: { pendingCount: 0, unseenCount: 0, totalCount: 0, updatedAt: null }
  };
  listeners = /* @__PURE__ */ new Set();
  autoRefreshTimer = null;
  /** 启动预热已触发（幂等）：插件随 DSH 启动即后台拉一次完整状态 */
  warmedUp = false;
  /** 全量探测取消标志：置位后不再从队列取新任务，在途探测正常完成 */
  probeCancelled = false;
  /** 本轮全量探测的模型名快照（null = 未在运行），用于进度计数与 /state 刷新后重挂状态 */
  probeAllSnapshot = null;
  /** 本轮已完成探测的模型（幂等集合，驱动 probeAllDoneCount） */
  probeAllDone = /* @__PURE__ */ new Set();
  /** 入队前各模型的 probeError 暂存，取消时恢复历史错误提示 */
  probeQueuedPrevError = /* @__PURE__ */ new Map();
  constructor() {
    this.startAutoRefresh();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify() {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error("[dsh-a6api] listener error:", err);
      }
    }
  }
  getState() {
    return this.state;
  }
  async fetchState(force = false) {
    this.state.loading = true;
    this.notify();
    try {
      const res = await fetch("/api/dsh-a6api/state" + (force ? "?force=1" : ""));
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const data = json.data;
          this.state.config = data.config;
          this.state.balance = data.balance;
          this.state.models = data.models;
          const snapshot = this.probeAllSnapshot;
          if (this.state.probeAllActive && snapshot) {
            this.state.models = this.state.models.map((m) => {
              if (this.state.probingModelNames.has(m.model_name)) {
                return { ...m, probeStatus: "probing" };
              }
              if (snapshot.includes(m.model_name) && !this.probeAllDone.has(m.model_name)) {
                return { ...m, probeStatus: "queued", probeError: void 0 };
              }
              return m;
            });
          }
          this.state.dshConfiguredModels = data.dshConfiguredModels;
          if (Array.isArray(data.pins)) {
            this.state.pins = data.pins;
          }
          if (data.recentLogs) {
            this.state.recentLogs = data.recentLogs;
          }
          this.state.error = null;
          if (this.state.config?.hasToken) {
            const last = this.state.priceFluctuation?.updatedAt;
            if (!last || Date.now() - last > 1e4) {
              this.fetchPriceFluctuation().catch(() => {
              });
            }
          }
        }
      }
    } catch (err) {
      this.state.error = err?.message || String(err);
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }
  async saveConfig(config) {
    try {
      const res = await fetch("/api/dsh-a6api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        await this.fetchState();
        return true;
      }
    } catch (err) {
      this.state.error = err?.message || String(err);
      this.notify();
    }
    return false;
  }
  async refreshBalance() {
    try {
      const res = await fetch("/api/dsh-a6api/balance");
      if (res.ok) {
        const json = await res.json();
        if (json?.balance) {
          this.state.balance = json.balance;
        }
        if (json?.recentLogs) {
          this.state.recentLogs = json.recentLogs;
        }
        this.notify();
      }
    } catch {
    }
  }
  // ===== 模型目录 =====
  async fetchCatalog() {
    try {
      const res = await fetch("/api/dsh-a6api/catalog");
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.catalog)) {
          this.state.catalog = json.catalog;
          this.notify();
        }
      }
    } catch {
    }
  }
  /** 从 A6API 市场拉取全部模型 ID 并入目录（仅新增/补品牌，不动已有参数） */
  async fetchMarketModels() {
    if (this.state.catalogBusy) return { ok: false, error: "\u76EE\u5F55\u64CD\u4F5C\u8FDB\u884C\u4E2D" };
    this.state.catalogBusy = "fetch";
    this.notify();
    try {
      const res = await fetch("/api/dsh-a6api/catalog/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true, total: json.total, added: json.added, failedPages: json.failedPages || 0 };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    } finally {
      this.state.catalogBusy = null;
      this.notify();
    }
  }
  /** 对全部（或指定）目录模型查 OpenRouter 并填充参数 */
  async queryOpenRouter(modelIds) {
    if (this.state.catalogBusy) return { ok: false, error: "\u76EE\u5F55\u64CD\u4F5C\u8FDB\u884C\u4E2D" };
    this.state.catalogBusy = "query";
    this.notify();
    try {
      const res = await fetch("/api/dsh-a6api/catalog/query-openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelIds })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true, updated: json.updated, notFound: json.notFound || [] };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    } finally {
      this.state.catalogBusy = null;
      this.notify();
    }
  }
  /** 修改目录条目参数；已启用模型由服务端即时重写 settings.yaml */
  async updateCatalogEntry(id, patch) {
    try {
      const res = await fetch("/api/dsh-a6api/catalog/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    }
  }
  /** 清空模型目录（随后可重新从 A6API 拉取 / OpenRouter 填充） */
  async clearCatalog() {
    try {
      const res = await fetch("/api/dsh-a6api/catalog/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    }
  }
  async fetchPriceFluctuation() {
    try {
      const res = await fetch("/api/dsh-a6api/price-fluctuation");
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const d = json.data;
          const hasAuth = d.hasAuth !== false && !d.authError;
          if (!hasAuth) {
            const next2 = { pendingCount: 0, unseenCount: 0, totalCount: 0, updatedAt: Date.now(), hasAuth: false, authError: Boolean(d.authError) };
            if (JSON.stringify(next2) !== JSON.stringify(this.state.priceFluctuation)) {
              this.state.priceFluctuation = next2;
              this.notify();
            }
            return;
          }
          const pending = Number(d.pendingCount ?? 0);
          const unseen = Number(d.unseenCount ?? 0);
          const total = Number(d.totalCount ?? 0);
          const next = { pendingCount: pending, unseenCount: unseen, totalCount: total, updatedAt: Date.now(), hasAuth: true, authError: false };
          if (pending !== this.state.priceFluctuation.pendingCount || unseen !== this.state.priceFluctuation.unseenCount || this.state.priceFluctuation.hasAuth === false || this.state.priceFluctuation.updatedAt === null) {
            this.state.priceFluctuation = next;
            this.notify();
          } else if (this.state.priceFluctuation.updatedAt === null) {
            this.state.priceFluctuation = next;
            this.notify();
          }
        }
      }
    } catch {
    }
  }
  /** 单次探测请求（不修改状态，供限流重试循环复用） */
  async probeOnce(modelName) {
    try {
      const res = await fetch("/api/dsh-a6api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName })
      });
      if (res.ok) {
        const json = await res.json();
        return { kind: "ok", json };
      }
      return { kind: "http", status: res.status };
    } catch (err) {
      return { kind: "network", error: err?.message || String(err) };
    }
  }
  isRateLimitedOutcome(o) {
    return o.kind === "ok" && Boolean(o.json?.result?.error && RATE_LIMIT_RE.test(String(o.json.result.error))) || o.kind === "http" && o.status === 429;
  }
  /** 把一次探测结果应用到卡片（按结果类型走原有映射逻辑） */
  applyProbeResult(modelName, outcome) {
    const patch = (p) => {
      this.state.models = this.state.models.map((m) => m.model_name === modelName ? { ...m, ...p } : m);
      this.notify();
    };
    if (outcome.kind === "ok") {
      const json = outcome.json;
      if (json?.result?.merchant) {
        patch({
          merchant: json.result.merchant,
          probeStatus: "success",
          probeLatencyMs: json.result.durationMs,
          probeError: void 0,
          lastProbedAt: Date.now(),
          // 探测请求本身会写路由日志,乐观更新路由快照时效,下次 /state 以日志为准
          lastRoutedAt: Math.floor(Date.now() / 1e3),
          lastRoutedText: formatRelativeNow(Math.floor(Date.now() / 1e3))
        });
      } else if (json?.result?.error) {
        patch({
          merchant: void 0,
          probeStatus: "error",
          probeError: json.result.error,
          lastProbedAt: Date.now()
        });
      } else {
        patch({
          probeStatus: json?.result?.success ? "success" : "idle",
          probeLatencyMs: json?.result?.durationMs,
          probeError: json?.result?.success ? "\u63A2\u6D4B\u6210\u529F,\u4F46\u672A\u6355\u83B7\u5546\u6237\u4FE1\u606F(\u9700\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C)" : void 0,
          lastProbedAt: Date.now()
        });
      }
    } else if (outcome.kind === "http") {
      patch({
        merchant: void 0,
        probeStatus: "error",
        probeError: `HTTP ${outcome.status}`,
        lastProbedAt: Date.now()
      });
    } else {
      patch({
        merchant: void 0,
        probeStatus: "error",
        probeError: outcome.error,
        lastProbedAt: Date.now()
      });
    }
  }
  async probeModel(modelName) {
    this.state.probingModelNames.add(modelName);
    this.state.models = this.state.models.map(
      (m) => m.model_name === modelName ? { ...m, probeStatus: "probing" } : m
    );
    this.notify();
    try {
      let outcome = await this.probeOnce(modelName);
      if (this.isRateLimitedOutcome(outcome)) {
        for (let attempt = 2; attempt <= 3; attempt++) {
          await sleep(attempt === 2 ? 800 : 2e3);
          outcome = await this.probeOnce(modelName);
          if (!this.isRateLimitedOutcome(outcome)) break;
        }
        if (this.isRateLimitedOutcome(outcome)) {
          this.state.models = this.state.models.map(
            (m) => m.model_name === modelName ? {
              ...m,
              merchant: void 0,
              probeStatus: "error",
              probeError: "\u8BF7\u6C42\u88AB\u9650\u6D41(429),\u5DF2\u81EA\u52A8\u91CD\u8BD5 3 \u6B21\u4ECD\u5931\u8D25,\u8BF7\u7A0D\u540E\u518D\u8BD5",
              lastProbedAt: Date.now()
            } : m
          );
          return;
        }
      }
      this.applyProbeResult(modelName, outcome);
    } finally {
      this.state.probingModelNames.delete(modelName);
      if (this.probeAllSnapshot?.includes(modelName)) {
        this.probeAllDone.add(modelName);
        this.state.probeAllDoneCount = this.probeAllDone.size;
      }
      this.notify();
      this.refreshBalance().catch(() => {
      });
    }
  }
  async probeAll() {
    if (this.state.probeAllActive) return;
    const names = this.state.models.map((m) => m.model_name);
    if (names.length === 0) return;
    this.probeCancelled = false;
    this.probeAllSnapshot = names;
    this.probeAllDone.clear();
    this.probeQueuedPrevError = new Map(this.state.models.map((m) => [m.model_name, m.probeError]));
    this.state.probeAllActive = true;
    this.state.probeAllTotal = names.length;
    this.state.probeAllDoneCount = 0;
    this.state.models = this.state.models.map((m) => ({
      ...m,
      probeStatus: "queued",
      probeError: void 0
    }));
    this.notify();
    const CONCURRENCY = Math.min(8, names.length);
    let idx = 0;
    const worker = async () => {
      while (idx < names.length && !this.probeCancelled) {
        const name2 = names[idx++];
        if (this.state.probingModelNames.has(name2)) continue;
        await this.probeModel(name2);
      }
    };
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } finally {
      this.state.probeAllActive = false;
      this.probeAllSnapshot = null;
      this.probeAllDone.clear();
      this.state.probeAllDoneCount = 0;
      this.restoreQueuedModels();
      this.notify();
    }
  }
  /** 把仍处于 queued 的模型复位为 idle 并恢复入队前的错误文案 */
  restoreQueuedModels() {
    const prev = this.probeQueuedPrevError;
    this.state.models = this.state.models.map(
      (m) => m.probeStatus === "queued" ? { ...m, probeStatus: "idle", probeError: prev.get(m.model_name) } : m
    );
    this.probeQueuedPrevError = /* @__PURE__ */ new Map();
  }
  /** 取消全量探测：立即复位排队模型，不再取新任务，已在途的探测正常完成并回填卡片 */
  cancelProbeAll() {
    if (!this.state.probeAllActive) return;
    this.probeCancelled = true;
    this.state.probeAllActive = false;
    this.probeAllSnapshot = null;
    this.probeAllDone.clear();
    this.state.probeAllDoneCount = 0;
    this.restoreQueuedModels();
    this.notify();
  }
  async toggleDshModel(modelName) {
    const currentSet = new Set(this.state.dshConfiguredModels);
    if (currentSet.has(modelName)) {
      currentSet.delete(modelName);
    } else {
      currentSet.add(modelName);
    }
    const newModels = [...currentSet];
    try {
      const res = await fetch("/api/dsh-a6api/sync-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelIds: newModels })
      });
      if (res.ok) {
        const json = await res.json();
        this.state.dshConfiguredModels = json.dshConfiguredModels || newModels;
        const dshSet = new Set(this.state.dshConfiguredModels);
        this.state.models = this.state.models.map((m) => ({
          ...m,
          inDsh: dshSet.has(m.model_name)
        }));
        this.notify();
      }
    } catch (err) {
      this.state.error = err?.message || String(err);
      this.notify();
    }
  }
  /**
   * 固定 / 取消固定 / 禁用 / 恢复 的统一执行器。
   * 成功后会刷新 /state（服务端会把平台固定记录叠加回卡片，跟随官网状态）。
   */
  async runMarketplaceAction(modelName, endpoint, busySet) {
    if (busySet.has(modelName)) return { ok: false, error: "\u64CD\u4F5C\u8FDB\u884C\u4E2D" };
    busySet.add(modelName);
    this.notify();
    try {
      const res = await fetch(`/api/dsh-a6api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        if (Array.isArray(json.pins)) {
          this.state.pins = json.pins;
        }
        await this.fetchState();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      this.notify();
      return { ok: false, error: errText };
    } catch (err) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      this.notify();
      return { ok: false, error: msg };
    } finally {
      busySet.delete(modelName);
      this.notify();
    }
  }
  /** 固定卡片当前商家到该模型 */
  pinModel(modelName) {
    return this.runMarketplaceAction(modelName, "pin", this.state.actionBusyModels);
  }
  /** 取消该模型的固定 */
  unpinModel(modelName) {
    return this.runMarketplaceAction(modelName, "unpin", this.state.actionBusyModels);
  }
  /** 禁用卡片当前商家对该模型的服务 */
  disableModel(modelName) {
    return this.runMarketplaceAction(modelName, "disable", this.state.actionBusyModels);
  }
  /** 恢复被禁用的商家 */
  restoreModel(modelName) {
    return this.runMarketplaceAction(modelName, "restore", this.state.actionBusyModels);
  }
  /**
   * 启动预热：插件随 DSH 启动即后台拉取一次完整状态。
   * 侧边栏按钮在应用启动时就已挂载，预热让用户打开浮层/设置页时数据早已就绪 → 秒开无 spinner。
   * 未配置凭据时 /state 返回默认回退数据，无害；后续保存配置/轮询会持续刷新。
   * 目录一并预热（模型目录 tab 徽标/首屏不等待首次进入）。
   */
  warmUp() {
    if (this.warmedUp) return;
    this.warmedUp = true;
    this.fetchState().catch(() => {
    });
    this.fetchCatalog().catch(() => {
    });
  }
  startAutoRefresh() {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
    this.autoRefreshTimer = setInterval(() => {
      if (this.state.config?.hasApiKey) {
        this.fetchState().catch(() => {
        });
      }
    }, 6e4);
  }
  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
  initPricePolling() {
    if (this.autoRefreshTimer) return;
    this.startAutoRefresh();
    if (this.state.config?.hasToken) {
      this.fetchPriceFluctuation().catch(() => {
      });
    }
  }
};
var store = new A6ApiStore();

// src/client/components/MerchantCard.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var formatAbsolute = (tsSec) => {
  const d = new Date(tsSec * 1e3);
  const p = (n) => String(n).padStart(2, "0");
  const nowY = (/* @__PURE__ */ new Date()).getFullYear();
  const y = d.getFullYear();
  const md = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return y !== nowY ? `${y}-${md}` : md;
};
var fmtSig = (n) => {
  if (!Number.isFinite(n)) return "\u2014";
  const s = Number(n.toPrecision(3));
  if (Math.abs(s) >= 1e3) return s.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return String(s);
};
var MerchantCard = ({ model }) => {
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [pinConfirmOpen, setPinConfirmOpen] = (0, import_react.useState)(false);
  const [actionError, setActionError] = (0, import_react.useState)(null);
  const errorTimerRef = (0, import_react.useRef)(null);
  const isProbing = model.probeStatus === "probing";
  const isQueued = model.probeStatus === "queued";
  const merchant = model.merchant;
  const isBusy = store.getState().actionBusyModels.has(model.model_name);
  const canWebAction = Boolean(store.getState().config?.hasToken);
  const hasMerchant = Boolean(merchant?.channel_id);
  const isPinnedHere = model.pinStatus === "pin_here";
  const isPinnedElsewhere = model.pinStatus === "pin_elsewhere";
  const hasPin = isPinnedHere || isPinnedElsewhere;
  const isPinMismatch = hasPin && model.pinTokenMatched === false;
  const isPinUnknown = hasPin && model.pinTokenMatched === void 0;
  const pinTokenNote = isPinMismatch ? "\uFF1B\u8BE5\u56FA\u5B9A\u5C5E\u4E8E\u5176\u4ED6\u4EE4\u724C\uFF0C\u4EC5\u4F9B\u53C2\u8003" : isPinUnknown ? "\uFF1B\u672A\u80FD\u786E\u8BA4\u662F\u5426\u5C5E\u4E8E\u5F53\u524D\u4EE4\u724C\uFF0C\u4EC5\u4F9B\u53C2\u8003" : "";
  const isChannelDisabled = Boolean(merchant?.user_channel_disabled);
  const flashActionError = (msg) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionError(msg);
    errorTimerRef.current = setTimeout(() => setActionError(null), 6e3);
  };
  const handleProbe = (e) => {
    e.stopPropagation();
    store.probeModel(model.model_name);
  };
  const handleToggleDsh = (e) => {
    e.stopPropagation();
    store.toggleDshModel(model.model_name);
  };
  const handleOpenPinConfirm = (e) => {
    e.stopPropagation();
    setActionError(null);
    setPinConfirmOpen(true);
  };
  const handleConfirmPin = async () => {
    setActionError(null);
    const r = await store.pinModel(model.model_name);
    if (!r.ok) {
      flashActionError(r.error || "\u56FA\u5B9A\u5931\u8D25");
    } else {
      setPinConfirmOpen(false);
    }
  };
  const handleUnpin = async (e) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.unpinModel(model.model_name);
    if (!r.ok) flashActionError(r.error || "\u53D6\u6D88\u56FA\u5B9A\u5931\u8D25");
  };
  const handleDisable = async (e) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.disableModel(model.model_name);
    if (!r.ok) flashActionError(r.error || "\u7981\u7528\u5931\u8D25");
  };
  const handleRestore = async (e) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.restoreModel(model.model_name);
    if (!r.ok) flashActionError(r.error || "\u6062\u590D\u5931\u8D25");
  };
  const renderRealtimeDots = () => {
    if (merchant?.success_buckets && merchant.success_buckets.length > 0) {
      return merchant.success_buckets.slice(0, 10).map((b, i) => {
        const rate = b.success_rate;
        let colorClass = "green";
        if (rate < 8e3) colorClass = "red";
        else if (rate < 9500) colorClass = "yellow";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${colorClass}` }, i);
      });
    }
    const count = 10;
    const greenCount = merchant ? Math.round(merchant.recent_success_rate_pct / 100 * count) : 10;
    return Array.from({ length: count }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${i < greenCount ? "green" : "empty"}` }, i));
  };
  const render24hDots = () => {
    if (merchant?.b24 && merchant.b24.length > 0) {
      return merchant.b24.slice(0, 12).map((b, i) => {
        if (!b.s || b.s === 0) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-rate-dot empty" }, i);
        }
        let colorClass = "green";
        if (b.r < 8e3) colorClass = "red";
        else if (b.r < 9500) colorClass = "yellow";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${colorClass}` }, i);
      });
    }
    const count = 12;
    const greenCount = merchant ? Math.round(merchant.success_rate_24h_pct / 100 * count) : 12;
    return Array.from({ length: count }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${i < greenCount ? "green" : "empty"}` }, i));
  };
  const render7dDots = () => {
    if (merchant?.b7d && merchant.b7d.length > 0) {
      return merchant.b7d.slice(0, 7).map((b, i) => {
        if (!b.s || b.s === 0) {
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-rate-dot empty" }, i);
        }
        let colorClass = "green";
        if (b.r && b.r < 8e3) colorClass = "red";
        else if (b.r && b.r < 9500) colorClass = "yellow";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${colorClass}` }, i);
      });
    }
    return Array.from({ length: 7 }).map((_, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `dsh-a6-rate-dot ${i >= 4 ? "green" : "empty"}` }, i));
  };
  const getTagClass = (tag) => {
    if (tag.includes("\u4FDD\u771F")) return "tag-guarantee";
    if (tag.includes("\u7A33\u5B9A")) return "tag-stable";
    if (tag.includes("\u4F4E\u4EF7")) return "tag-cheap";
    if (tag.includes("\u9AD8\u901F")) return "tag-fast";
    if (tag.includes("\u9AD8\u8D28")) return "tag-quality";
    return "";
  };
  const ratioText = merchant?.realtime_ratio_formatted || "0.0341";
  const latencySec = merchant ? ((merchant.p50_ttft_ms || merchant.recent_p50_ms || 2340) / 1e3).toFixed(2) + "s" : model.probeLatencyMs ? (model.probeLatencyMs / 1e3).toFixed(2) + "s" : "2.34s";
  const cacheHitPct = merchant ? merchant.cache_hit_rate_pct : 72;
  const blend100m = merchant?.blended_price_100m_cny;
  const blend100mValid = blend100m !== void 0 && Number.isFinite(blend100m);
  const blendTitle = blend100mValid ? (() => {
    const h = Math.min(100, Math.max(0, merchant.cache_hit_rate_pct)) / 100;
    const inShare = 99.65;
    const hSharePct = Math.round(h * inShare * 10) / 10;
    const mSharePct = Math.round((1 - h) * inShare * 10) / 10;
    const per1m = blend100m / 100;
    return `\u6DF7\u5408\u4EF7\u4F30\u7B97\uFF08\xA5 / 1\u4EBF tokens\uFF0C\u8F93\u51FA\u5360\u6BD4\u56FA\u5B9A 0.35%\uFF09
\u547D\u4E2D ${hSharePct}% \xD7 \u7F13\u5B58\u8BFB\u4EF7 + \u672A\u547D\u4E2D ${mSharePct}% \xD7 \u8F93\u5165\u4EF7 + \u8F93\u51FA 0.35% \xD7 \u8F93\u51FA\u4EF7
= \xA5${Number(per1m.toPrecision(4))} /1M \u2248 \xA5${fmtSig(blend100m)} /1\u4EBF tokens
\u547D\u4E2D\u7387\u53D6\u5361\u7247 24h \u5B9E\u6D4B\u7F13\u5B58\u547D\u4E2D\u7387`;
  })() : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `dsh-a6-official-card ${model.inDsh ? "in-dsh" : ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-card-main-bar", onClick: () => setExpanded(!expanded), children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-bar-identity", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-title-col", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-title-line", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-name-text", children: model.model_name }),
          merchant?.channel_id && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-dot-sep", children: "\xB7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-a6-merchant-id-text", children: [
              "\u5546\u6237ID ",
              merchant.channel_id
            ] })
          ] }),
          isPinnedHere && !isChannelDisabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              className: "dsh-a6-pin-badge here",
              "data-tooltip": `\u8BE5\u6A21\u578B\u5DF2\u56FA\u5B9A\u5230\u5F53\u524D\u5546\u5BB6${model.pinnedFallback === false ? "\uFF08\u4E25\u683C\u56FA\u5B9A\uFF09" : "\uFF0C\u5F02\u5E38\u65F6\u81EA\u52A8\u5207\u6362\u667A\u80FD\u4F18\u9009"}${pinTokenNote}`,
              "data-tooltip-pos": "down",
              children: "\u5DF2\u56FA\u5B9A"
            }
          ),
          isPinnedElsewhere && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              className: "dsh-a6-pin-badge elsewhere",
              "data-tooltip": `\u8BE5\u6A21\u578B\u5DF2\u56FA\u5B9A\u5230${model.pinnedChannelId ? `\u5546\u6237 #${model.pinnedChannelId}` : "\u5176\u4ED6\u5546\u5BB6"}${model.pinnedSupplierName ? `\uFF08${model.pinnedSupplierName}\uFF09` : ""}${!hasMerchant ? "\uFF1B\u5F53\u524D\u6682\u65E0\u5546\u5BB6\u6570\u636E" : ""}${pinTokenNote}`,
              "data-tooltip-pos": "down",
              children: !hasMerchant && model.pinnedChannelId ? `\u5DF2\u56FA\u5B9A\u5230\u5546\u6237 #${model.pinnedChannelId}` : "\u5DF2\u56FA\u5B9A\u5230\u5176\u4ED6\u5546\u5BB6"
            }
          ),
          isChannelDisabled && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-pin-badge disabled", "data-tooltip": "\u5F53\u524D\u5546\u5BB6\u5DF2\u5BF9\u8BE5\u6A21\u578B\u7981\u7528\uFF0C\u8DEF\u7531\u4E0D\u4F1A\u547D\u4E2D\u6B64\u6E20\u9053", "data-tooltip-pos": "down", children: "\u5DF2\u7981\u7528" })
        ] }),
        merchant?.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-sub-desc", children: merchant.description })
      ] }) }),
      merchant ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-bar-pricing", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-price-col", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-price-top", title: "\u8F93\u5165\u4EF7 (1M)", children: merchant.input_price_cny }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-price-btm", title: "\u7F13\u5B58\u8BFB (1M)", children: merchant.cache_read_price_cny })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-price-col", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-price-top", title: "\u8F93\u51FA\u4EF7 (1M)", children: merchant.output_price_cny }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-price-btm", title: "\u7F13\u5B58\u5199 (1M)", children: merchant.cache_write_price_cny })
        ] }),
        blend100mValid && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-blend-pill", title: blendTitle, children: [
          "\u2248 \xA5",
          fmtSig(blend100m),
          "/\u4EBF"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-ratio-pill", title: "\u5B9E\u65F6\u500D\u7387\u6BD4\u5B98\u65B9\u4EF7", children: ratioText })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-bar-pricing unprobed", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: `dsh-a6-unprobed-hint ${model.probeError ? "error" : ""}`,
          "data-tooltip": model.probeError || void 0,
          "data-tooltip-pos": "down",
          children: isProbing ? "\u5546\u5BB6\u63A2\u6D4B\u4E2D..." : isQueued ? "\u6392\u961F\u7B49\u5F85\u63A2\u6D4B..." : model.probeError ? "\u63A2\u6D4B\u5931\u8D25" : "\u5C1A\u672A\u63A2\u6D4B\u5546\u5BB6"
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-bar-uptime", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-uptime-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-label", children: "\u5B9E\u65F6" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-dots-track", children: renderRealtimeDots() }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-val", children: merchant ? `${merchant.recent_success_rate_pct.toFixed(1)}%` : "100.0%" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-uptime-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-label", children: "24h" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-dots-track", children: render24hDots() }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-val", children: merchant ? `${merchant.success_rate_24h_pct.toFixed(1)}%` : "99.3%" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-uptime-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-label", children: "7d" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-dots-track", children: render7dDots() }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-uptime-val", children: merchant?.sr_7d_state === "no_data" ? "-" : merchant?.success_rate_7d_pct ? `${merchant.success_rate_7d_pct.toFixed(1)}%` : "-" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-bar-perf", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-perf-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-latency-text", children: latencySec }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-a6-cache-hit-text", children: [
          cacheHitPct.toFixed(1),
          "%"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-hit-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            className: "dsh-a6-hit-fill",
            style: { width: `${Math.min(100, Math.max(0, cacheHitPct))}%` }
          }
        ) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-bar-tags", children: (merchant?.labels || ["\u7A33\u5B9A", "\u4F4E\u4EF7", "\u9AD8\u901F", "\u9AD8\u8D28"]).map((lbl, idx) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `dsh-a6-smart-pill ${getTagClass(lbl)}`, children: lbl }, idx)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-card-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-time-stack", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "span",
          {
            className: "dsh-a6-time-ago",
            "data-tooltip": "\u8BE5\u5546\u6237\u8DEF\u7EBF\u5168\u7F51\u6700\u8FD1\u4E00\u6B21\u6210\u529F\u54CD\u5E94\u65F6\u95F4",
            children: [
              "\u5168\u7F51\u6700\u8FD1\uFF1A",
              merchant?.last_success_text || "\u521A\u521A"
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "span",
          {
            className: `dsh-a6-time-ago dsh-a6-route-snapshot${model.lastRoutedAt ? "" : " never"}`,
            "data-tooltip": model.lastRoutedAt ? `\u4E2A\u4EBA\u6700\u540E\u4E00\u6B21\u8BF7\u6C42\u8BE5\u5546\u5BB6\u7684\u8BE5\u6A21\u578B ${formatAbsolute(model.lastRoutedAt)}` : "\u65E5\u5FD7\u4E2D\u6682\u65E0\u8BE5\u5546\u5BB6\u7684\u8BE5\u6A21\u578B\u8DEF\u7531\u8BB0\u5F55",
            children: [
              "\u4E2A\u4EBA\u6700\u8FD1\uFF1A",
              model.lastRoutedText || "\u4ECE\u672A\u8DEF\u7531"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-bar-actions", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-bar-actions-btns", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
            onClick: handleProbe,
            disabled: isProbing || isQueued,
            "data-tooltip": isQueued ? "\u6B63\u5728\u5168\u91CF\u63A2\u6D4B\u961F\u5217\u4E2D\u7B49\u5F85\uFF0C\u8BF7\u52FF\u91CD\u590D\u70B9\u51FB" : "\u5411\u8BE5\u6A21\u578B\u53D1\u9001\u4E00\u6B21\u8BF7\u6C42\u4EE5\u63A2\u6D4B\u5E76\u6355\u83B7\u5176\u5B9E\u9645\u547D\u4E2D\u7684\u5546\u6237 ID\u3001\u4EF7\u683C\u53CA\u5065\u5EB7\u5EA6\u6307\u6807\uFF08\u6D88\u8017\u5C11\u91CFToken\uFF09",
            children: isProbing ? "\u63A2\u6D4B\u4E2D..." : isQueued ? "\u7B49\u5F85\u63A2\u6D4B" : "\u63A2\u6D4B\u5546\u5BB6"
          }
        ),
        isPinnedHere ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-danger dsh-a6-btn-sm",
            onClick: handleUnpin,
            disabled: isBusy || !canWebAction || model.pinTokenMatched === false || isProbing || isQueued,
            "data-tooltip": isProbing || isQueued ? "\u63A2\u6D4B\u5B8C\u6210\u540E\u518D\u53D6\u6D88\u56FA\u5B9A" : model.pinTokenMatched === false ? "\u8BE5\u56FA\u5B9A\u5C5E\u4E8E\u5176\u4ED6\u4EE4\u724C\uFF0C\u65E0\u6CD5\u5728\u6B64\u53D6\u6D88\uFF1B\u5982\u9700\u53D6\u6D88\u8BF7\u5230\u5B98\u7F51\u6216\u5148\u4E3A\u5F53\u524D\u4EE4\u724C\u56FA\u5B9A\u6B64\u5546\u5BB6" : !canWebAction ? "\u9700\u5148\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD" : model.pinTokenMatched === void 0 ? "\u672A\u80FD\u786E\u8BA4\u8BE5\u56FA\u5B9A\u662F\u5426\u5C5E\u4E8E\u5F53\u524D\u4EE4\u724C\uFF0C\u70B9\u51FB\u540E\u5C06\u91CD\u65B0\u89E3\u6790\u5E76\u5C1D\u8BD5\u53D6\u6D88\uFF1B\u82E5\u5931\u8D25\u53EF\u5148\u63A2\u6D4B\u4E00\u6B21\u540E\u91CD\u8BD5\uFF0C\u6216\u5230\u5B98\u7F51\u624B\u52A8\u53D6\u6D88" : "\u53D6\u6D88\u56FA\u5B9A\u540E\u6062\u590D\u667A\u80FD\u4F18\u9009\u8DEF\u7531\uFF0C\u53EF\u91CD\u65B0\u63A2\u6D4B\u540E\u518D\u51B3\u5B9A\u662F\u5426\u56FA\u5B9A",
            children: isBusy ? "\u5904\u7406\u4E2D..." : "\u53D6\u6D88\u56FA\u5B9A"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
            onClick: handleOpenPinConfirm,
            disabled: isBusy || !hasMerchant || !canWebAction || isProbing || isQueued,
            "data-tooltip": isProbing || isQueued ? "\u63A2\u6D4B\u5B8C\u6210\u540E\u518D\u56FA\u5B9A\u5546\u5BB6" : !hasMerchant ? "\u8BE5\u6A21\u578B\u6682\u65E0\u5546\u5BB6\u6570\u636E\uFF0C\u8BF7\u5148\u300C\u63A2\u6D4B\u5546\u5BB6\u300D" : !canWebAction ? "\u9700\u5148\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD" : "\u628A\u5F53\u524D\u5546\u5BB6\u56FA\u5B9A\u4E3A\u8BE5\u6A21\u578B\u7684\u670D\u52A1\u6E20\u9053\uFF08\u4F18\u5148\u8DEF\u7531\uFF0C\u5F02\u5E38\u65F6\u81EA\u52A8\u5207\u6362\u667A\u80FD\u4F18\u9009\uFF09",
            children: isBusy ? "\u5904\u7406\u4E2D..." : "\u56FA\u5B9A\u5546\u5BB6"
          }
        ),
        isChannelDisabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
            onClick: handleRestore,
            disabled: isBusy || !canWebAction || isProbing || isQueued,
            "data-tooltip": isProbing || isQueued ? "\u63A2\u6D4B\u5B8C\u6210\u540E\u518D\u6062\u590D" : canWebAction ? "\u6062\u590D\u8BE5\u5546\u5BB6\u5BF9\u6B64\u6A21\u578B\u7684\u670D\u52A1" : "\u9700\u5148\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD",
            children: isBusy ? "\u5904\u7406\u4E2D..." : "\u6062\u590D"
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
            onClick: handleDisable,
            disabled: isBusy || !hasMerchant || !canWebAction || isProbing || isQueued,
            "data-tooltip": isProbing || isQueued ? "\u63A2\u6D4B\u5B8C\u6210\u540E\u518D\u7981\u7528" : !hasMerchant ? "\u8BE5\u6A21\u578B\u6682\u65E0\u5546\u5BB6\u6570\u636E\uFF0C\u8BF7\u5148\u300C\u63A2\u6D4B\u5546\u5BB6\u300D" : !canWebAction ? "\u9700\u5148\u5728\u300C\u57FA\u7840\u914D\u7F6E\u300D\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C/\u4F1A\u8BDD" : "\u7981\u7528\u5F53\u524D\u5546\u5BB6\u5BF9\u8BE5\u6A21\u578B\u7684\u670D\u52A1\uFF0C\u8DEF\u7531\u5C06\u4E0D\u518D\u547D\u4E2D\u6B64\u6E20\u9053",
            children: isBusy ? "\u5904\u7406\u4E2D..." : "\u7981\u7528"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-btn dsh-a6-btn-sm ${model.inDsh ? "dsh-a6-btn-in-dsh" : "dsh-a6-btn-primary"}`,
            onClick: handleToggleDsh,
            "data-tooltip": model.inDsh ? "\u5DF2\u52A0\u5165 DSH \u6A21\u578B\u9009\u62E9\u5668 (\u70B9\u51FB\u79FB\u9664)" : "\u6DFB\u52A0\u81F3 DSH \u6A21\u578B\u9009\u62E9\u5668",
            children: model.inDsh ? "\u79FB\u9664\u6A21\u578B" : "\u6DFB\u52A0\u6A21\u578B"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-expand-toggle-btn ${expanded ? "open" : ""}`,
            onClick: () => setExpanded(!expanded),
            "data-tooltip": expanded ? "\u6536\u8D77\u4EF7\u683C\u8BE6\u60C5" : "\u5C55\u5F00\u5B98\u65B9\u57FA\u51C6\u4EF7\u4E0E\u5546\u6237\u5B9E\u65F6\u4EF7\u5BF9\u6BD4\u8868",
            "data-tooltip-pos": "left",
            children: expanded ? "\u6536\u8D77" : "\u8BE6\u60C5"
          }
        )
      ] }) }),
      actionError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-action-error", role: "alert", children: actionError })
    ] }),
    expanded && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-detail-container", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-detail-top-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-dt-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-dt-label", children: "\u6E20\u9053\u8BF4\u660E" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-dt-desc", children: merchant?.description || "\u9AD8\u5E76\u53D1 \u4E3B\u6253\u4FBF\u5B9C \u7A33\u5B9A" })
        ] }),
        merchant?.channel_name && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-dt-right", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-dt-label", children: "\u547D\u4E2D\u7EBF\u8DEF" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-a6-dt-channel-name", children: [
            merchant.channel_name,
            " (ID: ",
            merchant.channel_id,
            ")"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-dt-divider" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-dt-table-col", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "dsh-a6-price-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { className: "dsh-a6-th-blank" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u5165\u4EF7 (1M)" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u8F93\u51FA\u4EF7 (1M)" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u8BFB (1M)" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "\u7F13\u5B58\u5199 (1M)" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "dsh-a6-tr-official", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-label", children: "\u5B98\u65B9\u4EF7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: merchant?.official_price?.input_cny || "\xA526.884" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: merchant?.official_price?.output_cny || "\xA5134.418" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: merchant?.official_price?.cache_read_cny || "\xA52.688" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: merchant?.official_price?.cache_write_cny || "\xA533.605" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: "dsh-a6-tr-merchant", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-label", children: "\u5546\u6237\u4EF7" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-bold", children: merchant?.input_price_cny || "\xA50.1364" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-bold", children: merchant?.output_price_cny || "\xA50.6822" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-bold", children: merchant?.cache_read_price_cny || "\xA50.0136" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "dsh-a6-td-bold", children: merchant?.cache_write_price_cny || "\xA50.1705" })
          ] })
        ] })
      ] }) })
    ] }),
    pinConfirmOpen && merchant && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        className: "dsh-a6-pin-modal-overlay",
        onClick: (e) => {
          e.stopPropagation();
          setPinConfirmOpen(false);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: "dsh-a6-pin-modal",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "\u56FA\u5B9A\u5546\u5BB6\u786E\u8BA4",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-pin-modal-title", children: "\u56FA\u5B9A\u5546\u5BB6" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-pin-modal-body", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-pin-modal-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-pin-modal-label", children: "\u6A21\u578B" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-pin-modal-value", children: model.model_name })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-pin-modal-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-pin-modal-label", children: "\u5546\u5BB6" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-a6-pin-modal-value", children: [
                    merchant.channel_name,
                    " (ID: ",
                    merchant.channel_id,
                    ")"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-pin-modal-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsh-a6-pin-modal-label", children: "\u5F53\u524D\u4EF7" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsh-a6-pin-modal-value", children: [
                    "\u8F93\u5165 ",
                    merchant.input_price_cny,
                    " \xB7 \u8F93\u51FA ",
                    merchant.output_price_cny
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsh-a6-pin-modal-note", children: "\u56FA\u5B9A\u540E\u8BE5\u6A21\u578B\u7684\u6D41\u91CF\u4F18\u5148\u8D70\u6B64\u5546\u5BB6\uFF1B\u5546\u5BB6\u5F02\u5E38\u65F6\u81EA\u52A8\u5207\u6362\u667A\u80FD\u4F18\u9009\uFF08\u5E73\u53F0\u9ED8\u8BA4\uFF09\u3002\u56FA\u5B9A\u751F\u6548\u4E8E\u5F53\u524D API Key \u4EE4\u724C\uFF0C\u53EF\u968F\u65F6\u53D6\u6D88\u3002" }),
                actionError && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsh-a6-action-error", children: actionError })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsh-a6-pin-modal-foot", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
                    onClick: () => setPinConfirmOpen(false),
                    disabled: isBusy,
                    children: "\u53D6\u6D88"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
                    onClick: handleConfirmPin,
                    disabled: isBusy,
                    children: isBusy ? "\u56FA\u5B9A\u4E2D..." : "\u786E\u8BA4\u56FA\u5B9A"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
};

// src/client/components/BalanceCard.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var AccountPanel = ({ balance, config, recentLogs = [], onNavigateToConfig }) => {
  const [refreshing, setRefreshing] = (0, import_react2.useState)(false);
  const handleRefreshBalance = async () => {
    setRefreshing(true);
    await store.refreshBalance();
    setRefreshing(false);
  };
  const hasAuth = balance?.hasAccountAuth ?? false;
  const isLow = balance ? balance.isLow : false;
  const formatLogTime = (ts) => {
    if (!ts) return "\u521A\u521A";
    const d = new Date(ts * 1e3);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-account-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `dsh-a6-balance-banner ${isLow ? "low-balance" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-balance-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-balance-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-balance-main-title", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-balance-label", children: "\u8D26\u6237\u771F\u5B9E\u4F59\u989D (\u5B9E\u65F6\u540C\u6B65)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-balance-num-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dsh-a6-balance-amount ${!hasAuth ? "unauthed" : ""}`, children: hasAuth ? balance?.accountBalanceFormatted ?? "$0.00" : "\u672A\u8FDE\u63A5" }),
              hasAuth && balance?.accountBalanceCnyFormatted && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-balance-cny", children: balance.accountBalanceCnyFormatted }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dsh-a6-status-pill ${hasAuth ? "success" : "warn"}`, children: hasAuth ? "\u8D26\u6237\u5DF2\u540C\u6B65" : "\u672A\u8FDE\u63A5\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C" })
            ] })
          ] }),
          isLow && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-low-alert", children: "\u4F59\u989D\u8F83\u4F4E (< $0.50)\uFF0C\u5EFA\u8BAE\u53CA\u65F6\u5145\u503C\u4EE5\u4FDD\u969C\u6B63\u5E38\u8C03\u7528" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-balance-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
              onClick: handleRefreshBalance,
              disabled: refreshing,
              "data-tooltip": "\u4ECE A6API \u63A7\u5236\u53F0\u540C\u6B65\u83B7\u53D6\u6700\u65B0\u8D26\u6237\u771F\u5B9E\u53EF\u7528\u4F59\u989D\u4E0E\u6D88\u8017\u7EDF\u8BA1\uFF08\u4E0D\u6D88\u8017 Token\uFF09",
              "data-tooltip-pos": "down",
              children: refreshing ? "\u5237\u65B0\u4E2D..." : "\u5237\u65B0\u4F59\u989D"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "a",
            {
              href: "https://a6api.com/console",
              target: "_blank",
              rel: "noreferrer",
              className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
              style: { textDecoration: "none" },
              "data-tooltip": "\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00 A6API \u63A7\u5236\u53F0\u8FDB\u884C\u5728\u7EBF\u5145\u503C\u6216\u7BA1\u7406\u51ED\u636E",
              "data-tooltip-pos": "down-left",
              children: "\u524D\u5F80\u5145\u503C / \u63A7\u5236\u53F0"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-stat-cards-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-kpi-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-label", children: "\u5173\u8054\u8D26\u6237" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-val", children: hasAuth ? `${balance?.username || "\u5DF2\u8BA4\u8BC1\u7528\u6237"} (#${balance?.userId || "\u2014"})` : "\u672A\u7ED1\u5B9A" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-kpi-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-label", children: "\u5386\u53F2\u603B\u6D88\u8017" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-val", children: hasAuth ? `$${balance?.usedUsd?.toFixed(2) ?? "0.00"}` : "\u2014" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-kpi-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-label", children: "\u7D2F\u8BA1\u8BF7\u6C42\u6B21\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-val", children: hasAuth ? `${balance?.requestCount ?? 0} \u6B21` : "\u2014" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-kpi-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-label", children: "\u5B9E\u65F6\u6C47\u7387\u53C2\u8003" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-kpi-val", children: "1 USD \u2248 6.7209 CNY" })
        ] })
      ] })
    ] }),
    !hasAuth && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-auth-banner-box", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-auth-banner-content", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-a6-auth-banner-title", children: "\u8FDE\u63A5\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u4EE5\u89E3\u9501\u5B8C\u6574\u8D44\u4EA7\u76D1\u63A7" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-auth-banner-desc", children: [
          "\u586B\u5165\u60A8\u7684 ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "A6API \u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C" }),
          " \u540E\uFF0C\u5373\u53EF\u5728\u6B64\u5B9E\u65F6\u67E5\u770B\u8D26\u6237\u771F\u5B9E\u53EF\u7528\u4F59\u989D\u3001\u5386\u53F2\u6D88\u8017\u3001\u7D2F\u8BA1\u8BF7\u6C42\u4EE5\u53CA\u5546\u6237\u8DEF\u7531\u4EF7\u683C\u6307\u6807\u3002"
        ] })
      ] }),
      onNavigateToConfig && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
          onClick: onNavigateToConfig,
          children: "\u586B\u5199\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-logs-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dsh-a6-logs-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-logs-title", children: "\u6700\u8FD1\u8DEF\u7531\u8C03\u7528\u660E\u7EC6 (\u5B9E\u65F6\u5FEB\u7167)" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-logs-subtitle", children: "\u5C55\u793A\u901A\u8FC7\u5F53\u524D A6API \u63A5\u5165\u7684\u8FD1\u671F\u8BF7\u6C42\u4E0E\u5546\u6237\u8DEF\u7531\u8017\u65F6" })
      ] }),
      recentLogs && recentLogs.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-a6-logs-table-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { className: "dsh-a6-logs-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u8C03\u7528\u65F6\u95F4" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u72B6\u6001" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u5546\u6237id" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u8BF7\u6C42\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u8F93\u5165/\u8F93\u51FA" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u82B1\u8D39" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("th", { children: "\u8017\u65F6" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: recentLogs.map((log, idx) => {
          const isErr = log.status === "error" || log.status === "failed" || log.raw && (log.raw.type !== 2 || log.raw.other && (log.raw.other.includes('"request_final_status":"failed"') || log.raw.other.includes('"request_final_status":"error"') || log.raw.other.includes('"request_final_status":"upstream_error"')) || Boolean(log.raw.content && log.raw.content.startsWith("status_code=")));
          const channelNum = Number(log.channel || log.raw?.channel || 0);
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("tr", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dsh-a6-log-time", children: formatLogTime(log.created_at) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `dsh-a6-log-status ${isErr ? "err" : "ok"}`, children: isErr ? "\u5931\u8D25" : "\u6210\u529F" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dsh-a6-log-channel", children: channelNum > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "dsh-a6-log-channel-badge", children: [
              "#",
              channelNum
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-a6-log-channel-empty", children: "\u65E0" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dsh-a6-log-model", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: log.model_name }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("td", { className: "dsh-a6-log-tokens", children: [
              log.prompt_tokens || 0,
              " / ",
              log.completion_tokens || 0
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dsh-a6-log-cost", children: log.cost_formatted || "$0.00" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("td", { className: "dsh-a6-log-time-use", children: log.use_time ? `${log.use_time}s` : "\u2014" })
          ] }, log.id || idx);
        }) })
      ] }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dsh-a6-empty-logs", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u6682\u65E0\u8FD1\u671F\u8C03\u7528\u8BB0\u5F55\u3002\u5728 DSH \u4E2D\u53D1\u8D77\u6A21\u578B\u5BF9\u8BDD\u6216\u70B9\u51FB\u300C\u63A2\u6D4B\u5546\u5BB6\u300D\u540E\uFF0C\u8C03\u7528\u660E\u7EC6\u5C06\u5728\u6B64\u5B9E\u65F6\u5C55\u793A\u3002" }) })
    ] })
  ] });
};

// src/client/components/ConfigPanel.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
var ConfigPanel = ({ config, dshConfiguredModels }) => {
  const [apiKey, setApiKey] = (0, import_react3.useState)(config.apiKey || "");
  const [accessToken, setAccessToken] = (0, import_react3.useState)(config.accessToken || "");
  const [clearKey, setClearKey] = (0, import_react3.useState)(false);
  const [clearToken, setClearToken] = (0, import_react3.useState)(false);
  const [selectedNode, setSelectedNode] = (0, import_react3.useState)(
    config.baseURL || "https://api.a6api.com"
  );
  const [customNode, setCustomNode] = (0, import_react3.useState)(
    config.baseURL && config.baseURL !== "https://api.a6api.com" && config.baseURL !== "https://a6.a6api.com" ? config.baseURL : ""
  );
  const [isCustom, setIsCustom] = (0, import_react3.useState)(
    config.baseURL !== "https://api.a6api.com" && config.baseURL !== "https://a6.a6api.com"
  );
  const [showKey, setShowKey] = (0, import_react3.useState)(false);
  const [showToken, setShowToken] = (0, import_react3.useState)(false);
  const [showHelp, setShowHelp] = (0, import_react3.useState)(false);
  const [saving, setSaving] = (0, import_react3.useState)(false);
  const [saveSuccess, setSaveSuccess] = (0, import_react3.useState)(false);
  const apiKeySet = apiKey === MASK;
  const tokenSet = accessToken === MASK;
  (0, import_react3.useEffect)(() => {
    setApiKey(config.apiKey || "");
    setAccessToken(config.accessToken || "");
    setClearKey(false);
    setClearToken(false);
    setSelectedNode(config.baseURL || "https://api.a6api.com");
    setCustomNode(
      config.baseURL && config.baseURL !== "https://api.a6api.com" && config.baseURL !== "https://a6.a6api.com" ? config.baseURL : ""
    );
    setIsCustom(
      config.baseURL !== "https://api.a6api.com" && config.baseURL !== "https://a6.a6api.com"
    );
  }, [config]);
  const handleSave = async () => {
    setSaving(true);
    const finalBaseUrl = isCustom ? customNode.trim() || "https://api.a6api.com" : selectedNode;
    const newApiKey = apiKeySet ? clearKey ? "" : void 0 : apiKey.trim();
    const newToken = tokenSet ? clearToken ? "" : void 0 : accessToken.trim();
    const ok = await store.saveConfig({
      ...newApiKey !== void 0 ? { apiKey: newApiKey } : {},
      ...newToken !== void 0 ? { accessToken: newToken } : {},
      baseURL: finalBaseUrl
    });
    setSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-config-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-config-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-section-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-heading-title", children: "API \u63A5\u5165\u8282\u70B9 (Base URL)" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-heading-desc", children: "\u9009\u62E9\u79BB\u60A8\u6700\u8FD1\u7684 A6API \u805A\u5408\u7F51\u5173\u63A5\u5165\u70B9\uFF0C\u652F\u6301 CDN \u8282\u70B9\u4E0E\u76F4\u8FDE\u5907\u7528\u8282\u70B9\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-node-picker", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-node-pill ${!isCustom && selectedNode === "https://api.a6api.com" ? "active" : ""}`,
            onClick: () => {
              setIsCustom(false);
              setSelectedNode("https://api.a6api.com");
            },
            children: "https://api.a6api.com (CDN \u63A8\u8350)"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-node-pill ${!isCustom && selectedNode === "https://a6.a6api.com" ? "active" : ""}`,
            onClick: () => {
              setIsCustom(false);
              setSelectedNode("https://a6.a6api.com");
            },
            children: "https://a6.a6api.com (\u76F4\u8FDE\u5907\u7528)"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-node-pill ${isCustom ? "active" : ""}`,
            onClick: () => setIsCustom(true),
            children: "\u81EA\u5B9A\u4E49\u8282\u70B9"
          }
        )
      ] }),
      isCustom && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "text",
          className: "dsh-a6-input",
          placeholder: "https://your-custom-gateway.com",
          value: customNode,
          onChange: (e) => setCustomNode(e.target.value),
          style: { marginTop: "8px" }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-config-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-section-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-heading-title", children: "\u8BBF\u95EE\u9274\u6743\u4E0E\u4EE4\u724C\u51ED\u636E" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-heading-desc", children: "\u914D\u7F6E\u6A21\u578B\u8C03\u7528 API Key \u4EE5\u53CA\u7528\u4E8E\u540C\u6B65\u8D26\u6237\u4F59\u989D\u4E0E\u5546\u6237\u884C\u60C5\u7684\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-config-fields-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-a6-label", children: "A6API \u4EE4\u724C (API Key)" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field-header-actions", children: [
              apiKeySet && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-a6-btn-text",
                  onClick: () => {
                    setClearKey(true);
                    setApiKey("");
                  },
                  children: "\u6E05\u9664"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-a6-btn-text",
                  onClick: () => setShowKey(!showKey),
                  children: showKey ? "\u9690\u85CF" : "\u663E\u793A"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-a6-input-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: showKey ? "text" : "password",
              className: "dsh-a6-input",
              placeholder: apiKeySet ? "\u5DF2\u4FDD\u5B58 \xB7 \u8F93\u5165\u65B0 Key \u53EF\u66FF\u6362" : "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
              value: apiKeySet ? "" : apiKey,
              onChange: (e) => setApiKey(e.target.value)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-field-hint", children: apiKeySet ? "\u5DF2\u914D\u7F6E API Key\uFF08\u4EC5\u4FDD\u5B58\u5728\u672C\u673A ~/.dsh/.credentials.yaml\uFF0C\u4E0D\u56DE\u4F20\u754C\u9762\uFF09\u3002" : "\u7528\u4E8E\u5411 A6API \u53D1\u8D77\u6A21\u578B\u5BF9\u8BDD\u8BF7\u6C42\u4E0E\u62C9\u53D6\u767D\u540D\u5355\u6A21\u578B\u3002" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "dsh-a6-label", children: "\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C (Access Token)" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field-header-actions", children: [
              tokenSet && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-a6-btn-text",
                  onClick: () => {
                    setClearToken(true);
                    setAccessToken("");
                  },
                  children: "\u6E05\u9664"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  className: "dsh-a6-btn-text",
                  onClick: () => setShowToken(!showToken),
                  children: showToken ? "\u9690\u85CF" : "\u663E\u793A"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-a6-input-wrapper", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: showToken ? "text" : "password",
              className: "dsh-a6-input",
              placeholder: tokenSet ? "\u5DF2\u4FDD\u5B58 \xB7 \u8F93\u5165\u65B0\u4EE4\u724C\u53EF\u66FF\u6362" : "\u5728\u63A7\u5236\u53F0\u5B89\u5168\u8BBE\u7F6E\u4E2D\u590D\u5236\uFF0C\u4F8B\u5982 eyJhbGciOi...",
              value: tokenSet ? "" : accessToken,
              onChange: (e) => setAccessToken(e.target.value)
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-field-footer", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-field-hint", children: tokenSet ? "\u5DF2\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\uFF08\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u4E0D\u56DE\u4F20\u754C\u9762\uFF09\u3002" : "\u7528\u4E8E\u514D\u5931\u6548\u540C\u6B65\u8D26\u6237\u771F\u5B9E\u4F59\u989D\u4E0E\u5546\u6237\u6307\u6807\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn-text",
                onClick: () => setShowHelp(!showHelp),
                style: { fontSize: "11px", whiteSpace: "nowrap" },
                children: showHelp ? "\u6536\u8D77\u6559\u7A0B" : "\u83B7\u53D6\u6559\u7A0B"
              }
            )
          ] })
        ] })
      ] }),
      showHelp && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-help-drawer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-a6-help-title", children: "\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u83B7\u53D6\u6B65\u9AA4\uFF08\u6C38\u4E45\u6709\u6548\uFF09\uFF1A" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ol", { className: "dsh-a6-help-list", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
            "\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u5E76\u767B\u5F55",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("a", { href: "https://a6api.com/console/personal", target: "_blank", rel: "noreferrer", children: "a6api.com/console/personal" }),
            " ",
            "\uFF08\u4E2A\u4EBA\u8BBE\u7F6E - \u5B89\u5168\u8BBE\u7F6E\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
            "\u5728\u300C\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u300D\u680F\u76EE\u76F4\u63A5\u70B9\u51FB\u590D\u5236\u4EE4\u724C\u5B57\u7B26\u4E32\uFF08\u4F8B\u5982 ",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: "eyJhbGciOi..." }),
            "\uFF09"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: "\u7C98\u8D34\u5230\u4E0A\u65B9\u7684\u300C\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u300D\u8F93\u5165\u6846\u4E2D\u5E76\u70B9\u51FB\u4E0B\u65B9\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\u5373\u53EF\u81EA\u52A8\u540C\u6B65\u4F59\u989D\uFF01" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-config-section", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-section-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-heading-title", children: "DSH \u539F\u751F LLM \u63D0\u4F9B\u5546\u96C6\u6210\u72B6\u6001" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-a6-heading-desc", children: [
          "\u63D2\u4EF6\u5DF2\u5C06 A6API \u6CE8\u518C\u4E3A DSH \u539F\u751F\u6A21\u578B\u63D0\u4F9B\u5546 (",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: "a6api" }),
          ")\u3002\u5728\u300C\u53EF\u7528\u6A21\u578B\u300D\u4E2D\u542F\u7528\u7684\u6A21\u578B\u5C06\u81EA\u52A8\u5199\u5165 DSH \u914D\u7F6E\u6587\u4EF6\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-integration-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-int-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-int-key", children: "\u63D0\u4F9B\u5546\u6807\u8BC6" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "dsh-a6-int-val", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { children: "a6api" }),
            " (OpenAI-compatible)"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-int-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-int-key", children: "\u5F53\u524D\u5DF2\u542F\u7528\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-a6-int-tags", children: dshConfiguredModels.length > 0 ? dshConfiguredModels.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-model-chip", children: m }, m)) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-empty-hint", children: "\u6682\u672A\u542F\u7528\u4EFB\u4F55\u6A21\u578B\uFF0C\u8BF7\u524D\u5F80\u300C\u53EF\u7528\u6A21\u578B\u300D\u9875\u9762\u70B9\u51FB\u300C\u6DFB\u52A0\u5230 DSH\u300D" }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dsh-a6-save-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dsh-a6-save-status", children: saveSuccess && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "dsh-a6-success-msg", children: "\u914D\u7F6E\u5DF2\u6210\u529F\u4FDD\u5B58\u5E76\u540C\u6B65" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "dsh-a6-btn dsh-a6-btn-primary",
          onClick: handleSave,
          disabled: saving,
          style: { minWidth: "100px" },
          children: saving ? "\u6B63\u5728\u4FDD\u5B58..." : "\u4FDD\u5B58\u914D\u7F6E"
        }
      )
    ] })
  ] });
};

// src/client/components/PricePill.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var PricePill = ({ pf, hasToken, compact }) => {
  const n = Number(pf?.pendingCount ?? 0);
  const hasAuth = pf?.hasAuth !== false && !pf?.authError && Boolean(hasToken);
  const isAuthError = Boolean(pf?.authError);
  const isZero = n === 0;
  const isDisabled = !hasAuth || isZero;
  const compactCls = compact ? " compact" : "";
  const cls = isDisabled ? !hasAuth ? `dsh-a6-price-pill disabled${compactCls}` : `dsh-a6-price-pill is-zero is-disabled-zero${compactCls}` : `dsh-a6-price-pill has-change${compactCls}`;
  const title = !hasAuth ? isAuthError ? "\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\u5DF2\u5931\u6548\uFF0C\u8BF7\u524D\u5F80\u57FA\u7840\u914D\u7F6E\u66F4\u65B0" : "\u672A\u914D\u7F6E\u7CFB\u7EDF\u8BBF\u95EE\u4EE4\u724C\uFF0C\u65E0\u6CD5\u83B7\u53D6\u4EF7\u683C\u53D8\u52A8" : isZero ? "\u6682\u65E0\u4EF7\u683C\u53D8\u52A8" : `\u6709 ${n} \u6761\u4EF7\u683C\u53D8\u52A8\u5F85\u5904\u7406\uFF0C\u70B9\u51FB\u524D\u5F80\u5B98\u7F51\u5904\u7406`;
  const onClick = () => {
    if (isDisabled) return;
    window.open("https://a6api.com/console/token", "_blank", "noopener");
  };
  const onKeyDown = (e) => {
    if (isDisabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      className: cls,
      onClick: isDisabled ? void 0 : onClick,
      onKeyDown,
      tabIndex: isDisabled ? -1 : 0,
      title,
      role: "button",
      "aria-disabled": isDisabled,
      style: isDisabled ? { cursor: "not-allowed" } : void 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-a6-price-pill-label", children: "\u4EF7\u683C\u6CE2\u52A8\uFF1A" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dsh-a6-price-pill-count", children: !hasAuth ? "--" : n })
      ]
    }
  );
};

// src/client/components/MarketPill.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var MARKET_URL = "https://a6api.com/models";
var MarketPill = () => {
  const onClick = () => {
    window.open(MARKET_URL, "_blank", "noopener");
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
    "div",
    {
      className: "dsh-a6-market-pill",
      onClick,
      onKeyDown,
      tabIndex: 0,
      role: "button",
      title: "\u524D\u5F80 A6api \u6A21\u578B\u5E02\u573A",
      children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "dsh-a6-market-pill-label", children: "\u6A21\u578B\u5E02\u573A" })
    }
  );
};

// src/client/components/ModelCatalogPanel.tsx
var import_react4 = require("react");

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

// src/client/components/ModelCatalogPanel.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var ModelCatalogPanel = () => {
  const [catalog, setCatalog] = (0, import_react4.useState)(store.getState().catalog);
  const [models, setModels] = (0, import_react4.useState)(store.getState().models);
  const [busy, setBusy] = (0, import_react4.useState)(store.getState().catalogBusy);
  const [search, setSearch] = (0, import_react4.useState)("");
  const [availFilter, setAvailFilter] = (0, import_react4.useState)("all");
  const [paramFilter, setParamFilter] = (0, import_react4.useState)("all");
  const [editingId, setEditingId] = (0, import_react4.useState)(null);
  const [queryingId, setQueryingId] = (0, import_react4.useState)(null);
  const [confirmClear, setConfirmClear] = (0, import_react4.useState)(false);
  const confirmClearTimer = (0, import_react4.useRef)(null);
  const [msg, setMsg] = (0, import_react4.useState)(null);
  const [draft, setDraft] = (0, import_react4.useState)({ name: "", contextWindow: "", maxTokens: "", inputText: false, inputImage: false, reasoningText: "", reasoningFalse: false });
  (0, import_react4.useEffect)(() => {
    const unsub = store.subscribe(() => {
      const s = store.getState();
      setCatalog(s.catalog);
      setModels(s.models);
      setBusy(s.catalogBusy);
    });
    store.fetchCatalog();
    return unsub;
  }, []);
  const availableSet = (0, import_react4.useMemo)(
    () => new Set(models.map((m) => m.model_name.toLowerCase())),
    [models]
  );
  const flash = (kind, text) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5e3);
  };
  const handleFetchMarket = async () => {
    const r = await store.fetchMarketModels();
    if (r.ok) {
      if (r.failedPages && r.failedPages > 0) {
        flash("err", `\u5DF2\u83B7\u53D6 ${r.total} \u4E2A\u6A21\u578B\uFF08\u65B0\u589E ${r.added} \u4E2A\uFF09\uFF0C\u4F46\u6709 ${r.failedPages} \u9875\u62C9\u53D6\u5931\u8D25\uFF0C\u76EE\u5F55\u53EF\u80FD\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u8BD5`);
      } else {
        flash("ok", `\u5DF2\u83B7\u53D6 ${r.total} \u4E2A\u6A21\u578B\uFF08\u65B0\u589E ${r.added} \u4E2A\uFF09`);
      }
    } else flash("err", r.error || "\u83B7\u53D6\u5931\u8D25");
  };
  const handleQueryAll = async () => {
    const r = await store.queryOpenRouter();
    if (r.ok) {
      const nf = r.notFound?.length || 0;
      flash("ok", `\u5DF2\u66F4\u65B0 ${r.updated} \u4E2A\u6A21\u578B\u53C2\u6570${nf > 0 ? `\uFF0C${nf} \u4E2A\u672A\u5728 OpenRouter \u67E5\u5230\uFF08\u53C2\u6570\u7559\u7A7A\u53EF\u624B\u52A8\u586B\u5199\uFF09` : ""}`);
    } else flash("err", r.error || "\u67E5\u8BE2\u5931\u8D25");
  };
  const handleQueryOne = async (id) => {
    setQueryingId(id);
    const r = await store.queryOpenRouter([id]);
    setQueryingId(null);
    if (r.ok) {
      if ((r.updated || 0) > 0) flash("ok", `\u300C${id}\u300D\u5DF2\u4ECE OpenRouter \u586B\u5145\u53C2\u6570`);
      else flash("ok", `\u300C${id}\u300D\u5728 OpenRouter \u672A\u67E5\u5230\uFF0C\u53EF\u624B\u52A8\u586B\u5199\u53C2\u6570`);
    } else flash("err", r.error || "\u67E5\u8BE2\u5931\u8D25");
  };
  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current);
      confirmClearTimer.current = setTimeout(() => setConfirmClear(false), 3e3);
      return;
    }
    if (confirmClearTimer.current) clearTimeout(confirmClearTimer.current);
    setConfirmClear(false);
    setEditingId(null);
    const r = await store.clearCatalog();
    if (r.ok) flash("ok", "\u6A21\u578B\u76EE\u5F55\u5DF2\u6E05\u7A7A\uFF0C\u53EF\u91CD\u65B0\u300C\u4ECE A6API \u83B7\u53D6\u5E02\u573A\u6A21\u578B\u300D");
    else flash("err", r.error || "\u6E05\u7A7A\u5931\u8D25");
  };
  const startEdit = (entry) => {
    const re = entry.reasoningEfforts && typeof entry.reasoningEfforts === "object" ? entry.reasoningEfforts : {};
    setDraft({
      name: entry.name || "",
      contextWindow: entry.contextWindow != null ? String(entry.contextWindow) : "",
      maxTokens: entry.maxTokens != null ? String(entry.maxTokens) : "",
      inputText: entry.input ? entry.input.includes("text") : false,
      inputImage: entry.input ? entry.input.includes("image") : false,
      // 保留 off 等 null 值项（显示为 "off: "），避免编辑保存后档位静默丢失
      reasoningText: Object.entries(re).map(([k, v]) => `${k}: ${v === null ? "" : v}`).join(", "),
      reasoningFalse: entry.reasoningEfforts === false
    });
    setEditingId(entry.id);
  };
  const handleSave = async (id) => {
    const patch = {};
    const name2 = draft.name.trim();
    patch.name = name2 || null;
    const ctx = Number(draft.contextWindow);
    if (draft.contextWindow.trim() !== "") {
      if (!Number.isInteger(ctx) || ctx < 1) {
        flash("err", "contextWindow \u5FC5\u987B\u662F\u6B63\u6574\u6570");
        return;
      }
      patch.contextWindow = ctx;
    } else {
      patch.contextWindow = null;
    }
    const maxT = Number(draft.maxTokens);
    if (draft.maxTokens.trim() !== "") {
      if (!Number.isInteger(maxT) || maxT < 1) {
        flash("err", "maxTokens \u5FC5\u987B\u662F\u6B63\u6574\u6570");
        return;
      }
      patch.maxTokens = maxT;
    } else {
      patch.maxTokens = null;
    }
    const mods = [];
    if (draft.inputText) mods.push("text");
    if (draft.inputImage) mods.push("image");
    patch.input = mods.length > 0 ? mods : null;
    if (draft.reasoningFalse) {
      patch.reasoningEfforts = false;
    } else {
      const text = draft.reasoningText.trim();
      if (text) {
        const parsed = {};
        let bad = false;
        for (const seg of text.split(",")) {
          const idx = seg.indexOf(":");
          if (idx < 0) {
            bad = true;
            break;
          }
          const k = seg.slice(0, idx).trim();
          const v = seg.slice(idx + 1).trim();
          if (!k) {
            bad = true;
            break;
          }
          parsed[k] = v || null;
        }
        if (bad) {
          flash("err", 'reasoningEfforts \u683C\u5F0F\u5E94\u4E3A "low: low, medium: medium"');
          return;
        }
        const checked = validateReasoningEfforts(parsed);
        if (!checked.ok) {
          flash("err", checked.error);
          return;
        }
        patch.reasoningEfforts = checked.value;
      } else {
        patch.reasoningEfforts = null;
      }
    }
    const r = await store.updateCatalogEntry(id, patch);
    if (r.ok) {
      setEditingId(null);
      flash("ok", `\u300C${id}\u300D\u5DF2\u4FDD\u5B58${store.getState().dshConfiguredModels.some((m) => m.toLowerCase() === id.toLowerCase()) ? "\uFF0C\u5E76\u5DF2\u540C\u6B65\u5230 DSH \u914D\u7F6E" : ""}`);
    } else {
      flash("err", r.error || "\u4FDD\u5B58\u5931\u8D25");
    }
  };
  const filtered = (0, import_react4.useMemo)(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((e) => {
      if (q && !e.id.toLowerCase().includes(q) && !(e.name || "").toLowerCase().includes(q)) return false;
      const isAvail = availableSet.has(e.id.toLowerCase());
      if (availFilter === "available" && !isAvail) return false;
      if (availFilter === "unavailable" && isAvail) return false;
      const filled = e.contextWindow != null || e.maxTokens != null || e.input && e.input.length > 0;
      if (paramFilter === "filled" && !filled) return false;
      if (paramFilter === "empty" && filled) return false;
      return true;
    }).sort((a, b) => a.id.localeCompare(b.id));
  }, [catalog, search, availFilter, paramFilter, availableSet]);
  const filledCount = catalog.filter((e) => e.contextWindow != null || e.maxTokens != null || e.input && e.input.length > 0).length;
  const availCount = catalog.filter((e) => availableSet.has(e.id.toLowerCase())).length;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-section-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
            onClick: handleFetchMarket,
            disabled: busy !== null,
            "data-tooltip": "\u4ECE A6API \u5E02\u573A\u7FFB\u9875\u62C9\u53D6\u5168\u90E8\u652F\u6301\u6A21\u578B\u7684 ID\uFF08\u542B\u54C1\u724C\uFF09\uFF0C\u53C2\u6570\u521D\u59CB\u4E3A\u7A7A\uFF0C\u968F\u540E\u53EF\u7528 OpenRouter \u67E5\u8BE2\u586B\u5145",
            "data-tooltip-pos": "down",
            children: busy === "fetch" ? "\u83B7\u53D6\u4E2D..." : "\u4ECE A6API \u83B7\u53D6\u5E02\u573A\u6A21\u578B"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
            onClick: handleQueryAll,
            disabled: busy !== null || catalog.length === 0,
            "data-tooltip": "\u5BF9\u76EE\u5F55\u4E2D\u5168\u90E8\u6A21\u578B\u67E5\u8BE2 OpenRouter \u5E76\u586B\u5145 contextWindow / maxTokens / input\uFF1B\u67E5\u4E0D\u5230\u7684\u4FDD\u6301\u7559\u7A7A\u53EF\u624B\u52A8\u586B\u5199",
            "data-tooltip-pos": "down",
            children: busy === "query" ? "\u67E5\u8BE2\u4E2D..." : "\u4ECE OpenRouter \u4E00\u952E\u67E5\u8BE2"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            className: `dsh-a6-btn dsh-a6-btn-danger dsh-a6-btn-sm${confirmClear ? " dsh-a6-btn-clear-confirm" : ""}`,
            onClick: handleClear,
            disabled: busy !== null || catalog.length === 0,
            "data-tooltip": "\u6E05\u7A7A\u6A21\u578B\u76EE\u5F55\u5168\u90E8\u6761\u76EE\uFF0C\u53EF\u91CD\u65B0\u4ECE A6API \u83B7\u53D6\u5E76\u91CD\u65B0\u7528 OpenRouter \u586B\u5145\uFF08\u4E0D\u5F71\u54CD\u5DF2\u5199\u5165 DSH \u914D\u7F6E\u7684\u6A21\u578B\uFF09",
            "data-tooltip-pos": "down",
            children: confirmClear ? "\u786E\u8BA4\u6E05\u7A7A\uFF1F" : "\u6E05\u7A7A\u76EE\u5F55"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-count", children: [
          "\u5171 ",
          catalog.length,
          " \u4E2A \xB7 \u53EF\u7528 ",
          availCount,
          " \u4E2A \xB7 \u5DF2\u586B\u53C2\u6570 ",
          filledCount,
          " \u4E2A"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-filters", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-filter-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${availFilter === "all" ? "active" : ""}`,
              onClick: () => setAvailFilter("all"),
              children: [
                "\u5168\u90E8 (",
                catalog.length,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${availFilter === "available" ? "active" : ""}`,
              onClick: () => setAvailFilter("available"),
              children: [
                "\u53EF\u7528 (",
                availCount,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${availFilter === "unavailable" ? "active" : ""}`,
              onClick: () => setAvailFilter("unavailable"),
              children: [
                "\u4E0D\u53EF\u7528 (",
                catalog.length - availCount,
                ")"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-filter-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${paramFilter === "all" ? "active" : ""}`,
              onClick: () => setParamFilter("all"),
              children: "\u5168\u90E8\u53C2\u6570"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${paramFilter === "filled" ? "active" : ""}`,
              onClick: () => setParamFilter("filled"),
              children: [
                "\u5DF2\u586B (",
                filledCount,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${paramFilter === "empty" ? "active" : ""}`,
              onClick: () => setParamFilter("empty"),
              children: [
                "\u672A\u586B (",
                catalog.length - filledCount,
                ")"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-search-wrapper", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "text",
              className: "dsh-a6-input dsh-a6-search-input",
              placeholder: "\u641C\u7D22\u6A21\u578B ID / \u540D\u79F0...",
              value: search,
              onChange: (e) => setSearch(e.target.value)
            }
          ),
          search && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-a6-clear-btn",
              onClick: () => setSearch(""),
              title: "\u6E05\u7A7A\u641C\u7D22",
              children: "\xD7"
            }
          )
        ] })
      ] })
    ] }),
    msg && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: `dsh-a6-catalog-msg ${msg.kind}`, children: msg.text }),
    catalog.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-empty-state", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u6A21\u578B\u76EE\u5F55\u4E3A\u7A7A\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-side-popup-hint", children: "\u70B9\u51FB\u300C\u4ECE A6API \u83B7\u53D6\u5E02\u573A\u6A21\u578B\u300D\u62C9\u53D6\u5168\u90E8\u652F\u6301\u7684\u6A21\u578B ID\uFF0C\u518D\u7528\u300C\u4ECE OpenRouter \u4E00\u952E\u67E5\u8BE2\u300D\u81EA\u52A8\u586B\u5145\u53C2\u6570\u3002" })
    ] }) : filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-a6-empty-state", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u4E0B\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B" }) }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "dsh-a6-catalog-list", children: filtered.map((entry) => {
      const editing = editingId === entry.id;
      const isAvail = availableSet.has(entry.id.toLowerCase());
      const re = entry.reasoningEfforts && typeof entry.reasoningEfforts === "object" ? entry.reasoningEfforts : null;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: `dsh-a6-catalog-row${editing ? " editing" : ""}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-row-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-id", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: entry.id }),
            isAvail && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-catalog-badge avail", children: "\u53EF\u7528" }),
            entry.name && entry.name !== entry.id && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-catalog-name", children: entry.name })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-row-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn-text",
                onClick: () => handleQueryOne(entry.id),
                disabled: busy !== null,
                "data-tooltip": "\u4ECE OpenRouter \u67E5\u8BE2\u8BE5\u6A21\u578B\u53C2\u6570\u5E76\u586B\u5145",
                children: queryingId === entry.id ? "\u67E5\u8BE2\u4E2D..." : "\u67E5\u8BE2\u53C2\u6570"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn-text",
                onClick: () => editing ? setEditingId(null) : startEdit(entry),
                children: editing ? "\u53D6\u6D88" : "\u7F16\u8F91"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: `dsh-a6-catalog-param${entry.contextWindow != null ? "" : " empty"}`, children: [
            "\u4E0A\u4E0B\u6587 ",
            entry.contextWindow != null ? entry.contextWindow.toLocaleString() : "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: `dsh-a6-catalog-param${entry.maxTokens != null ? "" : " empty"}`, children: [
            "\u8F93\u51FA ",
            entry.maxTokens != null ? entry.maxTokens.toLocaleString() : "\u2014"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: `dsh-a6-catalog-param${entry.input && entry.input.length > 0 ? "" : " empty"}`, children: [
            "\u8F93\u5165 ",
            entry.input && entry.input.length > 0 ? entry.input.join("+") : "\u2014"
          ] }),
          re && Object.keys(re).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-a6-catalog-param", children: [
            "\u63A8\u7406 ",
            Object.keys(re).length,
            " \u6863"
          ] }),
          entry.reasoningEfforts === false && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-catalog-param", children: "\u975E\u63A8\u7406" })
        ] }),
        editing && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-catalog-edit", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-edit-grid", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-edit-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-label", children: "\u540D\u79F0 (name)" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  type: "text",
                  className: "dsh-a6-input",
                  value: draft.name,
                  onChange: (e) => setDraft({ ...draft, name: e.target.value }),
                  placeholder: "\u4EC5\u7528\u6237\u586B\u5199\uFF0C\u7559\u7A7A\u5219\u4E0D\u5199\u5165 DSH \u914D\u7F6E"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-edit-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-label", children: "\u4E0A\u4E0B\u6587\u7A97\u53E3 (contextWindow)" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  type: "number",
                  min: 1,
                  className: "dsh-a6-input",
                  value: draft.contextWindow,
                  onChange: (e) => setDraft({ ...draft, contextWindow: e.target.value }),
                  placeholder: "\u5982 1048576\uFF08\u7559\u7A7A = \u4E0D\u586B\uFF0CDSH \u7528\u9ED8\u8BA4\uFF09"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-edit-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-label", children: "\u6700\u5927\u8F93\u51FA (maxTokens)" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  type: "number",
                  min: 1,
                  className: "dsh-a6-input",
                  value: draft.maxTokens,
                  onChange: (e) => setDraft({ ...draft, maxTokens: e.target.value }),
                  placeholder: "\u5982 65536\uFF08\u7559\u7A7A = \u4E0D\u586B\uFF0CDSH \u7528\u9ED8\u8BA4\uFF09"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-edit-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-label", children: "\u8F93\u5165\u6A21\u6001 (input)" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-checkbox-group", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-checkbox", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: draft.inputText,
                      onChange: (e) => setDraft({ ...draft, inputText: e.target.checked })
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "text" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-checkbox", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: draft.inputImage,
                      onChange: (e) => setDraft({ ...draft, inputImage: e.target.checked })
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "image" })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-edit-field dsh-a6-edit-wide", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "dsh-a6-label", children: [
                "\u63A8\u7406\u6863\u4F4D (reasoningEfforts)",
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-field-hint", style: { marginLeft: 6 }, children: "\u683C\u5F0F\uFF1Alow: low, medium: medium\uFF1B\u503C\u4E3A\u7A7A\u8868\u793A\u8BE5\u6863\u4F4D\u65E0 wire \u503C" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "input",
                {
                  type: "text",
                  className: "dsh-a6-input",
                  value: draft.reasoningText,
                  disabled: draft.reasoningFalse,
                  onChange: (e) => setDraft({ ...draft, reasoningText: e.target.value }),
                  placeholder: "\u9ED8\u8BA4\u5DF2\u542B DSH \u5168\u90E8 7 \u6863\uFF08off/minimal/low/medium/high/xhigh/max\uFF09\uFF0C\u53EF\u4FEE\u6539\u6216\u7559\u7A7A\u5220\u9664\u8BE5\u5B57\u6BB5"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-edit-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dsh-a6-label", children: "\u63A8\u7406\u80FD\u529B" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: "dsh-a6-checkbox", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: draft.reasoningFalse,
                    onChange: (e) => setDraft({ ...draft, reasoningFalse: e.target.checked })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "\u975E\u63A8\u7406\u6A21\u578B (reasoningEfforts: false)" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "dsh-a6-edit-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
                onClick: () => handleSave(entry.id),
                children: "\u4FDD\u5B58"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm",
                onClick: () => setEditingId(null),
                children: "\u53D6\u6D88"
              }
            )
          ] })
        ] })
      ] }, entry.id);
    }) })
  ] });
};

// src/client/components/A6ApiSettings.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var A6ApiSettingsPanel = () => {
  const [state, setState] = (0, import_react5.useState)(store.getState());
  const [activeTab, setActiveTab] = (0, import_react5.useState)("models");
  const [filterMode, setFilterMode] = (0, import_react5.useState)("all");
  const [searchQuery, setSearchQuery] = (0, import_react5.useState)("");
  const [refreshing, setRefreshing] = (0, import_react5.useState)(false);
  const [refreshSuccess, setRefreshSuccess] = (0, import_react5.useState)(false);
  (0, import_react5.useEffect)(() => {
    const unsub = store.subscribe(() => {
      setState({ ...store.getState() });
    });
    store.fetchState();
    return unsub;
  }, []);
  const handleProbeAll = () => {
    store.probeAll();
  };
  const handleCancelProbeAll = () => {
    store.cancelProbeAll();
  };
  const handleRefreshState = async () => {
    setRefreshing(true);
    await store.fetchState(true);
    setRefreshing(false);
    setRefreshSuccess(true);
    setTimeout(() => setRefreshSuccess(false), 2e3);
  };
  const inDshCount = state.models.filter((m) => m.inDsh).length;
  const probedCount = state.models.filter((m) => Boolean(m.merchant)).length;
  const filteredModels = state.models.filter((m) => {
    if (filterMode === "enabled" && !m.inDsh) return false;
    if (filterMode === "probed" && !m.merchant) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return m.model_name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q) || m.merchant?.supplier_name && m.merchant.supplier_name.toLowerCase().includes(q) || m.merchant?.channel_name && m.merchant.channel_name.toLowerCase().includes(q) || m.merchant?.description && m.merchant.description.toLowerCase().includes(q);
    }
    return true;
  });
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (a.inDsh !== b.inDsh) {
      return a.inDsh ? -1 : 1;
    }
    return a.model_name.localeCompare(b.model_name);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-container", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-main-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-header-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h2", { className: "dsh-a6-main-title", children: "A6api" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "dsh-a6-main-subtitle", children: "\u805A\u5408\u5168\u7403\u4E3B\u6D41\u4E0E\u9AD8\u6027\u4EF7\u6BD4\u6A21\u578B\uFF0C\u5B9E\u65F6\u76D1\u63A7\u5546\u6237\u6307\u6807\u3001\u4EF7\u683C\u500D\u7387\u4E0E\u8D26\u6237\u8D44\u4EA7\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-header-badges", children: [
        state.balance?.hasAccountAuth && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "div",
          {
            className: "dsh-a6-header-balance-badge",
            onClick: () => setActiveTab("account"),
            title: "\u70B9\u51FB\u5207\u6362\u81F3\u300C\u8D26\u6237\u8D44\u4EA7\u300D\u9875\u9762",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-a6-hb-label", children: "\u8D26\u6237\u4F59\u989D:" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-a6-hb-amount", children: state.balance.accountBalanceFormatted })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PricePill, { pf: state.priceFluctuation, hasToken: Boolean(state.config?.hasToken) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(MarketPill, {})
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-nav-tabs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "button",
        {
          type: "button",
          className: `dsh-a6-nav-tab ${activeTab === "models" ? "active" : ""}`,
          onClick: () => setActiveTab("models"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u53EF\u7528\u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-a6-tab-badge", children: state.models.length })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "button",
        {
          type: "button",
          className: `dsh-a6-nav-tab ${activeTab === "catalog" ? "active" : ""}`,
          onClick: () => setActiveTab("catalog"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u6A21\u578B\u76EE\u5F55" }),
            state.catalog.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-a6-tab-badge", children: state.catalog.length })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
        "button",
        {
          type: "button",
          className: `dsh-a6-nav-tab ${activeTab === "account" ? "active" : ""}`,
          onClick: () => setActiveTab("account"),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u8D26\u6237\u8D44\u4EA7" }),
            state.balance?.hasAccountAuth && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "dsh-a6-tab-badge success", children: state.balance.accountBalanceFormatted })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "button",
        {
          type: "button",
          className: `dsh-a6-nav-tab ${activeTab === "config" ? "active" : ""}`,
          onClick: () => setActiveTab("config"),
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u57FA\u7840\u914D\u7F6E" })
        }
      )
    ] }),
    activeTab === "catalog" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-tab-page catalog-page", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(ModelCatalogPanel, {}) }),
    activeTab === "models" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-tab-page models-page", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-section-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-filter-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${filterMode === "all" ? "active" : ""}`,
              onClick: () => setFilterMode("all"),
              children: [
                "\u5168\u90E8 (",
                state.models.length,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${filterMode === "enabled" ? "active" : ""}`,
              onClick: () => setFilterMode("enabled"),
              children: [
                "\u5DF2\u542F\u7528 (",
                inDshCount,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "button",
            {
              type: "button",
              className: `dsh-a6-filter-btn ${filterMode === "probed" ? "active" : ""}`,
              onClick: () => setFilterMode("probed"),
              children: [
                "\u5DF2\u63A2\u6D4B (",
                probedCount,
                ")"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-toolbar-right", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-search-wrapper", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "text",
                className: "dsh-a6-input dsh-a6-search-input",
                placeholder: "\u641C\u7D22\u6A21\u578B / \u4F9B\u5E94\u5546 / \u6E20\u9053...",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value)
              }
            ),
            searchQuery && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-clear-btn",
                onClick: () => setSearchQuery(""),
                title: "\u6E05\u7A7A\u641C\u7D22",
                children: "\xD7"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "button",
            {
              type: "button",
              className: `dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm ${refreshSuccess ? "dsh-a6-btn-refresh-ok" : ""}`,
              onClick: handleRefreshState,
              disabled: refreshing || state.probeAllActive,
              "data-tooltip": state.probeAllActive ? "\u5168\u91CF\u63A2\u6D4B\u8FDB\u884C\u4E2D\uFF0C\u5B8C\u6210\u540E\u53EF\u5237\u65B0" : "\u91CD\u65B0\u5411 A6API \u63A5\u53E3\u62C9\u53D6\u5F53\u524D\u4EE4\u724C\u7684\u53EF\u7528\u6A21\u578B\u5217\u8868\u53CA\u5DF2\u7F13\u5B58\u5546\u6237\u6307\u6807\uFF08\u4E0D\u6D88\u8017 Token\uFF09",
              "data-tooltip-pos": "down",
              children: refreshing ? "\u5237\u65B0\u4E2D..." : refreshSuccess ? "\u5DF2\u5237\u65B0 \u2713" : "\u5237\u65B0\u5217\u8868"
            }
          ),
          state.probeAllActive ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
                disabled: true,
                "data-tooltip": "\u6B63\u5728\u5E76\u53D1\u63A2\u6D4B\u5168\u90E8\u6A21\u578B\uFF0C\u5361\u7247\u9010\u4E2A\u56DE\u586B\u7ED3\u679C",
                "data-tooltip-pos": "down-left",
                children: [
                  "\u5168\u91CF\u63A2\u6D4B\u4E2D ",
                  state.probeAllDoneCount,
                  "/",
                  state.probeAllTotal
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                type: "button",
                className: "dsh-a6-btn dsh-a6-btn-danger dsh-a6-btn-sm",
                onClick: handleCancelProbeAll,
                "data-tooltip": "\u505C\u6B62\u53D6\u65B0\u4EFB\u52A1\uFF0C\u5DF2\u5728\u63A2\u6D4B\u4E2D\u7684\u6A21\u578B\u4F1A\u6B63\u5E38\u5B8C\u6210\u5E76\u56DE\u586B",
                "data-tooltip-pos": "down-left",
                children: "\u53D6\u6D88"
              }
            )
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "button",
            {
              type: "button",
              className: "dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm",
              onClick: handleProbeAll,
              disabled: state.models.length === 0,
              "data-tooltip": "\u5BF9\u5F53\u524D\u4EE4\u724C\u652F\u6301\u7684\u6240\u6709\u6A21\u578B\u5E76\u53D1\u53D1\u9001\u8BF7\u6C42\uFF0C\u6279\u91CF\u6355\u83B7\u5546\u6237\u8DEF\u7531\u4E0E\u6700\u65B0\u884C\u60C5\uFF08\u6BCF\u4E2A\u6A21\u578B\u6D88\u8017\u5C11\u91CFToken\uFF0C\u9047\u9650\u6D41\u81EA\u52A8\u91CD\u8BD5\uFF09",
              "data-tooltip-pos": "down-left",
              children: "\u4E00\u952E\u5168\u91CF\u63A2\u6D4B"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-cards-list", children: state.loading && state.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "dsh-a6-empty-state", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-spinner" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u6B63\u5728\u8FDE\u63A5 A6API \u805A\u5408\u7AD9\u5E76\u52A0\u8F7D\u6A21\u578B\u884C\u60C5..." })
      ] }) : sortedModels.length > 0 ? sortedModels.map((m) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(MerchantCard, { model: m }, m.model_name)) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-empty-state", children: searchQuery ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { children: [
        "\u672A\u641C\u7D22\u5230\u5339\u914D\u300C",
        searchQuery,
        "\u300D\u7684\u6A21\u578B"
      ] }) : filterMode === "enabled" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u5F53\u524D\u5C1A\u672A\u5728 DSH \u4E2D\u542F\u7528\u4EFB\u4F55 A6API \u6A21\u578B\uFF0C\u70B9\u51FB\u6A21\u578B\u5361\u7247\u53F3\u4FA7\u300C\u6DFB\u52A0\u5230 DSH\u300D\u5373\u53EF\u542F\u7528\u3002" }) : filterMode === "probed" ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u5C1A\u672A\u63A2\u6D4B\u4EFB\u4F55\u6A21\u578B\u5546\u6237\u7EBF\u8DEF\uFF0C\u70B9\u51FB\u6A21\u578B\u5361\u7247\u4E0A\u7684\u300C\u63A2\u6D4B\u5546\u5BB6\u300D\u6216\u4E0A\u65B9\u300C\u4E00\u952E\u5168\u91CF\u63A2\u6D4B\u300D\u5373\u53EF\u5F00\u59CB\u3002" }) : !state.config.hasApiKey ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u8BF7\u524D\u5F80\u300C\u57FA\u7840\u914D\u7F6E\u300D\u9875\u9762\u586B\u5165\u60A8\u7684 A6API \u4EE4\u724C (API Key) \u5E76\u4FDD\u5B58\uFF0C\u5373\u53EF\u81EA\u52A8\u52A0\u8F7D\u53EF\u7528\u6A21\u578B\u5217\u8868\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "\u5F53\u524D\u4EE4\u724C\u6682\u65E0\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u68C0\u67E5 A6API \u63A7\u5236\u53F0\u4E2D\u7684\u4EE4\u724C\u9650\u5236\u8BBE\u7F6E\u3002" }) }) })
    ] }),
    activeTab === "account" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-tab-page account-page", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      AccountPanel,
      {
        balance: state.balance,
        config: state.config,
        recentLogs: state.recentLogs,
        onNavigateToConfig: () => setActiveTab("config")
      }
    ) }),
    activeTab === "config" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "dsh-a6-tab-page config-page", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      ConfigPanel,
      {
        config: state.config,
        dshConfiguredModels: state.dshConfiguredModels
      }
    ) })
  ] });
};

// src/client/components/A6ApiSidebarCard.tsx
var import_react6 = require("react");
var import_jsx_runtime8 = require("react/jsx-runtime");
var POPUP_MAX_WIDTH = 500;
var normalizeModelId = (id) => id.replace(/^[^/]+\//, "");
var A6ApiSidebarCard = ({
  wide,
  useSessions,
  getModelDirectories
}) => {
  if (useSessions) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      A6ApiSidebarCardInner,
      {
        wide,
        useSessions,
        getModelDirectories
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(A6ApiSidebarCardBody, { wide, getModelDirectories });
};
var A6ApiSidebarCardInner = ({ wide, useSessions, getModelDirectories }) => {
  const currentId = useSessions((s) => s?.current);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    A6ApiSidebarCardBody,
    {
      wide,
      currentId,
      getModelDirectories
    }
  );
};
var A6ApiSidebarCardBody = ({
  wide,
  currentId,
  getModelDirectories
}) => {
  const [open, setOpen] = (0, import_react6.useState)(false);
  const [selection, setSelection] = (0, import_react6.useState)(null);
  const [state, setState] = (0, import_react6.useState)(store.getState());
  const [pos, setPos] = (0, import_react6.useState)(null);
  const buttonRef = (0, import_react6.useRef)(null);
  const popupRef = (0, import_react6.useRef)(null);
  const flippedRef = (0, import_react6.useRef)(false);
  const fetchedRef = (0, import_react6.useRef)(false);
  const lastPosRef = (0, import_react6.useRef)(null);
  (0, import_react6.useEffect)(() => {
    let disposed = false;
    let unsub = null;
    let tries = 0;
    const connect = () => {
      if (disposed) return;
      const md = getModelDirectories?.();
      if (!md || typeof md.directoryFor !== "function") {
        if (tries++ < 6) setTimeout(connect, 500);
        return;
      }
      let dir;
      try {
        dir = md.directoryFor(currentId);
      } catch {
        dir = void 0;
      }
      if (!dir) {
        setSelection(null);
        return;
      }
      const update = () => {
        try {
          const snap = dir.store?.getSnapshot?.();
          setSelection(snap?.current ?? null);
        } catch {
          setSelection(null);
        }
      };
      update();
      try {
        unsub = dir.store?.subscribe?.(update) ?? null;
      } catch {
        unsub = null;
      }
    };
    connect();
    return () => {
      disposed = true;
      if (unsub) {
        try {
          unsub();
        } catch {
        }
      }
    };
  }, [currentId, getModelDirectories]);
  (0, import_react6.useEffect)(() => {
    const unsub = store.subscribe(() => setState({ ...store.getState() }));
    return unsub;
  }, []);
  const isA6api = Boolean(selection && selection.provider === "a6api");
  const modelName = normalizeModelId(selection?.model || "");
  const hasA6apiModel = isA6api && Boolean(modelName);
  const card = modelName ? state.models.find((m) => m.model_name.toLowerCase() === modelName.toLowerCase()) : void 0;
  const toggle = () => setOpen((v) => !v);
  (0, import_react6.useEffect)(() => {
    if (!open) {
      setPos(null);
      lastPosRef.current = null;
      flippedRef.current = false;
      return;
    }
    if (state.models.length === 0 && !fetchedRef.current) {
      fetchedRef.current = true;
      store.fetchState().catch(() => {
      });
    }
    const place = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(POPUP_MAX_WIDTH, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      const flipped = flippedRef.current || r.top < 8;
      if (flipped) flippedRef.current = true;
      const next = flipped ? { left, top: r.bottom + 8 } : { left, bottom: window.innerHeight - r.top + 8 };
      const last = lastPosRef.current;
      if (last && last.left === next.left && (last.top ?? null) === (next.top ?? null) && (last.bottom ?? null) === (next.bottom ?? null)) {
        return;
      }
      lastPosRef.current = next;
      setPos(next);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  (0, import_react6.useEffect)(() => {
    if (!open || !popupRef.current) return;
    const checkFlip = () => {
      if (flippedRef.current || !popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      if (rect.top < 8) {
        flippedRef.current = true;
        const btn = buttonRef.current;
        if (btn) {
          const r = btn.getBoundingClientRect();
          setPos({ left: lastPosRef.current?.left ?? 8, top: r.bottom + 8 });
        }
      }
    };
    checkFlip();
    const ro = new ResizeObserver(checkFlip);
    ro.observe(popupRef.current);
    return () => ro.disconnect();
  }, [open, pos]);
  (0, import_react6.useEffect)(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e) => {
      const t = e.target;
      if (popupRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "span",
      {
        className: `dsh-a6-side-btn-wrap${wide ? "" : " rail"}`,
        "data-tooltip": !hasA6apiModel ? "\u5F53\u524D\u4F1A\u8BDD\u672A\u4F7F\u7528 A6api \u6A21\u578B\uFF0C\u5361\u7247\u5DF2\u7F6E\u7070" : void 0,
        children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
          "button",
          {
            ref: buttonRef,
            type: "button",
            className: `dsh-a6-side-btn${wide ? "" : " rail"}`,
            onClick: toggle,
            "aria-expanded": open,
            "aria-label": wide ? void 0 : "A6api",
            "data-tooltip": hasA6apiModel ? open ? "\u6536\u8D77 A6api \u6A21\u578B\u5361\u7247" : "\u67E5\u770B\u5F53\u524D\u4F1A\u8BDD\u7684 A6api \u6A21\u578B\u5361\u7247" : void 0,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
                "svg",
                {
                  className: "dsh-a6-side-btn-badge",
                  width: "16",
                  height: "16",
                  viewBox: "0 0 16 16",
                  fill: "none",
                  xmlns: "http://www.w3.org/2000/svg",
                  "aria-hidden": "true",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "path",
                      {
                        d: "M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z",
                        fill: "currentColor"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "path",
                      {
                        d: "M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z",
                        fill: "currentColor"
                      }
                    )
                  ]
                }
              ),
              wide && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-a6-side-btn-label", children: "A6api" })
            ]
          }
        )
      }
    ),
    open && pos && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
      "div",
      {
        ref: popupRef,
        className: "dsh-a6-side-popup",
        role: "dialog",
        "aria-label": "\u5F53\u524D\u4F1A\u8BDD A6api \u6A21\u578B\u5361\u7247",
        style: { left: pos.left, ...pos.top !== void 0 ? { top: pos.top } : { bottom: pos.bottom } },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-a6-side-pills", children: [
            state.balance?.hasAccountAuth && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
              "div",
              {
                className: "dsh-a6-header-balance-badge dsh-a6-side-balance-pill",
                title: "\u8D26\u6237\u4F59\u989D\uFF08\u6BCF 60 \u79D2\u81EA\u52A8\u540C\u6B65\uFF09",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-a6-hb-label", children: "\u8D26\u6237\u4F59\u989D:" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-a6-hb-amount", children: state.balance.accountBalanceFormatted })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              PricePill,
              {
                pf: state.priceFluctuation,
                hasToken: Boolean(state.config?.hasToken),
                compact: true
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(MarketPill, {})
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: hasA6apiModel ? void 0 : "dsh-a6-side-card-dimmed", children: card ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(MerchantCard, { model: card }) : state.loading && state.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-a6-side-popup-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "dsh-a6-spinner" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u6B63\u5728\u52A0\u8F7D A6api \u6570\u636E..." })
          ] }) : hasA6apiModel ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-a6-side-popup-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { children: [
              "\u672A\u627E\u5230\u300C",
              modelName,
              "\u300D\u7684\u5546\u6237\u6570\u636E"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-a6-side-popup-hint", children: "\u53EF\u5728\u300C\u8BBE\u7F6E \u2192 A6api\u300D\u4E2D\u63A2\u6D4B\u8BE5\u6A21\u578B" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "dsh-a6-side-popup-empty", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "\u5F53\u524D\u4F1A\u8BDD\u672A\u4F7F\u7528 A6api \u6A21\u578B" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "dsh-a6-side-popup-hint", children: modelName ? `\u300C${modelName}\u300D\u6682\u65E0\u5546\u6237\u6570\u636E` : "\u5207\u6362\u5230 A6api \u6A21\u578B\u540E\u81EA\u52A8\u5C55\u793A\u5546\u6237\u5361\u7247" })
          ] }) })
        ]
      }
    )
  ] });
};

// src/client/styles/main.css
var main_default = `/* A6API Plugin Styles - Clean Professional DSH Native Theme Integration */

.dsh-a6-container {
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary, var(--ds-text-primary, #1e293b));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  padding-bottom: 28px;
}

/* ==========================================================================
   1. Master Header & Navigation Tabs (Image 2 Style)
   ========================================================================== */
.dsh-a6-main-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.dsh-a6-header-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dsh-a6-main-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f172a);
  margin: 0;
  line-height: 1.2;
}

.dsh-a6-main-subtitle {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #64748b);
  margin: 0;
  line-height: 1.5;
}

.dsh-a6-header-balance-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 16px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.15s;
}

.dsh-a6-header-badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dsh-a6-header-balance-badge:hover {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.dsh-a6-hb-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-price-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.15s;
  user-select: none;
  /* \u4E0E\u8D26\u6237\u4F59\u989D\u80F6\u56CA\u7B49\u9AD8\uFF1A\u7EE7\u627F\u540C\u6837\u5185\u8FB9\u8DDD\u4E0E\u884C\u9AD8\uFF0C\u907F\u514D\u89C6\u89C9\u5927\u5C0F\u5DEE\u5F02 */
  min-height: 28px;
  box-sizing: border-box;
}

.dsh-a6-price-pill.is-zero {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-border-l2, #e2e8f0);
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-price-pill.is-zero:hover {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.dsh-a6-price-pill.is-zero.is-disabled-zero:hover {
  border-color: var(--dsw-alias-border-l2, #e2e8f0);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}

.dsh-a6-price-pill.has-change {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border-color: var(--dsw-alias-border-l2, #e2e8f0);
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-price-pill.has-change:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.03);
}

.dsh-a6-price-pill.is-disabled-zero {
  cursor: not-allowed;
  opacity: 0.9;
}

.dsh-a6-price-pill.disabled {
  background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.04));
  border-color: var(--dsw-alias-border-l3, #cbd5e1);
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  cursor: not-allowed;
  opacity: 0.85;
}

.dsh-a6-price-pill-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-price-pill-count {
  font-size: 13px;
  font-weight: 700;
  min-width: 8px;
  text-align: center;
  line-height: 1;
}

.dsh-a6-price-pill.is-zero .dsh-a6-price-pill-count {
  color: #10b981;
}

.dsh-a6-price-pill.has-change .dsh-a6-price-pill-count {
  color: #ef4444;
}

.dsh-a6-price-pill.disabled .dsh-a6-price-pill-count {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* \u300C\u6A21\u578B\u5E02\u573A\u300D\u80F6\u56CA(\u4FA7\u8FB9\u680F\u6D6E\u5C42):\u4E0E\u4F59\u989D / \u4EF7\u683C\u6CE2\u52A8\u80F6\u56CA\u540C\u6B3E\u5916\u89C2,\u70B9\u51FB\u76F4\u8FBE\u5B98\u7F51\u6A21\u578B\u9875 */
.dsh-a6-market-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.15s;
  user-select: none;
  min-height: 28px;
  box-sizing: border-box;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-market-pill:hover {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.dsh-a6-market-pill-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-market-pill:hover .dsh-a6-market-pill-label {
  color: #10b981;
}

.dsh-a6-hb-amount {
  font-size: 13px;
  font-weight: 700;
  color: #10b981;
}

/* Nav Tabs */
.dsh-a6-nav-tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  margin-bottom: 18px;
  margin-top: 4px;
}

.dsh-a6-nav-tab {
  background: transparent;
  border: none;
  padding: 10px 2px 12px 2px;
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
  cursor: pointer;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.15s;
  margin-bottom: -1px;
}

.dsh-a6-nav-tab:hover {
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-nav-tab.active {
  color: var(--dsw-alias-label-primary, #0f172a);
  font-weight: 600;
  border-bottom: 2px solid var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-tab-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-tab-badge.success {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

/* Tab Page Wrapper */
.dsh-a6-tab-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: dsh-a6-fadein 0.15s ease-out;
}

@keyframes dsh-a6-fadein {
  from {
    opacity: 0.8;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ==========================================================================
   2. Models Tab Toolbar & Filters
   ========================================================================== */
.dsh-a6-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  position: relative;
  z-index: 100;
}

.dsh-a6-filter-group {
  display: flex;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--dsw-alias-border-l3, #cbd5e1);
  border-radius: 6px;
  padding: 2px;
}

.dsh-a6-filter-btn {
  background: transparent;
  border: none;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  color: var(--dsw-alias-label-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s;
}

.dsh-a6-filter-btn:hover {
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-filter-btn.active {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #0f172a);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.dsh-a6-toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.dsh-a6-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.dsh-a6-search-input {
  width: 200px;
  height: 30px;
  padding-right: 22px;
  font-size: 12px;
}

.dsh-a6-clear-btn {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  line-height: 1;
}

/* ==========================================================================
   3. Clean Model Card
   ========================================================================== */
.dsh-a6-cards-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-a6-official-card {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.dsh-a6-official-card:hover {
  border-color: var(--dsw-alias-border-l1, #cbd5e1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.dsh-a6-official-card.in-dsh {
  border-left: 3px solid #10b981;
}

/* Main Top Bar */
.dsh-a6-card-main-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  cursor: pointer;
  user-select: none;
  flex-wrap: wrap;
}

/* Identity Col (Clean text without Brand Logos) */
.dsh-a6-bar-identity {
  display: flex;
  align-items: center;
  min-width: 180px;
  flex: 1.2;
}

.dsh-a6-title-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-a6-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-a6-name-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f172a);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
}

.dsh-a6-dot-sep {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-merchant-id-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #475569);
}

.dsh-a6-probe-fail-chip {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
  cursor: help;
}

.dsh-a6-sub-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* Pricing Col */
.dsh-a6-bar-pricing {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.dsh-a6-bar-pricing.unprobed {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 12px;
}

.dsh-a6-unprobed-hint.error {
  color: #dc2626;
  font-weight: 600;
}

.dsh-a6-price-col {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.dsh-a6-price-top {
  font-size: 13px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-price-btm {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-ratio-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: #f0fdfa;
  color: #0d9488;
  border: 1px solid #99f6e4;
  white-space: nowrap;
}

/* \u6DF7\u5408\u4EF7\u80F6\u56CA\uFF08\u2248\xA5x/\u4EBF tokens\uFF0C\u6309 24h \u7F13\u5B58\u547D\u4E2D\u7387\u4F30\u7B97\uFF09 */
.dsh-a6-blend-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.12);
  color: #0a8f5b;
  border: 1px solid rgba(10, 143, 91, 0.35);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: help;
}

/* Uptime / Health Col (\u5B9E\u65F6 / 24h / 7d) */
.dsh-a6-bar-uptime {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 130px;
}

.dsh-a6-uptime-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}

.dsh-a6-uptime-label {
  width: 24px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 10px;
}

.dsh-a6-dots-track {
  display: flex;
  gap: 2px;
  align-items: center;
}

.dsh-a6-rate-dot {
  width: 4px;
  height: 8px;
  border-radius: 2px;
  background: #10b981;
}

.dsh-a6-rate-dot.green {
  background: #10b981;
}

.dsh-a6-rate-dot.yellow {
  background: #f59e0b;
}

.dsh-a6-rate-dot.red {
  background: #ef4444;
}

.dsh-a6-rate-dot.empty {
  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1));
}

.dsh-a6-uptime-val {
  font-weight: 600;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary, #475569);
  min-width: 38px;
  text-align: right;
}

/* Performance Col (Speed / Cache Hit Bar) */
.dsh-a6-bar-perf {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dsh-a6-perf-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dsh-a6-latency-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-cache-hit-text {
  font-size: 11px;
  font-weight: 600;
  color: #d97706;
}

.dsh-a6-hit-track {
  width: 38px;
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.dsh-a6-hit-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #f59e0b, #eab308);
}

/* Smart Tags */
.dsh-a6-bar-tags {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}

.dsh-a6-smart-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.08));
  color: var(--dsw-alias-label-secondary, #475569);
}

.dsh-a6-smart-pill.tag-stable {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.25);
  color: #10b981;
}

.dsh-a6-smart-pill.tag-cheap {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

.dsh-a6-smart-pill.tag-fast {
  background: rgba(249, 115, 22, 0.08);
  border-color: rgba(249, 115, 22, 0.25);
  color: #ea580c;
}

.dsh-a6-smart-pill.tag-quality {
  background: rgba(234, 179, 8, 0.08);
  border-color: rgba(234, 179, 8, 0.25);
  color: #ca8a04;
}

.dsh-a6-smart-pill.tag-guarantee {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #059669;
}

/* Right Actions Group \u2014 \u9ED8\u8BA4\u9760\u53F3\uFF0C\u7A84\u5C4F\u65F6\u5360\u6EE1\u884C\u5BBD\u4E24\u7AEF\u5BF9\u9F50 */
.dsh-a6-bar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  margin-left: auto;
}

@media (max-width: 900px) {
  .dsh-a6-bar-actions {
    flex: 1 1 100%;
    width: 100%;
    margin-left: 0;
    justify-content: space-between;
  }
}

.dsh-a6-time-ago {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* \u4E24\u884C\u65F6\u95F4\u6233\u5782\u76F4\u53E0\u653E (\u5168\u7F51\u6700\u8FD1 / \u4E2A\u4EBA\u6700\u8FD1) \u2014 \u5DE6\u5BF9\u9F50 */
.dsh-a6-time-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex-shrink: 0;
  text-align: left;
}

/* \u5361\u7247\u5E95\u90E8\u884C\uFF1A\u65F6\u95F4\u6233\u5DE6\u4E0B\u89D2\u5DE6\u5BF9\u9F50\uFF0C\u64CD\u4F5C\u6309\u94AE\u53F3\u4E0B\u89D2\u53F3\u5BF9\u9F50 */
.dsh-a6-card-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
  flex-wrap: wrap;
}

/* \u53F3\u4FA7\u4E09\u6309\u94AE\u7EC4 */
.dsh-a6-bar-actions-btns {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.dsh-a6-route-snapshot.never {
  color: var(--dsw-alias-label-quaternary, #cbd5e1);
}

.dsh-a6-btn-in-dsh {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #059669;
}

.dsh-a6-btn-in-dsh:hover {
  background: rgba(16, 185, 129, 0.2);
}

.dsh-a6-expand-toggle-btn {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l3, #cbd5e1);
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary, #64748b);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
  height: 28px;
  transition: all 0.15s;
}

.dsh-a6-expand-toggle-btn:hover {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04));
  color: var(--dsw-alias-label-primary, #0f172a);
}

/* ==========================================================================
   4. Bottom Detailed Comparison Box
   ========================================================================== */
.dsh-a6-detail-container {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.8));
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-a6-detail-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-a6-dt-left,
.dsh-a6-dt-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-a6-dt-label {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-dt-desc {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #1e293b);
}

.dsh-a6-dt-channel-name {
  font-size: 12px;
  font-weight: 500;
  color: #3b82f6;
}

.dsh-a6-dt-divider {
  height: 1px;
  background: var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.6));
  margin: 1px 0;
}

/* Price Comparison Table */
.dsh-a6-dt-table-col {
  overflow-x: auto;
}

.dsh-a6-price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.dsh-a6-price-table th {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  border-bottom: 1px solid var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.6));
}

.dsh-a6-th-blank {
  width: 50px;
}

.dsh-a6-price-table td {
  padding: 5px 8px;
}

.dsh-a6-td-label {
  color: var(--dsw-alias-label-secondary, #64748b);
  font-weight: 500;
}

.dsh-a6-tr-official td {
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-tr-merchant td {
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-td-bold {
  font-weight: 700;
}

/* ==========================================================================
   5. Account Tab & Asset Panel Styles
   ========================================================================== */
.dsh-a6-account-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dsh-a6-balance-banner {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(226, 232, 240, 0.8));
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  position: relative;
}

.dsh-a6-balance-banner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-top-left-radius: 9px;
  border-top-right-radius: 9px;
  background: linear-gradient(90deg, #3b82f6 0%, #10b981 50%, #6366f1 100%);
}

.dsh-a6-balance-banner.low-balance::before {
  background: linear-gradient(90deg, #ef4444 0%, #f59e0b 100%);
}

.dsh-a6-balance-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.dsh-a6-balance-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-a6-balance-main-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dsh-a6-balance-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-balance-num-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.dsh-a6-balance-amount {
  font-size: 26px;
  font-weight: 700;
  color: #10b981;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.dsh-a6-balance-amount.unauthed {
  font-size: 22px;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-balance-banner.low-balance .dsh-a6-balance-amount {
  color: #ef4444;
}

.dsh-a6-balance-cny {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-status-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
}

.dsh-a6-status-pill.success {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.dsh-a6-status-pill.warn {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.dsh-a6-low-alert {
  display: inline-flex;
  align-items: center;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  width: fit-content;
}

.dsh-a6-balance-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Stat KPI Cards Grid */
.dsh-a6-stat-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

@media (max-width: 768px) {
  .dsh-a6-stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.dsh-a6-kpi-card {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.6));
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dsh-a6-kpi-label {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-kpi-val {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}

/* Auth Banner Box */
.dsh-a6-auth-banner-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  flex-wrap: wrap;
}

.dsh-a6-auth-banner-title {
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
  margin-bottom: 2px;
}

.dsh-a6-auth-banner-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #475569);
  line-height: 1.4;
}

/* Recent Logs Section */
.dsh-a6-logs-section {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 10px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-a6-logs-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-a6-logs-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-logs-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-logs-table-wrapper {
  overflow-x: auto;
}

.dsh-a6-logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.dsh-a6-logs-table th {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #64748b);
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
}

.dsh-a6-logs-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.5));
}

.dsh-a6-log-time {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 11px;
}

.dsh-a6-log-channel-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.08);
  color: #3b82f6;
  border-radius: 4px;
}

.dsh-a6-log-status {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 10px;
}

.dsh-a6-log-status.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.dsh-a6-log-status.err {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.dsh-a6-log-cost {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #475569);
  font-weight: 500;
}

.dsh-a6-btn-refresh-ok {
  color: #10b981 !important;
  border-color: rgba(16, 185, 129, 0.4) !important;
  background: rgba(16, 185, 129, 0.08) !important;
}

.dsh-a6-empty-logs {
  padding: 20px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 12px;
}

/* ==========================================================================
   6. Configuration Tab Styles
   ========================================================================== */
.dsh-a6-config-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dsh-a6-config-section {
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-a6-section-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dsh-a6-heading-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-heading-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #64748b);
  line-height: 1.4;
}

.dsh-a6-node-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dsh-a6-node-pill {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l3, #cbd5e1);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #475569);
  cursor: pointer;
  transition: all 0.15s;
}

.dsh-a6-node-pill:hover {
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  border-color: #94a3b8;
}

.dsh-a6-node-pill.active {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
  font-weight: 500;
}

.dsh-a6-config-fields-grid {
  display: flex;
  gap: 14px;
}

@media (max-width: 768px) {
  .dsh-a6-config-fields-grid {
    flex-direction: column;
  }
}

.dsh-a6-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}

.dsh-a6-field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dsh-a6-field-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-a6-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #475569);
}

.dsh-a6-field-hint {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  line-height: 1.4;
}

.dsh-a6-field-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
}

.dsh-a6-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.dsh-a6-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l3, #cbd5e1);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: var(--dsw-alias-label-primary, #1e293b);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.dsh-a6-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.dsh-a6-help-drawer {
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
  border: 1px dashed var(--dsw-alias-border-l2, #cbd5e1);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #475569);
}

.dsh-a6-help-title {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
  margin-bottom: 4px;
}

.dsh-a6-help-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dsh-a6-help-list code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.dsh-a6-integration-card {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--dsw-alias-border-l3, rgba(226, 232, 240, 0.6));
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dsh-a6-int-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.dsh-a6-int-key {
  width: 100px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-int-val {
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}

.dsh-a6-int-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.dsh-a6-model-chip {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.dsh-a6-empty-hint {
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 12px;
}

.dsh-a6-save-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.dsh-a6-success-msg {
  color: #10b981;
  font-size: 12px;
  font-weight: 500;
}

/* ==========================================================================
   7. Buttons & Common State Styles
   ========================================================================== */
.dsh-a6-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  white-space: nowrap;
}

.dsh-a6-btn-primary {
  background: #3b82f6;
  color: #ffffff;
}

.dsh-a6-btn-primary:hover {
  background: #2563eb;
}

.dsh-a6-btn-secondary {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border-color: var(--dsw-alias-border-l3, #cbd5e1);
  color: var(--dsw-alias-label-primary, #334155);
}

.dsh-a6-btn-secondary:hover {
  background: var(--dsw-alias-bg-layer-2, #f8fafc);
  border-color: #94a3b8;
}

.dsh-a6-btn-sm {
  height: 28px;
  padding: 0 9px;
  font-size: 12px;
}

.dsh-a6-btn-xs {
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
}

.dsh-a6-btn-text {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 1px 3px;
}

.dsh-a6-btn-text:hover {
  text-decoration: underline;
}

.dsh-a6-empty-state {
  text-align: center;
  padding: 36px 20px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px dashed var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, #64748b);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.dsh-a6-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: dsh-a6-spin 0.8s linear infinite;
}

@keyframes dsh-a6-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ==========================================================================
   8. Instant Custom Tooltip (Zero-Delay, High Contrast)
   ========================================================================== */
[data-tooltip] {
  position: relative;
}

[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.96);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  max-width: min(320px, 85vw);
  width: max-content;
  text-align: left;
  word-break: break-word;
  overflow-wrap: anywhere;
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.08s ease-out, visibility 0.08s ease-out;
  z-index: 99999;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

[data-tooltip]::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px 5px 0 5px;
  border-style: solid;
  border-color: rgba(15, 23, 42, 0.94) transparent transparent transparent;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.04s ease-out, visibility 0.04s ease-out;
  z-index: 99999;
}

[data-tooltip]:hover::after,
[data-tooltip]:hover::before {
  opacity: 1;
  visibility: visible;
}

[data-tooltip-pos="left"]::after {
  left: auto;
  right: 0;
  transform: none;
}

[data-tooltip-pos="left"]::before {
  left: auto;
  right: 14px;
  transform: none;
}

[data-tooltip-pos="right"]::after {
  left: 0;
  right: auto;
  transform: none;
}

[data-tooltip-pos="right"]::before {
  left: 14px;
  right: auto;
  transform: none;
}

/* Down positions (for top toolbar and header buttons) */
[data-tooltip-pos="down"]::after {
  top: calc(100% + 7px);
  bottom: auto;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}

[data-tooltip-pos="down"]::before {
  top: calc(100% + 2px);
  bottom: auto;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent rgba(15, 23, 42, 0.94) transparent;
}

[data-tooltip-pos="down-left"]::after {
  top: calc(100% + 7px);
  bottom: auto;
  left: auto;
  right: 0;
  transform: none;
}

[data-tooltip-pos="down-left"]::before {
  top: calc(100% + 2px);
  bottom: auto;
  left: auto;
  right: 14px;
  transform: none;
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent rgba(15, 23, 42, 0.94) transparent;
}

[data-tooltip-pos="down-right"]::after {
  top: calc(100% + 7px);
  bottom: auto;
  left: 0;
  right: auto;
  transform: none;
}

[data-tooltip-pos="down-right"]::before {
  top: calc(100% + 2px);
  bottom: auto;
  left: 14px;
  right: auto;
  transform: none;
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent rgba(15, 23, 42, 0.94) transparent;
}

/* Card actions tooltip: keep centered (avoid left:0 right-edge overflow) */
.dsh-a6-bar-actions [data-tooltip]:not([data-tooltip-pos])::after {
  left: 50%;
  transform: translateX(-50%);
  right: auto;
}

.dsh-a6-bar-actions [data-tooltip]:not([data-tooltip-pos])::before {
  left: 50%;
  transform: translateX(-50%);
  right: auto;
}

/* When JS portal tooltip is active, hide pseudo to avoid double rendering */
body.dsh-a6api-tooltip-active [data-tooltip]::after,
body.dsh-a6api-tooltip-active [data-tooltip]::before {
  opacity: 0 !important;
  visibility: hidden !important;
}

/* ==========================================================================
   8. \u56FA\u5B9A / \u7981\u7528 \u72B6\u6001\u5FBD\u6807\u3001\u64CD\u4F5C\u6309\u94AE\u4E0E\u56FA\u5B9A\u786E\u8BA4\u5F39\u7A97
   ========================================================================== */
.dsh-a6-pin-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  margin-left: 6px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;
}

.dsh-a6-pin-badge.here {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.dsh-a6-pin-badge.elsewhere {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.dsh-a6-pin-badge.disabled {
  background: rgba(100, 116, 139, 0.14);
  color: #64748b;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.dsh-a6-btn-danger {
  background: #ffffff;
  border-color: #ef4444;
  color: #ef4444;
}

.dsh-a6-btn-danger:hover {
  background: #fef2f2;
  border-color: #dc2626;
  color: #dc2626;
}

.dsh-a6-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dsh-a6-action-error {
  /* footer \u5185\u72EC\u7ACB\u6574\u884C\u5C55\u793A\uFF08footer \u4E3A flex-wrap\uFF09\uFF0C\u4E0D\u4E0E\u6309\u94AE\u5E76\u6392\u6491\u5BBD */
  flex-basis: 100%;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #dc2626;
  font-size: 11px;
  line-height: 1.5;
}

/* \u56FA\u5B9A\u786E\u8BA4\u5F39\u7A97 */
.dsh-a6-pin-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dsh-a6-pin-modal {
  width: min(420px, 92vw);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l3, #cbd5e1);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.dsh-a6-pin-modal-title {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1e293b);
  border-bottom: 1px solid var(--dsw-alias-border-l3, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
}

.dsh-a6-pin-modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-a6-pin-modal-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12px;
}

.dsh-a6-pin-modal-label {
  flex: 0 0 48px;
  color: var(--dsw-alias-label-secondary, #64748b);
}

.dsh-a6-pin-modal-value {
  color: var(--dsw-alias-label-primary, #1e293b);
  font-weight: 500;
  word-break: break-all;
}

.dsh-a6-pin-modal-note {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #64748b);
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 6px;
  padding: 6px 8px;
}

.dsh-a6-pin-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--dsw-alias-border-l3, #e2e8f0);
  background: var(--dsw-alias-bg-layer-1, #f8fafc);
}

/* ==========================================================================
   Sidebar Footer Action: \u5F53\u524D\u4F1A\u8BDD A6api \u6A21\u578B\u5361\u7247\u5165\u53E3(\u5DE6\u4E0B\u89D2\u8BBE\u7F6E\u6309\u94AE\u4E0A\u65B9)
   ========================================================================== */
.dsh-a6-side-btn-wrap {
  display: flex;
  min-width: 0;
  /* footerActions \u662F\u884C\u5411 flex \u5BB9\u5668(width:100%)\uFF1A\u62C9\u4F38\u5360\u6EE1,\u4E0E\u4E0A\u65B9\u300C\u8BBE\u7F6E\u300D\u6309\u94AE\u540C\u5BBD\u7684\u4E00\u6A2A\u6761 */
  flex: 1;
}

/* rail(\u6298\u53E0)\u6001:footerActions \u6536\u7F29\u4E3A\u5C45\u4E2D\u5185\u5BB9\u5BBD,wrap \u4E0D\u53C2\u4E0E\u62C9\u4F38 */
.dsh-a6-side-btn-wrap.rail {
  flex: none;
  width: auto;
}

/* \u539F\u751F\u98CE\u683C:\u5BF9\u9F50\u8BBE\u7F6E\u6309\u94AE(42px \u900F\u660E\u5E7D\u7075\u6309\u94AE,\u65E0\u8FB9\u6846\u65E0\u5E95\u8272,label-primary \u6587\u5B57,
   hover \u7528 shell \u4EA4\u4E92\u5E95\u8272;rail \u6298\u53E0\u6001 36px \u5706) */
.dsh-a6-side-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  min-width: 0;
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #0f172a);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  transition: background 0.15s;
}

.dsh-a6-side-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(148, 163, 184, 0.16));
}

.dsh-a6-side-btn:disabled {
  cursor: default;
  opacity: 0.4;
}

/* rail(\u4FA7\u8FB9\u680F\u6298\u53E0)\u6001:36px \u5706\u5F62\u5355\u8272\u56FE\u6807,\u4E0E\u8BBE\u7F6E\u6309\u94AE\u4E00\u81F4 */
.dsh-a6-side-btn.rail {
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
  justify-content: center;
  gap: 0;
  border-radius: 50%;
}

.dsh-a6-side-btn.rail:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(148, 163, 184, 0.16));
}

/* \u9F7F\u8F6E\u56FE\u6807:\u4E0E\u8BBE\u7F6E\u6309\u94AE\u540C\u6B3E(currentColor \u8DDF\u968F\u6587\u5B57\u8272;rail \u6001 18px \u4E0E\u8BBE\u7F6E\u4E00\u81F4) */
.dsh-a6-side-btn-badge {
  flex: none;
  width: 16px;
  height: 16px;
}

.dsh-a6-side-btn.rail .dsh-a6-side-btn-badge {
  width: 18px;
  height: 18px;
}

.dsh-a6-side-btn-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* \u5F39\u51FA\u5361\u7247\u6D6E\u5C42:\u951A\u5B9A\u6309\u94AE,\u5411\u4E0A\u5C55\u5F00 */
.dsh-a6-side-popup {
  position: fixed;
  z-index: 2147483000;
  width: min(500px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border: 1px solid var(--dsw-alias-border-l1, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 10px;
  animation: dsh-a6-popup-up 0.18s ease-out;
}

@keyframes dsh-a6-popup-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.dsh-a6-side-popup-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
  color: var(--dsw-alias-label-secondary, #64748b);
  font-size: 13px;
}

.dsh-a6-side-popup-hint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

/* \u975E A6api \u4F1A\u8BDD:\u6A21\u578B\u5361\u7247\u533A\u57DF\u6574\u4F53\u7F6E\u7070(\u53BB\u8272 + \u964D\u900F\u660E\u5EA6 + \u7981\u4EA4\u4E92),\u9876\u90E8\u8D26\u6237\u80F6\u56CA\u4E0D\u53D7\u5F71\u54CD */
.dsh-a6-side-card-dimmed {
  filter: grayscale(1);
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
}

/* \u6D6E\u5C42\u5185\u7981\u7528 CSS \u4F2A\u5143\u7D20 tooltip:JS portal tooltip \u6709 30ms \u5EF6\u8FDF,\u907F\u514D\u53CC\u63D0\u793A\u4E14\u4F2A\u5143\u7D20\u4F1A\u88AB overflow \u88C1\u526A */
.dsh-a6-side-popup [data-tooltip]::after,
.dsh-a6-side-popup [data-tooltip]::before {
  display: none;
}

/* \u6D6E\u5C42\u9876\u90E8\u8D26\u6237\u901F\u89C8\u80F6\u56CA\u884C:\u4E0E\u8BBE\u7F6E\u9875\u5934\u90E8\u540C\u6B3E\u89C6\u89C9,\u7F29\u7A84\u7D27\u51D1\u7248(\u4F59\u989D\u7EAF\u5C55\u793A + \u4EF7\u683C\u6CE2\u52A8\u53EF\u8DF3 + \u6A21\u578B\u5E02\u573A\u76F4\u8FBE) */
.dsh-a6-side-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 2px 2px 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
}

.dsh-a6-side-pills .dsh-a6-header-balance-badge,
.dsh-a6-side-pills .dsh-a6-price-pill,
.dsh-a6-side-pills .dsh-a6-market-pill {
  padding: 3px 10px;
  min-height: 24px;
  font-size: 11px;
  /* \u4F59\u989D\u80F6\u56CA\u57FA\u7C7B\u65E0 border-box/line-height\uFF0C\u8865\u4E0A\u4E0E\u4EF7\u683C\u80F6\u56CA\u4E00\u81F4\uFF0C\u4FDD\u8BC1\u4E24\u679A\u80F6\u56CA\u7B49\u9AD8 */
  box-sizing: border-box;
  line-height: 1;
}

.dsh-a6-side-pills .dsh-a6-price-pill-count,
.dsh-a6-side-pills .dsh-a6-price-pill-label,
.dsh-a6-side-pills .dsh-a6-hb-amount,
.dsh-a6-side-pills .dsh-a6-hb-label,
.dsh-a6-side-pills .dsh-a6-market-pill-label {
  font-size: 12px;
  line-height: 1;
}

/* \u6D6E\u5C42\u5185\u4F59\u989D\u80F6\u56CA\u4E3A\u7EAF\u5C55\u793A:\u7981\u6389\u8BBE\u7F6E\u9875\u7684 hover \u53CD\u9988\u4E0E\u624B\u578B(\u9700\u5199\u5728\u901A\u7528 hover \u89C4\u5219\u4E4B\u540E) */
.dsh-a6-side-balance-pill,
.dsh-a6-side-balance-pill:hover {
  cursor: default;
  border-color: var(--dsw-alias-border-l2, #e2e8f0);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
}


/* ===== \u6A21\u578B\u76EE\u5F55\u9875 ===== */
.dsh-a6-catalog-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dsh-a6-catalog-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dsh-a6-catalog-count {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  margin-left: 4px;
}

.dsh-a6-catalog-msg {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}
.dsh-a6-catalog-msg.ok {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #047857;
}
.dsh-a6-catalog-msg.err {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #b91c1c;
}

.dsh-a6-catalog-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dsh-a6-catalog-row {
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-a6-catalog-row.editing {
  border-color: #10b981;
}

/* \u7B2C\u4E00\u884C\uFF1A\u6A21\u578B ID + \u53EF\u7528\u5FBD\u7AE0 + \u540D\u79F0 + \u64CD\u4F5C\uFF08\u53C2\u6570\u7EDF\u4E00\u5728 ID \u4E0B\u65B9\uFF09 */
.dsh-a6-catalog-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dsh-a6-catalog-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9px;
  vertical-align: middle;
  white-space: nowrap;
}
.dsh-a6-catalog-badge.avail {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #047857;
}

.dsh-a6-catalog-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.dsh-a6-catalog-id {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.dsh-a6-catalog-id code {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #0f172a);
}
.dsh-a6-catalog-name {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-a6-catalog-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dsh-a6-catalog-param {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #047857;
  white-space: nowrap;
}
.dsh-a6-catalog-param.empty {
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.04));
  border-color: var(--dsw-alias-border-l3, #cbd5e1);
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}

.dsh-a6-catalog-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

/* \u884C\u5185\u7F16\u8F91\u8868\u5355 */
.dsh-a6-catalog-edit {
  border-top: 1px dashed var(--dsw-alias-border-l2, #e2e8f0);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsh-a6-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.dsh-a6-edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dsh-a6-edit-wide {
  grid-column: 1 / -1;
}

.dsh-a6-checkbox-group {
  display: inline-flex;
  gap: 14px;
  align-items: center;
  padding: 6px 0;
}
.dsh-a6-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, #0f172a);
  cursor: pointer;
  user-select: none;
}

.dsh-a6-edit-actions {
  display: inline-flex;
  gap: 8px;
  justify-content: flex-end;
}

/* \u6E05\u7A7A\u76EE\u5F55\u786E\u8BA4\u6001\uFF1A\u7EA2\u8272\u9AD8\u4EAE\u63D0\u793A\u4E8C\u6B21\u70B9\u51FB\u751F\u6548 */
.dsh-a6-btn-clear-confirm {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #ffffff !important;
}
`;

// src/client/index.ts
var name = "@lynn123411/dsh-a6api";
var inject = ["slots"];
function injectStyles() {
  if (typeof document === "undefined") return;
  const styleId = "dsh-a6api-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = main_default;
    document.head.appendChild(style);
  }
}
function setupGlobalTooltip() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.__dsh_a6api_tooltip_setup) return () => {
  };
  window.__dsh_a6api_tooltip_setup = true;
  const portalId = "dsh-a6api-tooltip";
  const arrowId = "dsh-a6api-tooltip-arrow";
  let portal = document.getElementById(portalId);
  let arrow = document.getElementById(arrowId);
  if (!portal) {
    portal = document.createElement("div");
    portal.id = portalId;
    portal.setAttribute("role", "tooltip");
    portal.style.cssText = "position:fixed;left:0;top:0;transform:translate(-9999px,-9999px);padding:6px 10px;background:rgba(15,23,42,0.96);color:#f8fafc;font-size:11px;line-height:1.4;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.12);max-width:min(320px,85vw);width:max-content;white-space:normal;word-break:break-word;overflow-wrap:anywhere;text-align:left;pointer-events:none;opacity:0;visibility:hidden;transition:opacity 0.08s;z-index:2147483647;";
    document.body.appendChild(portal);
  }
  if (!arrow) {
    arrow = document.createElement("div");
    arrow.id = arrowId;
    arrow.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;background:rgba(15,23,42,0.96);transform:translate(-9999px,-9999px) rotate(45deg);border-left:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.12);pointer-events:none;opacity:0;visibility:hidden;z-index:2147483646;";
    document.body.appendChild(arrow);
  }
  let currentTarget = null;
  function hide() {
    if (!portal || !arrow) return;
    portal.style.opacity = "0";
    portal.style.visibility = "hidden";
    arrow.style.opacity = "0";
    arrow.style.visibility = "hidden";
    document.body.classList.remove("dsh-a6api-tooltip-active");
    currentTarget = null;
  }
  function position(target) {
    if (!portal || !arrow || !target) return;
    const text = target.getAttribute("data-tooltip");
    if (!text) return;
    portal.textContent = text;
    portal.style.visibility = "hidden";
    portal.style.opacity = "0";
    portal.style.transform = "translate(-9999px,-9999px)";
    portal.style.visibility = "visible";
    const ttRect = portal.getBoundingClientRect();
    portal.style.visibility = "hidden";
    const rect = target.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let pos = target.getAttribute("data-tooltip-pos") || "";
    if (!pos) {
      const spaceAbove = rect.top;
      const spaceBelow = vh - rect.bottom;
      if (spaceAbove < ttRect.height + gap + 12 && spaceBelow > spaceAbove) pos = "down";
      else pos = "top";
    }
    let top = 0;
    let left = 0;
    let arrowTop = 0;
    let arrowLeft = 0;
    const isDown = pos.startsWith("down");
    if (isDown) {
      top = rect.bottom + gap;
      arrowTop = rect.bottom + gap - 4;
    } else {
      top = rect.top - ttRect.height - gap;
      arrowTop = rect.top - gap - 4;
    }
    if (pos === "left") {
      left = rect.right - ttRect.width;
      arrowLeft = rect.right - 14;
    } else if (pos === "right") {
      left = rect.left;
      arrowLeft = rect.left + 14;
    } else if (pos === "down-left") {
      left = rect.right - ttRect.width;
      arrowLeft = rect.right - 14;
    } else if (pos === "down-right") {
      left = rect.left;
      arrowLeft = rect.left + 14;
    } else {
      left = rect.left + rect.width / 2 - ttRect.width / 2;
      arrowLeft = rect.left + rect.width / 2 - 4;
    }
    left = Math.max(margin, Math.min(left, vw - ttRect.width - margin));
    const minArrow = left + 8;
    const maxArrow = left + ttRect.width - 12;
    arrowLeft = Math.max(minArrow, Math.min(arrowLeft, maxArrow));
    if (top < margin) top = margin;
    if (top + ttRect.height > vh - margin) top = vh - ttRect.height - margin;
    portal.style.transform = "translate(" + left + "px," + top + "px)";
    portal.style.visibility = "visible";
    portal.style.opacity = "1";
    arrow.style.transform = "translate(" + arrowLeft + "px," + arrowTop + "px) rotate(45deg)";
    arrow.style.visibility = "visible";
    arrow.style.opacity = "1";
    document.body.classList.add("dsh-a6api-tooltip-active");
  }
  let hoverTimer = null;
  const onMouseOver = (e) => {
    const target = e.target && e.target.closest ? e.target.closest("[data-tooltip]") : null;
    if (!target) return;
    currentTarget = target;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (currentTarget === target) position(target);
    }, 30);
  };
  const onMouseOut = (e) => {
    const target = e.target && e.target.closest ? e.target.closest("[data-tooltip]") : null;
    if (!target) return;
    const related = e.relatedTarget;
    if (related && target.contains(related)) return;
    if (currentTarget === target) {
      if (hoverTimer) clearTimeout(hoverTimer);
      hide();
    }
  };
  const onFocusIn = (e) => {
    const target = e.target && e.target.closest ? e.target.closest("[data-tooltip]") : null;
    if (!target) return;
    currentTarget = target;
    position(target);
  };
  const onFocusOut = (e) => {
    const target = e.target && e.target.closest ? e.target.closest("[data-tooltip]") : null;
    if (!target) return;
    if (currentTarget === target) hide();
  };
  const onScrollOrResize = () => {
    if (currentTarget) {
      if (document.body.contains(currentTarget) && currentTarget.matches && currentTarget.matches(":hover")) {
        position(currentTarget);
      } else if (document.activeElement === currentTarget) {
        position(currentTarget);
      } else {
        hide();
      }
    }
  };
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
  document.addEventListener("scroll", onScrollOrResize, true);
  return () => {
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    document.removeEventListener("scroll", onScrollOrResize, true);
    if (hoverTimer) clearTimeout(hoverTimer);
    try {
      portal?.remove();
    } catch {
    }
    try {
      arrow?.remove();
    } catch {
    }
    document.body.classList.remove("dsh-a6api-tooltip-active");
    try {
      delete window.__dsh_a6api_tooltip_setup;
    } catch {
      window.__dsh_a6api_tooltip_setup = void 0;
    }
    currentTarget = null;
  };
}
function apply(ctx) {
  injectStyles();
  if (typeof window !== "undefined") {
    try {
      ctx.effect(() => {
        const dispose = setupGlobalTooltip();
        return () => {
          try {
            if (typeof dispose === "function") dispose();
          } catch {
          }
        };
      }, "dsh-a6api: tooltip portal");
    } catch {
    }
  }
  if (typeof window === "undefined") return;
  try {
    setTimeout(() => {
      try {
        store.warmUp();
      } catch {
      }
      try {
        store.initPricePolling();
      } catch {
      }
    }, 1500);
  } catch {
  }
  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get("slots") : null);
    if (!slots || typeof slots.inject !== "function") return;
    slots.inject("settings.section", () => {
      return slots.register(
        {
          name: "settings.section",
          id: "dsh-a6api",
          // 约定：自有插件设置项 order 从 110 起步进 10（原生最大 100=桌面设置），保证排在所有原生项之下
          order: 120,
          label: () => "A6api"
        },
        A6ApiSettingsPanel
      );
    });
    const getModelDirectories = () => ctx && typeof ctx.get === "function" ? ctx.get("modelDirectories") : void 0;
    slots.inject("sidebar.footer.action", () => {
      return slots.register(
        {
          name: "sidebar.footer.action",
          id: "dsh-a6api-current-model",
          order: -1,
          label: () => "A6api"
        },
        (props) => import_react7.default.createElement(A6ApiSidebarCard, {
          ...props || {},
          getModelDirectories
        })
      );
    });
  } catch (err) {
    console.warn("[dsh-a6api] Failed to inject slots:", err);
  }
}
return module.exports; } });
//# sourceMappingURL=client.js.map

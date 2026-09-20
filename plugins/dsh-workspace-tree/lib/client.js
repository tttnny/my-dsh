/**
 * dsh-workspace-tree — browser half (v2.3.0)。
 *
 * 内核契约基线：DSH 0.1.6。
 *  - 主视图当前会话读 sessions.list 行上的 retainedBy.mainView（快照已无 current）；
 *  - 会话导航走 uiWorkspace：打开 openSession、清空主视图 clearMain；
 *  - 重命名经 sessions.using() 租用会话作用域（binding(id) 只读已租用代）；
 *  - 等待交互与完成未读取 useSessionStatus 座位（会话行上无 pendingInteraction/completed）。
 *
 * 核心设计（第一性原理对齐）：
 *  - 会话空间归属与归档状态正交；官方列表返回的会话一律可见（含空白草稿），
 *    工作区模式显示活跃会话、归档区显示已归档会话。
 *  - 工作区模式保留官方的「未分组」语义：无归属会话照官方列表原样落进未分组区块，
 *    插件不替用户注册工作区；归档区同样以「未分组」分组兜住无归属的归档会话。
 *  - 工作区管理默认「移除显示」而非「删除注册」：仅隐藏工作区节点（localStorage 记忆），
 *    注册与会话归属不变；重新添加同一目录后工作区连同会话一起恢复显示。
 *    例外：名下已无任何可见会话与归档会话的空工作区，移除时自动走官方 workspace/delete
 *    RPC 真注销注册表记录（同样不删磁盘目录与会话文件）。
 *  - 归档门槛：运行中/等待回复的会话不允许归档（按钮置灰），归档动作沿用官方
 *    workspace/archiveSession RPC；凡进入归档区的会话删除零守卫、必定可删。
 *  - 永久删除会话采用持久化墓碑（localStorage）：官方列表仍返回的已删会话无论
 *    刷新/跨标签页都不可见；官方列表收敛后自动摘碑。对「列表仍返回」的墓碑另有
 *    权威自愈：向 Host 查询会话目录是否仍物理存在——存在即会话存活（永久删除成功
 *    必然使目录消失），该墓碑必为误写，自动作废恢复显示；设置页亦提供手动
 *    「清空墓碑」兜底入口。
 *  - 空白草稿跟随官方语义：不自动回收、仅视图层隐藏（官方从不物理删除会话文件）；
 *    回收只在设置页提供一次性入口（「删除所有空壳会话」→ Host `/blank/deleteAll`）。
 *  - 目录选择面：官方「一种能力、两种交互」——本机 macOS 走宿主 osascript 原生
 *    「选择文件夹」窗口，其余环境走插件自持的浏览对话框（面包屑 + 目录列表 +
 *    绝对路径直输 + 新建文件夹），底层只用官方 browse 原语
 *    （uiWorkspace.listDirectory / createDirectory）。插件以 priority -1 顶掉
 *    sidebar.workspaces，官方对话框无处渲染，故两种交互都由插件自己承担。
 *  - 每个工作区行的「添加工作区」按钮与该工作区共享同一套目录选择交互，
 *    只是把选择器的起始路径播在该工作区目录上（允许越出，不做越界限制）。
 */
window.__ModuleLoader__.load({
  id: "@lynn123411/dsh-workspace-tree",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;
    // 设置页控件与全部图标走内核基线原语：手绘按钮/开关/输入/图形全部不再自持。
    const {
      Button, Input, Switch, Modal, Menu, StateDot, HoverCard, relativeTime,
      IconFolderOpen16, IconFolderOpenOutline16, IconChevronRightOutline14, IconPlusOutline16,
      IconCloseOutline16, IconEditOutline16, IconTrashOutline16, IconArchiveOutline20,
      IconRefreshOutline14, IconNewChatOutline16, IconProjectAddOutline16, IconCodeOutline16,
      IconAlarmClockOutline16, IconSearchOutline16, IconPersonalizationOutline16
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Cordis 插件名（与 patch 行 id 一致）。 */
    const name = "dsh-workspace-tree";
    /**
     * 依赖的客户端服务。uiWorkspace（会话/目录导航服务）**不声明为硬依赖**：cordis 的
     * inject 声明会等该服务就绪才激活插件，而插件激活与 slot 注入的时刻都可能早于它注册；
     * 改为运行时探测（resolveUiWorkspace），到调用点再解析。
     */
    const inject = ["slots", "locale", "sessions", "workspaces"];

    /** 视图状态（分组方式 / 排序方式 / 折叠 / 手选顺序）持久化键。 */
    const VIEW_KEY = "dsh-workspace-tree.view";
    const LS_CONFIG = "dsh-workspace-tree.config";
    /** 旧 localStorage 配置已迁移到 Host settings 的一次性标记（防迁移回环）。 */
    const LS_MIGRATED = "dsh-workspace-tree.migrated";
    /** 本插件在 DSH settings 服务中的命名空间（与 Host CONFIG_SCHEMA 共用）。 */
    const SETTINGS_NS = "dsh-workspace-tree";
    /** 永久删除会话的墓碑集合（localStorage 持久化，跨刷新/跨标签页生效）。 */
    const LS_DELETED = "dswt-workspace-tree.deleted";
    /** 被「移除显示」的工作区 ID 集合（仅 UI 隐藏，注册与会话归属不变）。 */
    const LS_HIDDEN_WS = "dswt-workspace-tree.hiddenWs";

    /** 本插件 Host 路由前缀（避开 /plugins/ 的 client bundle 保留空间）。 */
    const API = "/api/dsh-workspace-tree";

    // ══════════════ 配置 store（localStorage 持久化，订阅通知） ══════════════
    const DEFAULT_CONFIG = {
      enabled: true,
      defaultIde: "vscode",
      customIdeCommand: ""
    };
    let configState = null;
    const configListeners = new Set();
    function sanitizeConfig(input) {
      const out = Object.assign({}, DEFAULT_CONFIG);
      if (!input || typeof input !== "object" || Array.isArray(input)) return out;
      if (typeof input.enabled === "boolean") out.enabled = input.enabled;
      if (typeof input.defaultIde === "string" && input.defaultIde) out.defaultIde = input.defaultIde;
      if (typeof input.customIdeCommand === "string") out.customIdeCommand = input.customIdeCommand;
      return out;
    }
    function getConfig() {
      if (configState === null) {
        try {
          const raw = localStorage.getItem(LS_CONFIG);
          configState = sanitizeConfig(raw ? JSON.parse(raw) : null);
        } catch { configState = Object.assign({}, DEFAULT_CONFIG); }
      }
      return configState;
    }
    function setConfig(patch) {
      const next = Object.assign({}, getConfig(), patch);
      configState = next;
      try { localStorage.setItem(LS_CONFIG, JSON.stringify(next)); } catch { /* ignore */ }
      for (const l of configListeners) l(next);
    }
    function subscribeConfig(fn) {
      configListeners.add(fn);
      return () => { configListeners.delete(fn); };
    }

    // ══════════════ Host 设置（DSH settings 服务，持久化到 ~/.dsh/settings.yaml） ══════════════
    // 用户偏好（默认 IDE 等）按 DSH 规范走 Host 持久化：localStorage 按源（含端口）
    // 隔离，重启换端口即丢失；settings 穿透重启/端口/浏览器。UI 瞬态（展开/隐藏/
    // 墓碑/当前模式）仍留 localStorage。settingsScope 运行时探测（同 uiWorkspace
    // 的旧版兼容策略）：缺席时回退纯 localStorage 行为。
    let settingsScopeCtx = null;
    // 按命名空间绑定的 scope（官方契约：ctx.settingsScope 只是工厂，必须 bind 才有
    // getSnapshot/set/subscribe；此前直传工厂导致全线静默降级为 LS，见审计）。
    let boundSettingsScope = null;
    function resolveSettingsScope() {
      if (boundSettingsScope) return boundSettingsScope;
      try {
        const factory = settingsScopeCtx ? settingsScopeCtx.get("settingsScope") : null;
        if (factory && typeof factory.bind === "function") {
          boundSettingsScope = factory.bind({ namespace: SETTINGS_NS });
          return boundSettingsScope;
        }
      } catch { /* ignore：旧版 DSH 无此服务，回退 LS */ }
      try { return (settingsScopeCtx && settingsScopeCtx.settingsScope) || null; } catch { return null; }
    }
    function releaseSettingsScope() {
      boundSettingsScope = null;
    }
    function safeScopeSnapshot(scope) {
      try {
        const snap = scope ? scope.getSnapshot() : null;
        if (snap && snap.status === "ready" && snap.value && typeof snap.value === "object") return snap;
      } catch { /* ignore */ }
      return null;
    }
    function scopeValueToConfig(value) {
      // 经 sanitizeConfig 收敛：Host schema 对 defaultMode/defaultIde 是裸 string，
      // 脏值（手写 settings.yaml）不能直接进 UI。
      return sanitizeConfig(value || {});
    }
    /** 有效配置：settings 就绪即以 Host 值为准，否则回退 localStorage。 */
    function getEffectiveConfig() {
      const snap = safeScopeSnapshot(resolveSettingsScope());
      if (snap) return scopeValueToConfig(snap.value);
      return getConfig();
    }
    /** 写透：Host 可写即逐字段 set（失败回退 LS），否则写 LS；同时同步 LS 缓存。 */
    function setEffectiveConfig(patch) {
      const scope = resolveSettingsScope();
      const snap = safeScopeSnapshot(scope);
      const patchObj = patch || {};
      if (scope && snap && snap.writable !== false) {
        try {
          for (const [k, v] of Object.entries(patchObj)) {
            if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k)) {
              try {
                const p = scope.set(k, v);
                if (p && typeof p.catch === "function") p.catch(() => { /* 队列写入失败静默：快照订阅会纠正显示 */ });
              } catch { /* 单字段失败不阻断其余 */ }
            }
          }
        } catch { setConfig(patchObj); return; }
        // 同步 LS 缓存：降级（极旧 DSH）时仍有新鲜值；迁移标记防回环。
        setConfig(patchObj);
        return;
      }
      setConfig(patchObj);
    }
    /** Host 重置：逐字段 unset 回到继承（schema 默认），LS 同步恢复默认。 */
    function resetEffectiveConfig() {
      const scope = resolveSettingsScope();
      const snap = safeScopeSnapshot(scope);
      if (scope && snap && snap.writable !== false) {
        try {
          for (const k of Object.keys(DEFAULT_CONFIG)) {
            try {
              const p = scope.unset(k);
              if (p && typeof p.catch === "function") p.catch(() => { /* ignore */ });
            } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      setConfig(Object.assign({}, DEFAULT_CONFIG));
    }
    /**
     * 旧 localStorage 配置一次性迁移到 Host：仅当 Host 尚无用户层、本地确有
     * 旧值且与默认值不同、且本机尚未标记迁移时，逐字段 set；无论是否迁移都
     * 打标记，避免用户主动 unset 回默认后被本地缓存重新污染。
     */
    function maybeMigrateLegacyConfig() {
      let scope = null;
      try { scope = resolveSettingsScope(); } catch { return; }
      const snap = safeScopeSnapshot(scope);
      if (!scope || !snap) return;
      try {
        if (localStorage.getItem(LS_MIGRATED)) return;
      } catch { return; }
      try {
        const user = snap.user;
        const hasUserLayer = user && typeof user === "object" && Object.keys(user).length > 0;
        if (!hasUserLayer) {
          let legacy = null;
          try {
            const raw = localStorage.getItem(LS_CONFIG);
            if (raw) legacy = JSON.parse(raw);
          } catch { legacy = null; }
          if (legacy && typeof legacy === "object") {
            for (const k of Object.keys(DEFAULT_CONFIG)) {
              const v = legacy[k];
              if (v !== void 0 && JSON.stringify(v) !== JSON.stringify(DEFAULT_CONFIG[k])) {
                try {
                  const p = scope.set(k, v);
                  if (p && typeof p.catch === "function") p.catch(() => { /* ignore */ });
                } catch { /* 单字段失败不阻断其余 */ }
              }
            }
          }
        }
      } catch { /* 迁移失败静默：下次以标记为准不再重试 */ }
      try { localStorage.setItem(LS_MIGRATED, "1"); } catch { /* ignore */ }
    }
    // ══════════════ 空白草稿的官方语义 ══════════════
    // v1.9.0：空白草稿跟随官方——官方从不自动清理（懒物化、仅视图层隐藏），
    // 因此移除了旧版的自动回收与 claims/heartbeat 占用注册表（host /claims/*
    // 端点、localStorage 心跳、pagehide 释放等整套机制一并删除）。
    // 回收改为设置页的一次性显式入口（「删除所有空壳会话」）：判据取官方投影的
    // blank，由 Host 侧排除运行中/已 attach/子代理后再物理删除。
    // 渲染层维持现状：非当前打开的 blank 行在树中隐藏（sessionVisible）。

    /**
     * 批量删除失败项的人话说明。服务端删除零守卫后失败只剩真实原因
     * （文件被锁/权限等），逐条列出失败项与会话 ID。
     * @param r - Host 响应（含 `failed`）。
     * @param keptWhere - 失败项的留存位置说法（归档删除 = 归档区；空壳删除 = 原地）。
     */
    function describeDeleteFailures(r, keptWhere) {
      const failed = Array.isArray(r && r.failed) ? r.failed : [];
      const n = failed.length;
      if (n === 0) return "";
      const lines = failed.slice(0, 3).map((d) => {
        if (!d || !d.sessionId) return d && d.error ? d.error : "未知原因";
        const why = d.error || "未知原因";
        return "会话 " + d.sessionId + "： " + why;
      });
      return "其中 " + n + " 条删除失败，" + (keptWhere || "已保留在原地") + "："
        + lines.join("；")
        + (n > 3 ? "；另有 " + (n - 3) + " 条同类失败" : "");
    }

    // ══════════════ Host API ══════════════
    async function apiPost(path, body) {
      const res = await fetch(API + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      return res.json();
    }

    async function apiGet(path) {
      const res = await fetch(API + path, { method: "GET" });
      return res.json();
    }

    // ══════════════ 归档门槛（运行中 / 等待交互 不归档） ══════════════
    /**
     * 官方"等待人回复"的三种交互（与内核 visiblePendingKind 一致）：审批、计划复核、提问。
     * 其余 kind（以及无交互）不构成门槛。
     */
    const PENDING_LABEL = { "approval": "等待审批", "plan-review": "等待计划复核", "question": "等待回答提问" };
    /**
     * 官方会话状态座位（`useSessionStatus` 的快照，Map<SessionId,
     * { running, pendingInteraction, completionUnread }>）里的单行状态项。
     * 注意：客户端 SessionSummary 行上**没有** pendingInteraction / completed 字段，
     * 这两项数据只走座位。
     */
    function sessionStatusEntryOf(sessionStatus, sid) {
      if (!sessionStatus || typeof sessionStatus.get !== "function") return null;
      return sessionStatus.get(sid) || sessionStatus.get(String(sid)) || null;
    }
    /**
     * 取一条待处理交互的 kind（审批 / 计划复核 / 提问）。
     */
    function pendingKindOf(sessionStatus, sid) {
      const entry = sessionStatusEntryOf(sessionStatus, sid);
      const kind = entry && entry.pendingInteraction && entry.pendingInteraction.kind;
      return (kind && Object.prototype.hasOwnProperty.call(PENDING_LABEL, kind)) ? kind : null;
    }
    /**
     * 完成未读提醒位（会话跑完但人还没看）：0.1.6 起行上不再有 `completed` 字段。
     */
    function completionUnreadOf(sessionStatus, sid) {
      const entry = sessionStatusEntryOf(sessionStatus, sid);
      return !!(entry && entry.completionUnread === true);
    }
    /**
     * 恢复一条归档会话。归档集合归官方 workspace 控制器管（`unarchiveSession`），
     * 插件不再自己读写注册表 state，以免两套写路径互相覆盖。
     */
    async function unarchiveSessionVia(ctx, sessionId) {
      const controller = ctx && ctx.workspaces;
      if (!controller || typeof controller.unarchiveSession !== "function") {
        throw new Error("会话恢复服务不可用（当前 DSH 版本不支持）");
      }
      await controller.unarchiveSession(sessionId);
    }
    /**
     * 归档门槛的 Host 权威判据。官方 workspace/archiveSession 在 Host 侧没有运行态守卫
     * （直接写注册表），而客户端 running 位是 Host 转发来的事实（客户端 prompt() 不做乐观
     * 翻转，发送后到状态帧落地之间存在窗口），所以归档前问一次插件自己的 Host 半边：
     *  自身 agents.get(sessionId).status（Host 服务 `agents.get(id)` 返回带 status 的活
     *  Agent，状态取值 idle | running），以及持久谱系里在跑的后代子代理数
     *  runningDescendants（只统计 origin === "subagent" 链上的后代）。
     * @returns {Promise<{ok:boolean, running?:boolean, status?:string, runningDescendants?:number}>}
     *   ok=false 表示查询本身不可用（旧版/网络故障）——调用方 fail-open 放行，
     *   由官方 RPC 定生死。
     */
    async function checkArchiveGuard(sessionId) {
      try {
        const result = await apiPost("/archive/guardCheck", { sessionId });
        return (result && result.ok === true) ? result : { ok: false };
      } catch {
        return { ok: false };
      }
    }

    // ══════════════ 展开状态持久化 ══════════════
    function loadSet(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
      } catch { return new Set(); }
    }
    function saveSet(key, set) {
      try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
    }

    /**
     * 墓碑集合（localStorage 持久化）：v1.9.0 起无时间戳、无定时自愈——
     * 服务端删除 fail-loud（物理删净才剔除注册表，失败会如实报错），因此
     * 墓碑只承担「官方列表收敛前的残留期隐藏」，官方列表不再返回该 id 即摘碑。
     */

    /** 树的固定层级缩进（8 + depth * INDENT）。 */
    const INDENT = 16;

    // ══════════════ 图标 ══════════════
    /** 语义名 → 官方原语图标。三档文件夹共用「开口文件夹」形状（蓝/灰/线框由 CSS 类区分）。 */
    const ICON_COMPONENTS = {
      folderOpen: IconFolderOpen16,
      folderOpenOutline: IconFolderOpenOutline16,
      chevron: IconChevronRightOutline14,
      plus: IconPlusOutline16,
      minus: IconCloseOutline16,
      edit: IconEditOutline16,
      trash: IconTrashOutline16,
      archive: IconArchiveOutline20,
      restore: IconRefreshOutline14,
      newChat: IconNewChatOutline16,
      folderPlus: IconProjectAddOutline16,
      ide: IconCodeOutline16,
      alarm: IconAlarmClockOutline16,
      search: IconSearchOutline16,
      options: IconPersonalizationOutline16
    };
    function Icon({ name, size, className }) {
      const Component = ICON_COMPONENTS[name];
      if (!Component) return null;
      return h(Component, { size: size || 16, className });
    }
    /** 子树内有会话 → 填充开口文件夹；无会话 → 线框开口文件夹。 */
    function folderIconFor(hasSessions) {
      return hasSessions ? "folderOpen" : "folderOpenOutline";
    }

    // ══════════════ 状态点 ══════════════
    /**
     * 插件状态 → 官方 `StateDot` 状态。官方只有 done / warning / ongoing / error / idle
     * 五档：插件的「完成未读」是官方的绿色 done，静息态是 idle 灰点。
     */
    const DOT_STATE = { done: "idle", "done-reminder": "done", warning: "warning", ongoing: "ongoing", error: "error" };
    function SessionDot({ state, size }) {
      return h(StateDot, { state: DOT_STATE[state] || "idle", size: size || 10 });
    }

    function sessionState(row, current, pendingKind, completionUnread, runningSubagents) {
      if (!row) return "done";
      // 等待人回复（审批/计划复核/提问）优先于运行态：这种会话在动，但卡在人身上。
      // pendingKind / completionUnread 均由官方会话状态座位传入（row 上没有这两个字段）。
      if (pendingKind) return "warning";
      // 自身回合在跑，或其不间断谱系里有后代子代理在跑——与官方「父空闲、子代理在跑」
      // 也点亮运行指示的语义一致。
      if (row.running || runningSubagents > 0) return "ongoing";
      if (completionUnread && !current) return "done-reminder";
      return "done";
    }

    /** 行尾相对时间：分档走官方 relativeTime（同一会话在两个界面档位一致），文案用本插件字典。 */
    const TIME_LABEL = { now: "刚刚", minutes: "{n}分钟", hours: "{n}小时", days: "{n}天", months: "{n}个月", years: "{n}年" };
    function timeLabel(updatedAt, now) {
      if (!updatedAt) return "";
      const bucket = relativeTime(updatedAt, now);
      const template = TIME_LABEL[bucket.unit];
      if (template === undefined) return "";
      return bucket.unit === "now" ? template : template.replace("{n}", String(bucket.n));
    }
    /** Hover 卡里的「多久之前」：now 档不带「前」。 */
    function hoverTimeLabel(updatedAt, now) {
      if (!updatedAt) return "";
      const bucket = relativeTime(updatedAt, now);
      return bucket.unit === "now"
        ? TIME_LABEL.now
        : TIME_LABEL[bucket.unit].replace("{n}", String(bucket.n)) + "前";
    }

    // ══════════════ 后代子代理谱系（与官方同构） ══════════════
    /**
     * 逐个祖先累计「运行中的后代子代理数」，与官方 dsh-client-ui-workspace 的
     * indexSubagentDescendants 同构：只遍历 origin === "subagent" 的行，从它沿 parentId
     * 逐层向上，且每层自身也必须是 subagent（不间断谱系）——fork 出来的普通会话
     * （origin 为空）既不参与计数、也不会被算成谁的子代理；seen 集合防环。
     * 计数读 session 快照的 running（与官方一致，不读状态座位）。
     * @param byId - SessionListState.byId（含 subagent 行，即使这些行在树里被隐藏）。
     * @returns {Map<string, number>} 祖先会话 id → 运行中的后代子代理数。
     */
    function indexSubagentRunning(byId) {
      const indexed = new Map();
      for (const row of Object.values(byId || {})) {
        if (!row || row.origin !== "subagent") continue;
        const seen = new Set();
        let current = row;
        while (current && current.origin === "subagent" && current.parentId != null && !seen.has(String(current.id))) {
          seen.add(String(current.id));
          const key = String(current.parentId);
          indexed.set(key, (indexed.get(key) || 0) + (row.running ? 1 : 0));
          current = byId[current.parentId] || byId[key] || null;
        }
      }
      return indexed;
    }
    /** 祖先会话 id 的运行中后代子代理数（无谱系索引时视为 0）。 */
    function runningSubagentsOf(lineage, sid) {
      if (!lineage || sid === null || sid === void 0) return 0;
      return lineage.get(String(sid)) || 0;
    }

    // ══════════════ 第一性原理：会话可见性判定标准 ══════════════
    /**
     * subagent 子会话判定：归宿主 subagent 路由管理（随父会话展示），
     * 宿主禁止将其 attach 到工作区（attach 必然抛 subagent-ownership 错误），
     * 故不参与树的任何渲染投影，也不进入未分组/空白草稿回收。
     * 唯一判据是 origin === "subagent"——**不能看 parentId**：fork 出来的普通会话
     * （origin 为空）同样带 parentSessionId（宿主 fork 会写 meta.parentSession），
     * 用 parentId 判断会把 fork 会话误当作 subagent 而全部隐藏。
     */
    function isSubagentRow(row) {
      return !!row && row.origin === "subagent";
    }

    /**
     * 判定一个会话在工作区/普通视图中是否可见：
     * 官方列表返回的普通会话一律可见（含空白草稿）；仅排除已归档（归档区显示）、
     * 已硬删（墓碑）会话与 subagent 子会话。
     */
    function sessionVisible(session, current, archived, hardDeleted) {
      if (!session) return false;
      if (isSubagentRow(session)) return false;
      const sid = String(session.id || session.sessionId || "");
      if (archived && archived.has(sid)) return false;
      if (hardDeleted && hardDeleted.has(sid)) return false;
      // 空白草稿会话（未发送任何消息）：仅在当前正处于打开交互状态时可见，离场后立即消失
      if (session.blank && sid !== String(current)) return false;
      return true;
    }

    /**
     * 判定一个会话在归档视图中是否有效可见：
     * 必须已被归档，且未被硬删墓碑，且排除空白草稿与 subagent 子会话。
     */
    function archivedSessionVisible(session, archived, hardDeleted) {
      if (!session) return false;
      if (isSubagentRow(session)) return false;
      if (session.blank) return false;
      const sid = String(session.id || session.sessionId || "");
      if (!archived || !archived.has(sid)) return false;
      if (hardDeleted && hardDeleted.has(sid)) return false;
      return true;
    }

    // ══════════════ 树构建 ══════════════
    function normalizePath(p) {
      let s = String(p || "").replace(/\\/g, "/");
      while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
      return s;
    }
    function baseName(p) {
      const n = normalizePath(p);
      if (!n || n === "/") return "/";
      const i = n.lastIndexOf("/");
      return i >= 0 ? (n.slice(i + 1) || "/") : n;
    }
    function parentPath(p) {
      const n = normalizePath(p);
      const i = n.lastIndexOf("/");
      if (i <= 0) return null;
      return n.slice(0, i);
    }

    /** 工作区森林：按目录嵌套关系组织工作区节点。 */
    function buildWorkspaceForest(items) {
      const nodes = (items || []).map((w) => ({ w, path: normalizePath(w.path), children: [] }));
      const top = [];
      for (const n of nodes) {
        let parent = null, bestLen = -1;
        for (const m of nodes) {
          if (m === n || m.path === "/" || m.path === "") continue;
          if (n.path.startsWith(m.path + "/") && m.path.length > bestLen) { parent = m; bestLen = m.path.length; }
        }
        if (parent) parent.children.push(n);
        else top.push(n);
      }
      return top;
    }

    /** 所有已注册工作区名下会话的 ID 集合（"未分组"判定的公共基准）。 */
    function accountedSessionIds(items) {
      const set = new Set();
      for (const w of items || []) {
        for (const sid of (w.sessionIds || [])) set.add(String(sid));
      }
      return set;
    }

    /**
     * 列表快照里的「主视图当前会话」。
     * DSH 0.1.6 起 `sessions.list` 快照不再携带 `current`：主视图持有者改由行上的
     * `retainedBy.mainView` 计数标识（与内核 mainSessionId 同款判据）。按快照对象缓存，
     * 避免逐行渲染时反复遍历 byId。
     */
    const currentSessionIdCache = new WeakMap();
    function currentSessionIdOf(sessions) {
      if (!sessions || typeof sessions !== "object") return null;
      if (currentSessionIdCache.has(sessions)) return currentSessionIdCache.get(sessions);
      let current = null;
      const byId = sessions.byId || {};
      for (const id of Object.keys(byId)) {
        const row = byId[id];
        if (row && row.retainedBy && (row.retainedBy.mainView ?? 0) > 0) { current = id; break; }
      }
      currentSessionIdCache.set(sessions, current);
      return current;
    }

    /** 可见会话 ID 列表投影。 */
    function visibleSessionIds(ids, sessions, archived, hardDeleted, cur) {
      if (!Array.isArray(ids)) return [];
      const byId = (sessions && sessions.byId) || {};
      const current = cur === undefined ? currentSessionIdOf(sessions) : cur;
      return ids.filter((sid) => {
        const row = byId[sid];
        return sessionVisible(row, current, archived, hardDeleted);
      });
    }

    // ══════════════ 视图状态（分组 / 排序 / 折叠 / 手选顺序） ══════════════
    /** 账号键：真实工作区用 workspaceId，未分组用 ""，单一列表用 FLAT_KEY。 */
    const UNGROUPED_KEY = "";
    const FLAT_KEY = "~flat";
    const GROUP_BY = { workspace: "workspace", workspaceTree: "workspaceTree", flat: "flat" };
    const DEFAULT_VIEW = {
      groupBy: GROUP_BY.workspaceTree,
      orderBy: "updated",
      /** 已折叠的组键（官方语义：默认展开，只记折叠）。 */
      collapsed: [],
      /** 手选顺序：账号键 → 会话 ID 数组（仅 orderBy === "manual" 时生效）。 */
      sessionOrder: {},
      /** 已展开会话上限的组键（每组默认只显示 5 条普通会话）。 */
      expandedSessions: []
    };
    /** 读取持久化视图状态；形状不合法就退回默认（旧版本键不迁移）。 */
    function loadViewState() {
      try {
        const raw = localStorage.getItem(VIEW_KEY);
        if (!raw) return DEFAULT_VIEW;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return DEFAULT_VIEW;
        const groupBy = Object.prototype.hasOwnProperty.call(GROUP_BY, parsed.groupBy) ? parsed.groupBy : DEFAULT_VIEW.groupBy;
        const orderBy = parsed.orderBy === "manual" ? "manual" : "updated";
        return {
          groupBy,
          orderBy,
          collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.map(String) : [],
          sessionOrder: (parsed.sessionOrder && typeof parsed.sessionOrder === "object") ? parsed.sessionOrder : {},
          expandedSessions: Array.isArray(parsed.expandedSessions) ? parsed.expandedSessions.map(String) : []
        };
      } catch {
        return DEFAULT_VIEW;
      }
    }
    function saveViewState(view) {
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* 隐私模式下不可写：本次会话内存态照常 */ }
    }

    /** 最近更新优先（同刻按 ID 稳定排序，与官方 orderByRecency 同款判据）。 */
    function recencyOrder(sids, byId) {
      return sids.slice().sort((a, b) => {
        const ua = (byId[a] && byId[a].updatedAt) || 0;
        const ub = (byId[b] && byId[b].updatedAt) || 0;
        if (ua !== ub) return ub - ua;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
    /** 手选顺序与当前成员对账：留下的按存的顺序，新出现的按当前顺序追加。 */
    function reconcileManualOrder(memberIds, saved) {
      const members = new Set(memberIds);
      const kept = (saved || []).map(String).filter((id) => members.has(id));
      const seen = new Set(kept);
      for (const id of memberIds) if (!seen.has(id)) kept.push(id);
      return kept;
    }
    /**
     * 当前打开的空白草稿恒在最前（官方 pinCurrentBlank）。
     * 只钉**本账号自己的成员**：当前草稿属于某一个工作区（或「未分组」），
     * 若不加这道成员检查，它会被钉进每个账号的顺序里，在各个组里各渲染一行幻影。
     */
    function pinCurrentBlank(order, currentSid, byId) {
      if (!currentSid) return order;
      const row = byId[currentSid];
      if (!row || !row.blank) return order;
      const target = String(currentSid);
      if (!order.some((id) => String(id) === target)) return order;
      return [currentSid].concat(order.filter((id) => String(id) !== target));
    }
    /** 一个账号（工作区 / 未分组 / 单一列表）的显示顺序。 */
    function accountOrder(accountKey, memberIds, sessions, view, currentSid) {
      const byId = (sessions && sessions.byId) || {};
      const saved = view.sessionOrder[accountKey];
      const ordered = (view.orderBy === "manual" && Array.isArray(saved))
        ? reconcileManualOrder(memberIds, saved)
        : recencyOrder(memberIds, byId);
      return pinCurrentBlank(ordered, currentSid, byId);
    }

    /** 每组默认显示的普通会话条数（官方 COLLAPSED_SESSION_LIMIT）。 */
    const COLLAPSED_SESSION_LIMIT = 5;
    /** 折叠投影：空白草稿不占额度，普通会话超出上限的尾部由「展开其余 N 个」放行。 */
    function collapsedSessionRows(sids, byId) {
      let ordinary = 0;
      const rows = sids.filter((sid) => {
        const row = byId[sid];
        if (row && row.blank) return true;
        if (ordinary >= COLLAPSED_SESSION_LIMIT) return false;
        ordinary += 1;
        return true;
      });
      return { rows, hiddenCount: sids.length - rows.length };
    }

    /** 活动 Schedule 标记：列表投影值里的 schedule 非空即为真（官方 hasActiveSchedule）。 */
    function hasActiveSchedule(row) {
      return !!row && Array.isArray(row.projectionValues && row.projectionValues.schedule)
        && row.projectionValues.schedule.length > 0;
    }

    // ══════════════ 状态向上透传（聚合） ══════════════
    const AGG_PRIO = { warning: 3, ongoing: 2, "done-reminder": 1 };
    function aggPriority(st) {
      return AGG_PRIO[st] || 0;
    }
    function aggOfSessionIds(ids, sessions, archived, hardDeleted, sessionStatus, lineage, current) {
      const byId = (sessions && sessions.byId) || {};
      const cur = current === undefined ? currentSessionIdOf(sessions) : current;
      let best = null;
      for (const sid of ids || []) {
        const row = byId[sid];
        if (!sessionVisible(row, cur, archived, hardDeleted)) continue;
        const st = sessionState(row, sid === cur, pendingKindOf(sessionStatus, sid), completionUnreadOf(sessionStatus, sid), runningSubagentsOf(lineage, sid));
        if (aggPriority(st) > aggPriority(best)) best = st;
        if (best === "warning") return best;
      }
      return best;
    }
    function decorateAgg(node, wsOf, childrenOf, sessions, archived, hardDeleted, sessionStatus, lineage, current) {
      let best = null;
      let running = false;
      let hasSessions = false;
      const w = wsOf(node);
      if (w) {
        const vis = visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted, current);
        if (vis.length > 0) hasSessions = true;
        best = aggOfSessionIds(w.sessionIds, sessions, archived, hardDeleted, sessionStatus, lineage, current);
        const byId = (sessions && sessions.byId) || {};
        for (const sid of vis) {
          if (byId[sid] && (byId[sid].running || runningSubagentsOf(lineage, sid) > 0)) { running = true; break; }
        }
      }
      for (const c of childrenOf(node)) {
        const cs = decorateAgg(c, wsOf, childrenOf, sessions, archived, hardDeleted, sessionStatus, lineage, current);
        if (aggPriority(cs) > aggPriority(best)) best = cs;
        if (c.aggRunning) running = true;
        if (c.aggHasSessions) hasSessions = true;
      }
      node.aggState = best;
      // 子树级图标状态投影：aggRunning=子树内有运行中会话（图标染蓝）；aggHasSessions=子树内有会话（填充灰底）
      node.aggRunning = running;
      node.aggHasSessions = hasSessions;
      return best;
    }

    /**
     * 悬停显示被裁掉的标题尾部（官方 dsh-client-ui-workspace 同款）：标题自身是裁切盒，
     * 装不下的文本滚到末尾即可读全。离开时用 instant 一步归位——静息态省略号与变窄的
     * 单元格会在滑行途中迎上文本。装得下的标题没有滚动区间，滑行还是跳变交给样式表。
     */
    function revealClippedTitle(title, revealed) {
      if (revealed) {
        title.scrollLeft = title.scrollWidth - title.clientWidth;
        return;
      }
      if (typeof title.scrollTo === "function") title.scrollTo({ left: 0, behavior: "instant" });
      else title.scrollLeft = 0;
    }

    /** 会话 Hover 卡：标题、「多久之前」、每条状态（点 + 文字），与官方卡片同构。 */
    function SessionHoverContent({ title, timeText, statusLabels }) {
      return h("div", { className: "dswt-hoverContent" }, [
        h("div", { key: "t", className: "dswt-hoverTitle" }, title),
        timeText !== "" && h("div", { key: "m", className: "dswt-hoverMeta" }, timeText),
        statusLabels.map((status) => h("div", { key: "s:" + status.label, className: "dswt-hoverStatus" }, [
          h(SessionDot, { key: "d", state: status.state, size: 10 }),
          h("span", { key: "l" }, status.label)
        ]))
      ]);
    }

    /** 状态语义名 → hover 卡文案（与官方 status.* 字典同义）。 */
    function sessionStatusLabels(row, selected, pendingKind, completionUnread, subagents) {
      const labels = [];
      if (pendingKind) labels.push({ state: "warning", label: PENDING_LABEL[pendingKind] });
      if (row.running) labels.push({ state: "ongoing", label: "运行中" });
      if (subagents > 0) labels.push({ state: "ongoing", label: subagents + " 个子代理运行中" });
      if (!row.running && subagents === 0 && completionUnread) labels.push({ state: "done", label: "已完成" });
      if (labels.length === 0) labels.push({ state: "idle", label: "空闲" });
      return labels;
    }

    // ══════════════ 工作区模式：会话行 ══════════════
    function SessionRow({ sid, sessions, pendingKind, completionUnread, runningSubagents, depth, indent, now, currentSid, accountKey, onOpen, onRename, onArchive, drag }) {
      const titleRef = useRef(null);
      const row = (sessions && sessions.byId) ? sessions.byId[sid] : null;
      if (!row) return null;
      const selected = sid === currentSid;
      const subagents = runningSubagents || 0;
      const dotState = sessionState(row, selected, pendingKind, completionUnread, subagents);
      // 空白草稿是「新建会话」占位行，本地化文案由渲染层给（官方同款）。
      const title = row.blank ? "新建会话" : row.displayTitle;
      // 标题被省略号截断：悬停滚到末尾露出尾部（官方同款），原生 tooltip 另带子代理运行数。
      const titleText = subagents > 0 ? title + " · " + subagents + " 个子代理运行中" : title;
      // 归档门槛：自身运行中、等待回复审批、或**后代子代理正在运行**的会话都不允许归档
      // （归档区删除零守卫，因此门槛只需保证「运行态不进区」）。判据读真实数据源——
      // 运行态取 row.running 与快照谱系，等待交互取官方会话状态座位；置灰只是提示，
      // 真正的门槛在 onArchiveSession（那里复查，并再向 Host 要一次 agents 状态）。
      const canArchive = !row.running && !pendingKind && subagents === 0;
      const archiveTitle = canArchive
        ? "移至归档"
        : row.running
          ? "会话运行中（或等待回复/审批），结束后才能归档"
          : subagents > 0
            ? "其后代子代理正在运行，结束后才能归档"
            : "等待处理的交互结束后才能归档";
      const dragActive = !!drag && drag.kind === "session";
      const isDragSource = dragActive && drag.sid === sid;
      // 树模式下同一个组体里混着多个账号（子工作区的行排在父级自己的行前面），
      // 会话顺序又是按账号存的，因此落点只认同一个账号的行——否则标记会亮在
      // 落不进去的地方，松手后什么都没发生。「未分组」「单一列表」同理。
      const droppable = dragActive && !isDragSource && drag.accountKey === accountKey;
      const marker = droppable && drag.over && drag.over.sid === sid ? drag.over.half : null;
      const anchor = h("div", {
        className: "dswt-session"
          + (selected ? " dswt-selected" : "")
          + (marker === "before" ? " dswt-dropBefore" : "")
          + (marker === "after" ? " dswt-dropAfter" : ""),
        "data-sid": sid,
        style: { paddingLeft: 8 + depth * indent },
        role: "treeitem",
        "aria-selected": selected,
        onClick: () => onOpen(sid),
        onPointerEnter: () => revealClippedTitle(titleRef.current, true),
        onPointerLeave: () => revealClippedTitle(titleRef.current, false),
        draggable: drag && !row.blank ? true : undefined,
        onDragStart: (e) => {
          if (!drag || row.blank) return;
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            // Firefox 只有 setData 之后才真的开始拖拽
            e.dataTransfer.setData("text/plain", sid);
          }
          drag.start(sid);
        },
        onDragOver: (e) => {
          if (!droppable || row.blank) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          drag.hover(sid, e.clientY < rect.top + rect.height / 2 ? "before" : "after");
        },
        onDrop: (e) => {
          if (!droppable) return;
          e.preventDefault();
          drag.drop();
        },
        onDragEnd: () => { if (drag) drag.end(); },
        title: titleText
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(SessionDot, { state: dotState })),
        h("span", { key: "ti", ref: titleRef, className: "dswt-title" + (row.blank ? " dswt-blank" : ""), title: titleText }, title),
        hasActiveSchedule(row) && h("span", {
          key: "sc",
          className: "dswt-schedule",
          role: "img",
          "aria-label": "有活动定时任务",
          title: "有活动定时任务"
        }, h(Icon, { name: "alarm", size: 14 })),
        h("span", { key: "tm", className: "dswt-time" }, timeLabel(row.updatedAt, now)),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名", onClick: () => onRename(sid, row.blank ? "" : title) }, h(Icon, { name: "edit", size: 14 })),
          h("button", {
            key: "ar",
            type: "button",
            className: "dswt-iconButton",
            title: archiveTitle,
            disabled: !canArchive,
            onClick: () => canArchive && onArchive(sid)
          }, h(Icon, { name: "archive", size: 14 }))
        ])
      ]);
      return h(HoverCard, {
        anchor,
        content: h(SessionHoverContent, {
          title,
          timeText: row.blank ? "" : hoverTimeLabel(row.updatedAt, now),
          statusLabels: sessionStatusLabels(row, selected, pendingKind, completionUnread, subagents)
        }),
        disabled: dragActive,
        copyText: row.blank ? undefined : title,
        copyLabel: "复制标题",
        copiedLabel: "已复制"
      });
    }

    // ══════════════ 重命名弹窗（会话/工作区 共用） ══════════════
    function RenameModal({ open, kind, initialTitle, draft, busy, onDraftChange, onCancel, onConfirm }) {
      const title = kind === "workspace" ? "重命名工作区" : "重命名会话";
      const trimmed = (draft || "").trim();
      const initialTrim = (initialTitle || "").trim();
      const canConfirm = !busy && trimmed.length > 0 && trimmed !== initialTrim;
      return h(Modal, {
        open: !!open,
        onClose: () => { if (!busy) onCancel(); },
        title,
        closeLabel: "关闭",
        description: kind === "workspace" ? "输入新的工作区名称" : "输入新的会话名称",
        footer: [
          h(Button, { key: "c", variant: "outline", size: "sm", disabled: !!busy, onClick: onCancel }, "取消"),
          h(Button, { key: "o", variant: "primary", size: "sm", disabled: !canConfirm, onClick: onConfirm }, busy ? "保存中…" : "确认")
        ]
      }, h(Input, {
        className: "dswt-fieldInput",
        value: draft,
        placeholder: kind === "workspace" ? "工作区名称" : "会话名称",
        disabled: !!busy,
        autoFocus: true,
        onFocus: (e) => e.target.select(),
        onChange: (e) => onDraftChange(e.target.value),
        onKeyDown: (e) => { if (e.key === "Enter" && canConfirm) { e.preventDefault(); onConfirm(); } }
      }));
    }

    // ══════════════ 归档视图：会话行 ══════════════
    function ArchiveSessionRow({ sid, sessions, onOpen, onRestore, onDelete, busy, currentSid }) {
      const titleRef = useRef(null);
      const row = (sessions && sessions.byId) ? sessions.byId[sid] : null;
      if (!row) return null;
      const selected = currentSid !== undefined ? String(currentSid) === String(sid) : !!sessions && currentSessionIdOf(sessions) === sid;
      return h("div", {
        className: "dswt-session dswt-archivedRow" + (selected ? " dswt-selected" : ""),
        role: "treeitem",
        "aria-selected": selected,
        title: row.displayTitle,
        onClick: () => { if (!busy && onOpen) onOpen(sid); },
        onPointerEnter: () => revealClippedTitle(titleRef.current, true),
        onPointerLeave: () => revealClippedTitle(titleRef.current, false)
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(SessionDot, { state: sessionState(row, selected) })),
        h("span", { key: "ti", ref: titleRef, className: "dswt-title", title: row.displayTitle }, row.displayTitle),
        h("span", { key: "tm", className: "dswt-time" }, timeLabel(row.updatedAt, Date.now())),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "rs", type: "button", className: "dswt-iconButton", title: "恢复", disabled: !!busy, onClick: () => { if (!busy) onRestore(sid); } }, h(Icon, { name: "restore", size: 14 })),
          h("button", { key: "del", type: "button", className: "dswt-iconButton dswt-danger", title: "永久删除", disabled: !!busy, onClick: () => { if (!busy) onDelete(sid); } }, h(Icon, { name: "trash", size: 14 }))
        ])
      ]);
    }

    // ══════════════ 统一内部确认弹窗 ══════════════
    function ConfirmModal({ open, title, desc, confirmText, cancelText, danger, busy, onCancel, onConfirm }) {
      return h(Modal, {
        open: !!open,
        onClose: () => { if (!busy) onCancel(); },
        title: title || "确认",
        closeLabel: "关闭",
        description: desc || "",
        footer: [
          h(Button, { key: "c", variant: "outline", size: "sm", disabled: !!busy, onClick: onCancel }, cancelText || "取消"),
          h(Button, { key: "o", variant: danger ? "outline" : "primary", size: "sm", className: danger ? "dswt-dangerBtn" : undefined, disabled: !!busy, onClick: onConfirm }, busy ? "处理中…" : (confirmText || "确认"))
        ]
      });
    }

    // ══════════════ 统一内部提示/通知弹窗 ══════════════
    function AlertModal({ open, title, desc, onConfirm }) {
      return h(Modal, {
        open: !!open,
        onClose: onConfirm,
        title: title || "提示",
        closeLabel: "关闭",
        description: desc || "",
        footer: h(Button, { variant: "primary", size: "sm", onClick: onConfirm }, "知道了")
      });
    }

    // ══════════════ 目录选择弹窗（browse 面自持） ══════════════
    /**
     * 官方目录选择是「一种能力、两种交互」（@deepseek-ai/dsh-host-directory-picker）：
     *  - native：uiWorkspace.pickDirectory() 在宿主显示器上开系统选择器，只在回环绑定
     *    （非 SSH、Linux 有可用选择器）时才挂载；
     *  - browse：绑定 0.0.0.0 / 远端 / SSH 时 host 只挂 browse 后端，目录面只剩
     *    listDirectory / createDirectory 两个原语（官方由内置浏览对话框驱动）。
     *
     * 内核「添加工作区只有一条路」以 sidebar.workspaces.directoryFlow 子槽承载交互，而
     * 本插件以 priority -1 顶掉了那个承载者（内核 WorkspaceBrowser），官方对话框便无处
     * 渲染；本插件也不能自己声明该子槽——内核的槽位声明账本（SlotCore.register：
     * `slot "…" is already declared`）一个子槽只允许一个 entry 声明，而被顶掉的内核
     * entry 仍然注册着、仍然持有声明。故本插件自持这个等价对话框，且只架在官方 browse
     * 原语之上：native 主机走系统选择器，browse 主机走这里。
     */
    function DirectoryPickerModal({ open, busy, initialListing, listDirectory, createDirectory, onCancel, onPicked }) {
      const [listing, setListing] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      /** null = 未在新建；字符串 = 新文件夹名草稿。 */
      const [newName, setNewName] = useState(null);
      const [creating, setCreating] = useState(false);
      const [pathDraft, setPathDraft] = useState("");
      /** 已消费的那份首屏种子（同一份只吃一次，避免重渲染把它当成新导航）。 */
      const seedUsed = useRef(null);

      /** 拉取一个层级（缺省 = host 的 home）；失败就地显示，不弹窗、不关窗。 */
      const readLevel = useCallback(async (target) => {
        if (typeof listDirectory !== "function") {
          setError("当前 DSH 版本不支持目录浏览（uiWorkspace.listDirectory）；可在文件夹模式用「添加为工作区」，或升级 DSH。");
          return;
        }
        setLoading(true);
        setError("");
        try {
          const next = await listDirectory(target);
          if (next && typeof next.path === "string") {
            setListing(next);
            setPathDraft(next.path);
          } else {
            setError("目录列表返回了无法识别的结果");
          }
        } catch (e) {
          setError("无法读取目录：" + String((e && e.message) || e));
        } finally {
          setLoading(false);
        }
      }, [listDirectory]);

      useEffect(() => {
        if (!open) {
          // 关闭即清空：下次打开重新从 home 起，不残留上一次的层级、草稿与错误。
          setListing(null);
          setError("");
          setNewName(null);
          seedUsed.current = null;
          return;
        }
        // 打开前已探到的一层（调用方为确认 browse 可用而拉的 home）直接作首屏。
        if (initialListing && seedUsed.current !== initialListing && typeof initialListing.path === "string") {
          seedUsed.current = initialListing;
          setListing(initialListing);
          setPathDraft(initialListing.path);
          setError("");
          return;
        }
        readLevel(void 0);
      }, [open, initialListing, readLevel]);

      const crumbs = (listing && Array.isArray(listing.crumbs)) ? listing.crumbs : [];
      const entries = (listing && Array.isArray(listing.entries)) ? listing.entries : [];
      const parent = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : null;
      const currentPath = (listing && typeof listing.path === "string") ? listing.path : "";
      const locked = !!busy || creating;
      const canCreate = typeof createDirectory === "function";

      /** 在当前层新建文件夹，建成后直接进入它（与官方浏览对话框的落点语义一致）。 */
      const commitNewDir = async () => {
        const dirName = (newName || "").trim();
        if (dirName === "" || creating || !canCreate || currentPath === "") return;
        setCreating(true);
        setError("");
        try {
          const created = await createDirectory(currentPath, dirName);
          setNewName(null);
          await readLevel((typeof created === "string" && created !== "") ? created : currentPath);
        } catch (e) {
          setError("新建文件夹失败：" + String((e && e.message) || e));
        } finally {
          setCreating(false);
        }
      };

      const rowNodes = entries.map((entry, i) => h("button", {
        key: "d" + (entry.path || entry.name || i),
        type: "button",
        className: "dswt-pickerRow" + (entry.hidden ? " dswt-pickerRowHidden" : ""),
        title: entry.path || entry.name,
        disabled: locked || loading,
        onClick: () => readLevel(entry.path)
      }, [
        h(Icon, { key: "i", name: "folderOpen", size: 15 }),
        h("span", { key: "n", className: "dswt-pickerRowName" }, entry.name)
      ]));

      const crumbNodes = crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return h("button", {
          key: "c" + (crumb.path || i),
          type: "button",
          className: "dswt-crumb" + (isLast ? " dswt-crumbActive" : ""),
          title: crumb.path,
          disabled: locked || loading || isLast,
          onClick: () => { if (!isLast) readLevel(crumb.path); }
        }, crumb.name || crumb.path);
      });

      const newDirControl = newName === null
        ? h(Button, {
            key: "nf",
            variant: "ghost",
            size: "sm",
            title: canCreate ? "在当前位置新建文件夹并进入" : "当前 DSH 版本不支持新建文件夹",
            disabled: locked || loading || currentPath === "" || !canCreate,
            onClick: () => setNewName("")
          }, "新建文件夹")
        : h("span", { key: "nf", className: "dswt-pickerNewDir" }, [
            h(Input, {
              key: "i",
              className: "dswt-fieldInput dswt-pickerNewInput",
              value: newName,
              placeholder: "新文件夹名称",
              spellCheck: false,
              autoFocus: true,
              disabled: creating,
              onChange: (e) => setNewName(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") { e.preventDefault(); commitNewDir(); }
                else if (e.key === "Escape") { e.stopPropagation(); setNewName(null); }
              }
            }),
            h(Button, {
              key: "ok",
              variant: "primary",
              size: "sm",
              disabled: creating || (newName || "").trim() === "",
              onClick: commitNewDir
            }, creating ? "创建中…" : "创建"),
            h(Button, { key: "no", variant: "ghost", size: "sm", disabled: creating, onClick: () => setNewName(null) }, "取消")
          ]);

      return h(Modal, {
        open: !!open,
        onClose: () => { if (!locked) onCancel(); },
        title: "添加工作区",
        closeLabel: "关闭",
        className: "dswt-pickerPanel",
        footer: [
          newDirControl,
          h("span", { key: "sp", className: "dswt-pickerSpacer" }),
          h(Button, { key: "c", variant: "outline", size: "sm", disabled: locked, onClick: onCancel }, "取消"),
          h(Button, {
            key: "o",
            variant: "primary",
            size: "sm",
            title: currentPath,
            disabled: locked || loading || currentPath === "",
            onClick: () => onPicked(currentPath)
          }, busy ? "添加中…" : "选择此文件夹")
        ]
      }, [
        crumbs.length > 0 && h("div", { key: "c", className: "dswt-pickerCrumbs" }, [
          parent && h("button", {
            key: "up",
            type: "button",
            className: "dswt-crumb dswt-crumbUp",
            title: "上一级：" + parent.path,
            disabled: locked || loading,
            onClick: () => readLevel(parent.path)
          }, "↑")
        ].concat(crumbNodes).filter(Boolean)),
        h("div", { key: "p", className: "dswt-pickerPathRow" }, [
          h(Input, {
            key: "i",
            className: "dswt-fieldInput dswt-pickerPathInput",
            value: pathDraft,
            placeholder: "绝对路径，回车前往",
            spellCheck: false,
            disabled: locked,
            onChange: (e) => setPathDraft(e.target.value),
            onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); readLevel(pathDraft.trim()); } }
          }),
          h(Button, {
            key: "g",
            variant: "ghost",
            size: "sm",
            disabled: locked || pathDraft.trim() === "",
            onClick: () => readLevel(pathDraft.trim())
          }, "前往")
        ]),
        h("div", { key: "l", className: "dswt-pickerList", role: "listbox", "aria-label": "目录" },
          entries.length === 0
            ? [h("div", { key: "e", className: "dswt-pickerEmpty" }, loading ? "读取中…" : "此目录下没有子文件夹")]
            : rowNodes
        ),
        error !== "" && h("div", { key: "err", className: "dswt-pickerError", role: "alert" }, error)
      ]);
    }

    // ══════════════ 归档视图：按工作区分组（深度递归收集，全量展示） ══════════════
    /**
     * 归档集合是注册表全局的：官方 workspace/archiveSession 明确「工作区归属可有可无」，
     * 归档只往 archivedSessionIds 追加、从不改 sessionIds。本插件的自动收编又对已归档
     * 会话显式跳过（见下方 effect），于是「无归属的归档会话」会长期存在，必须单独成组，
     * 否则官方「已归档会话」可见、本插件归档区却永远看不到。
     */
    function ArchiveView({ sessions, wsForest, archived, hardDeleted, currentSid, onOpen, onRestoreOne, onDeleteOne, onRestoreGroup, onDeleteGroup, onRestoreAll, onDeleteAll, busy }) {
      const byId = (sessions && sessions.byId) || {};

      const allGroups = [];
      (function traverseForest(forest) {
        for (const node of forest || []) {
          const sids = (node.w.sessionIds || []).filter((id) => archivedSessionVisible(byId[id], archived, hardDeleted));
          if (sids.length > 0) {
            allGroups.push({
              key: "ws:" + String(node.w.workspaceId),
              workspaceId: node.w.workspaceId,
              title: node.w.title || baseName(node.w.path),
              sids
            });
          }
          if (node.children && node.children.length > 0) {
            traverseForest(node.children);
          }
        }
      })(wsForest);

      // 「未分组」：归档集合里不属于任何工作区 sessionIds 的会话。顺序沿用官方列表
      // （sessions.ids），与 onConfirmArchiveConfirm 的 deleteGroup(null) 口径一致。
      const accounted = new Set();
      (function collectAccounted(forest) {
        for (const node of forest || []) {
          for (const sid of node.w.sessionIds || []) accounted.add(String(sid));
          if (node.children && node.children.length > 0) collectAccounted(node.children);
        }
      })(wsForest);
      const ungroupedSids = (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])
        .map(String)
        .filter((sid) => !accounted.has(sid) && archivedSessionVisible(byId[sid], archived, hardDeleted));
      if (ungroupedSids.length > 0) {
        allGroups.push({ key: "ungrouped", workspaceId: null, title: "未分组", sids: ungroupedSids });
      }

      const total = allGroups.reduce((acc, g) => acc + g.sids.length, 0);
      const hasAny = total > 0;

      // v1.9.0：无幽灵/失效提示行——失效归档（官方列表已不再返回的 ID）由主组件
      // 进入归档区时自动调用 /archive/pruneStale 静默清理（见 WorkspaceTreeBrowser），
      // 工作区幽灵由官方注册表的 header 校验在启动时自动收敛。

      return h("div", { className: "dswt-archiveRoot" }, [
        h("div", { key: "tb", className: "dswt-archiveToolbar" }, [
          h("div", { key: "top", className: "dswt-archiveToolbarTop" }, [
            h("span", { key: "ct", className: "dswt-archiveCount" }, hasAny ? ("共 " + total + " 条有效归档") : "暂无归档会话")
          ]),
          hasAny && h("div", { key: "actions", className: "dswt-archiveToolbarActions" }, [
            h("button", { key: "ra", type: "button", className: "dswt-archiveBtn dswt-archiveBtnSecondary", disabled: !!busy, title: "一键恢复所有", onClick: onRestoreAll }, "一键恢复所有"),
            h("button", { key: "da", type: "button", className: "dswt-archiveBtn dswt-archiveBtnDanger", disabled: !!busy, title: "一键删除所有", onClick: onDeleteAll }, "一键删除所有")
          ])
        ]),
        hasAny ? null : h("div", { key: "empty", className: "dswt-empty" }, "归档区为空 — 归档的会话会在此分组显示（无归属者归入「未分组」）"),
        allGroups.map((group) => h("div", { key: group.key, className: "dswt-groupSection" }, [
          h("div", { key: "hd", className: "dswt-projectRow" }, [
            h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" }, h(Icon, { name: "folderOpen", size: 16, className: "dswt-folderSvg" })),
            h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, group.title + " · " + group.sids.length + " 条")),
            h("span", { key: "ac", className: "dswt-rowActions", style: { display: "inline-flex" } }, [
              h("button", { key: "rs", type: "button", className: "dswt-iconButton", title: group.workspaceId === null ? "恢复未分组全部" : "恢复该工作区全部", disabled: !!busy, onClick: () => onRestoreGroup(group.workspaceId) }, h(Icon, { name: "restore", size: 14 })),
              h("button", { key: "dl", type: "button", className: "dswt-iconButton dswt-danger", title: group.workspaceId === null ? "永久删除未分组全部" : "永久删除该工作区全部", disabled: !!busy, onClick: () => onDeleteGroup(group.workspaceId) }, h(Icon, { name: "trash", size: 14 }))
            ])
          ]),
          h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": "16px" } }, group.sids.map((sid) => h(ArchiveSessionRow, { key: sid, sid, sessions, busy, currentSid, onOpen, onRestore: onRestoreOne, onDelete: onDeleteOne })))
        ]))
      ]);
    }

    /** 从森林里找出到达某个工作区的路径（含自身）；不在森林里返回空数组。 */
    function workspacePathTo(forest, workspaceId) {
      const target = String(workspaceId);
      const walk = (nodes, trail) => {
        for (const node of nodes || []) {
          const key = String(node.w.workspaceId);
          const next = trail.concat([key]);
          if (key === target) return next;
          const found = walk(node.children, next);
          if (found) return found;
        }
        return null;
      };
      return walk(forest, []) || [];
    }

    /** Hover 卡里的绝对创建时间（本地年月日，官方 date.ymd 口径）。 */
    function createdLabel(createdAt) {
      const d = new Date(createdAt);
      const pad = (v) => String(v).padStart(2, "0");
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    /**
     * 该部署压根没开内容检索时的两条固定说法（Host 侧原话）：`openAt: "never"` 的
     * sqlite 索引，以及没有挂载 session-query。这是部署能力，不是故障，因此静默降级为
     * 只做本地匹配；其余失败照常提示。
     */
    const SEARCH_DISABLED_MESSAGES = [
      "session search is disabled",
      "does not mount @deepseek-ai/dsh-session-query"
    ];
    function searchDisabledMessage(message) {
      const text = String(message || "");
      return SEARCH_DISABLED_MESSAGES.some((needle) => text.includes(needle));
    }

    /**
     * 搜索投影：本地「标题 / 工作区名」子串命中即时可见，Host 内容命中（带片段）随后合并。
     * 归档、subagent、空白草稿与当前不可见的行不参与搜索（官方口径）。
     */
    function deriveSearchResults(sessions, workspaces, archived, hardDeleted, currentSid, query, content, limit) {
      const needle = query.toLowerCase();
      const byId = (sessions && sessions.byId) || {};
      const items = content && Array.isArray(content.items) ? content.items : [];
      const snippetById = new Map();
      for (const item of items) {
        const id = String(item && item.sessionId !== undefined ? item.sessionId : "");
        if (id !== "") snippetById.set(id, String((item && item.snippet) || ""));
      }
      const labelById = new Map();
      for (const w of workspaces || []) {
        for (const sid of w.sessionIds || []) {
          labelById.set(String(sid), w.title || baseName(w.path));
        }
      }
      const hits = [];
      const seen = new Set();
      const consider = (rawId) => {
        const sid = String(rawId);
        if (seen.has(sid)) return;
        const row = byId[sid];
        if (!sessionVisible(row, currentSid, archived, hardDeleted) || row.blank) return;
        const workspaceLabel = labelById.has(sid) ? labelById.get(sid) : "未分组";
        const title = row.displayTitle || sid;
        const snippet = snippetById.has(sid) ? snippetById.get(sid) : "";
        const local = title.toLowerCase().includes(needle) || workspaceLabel.toLowerCase().includes(needle);
        if (!local && snippet === "") return;
        seen.add(sid);
        hits.push({ id: sid, title, workspace: workspaceLabel, snippet, local });
      };
      for (const id of (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])) consider(id);
      for (const id of snippetById.keys()) consider(id);
      hits.sort((a, b) => (a.local === b.local ? 0 : a.local ? -1 : 1));
      const cap = typeof limit === "number" && limit > 0 ? limit : 20;
      return hits.slice(0, cap);
    }

    /**
     * 视图选项菜单：分组方式（官方三档）与排序方式（最近更新 / 手动）。
     * 用官方 `Menu` 且 `portal: true`——头部为裁掉标题切换动画而 `overflow: hidden`，
     * 就地渲染的下拉会被裁掉；portal 模式按锚点定位并挂在 body 上，不受裁切与层叠影响。
     */
    function ViewOptionsMenu({ groupBy, orderBy, onGroupPick, onOrderPick }) {
      const [open, setOpen] = useState(false);
      return h(Menu, {
        open,
        onClose: () => setOpen(false),
        items: [
          { type: "label", id: "group-by", text: "分组方式" },
          { id: GROUP_BY.workspace, label: "按工作区" },
          { id: GROUP_BY.workspaceTree, label: "工作区树" },
          { id: GROUP_BY.flat, label: "单一列表" },
          { type: "separator", id: "order-by-separator" },
          { type: "label", id: "order-by", text: "排序方式" },
          { id: "manual", label: "手动" },
          { id: "updated", label: "最近更新" }
        ],
        selectedIds: [groupBy, orderBy],
        onSelect: (id) => {
          if (id === GROUP_BY.workspace || id === GROUP_BY.workspaceTree || id === GROUP_BY.flat) onGroupPick(id);
          else if (id === "manual" || id === "updated") onOrderPick(id);
          setOpen(false);
        },
        align: "end",
        dense: true,
        portal: true,
        anchor: h("button", {
          type: "button",
          className: "dswt-headBtn" + (open ? " dswt-headBtnActive" : ""),
          title: "视图选项",
          "aria-label": "视图选项",
          "aria-expanded": open,
          onClick: () => setOpen((v) => !v)
        }, h(Icon, { name: "options", size: 16 }))
      });
    }

    // ══════════════ 工作区模式：组 ══════════════
    /**
     * 一个工作区分组：标题行（Hover 卡 + 拖拽）+ 组体。
     * 组体顺序照官方：先子工作区，再本工作区自己的会话，最后是「展开其余」按钮。
     * 折叠状态、每组会话上限、会话顺序都由视图状态决定（官方同款）。
     */
    function WorkspaceGroup({ node, depth, indent, sessions, sessionStatus, lineage, archived, hardDeleted, view, currentSid, currentGroupKey, ancestorKeys, onNewSession, onAddWorkspaceIn, onOpenInIde, onRenameWs, onHideWs, onOpen, onRenameSession, onArchiveSession, onToggleGroup, onToggleSessions, drag, now }) {
      const w = node.w;
      const gkey = String(w.workspaceId);
      const groupOpen = !view.collapsed.includes(gkey);
      const byId = (sessions && sessions.byId) || {};
      const sids = accountOrder(gkey, visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted, currentSid), sessions, view, currentSid);
      const hasContent = sids.length > 0 || (node.children && node.children.length > 0);
      const containsCurrent = gkey === (currentGroupKey === null ? null : String(currentGroupKey));
      // 文件夹高亮 = 当前会话所在的工作区本身或它的祖先（官方 containsCurrent/containsCurrentDescendant）。
      const folderActive = ancestorKeys.has(gkey) || (groupOpen && containsCurrent);
      const sessionsExpanded = view.expandedSessions.includes(gkey);
      const collapsed = collapsedSessionRows(sids, byId);
      const label = w.title || baseName(w.path);

      const headerNode = h("div", {
        className: "dswt-projectRow",
        "data-wsid": gkey,
        style: { paddingLeft: 8 + depth * indent },
        role: "treeitem",
        "aria-expanded": groupOpen,
        onClick: () => onToggleGroup(gkey),
        draggable: drag ? true : undefined,
        onDragStart: (e) => {
          if (!drag) return;
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", gkey);
          }
          drag.startWs(gkey);
        },
        onDragOver: (e) => {
          if (!drag || drag.kind !== "ws" || drag.wsId === gkey) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          drag.hoverWs(gkey, e.clientY < rect.top + rect.height / 2 ? "before" : "after");
        },
        onDrop: (e) => {
          if (!drag || drag.kind !== "ws" || drag.wsId === gkey) return;
          e.preventDefault();
          drag.dropWs();
        },
        onDragEnd: () => { if (drag) drag.end(); }
      }, [
        h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" + (folderActive ? " dswt-folderActive" : "") }, [
          h(Icon, { name: folderIconFor(node.aggHasSessions), size: 16, className: "dswt-folderSvg" }),
          hasContent && h("span", { className: "dswt-chevronOverlay" + (groupOpen ? " dswt-arrowOpen" : "") }, h(Icon, { name: "chevron", size: 12 }))
        ]),
        h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, label)),
        node.aggState && h("span", { key: "ag", className: "dswt-slot dswt-aggSlot", title: node.aggState === "warning" ? "有待处理交互" : node.aggState === "ongoing" ? "有会话运行中" : "有会话已完成" }, h(SessionDot, { state: node.aggState, size: 8 })),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "ide", type: "button", className: "dswt-iconButton", title: "在 IDE 中打开此工作区", onClick: () => onOpenInIde && onOpenInIde(w.path) }, h(Icon, { name: "ide", size: 14 })),
          h("button", { key: "ns", type: "button", className: "dswt-iconButton", title: "新建会话", onClick: () => onNewSession(w.workspaceId) }, h(Icon, { name: "newChat", size: 14 })),
          h("button", { key: "aw", type: "button", className: "dswt-iconButton", title: "添加工作区（从该工作区目录开始选择）", onClick: () => onAddWorkspaceIn && onAddWorkspaceIn(w) }, h(Icon, { name: "folderPlus", size: 14 })),
          h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名工作区", onClick: () => onRenameWs(w) }, h(Icon, { name: "edit", size: 14 })),
          h("button", { key: "hd", type: "button", className: "dswt-iconButton", title: "移除工作区显示（不删除注册，会话归属不变，重新添加该目录后恢复）", onClick: () => onHideWs && onHideWs(w) }, h(Icon, { name: "minus", size: 14 }))
        ])
      ]);

      const marker = drag && drag.kind === "ws" && drag.over && drag.over.wsId === gkey && drag.wsId !== gkey ? drag.over.half : null;
      const header = h("div", {
        className: (marker === "before" ? "dswt-dropBefore" : "") + (marker === "after" ? " dswt-dropAfter" : "")
      }, headerNode);

      const children = node.children || [];
      return h("div", {
        className: "dswt-groupSection",
        "data-wsid": gkey
      }, [
        w.createdAt === undefined ? header : h(HoverCard, {
          key: "hc",
          anchor: header,
          content: h("div", { className: "dswt-hoverContent" }, [
            h("div", { key: "t", className: "dswt-hoverTitle" }, label),
            h("div", { key: "p", className: "dswt-hoverPath" }, w.path),
            h("div", { key: "c", className: "dswt-hoverMeta" }, "创建于 " + createdLabel(w.createdAt))
          ]),
          disabled: !!(drag && drag.kind === "ws"),
          copyText: w.path,
          copyLabel: "复制路径",
          copiedLabel: "已复制"
        }),
        groupOpen && h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": (16 + depth * indent) + "px" } }, [
          children.map((child) => h(WorkspaceGroup, {
            key: child.w.workspaceId, node: child, depth: depth + 1, indent, sessions, sessionStatus, lineage, archived, hardDeleted,
            view, currentSid, currentGroupKey, ancestorKeys,
            onNewSession, onAddWorkspaceIn, onOpenInIde, onRenameWs, onHideWs,
            onOpen, onRenameSession, onArchiveSession, onToggleGroup, onToggleSessions, drag, now
          })),
          (sessionsExpanded ? sids : collapsed.rows).map((sid) => h(SessionRow, {
            key: "s:" + sid, sid, sessions, depth: depth + 1, indent, now, currentSid, accountKey: gkey, onOpen, drag,
            pendingKind: pendingKindOf(sessionStatus, sid), completionUnread: completionUnreadOf(sessionStatus, sid),
            runningSubagents: runningSubagentsOf(lineage, sid),
            onRename: onRenameSession, onArchive: onArchiveSession
          })),
          collapsed.hiddenCount > 0 && h("button", {
            key: "more",
            type: "button",
            className: "dswt-moreBtn",
            "aria-expanded": sessionsExpanded,
            style: { paddingLeft: 8 + (depth + 1) * indent },
            onClick: () => onToggleSessions(gkey)
          }, sessionsExpanded ? "收起" : "展开其余 " + collapsed.hiddenCount + " 个会话")
        ])
      ]);
    }

    // ══════════════ 工作区模式：未分组 ══════════════
    /**
     * 「未分组」：官方列表里不属于任何已注册工作区的会话。插件不替用户收编，
     * 这些会话照官方语义原样落在这一组，折叠与每组上限与其他组同一套规则。
     */
    function UngroupedGroup({ sids, sessions, sessionStatus, lineage, indent, now, currentSid, view, onOpen, onRenameSession, onArchiveSession, onToggleGroup, onToggleSessions, drag }) {
      if (!sids || sids.length === 0) return null;
      const byId = (sessions && sessions.byId) || {};
      const ordered = accountOrder(UNGROUPED_KEY, sids, sessions, view, currentSid);
      const groupOpen = !view.collapsed.includes(UNGROUPED_KEY);
      const sessionsExpanded = view.expandedSessions.includes(UNGROUPED_KEY);
      const collapsed = collapsedSessionRows(ordered, byId);
      return h("div", { className: "dswt-groupSection" }, [
        h("div", {
          key: "hd",
          className: "dswt-projectRow",
          role: "treeitem",
          "aria-expanded": groupOpen,
          onClick: () => onToggleGroup(UNGROUPED_KEY)
        }, [
          h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" }, [
            h(Icon, { name: "folderOpenOutline", size: 16, className: "dswt-folderSvg" }),
            h("span", { className: "dswt-chevronOverlay" + (groupOpen ? " dswt-arrowOpen" : "") }, h(Icon, { name: "chevron", size: 12 }))
          ]),
          h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, "未分组 · " + ordered.length + " 条"))
        ]),
        groupOpen && h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": "16px" } }, [
          (sessionsExpanded ? ordered : collapsed.rows).map((sid) => h(SessionRow, {
            key: "s:" + sid, sid, sessions, depth: 1, indent, now, currentSid, accountKey: UNGROUPED_KEY, onOpen, drag,
            pendingKind: pendingKindOf(sessionStatus, sid), completionUnread: completionUnreadOf(sessionStatus, sid),
            runningSubagents: runningSubagentsOf(lineage, sid),
            onRename: onRenameSession, onArchive: onArchiveSession
          })),
          collapsed.hiddenCount > 0 && h("button", {
            key: "more",
            type: "button",
            className: "dswt-moreBtn",
            "aria-expanded": sessionsExpanded,
            style: { paddingLeft: 8 + indent },
            onClick: () => onToggleSessions(UNGROUPED_KEY)
          }, sessionsExpanded ? "收起" : "展开其余 " + collapsed.hiddenCount + " 个会话")
        ])
      ]);
    }

    // ══════════════ 工作区模式：单一列表（官方 groupBy: flat） ══════════════
    function FlatList({ sids, sessions, sessionStatus, lineage, now, currentSid, view, onOpen, onRenameSession, onArchiveSession, drag }) {
      const ordered = accountOrder(FLAT_KEY, sids, sessions, view, currentSid);
      if (ordered.length === 0) return null;
      return h("div", { className: "dswt-flatList" }, ordered.map((sid) => h(SessionRow, {
        key: "s:" + sid, sid, sessions, depth: 0, indent: INDENT, now, currentSid, accountKey: FLAT_KEY, onOpen, drag,
        pendingKind: pendingKindOf(sessionStatus, sid), completionUnread: completionUnreadOf(sessionStatus, sid),
        runningSubagents: runningSubagentsOf(lineage, sid),
        onRename: onRenameSession, onArchive: onArchiveSession
      })));
    }

    // ══════════════ 搜索结果 ══════════════
    /**
     * 一条结果：标题 + 工作区名 +（内容命中时）片段。选择结果只打开会话并清空搜索，
     * 不定位到具体事件（官方同款）。
     */
    function SearchResultRow({ result, sessions, sessionStatus, lineage, currentSid, onOpen }) {
      const dotState = sessionState(result, result.id === currentSid, pendingKindOf(sessionStatus, result.id), completionUnreadOf(sessionStatus, result.id), runningSubagentsOf(lineage, result.id));
      return h("button", {
        type: "button",
        className: "dswt-searchRow" + (result.id === currentSid ? " dswt-selected" : ""),
        "data-sid": result.id,
        onClick: () => onOpen(result.id)
      }, [
        h("span", { key: "h", className: "dswt-searchHead" }, [
          dotState !== "done" && h(SessionDot, { key: "d", state: dotState, size: 10 }),
          h("span", { key: "t", className: "dswt-searchTitle" }, result.title)
        ]),
        h("span", { key: "m", className: "dswt-searchMeta" }, [
          h("span", { key: "w", className: "dswt-searchWs" }, result.workspace),
          result.snippet !== "" && h("span", { key: "s", className: "dswt-searchSnippet" }, result.snippet)
        ])
      ]);
    }

    // ══════════════ 主组件 ══════════════
    function WorkspaceTreeBrowser(props) {
      const { wide, useSessions, useWorkspaces, useSessionStatus, usePanelInfo, liveSessionRow, startSession, open, clearSession, renameSession, renameWorkspace, archiveSession, unarchiveSession, createWorkspace, deleteWorkspace, insertWorkspaceBefore, searchSessions, searchResultLimit, pickDirectory, listDirectory, createDirectory, refreshSessions } = props;
      const sessions = useSessions((s) => s);
      const workspaces = useWorkspaces((s) => s);
      // 官方会话状态座位（数据源在 dsh-client-ui-session：运行中 / 待处理交互 /
      // 完成未读，Map<SessionId, { running, pendingInteraction, completionUnread }>）。
      const sessionStatus = typeof useSessionStatus === "function"
        ? useSessionStatus((s) => s)
        : null;
      /**
       * 全局面板打开时主视图会话不算「当前」（官方 usePanelInfo 口径）：选中高亮熄灭，
       * 只跟着当前会话显示的空白草稿行一并隐藏。搜索框与目录选择器不改变面板态。
       */
      const panelActive = typeof usePanelInfo === "function"
        ? usePanelInfo((info) => info && info.activePanelId !== null)
        : false;
      const currentSid = panelActive ? null : currentSessionIdOf(sessions);

      /** 视图：工作区 / 归档区（模式偏好不持久化）。 */
      const [mode, setMode] = useState("workspace");
      const [view, setView] = useState(loadViewState);
      const [searchOpen, setSearchOpen] = useState(false);
      const [query, setQuery] = useState("");
      /** 内容检索结果：null = 无内容命中（或尚未回包）；{error} = 检索本身失败。 */
      const [contentSearch, setContentSearch] = useState(null);
      /** 该部署把内容检索关掉了（能力事实，不是故障）：此后只做本地匹配，也不再提示。 */
      const [contentSearchOff, setContentSearchOff] = useState(false);
      const [searchPending, setSearchPending] = useState(false);
      const [drag, setDrag] = useState(null);
      /** 搜索结果选中后要滚进视野的会话 ID。 */
      const [revealSid, setRevealSid] = useState(null);
      const [swapFrom, setSwapFrom] = useState(null);
      const [renameTarget, setRenameTarget] = useState(null);
      const [renameDraft, setRenameDraft] = useState("");
      const [renameBusy, setRenameBusy] = useState(false);
      // 同 tick 重入锁（state 更新异步，连续两次调用之间读不到最新 busy）
      const renameLockRef = useRef(false);
      const archiveLockRef = useRef(false);
      const [archiveConfirm, setArchiveConfirm] = useState(null);
      const [archiveBusy, setArchiveBusy] = useState(false);
      const [deleteWsConfirm, setDeleteWsConfirm] = useState(null);
      const [hideWsBusy, setHideWsBusy] = useState(false);
      const hideWsLockRef = useRef(false);
      const [alertInfo, setAlertInfo] = useState(null);
      // 内置目录对话框（browse 面）：官方 native 选择器不可用时的等价交互；
      // pickerSeed 是打开对话框前探到的那一层列表，直接作为首屏（不再二次拉取）。
      const [pickerOpen, setPickerOpen] = useState(false);
      const [pickerBusy, setPickerBusy] = useState(false);
      const [pickerSeed, setPickerSeed] = useState(null);

      /** 收回内置目录对话框（首屏种子一并丢弃，下次重新探测）。 */
      const closeDirectoryPicker = useCallback(() => {
        setPickerOpen(false);
        setPickerSeed(null);
      }, []);

      // macOS 原生 Finder 选择器：宿主侧 /picker/native 报告可用性（仅 darwin 为 true），
      // 不可用（含旧版宿主半边没有该路由）时不显示按钮。
      const [nativePicker, setNativePicker] = useState(false);
      const [nativeBusy, setNativeBusy] = useState(false);
      useEffect(() => {
        let alive = true;
        apiGet("/picker/native").then((result) => {
          if (alive && result && result.ok === true && result.supported === true) setNativePicker(true);
        }).catch(() => { /* 旧版宿主半边：保持隐藏 */ });
        return () => { alive = false; };
      }, []);

      const [hardDeleted, setHardDeleted] = useState(() => loadSet(LS_DELETED));
      const [hiddenWs, setHiddenWs] = useState(() => loadSet(LS_HIDDEN_WS));
      const [cfg, setCfg] = useState(getEffectiveConfig);

      const showAlert = useCallback((desc, title = "提示") => {
        setAlertInfo({ title, desc: String(desc || "") });
      }, []);
      const now = Date.now();

      // 配置订阅：LS 修改（回退路径/缓存同步）与 Host settings 修改实时刷新；
      // Host 就绪时以 Host 值为准。scope 可能晚于组件挂载出现，故每轮 render
      // 比对身份，变化时手动重订阅（本 effect 恒返回 undefined，释放由 ref 管理，
      // 避免无依赖 effect 的自动 cleanup 误杀订阅）；迁移由标记保证只跑一次。
      const boundScopeRef = useRef(null);
      const scopeUnsubRef = useRef(null);
      useEffect(() => subscribeConfig((next) => {
        const snap = safeScopeSnapshot(resolveSettingsScope());
        if (snap) setCfg(scopeValueToConfig(snap.value));
        else setCfg(next);
      }), []);
      useEffect(() => () => {
        if (scopeUnsubRef.current) {
          try { scopeUnsubRef.current(); } catch { /* ignore */ }
          scopeUnsubRef.current = null;
        }
      }, []);
      useEffect(() => {
        maybeMigrateLegacyConfig();
        let scope = null;
        try { scope = resolveSettingsScope(); } catch { scope = null; }
        if (scope === boundScopeRef.current) return;
        if (scopeUnsubRef.current) {
          try { scopeUnsubRef.current(); } catch { /* ignore */ }
          scopeUnsubRef.current = null;
        }
        boundScopeRef.current = scope;
        if (!scope || typeof scope.subscribe !== "function") return;
        const snap = safeScopeSnapshot(scope);
        if (snap) setCfg(scopeValueToConfig(snap.value));
        try {
          scopeUnsubRef.current = scope.subscribe(() => {
            const s = safeScopeSnapshot(scope);
            if (s) setCfg(scopeValueToConfig(s.value));
          });
        } catch { scopeUnsubRef.current = null; }
      });

      /**
       * 永久删除会话的墓碑机制：已删会话仍会被官方 sessions 列表继续返回
       * （官方索引收敛有延迟、会话仍被 host 内存持有），而本插件已将其移出
       * 工作区注册与归档，于是官方投影会把它们当作“未分组会话”复现。
       * 墓碑集合持久化到 localStorage，任何会话一旦删除便在任何标签页/刷新后
       * 都不可见；官方列表 phase=ready 后：
       * - 列表已不再包含该 id（Host 收敛成功）→ 清墓碑；
       * - 列表仍包含该 id → v1.9.2 起不再无条件当作收敛竞态：向 Host 查询
       *   会话目录的物理存在性（/archive/tombstoneCheck）。服务端删除 fail-loud，
       *   删除成功必然使目录消失，因此「目录仍在」= 会话存活，该墓碑必为误写
       *   （历史版本错误级联/残留）→ 作废并恢复显示；「目录已没了」才是真实的
       *   收敛竞态 → 继续隐藏，等列表收敛后摘碑。查询按当前墓碑集合签名去重。
       */
      const tombCheckRef = useRef(null);
      useEffect(() => {
        if (!sessions || sessions.phase !== "ready" || hardDeleted.size === 0) return;
        const listed = new Set((sessions.ids || []).map(String));
        const stillListed = [...hardDeleted].filter((sid) => listed.has(String(sid))).map(String);
        if (stillListed.length !== hardDeleted.size) {
          const next = new Set(stillListed);
          saveSet(LS_DELETED, next);
          setHardDeleted(next);
          return;
        }
        const signature = stillListed.slice().sort().join(",");
        if (tombCheckRef.current === signature) return;
        tombCheckRef.current = signature;
        (async () => {
          try {
            const r = await apiPost("/archive/tombstoneCheck", { ids: stillListed });
            if (!r || r.ok !== true || !Array.isArray(r.alive)) return;
            const alive = new Set(r.alive.map(String));
            if (alive.size === 0) return;
            const next = new Set([...hardDeleted].filter((sid) => !alive.has(String(sid))));
            if (next.size === hardDeleted.size) return;
            saveSet(LS_DELETED, next);
            setHardDeleted(next);
          } catch {
            /* 网络/路由失败：保守维持现状，清签名以便列表下次更新时重试 */
            if (tombCheckRef.current === signature) tombCheckRef.current = null;
          }
        })();
      }, [sessions.ids, sessions.phase, hardDeleted]);

      // 设置页「清空墓碑」事件：LS 已由设置页清掉，这里同步内存态立即重渲染。
      useEffect(() => {
        const onClear = () => setHardDeleted(new Set());
        window.addEventListener("dswt-tombstones-cleared", onClear);
        return () => window.removeEventListener("dswt-tombstones-cleared", onClear);
      }, []);

      /** 记录已永久删除的会话 id（本地持久化，跨刷新/跨标签页生效）。 */
      const rememberDeleted = useCallback((ids) => {
        setHardDeleted((prev) => {
          const next = new Set(prev);
          for (const id of ids || []) next.add(String(id));
          saveSet(LS_DELETED, next);
          return next;
        });
      }, []);

      /**
       * 设置页「删除所有空壳会话」事件：服务端已按 fail-loud 删净并剔除会话归属，
       * 这里把删掉的 id 记入墓碑，使官方列表收敛前它们不再以「未分组会话」复现。
       * 与永久删除同一条写路径（同一 LS 键、同一内存态）。
       */
      useEffect(() => {
        const onBlankDeleted = (event) => {
          const ids = event && event.detail && Array.isArray(event.detail.ids) ? event.detail.ids : [];
          if (ids.length > 0) rememberDeleted(ids);
        };
        window.addEventListener("dswt-blank-deleted", onBlankDeleted);
        return () => window.removeEventListener("dswt-blank-deleted", onBlankDeleted);
      }, [rememberDeleted]);

      /**
       * 恢复成功后同步清除墓碑：否则被删方标签页内该会话会一直隐藏
       * （列表不再返回时才会摘碑），恢复与删除两端可见性分裂。
       */
      const forgetDeleted = useCallback((ids) => {
        const gone = new Set((ids || []).map(String));
        if (gone.size === 0) return;
        setHardDeleted((prev) => {
          const next = new Set([...prev].filter((id) => !gone.has(String(id))));
          if (next.size === prev.size) return prev;
          saveSet(LS_DELETED, next);
          return next;
        });
      }, []);

      // 标题切换动画清理
      useEffect(() => {
        if (swapFrom === null) return;
        const t = setTimeout(() => setSwapFrom(null), 300);
        return () => clearTimeout(t);
      }, [swapFrom]);

      const toggleGroup = useCallback((key) => {
        setView((prev) => {
          const list = prev.collapsed.map(String);
          const next = list.includes(key) ? list.filter((k) => k !== key) : list.concat([key]);
          const value = { ...prev, collapsed: next };
          saveViewState(value);
          return value;
        });
      }, []);
      const toggleSessions = useCallback((key) => {
        setView((prev) => {
          const list = prev.expandedSessions.map(String);
          const next = list.includes(key) ? list.filter((k) => k !== key) : list.concat([key]);
          const value = { ...prev, expandedSessions: next };
          saveViewState(value);
          return value;
        });
      }, []);

      const toggleArchive = useCallback(() => {
        if (swapFrom !== null) return;
        setSwapFrom(mode);
        setMode(mode === "archive" ? "workspace" : "archive");
      }, [mode, swapFrom]);

      /** 重新添加目录后将其移出「移除显示」集合——工作区连同会话一起恢复显示。 */
      const unhideWorkspace = useCallback((ws) => {
        if (!ws || !ws.workspaceId) return;
        const wid = String(ws.workspaceId);
        setHiddenWs((prev) => {
          if (!prev.has(wid)) return prev;
          const next = new Set(prev);
          next.delete(wid);
          saveSet(LS_HIDDEN_WS, next);
          return next;
        });
      }, []);

      const addWorkspaceDir = useCallback(async (dirPath) => {
        try {
          const ws = await createWorkspace({ path: dirPath });
          unhideWorkspace(ws);
        } catch (error) {
          showAlert("添加工作区失败: " + String((error && error.message) || error), "添加工作区失败");
        }
      }, [createWorkspace, showAlert, unhideWorkspace]);

      /** 内置目录对话框的采纳：注册工作区（失败照常弹窗），无论成败都收回对话框。 */
      const onPickerPicked = useCallback(async (dirPath) => {
        setPickerBusy(true);
        try {
          await addWorkspaceDir(dirPath);
        } finally {
          setPickerBusy(false);
          closeDirectoryPicker();
        }
      }, [addWorkspaceDir, closeDirectoryPicker]);

      /** 归档会话 id 集合。 */
      const archived = useMemo(() => new Set((workspaces.archivedSessionIds || []).map(String)), [workspaces.archivedSessionIds]);

      /** 后代子代理谱系（行状态点、聚合与归档门槛共用；提前声明：门槛回调的依赖需要它）。 */
      const lineage = useMemo(() => indexSubagentRunning(sessions && sessions.byId), [sessions]);

      // 空白草稿跟随官方语义：不自动回收（官方从不物理删除会话文件），仅视图层隐藏
      // （sessionVisible 已排除非当前打开的 blank 行）。回收只在设置页按需触发一次
      // （「删除所有空壳会话」，见 ConfigPanel 的 onDeleteBlankSessions）；
      // v1.9.0 起已移除旧版的自动回收与 claims/heartbeat 占用注册表全套机制。

      // 清理「移除显示」集合中已不存在的工作区 ID（注册被外部删除后避免残留）。
      // 必须等 workspaces.phase === "ready" 再清理：加载初期 items 为空数组，
      // 若在 loading 阶段运行会把全部隐藏 ID 误判为"已注销"而清空（且写回 localStorage，
      // 刷新后隐藏失效、工作区复活）。
      useEffect(() => {
        if (!workspaces || workspaces.phase !== "ready") return;
        setHiddenWs((prev) => {
          if (prev.size === 0) return prev;
          const valid = new Set((workspaces.items || []).map((w) => String(w.workspaceId)));
          const next = new Set([...prev].filter((id) => valid.has(id)));
          if (next.size === prev.size) return prev;
          saveSet(LS_HIDDEN_WS, next);
          return next;
        });
      }, [workspaces.items, workspaces.phase]);

      const openInIde = useCallback(async (dirPath) => {
        if (!dirPath) return;
        try {
          // 用组件态 cfg（已合并 Host settings），而非直读 LS，确保设置页刚改即生效。
          const res = await apiPost("/open-ide", {
            path: dirPath,
            ide: cfg.defaultIde || "vscode",
            customCommand: cfg.customIdeCommand || ""
          });
          if (!res || res.ok !== true) {
            showAlert("打开 IDE 失败: " + (res?.error || "未知错误"), "打开 IDE 失败");
          }
        } catch (error) {
          showAlert("打开 IDE 失败: " + String(error?.message || error), "打开 IDE 失败");
        }
      }, [showAlert, cfg]);

      const onRequestRenameWs = useCallback((w) => {
        const initial = w.title || baseName(w.path);
        setRenameTarget({ kind: "workspace", id: w.workspaceId, initial, ws: w });
        setRenameDraft(initial);
        setRenameBusy(false);
      }, []);

      const onRequestRenameSession = useCallback((sessionId, currentTitle) => {
        const initial = currentTitle || "";
        setRenameTarget({ kind: "session", id: sessionId, initial });
        setRenameDraft(initial);
        setRenameBusy(false);
      }, []);

      const onCancelRename = useCallback(() => {
        if (renameBusy) return;
        setRenameTarget(null);
      }, [renameBusy]);

      const onConfirmRename = useCallback(async () => {
        if (!renameTarget) return;
        // ref 锁：同 tick 双击/双 Enter 在 setRenameBusy 重渲染前可重入，state 守卫拦不住
        if (renameLockRef.current) return;
        const trimmed = (renameDraft || "").trim();
        const initialTrim = (renameTarget.initial || "").trim();
        if (!trimmed) return;
        // 会话侧照官方：确认未改动的标题同样提交，把当前的自动标题钉成显式标题；
        // 工作区侧官方拦住未改动与重名，这里保持同样的门槛。
        if (renameTarget.kind === "workspace") {
          if (trimmed === initialTrim) { setRenameTarget(null); return; }
          const duplicated = (workspaces.items || []).some((w) => String(w.workspaceId) !== String(renameTarget.id)
            && (w.title || baseName(w.path)) === trimmed);
          if (duplicated) { showAlert("已有同名工作区，请换一个名称", "重命名失败"); return; }
        }
        renameLockRef.current = true;
        setRenameBusy(true);
        try {
          if (renameTarget.kind === "workspace") {
            await renameWorkspace(renameTarget.id, trimmed);
          } else {
            await renameSession(renameTarget.id, trimmed);
          }
          setRenameTarget(null);
        } catch (error) {
          showAlert(String((error && error.message) || error), "重命名失败");
        } finally {
          renameLockRef.current = false;
          setRenameBusy(false);
        }
      }, [renameTarget, renameDraft, renameWorkspace, renameSession, showAlert]);

      /**
       * 工作区是否被会话"占用"：名下有可见会话（含当前打开的空白草稿）或有效归档会话。
       * 只统计自身直属的 sessionIds——路径嵌套的子工作区是独立注册记录，父被真删后
       * 会自动升级为顶层继续显示，不参与本判定；byId 无行的幽灵 ID（host 已不再返回）
       * 与未打开的空白草稿不算占用（前者是待清理残留，后者按官方语义仅视图层隐藏、
       * 不占工作区）。
       */
      const workspaceOccupied = useCallback((w) => {
        if (!w) return true;
        if ((w.sessionIds || []).length === 0) return false; // 注册表本就没挂任何会话
        // 保守守卫：会话列表尚未收敛（loading/error）时 byId 缺行，
        // 若照常判定会把真有会话的工作区误判为空 → 永久注销，故一律按占用处理。
        if (!sessions || sessions.phase !== "ready") return true;
        const byId = (sessions && sessions.byId) || {};
        const cur = currentSessionIdOf(sessions);
        for (const raw of w.sessionIds || []) {
          const id = String(raw);
          const row = byId[id] || null;
          if (row && isSubagentRow(row)) continue;
          if (archivedSessionVisible(row, archived, hardDeleted)) return true;
          if (sessionVisible(row, cur, archived, hardDeleted)) return true;
        }
        return false;
      }, [sessions, archived, hardDeleted]);

      /** 移除工作区显示：名下已无任何会话/归档 → 真注销；否则维持「仅隐藏」。 */
      const onHideWs = useCallback((w) => {
        setDeleteWsConfirm({ ws: w, hardRemove: !workspaceOccupied(w) });
      }, [workspaceOccupied]);

      const onCancelHideWs = useCallback(() => {
        if (hideWsLockRef.current) return;
        setDeleteWsConfirm(null);
      }, []);

      const onConfirmHideWs = useCallback(async () => {
        if (!deleteWsConfirm || !deleteWsConfirm.ws) return;
        const wid = String(deleteWsConfirm.ws.workspaceId);
        const hideOnly = () => {
          setHiddenWs((prev) => {
            const next = new Set(prev);
            next.add(wid);
            saveSet(LS_HIDDEN_WS, next);
            return next;
          });
        };
        if (!deleteWsConfirm.hardRemove) {
          setDeleteWsConfirm(null);
          hideOnly();
          return;
        }
        // 真注销：走官方 workspace/delete RPC（仅删注册表记录，不碰磁盘目录与会话文件）。
        if (hideWsLockRef.current) return;
        hideWsLockRef.current = true;
        setHideWsBusy(true);
        try {
          await deleteWorkspace(wid);
          setDeleteWsConfirm(null);
          // 注销后顺手清掉该 ID 的本地记忆（隐藏集还有 phase=ready 后的对账 effect 兜底）。
          setHiddenWs((prev) => {
            if (!prev.has(wid)) return prev;
            const next = new Set(prev);
            next.delete(wid);
            saveSet(LS_HIDDEN_WS, next);
            return next;
          });
        } catch (error) {
          // 失败（或旧版 DSH 无 delete 服务）：降级为仅隐藏，不让用户的点击丢失。
          setDeleteWsConfirm(null);
          hideOnly();
          showAlert("工作区注销失败，已先仅隐藏移除：" + String(error && error.message || error), "移除失败");
        } finally {
          hideWsLockRef.current = false;
          setHideWsBusy(false);
        }
      }, [deleteWsConfirm, deleteWorkspace, showAlert]);

      /**
       * 归档会话的唯一入口。判据四层，逐层更权威：
       *  1) 空白草稿不归档（归档后双视图都不可见，用户会找不到它）；
       *  2) 自身运行中 / 等待审批·计划复核·提问 不归档 —— 读**本次渲染**的活快照与官方
       *     pending 座位，而不是行按钮渲染时算好的 canArchive 闭包（那个可能已过期）；
       *  3) 后代子代理正在运行不归档 —— 读与行状态点同源的快照谱系（父会话自身空闲，
       *     但它的不间断 subagent 谱系里还有在跑的后代）；
       *  4) Host 权威复查：官方 workspace/archiveSession 在 Host 上没有运行态守卫，
       *     客户端 running 位是 Host 转发事实（发送后到状态帧落地之间有窗口），所以
       *     归档前问一次插件 Host 半边——自身 agents.get(sessionId).status，以及
       *     持久谱系 + agents.get 逐后代算出的 runningDescendants；查询不可用时
       *     fail-open 放行（不因网络故障把用户锁死，最终仍由官方 RPC 定生死）。
       * 判据只拦「不该归档」；归档成功与否仍以官方 RPC 为准。
       */
      const onArchiveSession = useCallback(async (sessionId) => {
        // 空白草稿不允许归档：归档后双视图都不可见（工作区视图排 archived、归档视图排 blank），
        // 用户将找不到它。按官方语义空白草稿仅视图层隐藏、不会自动物理删除。
        // 注意：byId 缺行时无法判断 blank，按非 blank 放行并交由 Host 报错（fail-open，见审计）。
        const rendered = sessions && sessions.byId ? sessions.byId[sessionId] : null;
        // 优先读 store 活快照（可覆盖「运行位刚翻真、界面还没重渲染」的窗口），
        // 读不到再回退渲染快照。
        const live = (typeof liveSessionRow === "function" ? liveSessionRow(sessionId) : null) || rendered;
        if (live && live.blank) {
          showAlert("空白草稿无需归档：切换到其他会话后即隐藏", "无需归档");
          return;
        }
        if (live && live.running) {
          showAlert("会话正在运行，结束后才能归档", "无法归档");
          return;
        }
        const pendingKind = pendingKindOf(sessionStatus, sessionId);
        if (pendingKind) {
          showAlert("会话正在" + PENDING_LABEL[pendingKind] + "，处理完才能归档", "无法归档");
          return;
        }
        const lineageRunning = runningSubagentsOf(lineage, sessionId);
        if (lineageRunning > 0) {
          showAlert("该会话的后代子代理正在运行（" + lineageRunning + " 个），结束后才能归档", "无法归档");
          return;
        }
        const guard = await checkArchiveGuard(sessionId);
        if (guard.ok && guard.running) {
          // 客户端位落后于 Host（转发窗口/事件流打嗝）：顺手让列表重新对齐一次。
          if (typeof refreshSessions === "function") refreshSessions();
          showAlert("会话正在运行（Host 实测状态：" + String(guard.status || "running") + "），结束后才能归档", "无法归档");
          return;
        }
        if (guard.ok && guard.runningDescendants > 0) {
          // 同一窗口的宿主侧补漏：客户端谱系来自转发快照，Host 是权威。
          if (typeof refreshSessions === "function") refreshSessions();
          showAlert("该会话的后代子代理正在运行（Host 实测 " + guard.runningDescendants + " 个），结束后才能归档", "无法归档");
          return;
        }
        try {
          await archiveSession(sessionId);
        } catch (error) {
          showAlert(String((error && error.message) || error), "归档会话失败");
        }
      }, [archiveSession, showAlert, sessions, liveSessionRow, sessionStatus, lineage, refreshSessions]);

      const isCurrentArchived = useMemo(() => {
        const current = currentSessionIdOf(sessions);
        if (!current) return false;
        return archived.has(String(current));
      }, [sessions, archived]);

      useEffect(() => {
        if (isCurrentArchived) {
          document.body.setAttribute("data-dswt-archived-session", "true");
        } else {
          document.body.removeAttribute("data-dswt-archived-session");
        }
        return () => {
          document.body.removeAttribute("data-dswt-archived-session");
        };
      }, [isCurrentArchived]);

      // 归档视图操作
      const onRestoreOne = useCallback(async (sid) => {
        try {
          await unarchiveSession(sid);
          forgetDeleted([sid]);
          refreshSessions();
        } catch (error) {
          showAlert(String((error && error.message) || error), "恢复失败");
        }
      }, [unarchiveSession, refreshSessions, showAlert, forgetDeleted]);
      const onDeleteOne = useCallback((sid) => {
        const t = (sessions.byId[sid] && sessions.byId[sid].displayTitle) || sid;
        setArchiveConfirm({ kind: "deleteOne", sessionId: sid, title: t });
      }, [sessions]);
      const onRestoreGroup = useCallback((workspaceId) => {
        if (workspaceId === null) {
          setArchiveConfirm({ kind: "restoreGroup", workspaceId: null, title: "未分组" });
        } else {
          const ws = (workspaces.items || []).find((w) => w.workspaceId === workspaceId);
          const title = ws ? (ws.title || baseName(ws.path)) : workspaceId;
          setArchiveConfirm({ kind: "restoreGroup", workspaceId, title });
        }
      }, [workspaces]);
      const onDeleteGroup = useCallback((workspaceId) => {
        if (workspaceId === null) {
          setArchiveConfirm({ kind: "deleteGroup", workspaceId: null, title: "未分组" });
        } else {
          const ws = (workspaces.items || []).find((w) => w.workspaceId === workspaceId);
          const title = ws ? (ws.title || baseName(ws.path)) : workspaceId;
          setArchiveConfirm({ kind: "deleteGroup", workspaceId, title });
        }
      }, [workspaces]);
      const onRestoreAll = useCallback(() => setArchiveConfirm({ kind: "restoreAll" }), []);
      const onDeleteAll = useCallback(() => setArchiveConfirm({ kind: "deleteAll" }), []);
      /**
       * 进入归档区时静默清理「失效归档」：官方列表已不再返回的归档 ID（日志已不存在
       * 的历史残留），自动剔除，无提示行/按钮。列表未就绪或服务端不可用时静默跳过。
       */
      const archivePruneFiredAt = useRef(null);
      useEffect(() => {
        if (mode !== "archive") return;
        if (!sessions || sessions.phase !== "ready") return;
        if (archivePruneFiredAt.current !== null) return; // 本次会话内只清理一次
        archivePruneFiredAt.current = Date.now();
        (async () => {
          try {
            const r = await apiPost("/archive/pruneStale", { aliveIds: (sessions.ids || []).map(String) });
            if (!r || r.ok !== true) return;
            if (Array.isArray(r.pruned) && r.pruned.length > 0) refreshSessions();
          } catch { /* 静默 */ }
        })();
      }, [mode, sessions, refreshSessions]);
      const onCancelArchiveConfirm = useCallback(() => { if (archiveBusy) return; setArchiveConfirm(null); }, [archiveBusy]);

      const onConfirmArchiveConfirm = useCallback(async () => {
        if (!archiveConfirm) return;
        if (archiveLockRef.current) return;
        archiveLockRef.current = true;
        setArchiveBusy(true);
        try {
          const k = archiveConfirm.kind;
          let toDelete = [];
          if (k === "deleteOne") {
            toDelete = [archiveConfirm.sessionId];
          } else if (k === "deleteGroup") {
            if (archiveConfirm.workspaceId === null) {
              const accounted = accountedSessionIds(workspaces.items || []);
              toDelete = (sessions.ids || []).filter((sid) => {
                const row = sessions.byId[sid];
                return archivedSessionVisible(row, archived, null) && !accounted.has(String(sid));
              });
            } else {
              const ws = (workspaces.items || []).find((w) => w.workspaceId === archiveConfirm.workspaceId);
              toDelete = ((ws && ws.sessionIds) || []).filter((id) => archived.has(String(id)));
            }
          } else if (k === "deleteAll") {
            toDelete = [...archived];
          }

          /** 删除响应（零守卫）：物理删净才剔除，失败项逐条留在归档区。 */
          const handleDeleteResponse = (r) => {
            if (!r.ok) throw new Error(r.error || "删除失败");
            const deleted = Array.isArray(r.deleted) ? r.deleted : toDelete;
            if (deleted.length > 0) rememberDeleted(deleted);
            const current = currentSessionIdOf(sessions);
            if (current && deleted.some((id) => String(id) === String(current))) {
              startSession();
            }
            refreshSessions();
            const desc = describeDeleteFailures(r, "已保留在归档区");
            if (desc) showAlert(desc, "部分删除失败");
          };

          if (k === "deleteOne") {
            // 零守卫：不再传 tabId/占用豁免（服务端已无占用概念）。
            handleDeleteResponse(await apiPost("/archive/delete", { sessionId: archiveConfirm.sessionId }));
          } else if (k === "restoreGroup") {
            const r = await apiPost("/archive/unarchiveAll", { workspaceId: archiveConfirm.workspaceId });
            if (!r.ok) throw new Error(r.error || "恢复失败");
            if (Array.isArray(r.restored)) forgetDeleted(r.restored);
            refreshSessions();
          } else if (k === "deleteGroup") {
            handleDeleteResponse(await apiPost("/archive/deleteAll", { workspaceId: archiveConfirm.workspaceId }));
          } else if (k === "restoreAll") {
            const r = await apiPost("/archive/unarchiveAll", {});
            if (!r.ok) throw new Error(r.error || "恢复失败");
            if (Array.isArray(r.restored)) forgetDeleted(r.restored);
            refreshSessions();
          } else if (k === "deleteAll") {
            // all: true 为服务端强制要求：空对象 {} 不再等于「删除全部归档」
            // （防误触 + 防 CSRF，见 host 半区 handleDeleteAll）。
            handleDeleteResponse(await apiPost("/archive/deleteAll", { all: true }));
          }
          setArchiveConfirm(null);
        } catch (error) {
          showAlert(String((error && error.message) || error), "操作失败");
        } finally {
          archiveLockRef.current = false;
          setArchiveBusy(false);
        }
      }, [archiveConfirm, archived, workspaces, sessions, rememberDeleted, refreshSessions, showAlert]);

      /**
       * macOS 原生 Finder 选择器：宿主侧 osascript 弹出真实的「选择文件夹」窗口，**显示在 Mac 的
       * 屏幕上** ——人就在这台机器前时的首选路径，也是「添加工作区」按钮在本机的单击行为。
       * 远端设备看不到这个窗口：那类环境 /picker/native 报 supported:false，按钮改走内置目录浏览。
       * 取消（osascript exit 1 + User canceled）由宿主侧归一成 path: null。
       * startPath 是对话框的起点目录（工作区行内入口传该工作区目录，全局入口不传）：
       * 宿主校验不过（不存在/无权限/不是目录）就报错且不开窗口。
       */
      const onPickWithFinder = useCallback(async (startPath) => {
        if (nativeBusy) return;
        setNativeBusy(true);
        try {
          const result = await apiPost("/picker/native", (typeof startPath === "string" && startPath !== "") ? { startPath } : {});
          if (!result || result.ok !== true) throw new Error((result && result.error) || "原生选择器不可用");
          if (result.path === null || result.path === void 0 || result.path === "") return;   // 操作员取消
          await addWorkspaceDir(String(result.path));
        } catch (error) {
          showAlert("Finder 选择失败: " + String((error && error.message) || error), "添加工作区失败");
        } finally {
          setNativeBusy(false);
        }
      }, [nativeBusy, addWorkspaceDir, showAlert]);

      /**
       * 「添加工作区」按钮的共同行为（侧栏顶部与每个工作区行共用）：**本机 macOS 单击直达
       * Finder**（/picker/native 报支持时短路到 onPickWithFinder）；其余环境先试
       * uiWorkspace.pickDirectory()，被拒（browse 主机必被 host 以
       * directory-picker/unavailable 拒绝，这不是故障，不该弹错）则转自持浏览对话框。
       * startPath 是对话框的起始层：侧栏顶部传空（从 home 起），工作区行传该工作区目录
       * （只作为起点，不限制越出）。macOS 的 Finder 窗口与自持浏览对话框都从它起——前者
       * 由宿主以 osascript 的 default location 落点，后者作为首屏列表。
       * 探得通起始层才开对话框（顺带作为首屏，不再二次拉取）；
       * 起始层探不通就退回 home；两者都探不通说明两种能力都没有——如实报错，不留死胡同。
       */
      const addWorkspaceFlow = useCallback(async (startPath) => {
        if (nativePicker) return onPickWithFinder(startPath);
        let nativeError = null;
        try {
          const path = await pickDirectory();
          if (path === null || path === void 0 || path === "") return;   // 操作员取消
          await addWorkspaceDir(path);
          return;
        } catch (error) {
          nativeError = error;
          console.warn("[dsh-workspace-tree] 官方原生目录选择器不可用，尝试内置浏览对话框：", error);
        }
        try {
          let seed = null;
          if (typeof startPath === "string" && startPath !== "") {
            try { seed = await listDirectory(startPath); } catch { seed = null; }
          }
          if (!seed) seed = await listDirectory(void 0);
          setPickerSeed(seed || null);
          setPickerOpen(true);
        } catch (browseError) {
          console.warn("[dsh-workspace-tree] 自持目录浏览不可用：", browseError);
          // 两种能力都没有：如实报错，不留一个点不动的对话框。
          // native 是被 capability 拒绝的（host 服务 browse，只是客户端这边也拿不到
          // browse 面，例如旧版 DSH）时，真正的可操作信息在 browse 那一侧；否则
          // native 的失败原因更准（系统选择器真的坏了）。
          const nativeMsg = String((nativeError && nativeError.message) || nativeError || "");
          const browseMsg = String((browseError && browseError.message) || browseError || "");
          const nativeRefused = /needs the native capability|directory-picker\/unavailable/.test(nativeMsg);
          showAlert("添加工作区失败: " + ((nativeRefused && browseMsg) ? browseMsg : (nativeMsg || browseMsg)), "添加工作区失败");
        }
      }, [nativePicker, onPickWithFinder, pickDirectory, listDirectory, addWorkspaceDir, showAlert]);

      const onAddWorkspace = useCallback(() => addWorkspaceFlow(null), [addWorkspaceFlow]);

      /** 工作区行内入口：同一套交互，只是选择器从该工作区目录起。 */
      const onAddWorkspaceIn = useCallback((ws) => addWorkspaceFlow(ws && ws.path), [addWorkspaceFlow]);

      // 数据投影计算：visibleItems 为未被「移除显示」的工作区（树只由它构建）
      const items = workspaces.items || [];
      const visibleItems = useMemo(
        () => items.filter((w) => !hiddenWs.has(String(w.workspaceId))),
        [items, hiddenWs]
      );
      const aggCtx = useMemo(() => {
        const wsForest = buildWorkspaceForest(visibleItems);
        // 归档用全量森林：被“移除显示”的工作区的归档会话也必须可见可恢复，
        // 否则隐藏即永久失联（与“仅移除显示、归属不变”的承诺冲突）
        const archiveForest = buildWorkspaceForest(items);
        for (const n of wsForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, sessionStatus, lineage, currentSid);
        for (const n of archiveForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, sessionStatus, lineage, currentSid);
        const wsChildren = new Map();
        const wsParent = new Map();
        wsChildren.set(null, (wsForest || []).map((node) => String(node.w.workspaceId)));
        (function walk(nodes, parentKey) {
          for (const node of nodes || []) {
            const key = String(node.w.workspaceId);
            wsChildren.set(key, (node.children || []).map((child) => String(child.w.workspaceId)));
            wsParent.set(key, parentKey);
            walk(node.children, key);
          }
        })(wsForest, null);
        return { wsForest, archiveForest, wsChildren, wsParent };
      }, [visibleItems, items, sessions, archived, hardDeleted, sessionStatus, lineage, currentSid]);

      /** 全部可见工作区（不嵌套）：官方 groupBy「按工作区」的平铺分组。 */
      const flatGroups = useMemo(() => {
        const nodes = visibleItems.map((w) => ({ w, children: [] }));
        for (const n of nodes) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, sessionStatus, lineage, currentSid);
        return nodes;
      }, [visibleItems, sessions, archived, hardDeleted, sessionStatus, lineage, currentSid]);

      const wsForest = aggCtx.wsForest;
      const archiveForest = aggCtx.archiveForest;

      /** 不属于任何已注册工作区的可见会话（含隐藏工作区名下的会话：它们已有归属）。 */
      const ungroupedSids = useMemo(() => {
        const accounted = accountedSessionIds(items);
        const byId = (sessions && sessions.byId) || {};
        return (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])
          .map(String)
          .filter((sid) => !accounted.has(sid) && sessionVisible(byId[sid], currentSid, archived, hardDeleted));
      }, [sessions, items, archived, hardDeleted, currentSid]);

      /** 单一列表：官方列表返回的全部可见会话（archive/subagent 照旧排除）。 */
      const flatSids = useMemo(() => {
        const byId = (sessions && sessions.byId) || {};
        return (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])
          .map(String)
          .filter((sid) => sessionVisible(byId[sid], currentSid, archived, hardDeleted));
      }, [sessions, archived, hardDeleted, currentSid]);

      // ── 视图派生：当前会话所在组、祖先链、账号成员、搜索与拖拽 ──
      const { wsChildren, wsParent } = aggCtx;
      const visibleKeySet = useMemo(() => new Set(visibleItems.map((w) => String(w.workspaceId))), [visibleItems]);

      /** 一个会话所属的账号键（工作区 id / UNGROUPED_KEY；单一列表模式统一落 FLAT_KEY）。 */
      const accountKeyOfSession = useCallback((sid) => {
        if (view.groupBy === GROUP_BY.flat) return FLAT_KEY;
        const target = String(sid);
        for (const w of items) {
          if ((w.sessionIds || []).some((id) => String(id) === target)) return String(w.workspaceId);
        }
        return UNGROUPED_KEY;
      }, [items, view.groupBy]);

      const currentGroupKey = currentSid === null ? null : accountKeyOfSession(currentSid);
      /** 当前会话所在组本身（用于文件夹高亮）与它的祖先链。 */
      const currentOwningKey = currentGroupKey === null
        ? null
        : (currentGroupKey === FLAT_KEY ? null : currentGroupKey);
      const ancestorKeys = useMemo(() => {
        const set = new Set();
        if (currentOwningKey === null || currentOwningKey === UNGROUPED_KEY) return set;
        for (const key of workspacePathTo(wsForest, currentOwningKey).slice(0, -1)) set.add(key);
        return set;
      }, [wsForest, currentOwningKey]);

      /** 一个账号当前的显示顺序（拖拽提交与移动标记共用）。 */
      const accountMembers = useCallback((accountKey) => {
        if (accountKey === FLAT_KEY) return accountOrder(FLAT_KEY, flatSids, sessions, view, currentSid);
        if (accountKey === UNGROUPED_KEY) return accountOrder(UNGROUPED_KEY, ungroupedSids, sessions, view, currentSid);
        const w = items.find((x) => String(x.workspaceId) === accountKey);
        if (!w) return [];
        const sids = visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted, currentSid);
        return accountOrder(accountKey, sids, sessions, view, currentSid);
      }, [flatSids, ungroupedSids, sessions, view, currentSid, items, archived, hardDeleted]);

      const patchView = useCallback((patch) => {
        setView((prev) => {
          const value = { ...prev, ...patch };
          saveViewState(value);
          return value;
        });
      }, []);

      /** 会话拖拽：同账号内改显示顺序，落手动模式（官方 commitSessionDrag 口径）。 */
      const commitSessionDrag = useCallback((active, over) => {
        if (!active || !over) return;
        const members = accountMembers(active.accountKey);
        const without = members.filter((id) => id !== active.sid);
        const at = without.indexOf(over.sid);
        if (at === -1) return;
        const next = without.slice();
        next.splice(over.half === "before" ? at : at + 1, 0, active.sid);
        setView((prev) => {
          const value = { ...prev, orderBy: "manual", sessionOrder: { ...prev.sessionOrder, [active.accountKey]: next } };
          saveViewState(value);
          return value;
        });
      }, [accountMembers]);

      /** 工作区拖拽：同层兄弟重排，写官方注册表的持久顺序（insertWorkspaceBefore）。 */
      const commitWorkspaceDrag = useCallback((active, over) => {
        if (!active || !over) return;
        if (typeof insertWorkspaceBefore !== "function") {
          showAlert("当前 DSH 版本不支持工作区排序（缺少 insertBefore）", "排序失败");
          return;
        }
        const targetParent = wsParent.has(String(over.wsId)) ? wsParent.get(String(over.wsId)) : null;
        const sortedSiblings = view.groupBy === GROUP_BY.workspaceTree;
        // 树模式下只重排同层兄弟（官方：拖到后代上时以最近的同层祖先为落点）。
        if (sortedSiblings && wsParent.get(String(active.wsId)) !== targetParent) return;
        const siblings = sortedSiblings
          ? (wsChildren.get(targetParent) || [])
          : visibleItems.map((w) => String(w.workspaceId));
        const without = siblings.filter((id) => id !== String(active.wsId));
        const at = without.indexOf(String(over.wsId));
        if (at === -1) return;
        const anchor = over.half === "before" ? without[at] : without[at + 1];
        Promise.resolve(insertWorkspaceBefore(active.wsId, anchor)).catch((error) => {
          showAlert("调整工作区顺序失败：" + String((error && error.message) || error), "排序失败");
        });
      }, [insertWorkspaceBefore, wsChildren, wsParent, visibleItems, view.groupBy, showAlert]);

      /** 拖拽 API：行组件只报告「开始 / 悬停 / 落下 / 结束」，判定与提交留在这里。 */
      const dragApi = useMemo(() => ({
        kind: drag ? drag.kind : null,
        sid: drag ? drag.sid : null,
        accountKey: drag ? (drag.accountKey ?? null) : null,
        wsId: drag ? drag.wsId : null,
        over: drag ? drag.over : null,
        start: (sid) => setDrag({ kind: "session", accountKey: accountKeyOfSession(sid), sid, over: null }),
        hover: (sid, half) => setDrag((prev) => (prev && prev.kind === "session" ? { ...prev, over: { sid, half } } : prev)),
        drop: () => { const active = drag; setDrag(null); commitSessionDrag(active, active && active.over); },
        startWs: (wsId) => setDrag({ kind: "ws", wsId, over: null }),
        hoverWs: (wsId, half) => setDrag((prev) => (prev && prev.kind === "ws" ? { ...prev, over: { wsId, half } } : prev)),
        dropWs: () => { const active = drag; setDrag(null); commitWorkspaceDrag(active, active && active.over); },
        end: () => setDrag(null)
      }), [drag, accountKeyOfSession, commitSessionDrag, commitWorkspaceDrag]);

      // 搜索：本地即时匹配标题 / 工作区名，Host 内容检索 250ms 防抖 + 上一条 abort（官方同款）。
      const trimmedQuery = query.trim();
      /** 搜索框展开（点一次按钮就整行让给输入框）与「已有关键词、列表切到结果」是两件事。 */
      const searchFieldOpen = searchOpen && mode !== "archive";
      const searchActive = searchFieldOpen && trimmedQuery !== "";
      useEffect(() => {
        if (!searchActive || contentSearchOff || typeof searchSessions !== "function") {
          setContentSearch(null);
          setSearchPending(false);
          return;
        }
        const controller = new AbortController();
        setSearchPending(true);
        const timer = setTimeout(() => {
          Promise.resolve()
            .then(() => searchSessions(trimmedQuery, controller.signal))
            .then((value) => { if (!controller.signal.aborted) { setContentSearch(value || null); setSearchPending(false); } })
            .catch((error) => {
              if (controller.signal.aborted) return;
              const message = String((error && error.message) || error);
              if (searchDisabledMessage(message)) {
                // 部署层面没开内容检索：不再重试，也不把它当成错误报给用户。
                setContentSearchOff(true);
                setContentSearch(null);
              } else {
                setContentSearch({ error: message });
              }
              setSearchPending(false);
            });
        }, 250);
        return () => { clearTimeout(timer); controller.abort(); };
      }, [searchActive, contentSearchOff, trimmedQuery, searchSessions]);

      const searchResults = useMemo(() => {
        if (!searchActive) return [];
        return deriveSearchResults(sessions, visibleItems, archived, hardDeleted, currentSid, trimmedQuery, contentSearch, searchResultLimit);
      }, [searchActive, sessions, visibleItems, archived, hardDeleted, currentSid, trimmedQuery, contentSearch, searchResultLimit]);

      /** 选中结果：清空并收起搜索，打开会话，并把它的行滚进视野（展开祖先组）。 */
      const onOpenSearchResult = useCallback((sid) => {
        setSearchOpen(false);
        setQuery("");
        setRevealSid(String(sid));
        open(sid);
      }, [open]);

      useEffect(() => {
        if (revealSid === null) return;
        const key = accountKeyOfSession(revealSid);
        if (key !== null) {
          const path = (key === UNGROUPED_KEY || key === FLAT_KEY) ? [key] : workspacePathTo(wsForest, key);
          setView((prev) => {
            const hide = new Set(path);
            const collapsed = prev.collapsed.filter((k) => !hide.has(k));
            const expandedSessions = prev.expandedSessions.includes(key) ? prev.expandedSessions : prev.expandedSessions.concat([key]);
            if (collapsed.length === prev.collapsed.length && expandedSessions === prev.expandedSessions) return prev;
            const value = { ...prev, collapsed, expandedSessions };
            saveViewState(value);
            return value;
          });
        }
        const node = typeof document.querySelector === "function" ? document.querySelector('[data-sid="' + revealSid + '"]') : null;
        if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
        setRevealSid(null);
      }, [revealSid, accountKeyOfSession, wsForest]);

      /** 搜索框：折叠时只是一个标题按钮，展开后整行让给输入框（官方 header 同款）。 */
      const searchBox = h("div", { key: "search", className: "dswt-searchBox" }, [
        h(Icon, { key: "i", name: "search", size: 14, className: "dswt-searchGlyph" }),
        h(Input, {
          key: "q",
          className: "dswt-searchInput",
          value: query,
          placeholder: "搜索会话标题、工作区或内容",
          spellCheck: false,
          autoFocus: true,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === "Escape") { setQuery(""); setSearchOpen(false); } }
        }),
        h("button", {
          key: "c",
          type: "button",
          className: "dswt-iconButton",
          title: "关闭搜索",
          "aria-label": "关闭搜索",
          onClick: () => { setQuery(""); setSearchOpen(false); }
        }, h(Icon, { name: "minus", size: 14 }))
      ]);

      // 内置目录对话框（browse 面回退）—— 挂在两套布局里，只有打开时才渲染面板。
      const pickerNode = h(DirectoryPickerModal, {
        key: "dirPicker",
        open: pickerOpen,
        busy: pickerBusy,
        initialListing: pickerSeed,
        listDirectory,
        createDirectory,
        onCancel: closeDirectoryPicker,
        onPicked: onPickerPicked
      });

      // 侧栏顶部与每个工作区行共用同一套交互，标题随宿主能力说明本次会开什么。
      const addWorkspaceTitle = nativePicker
        ? (nativeBusy ? "Finder 窗口已打开，等待选择…" : "添加工作区（用 Finder 选择目录）")
        : "添加工作区";
      const addWorkspaceDisabled = nativePicker ? nativeBusy : pickerBusy;

      // rail 模式：窄图标列
      if (!wide) {
        return h("div", { className: "dswt-rail" }, [
          h("button", { key: "ws", type: "button", className: "dswt-rail-btn", title: addWorkspaceTitle, "aria-label": "添加工作区", disabled: addWorkspaceDisabled, onClick: onAddWorkspace }, h(Icon, { name: "plus", size: 18 })),
          mode !== "archive" && h("button", {
            key: "sr",
            type: "button",
            className: "dswt-rail-btn" + (searchOpen ? " dswt-rail-btnActive" : ""),
            title: "搜索会话",
            "aria-label": "搜索会话",
            onClick: () => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }
          }, h(Icon, { name: "search", size: 18 })),
          pickerNode
        ]);
      }

      const header = h("div", { key: "h", className: "dswt-sectionHeader" }, [
        searchFieldOpen
          ? searchBox
          : h("div", {
              key: "t",
              className: "dswt-modeTitle",
              title: mode === "archive" ? "点击返回工作区" : "点击进入归档区",
              onClick: () => toggleArchive()
            }, [
              swapFrom !== null && h("span", { key: "out", className: "dswt-titleItem dswt-titleOut" }, swapFrom === "archive" ? "归档区" : "工作区"),
              h("span", { key: "in" + mode, className: "dswt-titleItem dswt-titleIn" }, mode === "archive" ? "归档区" : "工作区")
            ]),
        !searchFieldOpen && h("span", { key: "a", className: "dswt-headerActions" }, [
          mode !== "archive" && h("button", {
            key: "sr",
            type: "button",
            className: "dswt-headBtn" + (searchOpen ? " dswt-headBtnActive" : ""),
            title: "搜索会话",
            "aria-label": "搜索会话",
            onClick: () => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }
          }, h(Icon, { name: "search", size: 16 })),
          mode !== "archive" && h(ViewOptionsMenu, {
            key: "vo",
            groupBy: view.groupBy,
            orderBy: view.orderBy,
            onGroupPick: (groupBy) => patchView({ groupBy }),
            onOrderPick: (orderBy) => patchView({ orderBy })
          }),
          mode !== "archive" && h("button", { key: "ns", type: "button", className: "dswt-headBtn", title: "新建会话（选择工作区）", onClick: () => { if (clearSession) clearSession(); else if (typeof startSession === "function") startSession(); } }, h(Icon, { name: "newChat", size: 16 })),
          mode !== "archive" && h("button", { key: "ws", type: "button", className: "dswt-headBtn", title: addWorkspaceTitle, "aria-label": "添加工作区", disabled: addWorkspaceDisabled, onClick: onAddWorkspace }, h(Icon, { name: "plus", size: 16 })),
          h("button", { key: "ar", type: "button", className: "dswt-headBtn" + (mode === "archive" ? " dswt-headBtnActive" : ""), title: mode === "archive" ? "返回" : "归档区", onClick: toggleArchive }, h(Icon, { name: "archive", size: 16 }))
        ].filter(Boolean))
      ]);

      // 搜索态与分组方式决定列表主体；三种分组都复用同一套行组件。
      const groupNodes = view.groupBy === GROUP_BY.workspaceTree ? wsForest : flatGroups;
      const showUngrouped = view.groupBy !== GROUP_BY.flat && ungroupedSids.length > 0;
      const emptyHint = hiddenWs.size > 0
        ? "所有工作区均已移除显示——重新添加目录即可恢复"
        : "尚无工作区——点击上方「添加工作区」或先新建会话";

      let body;
      if (mode === "archive") {
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "归档区" }, [
          h(ArchiveView, {
            key: "av",
            sessions,
            wsForest: archiveForest,
            archived,
            hardDeleted,
            currentSid,
            onOpen: open,
            onRestoreOne,
            onDeleteOne,
            onRestoreGroup,
            onDeleteGroup,
            onRestoreAll,
            onDeleteAll,
            busy: archiveBusy
          })
        ]);
      } else if (searchActive) {
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "搜索结果" }, [
          contentSearch && contentSearch.error && h("div", { key: "w", className: "dswt-searchNote" }, "内容检索不可用：" + contentSearch.error),
          searchResults.length === 0 && h("div", { key: "e", className: "dswt-empty" }, searchPending ? "搜索中…" : "没有匹配的会话"),
          searchResults.map((result) => h(SearchResultRow, {
            key: "r:" + result.id,
            result,
            sessions,
            sessionStatus,
            lineage,
            currentSid,
            onOpen: onOpenSearchResult
          }))
        ]);
      } else if (view.groupBy === GROUP_BY.flat) {
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "会话" }, [
          h(FlatList, {
            key: "flat",
            sids: flatSids,
            sessions, sessionStatus, lineage, now, currentSid, view,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession, drag: dragApi
          }),
          flatSids.length === 0 && h("div", { key: "e", className: "dswt-empty" }, emptyHint)
        ]);
      } else {
        // 工作区模式：按工作区分组；工作区树模式额外按目录嵌套（官方 groupBy 两档）。
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "工作区" }, [
          groupNodes.map((node) => h(WorkspaceGroup, {
            key: node.w.workspaceId, node, depth: 0, indent: INDENT, sessions, sessionStatus, lineage, archived, hardDeleted,
            view, currentSid, currentGroupKey: currentOwningKey, ancestorKeys,
            onNewSession: startSession,
            onAddWorkspaceIn,
            onOpenInIde: openInIde,
            onRenameWs: onRequestRenameWs, onHideWs,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession,
            onToggleGroup: toggleGroup, onToggleSessions: toggleSessions,
            drag: dragApi, now
          })),
          showUngrouped && h(UngroupedGroup, {
            key: "ungrouped",
            sids: ungroupedSids,
            sessions, sessionStatus, lineage, indent: INDENT, now, currentSid, view,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession,
            onToggleGroup: toggleGroup, onToggleSessions: toggleSessions, drag: dragApi
          }),
          groupNodes.length === 0 && !showUngrouped && h("div", { key: "e", className: "dswt-empty" }, emptyHint)
        ]);
      }

      const archiveModalProps = (() => {
        if (!archiveConfirm) return { open: false, title: "", desc: "", confirmText: "确认", danger: false };
        const k = archiveConfirm.kind;
        if (k === "deleteOne") return { open: true, title: "永久删除会话", desc: "确定要永久删除会话 “" + (archiveConfirm.title || "") + "” 吗？此操作将彻底删除会话数据与关联的全部子智能体（Subagent）日志，无法恢复。", confirmText: "永久删除", danger: true };
        if (k === "restoreGroup") {
          const label = archiveConfirm.workspaceId === null ? "未分组" : "工作区 “" + (archiveConfirm.title || "") + "”";
          return { open: true, title: "恢复" + (archiveConfirm.workspaceId === null ? "未分组归档" : "工作区归档"), desc: "确定要恢复" + label + "的全部归档会话吗？", confirmText: "恢复全部", danger: false };
        }
        if (k === "deleteGroup") {
          const label = archiveConfirm.workspaceId === null ? "未分组" : "工作区 “" + (archiveConfirm.title || "") + "”";
          return { open: true, title: "删除" + (archiveConfirm.workspaceId === null ? "未分组归档" : "工作区归档"), desc: "确定要永久删除" + label + "的全部归档会话吗？此操作不可恢复。", confirmText: "永久删除", danger: true };
        }
        if (k === "restoreAll") return { open: true, title: "恢复全部归档", desc: "确定要恢复全部 " + (archived.size || 0) + " 条归档会话吗？", confirmText: "恢复全部", danger: false };
        if (k === "deleteAll") return { open: true, title: "删除全部归档", desc: "确定要永久删除全部 " + (archived.size || 0) + " 条归档会话吗？此操作不可恢复。", confirmText: "永久删除", danger: true };
        return { open: false, title: "", desc: "", confirmText: "确认", danger: false };
      })();

      return h("div", { className: "dswt-root" }, [
        header, body, pickerNode,
        h(RenameModal, {
          key: "renameModal",
          open: renameTarget !== null,
          kind: renameTarget ? renameTarget.kind : "session",
          initialTitle: renameTarget ? renameTarget.initial : "",
          draft: renameDraft,
          busy: renameBusy,
          onDraftChange: setRenameDraft,
          onCancel: onCancelRename,
          onConfirm: onConfirmRename
        }),
        h(ConfirmModal, {
          key: "hideWsConfirmModal",
          open: deleteWsConfirm !== null,
          title: deleteWsConfirm && deleteWsConfirm.hardRemove ? "彻底移除空工作区" : "移除工作区显示",
          desc: deleteWsConfirm && deleteWsConfirm.ws ? (deleteWsConfirm.hardRemove
            ? ("工作区 “" + (deleteWsConfirm.ws.title || baseName(deleteWsConfirm.ws.path)) + "” 名下已没有任何会话与归档记录，将直接从工作区注册表中注销该工作区。\n\n仅注销注册：不删除磁盘目录与会话文件（本就没有其会话）；之后重新添加该目录时会以新的注册记录出现。")
            : ("确定将工作区 “" + (deleteWsConfirm.ws.title || baseName(deleteWsConfirm.ws.path)) + "” 从侧栏移除吗？\n\n仅移除显示：不删除工作区注册，目录文件、会话日志与会话归属均不受影响；之后重新添加该目录时，工作区连同其会话一起恢复显示。")) : "",
          confirmText: "移除",
          danger: deleteWsConfirm ? deleteWsConfirm.hardRemove === true : false,
          busy: hideWsBusy,
          onCancel: onCancelHideWs,
          onConfirm: onConfirmHideWs
        }),
        h(ConfirmModal, {
          key: "arcConfirm",
          open: archiveModalProps.open,
          title: archiveModalProps.title,
          desc: archiveModalProps.desc,
          confirmText: archiveModalProps.confirmText,
          danger: archiveModalProps.danger,
          busy: archiveBusy,
          onCancel: onCancelArchiveConfirm,
          onConfirm: onConfirmArchiveConfirm
        }),
        h(AlertModal, {
          key: "alertModal",
          open: alertInfo !== null,
          title: alertInfo ? alertInfo.title : "提示",
          desc: alertInfo ? alertInfo.desc : "",
          onConfirm: () => setAlertInfo(null)
        })
      ]);
    }

    // ══════════════ 设置面板 ══════════════
    /** 设置页卡片文案的字典命名空间（locale 字典的唯一真源）。 */
    const NS = "settings.workspaceTree";
    /** 简体中文字典：key 集合的唯一真源。 */
    const zh = {
      title: "工作区树",
      pageNav: "侧边栏",
      description: "侧栏工作区浏览器：按目录嵌套管理已注册工作区与会话，带安全归档区与永久删除。",
      hostManaged: "配置由 Host 托管（~/.dsh/settings.yaml › {ns}），重启/换端口不丢失。",
      hostManagedReadOnly: "配置由 Host 托管（~/.dsh/settings.yaml › {ns}），当前只读。",
      hostUnavailable: "Host 设置服务不可用（旧版 DSH），配置暂存浏览器本地。",
      enableRow: "启用插件",
      enableRowHint: "关闭后回退官方工作区浏览器（注册级，刷新页面生效）",
      enableSwitch: "启用",
      defaultIdeRow: "默认 IDE",
      defaultIdeHint: "点击工作区按钮栏「在 IDE 中打开」时调用的编辑器",
      ideCustom: "自定义命令…",
      customIdeTitle: "自定义 IDE 可执行文件路径 / 命令",
      customIdeFormatTitle: "💡 填写格式说明：",
      customIdeRule1: "• 仅输入可执行文件的绝对路径或命令名，系统会在点击打开时自动在末尾追加工作区路径。",
      customIdeRule2: "• 勿加引号：带空格的路径直接复制输入即可，不要包裹双引号。",
      customIdeRule3: "• 勿加参数与点：不要在末尾加 . 或其他路径参数。",
      customIdeExampleMac: "示例（macOS App 内部 CLI）：{path}",
      customIdeExamplePath: "示例（系统 PATH 中的命令）：{commands}",
      tombRow: "删除墓碑",
      tombRowHint: "「永久删除」的本地隐藏记录（localStorage）。树已会向 Host 校验物理存在自动作废误写墓碑；若仍疑似被误隐藏，可在此一键清空（不影响真实已删除的会话）",
      tombClear: "清空墓碑",
      tombCleared: "已清空 {n} 条墓碑",
      tombAlreadyEmpty: "墓碑本来就是空的",
      tombClearError: "清空失败：{message}",
      blankRow: "空壳会话",
      blankRowHint: "一键删除所有空壳会话（从未产生过任何对话的空白会话，官方从不自动回收）。判据取官方列表投影的 blank，并排除运行中、正在打开（含当前草稿）与子代理会话；物理删除并级联清理子代理与投影缓存，删不掉的会如实列出",
      blankDelete: "删除所有空壳会话",
      blankConfirmTitle: "删除所有空壳会话",
      blankConfirmDesc: "确定要删除全部空壳会话吗？仅删除从未产生过任何对话的空白会话（运行中、正在打开、子代理会话一律保留）。此操作会物理删除会话文件，无法恢复。",
      blankDone: "已删除 {n} 个空壳会话",
      blankNone: "没有可删除的空壳会话",
      blankError: "删除失败：{message}",
      resetDefault: "恢复默认",
      applyHint: "修改即时生效（启用开关除外）"
    };
    /** 英文字典：与 zh 同 key 集合。 */
    const en = {
      title: "Workspace tree",
      pageNav: "Sidebar",
      description: "Sidebar workspace browser: registered workspaces and sessions nested by directory, with a safe archive section and permanent deletion.",
      hostManaged: "Configuration is hosted by the Host (~/.dsh/settings.yaml › {ns}); it survives restarts and port changes.",
      hostManagedReadOnly: "Configuration is hosted by the Host (~/.dsh/settings.yaml › {ns}); currently read-only.",
      hostUnavailable: "The Host settings service is unavailable (older DSH); configuration is kept in this browser.",
      enableRow: "Enable plugin",
      enableRowHint: "When off, the official workspace browser returns (registration-level; takes effect after a page refresh)",
      enableSwitch: "Enable",
      defaultIdeRow: "Default IDE",
      defaultIdeHint: "Editor invoked by “Open in IDE” in the workspace action bar",
      ideCustom: "Custom command…",
      customIdeTitle: "Custom IDE executable path / command",
      customIdeFormatTitle: "💡 Format notes:",
      customIdeRule1: "• Enter only the executable's absolute path or command name; the workspace path is appended automatically when you click open.",
      customIdeRule2: "• No quotes: paste a path with spaces as-is, without wrapping it in double quotes.",
      customIdeRule3: "• No arguments or trailing dot: do not append . or other path arguments.",
      customIdeExampleMac: "Example (CLI inside a macOS app): {path}",
      customIdeExamplePath: "Example (command on PATH): {commands}",
      tombRow: "Deletion tombstones",
      tombRowHint: "Local hidden records of “permanently deleted” sessions (localStorage). The tree already verifies physical existence with the Host and voids mistaken tombstones; if a session still looks wrongly hidden, clear them here (real deleted sessions are unaffected)",
      tombClear: "Clear tombstones",
      tombCleared: "Cleared {n} tombstone(s)",
      tombAlreadyEmpty: "There were no tombstones",
      tombClearError: "Clear failed: {message}",
      blankRow: "Blank sessions",
      blankRowHint: "Permanently delete every blank session (a session that never produced any conversation; the official product never reclaims them). The predicate is the official list projection's `blank`, excluding running, currently-open (including the draft you are typing in) and subagent sessions; files are deleted for real along with their subagents and projection cache, and anything that cannot be deleted is reported",
      blankDelete: "Delete all blank sessions",
      blankConfirmTitle: "Delete all blank sessions",
      blankConfirmDesc: "Permanently delete every blank session? Only sessions that never produced any conversation are removed (running, currently-open and subagent sessions are always kept). This deletes session files from disk and cannot be undone.",
      blankDone: "Deleted {n} blank session(s)",
      blankNone: "No blank sessions to delete",
      blankError: "Delete failed: {message}",
      resetDefault: "Restore defaults",
      applyHint: "Changes apply immediately (except the enable switch)"
    };

    function ConfigRow({ label, hint, children }) {
      return h("div", { className: "dswt-configRow" }, [
        h("div", { className: "dswt-configCol" }, [
          h("div", { className: "dswt-configLabel" }, label),
          hint && h("div", { className: "dswt-configHint" }, hint)
        ]),
        h("div", { className: "dswt-configControl" }, children)
      ]);
    }
    function ConfigPanel({ t }) {
      const [lsCfg, setLsCfg] = useState(getConfig);
      const [, forceScope] = useState(0);
      const [tombMsg, setTombMsg] = useState("");
      /** 「删除所有空壳会话」：确认弹窗开关、执行中标志与结果文案。 */
      const [blankConfirm, setBlankConfirm] = useState(false);
      const [blankBusy, setBlankBusy] = useState(false);
      const [blankMsg, setBlankMsg] = useState("");
      const [blankFailures, setBlankFailures] = useState("");
      useEffect(() => subscribeConfig((next) => {
        const snap = safeScopeSnapshot(resolveSettingsScope());
        if (snap) setLsCfg(scopeValueToConfig(snap.value));
        else setLsCfg(next);
      }), []);
      useEffect(() => {
        maybeMigrateLegacyConfig();
        let scope = null;
        try { scope = resolveSettingsScope(); } catch { scope = null; }
        if (!scope || typeof scope.subscribe !== "function") return;
        const snap = safeScopeSnapshot(scope);
        if (snap) setLsCfg(scopeValueToConfig(snap.value));
        return scope.subscribe(() => {
          const s = safeScopeSnapshot(scope);
          if (s) setLsCfg(scopeValueToConfig(s.value));
          forceScope((x) => x + 1);
        });
      }, []);
      // Host 快照（每轮 render 重读：scope 可能晚于挂载出现）
      let hostSnap = null;
      try { hostSnap = safeScopeSnapshot(resolveSettingsScope()); } catch { hostSnap = null; }
      const useHost = !!hostSnap;
      const cfg = useHost ? scopeValueToConfig(hostSnap.value) : lsCfg;
      const readOnly = !!(useHost && hostSnap.writable === false);
      const upd = (patch) => { if (!readOnly) setEffectiveConfig(patch); };
      /** 手动清空删除墓碑（自愈失效时的兜底）：清 LS + 广播事件让侧栏树同步内存态。 */
      const onClearTombstones = () => {
        try {
          const n = loadSet(LS_DELETED).size;
          saveSet(LS_DELETED, new Set());
          window.dispatchEvent(new CustomEvent("dswt-tombstones-cleared"));
          setTombMsg(n > 0 ? t("tombCleared", { n }) : t("tombAlreadyEmpty"));
        } catch (e) {
          setTombMsg(t("tombClearError", { message: String((e && e.message) || e) }));
        }
      };
      /**
       * 一键删除所有空壳会话：判据与排除规则全在 Host 侧（官方列表投影的 blank +
       * 排除运行中 / 已 attach / 子代理），浏览器这边只负责确认、防重复点击与如实呈现。
       * 删掉的 id 经 `dswt-blank-deleted` 事件交给侧栏树记入墓碑并在官方列表收敛前保持隐藏。
       */
      const onDeleteBlankSessions = async () => {
        if (blankBusy) return;
        setBlankBusy(true);
        setBlankMsg("");
        setBlankFailures("");
        try {
          const r = await apiPost("/blank/deleteAll", { all: true });
          if (!r || r.ok !== true) throw new Error((r && r.error) || "删除失败");
          const deleted = Array.isArray(r.deleted) ? r.deleted : [];
          if (deleted.length > 0) {
            // 自己落墓碑（设置卡片可能先于侧栏树挂载，不能只靠事件），再广播事件让
            // 已挂载的树同步内存态；两条路径写同一个 LS 键。
            try {
              const next = loadSet(LS_DELETED);
              for (const id of deleted) next.add(String(id));
              saveSet(LS_DELETED, next);
            } catch { /* 墓碑写失败不影响删除结果本身 */ }
            window.dispatchEvent(new CustomEvent("dswt-blank-deleted", { detail: { ids: deleted } }));
            setBlankMsg(t("blankDone", { n: deleted.length }));
          } else {
            setBlankMsg(t("blankNone"));
          }
          const desc = describeDeleteFailures(r, "仍留在原处");
          if (desc) setBlankFailures(desc);
        } catch (e) {
          setBlankMsg(t("blankError", { message: String((e && e.message) || e) }));
        } finally {
          setBlankBusy(false);
          setBlankConfirm(false);
        }
      };
      const ideOptions = [
        ["vscode", "VS Code (code)"],
        ["codebuddy", "CodeBuddy CN (腾讯 CodeBuddy)"],
        ["cursor", "Cursor (cursor)"],
        ["windsurf", "Windsurf (windsurf)"],
        ["trae", "Trae (trae)"],
        ["webstorm", "WebStorm (webstorm)"],
        ["idea", "IntelliJ IDEA (idea)"],
        ["pycharm", "PyCharm (pycharm)"],
        ["zed", "Zed (zed)"],
        ["sublime", "Sublime Text (subl)"],
        ["custom", t("ideCustom")]
      ];
      const select = (value, options, onPick) => h("select", {
        className: "dswt-configSelect",
        value,
        disabled: readOnly,
        onChange: (e) => onPick(e.target.value)
      }, options.map(([v, l]) => h("option", { key: v, value: v }, l)));
      return h("div", { className: "dswt-config" }, [
        h("div", { className: "dswt-configCard" }, [
          h("div", { className: "dswt-configTitle" }, t("title")),
          h("div", { className: "dswt-configDesc" }, t("description")),
          h("div", { className: "dswt-configDesc dswt-configHost" }, useHost
            ? (readOnly ? t("hostManagedReadOnly", { ns: SETTINGS_NS }) : t("hostManaged", { ns: SETTINGS_NS }))
            : t("hostUnavailable")),
          h(ConfigRow, { label: t("enableRow"), hint: t("enableRowHint") },
            h(Switch, { checked: cfg.enabled, disabled: readOnly, onChange: (v) => upd({ enabled: v }), label: t("enableSwitch") })),
          h(ConfigRow, { label: t("defaultIdeRow"), hint: t("defaultIdeHint") },
            select(cfg.defaultIde || "vscode", ideOptions, (v) => upd({ defaultIde: v }))),
          cfg.defaultIde === "custom" && h("div", { className: "dswt-configIdeBox" }, [
            h("div", { className: "dswt-configIdeTitle" }, t("customIdeTitle")),
            h(Input, {
              type: "text",
              className: "dswt-configIdeInput",
              style: { fontFamily: "var(--ds-font-family-code)" },
              placeholder: "例如: /Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code",
              value: cfg.customIdeCommand || "",
              disabled: readOnly,
              onChange: (e) => upd({ customIdeCommand: e.target.value })
            }),
            h("div", { className: "dswt-configIdeNote" }, [
              h("div", { className: "dswt-configIdeNoteTitle" }, t("customIdeFormatTitle")),
              h("div", {}, t("customIdeRule1")),
              h("div", {}, t("customIdeRule2")),
              h("div", {}, t("customIdeRule3")),
              h("div", { className: "dswt-configIdeExample" }, t("customIdeExampleMac", { path: "/Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code" })),
              h("div", { className: "dswt-configIdeExample" }, t("customIdeExamplePath", { commands: "code-insiders / buddycn / nvim" }))
            ])
          ]),
          h(ConfigRow, { label: t("tombRow"), hint: t("tombRowHint") },
            h("div", { className: "dswt-configInline" }, [
              h(Button, { variant: "outline", size: "sm", onClick: onClearTombstones }, t("tombClear")),
              tombMsg && h("span", { className: "dswt-configSaved" }, tombMsg)
            ])),
          h(ConfigRow, { label: t("blankRow"), hint: t("blankRowHint") },
            h("div", { className: "dswt-configStack" }, [
              h("div", { className: "dswt-configInline" }, [
                h(Button, {
                  variant: "outline",
                  size: "sm",
                  className: "dswt-dangerBtn",
                  disabled: blankBusy,
                  onClick: () => { if (!blankBusy) { setBlankMsg(""); setBlankFailures(""); setBlankConfirm(true); } }
                }, blankBusy ? "处理中…" : t("blankDelete")),
                blankMsg && h("span", { className: "dswt-configSaved" }, blankMsg)
              ]),
              blankFailures && h("div", { className: "dswt-configError" }, blankFailures)
            ])),
          h("div", { className: "dswt-configActions" }, [
            h(Button, { variant: "outline", size: "sm", disabled: readOnly, onClick: () => { if (!readOnly) resetEffectiveConfig(); } }, t("resetDefault")),
            h("span", { className: "dswt-configSaved" }, t("applyHint"))
          ])
        ]),
        h(ConfirmModal, {
          key: "blankConfirm",
          open: blankConfirm,
          title: t("blankConfirmTitle"),
          desc: t("blankConfirmDesc"),
          confirmText: t("blankDelete"),
          danger: true,
          busy: blankBusy,
          onCancel: () => { if (!blankBusy) setBlankConfirm(false); },
          onConfirm: onDeleteBlankSessions
        })
      ]);
    }

    // ══════════════ 错误边界 ══════════════
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error) {
        try { console.error("[workspace-tree] 渲染错误:", error); } catch { /* ignore */ }
      }
      render() {
        if (this.state.error !== null) {
          const message = (this.state.error && this.state.error.message) ? this.state.error.message : String(this.state.error);
          return h("div", { className: "dswt-error" }, "工作区树渲染错误: " + message);
        }
        return this.props.children;
      }
    }

    // ══════════════ 归档只读底部栏 ══════════════
    function ReadonlyArchivedComposerBanner(props) {
      const { sessionId, ctx } = props;
      const sid = sessionId || (ctx?.sessions?.list?.getSnapshot ? currentSessionIdOf(ctx.sessions.list.getSnapshot()) : null);
      const [busy, setBusy] = useState(false);

      const onRestore = useCallback(async () => {
        if (busy || !sid) return;
        setBusy(true);
        try {
          await unarchiveSessionVia(ctx, sid);
          // 同步清除本地删除墓碑：已删除/已恢复两端可见性一致
          try {
            const cur = loadSet(LS_DELETED);
            if (cur.delete(String(sid))) saveSet(LS_DELETED, cur);
          } catch { /* ignore */ }
          if (ctx && ctx.sessions && typeof ctx.sessions.refresh === "function") {
            ctx.sessions.refresh();
          }
        } catch (e) {
          console.error("恢复归档会话失败:", e);
        } finally {
          setBusy(false);
        }
      }, [busy, sid, ctx]);

      return h("div", { className: "dswt-archivedComposerRoot" }, [
        h("div", { className: "dswt-archivedComposerBanner" }, [
          h("span", { className: "dswt-archivedComposerIcon" }, "📦"),
          h("span", { className: "dswt-archivedComposerText" }, "当前会话已归档（只读模式）"),
          h("button", {
            type: "button",
            className: "dswt-archivedComposerBtn",
            disabled: busy,
            onClick: onRestore
          }, busy ? "恢复中…" : "恢复会话")
        ])
      ]);
    }

    //#region shared sidebar settings page shell
    /**
     * The shared 「侧边栏」 settings page.
     *
     * Several plugins contribute their configuration to ONE settings page, but the
     * kernel cannot declare that page jointly: `settings.section` is a list slot
     * that rejects a duplicate `id` at the same priority ("already has an entry
     * with id"), and a child slot may be declared exactly once ("slot … is already
     * declared"). Composing several cards into one page therefore takes one
     * declarer, so every participating plugin carries this same shell and the FIRST
     * one to activate claims the page; the others register their card into
     * SIDEBAR_ITEM_SLOT and wait for the winner's declaration through
     * `slots.inject`. Uninstalling the winner promotes another participant on the
     * next boot, so no participant is a fixed owner.
     *
     * The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
     * child slot's own registrations (id + `label` + `order`, the same shape the
     * kernel's own Plugins page uses for its tabs), and each panel dispatches
     * through `renderSlot(SIDEBAR_ITEM_SLOT, {}, { only: id })`. Every panel stays
     * mounted but hidden, so a card's local state survives a tab switch.
     *
     * The panel element is a plain `div`: every participant's card already owns its
     * own chrome (title rows, groups, forms), so the shared page only stacks them.
     *
     * Keep this region identical to the one in `dsh-workspace-tree`'s
     * `lib/client.js` apart from line indentation and the leading `export` this
     * module keeps for the build to strip. Participants own their own card
     * component, locale dictionaries, settings namespace and Host half — only the
     * page shell is shared, because cross-plugin value imports are forbidden by the
     * client bundle purity gate. It needs nothing but `React` on purpose, so every
     * participant's build configuration compiles it unchanged.
     */
    /** Page id claimed by the first participating plugin to activate. */
    const SIDEBAR_PAGE_ID = 'sidebar'
    /** Sidebar position of the shared page; own plugins start at 110. */
    const SIDEBAR_PAGE_ORDER = 130
    /** The page's one child slot: every participant's card registers here. */
    const SIDEBAR_ITEM_SLOT = 'sidebar.settings.item'

    /**
     * Tab chrome mirrors the kernel's own settings tabs (`.tabs` / `.tab` in
     * `ui-settings-plugins`): tertiary label, 13px, 22px gutter. The marker is the
     * ACTIVE TAB'S OWN bottom border and the bar draws no rail of its own — a
     * shared underline reads as "every tab is selected".
     */
    const TABLIST_STYLE = {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '22px',
      marginTop: '2px',
      marginBottom: '16px',
    }

    const TAB_STYLE = {
      appearance: 'none',
      background: 'transparent',
      border: 'none',
      position: 'relative',
      padding: '7px 1px 11px',
      cursor: 'pointer',
      font: 'var(--dsw-font-xs-13)',
      color: 'var(--dsw-alias-label-tertiary)',
    }

    const TAB_ACTIVE_STYLE = Object.assign({}, TAB_STYLE, {
      color: 'var(--dsw-alias-label-primary)',
    })

    /** The kernel's own tab marker: a 2px rounded bar under the active label. */
    const TAB_MARKER_STYLE = {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '2px',
      borderRadius: '2px 2px 0 0',
      background: 'var(--dsw-alias-label-primary)',
    }

    /**
     * Panels stay mounted (hidden) so each card keeps its local state. `display:
     * none` is written explicitly because a card's own styles commonly set
     * `display: flex` while the section's stylesheet loads after this one.
     */
    const PANEL_STYLE = { margin: 0 }
    const PANEL_HIDDEN_STYLE = { margin: 0, display: 'none' }

    /** A registration label is a plain string or a thunk re-read per projection. */
    const readLabel = function (label) {
      if (typeof label === 'function') return label()
      return typeof label === 'string' ? label : ''
    }

    /**
     * Build the live tab roster over the child slot's registrations. `locale` is
     * read through `ctx.get`: a participant needs it only to re-read localized
     * labels on a language switch, and reaching an undeclared service as
     * `ctx.locale` would trip the kernel's inject guard. Every participant passes a
     * bound translator as its `label` thunk, so the label re-reads the active
     * language on each projection.
     *
     * @param ctx - browser context carrying the slot registry.
     * @returns The tab store consumed by the page component.
     */
    const createSidebarTabs = function (ctx) {
      const locale = ctx.get('locale')
      let version = -1
      let revision = -1
      let tabs = []
      return {
        getSnapshot: function () {
          const nextVersion = ctx.slots.getVersion(SIDEBAR_ITEM_SLOT)
          const nextRevision = locale === undefined ? 0 : locale.getSnapshot().revision
          if (nextVersion === version && nextRevision === revision) return tabs
          version = nextVersion
          revision = nextRevision
          tabs = ctx.slots.entries(SIDEBAR_ITEM_SLOT)
            .map(function (entry) {
              return {
                id: entry.options.id === undefined ? '' : entry.options.id,
                order: entry.options.order === undefined ? 0 : entry.options.order,
                label: readLabel(entry.options.label),
              }
            })
            .sort(function (left, right) { return left.order - right.order })
          return tabs
        },
        subscribe: function (listener) {
          const offSlots = ctx.slots.subscribe(SIDEBAR_ITEM_SLOT, listener)
          const offLocale = locale === undefined ? undefined : locale.subscribe(listener)
          return function () {
            offSlots()
            if (offLocale !== undefined) offLocale()
          }
        },
      }
    }

    /**
     * Page body: one tab per registered card, plus the selected card's panel.
     * The shell supplies the section's own seats and `renderSlot` bound to the
     * child slot declared at registration time.
     */
    const SidebarSettingsSection = function (props) {
      const renderSlot = props.renderSlot
      const sidebarTabs = props.sidebarTabs
      const tabs = React.useSyncExternalStore(
        sidebarTabs.subscribe,
        sidebarTabs.getSnapshot,
        sidebarTabs.getSnapshot,
      )
      const requestedState = React.useState(null)
      const requested = requestedState[0]
      const setRequested = requestedState[1]
      const selected = requested !== null && tabs.some(function (tab) { return tab.id === requested })
        ? requested
        : (tabs.length > 0 ? tabs[0].id : null)
      if (selected === null) return null
      return React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { role: 'tablist', style: TABLIST_STYLE },
          tabs.map(function (tab) {
            const active = tab.id === selected
            return React.createElement(
              'button',
              {
                key: tab.id,
                type: 'button',
                role: 'tab',
                'aria-selected': active,
                style: active ? TAB_ACTIVE_STYLE : TAB_STYLE,
                onClick: function () { setRequested(tab.id) },
              },
              tab.label,
              active ? React.createElement('span', { style: TAB_MARKER_STYLE, 'aria-hidden': true }) : null,
            )
          }),
        ),
        tabs.map(function (tab) {
          const active = tab.id === selected
          return React.createElement(
            'div',
            {
              key: tab.id,
              role: 'tabpanel',
              hidden: !active,
              style: active ? PANEL_STYLE : PANEL_HIDDEN_STYLE,
            },
            renderSlot(SIDEBAR_ITEM_SLOT, {}, { only: tab.id }),
          )
        }),
      )
    }

    /** Whether a participant already holds the shared page. */
    const sidebarPageClaimed = function (ctx) {
      return ctx.slots.entries('settings.section').some(function (entry) {
        return entry.options.id === SIDEBAR_PAGE_ID
      })
    }

    /**
     * Claim the shared page when no participant holds it yet. Call inside
     * `ctx.slots.inject('settings.section', …)`: injection order decides the
     * winner, and the losers stay silent instead of colliding with the kernel's
     * duplicate-id and duplicate-declaration guards.
     *
     * @param ctx - browser context carrying the slot registry.
     * @param label - page label of the claiming participant, re-read by the shell
     * on every projection so a language switch reaches the sidebar too.
     * @returns The page registration's disposer, or a no-op when another
     * participant already holds the page.
     */
    const claimSidebarSettingsPage = function (ctx, label) {
      if (sidebarPageClaimed(ctx)) return function () {}
      const sidebarTabs = createSidebarTabs(ctx)
      const children = {}
      children[SIDEBAR_ITEM_SLOT] = { kind: 'list', scope: 'root' }
      return ctx.slots.register({
        name: 'settings.section',
        id: SIDEBAR_PAGE_ID,
        order: SIDEBAR_PAGE_ORDER,
        label: label,
        inject: function () { return { sidebarTabs: sidebarTabs } },
        children: children,
      }, SidebarSettingsSection)
    }
    //#endregion

    // ══════════════ 注册 ══════════════
    function apply(ctx) {
      // 设置页文案字典：注册早于侧边栏卡片注册，且早于 enabled 早退，保证禁用态下卡片仍能取到文案。
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-workspace-tree: dictionaries");
      const t = ctx.locale.bind(NS);
      // 记住 ctx 供配置读写运行时探测 settingsScope（不声明硬依赖，旧版 DSH 回退 LS）。
      settingsScopeCtx = ctx;
      ctx.effect(() => () => { settingsScopeCtx = null; releaseSettingsScope(); }, "dsh-workspace-tree: scope ctx");
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-workspace-tree", "true");
      document.head.appendChild(styleEl);
      styleEl.textContent = CSS;
      ctx.effect(() => () => styleEl.remove(), "dsh-workspace-tree: styles");

      // 设置页「侧边栏」（设置 > 侧边栏 > 工作区树）：本插件与 dsh-mattpocock-skills-deck
      // 共用一页，先激活者当选页面宿主并声明 sidebar.settings.item 子槽，另一位只把卡片
      // 注册进该子槽（机制见上方共享壳 region）。
      ctx.slots.inject("settings.section", () => claimSidebarSettingsPage(ctx, () => t("pageNav")));
      ctx.slots.inject(SIDEBAR_ITEM_SLOT, () => ctx.slots.register({
        name: SIDEBAR_ITEM_SLOT,
        id: SETTINGS_NS,
        order: 10,
        label: () => t("title"),
        locale: NS
      }, ConfigPanel));

      /**
       * 会话/目录导航方法（startSession / pickDirectory）的宿主服务：
       * DSH 中由 uiWorkspace 服务（UiWorkspaceService）提供。
       */
      function resolveUiWorkspace() {
        // ctx.get(name) 无需 inject 声明即可读服务存储；但属性访问（ctx.uiWorkspace）
        // 在未 inject 时会被 cordis 代理直接抛 "cannot get property without inject"，
        // 必须整体包裹 try（否则 apply() 启动即崩溃、拖垮整个 shell）。
        try {
          const svc = ctx.get("uiWorkspace");
          if (svc) return svc;
        } catch { /* ignore */ }
        try { return ctx.uiWorkspace || null; } catch { return null; }
      }

      // 允许阅览已归档会话：官方 UiWorkspaceService 的 clearArchivedCurrent() 会在当前
      // 会话被归档时把它清出主视图，patch 为无操作以保留阅览。uiWorkspace 未声明为硬依赖，
      // apply 时刻可能早于其注册：立即尝试 patch，未就绪则监听 cordis 的 internal/service
      // 注册事件，服务出现后补 patch。
      const patchUiWorkspaceArchivedView = () => {
        const svc = resolveUiWorkspace();
        if (svc && typeof svc.clearArchivedCurrent === "function") {
          svc.clearArchivedCurrent = function() { return false; };
          return true;
        }
        return false;
      };
      if (!patchUiWorkspaceArchivedView()) {
        ctx.effect(() => ctx.on("internal/service", (name) => {
          if (name === "uiWorkspace") patchUiWorkspaceArchivedView();
        }));
      }

      // 启用开关走有效配置（Host 就绪即读 settings，否则回退 LS）。
      // 注意：apply 时刻 scope 可能仍在 loading，此处是启动快照；运行中关闭
      // 仍需刷新页面回退官方栏（设置页有同等提示）。
      if (!getEffectiveConfig().enabled) return;

      // 归档会话只读接管：通过 conversation.composer chain slot 替换输入框为只读条
      ctx.slots.inject("conversation.composer", () => ctx.slots.register({
        name: "conversation.composer",
        priority: -100,
        select: (owner) => {
          // chain 座位把当前会话作为 ownerProps 传进来；快照兜底只用于 owner 缺 sessionId 的场景。
          const cur = (owner && owner.sessionId)
            || (ctx.sessions?.list?.getSnapshot ? currentSessionIdOf(ctx.sessions.list.getSnapshot()) : null);
          if (!cur) return null;
          const wsList = ctx.workspaces?.list?.getSnapshot ? ctx.workspaces.list.getSnapshot() : null;
          const archivedIds = (wsList && wsList.archivedSessionIds) || [];
          if (archivedIds.map(String).includes(String(cur))) {
            return { sessionId: cur };
          }
          return null;
        }
      }, (props) => h(ReadonlyArchivedComposerBanner, { ...props, ctx })));

      ctx.slots.inject("sidebar.workspaces", () => {
        const component = (props) => h(ErrorBoundary, null, h(WorkspaceTreeBrowser, props));
        const options = {
          name: "sidebar.workspaces",
          priority: -1,
          inject: () => {
            // uiWorkspace 每次调用时重新解析（不再一次性缓存）：插件激活与 slot 注入的
            // 时刻可能早于该服务注册（未声明为硬依赖），延迟到使用点才能可靠拿到。
            return {
              startSession: (workspaceId) => {
                const uiWs = resolveUiWorkspace();
                if (!uiWs || typeof uiWs.startSession !== "function") {
                  console.warn("[dsh-workspace-tree] uiWorkspace.startSession 不可用，无法新建会话");
                  return;
                }
                uiWs.startSession(workspaceId);
              },
              open: (sessionId) => {
                // 打开会话是 uiWorkspace 的导航职责（0.1.6 已移除 sessions.open）。
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.openSession === "function") uiWs.openSession(sessionId);
              },
              clearSession: () => {
                // 清空主视图（0.1.6 已移除 sessions.clear）。
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.clearMain === "function") uiWs.clearMain();
              },
              renameSession: async (sessionId, title) => {
                // 0.1.6 契约：重命名先经 sessions.using() 租用会话作用域——binding(id)
                // 只读已租用代，不再为其物化 scope。
                await ctx.sessions.using(sessionId, { source: "workspaceOperation" }, async (reference) => {
                  const result = await reference.binding.session.rename(title);
                  if (!result.ok) throw new Error(result.error?.message || "重命名失败");
                });
              },
              renameWorkspace: async (workspaceId, title) => {
                if (ctx.workspaces && typeof ctx.workspaces.rename === "function") {
                  await ctx.workspaces.rename(workspaceId, title);
                  return;
                }
                throw new Error("工作区重命名服务不可用（当前 DSH 版本不支持）");
              },
              archiveSession: async (sessionId) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.archiveSession === "function") {
                  await uiWs.archiveSession(sessionId);
                  return;
                } else if (ctx.workspaces && typeof ctx.workspaces.archiveSession === "function") {
                  await ctx.workspaces.archiveSession(sessionId);
                  return;
                }
                throw new Error("会话归档服务不可用（当前 DSH 版本不支持）");
              },
              unarchiveSession: (sessionId) => unarchiveSessionVia(ctx, sessionId),
              /**
               * 官方会话检索：按当前可见会话消息内容检索，Host 决定结果上限。
               * 与官方 WorkspaceBrowser 同一入口（`sessions.search` + `searchResultLimit`）。
               */
              searchSessions: async (query, signal) => {
                const result = await ctx.sessions.search(query, signal);
                if (!result || result.ok !== true) throw new Error((result && result.error && result.error.message) || "会话检索失败");
                return result.value;
              },
              searchResultLimit: ctx.sessions && typeof ctx.sessions.searchResultLimit === "number" ? ctx.sessions.searchResultLimit : 20,
              /** 官方注册表内的工作区顺序调整（Host 持久 order）——拖拽排序用。 */
              insertWorkspaceBefore: (workspaceId, beforeWorkspaceId) => {
                if (ctx.workspaces && typeof ctx.workspaces.insertBefore === "function") {
                  return ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId);
                }
                return Promise.reject(new Error("工作区排序服务不可用（当前 DSH 版本不支持）"));
              },
              createWorkspace: (input) => {
                if (ctx.workspaces && typeof ctx.workspaces.create === "function") {
                  return ctx.workspaces.create(input);
                }
                return Promise.reject(new Error("工作区服务不可用"));
              },
              /**
               * 活快照读一行（归档门槛复查用）。比渲染时物化的 props 更新：store 一变更就能
               * 读到，不必等 React 重渲染——点击落在「运行位刚翻真、界面还没重渲染」的窗口里
               * 时，靠它把判据拉到最新。缺行/服务缺席返回 null，由调用方回退渲染快照。
               */
              liveSessionRow: (sessionId) => {
                try {
                  const snap = ctx.sessions?.list?.getSnapshot ? ctx.sessions.list.getSnapshot() : null;
                  return (snap && snap.byId) ? (snap.byId[sessionId] || null) : null;
                } catch { return null; }
              },
              // 官方 RPC workspace/delete：仅注销注册表记录，不删磁盘目录与会话文件
              // （旧版 DSH 无此方法时抛错，调用方降级为仅隐藏）。
              deleteWorkspace: (workspaceId) => {
                if (ctx.workspaces && typeof ctx.workspaces.delete === "function") {
                  return ctx.workspaces.delete(workspaceId);
                }
                return Promise.reject(new Error("工作区注销服务不可用（当前 DSH 版本不支持）"));
              },
              // 官方目录选择面（UiWorkspaceService 转发 remote.directoryPicker）：
              //  - pickDirectory：native 系统选择器，只有回环绑定主机挂载；browse 主机
              //    会被 host 以 directory-picker/unavailable 拒绝（"directoryPicker.pick
              //    needs the native capability; the composed picker serves \"browse\""）；
              //  - listDirectory / createDirectory：browse 原语，局域网/远端绑定主机的
              //    唯一目录面，插件自持的浏览对话框就架在这两个原语上。
              pickDirectory: async () => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.pickDirectory === "function") {
                  return await uiWs.pickDirectory();
                }
                // 没有可用的目录选择服务时报错；调用方走 uiWorkspace.pickDirectory()。
                throw new Error("目录选择服务不可用");
              },
              listDirectory: (path, signal) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.listDirectory === "function") {
                  return uiWs.listDirectory(path, signal);
                }
                throw new Error("当前 DSH 版本不支持目录浏览（uiWorkspace.listDirectory）；请升级 DSH。");
              },
              createDirectory: (path, dirName) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.createDirectory === "function") {
                  return uiWs.createDirectory(path, dirName);
                }
                throw new Error("当前 DSH 版本不支持新建文件夹（uiWorkspace.createDirectory）；请升级 DSH。");
              },
              refreshSessions: () => {
                try {
                  if (typeof ctx.sessions?.refresh === "function") ctx.sessions.refresh();
                } catch { /* ignore */ }
              }
          };
        }
        };
        return ctx.slots.register(options, component);
      });
    }

    // ══════════════ 主题原生 CSS（完全基于 DSH 设计变量体系） ══════════════
    const CSS = `
      .dswt-root {
        --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding, 8px);
        box-sizing: border-box;
        min-height: 0;
        padding-right: var(--dsh-session-list-edge-inset);
        flex-direction: column;
        flex: 1;
        display: flex;
      }
      .dswt-sectionHeader {
        box-sizing: border-box;
        height: 36px;
        color: var(--dsw-alias-label-tertiary);
        border-radius: 12px;
        flex: none;
        justify-content: flex-end;
        align-items: center;
        gap: 4px;
        margin-bottom: 4px;
        padding-left: 4px;
        display: flex;
        overflow: hidden;
      }
      .dswt-modeTitle {
        position: relative;
        flex: none;
        margin-right: auto;
        margin-left: 4px;
        padding: 4px 10px;
        border-radius: 8px;
        cursor: pointer;
        user-select: none;
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-secondary);
        overflow: hidden;
      }
      .dswt-modeTitle:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-titleItem {
        display: inline-block;
        white-space: nowrap;
      }
      .dswt-titleIn {
        animation: dswt-title-in .24s var(--ds-ease-in-out, ease);
      }
      .dswt-titleOut {
        position: absolute;
        left: 10px;
        top: 4px;
        animation: dswt-title-out .24s var(--ds-ease-in-out, ease) forwards;
        pointer-events: none;
      }
      @keyframes dswt-title-in {
        from { transform: translateX(16px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes dswt-title-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(-16px); opacity: 0; }
      }
      .dswt-headerActions {
        flex: none;
        align-items: center;
        gap: 4px;
        display: flex;
      }
      .dswt-headBtn {
        cursor: pointer;
        width: 28px;
        height: 28px;
        color: var(--dsw-alias-label-secondary);
        background: transparent;
        border: none;
        border-radius: 50%;
        flex: none;
        justify-content: center;
        align-items: center;
        padding: 0;
        display: inline-flex;
      }
      .dswt-headBtn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-headBtnActive {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-brand-primary);
      }
      .dswt-archiveRoot {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dswt-archiveToolbar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 12px;
      }
      .dswt-archiveToolbarTop {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dswt-archiveCount {
        font-size: 12px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary);
      }
      .dswt-archiveToolbarActions {
        display: flex;
        gap: 8px;
      }
      .dswt-archiveBtn {
        flex: 1;
        height: 28px;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l1);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
      }
      .dswt-archiveBtnSecondary {
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-archiveBtnSecondary:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-archiveBtnDanger {
        background: var(--dsw-alias-state-error-primary);
        border-color: var(--dsw-alias-state-error-primary);
        color: #fff;
      }
      .dswt-archiveBtnDanger:hover {
        filter: brightness(.94);
      }
      .dswt-archiveBtn:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
      .dswt-archivedRow {
        opacity: .96;
      }
      .dswt-archivedRow:hover {
        opacity: 1;
      }
      .dswt-list {
        min-height: 0;
        margin-left: -4px;
        margin-right: var(--dsh-session-list-scrollbar-offset, 2px);
        padding-left: 4px;
        padding-right: calc(var(--dsh-session-list-edge-inset) - 8px - 2px);
        scrollbar-gutter: stable;
        flex: 1;
        padding-bottom: 16px;
        overflow-y: auto;
      }
      .dswt-groupSection {
        position: relative;
      }
      .dswt-groupSection + .dswt-groupSection {
        margin-top: 4px;
      }
      .dswt-groupBody {
        position: relative;
      }
      .dswt-groupBody::before {
        content: "";
        position: absolute;
        left: var(--dswt-line-x, 3px);
        top: 4px;
        bottom: 4px;
        width: 1px;
        background: var(--dsw-alias-border-l1);
      }
      .dswt-groupBody > * + * {
        margin-top: 2px;
      }
      .dswt-projectRow, .dswt-session {
        cursor: pointer;
        user-select: none;
        color: var(--dsw-alias-label-primary);
        border-radius: 8px;
        align-items: center;
        gap: 6px;
        padding: 0 8px;
        display: flex;
        box-sizing: border-box;
        position: relative;
      }
      .dswt-projectRow {
        height: 34px;
      }
      .dswt-session {
        height: 32px;
        animation: dswt-row-in .15s var(--ds-ease-in-out, ease);
        gap: 0;
      }
      .dswt-projectRow:hover, .dswt-session:hover, .dswt-session.dswt-selected {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      @keyframes dswt-row-in {
        0% { opacity: 0; }
      }
      .dswt-slot {
        width: 16px;
        height: 20px;
        color: var(--dsw-alias-label-tertiary);
        flex: none;
        justify-content: center;
        align-items: center;
        display: inline-flex;
      }
      .dswt-aggSlot {
        width: 12px;
      }
      .dswt-folderIcon {
        color: var(--dsw-alias-label-tertiary);
        position: relative;
      }
      .dswt-folderIcon .dswt-chevronOverlay {
        position: absolute;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        color: var(--dsw-alias-label-caption);
        cursor: pointer;
      }
      .dswt-projectRow:hover .dswt-chevronOverlay {
        display: inline-flex;
      }
      .dswt-projectRow:has(.dswt-chevronOverlay):hover .dswt-folderSvg {
        display: none;
      }
      .dswt-chevronOverlay.dswt-arrowOpen svg {
        transform: rotate(90deg);
      }
      .dswt-folderActive {
        color: var(--dsw-alias-state-business-primary);
      }
      .dswt-projectText {
        flex-direction: column;
        flex: 1;
        gap: 2px;
        min-width: 0;
        display: flex;
      }
      .dswt-title {
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        font-size: 14px;
        line-height: 20px;
        overflow: hidden;
      }
      .dswt-session .dswt-title {
        scroll-behavior: smooth;
        flex: 1;
        margin: 0 6px 0 4px;
      }
      /* 悬停时去掉省略号：滚动露出的尾部才不会被省略号跟着挡住（官方同款）。 */
      @media (hover: hover) {
        .dswt-session:hover .dswt-title {
          text-overflow: clip;
        }
      }
      .dswt-time {
        color: var(--dsw-alias-label-tertiary);
        flex: none;
        font-size: 12px;
        line-height: 20px;
      }
      .dswt-rowActions {
        flex: none;
        align-items: center;
        gap: 2px;
        display: none;
      }
      .dswt-projectRow:hover .dswt-rowActions, .dswt-session:hover .dswt-rowActions {
        display: inline-flex;
      }
      .dswt-session:hover .dswt-time {
        display: none;
      }
      .dswt-iconButton {
        cursor: pointer;
        width: 20px;
        height: 20px;
        color: var(--dsw-alias-label-tertiary);
        background: transparent;
        border: none;
        border-radius: 4px;
        flex: none;
        justify-content: center;
        align-items: center;
        padding: 0;
        display: inline-flex;
      }
      .dswt-iconButton:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-iconButton.dswt-danger:hover {
        color: var(--dsw-alias-state-error-primary);
      }
      /* 破坏性确认按钮：结构交给官方 Button，只把文字与描边染成错误色。 */
      .dswt-dangerBtn {
        color: var(--dsw-alias-state-error-primary);
        border-color: var(--dsw-alias-state-error-primary);
      }
      .dswt-empty {
        color: var(--dsw-alias-label-tertiary);
        padding: 16px 12px;
        font-size: 13px;
      }
      .dswt-blank {
        color: var(--dsw-alias-label-tertiary);
      }
      .dswt-rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 4px;
      }
      .dswt-rail-btn {
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        border-radius: 8px;
        cursor: pointer;
      }
      .dswt-rail-btn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-error {
        color: var(--dsw-alias-state-error-primary);
        padding: 10px 12px;
        font-size: 12px;
        line-height: 18px;
        white-space: pre-wrap;
      }
      .dswt-config {
        padding: 4px 20px 28px;
        max-width: 620px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .dswt-configCard {
        background: var(--dsw-alias-bg-layer-1);
        border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dswt-configTitle {
        font: var(--dsw-font-s-strong-14);
        color: var(--dsw-alias-label-primary);
        margin: 0;
      }
      .dswt-configDesc {
        font: var(--dsw-font-xs-13);
        color: var(--dsw-alias-label-secondary);
        margin: 0;
      }
      .dswt-configHost {
        margin-top: 4px;
        color: var(--dsw-alias-label-tertiary);
      }
      .dswt-configRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
      }
      .dswt-configCol {
        flex: 1;
        min-width: 0;
      }
      .dswt-configLabel {
        font: var(--dsw-font-xs-13);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-configHint {
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-tertiary);
        margin-top: 2px;
      }
      .dswt-configControl {
        flex: none;
      }
      .dswt-configSelect {
        box-sizing: border-box;
        height: 32px;
        padding: 0 10px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        font: var(--dsw-font-xs-13);
        outline: none;
      }
      .dswt-configSelect:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary);
      }
      .dswt-configInline {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      /* 控件 + 结果文案的纵向堆叠：错误详情换到按钮下方，不挤窄控件列。 */
      .dswt-configStack {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        max-width: 420px;
      }
      .dswt-configError {
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-state-error-primary);
        text-align: right;
      }
      .dswt-configIdeBox {
        background: var(--dsw-alias-bg-layer-2);
        border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dswt-configIdeTitle {
        font: var(--dsw-font-xs-strong-13);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-configIdeInput {
        box-sizing: border-box;
        width: 100%;
      }
      .dswt-configIdeNote {
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-secondary);
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .dswt-configIdeNoteTitle {
        color: var(--dsw-alias-label-primary);
        font-weight: 500;
      }
      .dswt-configIdeExample {
        color: var(--dsw-alias-label-tertiary);
      }
      .dswt-configActions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 2px;
      }
      .dswt-configSaved {
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-tertiary);
      }
      /* ══════════════ 目录选择弹窗（browse 面自持） ══════════════ */
      .dswt-pickerPanel {
        min-width: 480px;
        max-width: 560px;
        height: min(560px, calc(100vh - 96px));
      }
      .dswt-fieldInput {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
      }
      .dswt-pickerCrumbs {
        display: flex;
        align-items: center;
        gap: 2px;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        padding-bottom: 2px;
        scrollbar-width: thin;
      }
      .dswt-crumb {
        flex: none;
        height: 24px;
        padding: 0 6px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        line-height: 24px;
        cursor: pointer;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dswt-crumb:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .dswt-crumbActive {
        color: var(--dsw-alias-label-primary);
        font-weight: 600;
      }
      .dswt-crumbUp {
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
      }
      .dswt-crumb:disabled {
        cursor: default;
        opacity: 1;
      }
      .dswt-pickerPathRow {
        display: flex;
        gap: 8px;
      }
      .dswt-pickerPathInput {
        flex: 1;
        min-width: 0;
        height: 32px;
        font-size: 13px;
        font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
      }
      .dswt-pickerList {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-2);
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .dswt-pickerRow {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        height: 30px;
        padding: 0 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
        text-align: left;
        cursor: pointer;
      }
      .dswt-pickerRow:hover:not(:disabled) {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-pickerRow:disabled {
        opacity: .55;
        cursor: default;
      }
      .dswt-pickerRowHidden {
        color: var(--dsw-alias-label-tertiary);
      }
      .dswt-pickerRowName {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dswt-pickerEmpty {
        padding: 16px 8px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 13px;
        text-align: center;
      }
      .dswt-pickerError {
        font-size: 12px;
        line-height: 18px;
        color: var(--dsw-alias-state-error-primary);
        word-break: break-all;
      }
      .dswt-pickerSpacer {
        flex: 1;
      }
      .dswt-pickerNewDir {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
      }
      .dswt-pickerNewInput {
        flex: 1;
        min-width: 0;
        height: 32px;
        font-size: 13px;
      }
      @media (prefers-reduced-motion: reduce) {
        .dswt-session { transition: none; animation: none; }
        .dswt-session .dswt-title { scroll-behavior: auto; }
      }

      /* ══════════════ 视图选项菜单 / 搜索 / 拖拽 / Hover 卡 ══════════════ */
      .dswt-searchBox {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        height: 28px;
        padding: 0 4px;
        border: 0.5px solid var(--dsw-alias-border-l4);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
      }
      .dswt-searchGlyph {
        color: var(--dsw-alias-label-tertiary);
        flex: none;
      }
      .dswt-searchInput {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
        line-height: 18px;
      }
      .dswt-searchNote {
        padding: 8px 12px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 18px;
      }
      .dswt-searchRow {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        min-height: 48px;
        padding: 4px 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--dsw-alias-label-primary);
        text-align: left;
        cursor: pointer;
      }
      .dswt-searchRow:hover, .dswt-searchRow.dswt-selected {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-searchHead {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .dswt-searchTitle {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 20px;
      }
      .dswt-searchMeta {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        margin-left: 16px;
      }
      .dswt-searchWs {
        flex: none;
        max-width: 40%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        line-height: 17px;
      }
      .dswt-searchSnippet {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 17px;
      }
      .dswt-flatList {
        display: flex;
        flex-direction: column;
      }
      .dswt-flatList > * + * {
        margin-top: 2px;
      }
      .dswt-moreBtn {
        box-sizing: border-box;
        width: 100%;
        height: 28px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12px;
        line-height: 20px;
        text-align: left;
        cursor: pointer;
      }
      .dswt-moreBtn:hover {
        color: var(--dsw-alias-label-secondary);
      }
      .dswt-schedule {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 20px;
        margin-right: 6px;
        flex: none;
        color: var(--dsw-alias-label-tertiary);
      }
      .dswt-dropBefore, .dswt-dropAfter {
        position: relative;
      }
      .dswt-dropBefore:before, .dswt-dropAfter:after {
        content: "";
        position: absolute;
        left: 0;
        right: 4px;
        height: 2px;
        border-radius: 1px;
        background: var(--dsw-alias-state-business-primary);
        pointer-events: none;
      }
      .dswt-dropBefore:before {
        top: -2px;
      }
      .dswt-dropAfter:after {
        bottom: -2px;
      }
      /* Hover 卡的内容坐在官方卡片自持的深色面上（HoverCard 的卡片底色与主题无关），
         因此文字色随官方 Rows 模块的同款字面值，不走主题别名。 */
      .dswt-hoverContent {
        --dswt-hover-fg: #FFFFFF;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .dswt-hoverTitle {
        color: var(--dswt-hover-fg);
        font-size: 14px;
        line-height: 20px;
        overflow-wrap: break-word;
      }
      .dswt-hoverPath {
        color: var(--dswt-hover-fg);
        opacity: .82;
        font-size: 12px;
        line-height: 16px;
        word-break: break-all;
      }
      .dswt-hoverMeta {
        color: var(--dswt-hover-fg);
        opacity: .82;
        font-size: 12px;
        line-height: 16px;
      }
      .dswt-hoverStatus {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--dswt-hover-fg);
        opacity: .66;
        font-size: 12px;
        line-height: 20px;
      }

      /* ══════════════ 归档只读底部栏 ══════════════ */
      .dswt-archivedComposerRoot {
        box-sizing: border-box;
        width: 100%;
        max-width: var(--dsh-composer-card-max-width, 780px);
        margin: 0 auto;
        padding: 8px 16px 16px;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .dswt-archivedComposerBanner {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
        border-radius: 20px;
        padding: 8px 16px;
        box-shadow: var(--dsw-shadow-lv1, 0 1px 3px rgba(0, 0, 0, 0.1));
      }
      .dswt-archivedComposerIcon {
        font-size: 15px;
        flex: none;
        display: inline-flex;
      }
      .dswt-archivedComposerText {
        color: var(--dsw-alias-label-secondary, #8b949e);
        font-size: 13px;
        font-weight: 500;
        line-height: 20px;
      }
      .dswt-archivedComposerBtn {
        background: var(--dsw-alias-button-primary-fill, #2563eb);
        color: var(--dsw-alias-label-primary-foreground, #fff);
        border: 1px solid transparent;
        border-radius: 12px;
        padding: 3px 12px;
        font-size: 12px;
        font-weight: 500;
        line-height: 18px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: opacity .15s ease;
      }
      .dswt-archivedComposerBtn:hover:not(:disabled) {
        opacity: .9;
      }
      .dswt-archivedComposerBtn:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      /* ══════════════ 归档会话只读消息隔离（白名单机制） ══════════════ */
      body[data-dswt-archived-session="true"] [data-slot="conversation.chat.assistant-actions"],
      body[data-dswt-archived-session="true"] button[aria-label*="分支" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Branch" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Fork" i],
      body[data-dswt-archived-session="true"] button[aria-label*="编辑" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Edit" i],
      body[data-dswt-archived-session="true"] button[aria-label*="重试" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Retry" i],
      body[data-dswt-archived-session="true"] button[aria-label*="重生成" i],
      body[data-dswt-archived-session="true"] button[aria-label*="撤销" i],
      body[data-dswt-archived-session="true"] button[aria-label*="重施加" i],
      body[data-dswt-archived-session="true"] button[aria-label*="反馈" i],
      body[data-dswt-archived-session="true"] button[aria-label*="赞" i],
      body[data-dswt-archived-session="true"] button[aria-label*="踩" i],
      body[data-dswt-archived-session="true"] button[data-unavailable],
      body[data-dswt-archived-session="true"] [class*="retryRow"],
      body[data-dswt-archived-session="true"] [class*="retrySummary"],
      body[data-dswt-archived-session="true"] [class*="retryText"],
      body[data-dswt-archived-session="true"] [class*="ApprovalPanel_actionRow"],
      body[data-dswt-archived-session="true"] [data-approval-key] button,
      body[data-dswt-archived-session="true"] [class*="feedback"] {
        display: none !important;
      }

      /* 确保复制按钮始终可见 */
      body[data-dswt-archived-session="true"] button[aria-label*="复制" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Copy" i],
      body[data-dswt-archived-session="true"] button[aria-label*="已复制" i],
      body[data-dswt-archived-session="true"] button[aria-label*="Copied" i] {
        display: inline-flex !important;
      }
    `;

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

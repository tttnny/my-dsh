/**
 * dsh-workspace-tree — browser half (v2.0.0)。
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
 *  - 空白草稿跟随官方语义：不自动回收、仅视图层隐藏（官方从不物理删除会话文件）。
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
      Button, Input, Switch,
      IconFolderOpen16, IconFolderOpenOutline16, IconChevronRightOutline14, IconPlusOutline16,
      IconCloseOutline16, IconEditOutline16, IconTrashOutline16, IconArchiveOutline20,
      IconRefreshOutline14, IconNewChatOutline16, IconProjectAddOutline16, IconCodeOutline16
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Cordis 插件名（与 patch 行 id 一致）。 */
    const name = "dsh-workspace-tree";
    /**
     * 依赖的客户端服务。uiWorkspace（会话/目录导航服务）**不声明为硬依赖**：cordis 的
     * inject 声明会等该服务就绪才激活插件，而插件激活与 slot 注入的时刻都可能早于它注册；
     * 改为运行时探测（resolveUiWorkspace），到调用点再解析。
     */
    const inject = ["slots", "locale", "sessions", "workspaces"];

    const LS_GROUPS = "dsh-workspace-tree.groups";
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
    // 渲染层维持现状：非当前打开的 blank 行在树中隐藏（sessionVisible）。

    /**
     * 批量删除失败项的人话说明。服务端删除零守卫后失败只剩真实原因
     * （文件被锁/权限等），逐条列出失败项与会话 ID。
     */
    function describeDeleteFailures(r) {
      const failed = Array.isArray(r && r.failed) ? r.failed : [];
      const n = failed.length;
      if (n === 0) return "";
      const lines = failed.slice(0, 3).map((d) => {
        if (!d || !d.sessionId) return d && d.error ? d.error : "未知原因";
        const why = d.error || "未知原因";
        return "会话 " + d.sessionId + "： " + why;
      });
      return "其中 " + n + " 条删除失败，已保留在归档区："
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

    // ══════════════ Modal Scroll Lock 计数器 ══════════════
    let activeModalsCount = 0;
    function useModalScrollLock(open) {
      useEffect(() => {
        if (!open) return;
        activeModalsCount++;
        if (activeModalsCount === 1) {
          document.body.style.overflow = "hidden";
        }
        return () => {
          activeModalsCount = Math.max(0, activeModalsCount - 1);
          if (activeModalsCount === 0) {
            document.body.style.overflow = "";
          }
        };
      }, [open]);
    }

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
      ide: IconCodeOutline16
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
    const MATRIX_CELLS = [[0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4]];
    function StatusDot({ state, size }) {
      const s = size || 10;
      if (state === "ongoing") {
        return h("svg", {
          width: s, height: s, viewBox: "0 0 10 10", shapeRendering: "crispEdges", className: "dswt-matrix", "aria-hidden": "true"
        }, MATRIX_CELLS.map(([x, y], i) => h("rect", {
          key: i, x, y, width: 2, height: 2, className: "dswt-cell",
          style: { animationDelay: ((i - MATRIX_CELLS.length) * 125) + "ms" }
        })));
      }
      return h("span", {
        className: "dswt-dot",
        "data-state": state,
        style: { width: s, height: s },
        "aria-hidden": "true"
      });
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

    function timeLabel(updatedAt, now) {
      if (!updatedAt) return "";
      const diff = Math.max(0, now - updatedAt);
      const m = Math.floor(diff / 60000);
      if (m < 1) return "刚刚";
      if (m < 60) return m + "分钟";
      const hours = Math.floor(m / 60);
      if (hours < 24) return hours + "小时";
      const days = Math.floor(hours / 24);
      if (days < 30) return days + "天";
      return Math.floor(days / 30) + "月";
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
    function visibleSessionIds(ids, sessions, archived, hardDeleted) {
      if (!Array.isArray(ids)) return [];
      const byId = (sessions && sessions.byId) || {};
      const cur = currentSessionIdOf(sessions);
      return ids.filter((sid) => {
        const row = byId[sid];
        return sessionVisible(row, cur, archived, hardDeleted);
      });
    }

    // ══════════════ 状态向上透传（聚合） ══════════════
    const AGG_PRIO = { warning: 3, ongoing: 2, "done-reminder": 1 };
    function aggPriority(st) {
      return AGG_PRIO[st] || 0;
    }
    function aggOfSessionIds(ids, sessions, archived, hardDeleted, sessionStatus, lineage) {
      const byId = (sessions && sessions.byId) || {};
      const cur = currentSessionIdOf(sessions);
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
    function decorateAgg(node, wsOf, childrenOf, sessions, archived, hardDeleted, sessionStatus, lineage) {
      let best = null;
      let running = false;
      let hasSessions = false;
      const w = wsOf(node);
      if (w) {
        const vis = visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted);
        if (vis.length > 0) hasSessions = true;
        best = aggOfSessionIds(w.sessionIds, sessions, archived, hardDeleted, sessionStatus, lineage);
        const byId = (sessions && sessions.byId) || {};
        for (const sid of vis) {
          if (byId[sid] && (byId[sid].running || runningSubagentsOf(lineage, sid) > 0)) { running = true; break; }
        }
      }
      for (const c of childrenOf(node)) {
        const cs = decorateAgg(c, wsOf, childrenOf, sessions, archived, hardDeleted, sessionStatus, lineage);
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

    // ══════════════ 工作区模式：会话行 ══════════════
    function SessionRow({ sid, sessions, pendingKind, completionUnread, runningSubagents, depth, indent, now, onOpen, onRename, onArchive }) {
      const row = (sessions && sessions.byId) ? sessions.byId[sid] : null;
      if (!row) return null;
      const selected = sid === currentSessionIdOf(sessions);
      const subagents = runningSubagents || 0;
      const dotState = sessionState(row, selected, pendingKind, completionUnread, subagents);
      // 标题被省略号截断，悬停提示是它唯一的可见载体：后代子代理在跑时追加状态文案。
      const titleText = subagents > 0
        ? row.displayTitle + " · " + subagents + " 个子代理运行中"
        : row.displayTitle;
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
      return h("div", {
        className: "dswt-session" + (selected ? " dswt-selected" : ""),
        style: { paddingLeft: 8 + depth * indent },
        role: "treeitem",
        "aria-selected": selected,
        onClick: () => onOpen(sid),
        title: titleText
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(StatusDot, { state: dotState })),
        h("span", { key: "ti", className: "dswt-title" + (row.blank ? " dswt-blank" : ""), title: titleText }, row.displayTitle),
        h("span", { key: "tm", className: "dswt-time" }, timeLabel(row.updatedAt, now)),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名", onClick: () => onRename(sid, row.displayTitle) }, h(Icon, { name: "edit", size: 14 })),
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
    }

    // ══════════════ 重命名弹窗（会话/工作区 共用） ══════════════
    function RenameModal({ open, kind, initialTitle, draft, busy, onDraftChange, onCancel, onConfirm }) {
      const overlayRef = useRef(null);
      const inputRef = useRef(null);
      useModalScrollLock(open);

      useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onCancel(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, onCancel]);

      useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => { if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, 20);
        return () => clearTimeout(t);
      }, [open, kind]);

      if (!open) return null;
      const title = kind === "workspace" ? "重命名工作区" : "重命名会话";
      const trimmed = (draft || "").trim();
      const initialTrim = (initialTitle || "").trim();
      const canConfirm = !busy && trimmed.length > 0 && trimmed !== initialTrim;
      const handleOverlay = (e) => { if (e.target === overlayRef.current) onCancel(); };
      const handleKey = (e) => {
        if (e.key === "Enter" && canConfirm) { e.preventDefault(); onConfirm(); }
      };

      return h("div", {
        ref: overlayRef,
        className: "dswt-modalOverlay",
        role: "presentation",
        onClick: handleOverlay
      }, [
        h("div", {
          key: "panel",
          className: "dswt-modalPanel",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "dswt-rename-title",
          onClick: (e) => e.stopPropagation()
        }, [
          h("div", { key: "t", id: "dswt-rename-title", className: "dswt-modalTitle" }, title),
          h("div", { key: "b", className: "dswt-modalBody" }, kind === "workspace" ? "输入新的工作区名称" : "输入新的会话名称"),
          h("input", {
            key: "i",
            ref: inputRef,
            className: "dswt-modalInput",
            value: draft,
            placeholder: kind === "workspace" ? "工作区名称" : "会话名称",
            disabled: !!busy,
            onChange: (e) => onDraftChange(e.target.value),
            onKeyDown: handleKey
          }),
          h("div", { key: "a", className: "dswt-modalActions" }, [
            h("button", { key: "c", type: "button", className: "dswt-modalBtn", disabled: !!busy, onClick: onCancel }, "取消"),
            h("button", { key: "o", type: "button", className: "dswt-modalBtn dswt-modalBtnPrimary", disabled: !canConfirm, onClick: onConfirm }, busy ? "保存中…" : "确认")
          ])
        ])
      ]);
    }

    // ══════════════ 归档视图：会话行 ══════════════
    function ArchiveSessionRow({ sid, sessions, onOpen, onRestore, onDelete, busy }) {
      const row = (sessions && sessions.byId) ? sessions.byId[sid] : null;
      if (!row) return null;
      const selected = !!sessions && currentSessionIdOf(sessions) === sid;
      return h("div", {
        className: "dswt-session dswt-archivedRow" + (selected ? " dswt-selected" : ""),
        role: "treeitem",
        "aria-selected": selected,
        title: row.displayTitle,
        onClick: () => { if (!busy && onOpen) onOpen(sid); }
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(StatusDot, { state: sessionState(row, selected) })),
        h("span", { key: "ti", className: "dswt-title", title: row.displayTitle }, row.displayTitle),
        h("span", { key: "tm", className: "dswt-time" }, timeLabel(row.updatedAt, Date.now())),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "rs", type: "button", className: "dswt-iconButton", title: "恢复", disabled: !!busy, onClick: () => { if (!busy) onRestore(sid); } }, h(Icon, { name: "restore", size: 14 })),
          h("button", { key: "del", type: "button", className: "dswt-iconButton dswt-danger", title: "永久删除", disabled: !!busy, onClick: () => { if (!busy) onDelete(sid); } }, h(Icon, { name: "trash", size: 14 }))
        ])
      ]);
    }

    // ══════════════ 统一内部确认弹窗 ══════════════
    function ConfirmModal({ open, title, desc, confirmText, cancelText, danger, busy, onCancel, onConfirm }) {
      const overlayRef = useRef(null);
      const confirmBtnRef = useRef(null);
      useModalScrollLock(open);

      useEffect(() => {
        if (!open) return;
        confirmBtnRef.current?.focus();
        const onKey = (e) => {
          if (e.key === "Escape" && !busy) onCancel();
          if (e.key === "Enter" && !busy) { e.preventDefault(); onConfirm(); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, busy, onCancel, onConfirm]);

      if (!open) return null;
      const handleOverlay = (e) => { if (e.target === overlayRef.current && !busy) onCancel(); };
      return h("div", { ref: overlayRef, className: "dswt-modalOverlay", role: "presentation", onClick: handleOverlay }, [
        h("div", { key: "panel", className: "dswt-modalPanel", role: "dialog", "aria-modal": "true", onClick: (e) => e.stopPropagation() }, [
          h("div", { key: "t", className: "dswt-modalTitle" }, title || "确认"),
          h("div", { key: "b", className: "dswt-modalBody" }, desc || ""),
          h("div", { key: "a", className: "dswt-modalActions" }, [
            h("button", { key: "c", type: "button", className: "dswt-modalBtn", disabled: !!busy, onClick: onCancel }, cancelText || "取消"),
            h("button", { ref: confirmBtnRef, key: "o", type: "button", className: "dswt-modalBtn " + (danger ? "dswt-modalBtnDanger" : "dswt-modalBtnPrimary"), disabled: !!busy, onClick: onConfirm }, busy ? "处理中…" : (confirmText || "确认"))
          ])
        ])
      ]);
    }

    // ══════════════ 统一内部提示/通知弹窗 ══════════════
    function AlertModal({ open, title, desc, onConfirm }) {
      const overlayRef = useRef(null);
      const btnRef = useRef(null);
      useModalScrollLock(open);

      useEffect(() => {
        if (!open) return;
        btnRef.current?.focus();
        const onKey = (e) => {
          if (e.key === "Escape" || e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, onConfirm]);

      if (!open) return null;
      const handleOverlay = (e) => { if (e.target === overlayRef.current) onConfirm(); };
      return h("div", { ref: overlayRef, className: "dswt-modalOverlay", role: "presentation", onClick: handleOverlay }, [
        h("div", { key: "panel", className: "dswt-modalPanel", role: "dialog", "aria-modal": "true", onClick: (e) => e.stopPropagation() }, [
          h("div", { key: "t", className: "dswt-modalTitle" }, title || "提示"),
          h("div", { key: "b", className: "dswt-modalBody" }, desc || ""),
          h("div", { key: "a", className: "dswt-modalActions" }, [
            h("button", { ref: btnRef, key: "o", type: "button", className: "dswt-modalBtn dswt-modalBtnPrimary", onClick: onConfirm }, "知道了")
          ])
        ])
      ]);
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
      const overlayRef = useRef(null);
      const [listing, setListing] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      /** null = 未在新建；字符串 = 新文件夹名草稿。 */
      const [newName, setNewName] = useState(null);
      const [creating, setCreating] = useState(false);
      const [pathDraft, setPathDraft] = useState("");
      /** 已消费的那份首屏种子（同一份只吃一次，避免重渲染把它当成新导航）。 */
      const seedUsed = useRef(null);
      useModalScrollLock(open);

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

      useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [open, busy, onCancel]);

      if (!open) return null;

      const crumbs = (listing && Array.isArray(listing.crumbs)) ? listing.crumbs : [];
      const entries = (listing && Array.isArray(listing.entries)) ? listing.entries : [];
      const parent = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : null;
      const currentPath = (listing && typeof listing.path === "string") ? listing.path : "";
      const locked = !!busy || creating;
      const canCreate = typeof createDirectory === "function";
      const handleOverlay = (e) => { if (e.target === overlayRef.current && !locked) onCancel(); };

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
        ? h("button", {
            key: "nf",
            type: "button",
            className: "dswt-modalBtn",
            title: canCreate ? "在当前位置新建文件夹并进入" : "当前 DSH 版本不支持新建文件夹",
            disabled: locked || loading || currentPath === "" || !canCreate,
            onClick: () => setNewName("")
          }, "新建文件夹")
        : h("span", { key: "nf", className: "dswt-pickerNewDir" }, [
            h("input", {
              key: "i",
              className: "dswt-modalInput dswt-pickerNewInput",
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
            h("button", {
              key: "ok",
              type: "button",
              className: "dswt-modalBtn dswt-modalBtnPrimary",
              disabled: creating || (newName || "").trim() === "",
              onClick: commitNewDir
            }, creating ? "创建中…" : "创建"),
            h("button", { key: "no", type: "button", className: "dswt-modalBtn", disabled: creating, onClick: () => setNewName(null) }, "取消")
          ]);

      return h("div", {
        ref: overlayRef,
        className: "dswt-modalOverlay",
        role: "presentation",
        onClick: handleOverlay
      }, [
        h("div", {
          key: "panel",
          className: "dswt-modalPanel dswt-pickerPanel",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "添加工作区",
          onClick: (e) => e.stopPropagation()
        }, [
          h("div", { key: "t", className: "dswt-modalTitle" }, "添加工作区"),
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
            h("input", {
              key: "i",
              className: "dswt-modalInput dswt-pickerPathInput",
              value: pathDraft,
              placeholder: "绝对路径，回车前往",
              spellCheck: false,
              disabled: locked,
              onChange: (e) => setPathDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); readLevel(pathDraft.trim()); } }
            }),
            h("button", {
              key: "g",
              type: "button",
              className: "dswt-modalBtn",
              disabled: locked || pathDraft.trim() === "",
              onClick: () => readLevel(pathDraft.trim())
            }, "前往")
          ]),
          h("div", { key: "l", className: "dswt-pickerList", role: "listbox", "aria-label": "目录" },
            entries.length === 0
              ? [h("div", { key: "e", className: "dswt-pickerEmpty" }, loading ? "读取中…" : "此目录下没有子文件夹")]
              : rowNodes
          ),
          error !== "" && h("div", { key: "err", className: "dswt-pickerError", role: "alert" }, error),
          h("div", { key: "a", className: "dswt-modalActions dswt-pickerActions" }, [
            newDirControl,
            h("span", { key: "sp", className: "dswt-pickerSpacer" }),
            h("button", { key: "c", type: "button", className: "dswt-modalBtn", disabled: locked, onClick: onCancel }, "取消"),
            h("button", {
              key: "o",
              type: "button",
              className: "dswt-modalBtn dswt-modalBtnPrimary",
              title: currentPath,
              disabled: locked || loading || currentPath === "",
              onClick: () => onPicked(currentPath)
            }, busy ? "添加中…" : "选择此文件夹")
          ])
        ])
      ]);
    }

    // ══════════════ 归档视图：按工作区分组（深度递归收集，全量展示） ══════════════
    /**
     * 归档集合是注册表全局的：官方 workspace/archiveSession 明确「工作区归属可有可无」，
     * 归档只往 archivedSessionIds 追加、从不改 sessionIds。本插件的自动收编又对已归档
     * 会话显式跳过（见下方 effect），于是「无归属的归档会话」会长期存在，必须单独成组，
     * 否则官方「已归档会话」可见、本插件归档区却永远看不到。
     */
    function ArchiveView({ sessions, wsForest, archived, hardDeleted, onOpen, onRestoreOne, onDeleteOne, onRestoreGroup, onDeleteGroup, onRestoreAll, onDeleteAll, busy }) {
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
          h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": "16px" } }, group.sids.map((sid) => h(ArchiveSessionRow, { key: sid, sid, sessions, busy, onOpen, onRestore: onRestoreOne, onDelete: onDeleteOne })))
        ]))
      ]);
    }

    // ══════════════ 工作区模式：组 ══════════════
    function WorkspaceGroup({ node, depth, indent, sessions, sessionStatus, lineage, archived, hardDeleted, expandedGroups, toggleGroup, onNewSession, onAddWorkspaceIn, onOpenInIde, onRenameWs, onHideWs, onOpen, onRenameSession, onArchiveSession, now }) {
      const w = node.w;
      const gkey = w.workspaceId;
      const groupOpen = expandedGroups.has(gkey);
      const sids = visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted);
      const hasContent = sids.length > 0 || (node.children && node.children.length > 0);

      return h("div", {
        className: "dswt-groupSection",
        "data-wsid": gkey
      }, [
        h("div", {
          key: "hd",
          className: "dswt-projectRow",
          style: { paddingLeft: 8 + depth * indent },
          role: "treeitem",
          "aria-expanded": groupOpen,
          onClick: () => toggleGroup(gkey)
        }, [
          h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" + (node.aggRunning ? " dswt-folderActive" : "") }, [
            h(Icon, { name: folderIconFor(node.aggHasSessions), size: 16, className: "dswt-folderSvg" }),
            hasContent && h("span", { className: "dswt-chevronOverlay" + (groupOpen ? " dswt-arrowOpen" : "") }, h(Icon, { name: "chevron", size: 12 }))
          ]),
          h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, w.title || baseName(w.path))),
          node.aggState && h("span", { key: "ag", className: "dswt-slot dswt-aggSlot", title: node.aggState === "warning" ? "有待处理交互" : node.aggState === "ongoing" ? "有会话运行中" : "有会话已完成" }, h(StatusDot, { state: node.aggState, size: 8 })),
          h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
            h("button", { key: "ide", type: "button", className: "dswt-iconButton", title: "在 IDE 中打开此工作区", onClick: () => onOpenInIde && onOpenInIde(w.path) }, h(Icon, { name: "ide", size: 14 })),
            h("button", { key: "ns", type: "button", className: "dswt-iconButton", title: "新建会话", onClick: () => onNewSession(w.workspaceId) }, h(Icon, { name: "newChat", size: 14 })),
            h("button", { key: "aw", type: "button", className: "dswt-iconButton", title: "添加工作区（从该工作区目录开始选择）", onClick: () => onAddWorkspaceIn && onAddWorkspaceIn(w) }, h(Icon, { name: "folderPlus", size: 14 })),
            h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名工作区", onClick: () => onRenameWs(w) }, h(Icon, { name: "edit", size: 14 })),
            h("button", { key: "hd", type: "button", className: "dswt-iconButton", title: "移除工作区显示（不删除注册，会话归属不变，重新添加该目录后恢复）", onClick: () => onHideWs && onHideWs(w) }, h(Icon, { name: "minus", size: 14 }))
          ])
        ]),
        groupOpen && h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": (16 + depth * indent) + "px" } }, [
          sids.map((sid) => h(SessionRow, {
            key: "s:" + sid, sid, sessions, depth: depth + 1, indent, now, onOpen,
            pendingKind: pendingKindOf(sessionStatus, sid), completionUnread: completionUnreadOf(sessionStatus, sid),
            runningSubagents: runningSubagentsOf(lineage, sid),
            onRename: onRenameSession, onArchive: onArchiveSession
          })),
          (node.children || []).map((child) => h(WorkspaceGroup, {
            key: child.w.workspaceId, node: child, depth: depth + 1, indent, sessions, sessionStatus, lineage, archived, hardDeleted,
            expandedGroups, toggleGroup, onNewSession, onAddWorkspaceIn, onOpenInIde, onRenameWs, onHideWs,
            onOpen, onRenameSession, onArchiveSession, now
          }))
        ])
      ]);
    }

    // ══════════════ 工作区模式：未分组 ══════════════
    /**
     * 「未分组」：官方列表里不属于任何已注册工作区的会话。插件不替用户收编，
     * 这些会话照官方语义原样落在这一组；折叠状态不单独记忆（始终展开）。
     */
    function UngroupedGroup({ sids, sessions, sessionStatus, lineage, indent, now, onOpen, onRenameSession, onArchiveSession }) {
      if (!sids || sids.length === 0) return null;
      return h("div", { className: "dswt-groupSection" }, [
        h("div", { key: "hd", className: "dswt-projectRow", role: "treeitem", "aria-expanded": true }, [
          h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" }, h(Icon, { name: "folderOpenOutline", size: 16, className: "dswt-folderSvg" })),
          h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, "未分组 · " + sids.length + " 条"))
        ]),
        h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": "16px" } }, sids.map((sid) => h(SessionRow, {
          key: "s:" + sid, sid, sessions, depth: 1, indent, now, onOpen,
          pendingKind: pendingKindOf(sessionStatus, sid), completionUnread: completionUnreadOf(sessionStatus, sid),
          runningSubagents: runningSubagentsOf(lineage, sid),
          onRename: onRenameSession, onArchive: onArchiveSession
        })))
      ]);
    }

    // ══════════════ 主组件 ══════════════
    function WorkspaceTreeBrowser(props) {
      const { wide, useSessions, useWorkspaces, useSessionStatus, liveSessionRow, startSession, open, clearSession, renameSession, renameWorkspace, archiveSession, createWorkspace, deleteWorkspace, pickDirectory, listDirectory, createDirectory, refreshSessions } = props;
      const sessions = useSessions((s) => s);
      const workspaces = useWorkspaces((s) => s);
      // 官方会话状态座位（数据源在 dsh-client-ui-session：运行中 / 待处理交互 /
      // 完成未读，Map<SessionId, { running, pendingInteraction, completionUnread }>）。
      const sessionStatus = typeof useSessionStatus === "function"
        ? useSessionStatus((s) => s)
        : null;

      /** 视图：工作区 / 归档区（模式偏好不持久化）。 */
      const [mode, setMode] = useState("workspace");
      const [expandedGroups, setExpandedGroups] = useState(() => loadSet(LS_GROUPS));
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
      const groupsInited = useRef(false);
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

      // 首次进入工作区模式：默认展开所有组
      useEffect(() => {
        const items = workspaces.items || [];
        if (!groupsInited.current && items.length > 0) {
          groupsInited.current = true;
          const all = items.map((w) => w.workspaceId);
          setExpandedGroups((prev) => {
            if (prev.size === 0) {
              saveSet(LS_GROUPS, all);
              return new Set(all);
            }
            return prev;
          });
        }
      }, [workspaces.items]);

      // 标题切换动画清理
      useEffect(() => {
        if (swapFrom === null) return;
        const t = setTimeout(() => setSwapFrom(null), 300);
        return () => clearTimeout(t);
      }, [swapFrom]);

      const toggleGroup = useCallback((key) => {
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          saveSet(LS_GROUPS, next);
          return next;
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
      // （sessionVisible 已排除非当前打开的 blank 行）。v1.9.0 起移除旧的自动回收
      // 与 claims/heartbeat 占用注册表全套机制。

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
        if (!trimmed || trimmed === initialTrim) {
          if (trimmed === initialTrim) setRenameTarget(null);
          return;
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
          setExpandedGroups((prev) => {
            if (!prev.has(wid)) return prev;
            const next = new Set(prev);
            next.delete(wid);
            saveSet(LS_GROUPS, next);
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
          const r = await apiPost("/archive/unarchive", { sessionId: sid });
          if (!r.ok) throw new Error(r.error || "恢复失败");
          forgetDeleted([sid]);
          refreshSessions();
        } catch (error) {
          showAlert(String((error && error.message) || error), "恢复失败");
        }
      }, [refreshSessions, showAlert, forgetDeleted]);
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
      /** 一键诊断：把本客户端看到的工作区/会话列表状态复制到剪贴板，用于排查“某端显示为空”。 */
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
            const desc = describeDeleteFailures(r);
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
        for (const n of wsForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, sessionStatus, lineage);
        for (const n of archiveForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, sessionStatus, lineage);
        return { wsForest, archiveForest };
      }, [visibleItems, items, sessions, archived, hardDeleted, sessionStatus, lineage]);

      const wsForest = aggCtx.wsForest;
      const archiveForest = aggCtx.archiveForest;

      /** 不属于任何已注册工作区的可见会话（含隐藏工作区名下的会话：它们已有归属）。 */
      const ungroupedSids = useMemo(() => {
        const accounted = accountedSessionIds(items);
        const byId = (sessions && sessions.byId) || {};
        const cur = currentSessionIdOf(sessions);
        return (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])
          .map(String)
          .filter((sid) => !accounted.has(sid) && sessionVisible(byId[sid], cur, archived, hardDeleted));
      }, [sessions, items, archived, hardDeleted]);

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
          pickerNode
        ]);
      }

      const header = h("div", { key: "h", className: "dswt-sectionHeader" }, [
        h("div", {
          key: "t",
          className: "dswt-modeTitle",
          title: mode === "archive" ? "点击返回工作区" : "点击进入归档区",
          onClick: () => toggleArchive()
        }, [
          swapFrom !== null && h("span", { key: "out", className: "dswt-titleItem dswt-titleOut" }, swapFrom === "archive" ? "归档区" : "工作区"),
          h("span", { key: "in" + mode, className: "dswt-titleItem dswt-titleIn" }, mode === "archive" ? "归档区" : "工作区")
        ]),
        h("span", { key: "a", className: "dswt-headerActions" }, [
          mode !== "archive" && h("button", { key: "ns", type: "button", className: "dswt-headBtn", title: "新建会话（选择工作区）", onClick: () => { if (clearSession) clearSession(); else if (typeof startSession === "function") startSession(); } }, h(Icon, { name: "newChat", size: 16 })),
          mode !== "archive" && h("button", { key: "ws", type: "button", className: "dswt-headBtn", title: addWorkspaceTitle, "aria-label": "添加工作区", disabled: addWorkspaceDisabled, onClick: onAddWorkspace }, h(Icon, { name: "plus", size: 16 })),
          h("button", { key: "ar", type: "button", className: "dswt-headBtn" + (mode === "archive" ? " dswt-headBtnActive" : ""), title: mode === "archive" ? "返回" : "归档区", onClick: toggleArchive }, h(Icon, { name: "archive", size: 16 }))
        ].filter(Boolean))
      ]);

      let body;
      if (mode === "archive") {
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "归档区" }, [
          h(ArchiveView, {
            key: "av",
            sessions,
            wsForest: archiveForest,
            archived,
            hardDeleted,
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
      } else {
        // 工作区模式：注册工作区按目录嵌套展示，无归属会话照官方语义落进「未分组」。
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "工作区" }, [
          wsForest.map((node) => h(WorkspaceGroup, {
            key: node.w.workspaceId, node, depth: 0, indent: INDENT, sessions, sessionStatus, lineage, archived, hardDeleted,
            expandedGroups, toggleGroup,
            onNewSession: startSession,
            onAddWorkspaceIn,
            onOpenInIde: openInIde,
            onRenameWs: onRequestRenameWs, onHideWs,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession, now
          })),
          h(UngroupedGroup, {
            key: "ungrouped",
            sids: ungroupedSids,
            sessions, sessionStatus, lineage, indent: INDENT, now,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession
          }),
          wsForest.length === 0 && ungroupedSids.length === 0 && h("div", { key: "e", className: "dswt-empty" }, hiddenWs.size > 0 ? "所有工作区均已移除显示——重新添加目录即可恢复" : "尚无工作区——点击上方「添加工作区」或先新建会话")
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
      resetDefault: "恢复默认",
      applyHint: "修改即时生效（启用开关除外）"
    };
    /** 英文字典：与 zh 同 key 集合。 */
    const en = {
      title: "Workspace tree",
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
          h("div", { className: "dswt-configActions" }, [
            h(Button, { variant: "outline", size: "sm", disabled: readOnly, onClick: () => { if (!readOnly) resetEffectiveConfig(); } }, t("resetDefault")),
            h("span", { className: "dswt-configSaved" }, t("applyHint"))
          ])
        ])
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
          const r = await apiPost("/archive/unarchive", { sessionId: sid });
          if (!r.ok) throw new Error(r.error || "恢复失败");
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

    // ══════════════ 注册 ══════════════
    function apply(ctx) {
      // 设置页文案字典：注册早于设置页 tab 注册，且早于 enabled 早退，保证禁用态下 tab 仍能取到文案。
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

      // 设置页（设置 > 插件 > 插件配置）
      ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
        name: "settings.plugins.tab",
        id: "dsh-workspace-tree-config",
        order: 90,
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
        flex: 1;
        margin: 0 6px 0 4px;
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
      .dswt-matrix {
        flex: none;
      }
      .dswt-cell {
        fill: var(--dsw-alias-state-success-primary);
        opacity: 0;
        animation: dswt-pulse 1s linear infinite;
      }
      @keyframes dswt-pulse {
        0%, 15% { opacity: 0; }
        40% { opacity: 1; }
        85%, 100% { opacity: 0; }
      }
      .dswt-dot {
        flex: none;
        border-radius: 50%;
        background: var(--dsw-alias-label-tertiary);
        opacity: .45;
      }
      .dswt-dot[data-state="done-reminder"] {
        background: var(--dsw-alias-state-success-primary);
        opacity: 1;
      }
      .dswt-dot[data-state="warning"] {
        background: var(--dsw-alias-state-warn-primary);
        opacity: 1;
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
      .dswt-modalOverlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.38);
        backdrop-filter: blur(2px);
        animation: dswt-modal-in .18s var(--ds-ease-in-out, ease);
      }
      .dswt-modalPanel {
        background: var(--dsw-alias-bg-layer-1);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 14px;
        min-width: 360px;
        max-width: 420px;
        width: calc(100% - 32px);
        box-shadow: 0 16px 40px rgba(0,0,0,.18);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dswt-modalTitle {
        font-size: 14px;
        line-height: 20px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
      }
      .dswt-modalBody {
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-secondary);
        white-space: pre-wrap;
        word-break: break-all;
      }
      .dswt-modalActions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .dswt-modalBtn {
        box-sizing: border-box;
        height: 32px;
        min-width: 64px;
        padding: 0 14px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        user-select: none;
      }
      .dswt-modalBtn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-modalBtnDanger {
        background: var(--dsw-alias-state-error-primary);
        border-color: var(--dsw-alias-state-error-primary);
        color: #fff;
      }
      .dswt-modalBtnDanger:hover {
        filter: brightness(.94);
      }
      .dswt-modalBtn:disabled {
        opacity: .55;
        cursor: not-allowed;
      }
      .dswt-modalInput {
        box-sizing: border-box;
        width: 100%;
        height: 36px;
        padding: 0 12px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        color: var(--dsw-alias-label-primary);
        font-size: 14px;
        outline: none;
      }
      .dswt-modalInput:focus {
        border-color: var(--dsw-alias-brand-primary);
        background: var(--dsw-alias-bg-layer-1);
      }
      .dswt-modalInput:disabled {
        opacity: .6;
      }
      .dswt-modalBtnPrimary {
        background: var(--dsw-alias-button-primary-fill, #fff);
        border-color: var(--dsw-alias-button-primary-fill, #fff);
        color: var(--dsw-alias-label-primary-foreground, #0f1115);
      }
      .dswt-modalBtnPrimary:hover {
        background: var(--dsw-alias-button-primary-hover, #e5e5e5);
        border-color: var(--dsw-alias-button-primary-hover, #e5e5e5);
      }
      .dswt-modalBtnPrimary:disabled {
        background: var(--dsw-alias-bg-layer-2);
        border-color: var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-tertiary);
        filter: none;
      }
      .dswt-modalBtnPrimary:active {
        filter: brightness(.9);
      }
      @keyframes dswt-modal-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* ══════════════ 目录选择弹窗（browse 面自持） ══════════════ */
      .dswt-pickerPanel {
        min-width: 480px;
        max-width: 560px;
        height: min(560px, calc(100vh - 96px));
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
        font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
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
      .dswt-pickerActions {
        align-items: center;
        flex-wrap: wrap;
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
        .dswt-cell { animation: none; opacity: 1; }
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

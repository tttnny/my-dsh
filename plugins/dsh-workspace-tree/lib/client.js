/**
 * dsh-workspace-tree — browser half (v1.9.2 墓碑物理自愈版)。
 *
 * 核心设计（第一性原理对齐）：
 *  - 会话空间归属与归档状态正交；官方列表返回的会话一律可见（含空白草稿），
 *    工作区模式显示活跃会话、归档区显示已归档会话。
 *  - 无「未分组」：会话失去工作区归属（如 DSH 升级重置注册表）时后台自动收编
 *    ——将其 cwd 注册为工作区（幂等）并挂载会话，未分组区块不再存在。
 *  - 工作区管理默认「移除显示」而非「删除注册」：仅隐藏工作区节点（localStorage 记忆），
 *    注册与会话归属不变；重新添加同一目录后工作区连同会话一起恢复显示。
 *    例外：名下已无任何可见会话与归档会话的空工作区，移除时自动走官方 workspace/delete
 *    RPC 真注销注册表记录（同样不删磁盘目录与会话文件）。
 *  - 归档门槛：运行中/等待回复的会话不允许归档（按钮置灰），归档动作沿用官方
 *    workspace/archiveSession RPC；凡进入归档区的会话删除零守卫、必定可删。
 *  - 永久删除会话采用持久化墓碑（localStorage）：官方列表仍返回的已删会话无论
 *    刷新/跨标签页都不可见；官方列表收敛后自动摘碑。v1.9.2 起对「列表仍返回」的
 *    墓碑增加权威自愈：向 Host 查询会话目录是否仍物理存在——存在即会话存活
 *    （永久删除成功必然使目录消失），该墓碑必为误写（历史版本残留），自动作废
 *    恢复显示；设置页亦提供手动「清空墓碑」兜底入口。
 *  - 空白草稿跟随官方语义：不自动回收、仅视图层隐藏（官方从不物理删除会话文件）。
 *  - 目录选择面：官方「一种能力、两种交互」——回环绑定（且非 SSH）时挂 native 系统
 *    选择器，局域网/远端绑定时只挂 browse 原语（listDirectory / createDirectory）。
 *    内核「添加工作区只有一条路」依赖 sidebar.workspaces.directoryFlow 子槽；本插件以
 *    priority -1 顶掉 sidebar.workspaces 后，官方对话框无处渲染，而内核的槽位声明账本
 *    （SlotCore.register：slot "…" is already declared）不允许再声明同一子槽——被顶掉的
 *    内核 entry 仍持有该声明。故 native 走官方系统选择器，browse 由插件自持对话框承担，
 *    底层只用官方 browse 原语。
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

    /** Cordis 插件名（与 patch 行 id 一致）。 */
    const name = "dsh-workspace-tree";
    /**
     * 依赖的客户端服务。注意：uiWorkspace（新版 DSH 独立出的会话/目录导航服务，旧版在
     * workspaces 上）**不声明为硬依赖**——cordis 的 inject 声明会等待服务就绪才激活插件，
     * 旧版 DSH 永远不注册该服务会导致整个插件静默不加载。改为运行时探测（resolveUiWorkspace）。
     */
    const inject = ["slots", "sessions", "workspaces", "connection"];

    const LS_MODE = "dsh-workspace-tree.mode";
    const LS_DIRS = "dsh-workspace-tree.dirs";
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
      indent: 16,
      defaultMode: "workspace",
      showAgg: true,
      showCount: true,
      defaultIde: "vscode",
      customIdeCommand: ""
    };
    let configState = null;
    const configListeners = new Set();
    function sanitizeConfig(input) {
      const out = Object.assign({}, DEFAULT_CONFIG);
      if (!input || typeof input !== "object" || Array.isArray(input)) return out;
      if (typeof input.enabled === "boolean") out.enabled = input.enabled;
      if (typeof input.indent === "number" && Number.isFinite(input.indent)) {
        out.indent = Math.min(Math.max(Math.round(input.indent), 8), 32);
      }
      if (input.defaultMode === "folder" || input.defaultMode === "workspace") out.defaultMode = input.defaultMode;
      if (typeof input.showAgg === "boolean") out.showAgg = input.showAgg;
      if (typeof input.showCount === "boolean") out.showCount = input.showCount;
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
      // 脏值（手写 settings.yaml）不能直接进 UI，否则 indent 非法会算出 NaNpx。
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
    function initialMode() {
      try {
        const m = localStorage.getItem(LS_MODE);
        if (m === "folder" || m === "workspace") return m;
      } catch { /* ignore */ }
      return getEffectiveConfig().defaultMode === "folder" ? "folder" : "workspace";
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

    /**
     * 「借道渲染官方目录对话框」能力的模块级引用。主组件定义在 factory 作用域（拿不到
     * apply 的局部变量），所以 apply 装配好 officialFlowBridge 后挂到这里；探测失败时
     * 保持 ok:false —— 组件据此回退自持对话框。
     */
    const officialFlowBridgeRef = {
      ok: false,
      reason: "尚未装配",
      hole: "sidebar.workspaces.directoryFlow",
      occupied: () => false,
      subscribe: () => () => {}
    };

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
     * 从官方 pending 座位（`useSessionPendingInteraction` 的快照，Map<SessionId, {kind}>）
     * 取一条待处理交互。注意：客户端 `SessionSummary` 上**没有** pendingInteraction 字段，
     * 这个数据只走座位——本插件 v1.9.3 之前误读 row.pendingInteraction（恒 undefined），
     * 导致「等待审批的会话"可归档」与状态点 warning 态永不出现。
     */
    function pendingKindOf(pendingInteractions, sid) {
      if (!pendingInteractions || typeof pendingInteractions.get !== "function") return null;
      const entry = pendingInteractions.get(sid) || pendingInteractions.get(String(sid));
      const kind = entry && entry.kind;
      return (kind && Object.prototype.hasOwnProperty.call(PENDING_LABEL, kind)) ? kind : null;
    }
    /**
     * 归档门槛的 Host 权威判据。官方 workspace/archiveSession 在 Host 侧没有运行态守卫
     * （直接写注册表），而客户端 running 位是 Host 转发来的事实（客户端 prompt() 不做乐观
     * 翻转，发送后到状态帧落地之间存在窗口），所以归档前问一次插件自己的 Host 半边：
     * agents.get(sessionId).status（本轮实测 Host 服务 `agents.get(id)` 返回带 status 的
     * 活 Agent，状态取值 idle | running）。
     * @returns {Promise<{ok:boolean, running?:boolean, status?:string}>} ok=false 表示查询
     *   本身不可用（旧版/网络故障）——调用方 fail-open 放行，由官方 RPC 定生死。
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

    // ══════════════ 一键诊断（设置页入口；树头不再放按钮） ══════════════
    // 直接读 ctx 快照 + localStorage，不依赖任何组件 props，因此设置面板
    // （独立 slot，无 sessions 传参）与侧栏树可共用同一份采集逻辑。
    function collectDiagnostics() {
      let sessions = null;
      let workspaces = null;
      try {
        const c = settingsScopeCtx;
        if (c && c.sessions && c.sessions.list && typeof c.sessions.list.getSnapshot === "function") {
          sessions = c.sessions.list.getSnapshot();
        }
        if (c && c.workspaces && c.workspaces.list && typeof c.workspaces.list.getSnapshot === "function") {
          workspaces = c.workspaces.list.getSnapshot();
        }
      } catch { sessions = null; workspaces = null; }
      // 快照缺席时明确标注 warning，避免“空诊断”被误读为“真空”
      const noSnap = !sessions && !workspaces;
      const byId = (sessions && sessions.byId) || {};
      const archivedIds = (workspaces && Array.isArray(workspaces.archivedSessionIds))
        ? workspaces.archivedSessionIds
        : [];
      const archived = new Set(archivedIds.map(String));
      const hardDeleted = loadSet(LS_DELETED);
      let defaultMode = null;
      try { defaultMode = initialMode(); } catch { defaultMode = null; }
      // 注意：此处 defaultMode 是持久化偏好（initialMode），不是侧栏树的 live mode
      // （live mode 可为 archive 且不持久化，设置页拿不到它）
      return {
        // 注意：此处版本号为手写常量，发版改 package.json 时同步改这里
        plugin: "dsh-workspace-tree@1.9.3",
        t: new Date().toISOString(),
        ...(noSnap ? { warning: "snapshots unavailable（ctx 未就绪或已释放）" } : {}),
        defaultMode,
        sessions: {
          phase: sessions ? (sessions.phase || null) : null,
          idsCount: sessions && Array.isArray(sessions.ids) ? sessions.ids.length : 0,
          current: sessions ? (sessions.current ?? null) : null,
          rowsTruncated: !!(sessions && Array.isArray(sessions.ids) && sessions.ids.length > 60),
          rows: (sessions && Array.isArray(sessions.ids) ? sessions.ids : []).slice(0, 60).map((sid) => {
            const row = byId[sid] || null;
            return {
              sid: String(sid),
              present: !!row,
              blank: row ? !!row.blank : null,
              running: row ? !!row.running : null,
              origin: row ? (row.origin || null) : null,
              title: row && row.displayTitle ? String(row.displayTitle).slice(0, 24) : null
            };
          })
        },
        workspaces: {
          phase: workspaces ? (workspaces.phase || null) : null,
          items: (workspaces && Array.isArray(workspaces.items) ? workspaces.items : []).map((w) => ({
            id: String(w.workspaceId),
            title: w.title || null,
            path: w.path || null,
            regCount: Array.isArray(w.sessionIds) ? w.sessionIds.length : 0,
            visibleCount: visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted).length
          }))
        },
        archivedCount: archived.size,
        hardDeleted: [...hardDeleted],
        hiddenWs: [...loadSet(LS_HIDDEN_WS)],
        expandedGroups: [...loadSet(LS_GROUPS)]
      };
    }
    async function copyTextToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        throw new Error("clipboard unavailable");
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return !!ok;
        } catch { return false; }
      }
    }

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

    // ══════════════ 官方图标 ══════════════
    const ICONS = {
      folderOpen: {
        vb: "0 0 16 16",
        paths: [
          { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" },
          { d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68434 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z", opacity: "0.2" }
        ]
      },
      folderOpenFilled: {
        vb: "0 0 16 16",
        paths: [
          { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" },
          { d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68434 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z", opacity: "0.2" }
        ]
      },
      folderOpenOutline: {
        vb: "0 0 16 16",
        d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z"
      },
      folderClose: {
        vb: "0 0 16 16",
        d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V12.1484C14.5859 13.4824 13.5039 14.5645 12.1699 14.5645H2.91699C1.58396 14.5645 0.501953 13.4824 0.501953 12.1484V3.98706C0.501953 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V12.1484C1.88281 12.7202 2.34625 13.1836 2.91797 13.1836H12.1699C12.7416 13.1836 13.2051 12.7202 13.2051 12.1484V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z"
      },
      folderCloseFilled: {
        vb: "0 0 16 16",
        paths: [
          { d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V12.1484C14.5859 13.4824 13.5039 14.5645 12.1699 14.5645H2.91699C1.58396 14.5645 0.501953 13.4824 0.501953 12.1484V3.98706C0.501953 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V12.1484C1.88281 12.7202 2.34625 13.1836 2.91797 13.1836H12.1699C12.7416 13.1836 13.2051 12.7202 13.2051 12.1484V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" },
          { d: "M2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V12.1484C1.88281 12.7202 2.34625 13.1836 2.91797 13.1836H12.1699C12.7416 13.1836 13.2051 12.7202 13.2051 12.1484V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z", opacity: "0.2" }
        ]
      },
      folderCloseOutline: {
        vb: "0 0 16 16",
        d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V12.1484C14.5859 13.4824 13.5039 14.5645 12.1699 14.5645H2.91699C1.58396 14.5645 0.501953 13.4824 0.501953 12.1484V3.98706C0.501953 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V12.1484C1.88281 12.7202 2.34625 13.1836 2.91797 13.1836H12.1699C12.7416 13.1836 13.2051 12.7202 13.2051 12.1484V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z"
      },
      chevron: {
        vb: "0 0 14 14",
        d: "M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z"
      },
      plus: { vb: "0 0 16 16", d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z" },
      minus: { vb: "0 0 16 16", d: "M2.5 6.75H13.5V9.25H2.5Z" },
      edit: { vb: "0 0 16 16", d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z" },
      trash: { vb: "0 0 16 16", d: "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z" },
      archive: {
        vb: "0 0 20 20",
        paths: [
          { d: "M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" },
          { d: "M12.7962 12.5661V11.0832H7.20548V12.5661L12.7962 12.5661Z" }
        ]
      },
      restore: { vb: "0 0 16 16", d: "M8 3a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5h-1.5A3.5 3.5 0 0 1 8 11.5 3.5 3.5 0 0 1 4.5 8 3.5 3.5 0 0 1 8 4.5V3l3 3-3 3V7H8V3Z" },
      newChat: { vb: "0 0 16 16", d: "M8.00003 0.3237C3.76075 0.3237 0.32373 3.76072 0.32373 8C0.32373 9.17603 0.589121 10.2922 1.0632 11.2901L1.35291 11.8989L2.5705 11.3205L2.28079 10.7117C1.89079 9.89074 1.67301 8.97167 1.67301 8C1.67301 4.50546 4.50549 1.67298 8.00003 1.67298C11.4946 1.67298 14.3271 4.50546 14.3271 8C14.3271 11.4945 11.4946 14.327 8.00003 14.327C7.28473 14.327 6.76077 14.277 6.29621 14.1487C5.83857 14.0224 5.40441 13.8109 4.88514 13.4488C4.12569 12.919 3.03778 12.7316 2.141 13.2978L2.12682 13.307L2.11264 13.3171L1.34886 13.854L1.79659 15.188L2.86122 14.4384C3.19068 14.2305 3.68325 14.2542 4.11326 14.5539C4.72789 14.9826 5.30042 15.2724 5.93762 15.4484C6.56803 15.6224 7.22776 15.6763 8.00003 15.6763C12.2393 15.6763 15.6763 12.2393 15.6763 8C15.6763 3.76072 12.2393 0.3237 8.00003 0.3237ZM7.32033 4.82535V7.32536H4.82538V8.67464H7.32033V11.1747H8.6696V8.67464H11.1747V7.32536H8.6696V4.82535H7.32033Z" },
      folderPlus: {
        vb: "0 0 16 16",
        paths: [
          { d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603L11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z", transform: "translate(1.5 2.429)" },
          { d: "M12 10.8v1.2h1.9v1.2H12v1.2h-1.2v-1.2H8.9v-1.2h1.9v-1.2H12z" }
        ]
      },
      ide: {
        vb: "0 0 16 16",
        paths: [
          { d: "M5.7 3.3C5.3 2.9 4.7 2.9 4.3 3.3L1.5 6.8C1.1 7.2 1.1 7.8 1.5 8.2L4.3 11.7C4.7 12.1 5.3 12.1 5.7 11.7C6.1 11.3 6.1 10.7 5.7 10.3L3.4 7.5L5.7 4.7C6.1 4.3 6.1 3.7 5.7 3.3Z" },
          { d: "M10.3 3.3C9.9 3.7 9.9 4.3 10.3 4.7L12.6 7.5L10.3 10.3C9.9 10.7 9.9 11.3 10.3 11.7C10.7 12.1 11.3 12.1 11.7 11.7L14.5 8.2C14.9 7.8 14.9 7.2 14.5 6.8L11.7 3.3C11.3 2.9 10.7 2.9 10.3 3.3Z" },
          { d: "M6.3 12.3C6.1 12.3 5.9 12.2 5.8 12C5.6 11.6 5.8 11.1 6.2 10.9L9.2 3.7C9.4 3.3 9.9 3.1 10.3 3.3C10.7 3.5 10.9 4 10.7 4.4L7.7 11.6C7.5 12 7.1 12.3 6.7 12.3H6.3Z" }
        ]
      }
    };

    /**
     * 根据展开状态及子树会话情况确定文件夹图标：
     * 有会话 → 填充灰底文件夹；无会话 → 纯线框空文件夹。
     * 运行态染蓝由调用方附加 dswt-folderActive 类实现（蓝色 = 子树内有运行中会话）。
     */
    function folderIconFor(isOpen, hasSessions) {
      if (hasSessions) {
        return isOpen ? "folderOpenFilled" : "folderCloseFilled";
      }
      return isOpen ? "folderOpenOutline" : "folderCloseOutline";
    }

    function Icon({ name, size, className, title }) {
      const spec = ICONS[name];
      if (!spec) return null;
      const kids = [];
      const pushPath = (p, key) => {
        const props = { key, d: p.d, fill: "currentColor" };
        if (p.opacity !== void 0) props.opacity = p.opacity;
        if (p.transform) props.transform = p.transform;
        if (p.fillRule) props.fillRule = p.fillRule;
        kids.push(h("path", props));
      };
      if (spec.paths) spec.paths.forEach((p, i) => pushPath(p, "p" + i));
      else pushPath(spec, "p0");
      return h("svg", {
        width: size || 16,
        height: size || 16,
        viewBox: spec.vb,
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        className,
        ...(title ? { "aria-label": title, role: "img" } : { "aria-hidden": "true" })
      }, kids);
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

    function sessionState(row, current, pendingKind) {
      if (!row) return "done";
      // 等待人回复（审批/计划复核/提问）优先于运行态：这种会话在动，但卡在人身上。
      // pendingKind 由官方 pending 座位传入（row 上没有该字段，见 pendingKindOf 注释）。
      if (pendingKind) return "warning";
      if (row.running) return "ongoing";
      if (row.completed && !current) return "done-reminder";
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

    // ══════════════ 第一性原理：会话可见性判定标准 ══════════════
    /**
     * subagent 子会话判定：归宿主 subagent 路由管理（随父会话展示），
     * 宿主禁止将其 attach 到工作区（adopt 必然抛 subagent-ownership 错误），
     * 故不参与树的任何渲染投影，也不进入自动收编/空白草稿回收。
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

    /** 目录树：智能汇聚，折叠无意义的单干长链，保留必要父节点分支。 */
    function buildDirTree(items) {
      if (!items || items.length === 0) return [];
      const wsPaths = items.map((w) => normalizePath(w.path)).filter(Boolean);
      if (wsPaths.length === 0) return [];

      const nodes = new Map();
      const ensure = (p) => {
        const n = normalizePath(p);
        if (!nodes.has(n)) nodes.set(n, { path: n, name: baseName(n), ws: null, children: [] });
        return nodes.get(n);
      };

      for (const w of items) {
        const p = normalizePath(w.path);
        const node = ensure(p);
        node.ws = w;
      }

      for (const w of items) {
        let cur = normalizePath(w.path);
        let p = parentPath(cur);
        while (p !== null && p !== "" && p !== "/") {
          const hasOtherWsUnderP = wsPaths.some((wp) => wp !== cur && wp.startsWith(p + "/"));
          const isWsItself = items.some((item) => normalizePath(item.path) === p);
          if (hasOtherWsUnderP || isWsItself) {
            const par = ensure(p);
            const child = nodes.get(cur);
            if (child && !par.children.includes(child)) par.children.push(child);
            cur = p;
            p = parentPath(cur);
          } else {
            break;
          }
        }
      }

      const childSet = new Set();
      for (const node of nodes.values()) {
        for (const c of node.children) childSet.add(c.path);
      }
      const roots = [...nodes.values()].filter((n) => !childSet.has(n.path));
      const sortNodes = (list) => {
        list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const n of list) sortNodes(n.children);
      };
      sortNodes(roots);
      return roots;
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

    /** 可见会话 ID 列表投影。 */
    function visibleSessionIds(ids, sessions, archived, hardDeleted) {
      if (!Array.isArray(ids)) return [];
      const byId = (sessions && sessions.byId) || {};
      const cur = sessions ? sessions.current : null;
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
    function aggOfSessionIds(ids, sessions, archived, hardDeleted, pendingInteractions) {
      const byId = (sessions && sessions.byId) || {};
      const cur = sessions ? sessions.current : null;
      let best = null;
      for (const sid of ids || []) {
        const row = byId[sid];
        if (!sessionVisible(row, cur, archived, hardDeleted)) continue;
        const st = sessionState(row, sid === cur, pendingKindOf(pendingInteractions, sid));
        if (aggPriority(st) > aggPriority(best)) best = st;
        if (best === "warning") return best;
      }
      return best;
    }
    function decorateAgg(node, wsOf, childrenOf, sessions, archived, hardDeleted, pendingInteractions) {
      let best = null;
      let running = false;
      let hasSessions = false;
      const w = wsOf(node);
      if (w) {
        const vis = visibleSessionIds(w.sessionIds, sessions, archived, hardDeleted);
        if (vis.length > 0) hasSessions = true;
        best = aggOfSessionIds(w.sessionIds, sessions, archived, hardDeleted, pendingInteractions);
        const byId = (sessions && sessions.byId) || {};
        for (const sid of vis) {
          if (byId[sid] && byId[sid].running) { running = true; break; }
        }
      }
      for (const c of childrenOf(node)) {
        const cs = decorateAgg(c, wsOf, childrenOf, sessions, archived, hardDeleted, pendingInteractions);
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

    // ══════════════ 行内输入（带防并发提交锁） ══════════════
    function InlineInput({ initial, placeholder, onCommit, onCancel }) {
      const [value, setValue] = useState(initial || "");
      const inputRef = useRef(null);
      const finishedRef = useRef(false);

      useEffect(() => {
        inputRef.current && inputRef.current.focus();
      }, []);

      const handleCommit = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        const v = value.trim();
        if (v) onCommit(v);
        else onCancel();
      };

      const handleCancel = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onCancel();
      };

      return h("input", {
        ref: inputRef,
        className: "dswt-inline",
        value,
        placeholder,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleCommit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
          }
        },
        onBlur: handleCommit
      });
    }

    // ══════════════ 文件夹模式：目录节点 ══════════════
    function DirNode({ node, depth, indent, showAgg, showCount, expandedDirs, toggleDir, onNavToWorkspace, onNewSessionInDir, onAddWorkspaceDir, onOpenInIde, onNewDir, onCancelNewDir, newDirAt, onRenameWs, onHideWs, sessions, archived, hardDeleted }) {
      const isWs = node.ws !== null;
      const open = expandedDirs.has(node.path);
      const hasChildren = node.children && node.children.length > 0;
      const wsSessionCount = isWs ? visibleSessionIds(node.ws.sessionIds, sessions, archived, hardDeleted).length : 0;
      return h("div", { className: "dswt-dir" }, [
        h("div", {
          key: "rw",
          className: "dswt-projectRow" + (isWs ? " dswt-wsRow" : " dswt-dirRow"),
          style: { paddingLeft: 8 + depth * indent },
          role: "treeitem",
          "aria-expanded": open,
          onClick: () => {
            if (isWs) { onNavToWorkspace(node.ws); return; }
            if (hasChildren) toggleDir(node.path);
          }
        }, [
          h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" + ((showAgg && node.aggRunning) ? " dswt-folderActive" : "") }, [
            h(Icon, { name: folderIconFor(open, !!(showAgg && node.aggHasSessions)), size: 16, className: "dswt-folderSvg" }),
            hasChildren && h("span", { className: "dswt-chevronOverlay" + (open ? " dswt-arrowOpen" : ""), onClick: (e) => { e.stopPropagation(); toggleDir(node.path); } }, h(Icon, { name: "chevron", size: 12 }))
          ]),
          h("span", { key: "nm", className: "dswt-title dswt-dirTitle", title: node.path }, node.name),
          showAgg && node.aggState && h("span", { key: "ag", className: "dswt-slot dswt-aggSlot", title: node.aggState === "warning" ? "有待处理交互" : node.aggState === "ongoing" ? "有会话运行中" : "有会话已完成" }, h(StatusDot, { state: node.aggState, size: 8 })),
          isWs && showCount && h("span", { key: "ct", className: "dswt-dirCount", title: node.path }, String(wsSessionCount)),
          h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
            h("button", { key: "nd", type: "button", className: "dswt-iconButton", title: "新建子文件夹（自动注册为工作区）", onClick: () => onNewDir(node.path) }, h(Icon, { name: "folderPlus", size: 14 })),
            isWs
              ? [
                  h("button", { key: "ide", type: "button", className: "dswt-iconButton", title: "在 IDE 中打开此工作区", onClick: () => onOpenInIde && onOpenInIde(node.path) }, h(Icon, { name: "ide", size: 14 })),
                  h("button", { key: "ns", type: "button", className: "dswt-iconButton", title: "新建会话（cwd=该目录）", onClick: () => onNewSessionInDir(node.ws.workspaceId, node.path) }, h(Icon, { name: "newChat", size: 14 })),
                  h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名工作区", onClick: () => onRenameWs(node.ws) }, h(Icon, { name: "edit", size: 14 })),
                  h("button", { key: "hd", type: "button", className: "dswt-iconButton", title: "移除工作区显示（不删除注册，会话归属不变，重新添加该目录后恢复）", onClick: () => onHideWs && onHideWs(node.ws) }, h(Icon, { name: "minus", size: 14 }))
                ]
              : [
                  h("button", { key: "ide", type: "button", className: "dswt-iconButton", title: "在 IDE 中打开此目录", onClick: () => onOpenInIde && onOpenInIde(node.path) }, h(Icon, { name: "ide", size: 14 })),
                  h("button", { key: "ns", type: "button", className: "dswt-iconButton", title: "新建会话（自动注册工作区，cwd=该目录）", onClick: () => onNewSessionInDir(null, node.path) }, h(Icon, { name: "newChat", size: 14 })),
                  h("button", { key: "aw", type: "button", className: "dswt-iconButton", title: "添加为工作区", onClick: () => onAddWorkspaceDir(node.path) }, h(Icon, { name: "folderOpen", size: 14 }))
                ]
          ])
        ]),
        newDirAt === node.path && h(InlineInput, {
          key: "ndi",
          initial: "",
          placeholder: "子文件夹名",
          onCommit: (v) => onNewDir && onNewDir(node.path, v),
          onCancel: onCancelNewDir
        }),
        open && node.children.map((child) => h(DirNode, {
          key: child.path,
          node: child,
          depth: depth + 1,
          indent,
          showAgg,
          showCount,
          expandedDirs,
          toggleDir,
          onNavToWorkspace,
          onNewSessionInDir,
          onAddWorkspaceDir,
          onOpenInIde,
          onNewDir,
          onCancelNewDir,
          newDirAt,
          onRenameWs,
          onHideWs,
          sessions,
          archived,
          hardDeleted
        }))
      ]);
    }

    // ══════════════ 工作区模式：会话行 ══════════════
    function SessionRow({ sid, sessions, pendingKind, depth, indent, now, onOpen, onRename, onArchive }) {
      const row = (sessions && sessions.byId) ? sessions.byId[sid] : null;
      if (!row) return null;
      const selected = sid === sessions.current;
      const dotState = sessionState(row, selected, pendingKind);
      // v1.9.0 归档门槛：运行中/等待回复审批的会话不允许归档（进区后才可能删不掉的历史
      // 守卫已整体移除；归档区删除零守卫，因此门槛只需保证「运行态不进区」）。
      // v1.9.5：判据改读真实数据源——运行态取 row.running，等待交互取官方 pending 座位
      // （row.pendingInteraction 不存在，恒 undefined）；置灰只是提示，真正的门槛在
      // onArchiveSession（那里复查，并再向 Host 要一次 agents 状态）。
      const canArchive = !row.running && !pendingKind;
      return h("div", {
        className: "dswt-session" + (selected ? " dswt-selected" : ""),
        style: { paddingLeft: 8 + depth * indent },
        role: "treeitem",
        "aria-selected": selected,
        onClick: () => onOpen(sid),
        title: row.displayTitle
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(StatusDot, { state: dotState })),
        h("span", { key: "ti", className: "dswt-title" + (row.blank ? " dswt-blank" : ""), title: row.displayTitle }, row.displayTitle),
        h("span", { key: "tm", className: "dswt-time" }, timeLabel(row.updatedAt, now)),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名", onClick: () => onRename(sid, row.displayTitle) }, h(Icon, { name: "edit", size: 14 })),
          h("button", {
            key: "ar",
            type: "button",
            className: "dswt-iconButton",
            title: canArchive ? "移至归档" : "会话运行中（或等待回复/审批），结束后才能归档",
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
      const selected = sessions && sessions.current === sid;
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
    function ArchiveView({ sessions, wsForest, archived, hardDeleted, onOpen, onRestoreOne, onDeleteOne, onRestoreGroup, onDeleteGroup, onRestoreAll, onDeleteAll, busy }) {
      const byId = (sessions && sessions.byId) || {};

      const allGroups = [];
      (function traverseForest(forest) {
        for (const node of forest || []) {
          const sids = (node.w.sessionIds || []).filter((id) => archivedSessionVisible(byId[id], archived, hardDeleted));
          if (sids.length > 0) {
            allGroups.push({ node, sids });
          }
          if (node.children && node.children.length > 0) {
            traverseForest(node.children);
          }
        }
      })(wsForest);

      // 未分组归档不再存在：无归属的会话由主组件后台自动收编到其 cwd 工作区。
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
        hasAny ? null : h("div", { key: "empty", className: "dswt-empty" }, "归档区为空 — 归档的会话会在此按工作区分组显示"),
        allGroups.map(({ node, sids }) => h("div", { key: node.w.workspaceId, className: "dswt-groupSection" }, [
          h("div", { key: "hd", className: "dswt-projectRow" }, [
            h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" }, h(Icon, { name: "folderOpenFilled", size: 16, className: "dswt-folderSvg" })),
            h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, (node.w.title || baseName(node.w.path)) + " · " + sids.length + " 条")),
            h("span", { key: "ac", className: "dswt-rowActions", style: { display: "inline-flex" } }, [
              h("button", { key: "rs", type: "button", className: "dswt-iconButton", title: "恢复该工作区全部", disabled: !!busy, onClick: () => onRestoreGroup(node.w.workspaceId) }, h(Icon, { name: "restore", size: 14 })),
              h("button", { key: "dl", type: "button", className: "dswt-iconButton dswt-danger", title: "永久删除该工作区全部", disabled: !!busy, onClick: () => onDeleteGroup(node.w.workspaceId) }, h(Icon, { name: "trash", size: 14 }))
            ])
          ]),
          h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": "16px" } }, sids.map((sid) => h(ArchiveSessionRow, { key: sid, sid, sessions, busy, onOpen, onRestore: onRestoreOne, onDelete: onDeleteOne })))
        ]))
      ]);
    }

    // ══════════════ 工作区模式：组 ══════════════
    function WorkspaceGroup({ node, depth, indent, showAgg, sessions, pendingInteractions, archived, hardDeleted, expandedGroups, toggleGroup, onNewSession, onOpenInIde, onRenameWs, onHideWs, onOpen, onRenameSession, onArchiveSession, now }) {
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
          h("span", { key: "ic", className: "dswt-slot dswt-folderIcon" + ((showAgg && node.aggRunning) ? " dswt-folderActive" : "") }, [
            h(Icon, { name: folderIconFor(groupOpen, !!(showAgg && node.aggHasSessions)), size: 16, className: "dswt-folderSvg" }),
            hasContent && h("span", { className: "dswt-chevronOverlay" + (groupOpen ? " dswt-arrowOpen" : "") }, h(Icon, { name: "chevron", size: 12 }))
          ]),
          h("span", { key: "pt", className: "dswt-projectText" }, h("span", { className: "dswt-title" }, w.title || baseName(w.path))),
          showAgg && node.aggState && h("span", { key: "ag", className: "dswt-slot dswt-aggSlot", title: node.aggState === "warning" ? "有待处理交互" : node.aggState === "ongoing" ? "有会话运行中" : "有会话已完成" }, h(StatusDot, { state: node.aggState, size: 8 })),
          h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
            h("button", { key: "ide", type: "button", className: "dswt-iconButton", title: "在 IDE 中打开此工作区", onClick: () => onOpenInIde && onOpenInIde(w.path) }, h(Icon, { name: "ide", size: 14 })),
            h("button", { key: "ns", type: "button", className: "dswt-iconButton", title: "新建会话", onClick: () => onNewSession(w.workspaceId) }, h(Icon, { name: "newChat", size: 14 })),
            h("button", { key: "rn", type: "button", className: "dswt-iconButton", title: "重命名工作区", onClick: () => onRenameWs(w) }, h(Icon, { name: "edit", size: 14 })),
            h("button", { key: "hd", type: "button", className: "dswt-iconButton", title: "移除工作区显示（不删除注册，会话归属不变，重新添加该目录后恢复）", onClick: () => onHideWs && onHideWs(w) }, h(Icon, { name: "minus", size: 14 }))
          ])
        ]),
        groupOpen && h("div", { key: "bd", className: "dswt-groupBody", style: { "--dswt-line-x": (16 + depth * indent) + "px" } }, [
          sids.map((sid) => h(SessionRow, {
            key: "s:" + sid, sid, sessions, pendingKind: pendingKindOf(pendingInteractions, sid), depth: depth + 1, indent, now, onOpen,
            onRename: onRenameSession, onArchive: onArchiveSession
          })),
          (node.children || []).map((child) => h(WorkspaceGroup, {
            key: child.w.workspaceId, node: child, depth: depth + 1, indent, showAgg, sessions, pendingInteractions, archived, hardDeleted,
            expandedGroups, toggleGroup, onNewSession, onOpenInIde, onRenameWs, onHideWs,
            onOpen, onRenameSession, onArchiveSession, now
          }))
        ])
      ]);
    }

    // ══════════════ 主组件 ══════════════
    function WorkspaceTreeBrowser(props) {
      const { wide, useSessions, useWorkspaces, useSessionPendingInteraction, liveSessionRow, renderSlot, startSession, connectWorkspace, open, clearSession, renameSession, renameWorkspace, archiveSession, createWorkspace, deleteWorkspace, pickDirectory, listDirectory, createDirectory, refreshSessions, adoptSession } = props;
      const sessions = useSessions((s) => s);
      const workspaces = useWorkspaces((s) => s);
      // 官方「等待人回复」座位（数据源在 dsh-client-ui-session 的 pendingInteractions，
      // Map<SessionId, {kind}>）。旧版 DSH 没有这个座位：缺席时按「无待处理交互」降级。
      const pendingInteractions = typeof useSessionPendingInteraction === "function"
        ? useSessionPendingInteraction((s) => s)
        : null;

      const [mode, setMode] = useState(initialMode);
      const [expandedDirs, setExpandedDirs] = useState(() => loadSet(LS_DIRS));
      const [expandedGroups, setExpandedGroups] = useState(() => loadSet(LS_GROUPS));
      const [navTarget, setNavTarget] = useState(null);
      const [newDirAt, setNewDirAt] = useState(null);
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

      // 官方目录流（借道渲染成功 + 槽位有占位者时优先使用）：
      // open/busy 交给占位者，onPicked/onCancel/onError 回到这里。
      const [officialOpen, setOfficialOpen] = useState(false);
      const [officialBusy, setOfficialBusy] = useState(false);
      const [officialFlow, setOfficialFlow] = useState(() => officialFlowBridgeRef.ok && officialFlowBridgeRef.occupied());
      useEffect(() => {
        if (!officialFlowBridgeRef.ok) return undefined;
        const sync = () => setOfficialFlow(officialFlowBridgeRef.occupied());
        sync();
        return officialFlowBridgeRef.subscribe(sync);
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

      const toggleDir = useCallback((path) => {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path); else next.add(path);
          saveSet(LS_DIRS, next);
          return next;
        });
      }, []);

      const toggleGroup = useCallback((key) => {
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          saveSet(LS_GROUPS, next);
          return next;
        });
      }, []);

      const switchMode = useCallback((m) => {
        setMode(m);
        if (m !== "archive") {
          try { localStorage.setItem(LS_MODE, m); } catch { /* ignore */ }
        }
      }, []);

      const toggleArchive = useCallback(() => {
        if (swapFrom !== null) return;
        if (mode === "archive") {
          setSwapFrom(mode);
          switchMode(initialMode());
        } else {
          setSwapFrom(mode);
          switchMode("archive");
        }
      }, [mode, swapFrom, switchMode]);

      /** 文件夹模式点击工作区节点 → 纯导航 */
      const navToWorkspace = useCallback((ws) => {
        switchMode("workspace");
        setNavTarget(ws.workspaceId);
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          next.add(ws.workspaceId);
          saveSet(LS_GROUPS, next);
          return next;
        });
      }, [switchMode]);

      // 导航定位
      useEffect(() => {
        if (navTarget === null) return;
        const timer = setTimeout(() => {
          try {
            const el = document.querySelector(".dswt-groupSection[data-wsid=\"" + navTarget + "\"]");
            if (el) el.scrollIntoView({ block: "nearest" });
          } catch { /* ignore */ }
          setNavTarget(null);
        }, 60);
        return () => clearTimeout(timer);
      }, [navTarget, mode]);

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

      /**
       * 在指定目录下新建会话：
       * 严格保证会话与目标工作区绑定——若目录未注册为工作区，先自动注册工作区，再通过 startSession 启动会话。
       */
      const newSessionInDir = useCallback(async (workspaceIdOrNull, dirPath) => {
        try {
          let wid = workspaceIdOrNull;
          if (wid === null) {
            const ws = await createWorkspace({ path: dirPath });
            if (!ws || !ws.workspaceId) throw new Error("工作区注册失败");
            wid = ws.workspaceId;
            unhideWorkspace(ws);
          }
          startSession(wid);
        } catch (error) {
          showAlert("新建会话失败: " + String((error && error.message) || error), "新建会话失败");
        }
      }, [createWorkspace, startSession, showAlert, unhideWorkspace]);

      const addWorkspaceDir = useCallback(async (dirPath) => {
        try {
          const ws = await createWorkspace({ path: dirPath });
          unhideWorkspace(ws);
        } catch (error) {
          showAlert("添加工作区失败: " + String((error && error.message) || error), "添加工作区失败");
        }
      }, [createWorkspace, showAlert, unhideWorkspace]);

      /** 官方占位者选中目录：注册工作区（失败照常弹窗），无论成败都收回交互请求。 */
      const onOfficialPicked = useCallback(async (dirPath) => {
        if (typeof dirPath !== "string" || dirPath === "") { setOfficialOpen(false); return; }
        setOfficialBusy(true);
        try {
          await addWorkspaceDir(dirPath);
        } finally {
          setOfficialBusy(false);
          setOfficialOpen(false);
        }
      }, [addWorkspaceDir]);

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

      // 归档集合（提前声明：收编/回收 effect 的依赖需要它；放后面会触发 TDZ）
      const archived = useMemo(() => new Set((workspaces.archivedSessionIds || []).map(String)), [workspaces.archivedSessionIds]);

      /**
       * 自动收编（后台、静默）：会话没有工作区归属时（如 DSH 升级重置注册表、
       * 或经官方入口在任意 cwd 新建的会话），将其 cwd 注册为工作区（Host 侧按 path 幂等），
       * 再走 Host session.create 的幂等 adopt 语义挂载会话——「未分组」从此不再存在。
       * 失败不弹窗，随列表下一次更新自动重试。
       */
      const adoptInFlight = useRef(new Set());
      useEffect(() => {
        if (!sessions || sessions.phase !== "ready") return;
        if (!workspaces || workspaces.phase !== "ready") return;
        const accounted = accountedSessionIds(workspaces.items || []);
        for (const sid of sessions.ids || []) {
          const id = String(sid);
          if (accounted.has(id)) continue;
          if (hardDeleted.has(id)) continue;
          // 已归档会话不收编：归档态与工作区归属正交，收编会把它重新挂回注册表
          if (archived.has(id)) continue;
          const row = sessions.byId ? sessions.byId[id] : null;
          // 严密过滤空白草稿会话，杜绝将未发消息的空白草稿持久化挂载到工作区
          if (!row || row.blank) continue;
          // subagent 子会话归 subagent 路由所有，宿主禁止 attach 到工作区（adopt 必然失败）
          if (isSubagentRow(row)) continue;
          if (adoptInFlight.current.has(id)) continue;
          adoptInFlight.current.add(id);
          (async () => {
            try {
              const cwd = row.cwd;
              if (!cwd) return;
              let ws = (workspaces.items || []).find((w) => normalizePath(w.path) === normalizePath(cwd));
              if (!ws) ws = await createWorkspace({ path: cwd });
              if (ws && ws.workspaceId) await adoptSession(id, ws.workspaceId);
            } catch (error) {
              console.warn("[workspace-tree] 自动收编失败（将随列表更新重试）:", id, error);
            } finally {
              adoptInFlight.current.delete(id);
            }
          })();
        }
      }, [sessions.ids, sessions.byId, sessions.phase, workspaces.items, workspaces.phase, hardDeleted, archived, createWorkspace, adoptSession]);

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

      const commitNewDir = useCallback(async (parentPath, name) => {
        try {
          const data = await apiPost("/mkdir", { parent: parentPath, name });
          if (data.ok !== true) throw new Error(data.error || "创建失败");
          unhideWorkspace(await createWorkspace({ path: data.path }));
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            next.add(parentPath);
            saveSet(LS_DIRS, next);
            return next;
          });
          setNewDirAt(null);
        } catch (error) {
          showAlert("新建文件夹失败: " + String((error && error.message) || error), "新建文件夹失败");
        }
      }, [createWorkspace, showAlert, unhideWorkspace]);

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
        const cur = sessions ? sessions.current : null;
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
       * 归档会话的唯一入口。判据三层，逐层更权威：
       *  1) 空白草稿不归档（归档后双视图都不可见，用户会找不到它）；
       *  2) 运行中 / 等待审批·计划复核·提问 不归档 —— 读**本次渲染**的活快照与官方
       *     pending 座位，而不是行按钮渲染时算好的 canArchive 闭包（那个可能已过期）；
       *  3) Host 权威复查：官方 workspace/archiveSession 在 Host 上没有运行态守卫，
       *     客户端 running 位是 Host 转发事实（发送后到状态帧落地之间有窗口），所以
       *     归档前问一次插件 Host 半边 agents.get(sessionId).status；查询不可用时
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
        const pendingKind = pendingKindOf(pendingInteractions, sessionId);
        if (pendingKind) {
          showAlert("会话正在" + PENDING_LABEL[pendingKind] + "，处理完才能归档", "无法归档");
          return;
        }
        const guard = await checkArchiveGuard(sessionId);
        if (guard.ok && guard.running) {
          // 客户端位落后于 Host（转发窗口/事件流打嗝）：顺手让列表重新对齐一次。
          if (typeof refreshSessions === "function") refreshSessions();
          showAlert("会话正在运行（Host 实测状态：" + String(guard.status || "running") + "），结束后才能归档", "无法归档");
          return;
        }
        try {
          await archiveSession(sessionId);
        } catch (error) {
          showAlert(String((error && error.message) || error), "归档会话失败");
        }
      }, [archiveSession, showAlert, sessions, liveSessionRow, pendingInteractions, refreshSessions]);

      const isCurrentArchived = useMemo(() => {
        if (!sessions || !sessions.current) return false;
        return archived.has(String(sessions.current));
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
            if (sessions && sessions.current && deleted.some((id) => String(id) === String(sessions.current))) {
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
       */
      const onPickWithFinder = useCallback(async () => {
        if (nativeBusy) return;
        setNativeBusy(true);
        try {
          const result = await apiPost("/picker/native", {});
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
       * 「添加工作区」按钮的唯一行为。**本机 macOS 单击直达 Finder**（/picker/native 报支持时
       * 短路到 onPickWithFinder）；其余环境走下面这条内置路径：先试官方目录流占位者（native 主机
       * 弹系统选择器、browse 主机弹官方浏览对话框），没有占位者时自持兜底——先试
       * uiWorkspace.pickDirectory()，被拒（browse 主机必被 host 以 directory-picker/unavailable
       * 拒绝，这不是故障，不该弹错）则转本插件自持的内置浏览对话框。
       * 转之前先探一次 home：探得通才开对话框（顺带作为首屏，不再二次拉取），
       * 探不通说明两种能力都没有——此时如实报 native 的原始错误，不留死胡同。
       */
      const onAddWorkspace = useCallback(async () => {
        if (nativePicker) return onPickWithFinder();
        // 官方交互可用（借道成功且槽位有占位者）：native 主机弹系统选择器、browse 主机弹
        // 官方内置浏览对话框，两种形态都由占位者自己决定，这里只递交 owner 请求。
        if (officialFlow) {
          setOfficialOpen(true);
          return;
        }
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
          const seed = await listDirectory(void 0);
          setPickerSeed(seed || null);
          setPickerOpen(true);
        } catch (browseError) {
          console.warn("[dsh-workspace-tree] 内置目录浏览同样不可用：", browseError);
          // 两种能力都没有：如实报错，不留一个点不动的对话框。
          // native 是被 capability 拒绝的（host 服务 browse，只是客户端这边也拿不到
          // browse 面，例如旧版 DSH）时，真正的可操作信息在 browse 那一侧；否则
          // native 的失败原因更准（系统选择器真的坏了）。
          const nativeMsg = String((nativeError && nativeError.message) || nativeError || "");
          const browseMsg = String((browseError && browseError.message) || browseError || "");
          const nativeRefused = /needs the native capability|directory-picker\/unavailable/.test(nativeMsg);
          try {
            document.body.setAttribute("data-dswt-dirflow-diag", JSON.stringify({
              bridge: officialFlowBridgeRef.ok ? "ok" : officialFlowBridgeRef.reason,
              occupied: officialFlowBridgeRef.occupied(),
              nativeMsg: nativeMsg,
              browseMsg: browseMsg,
              nativeRefused: nativeRefused
            }));
          } catch { /* ignore */ }
          showAlert("添加工作区失败: " + ((nativeRefused && browseMsg) ? browseMsg : (nativeMsg || browseMsg)), "添加工作区失败");
        }
      }, [nativePicker, onPickWithFinder, officialFlow, pickDirectory, listDirectory, addWorkspaceDir, showAlert]);

      /**
       * 官方目录流的现场诊断（写在侧栏根节点的 data 属性上，供排查与支持）：
       * official = 走官方占位者；self = 回退自持对话框；bridge 段给出探测结论/失败原因。
       */
      const dirflowDiag = () => (officialFlow ? "official" : "self") + ";bridge=" + (officialFlowBridgeRef.ok ? "ok" : officialFlowBridgeRef.reason);

      // 数据投影计算：visibleItems 为未被「移除显示」的工作区（树只由它构建）
      const items = workspaces.items || [];
      const visibleItems = useMemo(
        () => items.filter((w) => !hiddenWs.has(String(w.workspaceId))),
        [items, hiddenWs]
      );
      const aggCtx = useMemo(() => {
        const dirForest = buildDirTree(visibleItems);
        const wsForest = buildWorkspaceForest(visibleItems);
        // 归档用全量森林：被“移除显示”的工作区的归档会话也必须可见可恢复，
        // 否则隐藏即永久失联（与“仅移除显示、归属不变”的承诺冲突）
        const archiveForest = buildWorkspaceForest(items);
        for (const n of dirForest) decorateAgg(n, (x) => x.ws, (x) => x.children, sessions, archived, hardDeleted, pendingInteractions);
        for (const n of wsForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, pendingInteractions);
        for (const n of archiveForest) decorateAgg(n, (x) => x.w, (x) => x.children, sessions, archived, hardDeleted, pendingInteractions);
        return { dirForest, wsForest, archiveForest };
      }, [visibleItems, items, sessions, archived, hardDeleted, pendingInteractions]);

      const dirForest = aggCtx.dirForest;
      const wsForest = aggCtx.wsForest;
      const archiveForest = aggCtx.archiveForest;

      // 官方目录流占位者：借道成功且有占位者时才渲染（native 驱动或官方 browse 对话框）。
      const officialFlowNode = (officialFlow && typeof renderSlot === "function")
        ? renderSlot(officialFlowBridgeRef.hole, {
            open: officialOpen,
            busy: officialBusy,
            onPicked: onOfficialPicked,
            onCancel: () => setOfficialOpen(false),
            onError: (message) => {
              setOfficialOpen(false);
              showAlert(String(message || "目录选择失败"), "添加工作区失败");
            }
          })
        : null;

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

      // 「添加工作区」是**唯一**入口：本机 macOS 单击直达 Finder，其余环境走内置目录浏览
      // （分支逻辑在 onAddWorkspace）。标题随环境说明本次会开什么，避免出现第二个同类按钮。
      const addWorkspaceTitle = nativePicker
        ? (nativeBusy ? "Finder 窗口已打开，等待选择…" : "添加工作区（用 Finder 选择目录）")
        : "添加工作区";
      const addWorkspaceDisabled = nativePicker ? nativeBusy : (pickerBusy || officialBusy);

      // rail 模式：窄图标列
      if (!wide) {
        return h("div", { className: "dswt-rail", "data-dswt-dirflow": dirflowDiag() }, [
          h("button", { key: "ws", type: "button", className: "dswt-rail-btn", title: addWorkspaceTitle, "aria-label": "添加工作区", disabled: addWorkspaceDisabled, onClick: onAddWorkspace }, h(Icon, { name: "folderOpen", size: 18 })),
          officialFlowNode,
          pickerNode
        ]);
      }

      const header = h("div", { key: "h", className: "dswt-sectionHeader" }, [
        h("div", {
          key: "t",
          className: "dswt-modeTitle",
          title: mode === "archive" ? "点击返回工作区" : "点击切换到" + (mode === "folder" ? "工作区" : "文件夹") + "模式",
          onClick: () => {
            if (swapFrom !== null) return;
            if (mode === "archive") { toggleArchive(); return; }
            setSwapFrom(mode);
            switchMode(mode === "folder" ? "workspace" : "folder");
          }
        }, [
          swapFrom !== null && h("span", { key: "out", className: "dswt-titleItem dswt-titleOut" }, swapFrom === "folder" ? "文件夹" : swapFrom === "archive" ? "归档区" : "工作区"),
          h("span", { key: "in" + mode, className: "dswt-titleItem dswt-titleIn" }, mode === "archive" ? "归档区" : mode === "folder" ? "文件夹" : "工作区")
        ]),
        h("span", { key: "a", className: "dswt-headerActions" }, [
          mode !== "archive" && h("button", { key: "ns", type: "button", className: "dswt-headBtn", title: "新建会话（选择工作区）", onClick: () => { if (clearSession) clearSession(); else if (typeof startSession === "function") startSession(); } }, h(Icon, { name: "newChat", size: 16 })),
          mode !== "archive" && h("button", { key: "ws", type: "button", className: "dswt-headBtn", title: addWorkspaceTitle, "aria-label": "添加工作区", disabled: addWorkspaceDisabled, onClick: onAddWorkspace }, h(Icon, { name: "plus", size: 16 })),
          h("button", { key: "ar", type: "button", className: "dswt-headBtn" + (mode === "archive" ? " dswt-headBtnActive" : ""), title: mode === "archive" ? "返回" : "归档区", onClick: toggleArchive }, h(Icon, { name: "archive", size: 16 }))
        ].filter(Boolean))
      ]);

      let body;
      if (mode === "folder") {
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "文件夹" }, [
          dirForest.map((node) => h(DirNode, {
            key: node.path, node, depth: 0, indent: cfg.indent, showAgg: cfg.showAgg, showCount: cfg.showCount,
            expandedDirs, toggleDir,
            onNavToWorkspace: navToWorkspace, onNewSessionInDir: newSessionInDir,
            onAddWorkspaceDir: addWorkspaceDir,
            onOpenInIde: openInIde,
            onNewDir: (p, name) => {
              if (name === void 0) setNewDirAt(p === newDirAt ? null : p);
              else commitNewDir(p, name);
            },
            onCancelNewDir: () => setNewDirAt(null),
            newDirAt,
            onRenameWs: onRequestRenameWs, onHideWs, sessions, archived, hardDeleted
          })),
          dirForest.length === 0 && h("div", { key: "e", className: "dswt-empty" }, "尚无工作区——点击上方「添加工作区」或先新建会话")
        ]);
      } else if (mode === "archive") {
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
        // 工作区模式：全部会话均归属于某工作区（无归属者由后台自动收编），故无「未分组」区块
        body = h("div", { key: "l", className: "dswt-list", role: "tree", "aria-label": "工作区" }, [
          wsForest.map((node) => h(WorkspaceGroup, {
            key: node.w.workspaceId, node, depth: 0, indent: cfg.indent, showAgg: cfg.showAgg, sessions, pendingInteractions, archived, hardDeleted,
            expandedGroups, toggleGroup,
            onNewSession: (wid) => newSessionInDir(wid, node.w.path),
            onOpenInIde: openInIde,
            onRenameWs: onRequestRenameWs, onHideWs,
            onOpen: open, onRenameSession: onRequestRenameSession, onArchiveSession, now
          })),
          wsForest.length === 0 && h("div", { key: "e", className: "dswt-empty" }, hiddenWs.size > 0 ? "所有工作区均已移除显示——重新添加目录即可恢复" : "尚无工作区——点击上方「添加工作区」或先新建会话")
        ]);
      }

      const archiveModalProps = (() => {
        if (!archiveConfirm) return { open: false, title: "", desc: "", confirmText: "确认", danger: false };
        const k = archiveConfirm.kind;
        if (k === "deleteOne") return { open: true, title: "永久删除会话", desc: "确定要永久删除会话 “" + (archiveConfirm.title || "") + "” 吗？此操作将彻底删除会话数据与关联的全部子智能体（Subagent）日志，无法恢复。", confirmText: "永久删除", danger: true };
        if (k === "restoreGroup") return { open: true, title: "恢复工作区归档", desc: "确定要恢复工作区 “" + (archiveConfirm.title || "") + "” 的全部归档会话吗？", confirmText: "恢复全部", danger: false };
        if (k === "deleteGroup") return { open: true, title: "删除工作区归档", desc: "确定要永久删除工作区 “" + (archiveConfirm.title || "") + "” 的全部归档会话吗？此操作不可恢复。", confirmText: "永久删除", danger: true };
        if (k === "restoreAll") return { open: true, title: "恢复全部归档", desc: "确定要恢复全部 " + (archived.size || 0) + " 条归档会话吗？", confirmText: "恢复全部", danger: false };
        if (k === "deleteAll") return { open: true, title: "删除全部归档", desc: "确定要永久删除全部 " + (archived.size || 0) + " 条归档会话吗？此操作不可恢复。", confirmText: "永久删除", danger: true };
        return { open: false, title: "", desc: "", confirmText: "确认", danger: false };
      })();

      return h("div", { className: "dswt-root", "data-dswt-dirflow": dirflowDiag() }, [
        header, body, officialFlowNode, pickerNode,
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
    function ConfigToggle({ checked, onChange, label, disabled }) {
      return h("label", { className: "dswt-switch" }, [
        h("input", { type: "checkbox", checked: !!checked, disabled: !!disabled, onChange: (e) => onChange(e.target.checked) }),
        h("span", { className: "dswt-switchTrack" }),
        h("span", { className: "dswt-switchText" }, label)
      ]);
    }
    function ConfigRow({ label, hint, children }) {
      return h("div", { className: "dswt-configRow" }, [
        h("div", { className: "dswt-configCol" }, [
          h("div", { className: "dswt-configLabel" }, label),
          hint && h("div", { className: "dswt-configHint" }, hint)
        ]),
        h("div", { className: "dswt-configControl" }, children)
      ]);
    }
    const IDE_OPTIONS = [
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
      ["custom", "自定义命令…"]
    ];

    function ConfigPanel() {
      const [lsCfg, setLsCfg] = useState(getConfig);
      const [, forceScope] = useState(0);
      const [diagMsg, setDiagMsg] = useState("");
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
      const copyLockRef = useRef(false);
      const onCopyDiag = async () => {
        if (copyLockRef.current) return;
        copyLockRef.current = true;
        try {
          setDiagMsg("采集中…");
          const diag = collectDiagnostics();
          const text = JSON.stringify(diag);
          const ok = await copyTextToClipboard(text);
          try { console.log("[workspace-tree] diagnostics:", diag); } catch { /* ignore */ }
          setDiagMsg(ok
            ? "已复制（共 " + text.length + " 字符），请粘贴给开发者"
            : "剪贴板写入失败，完整诊断已输出到控制台（F12 查看），请手动复制");
        } catch (e) {
          setDiagMsg("采集失败：" + String((e && e.message) || e));
        } finally {
          copyLockRef.current = false;
        }
      };
      /** 手动清空删除墓碑（自愈失效时的兜底）：清 LS + 广播事件让侧栏树同步内存态。 */
      const onClearTombstones = () => {
        try {
          const n = loadSet(LS_DELETED).size;
          saveSet(LS_DELETED, new Set());
          window.dispatchEvent(new CustomEvent("dswt-tombstones-cleared"));
          setTombMsg(n > 0 ? "已清空 " + n + " 条墓碑" : "墓碑本来就是空的");
        } catch (e) {
          setTombMsg("清空失败：" + String((e && e.message) || e));
        }
      };
      const select = (value, options, onPick) => h("select", {
        className: "dswt-configSelect",
        value,
        disabled: readOnly,
        onChange: (e) => onPick(e.target.value)
      }, options.map(([v, l]) => h("option", { key: v, value: v }, l)));
      return h("div", { className: "dswt-config" }, [
        h("div", { className: "dswt-configCard" }, [
          h("div", { className: "dswt-configTitle" }, "工作区树"),
          h("div", { className: "dswt-configDesc" }, "文件系统双模式工作区浏览器：文件夹模式按目录浏览与新建（环境隔离），工作区模式管理会话。"),
          h("div", {
            className: "dswt-configDesc",
            style: { marginTop: "4px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }
          }, useHost
            ? (readOnly ? "配置由 Host 托管（~/.dsh/settings.yaml › " + SETTINGS_NS + "），当前只读。" : "配置由 Host 托管（~/.dsh/settings.yaml › " + SETTINGS_NS + "），重启/换端口不丢失。")
            : "Host 设置服务不可用（旧版 DSH），配置暂存浏览器本地。"),
          h(ConfigRow, { label: "启用插件", hint: "关闭后回退官方工作区浏览器（注册级，刷新页面生效）" },
            h(ConfigToggle, { checked: cfg.enabled, disabled: readOnly, onChange: (v) => upd({ enabled: v }), label: "启用" })),
          h(ConfigRow, { label: "层级缩进", hint: "树中每一级的缩进宽度" },
            select(cfg.indent, [[8, "紧凑（8px）"], [16, "标准（16px）"], [24, "宽松（24px）"]], (v) => upd({ indent: Number(v) }))),
          h(ConfigRow, { label: "默认模式", hint: "打开侧栏时优先显示的模式（手动切换后会记住）" },
            select(cfg.defaultMode, [["folder", "文件夹模式"], ["workspace", "工作区模式"]], (v) => upd({ defaultMode: v }))),
          h(ConfigRow, { label: "默认 IDE", hint: "点击工作区按钮栏「在 IDE 中打开」时调用的编辑器" },
            select(cfg.defaultIde || "vscode", IDE_OPTIONS, (v) => upd({ defaultIde: v }))),
          cfg.defaultIde === "custom" && h("div", {
            className: "dswt-customIdeBox",
            style: {
              background: "var(--dsw-alias-bg-layer-2)",
              border: "1px solid var(--dsw-alias-border-l1)",
              borderRadius: "10px",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          }, [
            h("div", {
              style: {
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--dsw-alias-label-primary)"
              }
            }, "自定义 IDE 可执行文件路径 / 命令"),
            h("input", {
              type: "text",
              className: "dswt-inline",
              style: {
                width: "100%",
                maxWidth: "100%",
                margin: "0",
                boxSizing: "border-box",
                fontFamily: "var(--ds-font-family-code, monospace)",
                fontSize: "12px",
                padding: "6px 8px"
              },
              placeholder: "例如: /Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code",
              value: cfg.customIdeCommand || "",
              disabled: readOnly,
              onChange: (e) => upd({ customIdeCommand: e.target.value })
            }),
            h("div", {
              style: {
                fontSize: "12px",
                lineHeight: "18px",
                color: "var(--dsw-alias-label-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "3px"
              }
            }, [
              h("div", { style: { fontWeight: 500, color: "var(--dsw-alias-label-primary)" } }, "💡 填写格式说明："),
              h("div", { style: { color: "var(--dsw-alias-label-secondary)" } }, "• 仅输入可执行文件的绝对路径或命令名，系统会在点击打开时自动在末尾追加工作区路径。"),
              h("div", { style: { color: "var(--dsw-alias-label-secondary)" } }, "• 勿加引号：带空格的路径直接复制输入即可，不要包裹双引号。"),
              h("div", { style: { color: "var(--dsw-alias-label-secondary)" } }, "• 勿加参数与点：不要在末尾加 . 或其他路径参数。"),
              h("div", { style: { color: "var(--dsw-alias-label-tertiary)", marginTop: "2px" } }, "示例（macOS App 内部 CLI）：/Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code"),
              h("div", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "示例（系统 PATH 中的命令）：code-insiders 或 buddycn 或 nvim")
            ])
          ]),
          h(ConfigRow, { label: "状态向上透传", hint: "目录/组头显示子树内会话的聚合状态点（运行/等待/完成）" },
            h(ConfigToggle, { checked: cfg.showAgg, disabled: readOnly, onChange: (v) => upd({ showAgg: v }), label: "显示" })),
          h(ConfigRow, { label: "会话计数角标", hint: "文件夹模式工作区节点旁的会话数" },
            h(ConfigToggle, { checked: cfg.showCount, disabled: readOnly, onChange: (v) => upd({ showCount: v }), label: "显示" })),
          h(ConfigRow, { label: "诊断信息", hint: "排查侧栏显示问题时，把本机工作区/会话状态复制发给开发者（仅元数据，无消息正文）" },
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
              h("button", { type: "button", className: "dswt-configBtn", onClick: onCopyDiag }, "复制诊断信息"),
              diagMsg && h("span", { className: "dswt-configSaved" }, diagMsg)
            ])),
          h(ConfigRow, { label: "删除墓碑", hint: "「永久删除」的本地隐藏记录（localStorage）。树已会向 Host 校验物理存在自动作废误写墓碑；若仍疑似被误隐藏，可在此一键清空（不影响真实已删除的会话）" },
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
              h("button", { type: "button", className: "dswt-configBtn", onClick: onClearTombstones }, "清空墓碑"),
              tombMsg && h("span", { className: "dswt-configSaved" }, tombMsg)
            ])),
          h("div", { className: "dswt-configActions" }, [
            h("button", { type: "button", className: "dswt-configBtn", disabled: readOnly, onClick: () => { if (!readOnly) resetEffectiveConfig(); } }, "恢复默认"),
            h("span", { className: "dswt-configSaved" }, "修改即时生效（启用开关除外）")
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
      const sid = sessionId || (ctx?.sessions?.list?.getSnapshot ? ctx.sessions.list.getSnapshot().current : null);
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
        label: "工作区树"
      }, ConfigPanel));

      /**
       * 会话/目录导航方法（startSession / connectWorkspace / pickDirectory）的宿主服务：
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

      // 允许阅览已归档会话：
      // - 新版 DSH：官方 UiWorkspaceService 通过 clearArchivedCurrent() 清除当前归档会话，patch 为无操作；
      // - 旧版 DSH：回退 patch WorkspaceRuntime.project 中当 sessions.current 属于归档时自动 clear() 的投影。
      // uiWorkspace 未声明为硬依赖，apply 时刻可能早于其注册：立即尝试 patch，
      // 未就绪则监听 cordis 的 internal/service 注册事件，服务出现后补 patch。
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
      // 历史兼容块已移除（2026-09-10 审计）：此处曾 patch ctx.workspaces.project，
      // 但 dsh-api-workspace-controller 的 WorkspaceController 在 0.1.3-alpha.2 与
      // 0.1.5-rc.1 **两个版本都没有 project 方法**，两处 typeof 守卫恒为假 →
      // 整块是永不执行的死代码（且内部用的是旧 WorkspaceRuntime 的
      // this.manager / this.sessions.list 形状）。已阅览归档会话仍由上面的
      // patchUiWorkspaceArchivedView() 承担。

      // 启用开关走有效配置（Host 就绪即读 settings，否则回退 LS）。
      // 注意：apply 时刻 scope 可能仍在 loading，此处是启动快照；运行中关闭
      // 仍需刷新页面回退官方栏（设置页有同等提示）。
      if (!getEffectiveConfig().enabled) return;

      // 归档会话只读接管：通过 conversation.composer chain slot 替换输入框为只读条
      ctx.slots.inject("conversation.composer", () => ctx.slots.register({
        name: "conversation.composer",
        priority: -100,
        select: (owner) => {
          const cur = ctx.sessions?.list?.getSnapshot ? ctx.sessions.list.getSnapshot().current : null;
          if (!cur) return null;
          const wsList = ctx.workspaces?.list?.getSnapshot ? ctx.workspaces.list.getSnapshot() : null;
          const archivedIds = (wsList && wsList.archivedSessionIds) || [];
          if (archivedIds.map(String).includes(String(cur))) {
            return { sessionId: cur };
          }
          return null;
        }
      }, (props) => h(ReadonlyArchivedComposerBanner, { ...props, ctx })));

      // ══════════════ 官方目录对话框的「借道渲染」 ══════════════
      /**
       * 内核「添加工作区只有一条路」把交互挂在 sidebar.workspaces.directoryFlow 子槽上，而槽位
       * 账本（SlotCore.register）一个子键只允许**一个** entry 声明：被本插件顶掉的内核
       * WorkspaceBrowser entry 仍然注册着、仍然持有该声明，所以 v1.9.5 只能自持一份等价对话框。
       *
       * 但渲染授权看的是 entry 自己的 children 表（boundRenderSlot: `entry.children?.[key]`），
       * 不是账本里"谁声明了"。于是存在一个不破坏内核不变量的借道办法：让本插件这次 register
       * 别抛错、把 children 写进我们 entry 的 options，账本继续记在内核 entry 名下。
       * 代价是必须碰 slots._core 这些**非公开内部**，所以整块做成「探测 → 试探 → 任何一步失败
       * 即整体放弃、回退自持对话框」，并且补丁作用域收到最小：
       *  - 只在 armed 窗口（我们那一次注册）临时清掉冲突 record 的 spec，注册后立刻还原；
       *  - 压制该次合成的 notifyDeclaration（否则占位者会被重新唤醒，在 single 槽里重复注册）；
       *  - 我们 entry 卸载时跳过对该子键的级联清理（否则会把官方占位者一起掀掉）。
       */
      const officialFlowBridge = (() => {
        const hole = "sidebar.workspaces.directoryFlow";
        try {
          const core = ctx.slots ? ctx.slots._core : null;
          if (!core || typeof core.register !== "function" || typeof core.releaseEntry !== "function"
            || typeof core.notifyDeclaration !== "function" || !(core.records instanceof Map)) {
            return { ok: false, reason: "slots._core 形状不符" };
          }
          const own = new Set();
          let armed = false;
          const origRegister = core.register;
          const origRelease = core.releaseEntry;
          core.register = function (options, component) {
            if (!armed) return origRegister.call(core, options, component);
            const saved = [];
            const keys = (options && options.children) ? Object.keys(options.children) : [];
            for (const key of keys) {
              const rec = core.records.get(key);
              if (rec !== undefined && rec.spec !== undefined) {
                saved.push({ rec: rec, spec: rec.spec, declaredBy: rec.declaredBy, parent: rec.parent, epoch: rec.declarationEpoch });
                rec.spec = undefined;
              }
            }
            const notify = core.notifyDeclaration;
            if (saved.length > 0) core.notifyDeclaration = function () {};
            try {
              return origRegister.call(core, options, component);
            } finally {
              core.notifyDeclaration = notify;
              for (const item of saved) {
                item.rec.spec = item.spec;
                item.rec.declaredBy = item.declaredBy;
                item.rec.parent = item.parent;
                item.rec.declarationEpoch = item.epoch;
              }
            }
          };
          core.releaseEntry = function (entry) {
            if (own.has(entry) && entry && entry.children !== undefined
              && Object.prototype.hasOwnProperty.call(entry.children, hole)) {
              const savedChildren = entry.children;
              entry.children = undefined;
              try { return origRelease.call(core, entry); } finally { entry.children = savedChildren; }
            }
            return origRelease.call(core, entry);
          };
          ctx.effect(() => () => {
            core.register = origRegister;
            core.releaseEntry = origRelease;
          }, "dsh-workspace-tree: official directory-flow bridge");
          return {
            ok: true,
            hole: hole,
            /** 在放行窗口里执行我们那次 register，并登记我们的 entry（卸载时不级联）。 */
            register: (options, component) => {
              armed = true;
              let dispose;
              try {
                dispose = ctx.slots.register(options, component);
              } finally {
                armed = false;
              }
              const rows = core.records.get("sidebar.workspaces");
              if (rows && Array.isArray(rows.entries)) {
                for (const entry of rows.entries) if (entry.component === component) own.add(entry);
              }
              return dispose;
            },
            /** 槽位当前是否有占位者——没有占位者就没有官方交互可渲染。 */
            occupied: () => {
              try {
                const rows = ctx.slots.entries ? ctx.slots.entries(hole) : null;
                return Array.isArray(rows) && rows.length > 0;
              } catch { return false; }
            },
            /** 占位者出现/消失时回调，用于在官方与自持之间切换。 */
            subscribe: (listener) => {
              try {
                return typeof ctx.slots.subscribe === "function" ? ctx.slots.subscribe(hole, listener) : () => {};
              } catch { return () => {}; }
            }
          };
        } catch (error) {
          return { ok: false, reason: String((error && error.message) || error) };
        }
      })();
      if (officialFlowBridge.ok) {
        officialFlowBridgeRef.ok = true;
        officialFlowBridgeRef.hole = officialFlowBridge.hole;
        officialFlowBridgeRef.occupied = officialFlowBridge.occupied;
        officialFlowBridgeRef.subscribe = officialFlowBridge.subscribe;
        officialFlowBridgeRef.reason = "";
      } else {
        officialFlowBridgeRef.reason = String(officialFlowBridge.reason || "未知原因");
        console.info("[dsh-workspace-tree] 官方目录对话框借道渲染不可用（" + officialFlowBridgeRef.reason + "），使用插件自持对话框");
      }

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
                if (uiWs && typeof uiWs.startSession === "function") {
                  uiWs.startSession(workspaceId);
                  return;
                }
                if (workspaceId && ctx.sessions && typeof ctx.sessions.create === "function") {
                  ctx.sessions.create({ workspaceId }).then((sessionId) => {
                    if (typeof ctx.sessions.open === "function") ctx.sessions.open(sessionId);
                  }).catch((err) => {
                    console.warn("[dsh-workspace-tree] startSession fallback failed:", err);
                  });
                } else if (ctx.sessions && typeof ctx.sessions.clear === "function") {
                  ctx.sessions.clear();
                }
              },
              connectWorkspace: async (workspaceId) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.connectWorkspace === "function") {
                  return await uiWs.connectWorkspace(workspaceId);
                }
                if (ctx.sessions && typeof ctx.sessions.create === "function") {
                  return await ctx.sessions.create({ workspaceId });
                }
                throw new Error("会话创建服务不可用");
              },
              open: (sessionId) => {
                if (ctx.sessions && typeof ctx.sessions.open === "function") {
                  ctx.sessions.open(sessionId);
                }
              },
              clearSession: () => {
                try {
                  if (typeof ctx.sessions?.clear === "function") ctx.sessions.clear();
                } catch { /* ignore */ }
              },
              renameSession: async (sessionId, title) => {
                const activeSession = ctx.sessions?.binding?.(sessionId)?.session;
                if (activeSession) {
                  const result = await activeSession.rename(title);
                  if (!result.ok) throw new Error(result.error?.message || "重命名失败");
                  return;
                }
                // 历史兜底已移除（2026-09-10 审计）：ctx.connection.api 在
                // 0.1.3-alpha.2 与 0.1.5-rc.1 的 connection handle 上都**不存在**
                // （handle 只有 isLoopback/generation/state/rpc/reconnect/
                // registerGenerationSource/start），该分支恒为假。
                // 主路径 ctx.sessions.binding(id).session.rename() 覆盖所有
                // host 列表内的会话（binding 会为其物化 scope），保持不变。
                throw new Error("无法连接到会话重命名服务");
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
              adoptSession: (sessionId, workspaceId) => {
                if (ctx.sessions && typeof ctx.sessions.create === "function") {
                  return ctx.sessions.create({ sessionId, workspaceId });
                }
                return Promise.reject(new Error("会话服务不可用"));
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
                // 历史兜底已移除（2026-09-10 审计）：ctx.directoryPicker 从来不是
                // cordis 服务（全仓无 provide("directoryPicker")），0.1.5-rc.1 里它
                // 是 Remote 命名空间下的 remote.directoryPicker。主路径
                // uiWorkspace.pickDirectory() 在两版都可用，保持不变。
                throw new Error("目录选择服务不可用");
              },
              listDirectory: (path, signal) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.listDirectory === "function") {
                  return uiWs.listDirectory(path, signal);
                }
                throw new Error("当前 DSH 版本不支持目录浏览（uiWorkspace.listDirectory）；可在文件夹模式用「添加为工作区」，或升级 DSH。");
              },
              createDirectory: (path, dirName) => {
                const uiWs = resolveUiWorkspace();
                if (uiWs && typeof uiWs.createDirectory === "function") {
                  return uiWs.createDirectory(path, dirName);
                }
                throw new Error("当前 DSH 版本不支持新建文件夹（uiWorkspace.createDirectory）；可在文件夹模式用「新建文件夹」，或升级 DSH。");
              },
              refreshSessions: () => {
                try {
                  if (typeof ctx.sessions?.refresh === "function") ctx.sessions.refresh();
                } catch { /* ignore */ }
              }
          };
        }
        };
        // 只有借道成功才声明子槽（声明即渲染授权，见 officialFlowBridge 注释）；
        // 失败则完全保持 v1.9.5 的形态：不声明、用自持对话框。
        if (officialFlowBridge.ok) {
          options.children = { [officialFlowBridge.hole]: { kind: "single", scope: "root" } };
          return officialFlowBridge.register(options, component);
        }
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
      .dswt-dirTitle {
        flex: 1;
        margin: 0 6px 0 4px;
        color: var(--dsw-alias-label-secondary);
      }
      .dswt-dirRow:hover .dswt-dirTitle {
        color: var(--dsw-alias-label-primary);
      }
      .dswt-dirCount {
        flex: none;
        min-width: 16px;
        text-align: center;
        font-size: 11px;
        line-height: 16px;
        color: var(--dsw-alias-label-tertiary);
        background: var(--dsw-alias-bg-layer-2);
        border-radius: 8px;
        padding: 0 4px;
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
      .dswt-inline {
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
        min-width: 0;
        max-width: calc(100% - 16px);
        color: var(--dsw-alias-label-primary);
        border-radius: 4px;
        outline: none;
        padding: 3px 6px;
        font-size: 14px;
        line-height: 20px;
        margin: 2px 8px;
        box-sizing: border-box;
      }
      .dswt-inline:focus {
        border-color: var(--dsw-alias-brand-primary);
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
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dswt-configTitle {
        font-size: 15px;
        line-height: 22px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        margin: 0;
      }
      .dswt-configDesc {
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-secondary);
        margin: 0;
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
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-primary);
      }
      .dswt-configHint {
        font-size: 12px;
        line-height: 17px;
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
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        font-family: inherit;
        font-size: 13px;
        outline: none;
      }
      .dswt-configSelect:focus {
        border-color: var(--dsw-alias-brand-primary);
      }
      .dswt-switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
      }
      .dswt-switch input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .dswt-switchTrack {
        width: 36px;
        height: 20px;
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        position: relative;
        transition: background-color .15s var(--ds-ease-in-out, ease), border-color .15s var(--ds-ease-in-out, ease);
        flex: none;
      }
      .dswt-switchTrack::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--dsw-alias-label-tertiary);
        transition: transform .15s var(--ds-ease-in-out, ease), background-color .15s var(--ds-ease-in-out, ease);
      }
      .dswt-switch input:checked + .dswt-switchTrack {
        background: var(--dsw-alias-brand-primary);
        border-color: var(--dsw-alias-brand-primary);
      }
      .dswt-switch input:checked + .dswt-switchTrack::after {
        transform: translateX(16px);
        background: #fff;
      }
      .dswt-switchText {
        font-size: 13px;
        color: var(--dsw-alias-label-primary);
      }
      .dswt-configActions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 2px;
      }
      .dswt-configBtn {
        box-sizing: border-box;
        height: 32px;
        padding: 0 14px;
        cursor: pointer;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        font-size: 13px;
      }
      .dswt-configBtn:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dswt-configSaved {
        font-size: 12px;
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

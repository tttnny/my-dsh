/**
 * dsh-workspace-tree — browser half (v3.0.2)。
 *
 * 内核契约基线：DSH 0.1.7-alpha.1。
 *
 * 本插件只做一件事：在**官方工作区浏览器之上**加一个归档区。官方
 * `sidebar.workspaces` 是 single 槽且已被 ui-workspace 独占（无法追加），因此
 * 插件走官方允许的**增量入口**——与官方 `ui-plugin-manager` 同一套注册方式：
 *   - `sidebar.panellist`（list 槽）：侧栏一个「归档」图标按钮；
 *   - `main`（keyed 槽，key = "workspace-archive"）：点图标后主视图整幅归档面板。
 *
 * 官方工作区列表、会话导航、搜索、拖拽、分组、设置页全部保持官方原样——插件
 * 不再接管 `sidebar.workspaces`，也不再自带目录选择 / IDE 打开 / 工作区管理。
 *
 * 归档区保留的能力：
 *  - 按工作区分组展示（无归属的归档会话单独成「未分组」组）；
 *  - 单条恢复 / 永久删除，组级恢复全部 / 删除全部，一键恢复所有 / 一键删除所有；
 *  - 归档只读阅览：点击归档会话在主视口只读浏览历史（白名单隐藏变更类按钮，
 *    输入栏替换为只读条）；阅览中仍可随时恢复或删除；
 *  - 失效归档自动静默清理；删除墓碑自愈（Host 物理存在性为权威判据）；
 *  - 批量删除逐条 fail-loud，删不掉的留在归档区并逐条列原因。
 *
 * 归档集合的唯一事实源是官方 workspace 控制器（`ctx.workspaces.list` 的
 * `archivedSessionIds`）与官方会话列表（`ctx.sessions.list`）；插件不维护第二份状态。
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
    // 控件与图标全部走官方原语（0.1.7 命名：字形 + Regular/Medium 字重）。
    const {
      Button, Modal, StateDot, relativeTime,
      IconFolderOpenRegular, IconArchiveOutlineRegular, IconUnarchiveOutlineRegular,
      IconTrashOutlineRegular, IconRefreshOutlineRegular
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Cordis 插件名（与 patch 行 id 一致）。 */
    const name = "dsh-workspace-tree";
    /**
     * 依赖的客户端服务。uiWorkspace 只用于「打开会话」导航，且其注册时刻可能晚于
     * 本插件激活，因此**不**声明为硬依赖，改为运行时探测。
     */
    const inject = ["slots", "locale", "sessions", "workspaces"];

    /** 主面板 key（必须与 panellist 的 id 相同——侧栏按 id 选主面板）。 */
    const PANEL_ID = "workspace-archive";
    /** 文案命名空间。 */
    const NS = "dsh-workspace-tree";
    /** 本插件 Host 路由前缀（与宿主半边 PREFIX 一致）。 */
    const API = "/api/dsh-workspace-tree";
    /** 删除墓碑集合（localStorage 持久化，跨刷新 / 跨标签页生效）。 */
    const LS_DELETED = "dswt-workspace-tree.deleted";

    // ══════════════ 文案字典 ══════════════
    const zh = {
      panel: "归档",
      title: "归档区",
      subtitle: "归档的会话在此按工作区分组展示；进入归档区的会话可随时恢复或永久删除。",
      count: "共 {n} 条有效归档",
      empty: "归档区为空 — 归档的会话会在此分组显示（无归属者归入「未分组」）",
      ungrouped: "未分组",
      groupCount: "{title} · {n} 条",
      restore: "恢复",
      restoreAll: "一键恢复所有",
      delete: "永久删除",
      deleteAll: "一键删除所有",
      restoreGroup: "恢复该工作区全部",
      restoreUngrouped: "恢复未分组全部",
      deleteGroup: "永久删除该工作区全部",
      deleteUngrouped: "永久删除未分组全部",
      confirmRestoreTitle: "恢复会话",
      confirmRestoreDesc: "把「{title}」移出归档区，恢复为普通会话？",
      confirmDeleteTitle: "永久删除归档会话",
      confirmDeleteDesc: "将永久删除「{title}」及其派生的全部 Subagent 数据与投影缓存，无法撤销。仅当物理删除全部成功才从归档集合剔除；失败会留在归档区并说明原因。",
      confirmRestoreAllTitle: "恢复所有归档会话",
      confirmRestoreAllDesc: "把归档区里的全部会话恢复为普通会话？",
      confirmDeleteAllTitle: "删除所有归档会话",
      confirmDeleteAllDesc: "将永久删除归档区里的全部会话及其派生的 Subagent 数据，无法撤销。能删的删掉，删不掉的留在归档区并逐条说明原因。",
      confirmRestoreGroupTitle: "恢复该分组全部",
      confirmRestoreGroupDesc: "把「{title}」分组的全部归档会话恢复为普通会话？",
      confirmDeleteGroupTitle: "删除该分组全部",
      confirmDeleteGroupDesc: "将永久删除「{title}」分组里的全部归档会话及其派生数据，无法撤销。",
      cancel: "取消",
      confirm: "确认",
      close: "关闭",
      know: "知道了",
      notice: "提示",
      deleteFailed: "部分会话删除失败（已保留在归档区，可重试）：{detail}",
      restoreFailed: "恢复失败：{detail}",
      readonlyBanner: "当前会话已归档（只读模式）",
      restoreBusy: "恢复中…",
      restoreSession: "恢复会话",
      clearTombstones: "清空删除记录",
      clearTombstonesTitle: "清空删除记录",
      clearTombstonesDesc: "删除记录保存在浏览器本地，用来隐藏你已永久删除的会话，避免它们在官方列表收敛前又冒出来。每条记录在打开归档面板时都会向 Host 核对：会话日志确已删除则保留，日志仍在（误写）则自动作废。清空会立即取消全部隐藏，这些会话若仍被官方列表返回就会重新出现——仅在确认记录有误时使用。",
      tombstones: "{n} 条删除记录",
      retainedNotice: "会话日志已删除。其中 {n} 条仍被当前 DSH 进程持有（通常是你正打开的那条会话），因此它们继续留在归档区而不掉进「未分组」；重启 DSH 后自动清理。"
    };
    const en = {
      panel: "Archive",
      title: "Archive",
      subtitle: "Archived Sessions grouped by Workspace. Any archived Session can be restored or permanently deleted.",
      count: "{n} archived",
      empty: "No archived Sessions — archived ones appear here grouped by Workspace (unowned ones under \"Ungrouped\")",
      ungrouped: "Ungrouped",
      groupCount: "{title} · {n}",
      restore: "Restore",
      restoreAll: "Restore all",
      delete: "Delete permanently",
      deleteAll: "Delete all",
      restoreGroup: "Restore this Workspace",
      restoreUngrouped: "Restore Ungrouped",
      deleteGroup: "Delete this Workspace",
      deleteUngrouped: "Delete Ungrouped",
      confirmRestoreTitle: "Restore Session",
      confirmRestoreDesc: "Move \"{title}\" out of the archive and make it a normal Session?",
      confirmDeleteTitle: "Permanently delete archived Session",
      confirmDeleteDesc: "Permanently deletes \"{title}\", every derived subagent, and its projection cache. This cannot be undone. The archive entry is removed only when every physical delete succeeds; failures stay in the archive with a reason.",
      confirmRestoreAllTitle: "Restore all archived Sessions",
      confirmRestoreAllDesc: "Restore every archived Session to a normal Session?",
      confirmDeleteAllTitle: "Delete all archived Sessions",
      confirmDeleteAllDesc: "Permanently deletes every archived Session and their derived subagent data. This cannot be undone. What cannot be deleted stays in the archive with a per-item reason.",
      confirmRestoreGroupTitle: "Restore this group",
      confirmRestoreGroupDesc: "Restore every archived Session under \"{title}\"?",
      confirmDeleteGroupTitle: "Delete this group",
      confirmDeleteGroupDesc: "Permanently deletes every archived Session under \"{title}\" and their derived data. This cannot be undone.",
      cancel: "Cancel",
      confirm: "Confirm",
      close: "Close",
      know: "Got it",
      notice: "Notice",
      deleteFailed: "Some Sessions could not be deleted (kept in the archive; retryable): {detail}",
      restoreFailed: "Restore failed: {detail}",
      readonlyBanner: "This Session is archived (read-only)",
      restoreBusy: "Restoring…",
      restoreSession: "Restore Session",
      clearTombstones: "Clear delete records",
      clearTombstonesTitle: "Clear delete records",
      clearTombstonesDesc: "Delete records are stored in this browser and hide the Sessions you permanently deleted, so they cannot pop back before the official list converges. Each record is re-checked against the Host when the Archive panel opens: if the Session log is really gone the record stays, if the log still exists the record is discarded. Clearing removes every record at once, so those Sessions reappear if the official list still returns them — use only when the records are wrong.",
      tombstones: "{n} delete records",
      retainedNotice: "Session logs deleted. {n} of them are still held by this DSH process (usually the Session you have open), so they STAY in the Archive instead of falling into \"Ungrouped\"; they are cleaned up automatically after a DSH restart."
    };
    /** 模板占位符替换（{name} → 值）。 */
    function fill(template, vars) {
      let out = template;
      for (const k of Object.keys(vars || {})) out = out.split("{" + k + "}").join(String(vars[k]));
      return out;
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

    // ══════════════ 删除墓碑（浏览器本地，跨刷新生效） ══════════════
    function loadSet(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
      } catch { return new Set(); }
    }
    function saveSet(key, set) {
      try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
    }

    // ══════════════ 会话可见性判据（与官方同源） ══════════════
    /**
     * subagent 子会话判定：唯一判据是 origin === "subagent"——**不能看 parentId**，
     * 宿主 fork 出来的普通会话同样带 parentId，用 parentId 会把 fork 会话误隐藏。
     */
    function isSubagentRow(row) {
      return !!row && row.origin === "subagent";
    }
    /** 归档行是否有效可见：已归档 + 非硬删墓碑 + 非空白草稿 + 非 subagent。 */
    function archivedSessionVisible(session, archived, hardDeleted) {
      if (!session) return false;
      if (isSubagentRow(session)) return false;
      if (session.blank) return false;
      const sid = String(session.id || "");
      if (!archived || !archived.has(sid)) return false;
      if (hardDeleted && hardDeleted.has(sid)) return false;
      return true;
    }

    // ══════════════ 标题滚动 ══════════════
    /** 悬停截断标题时滚到末尾露出尾部；离开归位。 */
    function revealClippedTitle(el, on) {
      if (!el) return;
      try { el.scrollLeft = on ? el.scrollWidth : 0; } catch { /* ignore */ }
    }

    /** 行尾相对时间：分档走官方 relativeTime，文案走本插件字典。 */
    function timeLabelT(t, updatedAt, now) {
      if (!updatedAt) return "";
      const bucket = relativeTime(updatedAt, now);
      const key = { now: "timeNow", minutes: "timeMinutes", hours: "timeHours", days: "timeDays", months: "timeMonths", years: "timeYears" }[bucket.unit];
      if (!key) return "";
      const text = t(key);
      return bucket.unit === "now" ? text : text.split("{n}").join(String(bucket.n));
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
          return h("div", { className: "dswt-error" }, "Archive panel render error: " + message);
        }
        return this.props.children;
      }
    }

    // ══════════════ 归档会话只读阅览底部条 ══════════════
    /**
     * 归档会话被打开时，官方 archived 闸门会拒绝其编辑；本插件把输入栏替换成只读
     * 状态条，并借 body 上的 data 属性经 CSS 白名单隐藏变更类按钮（分支 / 重试 /
     * 反馈 / 审批），保留纯浏览与复制。
     */
    function ReadonlyArchivedComposerBanner(props) {
      const { sessionId, t, onRestore } = props;
      const [busy, setBusy] = useState(false);
      const sid = sessionId;
      // 本组件只在「当前会话已归档」时被 chain 选中挂载，因此挂载即代表只读态：
      // body 属性驱动 CSS 白名单隐藏变更类按钮（分支 / 重试 / 反馈 / 审批），
      // 卸载即恢复，不残留全局状态。
      useEffect(() => {
        document.body.setAttribute("data-dswt-archived-session", "true");
        return () => { document.body.removeAttribute("data-dswt-archived-session"); };
      }, []);
      const restore = useCallback(async () => {
        if (busy || !sid) return;
        setBusy(true);
        try {
          if (onRestore) await onRestore(String(sid));
        } catch (e) {
          console.error("[workspace-tree] 恢复归档会话失败:", e);
        } finally {
          setBusy(false);
        }
      }, [busy, sid, onRestore]);
      return h("div", { className: "dswt-archivedComposerRoot" }, [
        h("div", { key: "banner", className: "dswt-archivedComposerBanner" }, [
          h("span", { key: "icon", className: "dswt-archivedComposerIcon", "aria-hidden": "true" }, h(IconArchiveOutlineRegular, { size: 16 })),
          h("span", { key: "text", className: "dswt-archivedComposerText" }, t("readonlyBanner")),
          h(Button, {
            key: "btn",
            type: "button",
            variant: "primary",
            size: "sm",
            disabled: busy,
            onClick: restore
          }, busy ? t("restoreBusy") : t("restoreSession"))
        ])
      ]);
    }

    // ══════════════ 确认 / 提示弹窗 ══════════════
    function ConfirmModal({ open, title, desc, confirmText, cancelText, danger, busy, onCancel, onConfirm }) {
      return h(Modal, {
        open: !!open,
        onClose: () => { if (!busy) onCancel(); },
        title: title,
        closeLabel: cancelText,
        description: desc,
        footer: [
          h(Button, { key: "c", variant: "outline", size: "sm", disabled: !!busy, onClick: onCancel }, cancelText),
          h(Button, {
            key: "o",
            variant: danger ? "outline" : "primary",
            size: "sm",
            className: danger ? "dswt-dangerBtn" : undefined,
            disabled: !!busy,
            onClick: onConfirm
          }, confirmText)
        ]
      });
    }
    function AlertModal({ open, title, desc, onConfirm, closeText }) {
      return h(Modal, {
        open: !!open,
        onClose: onConfirm,
        title: title,
        closeLabel: closeText,
        description: desc,
        footer: h(Button, { variant: "primary", size: "sm", onClick: onConfirm }, closeText)
      });
    }

    // ══════════════ 归档行 ══════════════
    function ArchiveSessionRow(props) {
      const { sid, row, busy, t, currentSid, onOpen, onRestore, onDelete } = props;
      const titleRef = useRef(null);
      if (!row) return null;
      const selected = currentSid !== undefined && currentSid !== null && String(currentSid) === String(sid);
      const title = row.displayTitle || String(sid);
      return h("div", {
        className: "dswt-session dswt-archivedRow" + (selected ? " dswt-selected" : ""),
        role: "treeitem",
        "aria-selected": selected,
        title: title,
        onClick: () => { if (!busy && onOpen) onOpen(sid); },
        onPointerEnter: () => revealClippedTitle(titleRef.current, true),
        onPointerLeave: () => revealClippedTitle(titleRef.current, false)
      }, [
        h("span", { key: "st", className: "dswt-slot" }, h(StateDot, { state: "idle" })),
        h("span", { key: "ti", ref: titleRef, className: "dswt-title" }, title),
        h("span", { key: "tm", className: "dswt-time" }, timeLabelT(t, row.updatedAt, Date.now())),
        h("span", { key: "ac", className: "dswt-rowActions", onClick: (e) => e.stopPropagation() }, [
          h("button", {
            key: "rs", type: "button", className: "dswt-iconButton",
            title: t("restore"), "aria-label": t("restore"), disabled: !!busy,
            onClick: () => { if (!busy) onRestore(sid); }
          }, h(IconUnarchiveOutlineRegular, { size: 16 })),
          h("button", {
            key: "del", type: "button", className: "dswt-iconButton dswt-danger",
            title: t("delete"), "aria-label": t("delete"), disabled: !!busy,
            onClick: () => { if (!busy) onDelete(sid); }
          }, h(IconTrashOutlineRegular, { size: 16 }))
        ])
      ]);
    }

    // ══════════════ 归档面板（main keyed 槽） ══════════════
    /**
     * 归档区主面板。数据全部取自官方服务座位：
     *  - `useWorkspaces`：官方 workspace 控制器快照（items / archivedSessionIds）；
     *  - `useSessions`：官方会话列表（ids / byId / phase）。
     * 两者都是官方 `GlobalStandardProps` 提供的座位，插件不新建 store。
     * 全部业务动作经官方控制器（`props.nav`）或本插件宿主路由完成。
     */
    function ArchivePanel(props) {
      const { t, useWorkspaces, useSessions, nav } = props;
      const ws = useWorkspaces((s) => s);
      const sessions = useSessions((s) => s);

      const [hardDeleted, setHardDeleted] = useState(() => loadSet(LS_DELETED));
      const [busy, setBusy] = useState(false);
      const [confirm, setConfirm] = useState(null);
      const [notice, setNotice] = useState(null);
      const [tombstoneChecked, setTombstoneChecked] = useState(false);

      /** 归档集合（官方事实源），统一成 string 集合便于比对。 */
      const archivedKey = ((ws && ws.archivedSessionIds) || []).map(String).join("\u0000");
      const archived = useMemo(() => {
        const set = new Set();
        for (const id of (ws && ws.archivedSessionIds) || []) set.add(String(id));
        return set;
      }, [archivedKey]);

      /**
       * 墓碑自愈：对本地墓碑里「官方列表仍返回」的会话，向 Host 查询会话目录是否
       * 仍物理存在。永久删除成功必然使目录消失 ⇒「目录仍在」即会话存活、墓碑系误写，
       * 作废并恢复显示；「目录已没了」才是收敛竞态，继续隐藏直至列表收敛。
       */
      useEffect(() => {
        if (tombstoneChecked) return;
        const ids = [...hardDeleted];
        if (ids.length === 0) { setTombstoneChecked(true); return; }
        let cancelled = false;
        (async () => {
          try {
            const r = await apiPost("/archive/tombstoneCheck", { ids });
            if (cancelled || !r || r.ok !== true || !Array.isArray(r.alive)) return;
            const alive = new Set(r.alive.map(String));
            const next = new Set([...hardDeleted].filter((id) => !alive.has(String(id))));
            if (next.size !== hardDeleted.size) {
              setHardDeleted(next);
              saveSet(LS_DELETED, next);
            }
          } catch { /* 查询不可用时维持现状（fail-open） */ }
          finally { if (!cancelled) setTombstoneChecked(true); }
        })();
        return () => { cancelled = true; };
      }, [hardDeleted, tombstoneChecked]);

      /**
       * 按工作区分组：工作区名下的归档会话 + 不属于任何工作区的「未分组」归档。
       * 归档集合是注册表全局的（归档从不改工作区 sessionIds），故未分组组必然存在。
       */
      const groups = useMemo(() => {
        const byId = (sessions && sessions.byId) || {};
        const out = [];
        const accounted = new Set();
        for (const w of (ws && ws.items) || []) {
          const sids = (w.sessionIds || []).map(String).filter((sid) => {
            accounted.add(sid);
            return archivedSessionVisible(byId[sid], archived, hardDeleted);
          });
          if (sids.length > 0) {
            out.push({
              key: "ws:" + String(w.workspaceId),
              workspaceId: w.workspaceId,
              title: w.title || String(w.path || "").split("/").filter(Boolean).pop() || String(w.path || ""),
              sids
            });
          }
        }
        const ungroupedSids = (sessions && Array.isArray(sessions.ids) ? sessions.ids : [])
          .map(String)
          .filter((sid) => !accounted.has(sid) && archivedSessionVisible(byId[sid], archived, hardDeleted));
        if (ungroupedSids.length > 0) out.push({ key: "ungrouped", workspaceId: null, title: t("ungrouped"), sids: ungroupedSids });
        return out;
      }, [ws, sessions, archived, hardDeleted, t]);

      const total = useMemo(() => groups.reduce((acc, g) => acc + g.sids.length, 0), [groups]);

      /**
       * 失效归档静默清理：官方列表已不再返回的 ID（日志已被物理删除的历史残留）。
       * 清理口径完全交给 host（以 sessionController.list() 为权威存活集）——本插件
       * 只负责触发，绝不用本地列表自行判定。本地 `byId` 缺项可能只是分页/尚未装载，
       * 据此下判断会把仍存活的归档会话误清掉。
       */
      const prunedRef = useRef(false);
      useEffect(() => {
        if (prunedRef.current) return;
        if (!sessions || sessions.phase !== "ready") return;
        const byId = sessions.byId || {};
        const missing = [...archived].filter((sid) => byId[sid] === undefined);
        prunedRef.current = true;
        if (missing.length === 0) return;
        apiPost("/archive/pruneStale", { aliveIds: sessions.ids.map(String) }).catch(() => { /* ignore */ });
      }, [sessions && sessions.phase, sessions && sessions.ids, archived]);

      const run = useCallback(async (fn) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
      }, []);

      const markDeleted = useCallback((ids) => {
        if (!ids || ids.length === 0) return;
        const next = new Set(hardDeleted);
        for (const id of ids) next.add(String(id));
        setHardDeleted(next);
        saveSet(LS_DELETED, next);
      }, [hardDeleted]);

      const clearDeleted = useCallback((ids) => {
        if (!ids || ids.length === 0) return;
        const next = new Set(hardDeleted);
        for (const id of ids) next.delete(String(id));
        setHardDeleted(next);
        saveSet(LS_DELETED, next);
      }, [hardDeleted]);

      /** 手动兜底：清空本地删除记录（墓碑）。 */
      const clearTombstones = useCallback(() => {
        setConfirm(null);
        const empty = new Set();
        setHardDeleted(empty);
        saveSet(LS_DELETED, empty);
      }, []);

      /** 单条恢复。 */
      const doRestoreOne = useCallback((sid) => {
        setConfirm(null);
        return run(async () => {
          try {
            await nav.unarchive(sid);
            clearDeleted([sid]);
          } catch (e) {
            setNotice({ desc: fill(t("restoreFailed"), { detail: (e && e.message) || String(e) }) });
          }
        });
      }, [run, nav, clearDeleted, t]);

      /** 组级恢复（workspaceId === undefined ⇒ 全部）。 */
      const doRestoreGroup = useCallback((workspaceId) => {
        setConfirm(null);
        return run(async () => {
          try {
            const body = workspaceId === undefined ? { workspaceId: undefined } : { workspaceId: workspaceId === null ? null : String(workspaceId) };
            const r = await apiPost("/archive/unarchiveAll", body);
            if (!r || r.ok !== true) throw new Error((r && r.error) || "restore failed");
            clearDeleted(Array.isArray(r.restored) ? r.restored : []);
            nav.refresh();
          } catch (e) {
            setNotice({ desc: fill(t("restoreFailed"), { detail: (e && e.message) || String(e) }) });
          }
        });
      }, [run, nav, clearDeleted, t]);

      /**
       * 组级删除（workspaceId === undefined ⇒ 全部）：逐条 fail-loud，
       * 失败项留在归档区并列出原因。
       */
      const doDeleteGroup = useCallback((workspaceId) => {
        setConfirm(null);
        return run(async () => {
          try {
            const body = workspaceId === undefined
              ? { all: true }
              : { workspaceId: workspaceId === null ? null : String(workspaceId) };
            const r = await apiPost("/archive/deleteAll", body);
            if (!r || r.ok !== true) throw new Error((r && r.error) || "delete failed");
            const deletedAll = Array.isArray(r.deleted) ? r.deleted : [];
            const retainedAll = Array.isArray(r.retained) ? r.retained : [];
            // 仍被宿主持有的会话只是「日志已删」而非「已消失」，必须继续可见，
            // 否则用户会看到条目莫名消失（其去向只剩重启后的自动清理）。
            markDeleted(deletedAll.filter((id) => !retainedAll.includes(id)));
            if (retainedAll.length > 0) setNotice({ desc: fill(t("retainedNotice"), { n: retainedAll.length }) });
            const failed = Array.isArray(r.failed) ? r.failed : [];
            if (failed.length > 0) {
              setNotice({
                desc: fill(t("deleteFailed"), {
                  detail: failed.slice(0, 3).map((f) => String((f && f.sessionId) || "") + ": " + String((f && f.error) || "")).join("; ")
                    + (failed.length > 3 ? "; +" + (failed.length - 3) : "")
                })
              });
            }
            nav.refresh();
          } catch (e) {
            setNotice({ desc: (e && e.message) || String(e) });
          }
        });
      }, [run, nav, markDeleted, t]);

      /** 单条永久删除（零守卫：进了归档区就一定可删）。 */
      const doDeleteOne = useCallback((sid) => {
        setConfirm(null);
        return run(async () => {
          try {
            const r = await apiPost("/archive/delete", { sessionId: String(sid) });
            if (!r || r.ok !== true) throw new Error((r && r.error) || "delete failed");
            const retainedOne = Array.isArray(r.retained) ? r.retained : [];
            const deletedOne = (Array.isArray(r.deleted) && r.deleted.length > 0) ? r.deleted : [sid];
            // 保留项不写墓碑：它仍被宿主持有，条目继续可见，等重启后自动清理。
            const gone = deletedOne.filter((id) => !retainedOne.includes(String(id)));
            if (gone.length > 0) markDeleted(gone);
            if (retainedOne.length > 0) {
              setNotice({ desc: fill(t("retainedNotice"), { n: retainedOne.length }) });
            }
            nav.refresh();
          } catch (e) {
            setNotice({ desc: (e && e.message) || String(e) });
          }
        });
      }, [run, nav, markDeleted, t]);

      const onOpen = useCallback((sid) => {
        if (nav && typeof nav.open === "function") nav.open(sid);
      }, [nav]);

      const ready = !!(ws && ws.phase === "ready" && sessions && sessions.phase === "ready");
      const hasAny = total > 0;

      return h("div", { className: "dswt-panelRoot" }, [
        h("header", { key: "hd", className: "dswt-panelHeader" }, [
          h("div", { key: "tt", className: "dswt-panelTitles" }, [
            h("h1", { key: "h", className: "dswt-panelTitle" }, t("title")),
            h("p", { key: "s", className: "dswt-panelSubtitle" }, t("subtitle"))
          ]),
          hasAny ? h("div", { key: "ac", className: "dswt-panelActions" }, [
            h(Button, {
              key: "ra", type: "button", variant: "outline", size: "sm", disabled: !!busy,
              icon: h(IconRefreshOutlineRegular, { size: 16 }),
              onClick: () => setConfirm({ kind: "restoreAll" })
            }, t("restoreAll")),
            h(Button, {
              key: "da", type: "button", variant: "outline", size: "sm", disabled: !!busy,
              className: "dswt-dangerBtn",
              icon: h(IconTrashOutlineRegular, { size: 16 }),
              onClick: () => setConfirm({ kind: "deleteAll" })
            }, t("deleteAll"))
          ]) : null
        ]),
        ready ? h("div", { key: "meta", className: "dswt-panelMeta" }, [
          hasAny ? h("span", { key: "count" }, fill(t("count"), { n: total })) : null,
          hardDeleted.size > 0 ? h("span", { key: "sep", className: "dswt-metaSep" }, "\u00b7") : null,
          hardDeleted.size > 0 ? h("span", { key: "tomb" }, fill(t("tombstones"), { n: hardDeleted.size })) : null,
          hardDeleted.size > 0 ? h("button", {
            key: "clear", type: "button", className: "dswt-metaButton", disabled: !!busy,
            onClick: () => setConfirm({ kind: "clearTombstones" })
          }, t("clearTombstones")) : null
        ]) : null,
        h("div", { key: "bd", className: "dswt-panelBody" }, [
          !ready ? h("div", { key: "loading", className: "dswt-empty" }, "…")
            : (!hasAny ? h("div", { key: "empty", className: "dswt-empty" }, t("empty")) : null),
          groups.map((group) => h("section", { key: group.key, className: "dswt-groupSection" }, [
            h("div", { key: "ghd", className: "dswt-groupHeader" }, [
              h("span", { key: "ic", className: "dswt-slot" }, h(IconFolderOpenRegular, { size: 16, className: "dswt-folderSvg" })),
              h("span", { key: "tt", className: "dswt-groupTitle" }, fill(t("groupCount"), { title: group.title, n: group.sids.length })),
              h("span", { key: "ac", className: "dswt-rowActions dswt-groupActions" }, [
                h("button", {
                  key: "rs", type: "button", className: "dswt-iconButton",
                  title: group.workspaceId === null ? t("restoreUngrouped") : t("restoreGroup"),
                  "aria-label": group.workspaceId === null ? t("restoreUngrouped") : t("restoreGroup"),
                  disabled: !!busy,
                  onClick: () => setConfirm({ kind: "restoreGroup", workspaceId: group.workspaceId, title: group.title })
                }, h(IconUnarchiveOutlineRegular, { size: 16 })),
                h("button", {
                  key: "dl", type: "button", className: "dswt-iconButton dswt-danger",
                  title: group.workspaceId === null ? t("deleteUngrouped") : t("deleteGroup"),
                  "aria-label": group.workspaceId === null ? t("deleteUngrouped") : t("deleteGroup"),
                  disabled: !!busy,
                  onClick: () => setConfirm({ kind: "deleteGroup", workspaceId: group.workspaceId, title: group.title })
                }, h(IconTrashOutlineRegular, { size: 16 }))
              ])
            ]),
            h("div", { key: "gbd", className: "dswt-groupBody" }, group.sids.map((sid) => {
              const row = (sessions.byId || {})[sid];
              const title = (row && row.displayTitle) || String(sid);
              return h(ArchiveSessionRow, {
                key: sid,
                sid,
                row,
                busy,
                t,
                onOpen,
                onRestore: (id) => setConfirm({ kind: "single", action: "restore", sid: id, title: title }),
                onDelete: (id) => setConfirm({ kind: "single", action: "delete", sid: id, title: title })
              });
            }))
          ]))
        ]),
        h(ConfirmModal, {
          open: !!confirm,
          title: confirmTitle(confirm, t),
          desc: confirmDesc(confirm, t),
          confirmText: confirmConfirmText(confirm, t),
          cancelText: t("cancel"),
          danger: isDestructive(confirm),
          busy,
          onCancel: () => setConfirm(null),
          onConfirm: () => {
            if (!confirm) return;
            if (confirm.kind === "clearTombstones") return clearTombstones();
            if (confirm.kind === "restoreAll") return doRestoreGroup(undefined);
            if (confirm.kind === "deleteAll") return doDeleteGroup(undefined);
            if (confirm.kind === "restoreGroup") return doRestoreGroup(confirm.workspaceId);
            if (confirm.kind === "deleteGroup") return doDeleteGroup(confirm.workspaceId);
            if (confirm.kind === "single") {
              return confirm.action === "restore" ? doRestoreOne(confirm.sid) : doDeleteOne(confirm.sid);
            }
          }
        }),
        h(AlertModal, {
          open: !!notice,
          title: t("notice"),
          desc: (notice && notice.desc) || "",
          closeText: t("know"),
          onConfirm: () => setNotice(null)
        })
      ]);
    }

    /** 确认弹窗标题。 */
    function confirmTitle(c, t) {
      if (!c) return "";
      if (c.kind === "clearTombstones") return t("clearTombstonesTitle");
      if (c.kind === "restoreAll") return t("confirmRestoreAllTitle");
      if (c.kind === "deleteAll") return t("confirmDeleteAllTitle");
      if (c.kind === "restoreGroup") return t("confirmRestoreGroupTitle");
      if (c.kind === "deleteGroup") return t("confirmDeleteGroupTitle");
      if (c.kind === "single") return c.action === "delete" ? t("confirmDeleteTitle") : t("confirmRestoreTitle");
      return "";
    }
    /** 确认弹窗描述。 */
    function confirmDesc(c, t) {
      if (!c) return "";
      const vars = { title: c.title || "" };
      if (c.kind === "clearTombstones") return t("clearTombstonesDesc");
      if (c.kind === "restoreAll") return t("confirmRestoreAllDesc");
      if (c.kind === "deleteAll") return t("confirmDeleteAllDesc");
      if (c.kind === "restoreGroup") return fill(t("confirmRestoreGroupDesc"), vars);
      if (c.kind === "deleteGroup") return fill(t("confirmDeleteGroupDesc"), vars);
      if (c.kind === "single") return fill(c.action === "delete" ? t("confirmDeleteDesc") : t("confirmRestoreDesc"), vars);
      return "";
    }
    /** 该确认是否是破坏性操作（决定按钮的危险配色与文案），按显式动作判定而非 kind 前缀。 */
    function isDestructive(c) {
      if (!c) return false;
      if (c.action !== undefined) return c.action === "delete";
      return c.kind === "deleteAll" || c.kind === "deleteGroup";
    }
    /** 确认按钮文案。 */
    function confirmConfirmText(c, t) {
      if (!c) return t("confirm");
      if (isDestructive(c)) return t("delete");
      if (c.kind === "restoreAll" || c.kind === "restoreGroup") return t("restore");
      return t("confirm");
    }

    // ══════════════ 侧栏图标（panellist 槽） ══════════════
    function ArchivePanelIcon(props) {
      const size = (props && props.size) || 16;
      return h(IconArchiveOutlineRegular, { size });
    }

    // ══════════════ 注册 ══════════════
    function apply(ctx) {
      // 字典早注册：面板与侧栏标签都要取文案，且早于任何卡片注册。
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-workspace-tree: dictionaries");
      const t = ctx.locale.bind(NS);

      // 样式：全部走官方 --dsw-* 设计变量。
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-workspace-tree", "true");
      document.head.appendChild(styleEl);
      styleEl.textContent = CSS;
      ctx.effect(() => () => styleEl.remove(), "dsh-workspace-tree: styles");

      /** uiWorkspace 是官方导航服务，注册时刻可能晚于本插件，运行时探测。 */
      function resolveUiWorkspace() {
        try {
          const svc = ctx.get("uiWorkspace");
          if (svc) return svc;
        } catch { /* ignore */ }
        try { return ctx.uiWorkspace || null; } catch { return null; }
      }

      /**
       * 归档只读阅览：官方 uiWorkspace 的 `clearArchivedCurrent()` 会在当前会话被
       * 归档时把它清出主视图。归档区要支持点击直接阅览，故把该清理 patch 成无操作。
       * 服务未就绪时监听 cordis 的 `internal/service`，出现后补 patch。
       */
      const patchArchivedView = () => {
        const svc = resolveUiWorkspace();
        if (svc && typeof svc.clearArchivedCurrent === "function") {
          svc.clearArchivedCurrent = function () { return false; };
          return true;
        }
        return false;
      };
      if (!patchArchivedView()) {
        ctx.effect(() => ctx.on("internal/service", (svcName) => {
          if (svcName === "uiWorkspace") patchArchivedView();
        }));
      }

      /** 归档会话的恢复入口（只读条按钮用）。 */
      const restoreArchived = async (sessionId) => {
        if (ctx.workspaces && typeof ctx.workspaces.unarchiveSession === "function") {
          await ctx.workspaces.unarchiveSession(sessionId);
        } else {
          const uiWs = resolveUiWorkspace();
          if (uiWs && typeof uiWs.unarchiveSession === "function") await uiWs.unarchiveSession(sessionId);
          else throw new Error("unarchive unavailable");
        }
        try { if (ctx.sessions && typeof ctx.sessions.refresh === "function") ctx.sessions.refresh(); } catch { /* ignore */ }
      };

      /**
       * 归档会话只读接管：`conversation.composer` 是 chain 槽，select 纯函数按
       * 「当前会话是否在官方归档集合里」决定是否接管输入栏。选中后官方输入框被替换为
       * 只读状态条，body 属性同时驱动变更类按钮的 CSS 白名单隔离。
       */
      ctx.slots.inject("conversation.composer", () => ctx.slots.register({
        name: "conversation.composer",
        priority: -100,
        select: (owner) => {
          const cur = (owner && owner.sessionId) || null;
          if (!cur) return null;
          let archivedIds = [];
          try {
            const snap = ctx.workspaces && ctx.workspaces.list && ctx.workspaces.list.getSnapshot
              ? ctx.workspaces.list.getSnapshot() : null;
            archivedIds = (snap && snap.archivedSessionIds) || [];
          } catch { archivedIds = []; }
          if (archivedIds.map(String).includes(String(cur))) return { sessionId: cur };
          return null;
        }
      }, (props) => h(ReadonlyArchivedComposerBanner, {
        sessionId: props.sessionId,
        t: t,
        onRestore: restoreArchived
      })));

      // 侧栏「归档」图标：官方 panellist 是 list 槽；按 id 选择同名 main 面板。
      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 10,
        label: () => t("panel"),
        locale: NS
      }, ArchivePanelIcon));

      // 主面板：keyed 槽，key 必须等于 panellist 的 id。
      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: NS,
        inject: () => ({
          nav: {
            unarchive: restoreArchived,
            refresh: () => {
              try { if (ctx.sessions && typeof ctx.sessions.refresh === "function") ctx.sessions.refresh(); } catch { /* ignore */ }
            },
            open: (sessionId) => {
              const uiWs = resolveUiWorkspace();
              if (uiWs && typeof uiWs.openSession === "function") uiWs.openSession(sessionId);
            }
          }
        })
      }, (props) => h(ErrorBoundary, null, h(ArchivePanel, props))));
    }

    // ══════════════ 样式（官方 --dsw-* 设计变量；0.5px 中性描边、圆角配 corner-shape） ══════════════
    const CSS = [
      ".dswt-panelRoot { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; min-height: 0; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); }",
      ".dswt-panelHeader { box-sizing: border-box; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }",
      ".dswt-panelTitles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }",
      ".dswt-panelTitle { margin: 0; font: var(--dsw-font-l-20); }",
      ".dswt-panelSubtitle { margin: 0; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xs-13); }",
      ".dswt-panelActions { display: flex; align-items: center; gap: 8px; flex: none; }",
      ".dswt-panelMeta { display: flex; align-items: center; gap: 6px; padding: 8px 24px 0; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxxs-11); }",
      ".dswt-metaSep { opacity: .6; }",
      ".dswt-metaButton { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-link); font: var(--dsw-font-xxxs-11); cursor: pointer; }",
      ".dswt-metaButton:hover:not(:disabled) { text-decoration: underline; }",
      ".dswt-metaButton:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary); }",
      ".dswt-metaButton:disabled { opacity: .5; cursor: not-allowed; }",
      ".dswt-panelBody { flex: 1; min-height: 0; overflow: auto; padding: 12px 16px 24px; }",
      ".dswt-groupSection { margin-bottom: 12px; }",
      ".dswt-groupHeader { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 8px; border-radius: 8px; color: var(--dsw-alias-label-secondary); }",
      ".dswt-groupHeader:hover { background: var(--dsw-alias-interactive-bg-hover); }",
      ".dswt-groupTitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--dsw-font-xs-strong-13); }",
      ".dswt-groupBody { display: flex; flex-direction: column; padding-inline-start: 16px; }",
      ".dswt-groupActions { display: inline-flex; }",
      ".dswt-session { box-sizing: border-box; display: flex; align-items: center; height: 32px; padding: 0 8px; border-radius: 8px; cursor: pointer; user-select: none; gap: 0; }",
      ".dswt-session:hover, .dswt-session.dswt-selected { background: var(--dsw-alias-interactive-bg-hover); }",
      ".dswt-slot { width: 16px; height: 20px; display: inline-flex; align-items: center; justify-content: center; flex: none; color: var(--dsw-alias-label-tertiary); }",
      ".dswt-folderSvg { color: inherit; }",
      ".dswt-title { flex: 1; min-width: 0; margin: 0 6px 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--dsw-font-s-14); }",
      ".dswt-time { flex: none; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxxs-11); }",
      ".dswt-rowActions { display: none; align-items: center; gap: 2px; flex: none; }",
      ".dswt-session:hover .dswt-rowActions, .dswt-session.dswt-selected .dswt-rowActions, .dswt-groupHeader:hover .dswt-groupActions { display: inline-flex; }",
      ".dswt-iconButton { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; transition: background var(--ds-transition-duration-fast) var(--ds-ease-in-out); }",
      ".dswt-iconButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }",
      ".dswt-iconButton:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary); }",
      ".dswt-iconButton:disabled { opacity: .5; cursor: not-allowed; }",
      ".dswt-iconButton.dswt-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger); color: var(--dsw-alias-state-error-primary); }",
      ".dswt-dangerBtn { color: var(--dsw-alias-state-error-primary); }",
      ".dswt-empty { padding: 40px 16px; text-align: center; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xs-13); }",
      ".dswt-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xs-13); }",
      ".dswt-archivedComposerRoot { box-sizing: border-box; width: 100%; max-width: var(--dsh-composer-card-max-width, 780px); margin: 0 auto; padding: 8px 16px 16px; display: flex; justify-content: center; align-items: center; }",
      ".dswt-archivedComposerBanner { box-sizing: border-box; display: inline-flex; align-items: center; gap: 12px; background: var(--dsw-alias-bg-layer-1); border: 0; border-radius: 20px; padding: 8px 16px; --dsw-elevation-stroke-color: var(--dsw-alias-border-l2); box-shadow: var(--dsw-elevation-soft); }",
      ".dswt-archivedComposerIcon { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); }",
      ".dswt-archivedComposerText { color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xs-13); }",
      "body[data-dswt-archived-session=\"true\"] [data-slot=\"conversation.chat.assistant-actions\"],",
      "body[data-dswt-archived-session=\"true\"] button[data-unavailable],",
      "body[data-dswt-archived-session=\"true\"] [class*=\"retryRow\"],",
      "body[data-dswt-archived-session=\"true\"] [class*=\"RetryRow\"],",
      "body[data-dswt-archived-session=\"true\"] [class*=\"ApprovalPanel_actionRow\"],",
      "body[data-dswt-archived-session=\"true\"] [data-approval-key] button { display: none !important; }",
      "@media (prefers-reduced-motion: reduce) { .dswt-iconButton { transition: none; } }"
    ].join("\n");

    exports.inject = inject;
    exports.apply = apply;
    exports.name = name;
    return module.exports;
  }
});

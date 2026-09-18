/**
 * src/client/kernel/router.js — 内核模块（阶段 2 内核迁移 · #96 T3）
 *
 * 契约：本文件为模块真源（ESM 导出）；scripts/build.mjs 在构建时去掉每行行首
 * export 关键字，把声明体文本拼回 src/client/index.js 的拼接标记处（apply 闭包内
 * 原位），与 ctx.js/seam 同模式，一源两物，src 零复制。
 * 接口冻结清单见 tests/verify-kernel.js（G3 · #91 拍板）。
 */
    // 打开面板的公共水合段（三种载体的面板打开后都走这一条）：#58 缓存优先，先同步补 cwd +
    //   水合 per-cwd 缓存 → 数据新鲜直接展示 / 过期秒开 + 后台静默 / 首开才 loading，不弹全屏遮罩。
    export const hydrateOpenState = function (st) {
      if (!st.cwd) {
        const sync = getCwdSync(st.sessionId)
        if (sync) { st.cwd = sync; hydrateFromCache(st) }
      } else {
        hydrateFromCache(st)
      }
      const hasCache = !!(st.snapshot || getCachedSnapshot(st.cwd))
      const isReal = st.snapMode === 'real' || !!st.snapshot || !!getCachedSnapshot(st.cwd)
      if (isReal && snapFresh(st)) {
        // v1.3.3 #5：数据新鲜直接展示，不 loading 不刷新（用户不再白等）
        // #58 若本 store 尚未设置 snapshot 但 per-cwd 缓存存在，已在 hydrateFromCache 秒开
        if (!st.snapshot && getCachedSnapshot(st.cwd)) { st.snapshot = getCachedSnapshot(st.cwd); st.snapMode = 'real' }
        emit(st)
      } else if (isReal || hasCache) {
        // v1.3.3 #5：数据过期 → 保留旧数据展示 + 后台静默刷新（非 force · 走 5s 缓存），不弹全屏遮罩
        // #58 过期也秒开 + 后台静默，不闪 loading
        if (!st.snapshot && getCachedSnapshot(st.cwd)) { st.snapshot = getCachedSnapshot(st.cwd); st.snapMode = 'real' }
        emit(st)
        loadSnapshot(st, false)
      } else {
        // 首开无数据且无 per-cwd 缓存 → 加载态 + 非 force 拉取
        st.snapMode = 'loading'
        emit(st)
        loadSnapshot(st, false)
      }
    }
    export const openPagePanel = function (st) {
      st.open = true
      hydrateOpenState(st)
    }
    // 打开面板（运行期兜底形态）：deck 自带**悬浮面板**（openPagePanel）。
    //
    // 【1.8.8】不再走 layout.openRightbar：0.1.5-rc.1 的 rightbar 是**官方右栏框架本身**
    //   （列宽 / 推挤动画 / 折叠按钮 / dockkit 标签宿主都由官方 RightbarRoot 渲染），
    //   deck 已撤回对该格子的注册（见 panelAssembly.js 的撤回说明）——再调 openRightbar
    //   只会打开官方右栏并显示官方标签页，deck 面板并不在其中，用户看到的是「点了没反应」。
    // 【1.9】官方右侧边栏改用**标签页**扩展点接入（openInRightbar），本形态只剩「两种载体都不可用」
    //   时的兜底（未装 dsh-better-sidebar 且官方 sidebarRight 服务缺席/无法注册/无会话面板挂载）。
    export const openDockPanel = function (st) {
      openPagePanel(st)
    }
    // v1.9：打开位置只有两种官方载体（cfg.openIn，见 config.js）：
    //   'sidebar'  = dsh-better-sidebar 标签页（下方 ensureSidebarTab + openInSidebar）
    //   'rightbar' = DSH 官方右侧边栏标签页（下方 ensureRightbarTab + openInRightbar）
    //   两种都不可用才落到 openDockPanel（自带悬浮面板）——它不再是用户选项。
    // v1.4.1 修复「切侧边栏没反应」：
    //   ① ensureSidebarTab 幂等注册 —— better-sidebar 的 client 可能晚于本模块加载（未声明 inject 依赖），
    //      注册必须可重试；openTab 前 ensure 一次保证已注册（否则 openTab 静默 no-op）。
    //   ② openTab 带 path seed 走「内容型打开」→ 侧边栏面板折叠时自动展开
    //      （类型型打开不展开面板，侧边栏收着就「看不见 = 没反应」）。
    export let sidebarTabDisposer = null
    export let sidebarTabRetry = null
    export const ensureSidebarTab = function () {
      if (sidebarTabDisposer) return true
      try {
        const bs = ctx.get('betterSidebar')
        if (!(bs && typeof bs.registerTab === 'function')) return false
        const DeckSidebarTab = function (props) {
          const scope = props && props.scope
          const sessionId = scope ? scope.sessionId : undefined
          return h('div', { style: { height: '100%', overflow: 'hidden' } }, h(DetailsDock, { sessionId: sessionId }))
        }
        // 第一性原理：对外品牌为 MattSkillsDeck，单一 tab id = deck:map。
        // #fix-two-sliders：旧版同时注册 deck:map + waystation:map 两份同 component、同 order、同 single 的注册器，
        //   better-sidebar 按 id 区分 tab 条目，结果 better-sidebar 显示两条 slider（用户报告「MattSkills slider 两个」）。
        //   修复：只注册 deck:map；旧会话中存的 waystation:map 打开记录由下方 normalizeLegacyTabId() 改写到 deck:map 后再 open。
        sidebarTabDisposer = bs.registerTab({
          id: 'deck:map',
          title: function () { return tr('panel.title') },
          icon: function () { return Ic({ n: 'map', size: 14 }) },
          order: 60,
          single: true,
          component: DeckSidebarTab,
        })
        // LEGACY 别名：兼容已存的 waystation:map 打开记录（不额外 disposer，单注册器以新 id 为主）
        // #298 补充：该别名仅为旧会话/旧布局的兼容打开，不应在 better-sidebar 的「+」添加菜单中单独出现；设 hidden:true 隐藏
        try { bs.registerTab({ id: 'waystation:map', title: function () { return tr('panel.title') }, icon: function () { return Ic({ n: 'map', size: 14 }) }, order: 60, single: true, hidden: true, component: DeckSidebarTab }) } catch (e) {}
  return true
      } catch (e) { return false }
    }
    export const openInSidebar = function (st) {
      const bs = ctx.get('betterSidebar')
      if (bs && typeof bs.openTab === 'function') {
        if (!ensureSidebarTab()) { openDockPanel(st); return }  // 注册失败 → 落到自带悬浮面板
        // #2-fix（2026-08-19 用户反馈「新会话点状态栏面板不开」）：必须传 scope={sessionId}。
        //   better-sidebar 的 openTab(seed, scope) 内部 `targetSessionId = scope?.sessionId ?? store.getSnapshot().sessionId`；
        //   新会话时宿主尚未 setSession(该 id) → store sessionId 为 undefined → openTab 静默 return，面板不开。
        //   显式传当前 store 的 sessionId 后走 reduceFor(scope.sessionId) 路径（按给定 id 初始化布局），面板正常展开。
        //   仅当 st.sessionId 有值时传 scope（无值时传 {sessionId:undefined} 会令 targetsInactiveSession=true 走错分支）。
        bs.openTab({ type: 'deck:map', path: 'deck:map' }, st.sessionId ? { sessionId: st.sessionId } : undefined)  // path seed → 内容型打开 → 自动展开面板
        // 打开 tab 即视为面板已开（数据新鲜直接展示；#58 缓存优先与另两个载体走同一段）
        hydrateOpenState(st)
        return
      }
      openDockPanel(st)  // better-sidebar 不可用 → 自带悬浮面板
    }
    // ---- 官方右侧边栏（DSH rightbar）标签页 ----
    // 与官方 Files / Browser / Terminal 同一条两段式公开路径（官方 ui-sidebar-documentpreview 是同类活样本）：
    //   ① ctx.sidebarRightTabs.register({ id, kind, title, guide }) —— 类型声明（谁、叫什么、指南页入口卡）
    //   ② 经 __injectOnce 包装的 slots.register —— 标签体（name = sidebar.right.pane.tab，key = 类型 id）
    // 导航一律走 ctx.sidebarRight.openTab(kind)：官方自己合成页面地址 sidebar://<kind>、去重、展开整列
    //   （内容看不见就不算打开）并记录导航 —— deck 不碰官方布局，与官方标签并列共存。
    // 两个服务都是可选能力：一律 ctx.get + 缺省分支（未声明的服务在客户端半边会抛错，见 AGENTS.md 硬约束 3）。
    export const RIGHTBAR_TAB_KIND = 'dsws-deck'
    export const RIGHTBAR_TAB_ID = '@lynn123411/dsh-mattpocock-skills-deck'
    export let rightbarTabDisposer = null
    export let rightbarTabRetry = null
    export const rightbarReady = function () {
      try {
        const tabs = ctx.get('sidebarRightTabs')
        const sr = ctx.get('sidebarRight')
        return !!(tabs && typeof tabs.register === 'function' && sr && typeof sr.openTab === 'function')
      } catch (e) { return false }
    }
    // 指南页入口卡的图标：官方 IconProps 是 { size, className }，这里转给本插件 Ic
    export const DeckGuideIcon = function (props) {
      return Ic({ n: 'map', size: (props && props.size) || 14 })
    }
    export const DeckRightbarTab = function (props) {
      // 官方 session 作用域槽位把 sessionId 作为标准 props 直接交给标签体（官方 ui-session 的 BUILTIN_SOURCE）
      const sessionId = props && props.sessionId
      return h('div', { style: { height: '100%', overflow: 'hidden' } }, h(DetailsDock, { sessionId: sessionId }))
    }
    export const ensureRightbarTab = function () {
      if (rightbarTabDisposer) return true
      try {
        const tabs = ctx.get('sidebarRightTabs')
        if (!(tabs && typeof tabs.register === 'function')) return false
        try {
          rightbarTabDisposer = tabs.register({
            id: RIGHTBAR_TAB_ID,
            kind: RIGHTBAR_TAB_KIND,
            title: function () { return tr('panel.title') },
            guide: [{
              id: 'deck',
              order: 60,
              title: function () { return tr('panel.title') },
              description: function () { return tr('cfg.openInRightbarDesc') },
              icon: DeckGuideIcon,
            }],
          })
        } catch (eReg) {
          // HMR / 重装：上一实例的类型注册若还在（disposer 未及清理），同 id 再注册会抛（官方注册表按 id 唯一）。
          //   该 kind 已有在册实现即视为已注册，继续挂标签体；否则是真失败。
          if (!(typeof tabs.get === 'function' && tabs.get(RIGHTBAR_TAB_KIND))) throw eReg
          rightbarTabDisposer = function () {}
        }
        // 标签体座位：#298 幂等闸门（与 ensureSidebarTab 同构，二次 apply / HMR 不增生）
        __injectOnce('sidebar.right.pane.tab', function () {
          return slots.register({ name: 'sidebar.right.pane.tab', key: RIGHTBAR_TAB_ID }, withCx(DeckRightbarTab))
        })
  return true
      } catch (e) { rightbarTabDisposer = null; return false }
    }
    export const openInRightbar = function (st) {
      const sr = ctx.get('sidebarRight')
      if (sr && typeof sr.openTab === 'function') {
        if (!ensureRightbarTab()) { openDockPanel(st); return }   // 类型注册失败 → 自带悬浮面板
        try {
          sr.openTab(RIGHTBAR_TAB_KIND)
        } catch (e) {
          // 官方 openTab → require()：没有会话面板挂载时抛错（宁可抛也不写没人画的面板）→ 落到自带悬浮面板
          try { log('warn', 'host.call.fail', { method: 'sidebarRight.openTab', kind: 'rightbar', errorHash: dswsLogHash(dswsLogTrunc(String((e && e.message) || e), 120, 'error')) }) } catch (eL) {}
          openDockPanel(st)
          return
        }
        hydrateOpenState(st)
        return
      }
      openDockPanel(st)  // 官方 sidebarRight 服务缺席 → 自带悬浮面板
    }
    export const openPanel = function (st) {
      // 打开位置 = cfg.openIn 指定的载体；该载体当前不可用就换另一个，两个都不可用才落自带悬浮面板。
      //   cfg 在 apply 时固化，而载体可能晚于本模块加载（未声明 inject 依赖）→ 一律按实时探测判定，
      //   不拿装配时的一次性结论当准（历史 #2-fix：误判导致点击「没反应」）。
      const bsReady = betterSidebarReady()
      const rbReady = rightbarReady()
      const want = (cfg.openIn === 'sidebar' || cfg.openIn === 'rightbar') ? cfg.openIn : defaultOpenIn()
      const mode = want === 'sidebar'
        ? (bsReady ? 'sidebar' : (rbReady ? 'rightbar' : 'dock'))
        : (rbReady ? 'rightbar' : (bsReady ? 'sidebar' : 'dock'))
      try { const _keyHash = dswsLogHash((typeof keyOf === 'function' ? keyOf(st.cwd || '') : String(st.cwd || ''))); const _snapVer = (typeof getSnapshotVersion === 'function' ? getSnapshotVersion(st.cwd) : '') || (st.snapshot && st.snapshot.version) || ''; const _bid = String((st.selection && st.selection.backendId) || ''); log('info', 'panel.open', { mode: mode, hasCache: !!(st.snapshot || (typeof getCachedSnapshot === 'function' && getCachedSnapshot(st.cwd))), snapFresh: (typeof snapFresh === 'function' ? snapFresh(st) : false), keyHash: _keyHash, snapVersion: _snapVer, backendId: _bid }) } catch (eL) {} // 串门自证（#495）：单行 #36 即可定罪——工作区键散列对上哪家、快照是哪个版本、后端是哪一个
      if (mode === 'sidebar') openInSidebar(st)
      else if (mode === 'rightbar') openInRightbar(st)
      else openDockPanel(st)
    }
    export const togglePanel = function (st) {
      if (st.open) { st.open = false; emit(st); return }
      openPanel(st)
    }

    // #227 迁移：repoStr 改由后端 describe 供给（repository.refId 优先，兼容旧 repo），通用占位不再硬编码 FeatherHunter/SKILLS
    export const repoStr = (st) => {
      const repo = st.snapshot && (st.snapshot.repository || st.snapshot.repo)
      if (repo && typeof repo.refId === 'string' && repo.refId) return repo.refId
      if (repo && repo.owner && repo.name) return repo.owner + '/' + repo.name
      if (st.snapshot && st.snapshot.repo) return st.snapshot.repo.owner + '/' + st.snapshot.repo.name
      return 'owner/repo'
    }

    // v21：开始 prompt 精简 —— /wayfinder + URL + 统一引导句（技能内部细节自带，不再重复灌输）
    // v25 · T2b：execute 走模板渲染（templates.execute 或默认），前缀开关 = cfg.withWayfinder
    // v1.3.3 #10：前缀去重 —— 模板（含用户自定义旧模板）若已以 /wayfinder 开头则不再重复拼接
    export const withWayfinderPrefix = function (body) {
      if (!cfg.withWayfinder) return body
      if (/^\/wayfinder\b/.test(String(body || '').trim())) return body
      return '/wayfinder\n' + body
    }
    export const startText = (st, t) => {
      const url = issueUrlFor(st, t.number) // #231 清尾：链接一律后端声明模板；无元数据即空（诚实）
      // v1.4（T2 #443）：map 用推进式 prompt（加载技能→分析map→挑下一个issue→执行）；普通 issue 用 execute 模板
      const isMap = (t.labels || []).some(function (l) { return (typeof l === 'string') ? l === 'wayfinder:map' : l.name === 'wayfinder:map' })
      // v1.5 B2 修订（用户拍板）：新会话/执行 prompt 跟随行状态 —— map 完成态 → 完成确认 prompt（与左「完成」按钮同语义）；
      //   未完成 → 推进式；统一带 map 标识（编号/标题/链接），新会话不再「找不到对应 ISSUE」
      if (isMap) {
        const stats = t.stats || (function () {
          const mo = ((st.snapshot && st.snapshot.maps) || []).find(function (m) { return m.number === t.number })
          return mo ? mo.stats : null
        })()
        const empty = !!(stats && stats.total === 0)
        if (empty) {
          try { return inspectPrompt(st, t.number, t.title) } catch(e) { return '/wayfinder ' + url + '\n\n' + promptText('mapInspect', { n: String(t.number || ''), title: (t.title || ''), url: url }) }
        }
        const done = !!(stats && stats.total > 0 && stats.closed === stats.total)
        if (done) {
          // #77 定版：mapHead 自包含化 —— 标识头已内联 complete v5，head 外挂删除
          return completePrompt(st, t.number, t.title, stats.total, stats.closed)
        }
        // v1.5：技能 + 链接前置（用户规则：具体操作 prompt 开头 = /wayfinder + ISSUE 链接，单行空格分隔）
        // v5（#68 grilling 定版）：mapExecute 自包含（map 标识头 + 闸门引用 + 正文格式已内嵌）→ gateText/BODY_FORMAT/head 外挂全删
        return '/wayfinder ' + url + '\n\n' + promptText('mapExecute', { n: String(t.number || ''), title: (t.title || ''), url: url })
      }
      const body = renderTemplate('execute', { number: String(t.number), url: url, title: t.title })
      return withWayfinderPrefix(body)
    }
    // 契约 #205 会话标题（[#n] + 清洗/截断 120 bytes 预算）与占位四式判定已迁至命名守护共享核心
    // src/shared/naming-titles.js 等 3 个文件（#265 · 单一真源；构建时经 shared:namingTitles 等 3 个 splice 拼入本闭包）。
    // 本文件不再声明任何命名真源：SESSION_TITLE_* / isNewPlaceholderTitle / newSessionTitleNew /
    // cleanTitleText / utf8Bytes / truncateTitleUtf8 / newSessionTitle 均以上述共享核心为准。
    // v1.5 T6：新增 wayfinder prompt —— /wayfinder + 仓库信息 + 需求引导（用户拍板：prompt 带仓库信息）
    // T16 补强（#463 复核 F2）：建图入口同样挂正文格式契约（新建 map 正文从源头防字面 \\n / BOM）
    // v7（#62 grill）：输入位绝对末尾 —— BODY_FORMAT 在中段，末尾追加 需求描述：/ Requirement:（满足 Q4）
    export const newWayfinderText = (st) => newWayfinderPrompt(st) + (BODY_FORMAT() ? '\n\n' + BODY_FORMAT() : '') + (promptLang() === 'en' ? '\n\nRequirement: ' : '\n\n需求描述：')
    // issue #4：新增 BUG 单 —— 与「+ 新建需求」同构（新会话 + 预填 /wayfinder prompt + 正文格式契约）
    // v2（#1 BUG3 补强）：输入位挪到 BODY_FORMAT 之后，模板末尾（避免中途输入位）
    // v3（#14 决议 #13 [T7]）：字段集精简为 4 项 + 例行指引（v3.4：每字段「字段名：」行 + 下方「例：示例」行紧贴，zh/en 分离跟随语言）；EN locale 切换（NEW_BUG_FIELDS_BODY_EN）
    // v4（#63 grilling 定版 2026-08-20）：去内部规则复述 + 字段括号单行 + 顺序实际→期望（hit #63 决议）
    export const newBugWayfinderText = (st) => promptText('newBugWayfinder', { repo: repoUrlFor(st) }) + (BODY_FORMAT() ? '\n\n' + BODY_FORMAT() : '') + (promptLang() === 'en' ? NEW_BUG_FIELDS_BODY_EN() : NEW_BUG_FIELDS_BODY())
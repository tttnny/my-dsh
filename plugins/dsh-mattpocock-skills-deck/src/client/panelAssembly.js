/**
 * client/panelAssembly.js —— 面板装配（从 index.js 拆出，#459，纯结构、行为零变化）
 * 契约：模块真源（ESM 导出）；scripts/build.mjs 构建时剥行首 export 拼回
 * src/client/index.js 的 leaf 标记处（一源两物，标记 id 与本文件名一致）。
 * 以后谁改它：改面板装配流程（Ctx 装配、插槽注册、启动收尾）的人改它。
 * 接线：本文件只用闭包已有名字（createCx/DswsCtx/RDOM/store/路由/叶子组件/slots），不引用其他新文件。
 */
    // ============================================================
    // 5.11 Ctx 接线（阶段 2 步骤 1 · #95）：建 cx 单例 + Provider 包住渲染树（行为零变化）
    // ============================================================
    // DswsCtx / createCx 由构建从 src/client/kernel/ctx.js 注入本闭包顶部（双产物同构 · seam 同模式）。
    // cx = { ctx, h, rdom, storeSvc, localeSvc, timer, api, router }（G3 冻结清单 8 字段 · #91 拍板）。
    // 宿主 slots 无全局 wrapper API（实查 dsh-client-ui-slots 0.1.0-rc.7 仅 register/inject），
    // 故 Provider 包在每个插槽组件注册处（渲染树顶层 = 组件根）；T4（#97）后叶子组件经
    // React.useContext(DswsCtx) 消费 cx（h/storeSvc 等），渲染输出与接线前一致（verify-* 全绿证明）。
    export const apiCall = function (endpoint, args) {
      if (typeof host === 'undefined' || typeof host.call !== 'function') {
        return Promise.reject(new Error('host.call 不可用（Host 半未加载）'))
      }
      return host.call(endpoint, args)
    }
    export const cx = createCx({
      ctx: ctx,
      h: h,
      rdom: RDOM,
      storeSvc: { shared: shared, stores: stores, makeStore: makeStore, storeOf: storeOf, emit: emit, sub: sub, useStore: useStore },
      localeSvc: localeSvc,
      timer: timer,
      api: { call: apiCall },
      router: { open: openPanel, toggle: togglePanel },
    })
    // Provider 包装器：任意深度组件都可 useContext(DswsCtx) 取 cx；props 原样透传
    export const withCx = function (Comp) {
      return function (props) {
        return h(DswsCtx.Provider, { value: cx }, h(Comp, props))
      }
    }

    // ============================================================
    // 6. 插槽注册（#298 幂等：与 ensureSidebarTab 同构，二次 apply/HMR 不增生）
    // ============================================================
    // 模块级闸门：每个槽位仅注入一次；卸载时经 ctx.effect 复位，允许重装后重注
    export const __slotOnce = {}
    export const __slotDisposers = {}
    export const __injectOnce = function (slotName, factory) {
      if (__slotOnce[slotName]) return
      __slotOnce[slotName] = true
      let disp = null
      try {
        slots.inject(slotName, function () {
          try {
            disp = factory()
          } catch (e) {
            __slotOnce[slotName] = false
            throw e
          }
          __slotDisposers[slotName] = disp
          return function () {
            try { if (disp) disp() } catch (e) { /* 忽略 */ }
            __slotDisposers[slotName] = null
          }
        })
      } catch (e) {
        __slotOnce[slotName] = false
        __slotDisposers[slotName] = null
        throw e
      }
      ctx.effect(function () {
        return function () {
          __slotOnce[slotName] = false
          try { const d = __slotDisposers[slotName]; if (d) d() } catch (e) { /* 忽略 */ }
          __slotDisposers[slotName] = null
        }
      }, 'dsws: slot ' + slotName)
    }
    __injectOnce('shell.overlay', function () {
      return slots.register({ name: 'shell.overlay', id: 'dsws-overlay-v5', order: 10 }, withCx(OverlayPanel))
    })
    __injectOnce('conversation.input.dock', function () {
      return slots.register({ name: 'conversation.input.dock', id: 'dsh-mattpocock-skills-deck', order: 40 }, withCx(StatusBar))
    })
    __injectOnce('tool.view.cordis', function () {
      return slots.register({ name: 'tool.view.cordis', key: 'self' }, withCx(RunPanel))
    })
    // 分叉收敛（2026-09-04）：只留插件页内 Tab，移除 settings.section 左侧直达（双入口重复；AGENTS.md 设置项排序规则：自有插件沉底不穿插）
    // v25-50：配置页（设置 → 插件 → MattSkillsDeck；与 opencode 主题同模式）
    __injectOnce('settings.plugins.tab', function () {
      return slots.register({ name: 'settings.plugins.tab', id: 'dsws-settings', order: 40, label: function () { return tr('panel.title') } }, withCx(SettingsPage))
    })
    // 【1.8.8 撤回】不再向 rightbar 槽位注册。
    //
    // 历史：1.8.6 把 DetailsDock 改名注册到 rightbar，并沿用旧版 `priority: -1`（「低者胜出」），
    //   意图是「替换内置右栏面板」。该意图在 0.1.5-rc.1 上是错的：
    //   官方 rightbar 条目**就是右栏框架本身**（dsh-client-ui-sidebar-right 的 RightbarRoot）——
    //   列宽（P3OORG_panel 的 style.width 720px）、推挤动画、折叠按钮、dockkit 标签宿主全由它渲染。
    //   被顶掉后：① 右栏列宽恒为 0，用户「点右侧边栏按钮面板直接消失」；
    //            ② dsh-better-sidebar 注册的 sidebar.right.pane.tab 标签全部失去宿主。
    //   真机 A/B 实证：临时禁用本注册后，P3OORG_panel / data-sidebar-right-panel 立即回归。
    //
    // 官方槽位结构（扩展点只有第三个）：
    //   rightbar（框架）→ rightbar.session（kind: single，标签宿主）
    //     → sidebar.right.pane.tab（kind: keyed ← 多标签正确扩展点）/ .title
    //
    // deck 现在的两种形态都不占官方右栏，与 better-sidebar 零冲突：
    //   主形态 = better-sidebar 标签页（下方 ensureSidebarTab + router.js openInSidebar；
    //            cfg.openIn 检测到 better-sidebar 即默认 'sidebar'）
    //   兜底   = 自带悬浮面板（router.js openDockPanel → openPagePanel）

    // v1.4.1：apply 时尽力注册 better-sidebar tab（MattSkillsDeck）；better-sidebar 服务未就绪（加载晚于本模块）→ 定时重试（最多 10 次）
    //   卸载（HMR / 插件禁用）时清理 disposer + 重试定时器
    if (!ensureSidebarTab()) {
      let tries = 0
      sidebarTabRetry = setInterval(function () {
        tries++
        if (ensureSidebarTab() || tries >= 10) { clearInterval(sidebarTabRetry); sidebarTabRetry = null }
      }, 1000)
    }
    ctx.effect(function () {
      return function () {
        try { if (sidebarTabDisposer) sidebarTabDisposer() } catch (e) { /* 忽略 */ }
        sidebarTabDisposer = null
        if (sidebarTabRetry) { clearInterval(sidebarTabRetry); sidebarTabRetry = null }
      }
    }, 'dsh-mattpocock-skills-deck: better-sidebar tab')

    // #490 client 日志底座：开关启动对账（本地秒显已在 log.js 顶层同步完成；
    //   此处再向宿主读开关，以宿主为准；宿主不可用就保持本地值，不阻断启动）。
    try { if (typeof reconcileLogSwitch === 'function') reconcileLogSwitch() } catch (e) {}
    // #347：加载真数据快照（repo 链接 + 前置检测兜底），失败静默
    loadSnapshot(shared, false)
    // #265：命名守护常驻渲染钩子（面板未开也续跑；计划单经 wf.namingPlan 拉取后代执行改名）
    startNamingGuardianPoll()

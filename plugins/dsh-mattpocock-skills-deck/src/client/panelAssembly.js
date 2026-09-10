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
    // 原型：右侧停靠（rightbar 槽位 · 替换内置面板）
    // 【0.1.5-rc.1 适配】官方把原 `details` 槽改名为 `rightbar`：实测槽位契约
    //   0.1.3-alpha.2 有 details/conversation、无 rightbar；0.1.5-rc.1 无 details、有 rightbar。
    //   槽位名写错**不会报错**——slots.inject 对未声明槽位静默跳过、回调永不执行，
    //   表现为「注册成功但面板永不挂载」，故必须跟随官方改名。
    // priority: -1 低于内置面板默认 0 → 无冲突且「低者胜出」替换内置面板
    __injectOnce('rightbar', function () {
      return slots.register({ name: 'rightbar', id: 'dsws-details', order: 10, priority: -1 }, withCx(DetailsDock))
    })

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

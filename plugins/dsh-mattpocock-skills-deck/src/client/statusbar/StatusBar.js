/**
 * statusbar/StatusBar.js — 输入区状态栏（5.2）
 * 契约：模块真源（ESM 导出）；scripts/build.mjs 构建时剥行首 export 拼回 src/client/index.js（spliced）。
 *
 * 2026-09-04 用户拍板（grilling 定稿）——输入框上方只保留胶囊一行：
 *   ① 横幅整族代码级移除、任何状态永不渲染：gate 蓝条（后端未选）/「正在探测后端」/
 *      gh CLI 缺失 / gh 未登录 / 未初始化(setup) / 技能缺失黄条，连同 setupPick 卡片与本组件
 *      status 源 gate 弹窗。后端选择 / 环境补齐引导一律走右侧面板（Checks / Settings 页；
 *      Dock / Overlay 各自保留独立 gate 弹窗，source='dock'）。
 *   ② 胶囊出厂默认隐藏（store makeStore 默认 statusbarHidden=true），仅面板眼睛按钮在当前
 *      会话内切换显隐；刷新 / 新会话回默认隐藏，不做持久化。
 *   ③ dock 槽位保持注册挂载（本组件 effects 照跑）：inputActions.setDraft 注入器 /
 *      pendingDraft 消费 / chain·快照加载 / cwd 探测零损失——预填输入框与交接两击不受影响。
 */
export const StatusBar = (props) => {
  const sid = props && props.sessionId
  const cx = React.useContext(DswsCtx)
  const h = cx ? cx.h : React.createElement
  const s = cx ? cx.storeSvc.useStore(sid) : useStore(sid)
  const summaryCwd = props.useSessions(function (x) {
    return (sid && x.byId && x.byId[sid]) ? x.byId[sid].cwd : undefined
  })
  // 注（2026-09-02 用户定版）：切换会话 preset 后链结果按「刷新页面」重估——曾实现过 preset 订阅秒级重算，
  //   用户复核后要求回退（不需要秒显示），此处保持原状：挂载时 loadChain，缓存命中即秒显旧结果。
  const consumedDraftRef = React.useRef(null)
  React.useEffect(function () {
    if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
      s.injector = props.inputActions.setDraft
    }
  }, [props.sessionId, props.inputActions])
  React.useEffect(function () {
    if (!props || !props.sessionId) return
    if (consumedDraftRef.current === props.sessionId) return
    if (!props.inputActions || typeof props.inputActions.setDraft !== 'function') return
    s.injector = props.inputActions.setDraft
    if (pendingDraft) {
      if (pendingDraftTargetSid && pendingDraftTargetSid !== props.sessionId) return
      consumedDraftRef.current = props.sessionId
      const text = pendingDraft
      pendingDraft = null
      pendingDraftTargetSid = null
      props.inputActions.setDraft(text)
    }
  }, [props.sessionId, props.inputActions])
  React.useEffect(function () {
    probeHandoffReady(s)
  }, [])
  React.useEffect(function () {
    const apply = function (cwd) {
      if (cwd && cwd !== s.cwd) {
        s.cwd = cwd
        const hydrated = hydrateFromCache(s)
        emit(s)
        loadChain(s, false)
        if (!hydrated || !snapFresh(s)) loadSnapshot(s, false, !!hydrated)
      }
    }
    if (summaryCwd) { apply(summaryCwd); return }
    const cwd0 = detectCwd(props && props.session)
    if (cwd0) { apply(cwd0); return }
    if (sid && typeof host !== 'undefined' && typeof host.call === 'function') {
      host.call('wf.cwd', { sessionId: sid }).then(function (res) {
        if (res && res.ok && res.cwd) apply(res.cwd)
      }).catch(function () {})
    }
  }, [sid, summaryCwd])
  React.useEffect(function () { loadChain(s, false); if (!snapFresh(s)) loadSnapshot(s, false, true) }, [])
  const csx = checksumsOf(s)
  const { fr, bugN, triageN, n, timeStr, setup, amber, skillsCheck, skillsBad, ghCliBad, ghAuthBad } = csx
  // 2026-08-28 优化3：胶囊状态栏任何情况下都不隐藏（#187「未选后端隐藏整条」门控退休，仅留导航引导）。
  //   → 2026-09-04 用户拍板修订：默认隐藏（store 默认 statusbarHidden=true），眼睛按钮会话内切换。
  // _isOtherSBGate 仍用于 go()：未选后端（backendId=null 且非 pending）时点击面板分段 → 设置页引导。
  // Guard: interval transient with empty cwd should not hide capsule (prevent forced empty)
  const _selSBGate = s.selection || (s.snapshot && s.snapshot.selection) || null
  const _isOtherSBGateRaw = !!(_selSBGate && _selSBGate.backendId===null && !_selSBGate.pending)
  const _isOtherSBGate = _isOtherSBGateRaw && !!s.cwd && s.snapMode==='real' && !!s.snapshot
  const go = function (tab) {
    if (_isOtherSBGate && tab!=='settings') { try{ s.tab='settings'; }catch(e){}; return }
    s.tab = tab; openPanel(s)
  }
  const foldRef = React.useRef(null)
  const bugAnchorRef = React.useRef(null)
  const bugCloseRef = React.useRef(null)
  const backendAnchorRef = React.useRef(null)
  const backendCloseRef = React.useRef(null)
  const placeOverlay = function (el, align) {
    if (!el || typeof window === 'undefined') return null
    const r = el.getBoundingClientRect()
    if (!r || (!r.width && !r.height)) return null
    const p = { bottom: Math.max(0, Math.round(window.innerHeight - r.top)) }
    if (align === 'right') p.right = Math.max(0, Math.round(window.innerWidth - r.right))
    else p.left = Math.max(0, Math.round(r.left))
    return p
  }
  const placeBugMenu = function () {
    const p = placeOverlay(bugAnchorRef.current, 'left')
    if (!p) return false
    const old = s.bugMenuPos
    if (old && old.left === p.left && old.bottom === p.bottom) return false
    s.bugMenuPos = p
    return true
  }
  const clearClose = function (ref) {
    if (ref.current !== null) { clearTimeout(ref.current); ref.current = null }
  }
  const closeBugMenu = function () {
    clearClose(bugCloseRef)
    if (!s.bugMenuOpen && !s.bugMenuPos && !s.bugMenuHover) return
    s.bugMenuOpen = false; s.bugMenuHover = false; s.bugMenuPos = null; emit(s)
  }
  const scheduleClose = function (ref, fn) {
    clearClose(ref)
    ref.current = setTimeout(function () { ref.current = null; fn() }, 160)
  }
  const showBugMenu = function () {
    clearClose(bugCloseRef)
    let changed = false
    if (s.skillsOpen || s.skillPopPos || s.skillHover || s.skillTip) { s.skillsOpen = false; s.skillHover = null; s.skillTip = null; s.skillPopPos = null; changed = true }
    if (!s.bugMenuOpen) { s.bugMenuOpen = true; changed = true }
    if (placeBugMenu()) changed = true
    if (changed) emit(s)
  }
  const placeBackendMenu = function () {
    const p = placeOverlay(backendAnchorRef.current, 'left')
    if (!p) return false
    const old = s.backendMenuPos
    if (old && old.left === p.left && old.bottom === p.bottom) return false
    s.backendMenuPos = p
    return true
  }
  const closeBackendMenu = function () {
    clearClose(backendCloseRef)
    if (!s.backendMenuOpen && !s.backendMenuPos) return
    s.backendMenuOpen = false; s.backendMenuPos = null; emit(s)
  }
  const showBackendMenu = function () {
    clearClose(backendCloseRef); clearClose(bugCloseRef)
    let changed = false
    if (s.bugMenuOpen || s.bugMenuPos || s.bugMenuHover) { s.bugMenuOpen = false; s.bugMenuHover = false; s.bugMenuPos = null; changed = true }
    if (s.skillsOpen || s.skillPopPos || s.skillHover || s.skillTip) { s.skillsOpen = false; s.skillHover = null; s.skillTip = null; s.skillPopPos = null; changed = true }
    if (!s.backendMenuOpen) { s.backendMenuOpen = true; changed = true }
    if (placeBackendMenu()) changed = true
    if (changed) emit(s)
  }
  React.useEffect(function () {
    if (!s.bugMenuOpen && !s.backendMenuOpen) return undefined
    let raf = null
    let disposed = false
    const reposition = function () {
      if (disposed || raf !== null) return
      const run = function () {
        raf = null
        if (disposed) return
        let changed = false
        if (s.bugMenuOpen && placeBugMenu()) changed = true
        if (s.backendMenuOpen && placeBackendMenu()) changed = true
        if (changed) emit(s)
      }
      if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(run)
      else raf = setTimeout(run, 0)
    }
    document.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)
    const ro = new ResizeObserver(reposition)
    if (bugAnchorRef.current) ro.observe(bugAnchorRef.current)
    if (backendAnchorRef.current) ro.observe(backendAnchorRef.current)
    reposition()
    return function () {
      disposed = true
      ro.disconnect()
      if (raf !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
        else clearTimeout(raf)
      }
      document.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      clearClose(bugCloseRef); clearClose(backendCloseRef)
    }
  }, [s.bugMenuOpen, s.backendMenuOpen])
  const applyFold = function () {
    const cap = foldRef.current
    if (!cap) return
    const targets = Array.from(cap.querySelectorAll('[data-fold-priority]'))
    if (!targets.length) return
    cap.classList.add('dsws-no-anim')
    targets.forEach(function (el) { el.classList.remove('dsws-folded') })
    void cap.offsetWidth
    const items = targets.map(function (el) {
      return { el: el, p: Number(el.getAttribute('data-fold-priority') || 99) }
    }).sort(function (a, b) { return a.p - b.p })
    for (const it of items) {
      if (cap.scrollWidth <= cap.clientWidth + 1) break
      it.el.classList.add('dsws-folded')
      void cap.offsetWidth
    }
    cap.dataset.fold = String(targets.filter(function (el) {
      return el.classList.contains('dsws-folded')
    }).length)
    cap.classList.remove('dsws-no-anim')
  }
  React.useEffect(function () {
    // 第一性原理方案 B：胶囊宽度不再 JS 设像素，完全由 CSS 变量 --dsh-composer-card-max-width 驱动（与输入卡同源）。
    // 旧方案量具体 textarea 卡死 780 的根因已消除；此处仅负责内容折叠（applyFold）对可用宽度的响应。
    // 可用宽 = 胶囊 clientWidth（已由 CSS 随对话框 --dsh-conversation-column-width 自动伸缩），
    // 因此只需观察胶囊及其父容器的尺寸变化即可触发折叠，无需再监听输入框。
    const roFold = new ResizeObserver(function () { applyFold() })
    const roParent = new ResizeObserver(function () { applyFold() })
    const applyAll = function () { applyFold() }
    applyFold()
    if (foldRef.current) {
      roFold.observe(foldRef.current)
      try { if (foldRef.current.parentElement) roParent.observe(foldRef.current.parentElement) } catch(e){}
    }
    window.addEventListener('resize', applyAll)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyFold)
    const poll = setInterval(applyAll, 2000)
    return function () {
      try { roFold.disconnect() } catch (e) {}
      try { roParent.disconnect() } catch(e){}
      window.removeEventListener('resize', applyAll)
      clearInterval(poll)
    }
  }, [])
  // 优化3：胶囊恒渲染（任何情况下不隐藏）；未选后端时其上方叠加 gate 蓝条引导入口
  const capsule = h('div', { className: 'dsws-capsule', ref: foldRef, onClick: function () { openPanel(s) }, style: { position: 'relative', width: '100%', boxSizing: 'border-box' } }, [
    h('span', { className: 'dsws-capsule-word', onClick: function (e) { e.stopPropagation(); togglePanel(s) } }, [
      Icon({ scheme: s.ui.icon, size: 14 }),
      h('span', { 'data-fold-priority': 1 }, tr('panel.title')),
    ]),
    h(Tip, { content: tr('nav.takeableTitle') }, seg('target', [h('span', { 'data-fold-priority': 5 }, tr('nav.takeable')), num(String(fr), '2ch')], '#4ade80', function () { s.stateFilter = 'frontier'; s.lblFilters = []; go('list') })),
    h('span', { ref: bugAnchorRef, style: { position: 'relative', display: 'inline-flex' }, onMouseEnter: showBugMenu, onMouseLeave: function () { scheduleClose(bugCloseRef, closeBugMenu) } }, [
      h(Tip, { content: tr('nav.bugTitle') }, seg('alert', [h('span', { 'data-fold-priority': 6 }, tr('nav.bug')), num(String(bugN), '2ch')], '#f87171', function () { s.stateFilter = 'open'; s.lblFilters = ['bug']; go('list') })),
      s.bugMenuOpen ? PortalOverlay({ className: 'dsws-bugmenu', onMouseEnter: function () { clearClose(bugCloseRef) }, onMouseLeave: function () { scheduleClose(bugCloseRef, closeBugMenu) }, onClick: function (e) { e.stopPropagation() }, style: { position: 'fixed', left: s.bugMenuPos ? s.bugMenuPos.left : 0, bottom: s.bugMenuPos ? s.bugMenuPos.bottom : 0, padding: 4, zIndex: 2147483000, background: 'var(--dsw-alias-bg-layer-2,#16181d)', border: '1px solid var(--dsw-alias-border-l1,#2a2d35)', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,.45)' } }, [
        h('div', { onClick: function (e) { e.stopPropagation(); closeBugMenu(); openTextInNewSession(s, newBugWayfinderText(s), newSessionTitleNew('bug')) }, onMouseEnter: function () { if (!s.bugMenuHover) { s.bugMenuHover = true; emit(s) } }, onMouseLeave: function () { if (s.bugMenuHover) { s.bugMenuHover = false; emit(s) } }, style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: s.bugMenuHover ? '#f87171' : 'var(--dsw-alias-label-primary,#e6edf3)', background: s.bugMenuHover ? 'rgba(248,113,113,.15)' : 'transparent', whiteSpace: 'nowrap' } }, [
          Ic({ n: 'bug', size: 12, color: s.bugMenuHover ? '#fca5a5' : '#f87171' }),
          h('span', null, tr('nav.bugNew')),
        ]),
      ]) : null,
    ]),
    h(Tip, { content: tr('nav.triageTitle') }, seg('search', [h('span', { 'data-fold-priority': 7 }, tr('nav.triage')), num(String(triageN), '2ch')], '#f59e0b', function () { s.stateFilter = 'open'; s.lblFilters = ['needs-triage']; go('list') })),
    h(Tip, { content: tr('nav.fixateTitle') }, seg('note', h('span', { 'data-fold-priority': 2 }, tr('nav.word')), '#c084fc', function () { injectFixate(s) })),
    h('span', { className: 'dsws-split' }, [
      h(Tip, { content: tr('nav.handoffTitle') }, h('span', { className: 'dsws-split-part', onClick: function (e) { e.stopPropagation(); doHandoff(s) }, 'aria-label': tr('nav.handoffTitle'), style: { color: '#58a6ff' } }, [
        Ic({ n: 'handoff', size: 12 }),
        h('span', { 'data-fold-priority': 3 }, tr('nav.handoff')),
      ])),
      h('span', { className: 'dsws-split-div' }),
      h(Tip, { content: s.handoffReady ? tr('nav.handoffReadyTitle') : tr('nav.handoffGreyTitle') }, h('span', { className: 'dsws-split-part', onClick: function (e) { e.stopPropagation(); doHandoffOpen(s) }, 'aria-label': s.handoffReady ? tr('nav.handoffReadyTitle') : tr('nav.handoffGreyTitle'), style: s.handoffReady ? { color: '#58a6ff' } : { color: '#8b8b95', opacity: 0.55, cursor: 'default' } }, [
        s.handoffSearching ? h('span', { className: 'dsws-spinner', style: { width: 12, height: 12, borderWidth: 2, boxSizing: 'border-box', display: 'inline-block', verticalAlign: '-2px' } }) : Ic({ n: s.handoffReady ? 'handoff-open' : 'handoff-off', size: 12 }),
      ])),
    ]),
    h(Tip, { content: tr('nav.envTitle', { n: n < 0 ? '?' : String(n), t: String(envTotal(s)) }) }, seg('dot', [h('span', { 'data-fold-priority': 8 }, tr('nav.env')), num(envLabel(s))], n < 0 ? '#f87171' : n === envTotal(s) ? '#4ade80' : '#f59e0b', function () { go('checks') })),
    h(Tip, { content: tr('nav.refreshTitle') }, h('span', { className: 'dsws-timebtn', onClick: function (e) { e.stopPropagation(); refreshAll(s) }, 'aria-label': tr('nav.refreshTitle') }, [h('span', { className: 'dsws-rficon' + (s.refreshing ? ' dsws-spin' : '') }, [Ic({ n: 'refresh', size: 11 })]), h('span', { 'data-fold-priority': 4 }, tr('nav.refresh')), h('span', { 'data-fold-priority': 9 }, ' ' + timeStr)])),
    h(SkillFloatList, { s: s }),
  ])
  // 2026-09-04 用户拍板：横幅整族与 status 源 gate 弹窗已整体移除（本文件头注释①）——
  //   环境未全部通过时输入框上方零渲染（连胶囊也不出，沿用 2026-09-02「胶囊与横幅同进退」口径）；
  //   后端选择 / 环境补齐引导走右侧面板（Checks / Settings 页）。statusbarHidden 只管胶囊显隐。
  if (s.statusbarHidden) return null
  const _envAllDone = n >= 0 && envTotal(s) > 0 && n === envTotal(s)
  if (!_envAllDone) return null
  return h('div', { style: { display: 'flex', flex: 'none', justifyContent: 'center', width: '100%', boxSizing: 'border-box', padding: '3px 8px 0', overflow: RDOM ? 'hidden' : 'visible' } }, [capsule])
}
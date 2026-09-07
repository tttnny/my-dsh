// src/host/presetGate.js —— my-dsh 分叉：agent-preset 技能门控（会话 preset 解析 + preset 根枚举）。
// 以后谁改它：改 preset 分发/门控口径的人。纯结构小文件，不引用其他新文件（D7 禁止静态 import）。
// 接线：由 index.js 动态 import 加载，ctx/getPlatform 显式注入；detectChain 经 index 注入的函数使用。
export function createPresetGate(deps) {
  const { ctx, getPlatform } = deps
  // 列出 ~/.dsh/.agent-presets 下全部 preset id（只读；失败返回 [] 即不并入任何 preset 根）
  async function listPresetIds() {
    try {
      const platform = await getPlatform()
      const home = await platform.getHome()
      if (!home) return []
      const mod = await import('node:fs/promises')
      const fsp = mod.default || mod
      const entries = await fsp.readdir(platform.path.join(home, '.dsh', '.agent-presets'), { withFileTypes: true })
      return entries.filter(function (e) { return e && typeof e.isDirectory === 'function' && e.isDirectory() }).map(function (e) { return e.name })
    } catch { return [] }
  }
  // 解析「本会话当前生效的 agent preset」：agentPreset 会话投影为准，创建 header 兜底。
  // 返回 { known, presetId }：known=false（无 sessionId/无 sessions 服务/旧宿主）时调用方回退枚举全部 preset 目录（宁绿勿误报）。
  function resolveSessionPresetCtx(sessionId) {
    if (!sessionId) return { known: false, presetId: null }
    try {
      const sessions = ctx.get('sessions')
      if (!sessions || typeof sessions.get !== 'function') return { known: false, presetId: null }
      const s = sessions.get(sessionId)
      if (!s) return { known: false, presetId: null }
      try {
        const proj = ctx.get('sessionProjections')
        if (proj && typeof proj.stateOf === 'function') {
          const v = proj.stateOf(s, 'agentPreset')
          if (typeof v === 'string' && v) return { known: true, presetId: v }
          if (v === null) return { known: true, presetId: null }
        }
      } catch {}
      try {
        if (s.projections && s.projections.values && typeof s.projections.values.agentPreset === 'string' && s.projections.values.agentPreset) return { known: true, presetId: s.projections.values.agentPreset }
      } catch {}
      try {
        if (s.projectionValues && typeof s.projectionValues.agentPreset === 'string' && s.projectionValues.agentPreset) return { known: true, presetId: s.projectionValues.agentPreset }
      } catch {}
      const header = s.header || s.meta
      const hp = header && header.agentPreset
      if (typeof hp === 'string' && hp) return { known: true, presetId: hp }
      if (hp === null) return { known: true, presetId: null }
      return { known: false, presetId: null }
    } catch { return { known: false, presetId: null } }
  }
  // 归因注册表命中路径所属 preset：返回 preset id；标准根/他处/无法归属返回 null。
  // 只做字符串归一比对（win32 折叠大小写），不触盘。
  async function attributePresetPath(foundPath) {
    try {
      const platform = await getPlatform()
      const home = await platform.getHome()
      if (!home || !foundPath) return null
      const norm = function (s) { try { let r = platform.path.normalize(String(s)); if (platform.os === 'win32') r = r.toLowerCase(); return r } catch { return String(s || '') } }
      const ph = norm(platform.path.join(home, '.dsh', '.agent-presets'))
      const p = norm(foundPath)
      if (p === ph) return null
      if (p.startsWith(ph + '/') || p.startsWith(ph + '\\')) {
        const rel = p.slice(ph.length + 1).split(/[\\/]/).filter(Boolean)
        if (rel.length) return rel[0]
      }
    } catch {}
    return null
  }
  // 他人 preset 注册表命中作废后的纯盘上结论（与 skillProbe 盘上分支同形：来源行 + 注册表未收录注记 + 门控注记 + 会话 preset 标记）。
  function verdictFromReason(reason, lang, owner, sessPreset) {
    const note = (lang === 'en')
      ? ' (registry hit from another preset "' + owner + '" ignored by session gating)'
      : '（注册表命中来自他人 preset“' + owner + '”，已按会话门控忽略）'
    const sessTag = (lang === 'en')
      ? ' [preset: ' + (sessPreset === undefined ? 'unknown' : String(sessPreset || 'none')) + ']'
      : '（preset：' + (sessPreset === undefined ? '未知' : String(sessPreset || '无')) + '）'
    const ch = [{ channel: 'registry', root: 'preset:' + owner, result: 'gated', detail: '' }].concat((reason && reason.channels) || [])
    if (reason && reason.kind === 'ok') {
      const srcLine = reason.sourcePath ? ((lang === 'en') ? ' (source: ' + reason.sourcePath + ')' : '（来源：' + reason.sourcePath + '）') : ''
      const regNote = (lang === 'en') ? ' (DSH catalog miss; judged by disk facts)' : '（DSH 技能清单未收录，按盘上事实判定）'
      return { ok: true, level: 'ok', detail: reason.detail + srcLine + regNote + note + sessTag, hint: '', sourcePath: reason.sourcePath || undefined, repo: null, via: reason.via, channels: ch }
    }
    if (reason && reason.kind === 'invalid') {
      return { ok: false, level: 'bad', detail: reason.detail + note + sessTag, hint: reason.hint, repo: null, reason: 'invalid', channels: ch }
    }
    return { ok: false, level: 'bad', detail: ((reason && reason.detail) || ((lang === 'en') ? 'Not installed' : '未安装')) + note + sessTag, hint: (reason && reason.hint) || 'prompt:installSkills', repo: null, reason: 'missing', channels: ch }
  }
  return { resolveSessionPresetCtx, listPresetIds, attributePresetPath, verdictFromReason }
}

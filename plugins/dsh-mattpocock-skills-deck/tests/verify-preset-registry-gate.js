// verify-preset-registry-gate.js — 分叉门禁：preset 门控必须同时约束注册表通道与盘上通道。
// 回归：无技能 preset 会话曾因「注册表命中直接返绿」显示 10/10（门控只管盘上，不管注册表）。
// 用法: node tests/verify-preset-registry-gate.js（在插件根目录）
const path = require('path')
const nodePath = require('node:path')

const ROOT = path.resolve(__dirname, '..')
let failed = false
let total = 0
const check = (ok, msg) => { total++; console.log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) failed = true }

async function main() {
  const gateMod = await import('../src/host/presetGate.js')
  const createPresetGate = gateMod.createPresetGate

  const fakePlatform = {
    os: 'darwin',
    path: nodePath,
    getHome: async () => '/fake/home',
  }
  const gate = createPresetGate({ ctx: { get: () => undefined }, getPlatform: async () => fakePlatform })

  // ---- 1. attributePresetPath 归因 ----
  check(await gate.attributePresetPath('/fake/home/.dsh/.agent-presets/matt-standard/skills/ask-matt/SKILL.md') === 'matt-standard', '归因他人 preset 目录 → matt-standard')
  check(await gate.attributePresetPath('/fake/home/.agents/skills/ask-matt/SKILL.md') === null, '标准根不归属任何 preset → null')
  check(await gate.attributePresetPath('/somewhere/else/SKILL.md') === null, '他处路径 → null')
  check(await gate.attributePresetPath(null) === null, '空路径 → null')

  // ---- 2. resolveSessionPresetCtx 四路 ----
  const mkGate = (sessionObj, proj) => createPresetGate({
    getPlatform: async () => fakePlatform,
    ctx: {
      get: (name) => {
        if (name === 'sessions') return { get: (sid) => (sid === 'sid-1' ? sessionObj : null) }
        if (name === 'sessionProjections') return proj || null
        return undefined
      },
    },
  })
  check(JSON.stringify(mkGate({ header: { agentPreset: 'matt-standard' } }).resolveSessionPresetCtx('sid-1')) === JSON.stringify({ known: true, presetId: 'matt-standard' }), 'header agentPreset → known')
  const gProj = mkGate(null, { stateOf: () => 'matt-ptc' })
  check(JSON.stringify(gProj.resolveSessionPresetCtx('sid-1')) === JSON.stringify({ known: false, presetId: null }), '会话对象缺失 → unknown（投影无载体）')
  const g2 = mkGate({ projectionValues: { agentPreset: 'matt-ptc' } })
  check(JSON.stringify(g2.resolveSessionPresetCtx('sid-1')) === JSON.stringify({ known: true, presetId: 'matt-ptc' }), 'projectionValues → known')
  const g3 = mkGate({ header: {} })
  check(JSON.stringify(g3.resolveSessionPresetCtx('sid-1')) === JSON.stringify({ known: false, presetId: null }), '无 preset 信息 → unknown（回退全枚举）')
  const g4 = mkGate({ header: { agentPreset: 'x' } })
  check(JSON.stringify(g4.resolveSessionPresetCtx(null)) === JSON.stringify({ known: false, presetId: null }), '无 sessionId → unknown')
  const g5 = createPresetGate({ ctx: { get: () => undefined }, getPlatform: async () => fakePlatform })
  check(JSON.stringify(g5.resolveSessionPresetCtx('sid-1')) === JSON.stringify({ known: false, presetId: null }), '无 sessions 服务 → unknown')

  // ---- 3. verdictFromReason 形态 ----
  const vMiss = gate.verdictFromReason({ kind: 'missing', detail: '未安装（缺失）', hint: 'prompt:installSkills', channels: [] }, 'zh', 'matt-standard')
  check(vMiss.level === 'bad' && vMiss.reason === 'missing' && vMiss.detail.includes('会话门控') && vMiss.channels[0].result === 'gated', '作废后 missing 结论带门控注记 + gated 通道行')
  const vOk = gate.verdictFromReason({ kind: 'ok', detail: '已安装', hint: '', sourcePath: '/p', via: 'direct:x', channels: [] }, 'zh', 'matt-standard')
  check(vOk.level === 'ok' && vOk.detail.includes('按盘上事实判定'), '盘上命中仍绿（附如实注记）')

  // ---- 4. handleChain 端到端：他人 preset 注册表命中必须变红，本 preset 保持绿 ----
  const dcMod = await import('../src/host/detectChain.js')
  const registryHit = {
    ok: true, level: 'ok', detail: 'Installed', hint: '',
    sourcePath: '/fake/home/.dsh/.agent-presets/matt-standard/skills/ask-matt/SKILL.md',
    repo: null, channels: [],
  }
  const runChain = async (presetId, extraArgs) => {
    const h = dcMod.createDetectChain({
      canonicalKey: async (cwd) => cwd,
      DEFAULT_CWD: '/tmp',
      resetGhCache: () => {},
      getDetectionService: async () => ({ detect: async () => ({ selection: null, explicit: null }) }),
      getPlatform: async () => fakePlatform,
      getTrackerRegistry: () => ({}),
      getRepoKey: async () => null,
      runGh: async () => ({ ok: false }),
      timer: { timeout: (ms) => new Promise((res) => setTimeout(res, ms)) },
      probeSkill: async () => registryHit,
      resolvePresetCtx: () => ({ known: true, presetId }),
      listPresetIds: async () => [],
      probeReason: async () => ({ kind: 'missing', detail: '未安装（缺失）', hint: 'prompt:installSkills', channels: [] }),
      presetGateMod: async () => gate,
      mdParseOkPredicate: async () => ({ status: 'pending', detail: '' }),
      getChainCache: () => ({ ts: 0, key: null, value: null }),
      setChainCache: () => {},
      logCtx: null,
    })
    return h.handleChain(Object.assign({ cwd: '/tmp/ws1', lang: 'zh', sessionId: 'sid-1' }, extraArgs || {}))
  }
  const skillSteps = (res) => {
    const snap = res && (res.fullSnapshot || res.snapshot)
    const steps = (snap && Array.isArray(snap.steps)) ? snap.steps : []
    return steps.filter((s) => String(s.id || '').startsWith('skill:'))
  }
  const rOther = await runChain('standard')
  const stepsOther = skillSteps(rOther)
  check(stepsOther.length > 0, `他人 preset 会话链含技能检查项（${stepsOther.length} 项）`)
  check(stepsOther.every((s) => s.status !== 'done'), '他人 preset：注册表命中被作废，技能项不变绿')
  check(stepsOther.some((s) => String((s.detail || '') + JSON.stringify(s)).includes('会话门控')), '他人 preset：结论带门控注记')
  const rOwn = await runChain('matt-standard')
  const stepsOwn = skillSteps(rOwn)
  check(stepsOwn.length > 0 && stepsOwn.every((s) => s.status === 'done'), '本 preset：注册表命中保留，技能项绿')
  // ---- 5. 客户端直传 preset 优先：宿主解析未知时，直传 standard 仍变红、直传 matt-standard 仍绿 ----
  const rExplicitRed = await runChain(null, { preset: 'standard' })
  const stepsExplicitRed = skillSteps(rExplicitRed)
  check(stepsExplicitRed.length > 0 && stepsExplicitRed.every((s) => s.status !== 'done'), '直传 standard：宿主解析未知也变红')
  const rExplicitGreen = await runChain(null, { preset: 'matt-standard' })
  const stepsExplicitGreen = skillSteps(rExplicitGreen)
  check(stepsExplicitGreen.length > 0 && stepsExplicitGreen.every((s) => s.status === 'done'), '直传 matt-standard：保持绿')
  // ---- 6. 结论缀 preset 可观测标记（文本落在 show.desc，兼查 detail） ----
  const stepText = (s) => String((s && s.detail) || (s && s.show && s.show.desc) || '');
  check(stepsOther.some((s) => stepText(s).includes('preset：')), '红项明细缀 preset 标记')
  check(stepsOwn.some((s) => stepText(s).includes('preset：')), '绿项明细缀 preset 标记')

  console.log(failed ? `\n存在失败（${total} 项）` : `\n全部通过（${total} 项）`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

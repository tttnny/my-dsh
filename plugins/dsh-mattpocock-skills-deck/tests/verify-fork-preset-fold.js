// verify-fork-preset-fold.js — 分叉契约门禁（my-dsh fork）：
//   1) 环境四件套：preset 技能候选根 + 按会话 preset 门控 + 回退全枚举 + 链缓存会话维度。
//   2) 横幅整体默认隐藏 + 展开后按工作区记忆；报错穿透；设置只留插件页内 Tab。
//   3) 构建包名动态化 + bundled 整组移除。
// 用法: node tests/verify-fork-preset-fold.js（在插件根目录）
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
let failed = false
const check = (ok, msg) => { console.log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) failed = true }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ---- 1. 环境四件套 ----
const sp = read('src/host/skillProbe.js')
check(sp.includes('.agent-presets') && sp.includes("'preset'") || sp.includes('"preset"'), 'skillProbe.js 含 preset 候选根（.agent-presets）')
check(/lightProbeReason\s*\(\s*skillName\s*,\s*lang\s*,\s*cwd\s*,\s*presetCtx/.test(sp), 'lightProbeReason 线程 presetCtx')
check(/probeSkill\s*\(\s*skillName\s*,\s*lang\s*,\s*cwd\s*,\s*presetCtx/.test(sp), 'probeSkill 线程 presetCtx')
check(fs.existsSync(path.join(ROOT, 'src/host/presetGate.js')), 'src/host/presetGate.js 存在')
if (fs.existsSync(path.join(ROOT, 'src/host/presetGate.js'))) {
  const pg = read('src/host/presetGate.js')
  check(pg.includes('resolveSessionPresetCtx'), 'presetGate.js 暴露 resolveSessionPresetCtx')
  check(pg.includes('sessionProjections') && pg.includes('agentPreset'), 'preset 解析走 agentPreset 投影 + header 兜底')
  check(pg.includes('readdir'), '回退全枚举可列目录')
}
const dc = read('src/host/detectChain.js')
check(dc.includes('|p'), 'detectChain.js 链缓存键含 preset/会话维度')
check(dc.includes('sessionId'), 'detectChain.js 消费 args.sessionId')
const pc = read('src/client/kernel/probe-chain.js')
check(/sessionId/.test(pc) && /wf\.chain/.test(pc), 'probe-chain.js 向 wf.chain 透传 sessionId')
const ss = read('src/client/kernel/store-snapshot.js')
check(/getChainCacheKey\s*=\s*function\s*\(\s*cwd\s*,\s*backendId\s*,\s*lang\s*,\s*sessionId/.test(ss), 'getChainCacheKey 含 sessionId 第四段')

// ---- 2. 横幅默认隐藏 + 工作区记忆 ----
const prefs = read('src/client/kernel/store-prefs.js')
check(/return\s*\(k in bannerFoldByCwd\)\s*\?\s*!!bannerFoldByCwd\[k\]\s*:\s*true/.test(prefs), 'isBannerFolded 未知工作区默认收起')
check(/bannerFoldByCwd\[k\]\s*=\s*0/.test(prefs), '展开态持久化显式标记（非删键）')
const sb = read('src/client/statusbar/StatusBar.js')
check(/snapMode/.test(sb) && /err/.test(sb), 'StatusBar 含报错穿透逻辑')
check(!/dsws-fold-toggle/.test(sb) && !/dsws-banner-fold-x/.test(sb) && !/foldBanner/.test(sb), 'StatusBar dock 零按钮（无 ∨/叉/pill 开关）')
check(/if\s*\(\s*deckFolded\s*\)\s*return null/.test(sb), 'StatusBar 收起后零输出（恢复入口只在面板）')
const dock = read('src/client/panel/Dock.js')
check(dock.includes('setBannerFolded') && dock.includes('isBannerFolded'), 'Dock 头部挂功能区显隐总开关')
check(dock.includes("banner.expandDeck") && dock.includes("banner.foldDeck"), 'Dock 开关复用折叠文案（无新词条）')
const pa = read('src/client/panelAssembly.js')
check(!/__injectOnce\('settings\.section'/.test(pa) && !/name:\s*'settings\.section'/.test(pa), 'panelAssembly.js 无 settings.section 注册（只留插件页内 Tab）')
check(pa.includes('settings.plugins.tab'), 'panelAssembly.js 保留 settings.plugins.tab')

// ---- 3. 构建与 bundled ----
const bm = read('scripts/build.mjs')
check(bm.includes('dswPkgName'), 'build.mjs 包名动态化（dswPkgName）')
check(!bm.includes('package/bundled-skills'), 'build.mjs 无 bundled-skills 引用')
check(bm.includes('@lynn123411/dsh-mattpocock-skills-deck'), 'build.mjs 同步路径为分叉包名')
check(!fs.existsSync(path.join(ROOT, 'package/bundled-skills')), 'package/bundled-skills 不存在')
check(!fs.existsSync(path.join(ROOT, 'scripts/sync-matt-skills.mjs')), 'scripts/sync-matt-skills.mjs 不存在')

if (failed) { console.log('\n存在失败'); process.exit(1) }
console.log('\n全部通过')

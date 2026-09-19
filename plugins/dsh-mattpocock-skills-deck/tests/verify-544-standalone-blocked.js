#!/usr/bin/env node
// verify-544-standalone-blocked.js — #544 独立票原生依赖阻塞边在列表与计数中展示
// 验收：不属于任何地图子票的行，读自身 blockedBy；有 open 阻塞者时进 blockOf 且计入占用；
// 地图分层与计数不受影响；已关闭行不参与；坏引用不崩。
// 用法: node tests/verify-544-standalone-blocked.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')

async function loadDerived() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'client', 'kernel', 'store-derived.js'), 'utf8')
  const dir = path.join(__dirname, '..', 'tmp')
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, 'tmp-544-verify-derived.mjs')
  fs.writeFileSync(tmp, src, 'utf8')
  try { return await import('file:///' + tmp.replace(/\\/g, '/')) }
  finally { try { fs.unlinkSync(tmp) } catch (e) {} }
}

async function main() {
  const d = await loadDerived()
  assert(typeof d.isOccupied === 'function', '导出 isOccupied')
  assert(typeof d.applyStandaloneBlocks === 'function', '导出 applyStandaloneBlocks')
  let passed = 0
  const ok = (n) => { passed++; console.log('  PASS', n) }

  // 场景 1：独立票链 540→541→542→543，无地图
  const st = { snapshot: { maps: [], issues: [
    { key: '540', number: 540, state: 'OPEN', assignees: [], labels: [], blockedBy: [] },
    { key: '541', number: 541, state: 'OPEN', assignees: [], labels: [], blockedBy: [{ key: '540', title: 'A', state: 'open' }] },
    { key: '542', number: 542, state: 'OPEN', assignees: [], labels: [], blockedBy: [{ key: '541', title: 'B', state: 'open' }] },
    { key: '543', number: 543, state: 'OPEN', assignees: [], labels: [], blockedBy: [{ key: '542', title: 'C', state: 'open' }] },
  ] } }
  const blockOf = d.applyStandaloneBlocks(st, {})
  assert.deepStrictEqual(Object.keys(blockOf).map(Number).sort((a, b) => a - b), [541, 542, 543], '541/542/543 进入 blockOf')
  assert.strictEqual(blockOf[541].map, null, '独立票不挂地图')
  assert.deepStrictEqual(blockOf[541].by, ['540'], '541 阻塞来源 540')
  assert.deepStrictEqual(blockOf[543].by, ['542'], '543 阻塞来源 542')
  ok('独立票阻塞徽章数据齐备且只挂自己')
  assert.strictEqual(d.isOccupied(st, st.snapshot.issues[0]), false, '540 未阻塞')
  assert.strictEqual(d.isOccupied(st, st.snapshot.issues[1]), true, '541 阻塞')
  assert.strictEqual(d.isOccupied(st, st.snapshot.issues[3]), true, '543 阻塞')
  assert.strictEqual(d.occCount(st), 3, '阻塞计数 3')
  assert.strictEqual(d.frontierCount(st), 1, '可接 1（仅 540）')
  ok('占用判定与顶部计数正确')

  // 场景 2：已关闭行不参与；无阻塞边不参与
  const st2 = { snapshot: { maps: [], issues: [
    { key: '600', number: 600, state: 'CLOSED', assignees: [], labels: [], blockedBy: [{ key: '601', state: 'open' }] },
    { key: '601', number: 601, state: 'OPEN', assignees: [], labels: [], blockedBy: [] },
  ] } }
  const b2 = d.applyStandaloneBlocks(st2, {})
  assert.deepStrictEqual(Object.keys(b2), [], '已关闭行不进 blockOf')
  assert.strictEqual(d.isOccupied(st2, st2.snapshot.issues[0]), false, '已关闭行不算占用')
  ok('已关闭行不参与')

  // 场景 3：地图分层回归——地图子票按原有地图口径判定，不被独立票合并影响
  const mapSnap = { maps: [{ number: 100, title: 'M', tickets: [
    { key: '1', number: 1, state: 'OPEN', blockedBy: [] },
    { key: '2', number: 2, state: 'OPEN', blockedBy: [3] },
    { key: '3', number: 3, state: 'OPEN', blockedBy: [] },
  ] }], issues: [] }
  const mst = { snapshot: mapSnap }
  const b3 = d.applyStandaloneBlocks(mst, {})
  assert.deepStrictEqual(Object.keys(b3), [], '地图子票不被当成独立票合并')
  assert.strictEqual(d.isOccupied(mst, { number: 2, state: 'OPEN' }), true, '地图子票 2 按地图边判为阻塞')
  assert.strictEqual(d.isOccupied(mst, { number: 3, state: 'OPEN' }), false, '地图子票 3 未阻塞')
  ok('地图分层与占用判定零变化')

  // 场景 4：坏引用不崩
  const st4 = { snapshot: { maps: [], issues: [
    { key: '700', number: 700, state: 'OPEN', assignees: [], labels: [], blockedBy: [null, 42, {}, { key: '' }] },
  ] } }
  const b4 = d.applyStandaloneBlocks(st4, {})
  assert.deepStrictEqual(Object.keys(b4), [], '无法指认身份的边不算阻塞')
  assert.strictEqual(d.isOccupied(st4, st4.snapshot.issues[0]), false, '坏边不崩且不算占用')
  ok('坏引用不崩')

  console.log('\n全部通过 · #544 独立票原生依赖阻塞边口径生效（' + passed + ' 组）')
}
main().catch((e) => { console.error('FAIL', e && e.message); process.exit(1) })

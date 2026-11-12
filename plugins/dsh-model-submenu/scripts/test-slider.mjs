/**
 * Slider geometry self-check: where a pointer lands on the track, and where the
 * knob sits for a level.
 *
 * jsdom does no layout, so the arithmetic that turns a pointer position into a
 * detent lives in its own module and is checked here rather than through the
 * rendered component. The load-bearing assertions are the two clamps: a press
 * past either end must stay on the first or last level instead of running off
 * the track.
 *
 * Run: node scripts/test-slider.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LEVEL_GRADIENT, levelColor } from '../src/client/level-color.ts'
import { KNOB_SIZE, SLIDER_STARS, knobOffset, offsetOf, stepAt } from '../src/client/slider.ts'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

let passed = 0
let total = 0
async function test(label, fn) {
  total += 1
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${label}`)
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`)
    throw error
  }
}

await test('四档时旋钮均分整条轨道', () => {
  assert.equal(offsetOf(0, 4), 0)
  assert.equal(offsetOf(1, 4), 1 / 3)
  assert.equal(offsetOf(3, 4), 1)
})

await test('下标越界时夹到两端', () => {
  assert.equal(offsetOf(-2, 4), 0)
  assert.equal(offsetOf(9, 4), 1)
})

await test('只有一档或没有档位时都停在起点', () => {
  assert.equal(offsetOf(0, 1), 0)
  assert.equal(offsetOf(3, 1), 0)
  assert.equal(offsetOf(0, 0), 0)
})

await test('指针落在轨道两端时取首末档', () => {
  // 100px 轨道、18px 旋钮：可用行程 82px，圆心从 9px 走到 91px。
  assert.equal(stepAt(9, 0, 100, 4), 0)
  assert.equal(stepAt(91, 0, 100, 4), 3)
})

await test('指针越出轨道时仍夹在首末档', () => {
  assert.equal(stepAt(-500, 0, 100, 4), 0)
  assert.equal(stepAt(500, 0, 100, 4), 3)
})

await test('指针落在两档之间时取最近的一档', () => {
  // 圆心 50px ≈ 行程的一半 → 1.5 档，四舍五入到第 2 档。
  assert.equal(stepAt(50, 0, 100, 4), 2)
  // 圆心 36px ≈ 1/3 行程 → 正好第 1 档。
  assert.equal(stepAt(36, 0, 100, 4), 1)
})

await test('轨道左边缘不在 0 时按偏移量计算', () => {
  assert.equal(stepAt(109, 100, 100, 4), 0)
  assert.equal(stepAt(191, 100, 100, 4), 3)
})

await test('单档、零宽轨道都退回第一档', () => {
  assert.equal(stepAt(80, 0, 100, 1), 0)
  assert.equal(stepAt(80, 0, KNOB_SIZE, 4), 0)
  assert.equal(stepAt(80, 0, 0, 4), 0)
})

await test('旋钮位置写成两端内缩的 CSS 长度', () => {
  assert.equal(knobOffset(0), 'calc(9px + 0 * (100% - 18px))')
  assert.equal(knobOffset(1), 'calc(9px + 1 * (100% - 18px))')
  assert.equal(knobOffset(0.5), 'calc(9px + 0.5 * (100% - 18px))')
})

await test('旋钮位置越界时同样夹住', () => {
  assert.equal(knobOffset(-1), knobOffset(0))
  assert.equal(knobOffset(2), knobOffset(1))
})

await test('档位颜色从蓝走到紫，两端与渐变一致', () => {
  assert.equal(levelColor(0), 'rgb(77, 147, 248)')
  assert.equal(levelColor(1), 'rgb(147, 51, 234)')
  assert.equal(levelColor(0.5), 'rgb(112, 99, 241)')
  assert.equal(LEVEL_GRADIENT, 'linear-gradient(90deg, rgb(77, 147, 248), rgb(147, 51, 234))')
})

await test('档位颜色越界时夹住', () => {
  assert.equal(levelColor(-1), levelColor(0))
  assert.equal(levelColor(2), levelColor(1))
})

await test('星尘位置固定且落在填充区内', () => {
  assert.equal(SLIDER_STARS.length, 14)
  assert.equal(SLIDER_STARS, SLIDER_STARS)
  for (const star of SLIDER_STARS) {
    assert.ok(star.x >= 0 && star.x <= 100, `x 越界：${star.x}`)
    assert.ok(star.y >= 0 && star.y <= 100, `y 越界：${star.y}`)
    assert.ok(star.size > 0 && star.size <= 3, `尺寸越界：${star.size}`)
  }
  assert.deepEqual(SLIDER_STARS, SLIDER_STARS.map((star) => ({ ...star })))
})

console.log(`\nslider: ${passed}/${total} passed`)
process.exit(passed === total ? 0 : 1)

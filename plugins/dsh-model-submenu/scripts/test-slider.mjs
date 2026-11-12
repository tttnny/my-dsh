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

import { LEVEL_GRADIENT, isTopLevel, levelColor } from '../src/client/level-color.ts'
import {
  KNOB_SIZE, TRACK_HEIGHT, detentAt, fillWidth, fractionAt, knobOffset, offsetOf, stepAt,
} from '../src/client/slider.ts'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

/**
 * Resolve one of the `calc(<a>px + <f> * (100% - <b>px))` lengths the slider
 * writes against a track width, so the geometry can be checked as numbers
 * instead of as strings.
 * @param expression - the CSS length.
 * @param width - the track's width in pixels.
 * @returns the length in pixels.
 */
function length(expression, width) {
  const match = /^calc\(([\d.]+)px \+ ([\d.]+) \* \(100% - ([\d.]+)px\)\)$/.exec(expression)
  assert.notEqual(match, null, `认不得的长度写法：${expression}`)
  return Number(match[1]) + Number(match[2]) * (width - Number(match[3]))
}

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

await test('拖动位置是连续比例，不是逐档跳', () => {
  // 100px 轨道、20px 旋钮：行程 80px，比例 0 在 10px、1 在 90px。
  assert.equal(fractionAt(10, 0, 100), 0)
  assert.equal(fractionAt(90, 0, 100), 1)
  assert.equal(fractionAt(50, 0, 100), 0.5)
  assert.equal(fractionAt(-500, 0, 100), 0, '越出左端夹住')
  assert.equal(fractionAt(500, 0, 100), 1, '越出右端夹住')
  // 两像素的移动也必须让旋钮动起来，否则拖动就是逐档跳。
  assert.notEqual(fractionAt(50, 0, 100), fractionAt(52, 0, 100))
})

await test('比例换回最近的一档，跨过中点才变', () => {
  assert.equal(detentAt(0, 4), 0)
  assert.equal(detentAt(1, 4), 3)
  assert.equal(detentAt(0.5, 4), 2)
  assert.equal(detentAt(0.3, 4), 1)
  assert.equal(detentAt(0.9, 1), 0, '只有一档时恒为 0')
  const near = fractionAt(50, 0, 100)
  const nearer = fractionAt(52, 0, 100)
  assert.equal(detentAt(near, 4), detentAt(nearer, 4), '还没跨过中点，档位不变')
})

await test('指针落在轨道两端时取首末档', () => {
  // 100px 轨道、20px 旋钮：可用行程 80px，圆心从 10px 走到 90px。
  assert.equal(stepAt(10, 0, 100, 4), 0)
  assert.equal(stepAt(90, 0, 100, 4), 3)
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
  assert.equal(stepAt(110, 100, 100, 4), 0)
  assert.equal(stepAt(190, 100, 100, 4), 3)
})

await test('单档、零宽轨道都退回第一档', () => {
  assert.equal(stepAt(80, 0, 100, 1), 0)
  assert.equal(stepAt(80, 0, KNOB_SIZE, 4), 0)
  assert.equal(stepAt(80, 0, 0, 4), 0)
})

await test('旋钮位置写成两端内缩的 CSS 长度', () => {
  assert.equal(knobOffset(0), 'calc(10px + 0 * (100% - 20px))')
  assert.equal(knobOffset(1), 'calc(10px + 1 * (100% - 20px))')
  assert.equal(knobOffset(0.5), 'calc(10px + 0.5 * (100% - 20px))')
})

await test('旋钮位置越界时同样夹住', () => {
  assert.equal(knobOffset(-1), knobOffset(0))
  assert.equal(knobOffset(2), knobOffset(1))
})

await test('填充的右端圆弧始终藏在旋钮底下，末档正好铺满轨道', () => {
  const width = 200
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const knob = length(knobOffset(fraction), width)
    // 填充的右端是半径 TRACK_HEIGHT/2 的半圆，它的圆心必须落在旋钮圆内，
    // 否则色块会在旋钮旁边露出一截圆弧。
    const cap = length(fillWidth(fraction), width) - TRACK_HEIGHT / 2
    assert.ok(
      Math.abs(cap - knob) + TRACK_HEIGHT / 2 <= KNOB_SIZE / 2 + 1e-9,
      `f=${fraction} 时填充的圆弧露在旋钮外面`,
    )
  }
  assert.equal(length(fillWidth(1), width), width, '末档必须铺到轨道尽头')
})

await test('填充宽度越界时同样夹住', () => {
  assert.equal(fillWidth(-1), fillWidth(0))
  assert.equal(fillWidth(2), fillWidth(1))
})

await test('Off 档不着色，用中性的暗色', () => {
  assert.equal(levelColor(0, 4), 'var(--dsw-alias-label-dimmed)')
  assert.equal(levelColor(0, 2), 'var(--dsw-alias-label-dimmed)')
})

await test('Off 以上的档位走蓝到紫，两端与渐变一致', () => {
  // 四档：Off、第一档、第二档、Max。亮起来的三档正好分在蓝、中、紫。
  assert.equal(levelColor(1, 4), 'rgb(77, 147, 248)')
  assert.equal(levelColor(2, 4), 'rgb(112, 99, 241)')
  assert.equal(levelColor(3, 4), 'rgb(147, 51, 234)')
  assert.equal(LEVEL_GRADIENT, 'linear-gradient(90deg, rgb(77, 147, 248), rgb(147, 51, 234))')
})

await test('只有两档时，唯一亮着的档位就是紫端', () => {
  assert.equal(levelColor(1, 2), 'rgb(147, 51, 234)')
})

await test('只有最高档用渐变，其余档位是纯色', () => {
  assert.equal(isTopLevel(3, 4), true)
  assert.equal(isTopLevel(2, 4), false)
  assert.equal(isTopLevel(1, 4), false)
  assert.equal(isTopLevel(0, 1), false)
})

console.log(`\nslider: ${passed}/${total} passed`)
process.exit(passed === total ? 0 : 1)

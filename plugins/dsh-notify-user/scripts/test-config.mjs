/**
 * 按会话开关的纯逻辑自检：默认值、显式选择优先，以及写入时「只留与默认值不同
 * 的会话」这条规则。
 *
 * 跑法：pnpm test / node scripts/test-config.mjs
 */
import assert from 'node:assert/strict';

import { DEFAULT_ENABLED, enabledFor, overridesAfterWrite } from '../src/shared/config.ts';

let passed = 0;
let total = 0;
function test(label, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

test('默认值是开启', () => {
  assert.equal(DEFAULT_ENABLED, true);
});

test('没有记录时用默认值', () => {
  assert.equal(enabledFor(undefined, true, 's1'), true);
  assert.equal(enabledFor({}, true, 's1'), true);
  assert.equal(enabledFor(undefined, false, 's1'), false);
});

test('有记录时用会话自己的值', () => {
  assert.equal(enabledFor({ s1: false }, true, 's1'), false);
  assert.equal(enabledFor({ s1: true }, false, 's1'), true);
});

test('只看当前会话的记录', () => {
  assert.equal(enabledFor({ s2: false }, true, 's1'), true);
});

test('字典里的脏数据当没写', () => {
  assert.equal(enabledFor({ s1: 'no' }, true, 's1'), true);
  assert.equal(enabledFor({ s1: null }, false, 's1'), false);
});

test('原型上的同名键不算记录', () => {
  assert.equal(enabledFor({}, true, 'constructor'), true);
  assert.equal(enabledFor({}, false, 'toString'), false);
});

test('写成与默认值不同：记一条', () => {
  assert.deepEqual(overridesAfterWrite({}, 's1', false, true), { s1: false });
  assert.deepEqual(overridesAfterWrite({ s2: false }, 's1', false, true), { s2: false, s1: false });
});

test('写回默认值：删掉那条记录', () => {
  assert.deepEqual(overridesAfterWrite({ s1: false }, 's1', true, true), {});
  assert.deepEqual(overridesAfterWrite({ s1: false, s2: false }, 's1', true, true), { s2: false });
});

test('没有变化时返回同一个对象，调用方据此跳过写入', () => {
  const none = {};
  assert.equal(overridesAfterWrite(none, 's1', true, true), none);
  const recorded = { s1: false };
  assert.equal(overridesAfterWrite(recorded, 's1', false, true), recorded);
});

test('默认关掉时反过来：打开才记一条', () => {
  assert.deepEqual(overridesAfterWrite({}, 's1', true, false), { s1: true });
  assert.deepEqual(overridesAfterWrite({ s1: true }, 's1', false, false), {});
});

test('不改调用方手里那份', () => {
  const before = { s1: false };
  overridesAfterWrite(before, 's1', true, true);
  overridesAfterWrite(before, 's2', false, true);
  assert.deepEqual(before, { s1: false });
});

console.log(`${passed}/${total} passed`);

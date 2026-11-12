/**
 * 催办状态机的纯逻辑自检：不碰 cordis、不碰会话，只喂计数、阈值与三个开关。
 *
 * 跑法：pnpm test / node scripts/test-nudge.mjs
 */
import assert from 'node:assert/strict';

import { createNudgeController, hasProse, nudgeSummary, renderNudge } from '../src/nudge.ts';

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

/** 一个会话的替身：状态机只用它的对象身份，`readEnabled` 由用例自己给。 */
const session = () => ({ header: { id: 'main' } });

/**
 * 造一个状态机：三个现读函数都给默认值，个别用例再覆盖。
 * @param {() => number} readThreshold - 阈值。
 * @param {() => boolean} [readProseResets] - 散文算不算汇报。
 * @param {(session: object) => boolean} [readEnabled] - 这个会话开没开主动汇报。
 */
function controller(readThreshold, readProseResets = () => true, readEnabled = () => true) {
  return createNudgeController({ readThreshold, readProseResets, readEnabled });
}

test('未满阈值不催', () => {
  const nudge = controller(() => 8);
  const who = session();
  for (let index = 0; index < 7; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
});

test('满阈值催一条，正文带次数与来源标记', () => {
  const nudge = controller(() => 8);
  const who = session();
  for (let index = 0; index < 8; index += 1) nudge.toolCall(who);
  const notice = nudge.step(who, false);
  assert.ok(notice !== null);
  assert.equal(notice.source.kind, 'notify-user-nudge');
  assert.equal(notice.source.form, 'notice');
  assert.equal(notice.source.summary, '8 tool calls without a notify_user update');
  assert.match(notice.content[0].text, /8 tool calls without a notify_user update/);
  assert.match(notice.content[0].text, /notify_user/);
});

test('催过就清零，再满阈值才再催', () => {
  const nudge = controller(() => 3);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  assert.ok(nudge.step(who, false) !== null);
  for (let index = 0; index < 2; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
  nudge.toolCall(who);
  assert.ok(nudge.step(who, false) !== null);
});

test('汇报清零', () => {
  const nudge = controller(() => 3);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  nudge.notify(who);
  assert.equal(nudge.step(who, false), null);
  for (let index = 0; index < 2; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
});

test('开关打开时散文清零', () => {
  const nudge = controller(() => 3);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  nudge.prose(who);
  assert.equal(nudge.step(who, false), null);
});

test('开关关掉时散文不清零', () => {
  const nudge = controller(() => 3, () => false);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  nudge.prose(who);
  assert.ok(nudge.step(who, false) !== null);
});

test('散文开关现读：中途打开就生效', () => {
  let resets = false;
  const nudge = controller(() => 3, () => resets);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  resets = true;
  nudge.prose(who);
  assert.equal(nudge.step(who, false), null);
});

test('新回合或用户插话清零', () => {
  const nudge = controller(() => 3);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, true), null);
  for (let index = 0; index < 2; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
});

test('阈值 0 关闭催办', () => {
  const nudge = controller(() => 0);
  const who = session();
  for (let index = 0; index < 100; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
});

test('阈值现读：改小之后下一步就按新值算', () => {
  let threshold = 8;
  const nudge = controller(() => threshold);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
  threshold = 3;
  assert.ok(nudge.step(who, false) !== null);
});

test('每个 agent 各记各的', () => {
  const nudge = controller(() => 2);
  const first = session();
  const second = session();
  nudge.toolCall(first);
  nudge.toolCall(second);
  assert.equal(nudge.step(first, false), null);
  nudge.toolCall(first);
  assert.ok(nudge.step(first, false) !== null);
  assert.equal(nudge.step(second, false), null);
});

test('关掉的会话满阈值也不催', () => {
  const nudge = controller(() => 3, () => true, () => false);
  const who = session();
  for (let index = 0; index < 10; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null);
});

test('关掉时计数清零：重新打开从零开始，不会一开就催', () => {
  let enabled = true;
  const nudge = controller(() => 3, () => true, () => enabled);
  const who = session();
  for (let index = 0; index < 3; index += 1) nudge.toolCall(who);
  enabled = false;
  assert.equal(nudge.step(who, false), null);
  enabled = true;
  assert.equal(nudge.step(who, false), null, '重新打开时不该立刻催');
  for (let index = 0; index < 2; index += 1) nudge.toolCall(who);
  assert.equal(nudge.step(who, false), null, '重新计数后 2 次还不够');
  nudge.toolCall(who);
  assert.ok(nudge.step(who, false) !== null, '重新计数满 3 次应当催');
});

test('开关按会话各自现读', () => {
  const off = session();
  const on = session();
  const nudge = controller(() => 2, () => true, who => who !== off);
  for (let index = 0; index < 2; index += 1) nudge.toolCall(off);
  for (let index = 0; index < 2; index += 1) nudge.toolCall(on);
  assert.equal(nudge.step(off, false), null, '关掉的会话不催');
  assert.ok(nudge.step(on, false) !== null, '开着的会话照常催');
});

test('散文判定只认非空白的 text 块', () => {
  assert.equal(hasProse([{ type: 'text', text: 'hi' }]), true);
  assert.equal(hasProse([{ type: 'reasoning', text: 'thinking' }]), false);
  assert.equal(hasProse([{ type: 'text', text: '   \n\t' }]), false);
  assert.equal(hasProse([{ type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' }]), false);
  assert.equal(hasProse([{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'hi' }]), true);
});

test('文案随次数变，摘要不超过一行', () => {
  assert.match(renderNudge(12), /12 tool calls/);
  assert.equal(nudgeSummary(12), '12 tool calls without a notify_user update');
  assert.ok(nudgeSummary(12).length <= 120);
});

console.log(`${passed}/${total} passed`);

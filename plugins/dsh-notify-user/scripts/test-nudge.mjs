/**
 * 催办状态机的纯逻辑自检：不碰 cordis、不碰会话，只喂计数与阈值。
 *
 * 跑法：pnpm test / node scripts/test-nudge.mjs
 */
import assert from 'node:assert/strict';

import { createNudgeController, nudgeSummary, renderNudge } from '../src/nudge.ts';

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

/** 一个 agent 的替身：状态机只用它的对象身份。 */
const agent = () => ({});

test('未满阈值不催', () => {
  const controller = createNudgeController(() => 8);
  const who = agent();
  for (let index = 0; index < 7; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
});

test('满阈值催一条，正文带次数与来源标记', () => {
  const controller = createNudgeController(() => 8);
  const who = agent();
  for (let index = 0; index < 8; index += 1) controller.toolCall(who);
  const notice = controller.step(who, false);
  assert.ok(notice !== null);
  assert.equal(notice.source.kind, 'notify-user-nudge');
  assert.equal(notice.source.form, 'notice');
  assert.equal(notice.source.summary, '8 tool calls without a notify_user update');
  assert.match(notice.content[0].text, /8 tool calls without a notify_user update/);
  assert.match(notice.content[0].text, /notify_user/);
});

test('催过就清零，再满阈值才再催', () => {
  const controller = createNudgeController(() => 3);
  const who = agent();
  for (let index = 0; index < 3; index += 1) controller.toolCall(who);
  assert.ok(controller.step(who, false) !== null);
  for (let index = 0; index < 2; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
  controller.toolCall(who);
  assert.ok(controller.step(who, false) !== null);
});

test('汇报清零', () => {
  const controller = createNudgeController(() => 3);
  const who = agent();
  for (let index = 0; index < 3; index += 1) controller.toolCall(who);
  controller.notify(who);
  assert.equal(controller.step(who, false), null);
  for (let index = 0; index < 2; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
});

test('新回合或用户插话清零', () => {
  const controller = createNudgeController(() => 3);
  const who = agent();
  for (let index = 0; index < 3; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, true), null);
  for (let index = 0; index < 2; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
});

test('阈值 0 关闭催办', () => {
  const controller = createNudgeController(() => 0);
  const who = agent();
  for (let index = 0; index < 100; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
});

test('阈值现读：改小之后下一步就按新值算', () => {
  let threshold = 8;
  const controller = createNudgeController(() => threshold);
  const who = agent();
  for (let index = 0; index < 3; index += 1) controller.toolCall(who);
  assert.equal(controller.step(who, false), null);
  threshold = 3;
  assert.ok(controller.step(who, false) !== null);
});

test('每个 agent 各记各的', () => {
  const controller = createNudgeController(() => 2);
  const first = agent();
  const second = agent();
  controller.toolCall(first);
  controller.toolCall(second);
  assert.equal(controller.step(first, false), null);
  controller.toolCall(first);
  assert.ok(controller.step(first, false) !== null);
  assert.equal(controller.step(second, false), null);
});

test('文案随次数变，摘要不超过一行', () => {
  assert.match(renderNudge(12), /12 tool calls/);
  assert.equal(nudgeSummary(12), '12 tool calls without a notify_user update');
  assert.ok(nudgeSummary(12).length <= 120);
});

console.log(`${passed}/${total} passed`);

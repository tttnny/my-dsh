/**
 * 进度卡数据视图的自检：原生 result 的 `meta`、PTC 子调用的 `call.argsRaw`、
 * start 相位的 `argsRaw` 三条来路都要读得出同一份内容。
 *
 * 跑法：pnpm test / node scripts/test-row-model.mjs
 */
import assert from 'node:assert/strict';

import { formatClock, readUpdate, titleOf } from '../src/client/row-model.ts';

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

const args = JSON.stringify({ title: '标题', message: '正文' });

test('原生 result 优先读 meta', () => {
  const update = readUpdate({ meta: { title: 'M', message: 'meta 正文' }, call: { argsRaw: args } });
  assert.deepEqual(update, { title: 'M', message: 'meta 正文' });
});

test('没有 meta 时回退到 call.argsRaw（窗口截断或旧构建）', () => {
  const update = readUpdate({ call: { argsRaw: args } });
  assert.deepEqual(update, { title: '标题', message: '正文' });
});

test('start 相位读 argsRaw', () => {
  const update = readUpdate({ argsRaw: args });
  assert.deepEqual(update, { title: '标题', message: '正文' });
});

test('meta 只有正文、没有标题', () => {
  assert.deepEqual(readUpdate({ meta: { message: '只有正文' } }), { message: '只有正文' });
});

test('空标题当没有', () => {
  assert.deepEqual(readUpdate({ meta: { title: '', message: '正文' } }), { message: '正文' });
});

test('坏 JSON 不抛，给空正文', () => {
  assert.deepEqual(readUpdate({ argsRaw: '{"title":' }), { message: '' });
  assert.deepEqual(readUpdate({}), { message: '' });
  assert.deepEqual(readUpdate(null), { message: '' });
});

test('标题优先，其次正文首行，最后兜底', () => {
  assert.equal(titleOf({ title: '模型给的', message: '正文首行\n第二行' }, '更新'), '模型给的');
  assert.equal(titleOf({ message: '\n  正文首行  \n第二行' }, '更新'), '正文首行');
  assert.equal(titleOf({ message: '   ' }, '更新'), '更新');
});

test('正文首行过长时截断到 60 字以内', () => {
  const long = '一'.repeat(200);
  const title = titleOf({ message: long }, '更新');
  assert.ok(title.length <= 60);
  assert.ok(title.endsWith('…'));
});

test('时间格式是 MM-DD HH:mm，缺省给 null', () => {
  const stamp = new Date(2026, 9, 28, 18, 47).getTime();
  assert.equal(formatClock(stamp), '10-28 18:47');
  assert.equal(formatClock(undefined), null);
  assert.equal(formatClock('x'), null);
});

console.log(`${passed}/${total} passed`);

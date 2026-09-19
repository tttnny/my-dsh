// 推荐标记归一化的回归测试。
//
// 判断「徽标是否渲染」的代码不在本仓库，而在 DSH 安装副本的
// @deepseek-ai/dsh-client-ui-user-questions/lib/client.js 里（函数
// parseRecommendedLabel）。它的规则只有一条：label 必须以半角或全角的
// 括号推荐字样收尾。规则抄在 recommended-label-rule.mjs；scripts/smoke-host.mjs
// 断言那份抄本与安装副本逐字相同，上游一改就当场失败，而不是测试继续通过、
// 徽标实际不再渲染。
import assert from 'node:assert/strict';
import { normalizeOption } from '../lib/recommendation.js';
import { CLIENT_ACCEPTS } from './recommended-label-rule.mjs';

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// 真实数据：会话 21cf7596 Q2 的 A 选项。模型把推荐写成了 description 末尾的「；推荐」。
const REAL = { label: 'A：从侧边栏移走', description: '只保留输入框下面这一个；推荐' };

test('真实会话数据：description 末尾的「；推荐」搬到 label 末尾', () => {
  const out = normalizeOption(REAL);
  assert.equal(out.recommended, true);
  assert.equal(out.label, 'A：从侧边栏移走（推荐）');
  assert.equal(out.description, '只保留输入框下面这一个');
  assert.equal(out.originalLabel, 'A：从侧边栏移走');
});

test('没有推荐字样时原样返回', () => {
  const out = normalizeOption({ label: 'B：两处都保留', description: '侧边栏底部与输入框下面各一个入口' });
  assert.equal(out.recommended, false);
  assert.equal(out.label, 'B：两处都保留');
  assert.equal(out.description, '侧边栏底部与输入框下面各一个入口');
});

test('label 末尾已经是客户端写法：剥掉再补一次，不重复', () => {
  for (const label of ['A：xxx（推荐）', 'A：xxx (Recommended)', 'A：xxx (recommended)', 'A：xxx（recommended）']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, true, label);
    assert.equal(out.label, 'A：xxx（推荐）', label);
  }
});

test('label 末尾无括号但带分隔符：认', () => {
  for (const label of ['A：xxx；推荐', 'A：xxx - 推荐', 'A：xxx，推荐', 'A：xxx: 推荐']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, true, label);
    assert.equal(out.label, 'A：xxx（推荐）', label);
  }
});

test('其他括号形式：认', () => {
  for (const label of ['A：xxx【推荐】', 'A：xxx[推荐]', 'A：xxx【Recommended】']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, true, label);
    assert.equal(out.label, 'A：xxx（推荐）', label);
  }
});

test('正常以「推荐」收尾的文字：不认（防误判）', () => {
  for (const option of [
    { label: '查看推荐' },
    { label: '参考推荐', description: '这个不推荐' },
    { label: '推荐' },
    { label: 'A：xxx', description: '你可以自行决定是否推荐' },
  ]) {
    const out = normalizeOption(option);
    assert.equal(out.recommended, false, JSON.stringify(option));
    assert.equal(out.label, option.label, JSON.stringify(option));
    assert.equal(out.description, option.description, JSON.stringify(option));
  }
});

test('标记后还有句末标点：一起清掉', () => {
  const out = normalizeOption({ label: 'A：xxx', description: '沿用现在的锚定逻辑；推荐。' });
  assert.equal(out.recommended, true);
  assert.equal(out.description, '沿用现在的锚定逻辑');
  assert.equal(out.label, 'A：xxx（推荐）');
});

test('显式 recommended 字段：label 补后缀，说明不动', () => {
  const out = normalizeOption({ label: 'A：xxx', description: '说明文字', recommended: true });
  assert.equal(out.recommended, true);
  assert.equal(out.label, 'A：xxx（推荐）');
  assert.equal(out.description, '说明文字');
});

test('字段与文字同时给：只补一次后缀', () => {
  const out = normalizeOption({ label: 'A：xxx；推荐', description: '说明文字', recommended: true });
  assert.equal(out.recommended, true);
  assert.equal(out.label, 'A：xxx（推荐）');
  assert.equal(out.description, '说明文字');
});

test('凡判定为推荐的，产出的 label 一定被客户端规则接受', () => {
  const options = [
    REAL,
    { label: 'A：xxx（推荐）' },
    { label: 'A：xxx；推荐' },
    { label: 'A：xxx【推荐】' },
    { label: 'A：xxx', recommended: true },
    { label: 'A：xxx', description: '文字；推荐' },
  ];
  for (const option of options) {
    const out = normalizeOption(option);
    assert.equal(out.recommended, true, JSON.stringify(option));
    assert.ok(CLIENT_ACCEPTS.test(out.label), `客户端不认 ${JSON.stringify(out.label)}`);
  }
});

test('label 里标记不在末尾：不动（不猜）', () => {
  const out = normalizeOption({ label: 'A：xxx；推荐 只保留一个' });
  assert.equal(out.recommended, false);
  assert.equal(out.label, 'A：xxx；推荐 只保留一个');
});

console.log(`${passed}/${total} passed`);

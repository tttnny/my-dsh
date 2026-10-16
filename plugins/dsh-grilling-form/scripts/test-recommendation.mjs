// 推荐标记识别的回归测试。
//
// 识别只做两件事：认出末尾的推荐标记，以及把它从选项文字里剥掉。剥掉之后的文字就是**选项身份**
// ——宿主按它查同一题里的同文选项，界面按它渲染、存勾选、画徽标，导入文本按它写回。
// 规则只此一份，界面不再依赖任何官方判定函数。
import assert from 'node:assert/strict';
import { normalizeOption } from '../src/recommendation.js';

// 逐条跑、末尾汇总：一条失败不打断后面的，一次把所有红的都报出来（退出码在末尾给）。
let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failures.push(name);
  }
}

test('末尾带「（推荐）」：认出来，并把标记从文字里剥掉', () => {
  const out = normalizeOption({ label: 'A：从侧边栏移走（推荐）' });
  assert.equal(out.recommended, true);
  assert.equal(out.label, 'A：从侧边栏移走');
});

test('没有推荐字样时原样返回', () => {
  const out = normalizeOption({ label: 'B：两处都保留' });
  assert.equal(out.recommended, false);
  assert.equal(out.label, 'B：两处都保留');
});

test('英文写法与别的括号形式都认', () => {
  for (const label of ['A：xxx (Recommended)', 'A：xxx（recommended）', 'A：xxx【推荐】', 'A：xxx[推荐]', 'A：xxx【Recommended】']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, true, label);
    assert.equal(out.label, 'A：xxx', label);
  }
});

test('末尾无括号但带分隔符：认', () => {
  for (const label of ['A：xxx；推荐', 'A：xxx - 推荐', 'A：xxx，推荐', 'A：xxx: 推荐']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, true, label);
    assert.equal(out.label, 'A：xxx', label);
  }
});

test('标记后还有句末标点：一起清掉', () => {
  const out = normalizeOption({ label: 'A：xxx（推荐）。' });
  assert.equal(out.recommended, true);
  assert.equal(out.label, 'A：xxx');
});

test('正常以「推荐」收尾的文字：不认（防误判）', () => {
  for (const label of ['查看推荐', '参考推荐', '推荐', 'A：xxx；推荐 只保留一个']) {
    const out = normalizeOption({ label });
    assert.equal(out.recommended, false, label);
    assert.equal(out.label, label, label);
  }
});

test('两段只差推荐标记的文字归一化之后是同一个身份（回填不会落到另一项上）', () => {
  // 一个叫「甲」、一个叫「甲（推荐）」：两边都收成「甲」，宿主于是按同文选项把这一轮拒掉。
  // 绝不会出现两个界面上一样、身份却不同的选项——那样用户勾的那一项会在回填时落到另一项上。
  assert.equal(normalizeOption({ label: '甲（推荐）' }).label, normalizeOption({ label: '甲' }).label);
});

test('label 不是字符串：不抛，收成空 label（由入参校验拒掉，不是让整轮以「工具坏了」收场）', () => {
  for (const label of [5, {}, null, undefined, ['A']]) {
    const out = normalizeOption({ label });
    assert.equal(out.label, '', JSON.stringify(label));
    assert.equal(out.recommended, false, JSON.stringify(label));
  }
  for (const option of [null, undefined, 'x', 42]) {
    const out = normalizeOption(option);
    assert.equal(out.label, '', JSON.stringify(option));
    assert.equal(out.recommended, false, JSON.stringify(option));
  }
});

console.log(`${passed}/${passed + failures.length} passed`);
if (failures.length > 0) process.exitCode = 1;

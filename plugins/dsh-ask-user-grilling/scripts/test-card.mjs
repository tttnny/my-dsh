// 卡面模型的单测：把线上那两份 JSON 翻成卡片结构的每一步，含官方卡配不上的两种情形
// （轮末补充题不在 argsRaw 里、detail 不在官方取数范围内）。
//
// 这里是纯函数，直接 import src/ 下的源码；宿主半边的同一份拼法由 scripts/smoke-host.mjs 断言。
import assert from 'node:assert/strict';
import { readAskCard } from '../src/card.js';
import { ROUND_END_QUESTION, isBlank, mergeNumberIntoHeader } from '../src/contract.js';

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

const args = (questions) => JSON.stringify({ questions });
const result = (answers) => JSON.stringify({ answers });

// --- 共用契约 ---

test('题号并入标题：两者都给拼成 "Q2 · Deadline"', () => {
  assert.equal(mergeNumberIntoHeader('Q2', 'Deadline'), 'Q2 · Deadline');
});

test('题号并入标题：标题已带该题号时不重复前缀', () => {
  assert.equal(mergeNumberIntoHeader('Q2', 'Q2 · Deadline'), 'Q2 · Deadline');
});

test('题号并入标题：只给一个就是那一个，都不给是空串', () => {
  assert.equal(mergeNumberIntoHeader('Q3', undefined), 'Q3');
  assert.equal(mergeNumberIntoHeader(undefined, 'Confirm'), 'Confirm');
  assert.equal(mergeNumberIntoHeader(undefined, undefined), '');
  assert.equal(mergeNumberIntoHeader('Q3', '   '), 'Q3');
});

test('空白判定：非字符串、空串、纯空白都算空', () => {
  for (const value of [undefined, null, 42, '', '  \n']) assert.equal(isBlank(value), true, String(value));
  assert.equal(isBlank('x'), false);
});

// --- 卡片模型 ---

test('运行中：结果还没有，argsRaw 解析得出来就画题目，补充题一起列出', () => {
  const model = readAskCard({ argsRaw: args([{ id: 'a', question: '选哪个？', number: 'Q2', header: 'Deadline' }]) });
  assert.equal(model.state, 'running');
  assert.equal(model.total, 2);
  assert.equal(model.questions[0].header, 'Q2 · Deadline');
  assert.deepEqual(model.questions[0].answers, []);
  assert.equal(model.questions[1].id, ROUND_END_QUESTION.id);
});

test('运行中：argsRaw 是半截 JSON 时不给题目（界面退回原始文本）', () => {
  const model = readAskCard({ argsRaw: '{"questions":[{"id":"a","quest' });
  assert.equal(model.state, 'running');
  assert.deepEqual(model.questions, []);
});

test('已作答：详情回合——模型一道题，结果里多一条轮末补充题', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'h1', question: 'Host 权威层怎么改？', detail: '第一段。\n\n第二段。' }]),
    resultText: result([
      { id: 'h1', selected: ['A: 扩展 /archive/guardCheck'] },
      { id: ROUND_END_QUESTION.id, selected: ['无需补充'] },
    ]),
  });
  assert.equal(model.state, 'answered');
  assert.equal(model.total, 2);
  assert.equal(model.answered, 2);
  assert.equal(model.questions[0].detail, '第一段。\n\n第二段。');
  assert.deepEqual(model.questions[0].answers, ['A: 扩展 /archive/guardCheck']);
  const supplement = model.questions[1];
  assert.equal(supplement.supplement, true);
  assert.equal(supplement.id, ROUND_END_QUESTION.id);
  assert.equal(supplement.question, ROUND_END_QUESTION.question);
  assert.deepEqual(supplement.answers, ['无需补充']);
});

test('已作答：自由文本接在选中项后面', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }]),
    resultText: result([{ id: 'a', selected: ['A'], custom: '自定义' }]),
  });
  assert.deepEqual(model.questions[0].answers, ['A', '自定义']);
  assert.equal(model.answered, 1);
});

test('已作答：一道题都没答时算未回答', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }, { id: 'b', question: '？' }]),
    resultText: result([{ id: 'a', selected: [] }, { id: 'b', selected: [] }]),
  });
  assert.equal(model.total, 2);
  assert.equal(model.answered, 0);
});

test('已作答：结果里的 id 在 argsRaw 里找不到时另列，不吞掉', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }]),
    resultText: result([{ id: 'a', selected: ['A'] }, { id: 'mystery', selected: ['B'] }]),
  });
  const mystery = model.questions.find((question) => question.id === 'mystery');
  assert.equal(mystery.supplement, true);
  assert.equal(mystery.question, 'mystery');
});

test('被拒：给违规清单与错误说明，且不补轮末补充题（这一轮根本没问）', () => {
  const model = readAskCard({
    argsRaw: args([{ id: '__grill_sneak__', question: '？' }]),
    resultText: JSON.stringify({
      rejected: true,
      violations: ['Question 1 (id "__grill_sneak__") uses the reserved prefix'],
      error: '1 violation(s) in this round',
      answers: [],
    }),
  });
  assert.equal(model.state, 'rejected');
  assert.equal(model.violations.length, 1);
  assert.match(model.error, /violation/);
  assert.equal(model.questions.some((question) => question.supplement), false);
});

test('已取消：给出说明与题目，轮末补充题也在（它进过表单）', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }]),
    errorCode: 'ASK_CANCELLED',
  });
  assert.equal(model.state, 'cancelled');
  assert.equal(model.total, 2);
  assert.equal(model.questions.at(-1).id, ROUND_END_QUESTION.id);
  assert.deepEqual(model.questions.at(-1).answers, []);
});

test('已中断：状态与取消分开', () => {
  const model = readAskCard({ argsRaw: args([{ id: 'a', question: '？' }]), errorCode: 'ASK_ABORTED' });
  assert.equal(model.state, 'interrupted');
});

test('调用失败：结果形状不认识且标记失败时按失败处理，且不补补充题（没走到表单）', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }]),
    resultText: 'Error: boom',
    failed: true,
  });
  assert.equal(model.state, 'error');
  assert.equal(model.total, 1);
});

test('结果形状不认识但没标记失败：也算失败，不假装运行中', () => {
  const model = readAskCard({ argsRaw: args([{ id: 'a', question: '？' }]), resultText: '{}' });
  assert.equal(model.state, 'error');
  assert.equal(model.total, 1);
});

test('id 重复时不给题目：按 id 配对无从谈起，答案只能按 id 单列', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'dup', question: '甲？' }, { id: 'dup', question: '乙？' }]),
    resultText: result([{ id: 'dup', selected: ['A'] }]),
  });
  assert.equal(model.state, 'answered');
  assert.deepEqual(model.questions.map((question) => question.question), ['dup']);
  assert.deepEqual(model.questions[0].answers, ['A']);
});

test('答案里混进非字符串：过滤掉，不把对象画到界面上', () => {
  const model = readAskCard({
    argsRaw: args([{ id: 'a', question: '？' }]),
    resultText: JSON.stringify({ answers: [{ id: 'a', selected: ['A', 7, null] }] }),
  });
  assert.deepEqual(model.questions[0].answers, ['A']);
});

console.log(`${passed}/${total} passed`);

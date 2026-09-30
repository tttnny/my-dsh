// 共用纯模型的单测：题面取数、入参校验、导入文本与导入块、只读判定、未导入提醒、会话持久化。
//
// 这里是纯函数，直接 import src/ 下的源码（storage 由假件传进去，不碰真 localStorage）。
// 宿主半边走真内核的那一条链由 scripts/smoke-host.mjs 断言，视图由 scripts/test-render.mjs 断言。
import assert from 'node:assert/strict';
import {
  IMPORT_BLOCK_END,
  IMPORT_BLOCK_START,
  answerLines,
  answerParts,
  applyImport,
  formStorageKey,
  importBody,
  importStale,
  isBlank,
  isReadOnlyAfter,
  mergeNumberIntoHeader,
  readFormModel,
  readStoredForm,
  titleOf,
  validateRound,
  writeStoredForm,
} from '../src/form-model.js';

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
const pending = JSON.stringify({ pending: true, message: 'form shown' });
const call = (overrides = {}) => ({ id: 'a', question: '选哪个？', ...overrides });

/** 只有 getItem/setItem 的假存储。 */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    dump: () => Object.fromEntries(map),
  };
}

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

test('一题的标题：题号并入的标题优先，其次题干，最后 id', () => {
  assert.equal(titleOf({ id: 'a', header: 'Q2 · Deadline', question: '选哪个？' }), 'Q2 · Deadline');
  assert.equal(titleOf({ id: 'a', header: '', question: '选哪个？' }), '选哪个？');
  assert.equal(titleOf({ id: 'a', header: '', question: '' }), 'a');
});

// --- 取数 ---

test('结果还没落库：状态是运行中，题面已能从 argsRaw 读出来', () => {
  const model = readFormModel({ argsRaw: args([call({ number: 'Q2', header: 'Deadline' })]) });
  assert.equal(model.state, 'running');
  assert.equal(model.questions.length, 1);
  assert.equal(model.questions[0].header, 'Q2 · Deadline');
  assert.equal(model.questions[0].question, '选哪个？');
});

test('结果还没落库：argsRaw 是半截 JSON 时不给题目（界面退回原始文本）', () => {
  const model = readFormModel({ argsRaw: '{"questions":[{"id":"a","quest' });
  assert.equal(model.state, 'running');
  assert.deepEqual(model.questions, []);
});

test('pending 结果：状态是表单，题面完整（表单已投出、本轮已结束）', () => {
  const model = readFormModel({ argsRaw: args([call()]), resultText: pending });
  assert.equal(model.state, 'form');
  assert.equal(model.questions.length, 1);
  assert.deepEqual(model.violations, []);
});

test('被拒结果：状态是被拒，带违规清单与总说明', () => {
  const model = readFormModel({
    argsRaw: args([call()]),
    resultText: JSON.stringify({ rejected: true, violations: ['Question 1 有问题'], error: '1 violation(s)' }),
  });
  assert.equal(model.state, 'rejected');
  assert.deepEqual(model.violations, ['Question 1 有问题']);
  assert.equal(model.error, '1 violation(s)');
});

test('结果形状不认识：状态是调用失败，题面还在', () => {
  assert.equal(readFormModel({ argsRaw: args([call()]), resultText: 'boom' }).state, 'error');
  assert.equal(readFormModel({ argsRaw: args([call()]), resultText: JSON.stringify({ answers: [] }) }).state, 'error');
  assert.equal(readFormModel({ argsRaw: args([call()]), resultText: '', failed: true }).state, 'error');
});

test('detail 与选项：detail 空白即省略，选项归一化成展示文字与推荐标记', () => {
  const model = readFormModel({
    argsRaw: args([call({
      detail: '第一段。\n\n第二段。',
      options: [
        { label: 'A：移走', description: '只留一个；推荐' },
        { label: 'B：都留' },
        { label: 'C：先观察', recommended: true },
        { label: '  ' },
      ],
    })]),
  });
  const [question] = model.questions;
  assert.equal(question.detail, '第一段。\n\n第二段。');
  assert.equal(question.options[0].label, 'A：移走（推荐）');
  assert.equal(question.options[0].displayLabel, 'A：移走');
  assert.equal(question.options[0].description, '只留一个');
  assert.equal(question.options[0].recommended, true);
  assert.equal(question.options[1].label, 'B：都留');
  assert.equal(question.options[1].recommended, false);
  assert.equal(question.options[2].displayLabel, 'C：先观察');
  // 空白 label 在这里不是特例：它是宿主的入参校验拦下的（validateRound），界面拿不到这种轮次
  assert.equal(question.options[3].label, '  ');
  assert.equal(readFormModel({ argsRaw: args([call({ detail: '   ' })]) }).questions[0].detail, undefined);
});

test('同一轮里 id 重复：题面整体作废（界面按 id 配对，重复即无从配对）', () => {
  const model = readFormModel({ argsRaw: args([call(), call()]) });
  assert.deepEqual(model.questions, []);
});

// --- 入参校验 ---

test('入参校验：干净的一轮没有违规', () => {
  assert.deepEqual(validateRound([call({ options: [{ label: 'A' }, { label: 'B' }] })]), []);
  assert.deepEqual(validateRound([call()]), []);
});

test('入参校验：重复 id 被拒', () => {
  const violations = validateRound([call(), call()]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /repeats an id/);
});

test('入参校验：空题干被拒', () => {
  const violations = validateRound([call({ question: '   ' })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /empty question text/);
});

test('入参校验：空 label 被拒', () => {
  const violations = validateRound([call({ options: [{ label: ' ' }] })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /option 1 has an empty label/);
});

test('入参校验：同题两个选项归一化后同名被拒（界面按 label 认选项）', () => {
  const violations = validateRound([call({ options: [{ label: 'A：移走；推荐' }, { label: 'A：移走（推荐）' }] })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /same label "A：移走（推荐）"/);
});

test('入参校验：不再有保留前缀这条规则，__grill_ 前缀的 id 是普通 id', () => {
  assert.deepEqual(validateRound([call({ id: '__grill_whatever__' })]), []);
});

// --- 导入文本 ---

test('导入文本：逐题一行「标题：选的项、自填的字」，只含有作答的题', () => {
  const questions = [
    { id: 'a', header: 'Q2 · Deadline', question: '选哪个？', options: [{ label: 'A：移走（推荐）', displayLabel: 'A：移走' }, { label: 'B：都留', displayLabel: 'B：都留' }] },
    { id: 'b', header: '', question: '范围？', options: [] },
    { id: 'c', header: '', question: '没答的题', options: [] },
  ];
  const answers = {
    a: { selected: ['A：移走（推荐）'], custom: '' },
    b: { selected: [], custom: ' 两句都不够，我自己说：只改插件 ' },
    c: { selected: [], custom: '   ' },
  };
  assert.equal(
    importBody(questions, answers),
    'Q2 · Deadline：A：移走\n范围？：两句都不够，我自己说：只改插件',
  );
});

test('导入文本：推荐后缀不进答案', () => {
  const questions = [{ id: 'a', header: '', question: '？', options: [{ label: 'A：xxx（推荐）', displayLabel: 'A：xxx' }] }];
  assert.equal(importBody(questions, { a: { selected: ['A：xxx（推荐）'], custom: '' } }), '？：A：xxx');
});

test('导入文本：一项都没作答时是空串', () => {
  const questions = [{ id: 'a', header: '', question: '？', options: [] }];
  assert.equal(importBody(questions, {}), '');
  assert.equal(importBody(questions, { a: { selected: [], custom: '' } }), '');
});

// --- 导入块 ---

const questions = [{ id: 'a', header: 'Q2 · Deadline', question: '选哪个？', options: [] }];
const bodyOf = (custom) => importBody(questions, { a: { selected: [], custom } });

test('首次导入：块放在最前面，用户原有的文字整段接在后面', () => {
  const draft = applyImport('我另外想说一句。', bodyOf('选 A'));
  assert.equal(
    draft,
    `${IMPORT_BLOCK_START}\nQ2 · Deadline：选 A\n${IMPORT_BLOCK_END}\n\n我另外想说一句。`,
  );
});

test('空草稿：只有一个块，没有多余空行', () => {
  assert.equal(applyImport('', bodyOf('选 A')), `${IMPORT_BLOCK_START}\nQ2 · Deadline：选 A\n${IMPORT_BLOCK_END}`);
});

test('重复导入：原地替换块本身，块外手打的内容一个不动', () => {
  const first = applyImport('前面的话。', bodyOf('选 A'));
  const second = applyImport(first, bodyOf('改选 B'));
  assert.equal(second, applyImport('前面的话。', bodyOf('改选 B')));
  assert.match(second, /^【盘问作答】/);
  assert.match(second, /Q2 · Deadline：改选 B/);
  assert.doesNotMatch(second, /选 A/);
  assert.equal(second.slice(-'前面的话。'.length), '前面的话。');
});

test('用户手改过块内的字：以表单为准覆盖', () => {
  const first = applyImport('', bodyOf('选 A'));
  const edited = first.replace('选 A', '我自己乱改的');
  assert.equal(applyImport(edited, bodyOf('选 A')), first);
});

test('未导入提醒：草稿里没有块就是提醒，块与作答一致就不提醒', () => {
  const body = bodyOf('选 A');
  assert.equal(importStale('', body), true);
  assert.equal(importStale('我打了一句别的', body), true);
  assert.equal(importStale(applyImport('', body), body), false);
  assert.equal(importStale('我打了一句别的', body), true);
});

test('未导入提醒：导入之后又改了表单，重新提醒', () => {
  const draft = applyImport('', bodyOf('选 A'));
  assert.equal(importStale(draft, bodyOf('选 B')), true);
  assert.equal(importStale(draft, bodyOf('选 A')), false);
});

test('未导入提醒：只起止行不配对时按没有块处理', () => {
  assert.equal(importStale(`${IMPORT_BLOCK_START}\n没写完`, bodyOf('选 A')), true);
  assert.equal(importStale(`没头\n${IMPORT_BLOCK_END}`, bodyOf('选 A')), true);
});

test('未导入提醒：表单里什么都没有时不提醒', () => {
  assert.equal(importStale('随便什么草稿', ''), false);
});

test('导入：作答题为空时原样返回草稿', () => {
  assert.equal(applyImport('原样', ''), '原样');
});

// --- 只读判定 ---

test('只读判定：这条调用之后出现用户发言（user 或 steering）才转只读', () => {
  const nodes = [
    { kind: 'tool-result', callId: 'call-1', seq: 5 },
    { kind: 'user', seq: 9 },
  ];
  assert.equal(isReadOnlyAfter(nodes, 'call-1'), true);
  assert.equal(isReadOnlyAfter([...nodes, { kind: 'steering', seq: 12 }], 'call-1'), true);
  assert.equal(isReadOnlyAfter([{ kind: 'user', seq: 3 }, { kind: 'tool-result', callId: 'call-1', seq: 5 }], 'call-1'), false);
  assert.equal(isReadOnlyAfter([{ kind: 'assistant', seq: 7 }, { kind: 'tool-result', callId: 'call-1', seq: 5 }], 'call-1'), false);
});

test('只读判定：认不出这条调用、或还拿不到记录时一律不转只读', () => {
  assert.equal(isReadOnlyAfter([{ kind: 'user', seq: 9 }], 'call-1'), false);
  assert.equal(isReadOnlyAfter(undefined, 'call-1'), false);
  assert.equal(isReadOnlyAfter([{ kind: 'tool-result', callId: 'call-1', seq: 5 }], undefined), false);
});

// --- 持久化 ---

test('会话键：按会话分一份', () => {
  assert.equal(formStorageKey('sess-1'), 'dsh-grilling-form.sess-1');
  assert.equal(formStorageKey(''), 'dsh-grilling-form.unknown-session');
});

test('持久化：写进去读得回来，同一个会话里别的轮次互不影响', () => {
  const storage = fakeStorage();
  const key = formStorageKey('sess-1');
  writeStoredForm(storage, key, 'call-1', { a: { selected: ['A（推荐）'], custom: '自填' } });
  writeStoredForm(storage, key, 'call-2', { b: { selected: [], custom: '只自填' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { a: { selected: ['A（推荐）'], custom: '自填' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-2'), { b: { selected: [], custom: '只自填' } });
  assert.deepEqual(readStoredForm(storage, formStorageKey('sess-2'), 'call-1'), {});
});

test('持久化：读回来的脏数据被清掉，坏 JSON 与缺存储都只是「什么都没选」', () => {
  const key = formStorageKey('sess-1');
  const storage = fakeStorage({ [key]: JSON.stringify({ 'call-1': { a: { selected: [1, 'A'], custom: 7 }, b: 'x', c: { selected: [], custom: '' } } }) });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { a: { selected: ['A'], custom: '' } });
  assert.deepEqual(readStoredForm(fakeStorage({ [key]: '{ 坏 JSON' }), key, 'call-1'), {});
  assert.deepEqual(readStoredForm(undefined, key, 'call-1'), {});
});

test('持久化：storage 写不进去（配额/隐私模式）时不抛', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  writeStoredForm(storage, formStorageKey('s'), 'call-1', { a: { selected: ['A'], custom: '' } });
});

test('作答展示：选中的项换回不带后缀的文字', () => {
  const question = { id: 'a', options: [{ label: 'A：xxx（推荐）', displayLabel: 'A：xxx' }] };
  assert.deepEqual(answerParts(question, { selected: ['A：xxx（推荐）'], custom: ' 自填 ' }), { selected: ['A：xxx'], custom: '自填' });
  assert.deepEqual(answerParts(question, undefined), { selected: [], custom: '' });
});

test('作答逐行展开：选中的项在前、自填的字在后，导入文本与只读展示共用这一份', () => {
  const question = { id: 'a', options: [{ label: 'A：xxx（推荐）', displayLabel: 'A：xxx' }, { label: 'B：yyy', displayLabel: 'B：yyy' }] };
  assert.deepEqual(answerLines(question, { selected: ['A：xxx（推荐）', 'B：yyy'], custom: ' 补一句 ' }), ['A：xxx', 'B：yyy', '补一句']);
  assert.deepEqual(answerLines(question, { selected: [], custom: '   ' }), []);
  assert.deepEqual(answerLines(question, undefined), []);
  // 导入文本就是它的逐行拼接：一处改了行序或取舍，两处一起变
  assert.equal(
    importBody([{ ...question, header: 'Q1', question: '？' }], { a: { selected: ['B：yyy'], custom: '补一句' } }),
    'Q1：B：yyy、补一句',
  );
});

console.log(`${passed}/${total} passed`);

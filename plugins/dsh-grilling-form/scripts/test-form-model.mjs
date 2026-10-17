// 共用纯模型的单测：题面取数、入参校验、作答块协议（身份记号、题号、空块）、本轮那次调用的定位、
// 作答块到达的判定、被后面那张取代的判定、冻结那份作答、闸门折叠、会话持久化。
//
// 这里是纯函数，直接 import src/ 下的源码（storage 由假件传进去，不碰真 localStorage）。
// 宿主半边走真内核与真会话投影的那一条链由 scripts/smoke-host.mjs 断言，视图由 scripts/test-render.mjs 断言。
import assert from 'node:assert/strict';
import {
  FORM_GATE_UNIT,
  GATE_KEY,
  TOOL_NAME,
  answerItems,
  applyImport,
  applyRecommendedDefaults,
  carryImport,
  carryOverAnswers,
  draftHasBody,
  drawsForm,
  drawsNote,
  foldFormGate,
  formReplyAfter,
  formStorageKey,
  frozenFormAnswers,
  importBlockBody,
  importBlockStart,
  importBody,
  initialFormGate,
  isBlank,
  messageText,
  parseImportedAnswersResult,
  pendingFormOf,
  readFormModel,
  readQuestions,
  readStoredForm,
  replacedForm,
  replacesEarlier,
  roundCall,
  shortFormId,
  supersededAfter,
  selectsOnClick,
  validateRound,
  writeStoredForm,
} from '../src/form-model.js';

/**
 * 逐条跑、末尾汇总：**一条失败不打断后面的**，一次把所有红的都报出来（退出码在文件末尾按失败数给）。
 */
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

const args = (questions) => JSON.stringify({ questions });
const shown = JSON.stringify({ ok: true, message: 'form shown' });
const hidden = JSON.stringify({ ok: false, message: 'no form' });
/** 一题的入参。缺省没有题型：那正是「漏写题型」那条兜底要盖住的形状。 */
const call = (overrides = {}) => ({ question: '选哪个？', ...overrides });

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

test('空白判定：非字符串、空串、纯空白都算空', () => {
  for (const value of [undefined, null, 42, '', '  \n']) assert.equal(isBlank(value), true, String(value));
  assert.equal(isBlank('x'), false);
});

test('身份记号：调用 id 里的 4 位小写字母数字，同一个 id 每次都给同一个记号', () => {
  const mark = shortFormId('call_AbC12345');
  assert.match(mark, /^[0-9a-z]{4}$/);
  assert.equal(shortFormId('call_AbC12345'), mark);
  assert.notEqual(shortFormId('call-aaaa'), shortFormId('call-bbbb'));
  assert.match(shortFormId(undefined), /^[0-9a-z]{4}$/, 'id 读不出来也要给得出一个记号');
});

test('作答块的起止行：开头那行带这张表的身份记号，收尾行就是它自己', () => {
  assert.equal(importBlockStart('k3f9'), '【拷问作答 k3f9】');
});

// --- 取数 ---

test('题面取数：题号由题序生成（从 1 起），题干、题型、选项都在', () => {
  const questions = readQuestions(args([
    call({ type: 'single', question: '继续吗？', options: [{ label: '继续' }] }),
    call({ question: '还有别的吗？' }),
  ]));
  assert.deepEqual(questions.map((question) => question.number), [1, 2]);
  assert.deepEqual(questions.map((question) => question.id), ['1', '2']);
  assert.deepEqual(questions.map((question) => question.question), ['继续吗？', '还有别的吗？']);
  assert.equal(questions[0].type, 'single');
});

test('题型漏写：有选项按多选、没选项按自由（模型漏一个字段不该整轮被拒）', () => {
  assert.equal(readQuestions(args([call({ options: [{ label: '甲' }] })]))[0].type, 'multi');
  assert.equal(readQuestions(args([call()]))[0].type, 'free');
  assert.equal(readQuestions(args([call({ type: 'single', options: [{ label: '甲' }] })]))[0].type, 'single');
  // 认不出的题型值也走同一条兜底，不留一题画不出来
  assert.equal(readQuestions(args([call({ type: 'checkbox', options: [{ label: '甲' }] })]))[0].type, 'multi');
});

test('选项：推荐标记剥掉之后就是选项身份，推荐另记一个布尔', () => {
  const [question] = readQuestions(args([call({
    options: [{ label: 'A：移走（推荐）' }, { label: 'B：都留' }, { label: '  ' }],
  })]));
  assert.equal(question.options[0].label, 'A：移走');
  assert.equal(question.options[0].recommended, true);
  assert.equal(question.options[1].label, 'B：都留');
  assert.equal(question.options[1].recommended, false);
  // 空白 label 在这里不是特例：它是入参校验拦下的（validateRound），界面拿不到这种轮次
  assert.equal(question.options[2].label, '  ');
});

test('选项上多带的字段不进模型：recommended 与 description 都只当没写', () => {
  const [question] = readQuestions(args([call({
    options: [{ label: '甲', recommended: true, description: '说明' }],
  })]));
  assert.deepEqual(question.options, [{ label: '甲', recommended: false }]);
});

test('题目 detail：去掉首尾空白；没写、空白、不是字符串时没有这个键', () => {
  const [question] = readQuestions(args([call({ detail: '  这句话解释这题问什么  ' })]));
  assert.equal(question.detail, '这句话解释这题问什么');
  for (const detail of [undefined, '', '   ', 5, {}, ['x']]) {
    const [one] = readQuestions(args([call({ detail })]));
    assert.equal('detail' in one, false, JSON.stringify(detail));
  }
});

test('题目 detail 不参与身份：取代时题干一字不差但 detail 改了照样搬勾选', () => {
  const old = [{ id: '1', number: 1, question: '同一句话？', detail: '旧说明', type: 'multi', options: [] }];
  const next = [{ id: '1', number: 1, question: '同一句话？', detail: '新说明', type: 'multi', options: [] }];
  const carried = carryOverAnswers(old, next, { 1: { selected: [], custom: '旧表填的' } });
  assert.equal(carried['1']?.custom, '旧表填的');
});

test('detail 为空不影响入参校验：只有题干与选项文字那三条会拒', () => {
  assert.deepEqual(validateRound([{ question: '问？', detail: '   ', options: [{ label: '甲', detail: '' }] }]), []);
  assert.equal(validateRound([{ question: '问？', options: [{ label: '甲' }, { label: '甲', detail: '不一样' }] }]).length, 1,
    '同文选项照旧被拒：detail 不参与身份');
});

test('题面读不出来：半截 JSON、没有 questions、空数组、某题不是对象都当没有这一轮', () => {
  assert.deepEqual(readQuestions('{"questions":[{"quest'), []);
  assert.deepEqual(readQuestions('{}'), []);
  assert.deepEqual(readQuestions(args([])), []);
  assert.deepEqual(readQuestions(args([call(), null])), [], '一题坏了整轮不画，而不是把它当成一道空题');
  assert.deepEqual(readQuestions(undefined), []);
});

test('replace 标记读得出，缺省是不取代', () => {
  assert.equal(replacesEarlier(JSON.stringify({ questions: [call()], replace: true })), true);
  assert.equal(replacesEarlier(args([call()])), false);
  assert.equal(replacesEarlier(JSON.stringify({ questions: [call()], replace: 'yes' })), false);
});

// --- 入参校验 ---

test('入参校验：干净的一轮没有违规', () => {
  assert.deepEqual(validateRound([call({ options: [{ label: 'A' }, { label: 'B' }] })]), []);
  assert.deepEqual(validateRound([call()]), []);
  assert.deepEqual(validateRound([call({ options: [] })]), []);
});

test('入参校验：空题干被拒（schema 只保证字段存在，不保证有内容）', () => {
  const violations = validateRound([call({ question: '   ' })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /empty question text/);
});

test('入参校验：空选项文字被拒', () => {
  const violations = validateRound([call({ options: [{ label: ' ' }] })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /option 1 has an empty label/);
});

test('入参校验：同一题里两段只差推荐标记的文字被拒（界面上看着一样，选的是哪一项就分不出来了）', () => {
  const violations = validateRound([call({ options: [{ label: 'A：移走；推荐' }, { label: 'A：移走（推荐）' }] })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /same label "A：移走"/);
});

test('入参校验：漏写题型、老开关、题型与选项不搭、重复 id 都不再是拒收项', () => {
  assert.deepEqual(validateRound([{ question: '？' }]), []);
  assert.deepEqual(validateRound([call({ multi_select: false })]), []);
  assert.deepEqual(validateRound([call({ type: 'free', options: [{ label: '甲' }] })]), []);
  assert.deepEqual(validateRound([call({ type: 'single' })]), []);
  assert.deepEqual(validateRound([{ id: 'a', question: '甲？' }, { id: 'a', question: '乙？' }]), []);
});

test('入参校验：questions 不是数组、某题不是对象时交给宿主，这里不抛也不报违规', () => {
  for (const bad of [undefined, 'x', 42, {}, [null, 42]]) assert.deepEqual(validateRound(bad), [], JSON.stringify(bad));
});

test('入参校验：选项名里的标点都照常投出（顿号、冒号、换行）', () => {
  assert.deepEqual(validateRound([call({ options: [{ label: '甲、乙两种做法' }, { label: '丙：另起一行' }] })]), []);
  assert.deepEqual(validateRound([call({ options: [{ label: '两行\n的选项名' }] })]), []);
});

// --- 结果 ---

test('画什么：投出去了才画表；没投出与失败画一行说明；其余状态两样都不画', () => {
  assert.equal(drawsForm(readFormModel({ argsRaw: args([call()]), resultText: shown })), true);
  assert.equal(drawsForm(readFormModel({ argsRaw: args([]), resultText: shown })), false, '题面读不出来就没有表可画');
  assert.equal(drawsForm(readFormModel({ argsRaw: args([call()]), resultText: hidden })), false);
  assert.equal(drawsForm(readFormModel({ argsRaw: args([call()]), resultText: 'boom', failed: true })), false);
  assert.equal(drawsNote(readFormModel({ argsRaw: args([call()]), resultText: hidden })), true);
  assert.equal(drawsNote(readFormModel({ argsRaw: args([call()]), resultText: 'boom', failed: true })), true);
  assert.equal(drawsNote(readFormModel({ argsRaw: args([call()]) })), false, '还没落库');
  assert.equal(drawsNote(readFormModel({ argsRaw: args([call()]), resultText: JSON.stringify({ pending: true }) })), false, '结果形状不认识');
});

test('结果 ok: true：这一轮投出去了', () => {
  const model = readFormModel({ argsRaw: args([call()]), resultText: shown });
  assert.equal(model.state, 'form');
  assert.equal(model.questions.length, 1);
});

test('结果 ok: false：这一轮没投出，并把那句话交回给视图与模型', () => {
  const model = readFormModel({ argsRaw: args([call()]), resultText: hidden });
  assert.equal(model.state, 'notShown');
  assert.equal(model.message, 'no form');
});

test('结果还没落库：状态是运行中，题面已能从 argsRaw 读出来', () => {
  const model = readFormModel({ argsRaw: args([call()]) });
  assert.equal(model.state, 'running');
  assert.equal(model.questions.length, 1);
});

test('调用失败：状态是失败，说明另有去处', () => {
  assert.equal(readFormModel({ argsRaw: args([call()]), resultText: 'boom', failed: true }).state, 'error');
});

test('结果形状不认识（rejected / pending）：两个注册项都不画，轮次里没有可画的表', () => {
  const legacyArgs = JSON.stringify({ questions: [{ id: 'a', question: '选哪个？', multi_select: false, options: [{ label: '甲' }] }] });
  for (const text of [JSON.stringify({ pending: true, message: 'old' }), JSON.stringify({ rejected: true, violations: ['x'], error: 'y' })]) {
    const model = readFormModel({ argsRaw: legacyArgs, resultText: text });
    assert.equal(model.state, 'unknown', text);
    assert.equal(model.message, undefined);
  }
});

// --- 整行点击 ---

test('整行点击的判据：普通点击切勾选，点链接与按钮不切，锁着时一律不切', () => {
  const plain = { closest: () => null };
  const link = { closest: (selector) => (selector === 'a, button' ? {} : null) };
  assert.equal(selectsOnClick(false, plain), true, '普通点击切勾选');
  assert.equal(selectsOnClick(false, link), false, '点链接/按钮是跳转，不切勾选');
  assert.equal(selectsOnClick(true, plain), false, '冻结之后改不了');
  assert.equal(selectsOnClick(false, null), true, '目标拿不到时按普通点击算');
  assert.equal(selectsOnClick(false, undefined), true, '同上');
});

// --- 导入正文与块 ---

const questions = [
  { id: '1', number: 1, question: '落点放哪？', type: 'multi', options: [{ label: 'A：详情页', recommended: false }, { label: 'B：列表里', recommended: false }] },
  { id: '2', number: 2, question: '范围呢？', type: 'free', options: [] },
  { id: '3', number: 3, question: '没答的题', type: 'free', options: [] },
];

test('导入正文：有作答的题各占一段——题号一行、每项一行且行首带记号；没作答的题不出现', () => {
  const body = importBody(questions, {
    1: { selected: ['A：详情页'], custom: '' },
    2: { selected: [], custom: '两句都不够，我自己说' },
    3: { selected: [], custom: '   ' },
  });
  assert.equal(body, '1.\n- A：详情页\n2.\n- 两句都不够，我自己说');
});

test('导入正文：一项作答都没有时是空串（空作答是另一种情况，由块自己表达）', () => {
  assert.equal(importBody(questions, {}), '');
  assert.equal(importBody(questions, { 1: { selected: [], custom: '   ' } }), '');
});

test('导入正文：选项名里带顿号、冒号都照原样写出去', () => {
  const one = [{ id: '1', number: 1, question: '？', type: 'multi', options: [{ label: '甲、乙都行', recommended: false }, { label: '丙：另起一行', recommended: false }] }];
  assert.equal(importBody(one, { 1: { selected: ['甲、乙都行', '丙：另起一行'], custom: '' } }), '1.\n- 甲、乙都行\n- 丙：另起一行');
});

test('首次导入：块放在最前面，用户原有的文字整段接在后面', () => {
  const body = importBody(questions, { 1: { selected: [], custom: '选 A' } });
  assert.equal(
    applyImport('我另外想说一句。', body, 'k3f9'),
    '【拷问作答 k3f9】\n1.\n- 选 A\n【/拷问作答】\n\n我另外想说一句。',
  );
});

test('空作答照导：导出的块只有起止行，什么说明文字都不加', () => {
  assert.equal(applyImport('', '', 'k3f9'), '【拷问作答 k3f9】\n【/拷问作答】');
  assert.equal(applyImport('我另外想说一句。', '', 'k3f9'), '【拷问作答 k3f9】\n【/拷问作答】\n\n我另外想说一句。');
});

test('重复导入：原地替换这张表的块本身，块外手打的内容一个不动', () => {
  const first = applyImport('前面的话。', importBody(questions, { 1: { selected: [], custom: '选 A' } }), 'k3f9');
  const second = applyImport(first, importBody(questions, { 1: { selected: [], custom: '改选 B' } }), 'k3f9');
  assert.match(second, /1\.\n- 改选 B/);
  assert.doesNotMatch(second, /选 A/);
  assert.equal(second.slice(-'前面的话。'.length), '前面的话。');
  assert.equal((second.match(/【拷问作答 k3f9】/g) ?? []).length, 1, '同一张表只有一块');
});

test('导入：别的表的块一个不动，这张表的块另起一块', () => {
  const other = applyImport('', importBody(questions, { 1: { selected: [], custom: '别的表' } }), 'zzzz');
  const mine = applyImport(other, importBody(questions, { 2: { selected: [], custom: '我这张' } }), 'k3f9');
  assert.match(mine, /【拷问作答 zzzz】\n1\.\n- 别的表\n【\/拷问作答】/);
  assert.match(mine, /【拷问作答 k3f9】\n2\.\n- 我这张\n【\/拷问作答】/);
});

test('导入：草稿不是字符串时按空草稿算', () => {
  assert.equal(applyImport(undefined, '', 'k3f9'), '【拷问作答 k3f9】\n【/拷问作答】');
});

test('草稿一致性：草稿里那张块正是当前作答时为真，旧了、手改过、没块都为假', () => {
  const body = importBody(questions, { 1: { selected: [], custom: '选 A' } });
  const draft = applyImport('我另外想说一句。', body, 'k3f9');
  assert.equal(draftHasBody(draft, body, 'k3f9'), true);
  assert.equal(draftHasBody(applyImport('', importBody(questions, { 1: { selected: [], custom: '改选 B' } }), 'k3f9'), body, 'k3f9'), false, '草稿里是旧那份');
  assert.equal(draftHasBody(draft.replace('选 A', '我自己乱改的'), body, 'k3f9'), false, '手改过的块算不一致');
  assert.equal(draftHasBody('只有我自己的话。', body, 'k3f9'), false, '没有块');
  assert.equal(draftHasBody(undefined, body, 'k3f9'), false);
  assert.equal(draftHasBody(draft, body, 'zzzz'), false, '别的表的块不算');
  // 空作答的块也是一份作答：导出去之后按键就该说「已导入」，而不是一直催他「更新输入框」
  assert.equal(draftHasBody(applyImport('', '', 'k3f9'), '', 'k3f9'), true);
  assert.equal(draftHasBody(draft, '', 'k3f9'), false, '草稿里那份不是空的');
});

test('草稿里那张块的内容读得出来；没有块、起止行不配对时读不出来', () => {
  assert.equal(importBlockBody(applyImport('', '1.\n- A', 'k3f9'), 'k3f9'), '1.\n- A');
  assert.equal(importBlockBody(applyImport('', '', 'k3f9'), 'k3f9'), '');
  assert.equal(importBlockBody('我自己的话。', 'k3f9'), undefined);
  assert.equal(importBlockBody('【拷问作答 k3f9】\n1.\n- A', 'k3f9'), undefined);
  assert.equal(importBlockBody(applyImport('', '1.\n- A', 'zzzz'), 'k3f9'), undefined);
});

// --- 反解 ---

/** 一块作答块：身份记号由这个调用 id 推出来（这正是「谁的块」的判据）。 */
const blockOf = (body, callId = 'k3f9') => applyImport('', body, callId);

test('反解：按题号认题——题干一模一样的两道题也不会串台', () => {
  const twins = [
    { id: '1', number: 1, question: '同一句话？', type: 'free', options: [] },
    { id: '2', number: 2, question: '同一句话？', type: 'free', options: [] },
  ];
  const parsed = parseImportedAnswersResult(blockOf('2.\n- 第二题的作答'), twins, 'k3f9');
  assert.equal(parsed.kind, 'parsed');
  assert.deepEqual(parsed.answers, {
    1: { selected: [], custom: '' },
    2: { selected: [], custom: '第二题的作答' },
  });
});

test('反解：题干被改写也不影响回填（认的是题号，不是题干）', () => {
  const asked = [{ id: '1', number: 1, question: '原来的题干', type: 'free', options: [] }];
  const parsed = parseImportedAnswersResult(blockOf('1.\n- 答'), asked, 'k3f9');
  assert.deepEqual(parsed.answers['1'], { selected: [], custom: '答' });
});

test('反解：选项名对得上的算选中，对不上的并进自填；对不上选项名字的单选项也算自填', () => {
  const parsed = parseImportedAnswersResult(blockOf('1.\n- A：详情页\n- 两句都不够'), questions, 'k3f9');
  assert.deepEqual(parsed.answers['1'], { selected: ['A：详情页'], custom: '两句都不够' });
});

test('反解：多行自填按行写成多个项行，读回来拼成同一段文字', () => {
  const parsed = parseImportedAnswersResult(blockOf('2.\n- 第一行\n- 第二行\n- 第三行'), questions, 'k3f9');
  assert.deepEqual(parsed.answers['2'], { selected: [], custom: '第一行\n第二行\n第三行' });
  // 写出去的那一份自己读得回来：空行也照样一来一回
  const body = importBody(questions, { 2: { selected: [], custom: '第一行\n\n第三行' } });
  assert.equal(parseImportedAnswersResult(blockOf(body), questions, 'k3f9').answers['2'].custom, '第一行\n\n第三行');
});

test('反解：块里出现既不是题号也不是项的行：整块判成坏了，退回本地那份', () => {
  const parsed = parseImportedAnswersResult(blockOf('1.\n- A：详情页\n（这句是我随手加的）'), questions, 'k3f9');
  assert.equal(parsed.kind, 'malformed');
});

test('反解：块里没出现的题显式记成没作答（推荐默认因此不会被勾回来）', () => {
  const parsed = parseImportedAnswersResult(blockOf('1.\n- A：详情页'), [questions[0], questions[2]], 'k3f9');
  assert.deepEqual(parsed.answers['3'], { selected: [], custom: '' });
});

test('反解：空块就是「已答、全空」', () => {
  const parsed = parseImportedAnswersResult(blockOf(''), questions, 'k3f9');
  assert.equal(parsed.kind, 'parsed');
  assert.deepEqual(Object.values(parsed.answers), [
    { selected: [], custom: '' }, { selected: [], custom: '' }, { selected: [], custom: '' },
  ]);
});

test('反解：CRLF 换行也认（手打草稿可能是 CRLF）', () => {
  const text = blockOf('1.\n- A：详情页').replace(/\n/g, '\r\n');
  assert.deepEqual(parseImportedAnswersResult(text, questions, 'k3f9').answers['1'], { selected: ['A：详情页'], custom: '' });
});

test('反解：只认这张表自己的块——别的表的块、不带记号的那种块都不算', () => {
  assert.equal(parseImportedAnswersResult(blockOf('1.\n- A：详情页', 'zzzz'), questions, 'k3f9').kind, 'none');
  assert.equal(parseImportedAnswersResult('【拷问作答】\n1.\n- A：详情页\n【/拷问作答】', questions, 'k3f9').kind, 'none');
  assert.equal(parseImportedAnswersResult('我另外想说一句。', questions, 'k3f9').kind, 'none');
  assert.equal(parseImportedAnswersResult(undefined, questions, 'k3f9').kind, 'none');
  assert.equal(parseImportedAnswersResult('【拷问作答 k3f9】\n1.\n- A', questions, 'k3f9').kind, 'none', '起止行不配对：当没有块');
});

test('反解：块在但一条题号都认不出来时是 malformed（调用方退回本地那份）', () => {
  assert.equal(parseImportedAnswersResult(blockOf('- A：详情页'), questions, 'k3f9').kind, 'malformed');
  assert.equal(parseImportedAnswersResult(blockOf('随便写点什么'), questions, 'k3f9').kind, 'malformed');
});

test('反解：题号越界的那几行不产物条目；全是越界题号时也算 malformed', () => {
  const parsed = parseImportedAnswersResult(blockOf('1.\n- A：详情页\n7.\n- 越界'), questions, 'k3f9');
  assert.deepEqual(parsed.answers['1'], { selected: ['A：详情页'], custom: '' });
  assert.equal(parseImportedAnswersResult(blockOf('7.\n- 越界'), questions, 'k3f9').kind, 'malformed');
});

// --- 冻结那份作答 ---

test('冻结：块在就以块为准重画——本地那份不许插嘴，块里没有的题就是没作答', () => {
  const stored = { 1: { selected: ['B：列表里'], custom: '本地改过' }, 2: { selected: [], custom: '本地自填' } };
  const frozen = frozenFormAnswers(questions, stored, blockOf('2.\n- 只改插件'), 'k3f9');
  assert.equal(frozen.fallback, false);
  assert.deepEqual(frozen.answers['1'], { selected: [], custom: '' });
  assert.deepEqual(frozen.answers['2'], { selected: [], custom: '只改插件' });
});

test('冻结：块坏了才退回本地那份（内容不凭空消失），并标出这是退回的一份', () => {
  const stored = { 2: { selected: [], custom: '本地自填' } };
  const frozen = frozenFormAnswers(questions, stored, blockOf('跟哪道题都对不上：随便'), 'k3f9');
  assert.equal(frozen.fallback, true);
  assert.deepEqual(frozen.answers['2'], { selected: [], custom: '本地自填' });
});

test('冻结：块里单选题写了两行选项，重画时也只留一项', () => {
  const single = [{ id: '1', number: 1, question: '继续吗？', type: 'single', options: [{ label: '继续', recommended: false }, { label: '停一下', recommended: false }] }];
  const frozen = frozenFormAnswers(single, {}, blockOf('1.\n- 继续\n- 停一下'), 'k3f9');
  assert.deepEqual(frozen.answers['1'], { selected: ['继续'], custom: '' });
});

// --- 推荐默认 ---

const recommended = (id, ...options) => ({
  id,
  number: Number(id),
  options: options.map(([label, isRecommended]) => ({ label, recommended: isRecommended })),
});

test('推荐默认：标了推荐的选项，用户没动过这题时就是选中态；取消过的不勾回来', () => {
  const list = [recommended('1', ['A：移走', true], ['B：都留', false])];
  assert.deepEqual(applyRecommendedDefaults(list, {}), { 1: { selected: ['A：移走'], custom: '' } });
  assert.deepEqual(applyRecommendedDefaults(list, { 1: { selected: [], custom: '' } }), { 1: { selected: [], custom: '' } });
  assert.deepEqual(applyRecommendedDefaults(list, { 1: { selected: ['B：都留'], custom: '我写' } }), { 1: { selected: ['B：都留'], custom: '我写' } });
});

test('推荐默认：没有推荐的题不会凭空多出作答；题面还没读出来时原样返回', () => {
  assert.deepEqual(applyRecommendedDefaults([recommended('1', ['A', false])], {}), {});
  assert.deepEqual(applyRecommendedDefaults([], { 1: { selected: ['A'], custom: '' } }), { 1: { selected: ['A'], custom: '' } });
});

test('推荐默认：单选题只留一项——推荐默认、用户勾的、反解出来的都收敛', () => {
  const single = [{ id: '1', number: 1, type: 'single', options: [{ label: 'A', recommended: true }, { label: 'B', recommended: true }] }];
  assert.deepEqual(applyRecommendedDefaults(single, {}), { 1: { selected: ['A'], custom: '' } });
  assert.deepEqual(applyRecommendedDefaults(single, { 1: { selected: ['A', 'B'], custom: '自填留着' } }), { 1: { selected: ['A'], custom: '自填留着' } });
});

test('作答逐项：选中的项在前、自填整段算一项（自填里的回车不拆项）', () => {
  assert.deepEqual(answerItems({ selected: ['A：xxx', 'B：yyy'], custom: ' 补\n一句 ' }), [
    { kind: 'option', text: 'A：xxx' },
    { kind: 'option', text: 'B：yyy' },
    { kind: 'custom', text: '补\n一句' },
  ]);
  assert.deepEqual(answerItems(undefined), []);
  assert.deepEqual(answerItems({ selected: [], custom: '   ' }), []);
});

// --- 作答块到达：这张表被答了没 ---

const replyNode = (text, seq = 9, kind = 'user') => ({ kind, seq, content: [{ type: 'text', text }] });
const callNode = (seq = 5, callId = 'call-1') => ({ kind: 'tool-result', callId, seq });
/** 这张表（callNode 用的那个调用 id）那块作答块：记号由 id 推出来，两边对得上才认。 */
const answerOf = (body) => applyImport('', body, 'call-1');

test('作答块到达：交回那条带着这张表记号的发言本身（反解要读它的文字）', () => {
  const answer = replyNode(answerOf('2.\n- 只改插件'));
  assert.equal(formReplyAfter([callNode(), answer], 'call-1'), answer);
});

test('作答块到达：转向消息、聊别的事、答别的表都不算——表还在等作答', () => {
  const nodes = [callNode()];
  assert.equal(formReplyAfter([...nodes, replyNode('边跑边补一句', 7, 'steering')], 'call-1'), undefined);
  assert.equal(formReplyAfter([...nodes, replyNode('我另外想说一句')], 'call-1'), undefined);
  assert.equal(formReplyAfter([...nodes, replyNode(blockOf('1.\n- A：详情页', 'zzzz'))], 'call-1'), undefined);
});

test('作答块到达：只有开头那行、收尾行没来（起止行不配对）不算作答，表照旧可填', () => {
  const half = replyNode(`${importBlockStart('call-1')}\n2.\n- 只改插件`);
  assert.equal(formReplyAfter([callNode(), half], 'call-1'), undefined);
});

test('作答块到达：认的是最早的那条（更晚的属于后面的轮次）；调用之前的不算', () => {
  const first = replyNode(answerOf('2.\n- 先答的'), 9);
  const later = replyNode(answerOf('2.\n- 后答的'), 20);
  assert.equal(formReplyAfter([callNode(), first, later], 'call-1'), first);
  assert.equal(formReplyAfter([replyNode(answerOf('2.\n- 早的'), 3), callNode()], 'call-1'), undefined);
});

test('作答块到达：认不出这条调用、或还拿不到记录时按「还没答」算（表照旧可填）', () => {
  assert.equal(formReplyAfter([replyNode(answerOf('1.\n- A'))], 'call-1'), undefined);
  assert.equal(formReplyAfter(undefined, 'call-1'), undefined);
  assert.equal(formReplyAfter([callNode()], undefined), undefined);
});

test('发言文字：把内容块里的文本段接起来，别的段忽略', () => {
  assert.equal(messageText({ content: [{ type: 'text', text: '第一段' }, { type: 'image' }, { type: 'text', text: '第二段' }] }), '第一段\n第二段');
  assert.equal(messageText({ content: [] }), '');
  assert.equal(messageText(undefined), '');
  assert.equal(messageText({}), '');
});

// --- 轮次定位：本轮里那次 grilling_form 调用 ---

/** 假 chat 快照：按轮次给节点键，再按 key 取节点。 */
function fakeChat(turns) {
  const byKey = new Map();
  for (const [turn, blocks] of Object.entries(turns)) {
    blocks.forEach((block, index) => byKey.set(`${turn}:${index}`, { kind: 'tool-call', data: { root: block } }));
  }
  return {
    locations: { getTurn: (turn) => (turns[turn] === undefined ? [] : turns[turn].map((_, index) => `${turn}:${index}`)) },
    nodes: { get: (key) => byKey.get(key) },
  };
}
const settledRoot = (overrides = {}) => ({
  kind: 'tool-result',
  callId: 'call-1',
  seq: 5,
  call: { name: TOOL_NAME, argsRaw: args([call()]) },
  content: [{ type: 'text', text: shown }],
  isError: false,
  ...overrides,
});

test('轮次定位：本轮里那条 grilling_form 调用连工具名与调用 id 一起交出来', () => {
  const chat = fakeChat({ 3: [{ kind: 'user' }, settledRoot()] });
  assert.deepEqual(roundCall(chat, 3), { block: settledRoot(), toolName: TOOL_NAME, callId: 'call-1' });
  assert.equal(roundCall(fakeChat({ 3: [{ kind: 'user' }] }), 3), undefined, '本轮没有这张表就什么都不画');
  assert.equal(roundCall(undefined, 3), undefined);
});

test('轮次定位：还没落结果的那次调用（工具名在 name 上）也认得出', () => {
  const runningRoot = { phase: 'start', callId: 'call-9', name: TOOL_NAME, argsRaw: '{}' };
  assert.deepEqual(roundCall(fakeChat({ 1: [runningRoot] }), 1), { block: runningRoot, toolName: TOOL_NAME, callId: 'call-9' });
});

test('轮次定位：本轮里别的工具不是这张表；被拦下之后又投出的那次才算', () => {
  const other = { ...settledRoot(), call: { name: 'bash', argsRaw: '{}' } };
  const blocked = settledRoot({ seq: 4, content: [{ type: 'text', text: hidden }] });
  const accepted = settledRoot({ seq: 6 });
  assert.equal(roundCall(fakeChat({ 1: [other] }), 1), undefined);
  assert.equal(roundCall(fakeChat({ 1: [blocked, accepted] }), 1).block.seq, 6, '投出去的那次是最后一次');
});

// --- 被后面那张取代 ---

const replacing = (overrides = {}) => settledRoot({
  callId: 'call-2',
  seq: 12,
  call: { name: TOOL_NAME, argsRaw: JSON.stringify({ questions: [call()], replace: true }) },
  ...overrides,
});

test('被取代：后面某一轮投出一张带 replace: true 的表就算', () => {
  assert.equal(supersededAfter(fakeChat({ 4: [settledRoot()], 5: [replacing()] }), 4), true);
});

test('被取代：后面那张没带 replace、或它自己没投出去，都不算', () => {
  assert.equal(supersededAfter(fakeChat({ 4: [settledRoot()], 5: [settledRoot({ callId: 'call-2', seq: 12 })] }), 4), false);
  const blocked = replacing({ content: [{ type: 'text', text: hidden }] });
  assert.equal(supersededAfter(fakeChat({ 4: [settledRoot()], 5: [blocked] }), 4), false);
});

test('被取代：中间隔着别的轮次也照样往后找；后面没有轮次了就停', () => {
  assert.equal(supersededAfter(fakeChat({ 4: [settledRoot()], 5: [{ kind: 'user' }], 6: [replacing()] }), 4), true);
  assert.equal(supersededAfter(fakeChat({ 4: [settledRoot()] }), 4), false);
  assert.equal(supersededAfter(undefined, 4), false);
});


// --- 取代时搬的两件：勾选与草稿里的块 ---

const replaceArgs = (list) => JSON.stringify({ questions: list, replace: true });
const replacingRound = (callId, seq = 12) => settledRoot({ callId, seq, call: { name: TOOL_NAME, argsRaw: replaceArgs([call()]) } });

test('被取代的是哪张：往前找最近一张投出去过、自己的作答块还没到的表', () => {
  const chat = fakeChat({ 4: [settledRoot()], 5: [replacingRound('call-2')] });
  assert.deepEqual(replacedForm(chat, 5), { callId: 'call-1', questions: readQuestions(args([call()])) });
  assert.equal(replacedForm(chat, 4), undefined, '没点名取代的那一轮没有被取代者');
  assert.equal(replacedForm(fakeChat({ 5: [replacingRound('call-2')] }), 5), undefined, '前面没有表');
  assert.equal(replacedForm(undefined, 5), undefined);
});

test('被取代的判定：前面那张自己的作答块已经到了就不算被取代（它是已答的那张）', () => {
  const chat = fakeChat({ 4: [settledRoot()], 5: [replacingRound('call-2')] });
  chat.legacy = { nodes: [callNode(), replyNode(answerOf('1.\n- 答了'), 9)] };
  assert.equal(replacedForm(chat, 5), undefined);
});

test('搬运勾选：题干原文一模一样的题才搬，勾选只留新表还认得的那几项', () => {
  const oldQuestions = [
    { id: '1', number: 1, question: '落点放哪？', type: 'multi', options: [{ label: 'A：详情页', recommended: false }, { label: 'B：列表里', recommended: false }] },
    { id: '2', number: 2, question: '范围呢？', type: 'free', options: [] },
  ];
  const newQuestions = [
    { id: '1', number: 1, question: '落点放哪？', type: 'multi', options: [{ label: 'A：详情页', recommended: false }, { label: 'C：另起一层', recommended: false }] },
    { id: '2', number: 2, question: '范围呢', type: 'free', options: [] },
  ];
  const carried = carryOverAnswers(oldQuestions, newQuestions, {
    1: { selected: ['A：详情页', 'B：列表里'], custom: '补一句' },
    2: { selected: [], custom: '整段搬过去' },
  });
  assert.deepEqual(carried, { 1: { selected: ['A：详情页'], custom: '补一句' } }, '第二题题干差一个字：不搬');
});

test('搬运勾选：旧表上「用户把这题清空了」那条记录也照搬——新表的推荐默认不许替他勾回来', () => {
  assert.deepEqual(carryOverAnswers(questions, questions, { 1: { selected: [], custom: '' } }), { 1: { selected: [], custom: '' } });
  assert.deepEqual(carryOverAnswers(questions, questions, {}), {}, '旧表上没动过的题不搬，让新表自己叠推荐默认');
});

test('取代时搬草稿：旧表那块整段拿掉，新表那块放在它原来的位置，别处的字一个不动', () => {
  const draft = `前面的话。\n\n${applyImport('', '1.\n- 旧勾选', 'call-1')}\n\n后面的话。`;
  const next = carryImport(draft, 'call-1', '1.\n- 新勾选', 'call-2');
  assert.equal(next, `前面的话。\n\n${applyImport('', '1.\n- 新勾选', 'call-2')}\n\n后面的话。`);
  assert.doesNotMatch(next, /旧勾选/);
});

test('取代时搬草稿：旧块不在草稿里就等价于一次普通导入；新表那块已经在草稿里就原地换', () => {
  assert.equal(
    carryImport('我另外想说一句。', 'call-1', '1.\n- 新勾选', 'call-2'),
    applyImport('我另外想说一句。', '1.\n- 新勾选', 'call-2'),
  );
  const withNew = `${applyImport('', '1.\n- 旧一点的', 'call-2')}\n\n我另外想说一句。`;
  const next = carryImport(withNew, 'call-1', '1.\n- 新勾选', 'call-2');
  assert.match(next, /1\.\n- 新勾选/);
  assert.doesNotMatch(next, /旧一点的/);
  assert.equal(next.slice(-'我另外想说一句。'.length), '我另外想说一句。');
});


// --- 闸门折叠 ---

const callEvent = (callId, argsRaw, seq) => ({ type: 'tool/call', seq, data: { name: TOOL_NAME, callId, arguments: argsRaw } });
const resultEvent = (callId, value, seq) => ({
  type: 'tool/result',
  seq,
  data: { message: { toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(value) }] } },
});
const userEvent = (text, seq) => ({ type: 'user/message', seq, data: { content: [{ type: 'text', text }] } });

/** 走一遍「调用 → 结果 ok → 待答」这三步。 */
function pend(state, callId = 'call-1', argsRaw = args([call()])) {
  return foldFormGate(foldFormGate(state, callEvent(callId, argsRaw, 1)), resultEvent(callId, { ok: true, message: 'x' }, 2));
}

test('闸门：调用事件先把这次调用记成候选，结果说投出去了才算有一张待答的表', () => {
  const afterCall = foldFormGate(initialFormGate(), callEvent('call-abc1234', args([call({ question: '继续吗？' })]), 3));
  assert.equal(afterCall.call.callId, 'call-abc1234');
  assert.deepEqual(afterCall.call.questions, ['继续吗？']);
  assert.equal(afterCall.call.seq, 3);
  assert.equal(pendingFormOf(afterCall), null, '结果还没落库，还算不上待答');
  const afterResult = foldFormGate(afterCall, resultEvent('call-abc1234', { ok: true, message: 'x' }, 4));
  assert.equal(pendingFormOf(afterResult).callId, 'call-abc1234');
  assert.equal(afterResult.call, null, '结果落库之后候选槽位空了');
});

test('闸门：结果说没投出（入参被拒、被拦下）时，前面那张待答的表一个不动', () => {
  const withPending = pend(initialFormGate(), 'call-1');
  const blocked = foldFormGate(foldFormGate(withPending, callEvent('call-2', args([call()]), 5)), resultEvent('call-2', { ok: false, message: 'no' }, 6));
  assert.equal(pendingFormOf(blocked).callId, 'call-1');
});

test('闸门：用户发言里带着这张表的记号就清空；转向消息、聊别的事、答别的表都不清', () => {
  const withPending = pend(initialFormGate(), 'call-1');
  const mark = importBlockStart('call-1');
  assert.equal(pendingFormOf(foldFormGate(withPending, userEvent(mark + '\n1.\n- A\n【/拷问作答】', 7))), null);
  assert.equal(
    pendingFormOf(foldFormGate(withPending, userEvent(mark, 7))).callId,
    'call-1',
    '只有开头那行、收尾行没来：什么都没答，闸门照旧关着',
  );
  assert.equal(pendingFormOf(foldFormGate(withPending, userEvent('边跑边补一句', 7))).callId, 'call-1');
  assert.equal(pendingFormOf(foldFormGate(withPending, userEvent('我另外想说一句', 7))).callId, 'call-1');
  assert.equal(pendingFormOf(foldFormGate(withPending, userEvent(importBlockStart('call-9') + '\n【/拷问作答】', 7))).callId, 'call-1');
});

test('闸门：不关本插件的事件原样返回同一个引用（投影按引用判有没有变）', () => {
  const state = pend(initialFormGate(), 'call-1');
  for (const event of [
    { type: 'tool/call', seq: 9, data: { name: 'bash', callId: 'c', arguments: '{}' } },
    { type: 'tool/result', seq: 9, data: { message: { toolCallId: 'other', content: [{ type: 'text', text: shown }] } } },
    { type: 'assistant/message', seq: 9, data: {} },
    { type: 'tool/call', seq: 9, data: { name: TOOL_NAME, callId: 'c', arguments: '不是 JSON' } },
    {},
  ]) {
    assert.equal(foldFormGate(state, event), state, JSON.stringify(event));
  }
});

test('闸门：结果形状不认识的那次调用进不了待答（闸门不会被它卡死）', () => {
  const legacyArgs = JSON.stringify({ questions: [{ id: 'a', question: '？', multi_select: true, options: [{ label: '甲' }] }] });
  const state = foldFormGate(
    foldFormGate(initialFormGate(), callEvent('call-old', legacyArgs, 3)),
    resultEvent('call-old', { pending: true, message: '旧形状' }, 4),
  );
  assert.equal(pendingFormOf(state), null);
});

test('闸门：投影单元的形状与收口——键、版本、初值、schema 把脏状态收回初值', () => {
  assert.equal(FORM_GATE_UNIT.key, GATE_KEY);
  assert.equal(typeof FORM_GATE_UNIT.stateVersion, 'number');
  assert.deepEqual(FORM_GATE_UNIT.init(), initialFormGate());
  assert.deepEqual(
    FORM_GATE_UNIT.apply(initialFormGate(), callEvent('call-1', args([call()]), 1)),
    foldFormGate(initialFormGate(), callEvent('call-1', args([call()]), 1)),
    '单元折叠的就是这份实现',
  );
  const valid = pend(initialFormGate(), 'call-1');
  assert.deepEqual(FORM_GATE_UNIT.stateSchema.parse(valid), valid);
  for (const garbage of [undefined, null, 'x', 42, { call: 1, pending: 'y' }, { pending: { callId: 'c' } }]) {
    assert.deepEqual(FORM_GATE_UNIT.stateSchema.parse(garbage), initialFormGate(), JSON.stringify(garbage));
  }
});

// --- 持久化 ---

test('会话键：按会话分一份', () => {
  assert.equal(formStorageKey('sess-1'), 'dsh-grilling-form.sess-1');
  assert.equal(formStorageKey(''), 'dsh-grilling-form.unknown-session');
});

test('持久化：写进去读得回来，同一个会话里别的轮次互不影响', () => {
  const storage = fakeStorage();
  const key = formStorageKey('sess-1');
  writeStoredForm(storage, key, 'call-1', { 1: { selected: ['A'], custom: '自填' } });
  writeStoredForm(storage, key, 'call-2', { 2: { selected: [], custom: '只自填' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { 1: { selected: ['A'], custom: '自填' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-2'), { 2: { selected: [], custom: '只自填' } });
  assert.deepEqual(readStoredForm(storage, formStorageKey('sess-2'), 'call-1'), {});
});

test('持久化：读回来的脏数据被清掉，坏 JSON 与缺存储都只是「什么都没选」', () => {
  const key = formStorageKey('sess-1');
  const storage = fakeStorage({ [key]: JSON.stringify({ 'call-1': { 1: { selected: [1, 'A'], custom: 7 }, 2: 'x', 3: { selected: [], custom: '' } } }) });
  // 3 是「用户把这题清空了」，不是脏数据：默认勾选靠它才不会被勾回来
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { 1: { selected: ['A'], custom: '' }, 3: { selected: [], custom: '' } });
  assert.deepEqual(readStoredForm(fakeStorage({ [key]: '{ 坏 JSON' }), key, 'call-1'), {});
  assert.deepEqual(readStoredForm(undefined, key, 'call-1'), {});
});

test('持久化：形状不对的记录被丢掉——它不该冒充「用户清空过」而吃掉默认勾选', () => {
  const key = formStorageKey('sess-1');
  const storage = fakeStorage({ [key]: JSON.stringify({ 'call-1': { 1: { selected: 'garbage' }, 2: { selected: [], custom: '' } } }) });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { 2: { selected: [], custom: '' } });
});

test('持久化：取消掉默认勾选这件事存得住——重新读回来仍是「清空过」而不是「没作答」', () => {
  const storage = fakeStorage();
  const key = formStorageKey('sess-1');
  writeStoredForm(storage, key, 'call-1', { 1: { selected: [], custom: '' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { 1: { selected: [], custom: '' } });
});

test('持久化：storage 写不进去（配额/隐私模式）时不抛', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  writeStoredForm(storage, formStorageKey('s'), 'call-1', { 1: { selected: ['A'], custom: '' } });
});

console.log(`${passed}/${passed + failures.length} passed`);
if (failures.length > 0) process.exitCode = 1;

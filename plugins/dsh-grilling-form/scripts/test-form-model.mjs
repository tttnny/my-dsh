// 共用纯模型的单测：题面取数、入参校验、导入文本与导入块、本轮那次调用的定位、只读判定与
// 它交回的那条发言、按实发消息反解作答、冻结那份作答、会话持久化。
//
// 这里是纯函数，直接 import src/ 下的源码（storage 由假件传进去，不碰真 localStorage）。
// 宿主半边走真内核的那一条链由 scripts/smoke-host.mjs 断言，视图由 scripts/test-render.mjs 断言。
import assert from 'node:assert/strict';
import {
  IMPORT_BLOCK_END,
  IMPORT_BLOCK_START,
  TOOL_NAME,
  answerLines,
  answerParts,
  applyImport,
  applyRecommendedDefaults,
  formStorageKey,
  frozenAnswers,
  importBody,
  isBlank,
  mergeNumberIntoHeader,
  messageText,
  parseImportedAnswers,
  readFormModel,
  readStoredForm,
  roundCall,
  titleOf,
  userReplyAfter,
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

test('入参校验：展开正文里把选项又列了一遍被拒（截图里「一遍不带选择器、一遍带」的那种）', () => {
  const violations = validateRound([call({
    detail: [
      '先交代一个会左右选法的事实：这一版本来就是这么设计的。',
      '',
      '- **甲**·详情页里的「配置」入口：进去是一整页',
      '- **乙**·列表里直接多一张卡片：点开就是一整页',
      '- 丙·直接铺在详情页上：不用再点',
    ].join('\n'),
    options: [
      { label: '甲：插件详情页里的「配置」入口，进去是一整页' },
      { label: '乙：插件页列表里直接一张卡片，点开就是一整页' },
      { label: '丙：配置直接铺在插件详情页上，不再分页' },
    ],
  })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /restates its options in detail/);
});

test('入参校验：展开正文只写各选项共用的背景时不算违规', () => {
  assert.deepEqual(validateRound([call({
    detail: '这一版本来就是这么设计的：自带配置的插件把配置渲染在插件页。\n\n三个落点都已经预留在插件页。',
    options: [{ label: '甲：详情页里的配置入口' }, { label: '乙：列表里直接多一张卡片' }],
  })]), []);
});

test('入参校验：单个字母的选项标签不因英文正文的同形开头被误拒', () => {
  assert.deepEqual(validateRound([call({
    detail: 'A note about how the panel opens today, and why that matters.',
    options: [{ label: 'A：扩展 /archive/guardCheck' }, { label: 'B：新建一层' }],
  })]), []);
});

test('入参校验：整行就是那个标签（没有后续解释）也算重述', () => {
  const violations = validateRound([call({
    detail: '两个方向：\n- 甲\n- 乙',
    options: [{ label: '甲：搬家' }, { label: '乙：不搬' }],
  })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /restates its options in detail/);
});

test('入参校验：选项名与解释之间空了一格也算重述', () => {
  const violations = validateRound([call({
    detail: '- 甲 · 详情页里的「配置」入口\n- 乙 · 列表里直接多一张卡片',
    options: [{ label: '甲：详情页里的配置入口' }, { label: '乙：列表里直接一张卡片' }],
  })]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /restates its options in detail/);
});

test('入参校验：正文里顺口提到选项名不算重述，只有「以选项名开头的条目」才算', () => {
  assert.deepEqual(validateRound([call({
    detail: '甲、乙两种做法各有代价，我倾向甲。\n\n选甲：也不用现在就定。',
    options: [{ label: '甲：详情页里的配置入口' }, { label: '乙：列表里直接一张卡片' }],
  })]), []);
});

test('入参校验：别名后面跟的是字而不是分隔符时不算重述', () => {
  assert.deepEqual(validateRound([call({
    detail: '保留现状的代价是每轮都要多看一眼。',
    options: [{ label: '保留现状' }, { label: '换个做法' }],
  })]), []);
});

test('入参校验：序号列表（全角括号）里的重述也认', () => {
  const violations = validateRound([call({
    detail: '1）甲：详情页里的配置入口\n2）乙：列表里直接一张卡片',
    options: [{ label: '甲：详情页里的配置入口' }, { label: '乙：列表里直接一张卡片' }],
  })]);
  assert.equal(violations.length, 1);
});

test('入参校验：没有选项的题，正文随便写', () => {
  assert.deepEqual(validateRound([call({ detail: '- 甲：随便写\n- 乙：也随便' })]), []);
});

// --- 推荐项默认勾上 ---

const recommended = (id, ...options) => ({
  id,
  options: options.map(([label, isRecommended]) => ({ label, displayLabel: label, recommended: isRecommended })),
});

test('默认勾选：标了推荐的选项，用户没动过这题时就是选中态', () => {
  const questions = [recommended('a', ['A：移走（推荐）', true], ['B：都留', false])];
  assert.deepEqual(applyRecommendedDefaults(questions, {}), { a: { selected: ['A：移走（推荐）'], custom: '' } });
});

test('默认勾选：多个推荐项一起勾上', () => {
  const questions = [recommended('a', ['A（推荐）', true], ['B（推荐）', true], ['C', false])];
  assert.deepEqual(applyRecommendedDefaults(questions, {}), { a: { selected: ['A（推荐）', 'B（推荐）'], custom: '' } });
});

test('默认勾选：用户动过这题就以他的为准，取消掉默认项也不许勾回来', () => {
  const questions = [recommended('a', ['A（推荐）', true], ['B', false])];
  assert.deepEqual(applyRecommendedDefaults(questions, { a: { selected: [], custom: '' } }), { a: { selected: [], custom: '' } });
  assert.deepEqual(applyRecommendedDefaults(questions, { a: { selected: ['B'], custom: '我自己写' } }), { a: { selected: ['B'], custom: '我自己写' } });
});

test('默认勾选：没有推荐的题不会凭空多出作答', () => {
  const questions = [recommended('a', ['A', false]), { id: 'b', options: [] }];
  assert.deepEqual(applyRecommendedDefaults(questions, {}), {});
});

test('默认勾选：题面还没读出来（或不是本插件的形状）时原样返回用户自己的作答', () => {
  assert.deepEqual(applyRecommendedDefaults([], { a: { selected: ['A'], custom: '' } }), { a: { selected: ['A'], custom: '' } });
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

test('导入：作答题为空时原样返回草稿', () => {
  assert.equal(applyImport('原样', ''), '原样');
});

// --- 只读判定：交回把本轮带过去的那条用户发言 ---

test('只读判定：这条调用之后出现用户发言（user 或 steering）才算本轮过去，并把那条发言交回来', () => {
  const user = { kind: 'user', seq: 9, content: [{ type: 'text', text: '作答' }] };
  const later = { kind: 'user', seq: 12, content: [{ type: 'text', text: '下一轮的话' }] };
  const nodes = [{ kind: 'tool-result', callId: 'call-1', seq: 5 }, user];
  assert.equal(userReplyAfter(nodes, 'call-1'), user, '交回来的必须是那条发言本身（反解要读它的文字）');
  assert.equal(userReplyAfter([...nodes, later], 'call-1'), user, '紧接着的那条说了算：更晚的属于后面的轮次');
  const steering = { kind: 'steering', seq: 7, content: [{ type: 'text', text: '边跑边补' }] };
  assert.equal(userReplyAfter([steering, ...nodes], 'call-1'), steering, '调用之后最早的那条说了算（steering 也算）');
  assert.equal(userReplyAfter([{ kind: 'user', seq: 3 }, { kind: 'tool-result', callId: 'call-1', seq: 5 }], 'call-1'), undefined);
  assert.equal(userReplyAfter([{ kind: 'assistant', seq: 7 }, { kind: 'tool-result', callId: 'call-1', seq: 5 }], 'call-1'), undefined);
});

test('只读判定：认不出这条调用、或还拿不到记录时一律当作还没过去', () => {
  assert.equal(userReplyAfter([{ kind: 'user', seq: 9 }], 'call-1'), undefined);
  assert.equal(userReplyAfter(undefined, 'call-1'), undefined);
  assert.equal(userReplyAfter([{ kind: 'tool-result', callId: 'call-1', seq: 5 }], undefined), undefined);
});

test('发言文字：把内容块里的文本段接起来，别的段忽略', () => {
  assert.equal(messageText({ content: [{ type: 'text', text: '第一段' }, { type: 'image' }, { type: 'text', text: '第二段' }] }), '第一段\n第二段');
  assert.equal(messageText({ content: [] }), '');
  assert.equal(messageText(undefined), '');
  assert.equal(messageText({}), '');
});

// --- 轮次定位：本轮里那次 grilling_form 调用 ---

/** 假 chat 快照：只做位置索引 + 按 key 取节点这两件事，形状与 ChatSnapshot 一致。 */
function fakeChat(nodes) {
  const byKey = new Map(nodes.map((node, index) => [`k${String(index)}`, node]));
  return {
    locations: { getTurn: () => [...byKey.keys()] },
    nodes: { get: (key) => byKey.get(key) },
  };
}
const chatNode = (root, extra = {}) => ({ kind: 'tool-call', data: { root }, ...extra });
const settledRoot = (overrides = {}) => ({
  kind: 'tool-result',
  callId: 'call-1',
  seq: 5,
  call: { name: TOOL_NAME, argsRaw: args([call()]) },
  content: [{ type: 'text', text: pending }],
  isError: false,
  ...overrides,
});

test('轮次定位：本轮里那条 grilling_form 调用连工具名与调用 id 一起交出来', () => {
  const chat = fakeChat([{ kind: 'user', data: {} }, chatNode(settledRoot())]);
  assert.deepEqual(roundCall(chat, 3), { block: settledRoot(), toolName: TOOL_NAME, callId: 'call-1' });
  assert.equal(roundCall(fakeChat([{ kind: 'user', data: {} }]), 3), undefined, '本轮没有这张表就什么都不画');
  assert.equal(roundCall(undefined, 3), undefined);
});

test('轮次定位：还没落结果的那次调用（工具名在 name 上）也认得出', () => {
  const runningRoot = { phase: 'start', callId: 'call-9', name: TOOL_NAME, argsRaw: '{}' };
  assert.deepEqual(roundCall(fakeChat([chatNode(runningRoot)]), 1), { block: runningRoot, toolName: TOOL_NAME, callId: 'call-9' });
});

test('轮次定位：本轮里别的工具不是这张表；被拒之后又投出的那次才算', () => {
  const other = chatNode({ ...settledRoot(), call: { name: 'bash', argsRaw: '{}' } });
  const rejected = chatNode(settledRoot({ seq: 4, content: [{ type: 'text', text: JSON.stringify({ rejected: true, violations: ['x'] }) }] }));
  const accepted = chatNode(settledRoot({ seq: 6 }));
  assert.equal(roundCall(fakeChat([other]), 1), undefined);
  assert.equal(roundCall(fakeChat([rejected, accepted]), 1).block.seq, 6, '被接受的那次是最后一次');
});

// --- 反解：按实发消息重画表单 ---

const reverseQuestions = [
  { id: 'h1', header: 'Q2 · Host 权威层', question: 'Host 权威层怎么改？', options: [{ label: 'A：扩展（推荐）', displayLabel: 'A：扩展', recommended: true }, { label: 'B：新建一层', displayLabel: 'B：新建一层', recommended: false }] },
  { id: 'h2', header: '', question: '范围呢？', options: [{ label: '甲：只改插件', displayLabel: '甲：只改插件' }] },
  { id: 'h3', header: '', question: '没答的题', options: [] },
];
const replyText = (body) => `${IMPORT_BLOCK_START}\n${body}\n${IMPORT_BLOCK_END}`;

test('反解：块里的每一行按「标题：项、项」回到作答表，选中的项记回归一化后的 label', () => {
  const answers = parseImportedAnswers(
    replyText('Q2 · Host 权威层：A：扩展、自填的一句\n范围呢？：甲：只改插件'),
    reverseQuestions,
  );
  assert.deepEqual(answers, {
    h1: { selected: ['A：扩展（推荐）'], custom: '自填的一句' },
    h2: { selected: ['甲：只改插件'], custom: '' },
    h3: { selected: [], custom: '' },
  });
});

test('反解：块里没出现的题就是没作答——连推荐默认也不会被勾回来', () => {
  const answers = parseImportedAnswers(replyText('范围呢？：甲：只改插件'), reverseQuestions);
  assert.deepEqual(answers.h1, { selected: [], custom: '' });
  assert.deepEqual(answers.h3, { selected: [], custom: '' });
});

test('反解：标题认不出时退回题干、再退回 id；三样都对不上的行不算数', () => {
  assert.deepEqual(parseImportedAnswers(replyText('Host 权威层怎么改？：A：扩展'), reverseQuestions).h1.selected, ['A：扩展（推荐）']);
  assert.deepEqual(parseImportedAnswers(replyText('h2：甲：只改插件'), reverseQuestions).h2.selected, ['甲：只改插件']);
  assert.equal(parseImportedAnswers(replyText('跟哪道题都对不上：随便'), reverseQuestions), undefined, '一条都还原不出来时退回本地那份');
});

test('反解：选项名对不上的项并进自填（包括含「、」的自填被拆开又拼回去）', () => {
  const questions = [{ id: 'a', header: 'Q1', question: '？', options: [{ label: 'A：这样', displayLabel: 'A：这样' }] }];
  assert.deepEqual(
    parseImportedAnswers(replyText('Q1：A：这样、两句都不够、我自己说：只改插件'), questions),
    { a: { selected: ['A：这样'], custom: '两句都不够、我自己说：只改插件' } },
  );
});

test('反解：没有块、起止行不配对、块里没东西时都退回本地那份', () => {
  assert.equal(parseImportedAnswers('我另外想说一句。', reverseQuestions), undefined);
  assert.equal(parseImportedAnswers(`${IMPORT_BLOCK_START}\nQ2 · Host 权威层：A：扩展`, reverseQuestions), undefined);
  assert.equal(parseImportedAnswers(replyText('   '), reverseQuestions), undefined);
  assert.equal(parseImportedAnswers(undefined, reverseQuestions), undefined);
});

test('反解：标题本身含「：」时，按认得出的那个分隔符切', () => {
  const questions = [{ id: 'a', header: '落点：插件页', question: '？', options: [{ label: '甲：铺在详情页', displayLabel: '甲：铺在详情页' }] }];
  assert.deepEqual(
    parseImportedAnswers(replyText('落点：插件页：甲：铺在详情页'), questions),
    { a: { selected: ['甲：铺在详情页'], custom: '' } },
  );
});

test('反解：块前后的用户原话不影响反解', () => {
  const text = `我另外想说一句。\n\n${replyText('Q2 · Host 权威层：A：扩展')}\n\n还有一句。`;
  assert.deepEqual(parseImportedAnswers(text, reverseQuestions).h1.selected, ['A：扩展（推荐）']);
});

test('冻结要用的那份作答：块在就以块为准，块拿不到就退回本地那份（含推荐默认）', () => {
  const parsed = frozenAnswers(reverseQuestions, { h1: { selected: ['B：新建一层'], custom: '本地改过' } }, replyText('范围呢？：甲：只改插件'));
  assert.deepEqual(parsed.h1, { selected: [], custom: '' }, '实发消息里没有这题就是没作答，本地那份不许插嘴');
  const fallback = frozenAnswers(reverseQuestions, { h2: { selected: [], custom: '本地自填' } }, '没有块');
  assert.deepEqual(fallback.h1.selected, ['A：扩展（推荐）'], '退回本地那份时推荐默认照旧生效');
  assert.deepEqual(fallback.h2, { selected: [], custom: '本地自填' });
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
  // c 是「用户把这题清空了」，不是脏数据：默认勾选靠它才不会被勾回来
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { a: { selected: ['A'], custom: '' }, c: { selected: [], custom: '' } });
  assert.deepEqual(readStoredForm(fakeStorage({ [key]: '{ 坏 JSON' }), key, 'call-1'), {});
  assert.deepEqual(readStoredForm(undefined, key, 'call-1'), {});
});

test('持久化：形状不对的记录被丢掉——它不该冒充「用户清空过」而吃掉默认勾选', () => {
  const key = formStorageKey('sess-1');
  const storage = fakeStorage({
    [key]: JSON.stringify({ 'call-1': { a: { selected: 'garbage' }, b: { selected: [], custom: '' } } }),
  });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { b: { selected: [], custom: '' } });
});

test('持久化：取消掉默认勾选这件事存得住——重新读回来仍是「清空过」而不是「没作答」', () => {
  const storage = fakeStorage();
  const key = formStorageKey('sess-1');
  writeStoredForm(storage, key, 'call-1', { a: { selected: [], custom: '' } });
  assert.deepEqual(readStoredForm(storage, key, 'call-1'), { a: { selected: [], custom: '' } });
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

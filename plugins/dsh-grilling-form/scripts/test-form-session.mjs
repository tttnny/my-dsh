// 表单会话（内壳）的单测：一轮表单从投出到冻结的全部**组合规则**都收在这一个 interface 后面——
// 用户自己那份作答、叠在上面的推荐默认、冻结判定、写穿顺序、导入门禁、被取代。
// 这些规则只有这一个 owner：视图组件只持 state、照着渲染，不自己拼组合。
//
// 低层纯函数（form-model.js）照旧各自直接可测，这里测的是它们的组合方式。
import assert from 'node:assert/strict';
import { carriedAnswers, createFormSession, initialFormAnswers } from '../src/form-session.js';

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

/** 只有 getItem/setItem 的假存储。 */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    dump: () => Object.fromEntries(map),
  };
}

const SESSION = 'sess-1';
/** 这一轮的调用 id。**4 位字母数字**：作答块里的身份记号就是它自己（shortFormId 的产物）。 */
const CALL = 'c001';
const MARK = CALL;
const KEY = `dsh-grilling-form.${SESSION}`;
const questions = [
  {
    id: '1',
    number: 1,
    question: '落点放哪？',
    type: 'multi',
    options: [
      { label: 'A：详情页', recommended: true },
      { label: 'B：列表里', recommended: false },
    ],
  },
  { id: '2', number: 2, question: '范围呢？', type: 'free', options: [] },
];
/** 一道单选：一题至多留一项。 */
const singleQuestion = {
  id: '1',
  number: 1,
  question: '继续吗？',
  type: 'single',
  options: [
    { label: '继续', recommended: true },
    { label: '停一下', recommended: false },
  ],
};
/** 一张表的作答块。这里的调用 id 都写成「自己就是自己的记号」（4 位字母数字）。 */
const blockWith = (callId, body) => (
  body === '' ? `【拷问作答 ${callId}】\n【/拷问作答】` : `【拷问作答 ${callId}】\n${body}\n【/拷问作答】`
);
/** 这一轮（CALL）那张作答块。 */
const blockOf = (body) => blockWith(MARK, body);
const sessionOf = (overrides = {}) => createFormSession({
  questions,
  sessionId: SESSION,
  callId: CALL,
  superseded: false,
  storage: fakeStorage(),
  storedAnswers: {},
  draft: '',
  ...overrides,
});

test('可填态：推荐项默认勾上，但默认不落进 storage（用户没动过就不算他的作答）', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage });
  assert.equal(session.readOnly, false);
  assert.equal(session.superseded, false);
  assert.deepEqual(session.answers['1'], { selected: ['A：详情页'], custom: '' });
  assert.match(session.importInto(''), /^【拷问作答 /, '还没动过也能导：空作答也是一次作答');
  assert.deepEqual(storage.dump(), {}, '一进页面就把默认写进 storage，用户就再也分不清「取消过」与「没作答」');
});

test('勾选：写穿到 storage，返回给调用方的是用户自己那份（含他刚勾的）', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage });
  const merged = session.toggle('1', 'B：列表里');
  assert.deepEqual(merged['1'].selected.sort(), ['A：详情页', 'B：列表里'].sort());
  assert.deepEqual(JSON.parse(storage.dump()[KEY])[CALL]['1'].selected.sort(), ['A：详情页', 'B：列表里'].sort());
});

test('取消默认推荐：写一条空记录（清空过 ≠ 没作答），重建会话也不会勾回来', () => {
  const storage = fakeStorage();
  const first = sessionOf({ storage });
  const merged = first.toggle('1', 'A：详情页');
  assert.deepEqual(merged['1'], { selected: [], custom: '' });
  const second = sessionOf({ storage, storedAnswers: merged });
  assert.deepEqual(second.answers['1'], { selected: [], custom: '' });
  assert.match(second.importInto(''), /^【拷问作答 /, '一条作答都没有也导得出去——「我明确什么都没选」就是这一次作答');
});

test('自填与勾选各自独立，落在同一份记录里', () => {
  const storage = fakeStorage();
  const first = sessionOf({ storage });
  const afterToggle = first.toggle('1', 'B：列表里');
  const afterCustom = sessionOf({ storage, storedAnswers: afterToggle }).setCustom('2', '只改插件');
  assert.deepEqual(afterToggle['1'].selected.sort(), ['A：详情页', 'B：列表里'].sort());
  assert.deepEqual(afterCustom['2'], { selected: [], custom: '只改插件' });
  assert.deepEqual(JSON.parse(storage.dump()[KEY])[CALL]['2'], { selected: [], custom: '只改插件' });
});

test('导入：块带这张表的身份记号、题号一行、每项一行；没有块就放在最前，别处的字一个不动', () => {
  const session = sessionOf();
  assert.equal(
    session.importInto('我另外想说一句。'),
    `【拷问作答 ${MARK}】\n1.\n- A：详情页\n【/拷问作答】\n\n我另外想说一句。`,
  );
  const again = sessionOf();
  const draft = `【拷问作答 ${MARK}】\n1.\n- 旧的一行\n【/拷问作答】\n\n后面的话`;
  assert.equal(again.importInto(draft), `【拷问作答 ${MARK}】\n1.\n- A：详情页\n【/拷问作答】\n\n后面的话`);
});

test('导入：一项作答都没有时导出的是一块只有起止行的空块', () => {
  const empty = sessionOf({ storedAnswers: { 1: { selected: [], custom: '' }, 2: { selected: [], custom: '' } } });
  assert.equal(empty.importInto(''), `【拷问作答 ${MARK}】\n【/拷问作答】`);
  assert.equal(empty.importInto('我另外想说一句。'), `【拷问作答 ${MARK}】\n【/拷问作答】\n\n我另外想说一句。`);
});

test('导入：草稿里别的表的块一个不动', () => {
  const other = `【拷问作答 zzzz】\n1.\n- 别的表\n【/拷问作答】`;
  assert.match(sessionOf().importInto(other), /【拷问作答 zzzz】\n1\.\n- 别的表\n【\/拷问作答】/);
});

test('草稿状态：没块＝还没导入、块正是当前这份＝已导入、块旧了＝要更新、冻结了＝没得导', () => {
  const session = sessionOf();
  assert.equal(session.draftState, 'none');
  assert.equal(sessionOf({ draft: session.importInto('') }).draftState, 'current');
  const changed = sessionOf({ storedAnswers: { 2: { selected: [], custom: '改过了' } }, draft: session.importInto('') });
  assert.equal(changed.draftState, 'stale', '表单改过之后草稿里那份就旧了');
  assert.equal(sessionOf({ storedAnswers: { 1: { selected: [], custom: '' } }, draft: '' }).draftState, 'none', '空作答的块也算块，只是没导入');
  assert.equal(sessionOf({ replyText: blockOf('2.\n- 只改插件'), draft: '' }).draftState, 'empty', '冻结之后没有导入这回事');
  assert.equal(sessionOf({ superseded: true, draft: '' }).draftState, 'empty');
});

test('单选：再勾一个就换掉上一个，一题至多留一项；自填照旧留着', () => {
  const storage = fakeStorage();
  const first = sessionOf({ questions: [singleQuestion], storage });
  assert.deepEqual(first.answers['1'], { selected: ['继续'], custom: '' }, '推荐项默认一项');
  const afterStop = sessionOf({ questions: [singleQuestion], storage, storedAnswers: first.toggle('1', '停一下') });
  assert.deepEqual(afterStop.answers['1'].selected, ['停一下']);
  const afterCustom = sessionOf({ questions: [singleQuestion], storage, storedAnswers: afterStop.setCustom('1', '我自己定') });
  assert.deepEqual(afterCustom.answers['1'], { selected: ['停一下'], custom: '我自己定' });
  const afterToggleOff = sessionOf({ questions: [singleQuestion], storage, storedAnswers: afterCustom.toggle('1', '停一下') });
  assert.deepEqual(afterToggleOff.answers['1'], { selected: [], custom: '我自己定' }, '再点一下是取消，自填不跟着掉');
});

test('冻结：按实发消息重画，写操作改不动（原样返回），导入键关掉', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage, replyText: blockOf('2.\n- 只改插件') });
  assert.equal(session.readOnly, true);
  assert.equal(session.fallback, false);
  assert.deepEqual(session.answers['1'], { selected: [], custom: '' }, '块里没有的题就是没作答，推荐默认不许勾回来');
  assert.deepEqual(session.answers['2'], { selected: [], custom: '只改插件' });
  assert.equal(session.importInto('草稿'), '草稿', '冻结之后没有导入这回事');
  const unchanged = session.toggle('1', 'B：列表里');
  assert.deepEqual(unchanged, {}, '冻结之后不写 storage，也不改任何一把表');
  assert.deepEqual(storage.dump(), {});
});

test('冻结：块坏了才退回本地那份（内容不凭空消失），并标出这是退回的一份', () => {
  const session = sessionOf({
    storedAnswers: { 2: { selected: [], custom: '本地自填' } },
    replyText: blockOf('跟哪道题都对不上：随便'),
  });
  assert.equal(session.fallback, true);
  assert.deepEqual(session.answers['1'], { selected: ['A：详情页'], custom: '' });
  assert.deepEqual(session.answers['2'], { selected: [], custom: '本地自填' });
});

test('被取代：跟冻结一样不可填、不可导，但不是退回本地那份', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage, superseded: true, storedAnswers: { 2: { selected: [], custom: '本地自填' } } });
  assert.equal(session.readOnly, true);
  assert.equal(session.superseded, true);
  assert.equal(session.fallback, false);
  assert.equal(session.importInto('草稿'), '草稿');
  assert.deepEqual(storage.dump(), {});
});

test('storage 不可用：照常可填、照样导入，只是刷新后不恢复', () => {
  const session = sessionOf({ storage: undefined });
  const merged = session.setCustom('2', 'x');
  assert.deepEqual(merged['2'], { selected: [], custom: 'x' });
  assert.match(session.importInto(''), /^【拷问作答 /);
});

test('initialFormAnswers：按会话 + 轮次读回用户自己那份，读不到就是空', () => {
  const storage = fakeStorage({
    [KEY]: JSON.stringify({ [CALL]: { 1: { selected: [], custom: '上次写的' } }, 'call-2': { 1: { selected: [], custom: '别轮' } } }),
  });
  assert.deepEqual(initialFormAnswers({ sessionId: SESSION, callId: CALL, storage }), { 1: { selected: [], custom: '上次写的' } });
  assert.deepEqual(initialFormAnswers({ sessionId: '别的会话', callId: CALL, storage }), {});
  assert.deepEqual(initialFormAnswers({ sessionId: SESSION, callId: CALL, storage: undefined }), {});
});


test('草稿状态：空作答导出去之后按键就说「已导入」，而不是一直催他「更新输入框」', () => {
  const empty = sessionOf({ storedAnswers: { 1: { selected: [], custom: '' } } });
  assert.equal(empty.draftState, 'none');
  assert.equal(empty.importInto(''), blockOf(''));
  assert.equal(sessionOf({ storedAnswers: { 1: { selected: [], custom: '' } }, draft: empty.importInto('') }).draftState, 'current');
});

test('取代时的搬运：勾选从被取代那张表搬过来，这一轮自己那份优先', () => {
  const storage = fakeStorage({
    [KEY]: JSON.stringify({
      [CALL]: { 1: { selected: ['B：列表里'], custom: '旧表的自填' } },
      'new-call': { 2: { selected: [], custom: '这一轮自己填的' } },
    }),
  });
  const replaced = { callId: CALL, questions };
  const carried = carriedAnswers({ sessionId: SESSION, storage, replaced, questions });
  assert.deepEqual(carried, { 1: { selected: ['B：列表里'], custom: '旧表的自填' } });
  assert.deepEqual(
    initialFormAnswers({ sessionId: SESSION, callId: 'new-call', storage, carried }),
    { 1: { selected: ['B：列表里'], custom: '旧表的自填' }, 2: { selected: [], custom: '这一轮自己填的' } },
    '搬过来的只补缺席的题，用户已经动过的地方以他的为准',
  );
  assert.equal(carriedAnswers({ sessionId: SESSION, storage, replaced: undefined, questions }), undefined, '没有取代者就没有搬运');
});

test('取代时的搬运：导入时草稿里旧表那块一并换成这一轮的，旧勾选不再留在草稿里', () => {
  const session = sessionOf({ replacedCallId: 'old1' });
  const draft = `我另外想说一句。\n\n${blockWith('old1', '1.\n- 旧勾选')}`;
  const next = session.importInto(draft);
  assert.match(next, /1\.\n- A：详情页/);
  assert.doesNotMatch(next, /旧勾选/);
  assert.match(next, /我另外想说一句。/, '用户自己手打的字一个不动');
});


console.log(`${passed}/${passed + failures.length} passed`);
if (failures.length > 0) process.exitCode = 1;

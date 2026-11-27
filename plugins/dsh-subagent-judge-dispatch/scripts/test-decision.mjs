/**
 * Decision-core self-check: what the plugin writes, and what it refuses to.
 *
 * The load-bearing assertion here is the negative one. "A failed judgement
 * writes nothing" is the rule that keeps a judge outage from silently
 * re-routing every delegation, and the only way to know the rule has teeth is
 * to assert the untouched object comes back by identity.
 *
 * Run: node scripts/test-decision.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decideRewrite,
  outcomeReason,
} from '../src/server/dispatch.ts';
import {
  buildJudgeRequest,
  buildPreview,
  buildProbeRequest,
  composeJudgeSubject,
  isRowEnabled,
  numberTypeRows,
  readChoice,
  readJudgeAnswer,
  selectableRows,
  SUBJECT_HEAD_CHARS,
  SUBJECT_TAIL_CHARS,
} from '../src/server/judge-prompt.ts';
import { judgeTaskType, probeJudge } from '../src/server/judge-client.ts';
import { LogStore, LOG_KEEP, LOG_PAGE_LIMIT } from '../src/server/log-store.ts';
import { readPluginConfig, isJudgeUsable } from '../src/server/config.ts';
import { resolveEndpointUrl } from '../src/server/endpoint.ts';
import {
  createFetchRoutes,
  LOG_ROUTE_PATH,
  PROBE_ROUTE_PATH,
  PREVIEW_ROUTE_PATH,
} from '../src/server/router.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

/** 落盘要用的临时家目录：仓库根的 tmp/，进程退出时删掉。 */
const tmpRoot = join(root, '..', '..', 'tmp');
await fs.mkdir(tmpRoot, { recursive: true });
const tmpHome = await fs.mkdtemp(join(tmpRoot, 'judge-log-'));
process.on('exit', () => {
  try {
    rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    // 临时目录删不掉不影响自检结论。
  }
});

/** 一份指向临时目录的日志，避免自检写到真实的家目录。 */
function newLog(fileName = 'judgements.json') {
  return new LogStore(join(tmpHome, fileName));
}

/** 造一条日志记录，只覆盖要断言的那几项。 */
function entryAt(typeId) {
  return {
    typeId, provider: 'p', model: 'm', effort: 'low', at: typeId,
    latencyMs: 1, metrics: { judgeModel: 'judge-x', optionCount: 2, subjectLength: 5 },
  };
}

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

/** One row, filled in and switched on unless a field is overridden. */
function row(overrides = {}) {
  return {
    id: 1,
    enabled: true,
    description: '机械修改',
    provider: 'd1api',
    model: 'deepseek-v4.1-flash',
    effort: 'low',
    ...overrides,
  };
}

console.log(`# ${root}`);

await test('判断成功时三项一起写出', () => {
  const outcome = { kind: 'matched', row: row(), latencyMs: 12 };
  const decision = decideRewrite(outcome);
  assert.equal(decision.kind, 'rewrite');
  assert.deepEqual(decision.rewrite, {
    provider: 'd1api',
    model: 'deepseek-v4.1-flash',
    reasoningEffort: 'low',
  });
});

await test('判断失败时一个字段都不写', () => {
  for (const reason of ['unreachable', 'timeout', 'unmatched', 'incomplete']) {
    const decision = decideRewrite({ kind: 'fallback', reason, latencyMs: 3 });
    assert.equal(decision.kind, 'none', `reason=${reason} 不该产生改写`);
  }
});

await test('行里缺提供方或强度时也不写', () => {
  for (const broken of [
    row({ provider: '' }),
    row({ model: '' }),
    row({ effort: '' }),
    row({ model: '   ' }),
  ]) {
    const decision = decideRewrite({ kind: 'matched', row: broken, latencyMs: 1 });
    assert.equal(decision.kind, 'none', `残缺行 ${JSON.stringify(broken)} 不该产生改写`);
  }
});

await test('改写时三项齐全，强度不被丢掉', () => {
  const decision = decideRewrite({ kind: 'matched', row: row({ effort: 'max' }), latencyMs: 1 });
  assert.equal(decision.kind, 'rewrite');
  assert.equal(decision.rewrite.provider, 'd1api');
  assert.equal(decision.rewrite.model, 'deepseek-v4.1-flash');
  assert.equal(decision.rewrite.reasoningEffort, 'max');
});

await test('只把填全的行交给判断模型', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, model: '' }),
    row({ id: 3, effort: '  ' }),
    row({ id: 4, provider: '' }),
    row({ id: 5, model: 'kimi-k3', provider: 'a6api', effort: 'high' }),
  ];
  const usable = selectableRows(rows);
  assert.deepEqual(usable.map((r) => r.id), [1, 5]);
});

await test('关掉的行不交给判断模型，哪怕它填得全', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 0, enabled: false, description: '暂时关掉的' }),
    row({ id: 2, description: '评审代码' }),
  ];
  assert.deepEqual(selectableRows(rows).map((r) => r.description), ['机械修改', '评审代码']);
});

await test('缺 enabled 的行当作打开，只有显式 false 才算关掉', () => {
  assert.equal(isRowEnabled({}), true);
  assert.equal(isRowEnabled({ enabled: undefined }), true);
  assert.equal(isRowEnabled({ enabled: true }), true);
  assert.equal(isRowEnabled({ enabled: false }), false);
});

await test('编号只数交给判断模型的行，按清单顺序从 1 连续', () => {
  const numbered = numberTypeRows([
    { enabled: true, description: 'a', provider: 'p', model: 'm1', effort: 'low' },
    { enabled: false, description: 'b', provider: 'p', model: 'm2', effort: 'low' },
    { enabled: true, description: 'c', provider: 'p', model: 'm3', effort: 'low' },
    { description: 'd', provider: 'p', model: 'm4', effort: 'low' },
  ]);
  assert.deepEqual(numbered.map((r) => r.id), [1, 0, 2, 3], '关掉的行不带编号，后面的行接上');
  assert.deepEqual(numbered.map((r) => r.description), ['a', 'b', 'c', 'd'], '顺序就是清单顺序');
});

await test('编号跳过没填全的行，有效列表没有缺号', () => {
  const numbered = numberTypeRows([
    { enabled: true, description: 'a', provider: 'p', model: 'm1', effort: 'low' },
    { enabled: true, description: 'b', provider: 'p', model: '', effort: 'low' },
    { enabled: true, description: 'c', provider: 'p', model: 'm3', effort: 'low' },
  ]);
  assert.deepEqual(numbered.map((r) => r.id), [1, 0, 2], '没填全的行同样不带编号');
  const offered = selectableRows(numbered);
  assert.deepEqual(offered.map((r) => r.id), [1, 2], '交给判断模型的编号连续，没有缺号');
  assert.deepEqual(
    Object.keys(buildJudgeRequest(offered, 'judge-x', '任务正文').questions.task_type.criteria),
    ['1', '2'],
  );
});

await test('一行都没打开时没有任何编号', () => {
  assert.deepEqual(numberTypeRows([
    { enabled: false, provider: 'p', model: 'm', effort: 'low' },
    { enabled: false, provider: 'p', model: 'm', effort: 'low' },
  ]).map((r) => r.id), [0, 0]);
  assert.deepEqual(numberTypeRows([]).map((r) => r.id), []);
});

await test('判断请求的编号连续，关掉的行不在 criteria 里', () => {
  const rows = numberTypeRows([
    { enabled: true, description: '机械修改', provider: 'd1api', model: 'm1', effort: 'low' },
    { enabled: false, description: '暂时关掉的', provider: 'd1api', model: 'm2', effort: 'low' },
    { enabled: true, description: '评审代码', provider: 'a6api', model: 'k3', effort: 'high' },
  ]);
  const request = buildJudgeRequest(selectableRows(rows), 'judge-x', '任务正文');
  assert.deepEqual(request.questions.task_type.criteria, { '1': '机械修改', '2': '评审代码' });
});

await test('预览同样只列打开的行，编号与判断请求一致', () => {
  const rows = numberTypeRows([
    { enabled: false, description: '暂时关掉的', provider: 'd1api', model: 'm2', effort: 'low' },
    { enabled: true, description: '机械修改', provider: 'd1api', model: 'm1', effort: 'low' },
  ]);
  const preview = JSON.parse(buildPreview(selectableRows(rows), 'judge-x'));
  assert.deepEqual(preview.questions.task_type.criteria, { '1': '机械修改' });
});

await test('预览、判断请求与答复读取用的是同一份编号', () => {
  const offered = selectableRows(numberTypeRows([
    { enabled: true, description: 'a', provider: 'p', model: 'm1', effort: 'low' },
    { enabled: false, description: 'b', provider: 'p', model: 'm2', effort: 'low' },
    { enabled: true, description: 'c', provider: 'p', model: '', effort: 'low' },
    { enabled: true, description: 'd', provider: 'p', model: 'm4', effort: 'low' },
  ]));
  const request = buildJudgeRequest(offered, 'judge-x', '任务正文');
  const preview = JSON.parse(buildPreview(offered, 'judge-x'));
  assert.deepEqual(request.questions.task_type.criteria, { '1': 'a', '2': 'd' });
  assert.deepEqual(preview.questions.task_type.criteria, request.questions.task_type.criteria);
  const decision = readJudgeAnswer({ answers: { task_type: { choice: '2' } } }, offered);
  assert.equal(decision.kind, 'row');
  assert.equal(decision.row.description, 'd', '答复的 2 就是预览里编号 2 的那行');
});

await test('答复按打开行的编号认，关掉的行原来的位置由后面的行接上', () => {
  const offered = selectableRows(numberTypeRows([
    { enabled: true, description: 'A', provider: 'p', model: 'm1', effort: 'low' },
    { enabled: false, description: 'B', provider: 'p', model: 'm2', effort: 'low' },
    { enabled: true, description: 'C', provider: 'p', model: 'm3', effort: 'low' },
  ]));
  const decision = readJudgeAnswer({ answers: { task_type: { choice: '2' } } }, offered);
  assert.equal(decision.kind, 'row');
  assert.equal(decision.row.description, 'C');
  // 关掉的那一行原来的位置已经没有编号了，答复它算对不上清单。
  assert.equal(readJudgeAnswer({ answers: { task_type: { choice: '3' } } }, offered).kind, 'unmatched');
});

await test('判断选中一个被关掉的行时不改写', () => {
  const outcome = { kind: 'matched', row: row({ enabled: false }), latencyMs: 1 };
  const decision = decideRewrite(outcome);
  assert.equal(decision.kind, 'none');
  assert.equal(outcomeReason(outcome, decision), 'incomplete');
});

await test('改写成功时日志不记原因', () => {
  const outcome = { kind: 'matched', row: row(), latencyMs: 3 };
  assert.equal(outcomeReason(outcome, decideRewrite(outcome)), undefined);
});

await test('四种失败原因各记各的，选中的残缺行记 incomplete', () => {
  for (const reason of ['unreachable', 'timeout', 'unmatched']) {
    const outcome = { kind: 'fallback', reason, latencyMs: 3 };
    assert.equal(outcomeReason(outcome, decideRewrite(outcome)), reason);
  }
  // 判断本身成功了，但它选中的那一行填不全：这是第五种，与「答复对不上清单」不同。
  const incomplete = { kind: 'matched', row: row({ effort: '' }), latencyMs: 3 };
  assert.equal(outcomeReason(incomplete, decideRewrite(incomplete)), 'incomplete');
});

await test('判断请求的形状：一个问题、键是编号、值是描述', () => {
  const request = buildJudgeRequest([row({ id: 1 }), row({ id: 2, description: '评审代码' })], 'judge-x', '任务正文');
  assert.equal(request.model, 'judge-x');
  assert.deepEqual(request.state, { message: '任务正文' });
  const question = request.questions.task_type;
  assert.equal(question.type, 'choice');
  assert.deepEqual(Object.keys(question.criteria), ['1', '2']);
  assert.equal(question.criteria['2'], '评审代码');
  assert.ok(question.instructions.length > 0);
});

await test('判断模型的输入：标签在前、任务正文在后', () => {
  assert.equal(
    composeJudgeSubject('评审一处改动', '评审 src 下这一组改动，只看不写'),
    'Delegation label: 评审一处改动\n\n评审 src 下这一组改动，只看不写',
  );
});

await test('没有标签时只发任务正文，不留空标签行', () => {
  assert.equal(composeJudgeSubject('', '把测试跑一遍'), '把测试跑一遍');
  assert.equal(composeJudgeSubject('   ', '把测试跑一遍'), '把测试跑一遍');
});

await test('只有标签没有任务正文时只发标签', () => {
  assert.equal(composeJudgeSubject('评审一处改动', ''), 'Delegation label: 评审一处改动');
  assert.equal(composeJudgeSubject('评审一处改动', '   '), 'Delegation label: 评审一处改动');
});

await test('两样都没有时输入为空，判断仍然照常发出去', () => {
  assert.equal(composeJudgeSubject('', ''), '');
});

await test('短任务原样发，一个字都不动', () => {
  const task = '把测试跑一遍，跑完把失败的用例名贴回来。';
  assert.equal(composeJudgeSubject('', task), task);
});

await test('长任务留开头与结尾，中间省掉的字数写明白', () => {
  const head = '甲'.repeat(SUBJECT_HEAD_CHARS);
  const middle = '乙'.repeat(500);
  const tail = '丙'.repeat(SUBJECT_TAIL_CHARS);
  const subject = composeJudgeSubject('', head + middle + tail);
  assert.ok(subject.startsWith(head), '开头照留');
  assert.ok(subject.endsWith(tail), '结尾照留');
  assert.doesNotMatch(subject, /乙/, '中间那段不在里面');
  assert.match(subject, /500 characters omitted/);
});

await test('刚好到上限的任务不算被截断', () => {
  const exact = '丁'.repeat(SUBJECT_HEAD_CHARS + SUBJECT_TAIL_CHARS);
  assert.equal(composeJudgeSubject('', exact), exact);
  assert.doesNotMatch(composeJudgeSubject('', exact), /omitted/);
});

await test('预览里标签与任务正文两处都标注派工时才填，且不含自发编造的任务', () => {
  const preview = buildPreview([row()], 'judge-x');
  const parsed = JSON.parse(preview);
  assert.match(parsed.state.message, /Delegation label: .*派工时才填/);
  assert.match(parsed.state.message, /派工时才填/);
  assert.equal(
    parsed.state.message,
    'Delegation label: （派工时才填：派工标签）\n\n（派工时才填：任务正文）',
  );
});

await test('答复读取：三种形状都认', () => {
  assert.equal(readChoice({ answers: { task_type: { choice: '3' } } }), '3');
  assert.equal(readChoice({ task_type: { choice: '3' } }), '3');
  assert.equal(readChoice({ answers: { task_type: { choice: 3 } } }), '3');
  assert.equal(readChoice({ answers: { task_type: { choice: '  2  ' } } }), '2');
});

await test('答复读取：空值与非字符串都算没有答复', () => {
  for (const payload of [
    undefined,
    null,
    {},
    { answers: {} },
    { answers: { task_type: {} } },
    { answers: { task_type: { choice: '' } } },
    { answers: { task_type: { choice: '   ' } } },
    { answers: { task_type: { choice: {} } } },
    { answers: { other: { choice: '1' } } },
  ]) {
    assert.equal(readChoice(payload), undefined, `${JSON.stringify(payload)} 应算没有答复`);
  }
});

await test('答复匹配：编号对上清单才算选中', () => {
  const rows = [row({ id: 1 }), row({ id: 3, description: '评审代码' })];
  assert.equal(readJudgeAnswer({ answers: { task_type: { choice: '3' } } }, rows).kind, 'row');
  // 清单里没有这个编号
  assert.equal(readJudgeAnswer({ answers: { task_type: { choice: '2' } } }, rows).kind, 'unmatched');
  // 非数字
  assert.equal(readJudgeAnswer({ answers: { task_type: { choice: '评审' } } }, rows).kind, 'unmatched');
  // 空答复
  assert.equal(readJudgeAnswer({ answers: { task_type: {} } }, rows).kind, 'empty');
});

await test('判断调用：连不上时落到 unreachable，不抛错', async () => {
  const outcome = await judgeTaskType(
    { url: 'http://127.0.0.1:1/v1/systemone', model: 'judge-x', apiKey: '' },
    [row()],
    '任务正文',
    async () => {
      throw new Error('connection refused');
    },
  );
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'unreachable');
});

await test('判断调用：端点答非 200 时也落到 unreachable', async () => {
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [row()],
    '任务正文',
    async () => new Response('nope', { status: 500 }),
  );
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'unreachable');
});

await test('判断调用：答复里的编号对不上清单时落到 unmatched', async () => {
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [row({ id: 1 })],
    '任务正文',
    async () => new Response(JSON.stringify({ answers: { task_type: { choice: '9' } } }), { status: 200 }),
  );
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'unmatched');
});

await test('判断调用：答复为空时落到 unmatched', async () => {
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [row({ id: 1 })],
    '任务正文',
    async () => new Response(JSON.stringify({ answers: { task_type: {} } }), { status: 200 }),
  );
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'unmatched');
});

await test('判断调用：成功时带回选中的行与耗时', async () => {
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: 'k' },
    [row({ id: 2, description: '评审代码' })],
    '任务正文',
    async () => new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 }),
  );
  assert.equal(outcome.kind, 'matched');
  assert.equal(outcome.row.description, '评审代码');
  assert.ok(Number.isFinite(outcome.latencyMs));
  assert.deepEqual(outcome.metrics, { judgeModel: 'judge-x', optionCount: 1, subjectLength: 4 });
  assert.equal(Object.hasOwn(outcome, 'prompt'), false);
});

await test('判断调用：没有清单可选项时不发请求', async () => {
  let called = false;
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [],
    '任务正文',
    async () => {
      called = true;
      return new Response('{}', { status: 200 });
    },
  );
  assert.equal(called, false, '空清单不该发出请求');
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.metrics, undefined);
});

await test('判断调用：超时走 timeout，且不重试', async () => {
  let calls = 0;
  let signal;
  let finishResponse;
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [row()],
    '任务正文',
    async (_url, init) => {
      calls += 1;
      signal = init.signal;
      return new Promise((resolve) => { finishResponse = resolve; });
    },
  );
  assert.equal(calls, 1, '不重试');
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'timeout');
  assert.equal(signal.aborted, true);
  finishResponse(new Response('{}'));
});

await test('日志：文件留最近 200 条，新的在前', async () => {
  const store = newLog('keep.json');
  await store.init();
  for (let i = 1; i <= LOG_KEEP + 5; i += 1) store.append(entryAt(i));
  const list = store.list();
  assert.equal(list.length, LOG_KEEP);
  assert.equal(list[0].typeId, LOG_KEEP + 5);
  assert.equal(list[LOG_KEEP - 1].typeId, 6);
});

await test('日志：页面那一层只取最近 10 条，文件里还有更多', async () => {
  const store = newLog('page.json');
  await store.init();
  for (let i = 1; i <= 25; i += 1) store.append(entryAt(i));
  assert.equal(LOG_PAGE_LIMIT, 10);
  const all = store.list();
  const page = all.slice(0, LOG_PAGE_LIMIT);
  assert.equal(page.length, 10);
  assert.equal(page[0].typeId, 25);
  assert.equal(page[9].typeId, 16);
  assert.ok(all.length > page.length, '文件里的记录比页面展示的多');
});

await test('日志：换了进程也读得回来', async () => {
  const file = join(tmpHome, 'restart.json');
  const first = new LogStore(file);
  await first.init();
  first.append(entryAt(1));
  await first.flush();

  const second = new LogStore(file);
  await second.init();
  const list = second.list();
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], entryAt(1));
});

await test('日志：多个进程从同一个初始快照追加时写入只保留最新记录', async () => {
  const file = join(tmpHome, 'shared.json');
  const url = new URL('../src/server/log-store.ts', import.meta.url).href;
  const writer = [
    `import { LogStore } from ${JSON.stringify(url)};`,
    `import { once } from 'node:events';`,
    'const store = new LogStore(process.argv[1]);',
    'await store.init();',
    'const go = once(process.stdin, "data");',
    'process.stdout.write("ready\\n");',
    'await go;',
    'const block = Number(process.argv[2]);',
    'for (let index = 1; index <= 60; index++) {',
    '  const at = block * 60 + index;',
    '  store.append({ at, typeId: at, provider: "p", model: "m", effort: "low", latencyMs: 1 });',
    '}',
    'await store.flush();',
  ].join('\n');
  const workers = Array.from({ length: 4 }, (_, index) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', writer, file, String(index)], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const closed = once(child, 'close');
    const ready = Promise.race([
      once(child.stdout, 'data'),
      closed.then(() => { throw new Error('日志子进程未就绪'); }),
    ]);
    return { child, ready, closed };
  });
  try {
    await Promise.all(workers.map(({ ready }) => ready));
    for (const { child } of workers) child.stdin.end('go');
    for (const { closed } of workers) assert.deepEqual(await closed, [0, null]);
    const reader = new LogStore(file);
    const entries = await reader.readLatest();
    assert.deepEqual(entries.map(({ at }) => at), Array.from({ length: LOG_KEEP }, (_, index) => 240 - index));
  } finally {
    for (const { child } of workers) child.stdin.end();
    await Promise.allSettled(workers.map(({ closed }) => closed));
  }
});

await test('日志：旧记录或调用者携带的自由文本不会落盘或返回', async () => {
  const file = join(tmpHome, 'private.json');
  const withText = (id) => ({
    ...entryAt(id),
    requestSummary: 'task text', childLabel: 'task label', parentTitle: 'title text',
    metrics: { ...entryAt(id).metrics, extra: 'private criteria' },
  });
  await fs.writeFile(file, JSON.stringify([withText(1)]), 'utf8');
  const store = new LogStore(file);
  assert.deepEqual(await store.readLatest(), [entryAt(1)]);
  store.append(withText(2));
  await store.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), [entryAt(2), entryAt(1)]);
});

await test('日志：先追加后读盘时，刚记下的一条不会被旧记录盖掉', async () => {
  const file = join(tmpHome, 'race.json');
  await fs.writeFile(file, JSON.stringify([entryAt(1)]), 'utf-8');
  const store = new LogStore(file);
  // 故意不等 init：追加发生在读盘回来之前，两条都要留住。
  const loading = store.init();
  store.append(entryAt(2));
  await loading;
  await store.flush();
  const list = store.list();
  assert.deepEqual(list, [entryAt(2), entryAt(1)]);
});

await test('日志：文件缺失或残缺都不抛，从空日志起步', async () => {
  const missing = newLog('missing.json');
  await missing.init();
  assert.deepEqual(missing.list(), []);

  const broken = join(tmpHome, 'broken.json');
  await fs.writeFile(broken, '{不是 JSON', 'utf-8');
  const store = new LogStore(broken);
  await store.init();
  assert.deepEqual(store.list(), []);

  // 半个字段的记录留住它带着的那部分，不连累整份文档。
  const partial = join(tmpHome, 'partial.json');
  await fs.writeFile(partial, JSON.stringify([{ typeId: 3, model: 'm' }, null, 'x']), 'utf-8');
  const partialStore = new LogStore(partial);
  await partialStore.init();
  assert.equal(partialStore.list().length, 1);
  assert.equal(partialStore.list()[0].typeId, 3);
  assert.equal(partialStore.list()[0].provider, '');
});

await test('日志：读出来的副本改不动内部记录', async () => {
  const store = newLog('copy.json');
  await store.init();
  store.append(entryAt(1));
  store.list()[0].model = 'tampered';
  store.list()[0].metrics.judgeModel = 'tampered';
  assert.deepEqual(store.list()[0], entryAt(1));
});

await test('端点地址：没带路径时自动补上，已经带了就不再补', () => {
  assert.equal(resolveEndpointUrl('http://judge.invalid'), 'http://judge.invalid/v1/systemone');
  assert.equal(resolveEndpointUrl('http://judge.invalid/'), 'http://judge.invalid/v1/systemone');
  assert.equal(resolveEndpointUrl('  http://judge.invalid  '), 'http://judge.invalid/v1/systemone');
  assert.equal(resolveEndpointUrl('http://judge.invalid/v1/systemone'), 'http://judge.invalid/v1/systemone');
  assert.equal(resolveEndpointUrl('http://judge.invalid/v1/systemone/'), 'http://judge.invalid/v1/systemone');
  assert.equal(resolveEndpointUrl('http://judge.invalid/systemone'), 'http://judge.invalid/systemone');
  assert.equal(resolveEndpointUrl('http://judge.invalid/v1'), 'http://judge.invalid/v1/systemone', '只差默认路径的后半段');
  assert.equal(resolveEndpointUrl('http://judge.invalid/api'), 'http://judge.invalid/api/v1/systemone');
  assert.equal(resolveEndpointUrl(''), '', '没有地址就没有请求地址');
  assert.equal(resolveEndpointUrl(undefined), '');
});

await test('配置读取：编号按清单顺序给，永远从 1 连着', () => {
  const refs = {
    enabled: { get: () => true },
    sessionOverrides: { get: () => ({}) },
    logEnabled: { get: () => true },
    endpointUrl: { get: () => 'http://judge.invalid' },
    judgeModel: { get: () => 'judge-x' },
    rows: {
      get: () => [
        { description: 'a', provider: 'p', model: 'm1', effort: 'low' },
        { description: 'b', provider: 'p', model: 'm2', effort: 'high' },
      ],
    },
  };
  const config = readPluginConfig(refs);
  assert.deepEqual(config.rows.map((r) => r.id), [1, 2]);
  assert.deepEqual(config.rows.map((r) => r.enabled), [true, true], '存储里没写 enabled 的行当作打开');
  assert.equal(config.rows[1].description, 'b');
  assert.equal(config.endpointUrl, 'http://judge.invalid/v1/systemone', '读出来的是拼好的完整地址');
});

await test('配置读取：关掉的行留在清单里但不占编号', () => {
  const refs = {
    enabled: { get: () => true },
    sessionOverrides: { get: () => ({}) },
    logEnabled: { get: () => true },
    endpointUrl: { get: () => 'http://judge.invalid' },
    judgeModel: { get: () => 'judge-x' },
    rows: {
      get: () => [
        { description: 'a', provider: 'p', model: 'm1', effort: 'low' },
        { enabled: false, description: 'b', provider: 'p', model: 'm2', effort: 'high' },
        { enabled: true, description: 'c', provider: 'p', model: 'm3', effort: 'low' },
      ],
    },
  };
  const config = readPluginConfig(refs);
  assert.deepEqual(config.rows.map((r) => [r.id, r.enabled]), [[1, true], [0, false], [2, true]]);
  assert.deepEqual(config.rows.map((r) => r.description), ['a', 'b', 'c'], '顺序就是清单顺序');
});

await test('配置读取：判断可用要求开关开、端点与模型都在、且有一行填全', () => {
  const base = {
    enabled: true, logEnabled: true, endpointUrl: 'http://judge.invalid',
    judgeModel: 'judge-x',
    rows: [row({ id: 1 })],
  };
  assert.equal(isJudgeUsable(base), true);
  assert.equal(isJudgeUsable({ ...base, enabled: false }), false);
  assert.equal(isJudgeUsable({ ...base, endpointUrl: '  ' }), false);
  assert.equal(isJudgeUsable({ ...base, judgeModel: '' }), false);
  assert.equal(isJudgeUsable({ ...base, rows: [row({ id: 1, model: '' })] }), false);
  assert.equal(isJudgeUsable({ ...base, rows: [] }), false);
  // 行都在、也填得全，但全被关掉：没有可选项，判断无从谈起。
  assert.equal(isJudgeUsable({ ...base, rows: [row({ id: 0, enabled: false })] }), false);
});

// 连通性检查问的是「这个地址与模型能不能答」，不是「能不能在你写的清单里挑一行」，
// 所以这几条断言都拿空清单来试：清单还没写的时候就该测得出来。
await test('连通性检查：一条类型都没有，照样能测出这个模型可用', async () => {
  const seen = [];
  const outcome = await probeJudge(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    async (url, init) => {
      seen.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
    },
  );
  assert.equal(outcome.ok, true, '端点答得出就该算通');
  // 它自己带一个选项，不用读者的清单——这就是这条检查能脱离清单的原因。
  const criteria = seen[0].questions.task_type.criteria;
  assert.deepEqual(Object.keys(criteria), ['1']);
});

await test('连通性检查：端点答非 200 时给出 unreachable', async () => {
  const outcome = await probeJudge(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    async () => new Response('nope', { status: 502 }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'unreachable');
});

await test('连通性检查：连不上时给出 unreachable，而不是抛出去', async () => {
  const outcome = await probeJudge(
    { url: 'http://127.0.0.1:1/v1/systemone', model: 'judge-x', apiKey: '' },
    async () => {
      throw new Error('connection refused');
    },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'unreachable');
});

await test('连通性检查：地址或模型没填时给出 unconfigured', async () => {
  let called = false;
  const outcome = await probeJudge(
    { url: '  ', model: 'judge-x', apiKey: '' },
    async () => {
      called = true;
      return new Response('{}', { status: 200 });
    },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'unconfigured');
  assert.equal(called, false, '没填地址就不该发请求');
});

await test('连通性检查：答复的编号对不上时给出 unmatched', async () => {
  const outcome = await probeJudge(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    async () => new Response(JSON.stringify({ answers: { task_type: { choice: '7' } } }), { status: 200 }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'unmatched');
});

await test('连通性检查的请求体：只带模型，任务正文是那一段固定说明', () => {
  const body = buildProbeRequest('judge-x');
  assert.equal(body.model, 'judge-x');
  assert.equal(body.questions.task_type.type, 'choice');
  assert.match(body.state.message, /连接测试/);
});

// 路由层是页面真正按下去的那一层。之前这一层一条测试都没有，于是「探测要先把类型
// 填全」这种设计错误一路到了页面上。
await test('探测路由：一条类型都没有也照样去测端点', async () => {
  const route = createFetchRoutes({
    config: () => ({
      enabled: true, logEnabled: true,
      endpointUrl: 'http://judge.invalid', judgeModel: 'judge-x',
      rows: [],
    }),
    log: () => [],
    apiKey: () => '',
  }).find((candidate) => candidate.path === PROBE_ROUTE_PATH);
  assert.ok(route, '探测路由注册上了');
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('connection refused');
  };
  try {
    const response = await route.fetch(new Request('http://host/api/probe', { method: 'POST' }), {});
    const body = await response.json();
    assert.equal(requests, 1);
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'unreachable');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test('探测路由：地址与模型都在、端点答得出时算通（清单仍是空的）', async () => {
  const route = createFetchRoutes({
    config: () => ({
      enabled: true, logEnabled: true,
      endpointUrl: 'http://judge.invalid', judgeModel: 'judge-x',
      rows: [],
    }),
    log: () => [],
    apiKey: () => '',
  }).find((candidate) => candidate.path === PROBE_ROUTE_PATH);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ answers: { task_type: { choice: '1' } } }),
    { status: 200 },
  );
  try {
    const response = await route.fetch(new Request('http://host/api/probe', { method: 'POST' }), {});
    const body = await response.json();
    assert.equal(body.ok, true, '端点答得出就该算通，跟类型清单无关');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test('日志路由：磁盘还没读完时也要等，不能报成空日志', async () => {
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  const route = createFetchRoutes({
    config: () => ({
      enabled: true, logEnabled: true,
      endpointUrl: 'http://judge.invalid', judgeModel: 'judge-x',
      rows: [],
    }),
    // 模拟「读文件还没回来」：路由必须等它，而不是抢先交出空数组。
    log: async () => {
      await gate;
      return [entryAt(1)];
    },
    apiKey: () => '',
  }).find((candidate) => candidate.path === LOG_ROUTE_PATH);
  const pending = route.fetch(new Request('http://host/api/log'), {});
  release();
  const body = await (await pending).json();
  assert.equal(body.entries.length, 1, '等到了那条记录，而不是空数组');
});

await test('日志路由：接口只回最近 10 条，不是文件里的全部', async () => {
  const route = createFetchRoutes({
    config: () => ({
      enabled: true, logEnabled: true,
      endpointUrl: 'http://judge.invalid', judgeModel: 'judge-x',
      rows: [],
    }),
    // 文件里存着更多，接口这一层只交出页面要的那一段。
    log: () => Array.from({ length: 40 }, (_unused, index) => entryAt(40 - index)),
    apiKey: () => '',
  }).find((candidate) => candidate.path === LOG_ROUTE_PATH);
  assert.ok(route, '日志路由注册上了');
  const response = await route.fetch(new Request('http://host/api/log'), {});
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.entries.length, 10);
  assert.equal(body.entries[0].typeId, 40, '新的在前');
});

await test('预览路由：清单为空时也答得出（预览的是将要发出去的那段）', async () => {
  const route = createFetchRoutes({
    config: () => ({
      enabled: true, logEnabled: true,
      endpointUrl: 'http://judge.invalid', judgeModel: 'judge-x',
      rows: [],
    }),
    log: () => [],
    apiKey: () => '',
  }).find((candidate) => candidate.path === PREVIEW_ROUTE_PATH);
  const response = await route.fetch(new Request('http://host/api/preview'), {});
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.preview, /judge-x/);
});

console.log(`${passed}/${total} passed`);
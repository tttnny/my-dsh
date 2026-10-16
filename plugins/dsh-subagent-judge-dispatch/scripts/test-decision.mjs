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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDecision,
  decideRewrite,
  outcomeReason,
} from '../src/server/dispatch.ts';
import {
  buildJudgeRequest,
  buildPreview,
  readChoice,
  readJudgeAnswer,
  selectableRows,
} from '../src/server/judge-prompt.ts';
import { judgeTaskType } from '../src/server/judge-client.ts';
import { LogStore, LOG_LIMIT } from '../src/server/log-store.ts';
import { readPluginConfig, isJudgeUsable } from '../src/server/config.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

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

/** One row, filled in unless a field is overridden. */
function row(overrides = {}) {
  return {
    id: 1,
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

await test('判断失败时一个字段都不写（原对象按身份返回）', () => {
  const config = { provider: 'magpie', model: 'future/deepseek-v4.1-flash', reasoningEffort: 'high' };
  for (const reason of ['unreachable', 'timeout', 'unmatched', 'incomplete']) {
    const decision = decideRewrite({ kind: 'fallback', reason, latencyMs: 3 });
    assert.equal(decision.kind, 'none', `reason=${reason} 不该产生改写`);
    assert.equal(
      applyDecision(config, decision),
      config,
      `reason=${reason} 必须原样返回同一个对象，而不是复制一份`,
    );
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
  const config = { provider: 'magpie', model: 'future/deepseek-v4.1-flash', reasoningEffort: 'high' };
  const decision = decideRewrite({ kind: 'matched', row: row({ effort: 'max' }), latencyMs: 1 });
  const next = applyDecision(config, decision);
  assert.equal(next.provider, 'd1api');
  assert.equal(next.model, 'deepseek-v4.1-flash');
  assert.equal(next.reasoningEffort, 'max');
  // 其余字段保留
  assert.notEqual(next, config);
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

await test('预览里任务正文处标注派工时才填，且不含自发编造的任务', () => {
  const preview = buildPreview([row()], 'judge-x');
  assert.ok(preview.includes('派工时才填'));
  const parsed = JSON.parse(preview);
  assert.deepEqual(parsed.state, { message: '（派工时才填）' });
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
});

await test('判断调用：超时走 timeout，且不重试', async () => {
  let calls = 0;
  const outcome = await judgeTaskType(
    { url: 'http://judge.invalid', model: 'judge-x', apiKey: '' },
    [row()],
    '任务正文',
    async (_url, init) => {
      calls += 1;
      // 永不 resolve，只等自己的中止信号
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    },
  );
  assert.equal(calls, 1, '不重试');
  assert.equal(outcome.kind, 'fallback');
  assert.equal(outcome.reason, 'timeout');
});

await test('日志：留最近 20 条，新的在前', () => {
  const store = new LogStore();
  for (let i = 1; i <= LOG_LIMIT + 5; i += 1) {
    store.append({
      typeId: i, model: 'm', effort: 'low', source: 'judged', at: i,
      latencyMs: 1, parentTitle: 'p', childLabel: 'c',
    });
  }
  const list = store.list();
  assert.equal(list.length, LOG_LIMIT);
  assert.equal(list[0].typeId, LOG_LIMIT + 5);
  assert.equal(list[LOG_LIMIT - 1].typeId, 6);
});

await test('日志：读出来的副本改不动内部记录', () => {
  const store = new LogStore();
  store.append({
    typeId: 1, model: 'm', effort: 'low', source: 'judged', at: 1,
    latencyMs: 1, parentTitle: 'p', childLabel: 'c',
  });
  store.list()[0].model = 'tampered';
  assert.equal(store.list()[0].model, 'm');
});

await test('配置读取：编号按位置给，永远从 1 连着', () => {
  const refs = {
    enabled: { get: () => true },
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
  assert.equal(config.rows[1].description, 'b');
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
});

console.log(`${passed}/${total} passed`);

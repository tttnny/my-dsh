/**
 * 宿主半边自检：**真实的 0.1.7-rc.2 内核服务** + 假应答者，断言送进表单的每一处转换
 * （题号并入标题、detail 落位、强制多选、推荐标记归一化、轮末补充题）与每一条拒绝
 * （保留前缀、重复 id、空题干、空 label、同题重名 label）。
 *
 * 承重点全在真货上：真 cordis `Context`、真 `ctx.tools`（ToolRuntime：工具经它注册、再经它取回）、
 * 真 `ctx.userQuestions`（UserQuestionService：`ask()` 真走服务校验与 `user-questions/request`
 * waterfall）。只有「人怎么答」是假的——真应答要等界面点选，这里在 waterfall 上挂一个假应答者。
 *
 * 三个内核包是本插件的 devDependencies（与 engines.dsh 同版本）：自检不指向任何 DSH 安装副本，
 * `pnpm install` 后即可离线跑（见 docs/rules/dev-copy.md）。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import UserQuestionService from '@deepseek-ai/dsh-user-questions';
import * as native from '@deepseek-ai/dsh-tool-ask-user';

import * as plugin from '../lib/index.js';

const require = createRequire(import.meta.url);
/** 界面侧安装副本：`parseRecommendedLabel` 那条规则的事实来源。 */
const clientBundle = join(
  dirname(require.resolve('@deepseek-ai/dsh-client-ui-user-questions/package.json')),
  'lib',
  'client.js',
);
if (!existsSync(clientBundle)) throw new Error(`界面侧副本未找到：${clientBundle}`);

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  return fn().then(
    () => { console.log(`  ✓ [PASS] ${name}`); passed++; },
    (err) => { console.error(`  ✗ [FAIL] ${name}: ${err.message}`); throw err; },
  );
}

/**
 * 起一个真内核 Context：systemPrompt / tools / userQuestions 都是真服务。
 * @returns {Context} 装配好三个真服务的根上下文。
 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  new UserQuestionService(ctx);
  return ctx;
}

/**
 * 装配一次插件：真内核服务、假应答者，工具从真工具表取回。
 * @param {{(request: object): {answers: object[]}}} [answerer] - 假应答者的应答实现。
 * @param {object} [config] - loader 交给插件行的 config（载体行用 { carrier: true }）。
 * @returns {Promise<{ctx: Context, tool: object|undefined, asked: object[]}>} 上下文、真工具表里取回的工具、每次送审的问题。
 */
async function assemble(answerer, config) {
  const ctx = host();
  const asked = [];
  ctx.on('user-questions/request', (request) => {
    asked.push(request);
    return answerer === undefined
      ? { answers: request.questions.map((question) => ({ id: question.id, selected: [] })) }
      : answerer(request);
  });
  plugin.apply(ctx, config);
  return { ctx, tool: ctx.tools.get('ask_user_grilling'), asked };
}

const exec = { signal: new AbortController().signal };
const firstLabelAnswers = (request) => ({
  answers: request.questions.map((question) => ({
    id: question.id,
    selected: question.options.map((option) => option.label).slice(0, 1),
  })),
});

// --- 装配形状 ---
const shape = await assemble();
await test('导出的行身份与 inject 未变', async () => {
  assert.equal(plugin.name, 'tool-ask-user-grilling');
  assert.deepEqual(plugin.inject, ['tools', 'userQuestions']);
  assert.equal(shape.tool.name, 'ask_user_grilling');
});

await test('工具描述与共有参数描述与原生逐字一致，本插件独有的参数留在旁边', async () => {
  const nativeCtx = host();
  native.apply(nativeCtx);
  const nativeTool = nativeCtx.tools.get('ask_user_question');
  assert.ok(nativeTool !== undefined, '原生工具没有注册进真工具表');
  assert.equal(shape.tool.description, nativeTool.description, '工具描述与原生不再逐字相同');
  const properties = shape.tool.parameters.properties.questions.items.properties;
  const nativeProperties = nativeTool.parameters.properties.questions.items.properties;
  for (const key of ['id', 'question', 'header', 'options']) {
    assert.equal(properties[key].description, nativeProperties[key].description, `${key} 的描述与原生不再逐字相同`);
  }
  for (const key of ['label', 'description']) {
    assert.equal(
      properties.options.items.properties[key].description,
      nativeProperties.options.items.properties[key].description,
      `options.${key} 的描述与原生不再逐字相同`,
    );
  }
  assert.deepEqual(
    Object.keys(properties).filter((key) => !['id', 'question', 'header', 'options'].includes(key)).sort(),
    ['detail', 'number'],
  );
  assert.deepEqual(
    Object.keys(properties.options.items.properties).filter((key) => !['label', 'description'].includes(key)),
    ['recommended'],
  );
});

// --- 转换 ---
await test('题号与标题：两者都给拼成 "Q2 · Deadline"', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({ questions: [{ id: 'a', question: '选哪个？', number: 'Q2', header: 'Deadline' }] }, exec);
  assert.equal(asked[0].questions[0].header, 'Q2 · Deadline');
});

await test('题号与标题：标题已带该题号时不重复前缀', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({ questions: [{ id: 'a', question: '选哪个？', number: 'Q2', header: 'Q2 · Deadline' }] }, exec);
  assert.equal(asked[0].questions[0].header, 'Q2 · Deadline');
});

await test('题号与标题：只给一个就是那一个，都不给就没有 header', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({
    questions: [
      { id: 'a', question: '只议题号', number: 'Q3' },
      { id: 'b', question: '只讨标题', header: 'Confirm' },
      { id: 'c', question: '两个都不给' },
    ],
  }, exec);
  const [a, b, c] = asked[0].questions;
  assert.equal(a.header, 'Q3');
  assert.equal(b.header, 'Confirm');
  assert.equal('header' in c, false);
});

await test('正文交给 detail：非空就透传，空白就省略字段', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({
    questions: [
      { id: 'a', question: '一句题干', detail: '第一段。\n\n第二段。' },
      { id: 'b', question: '没有正文' },
      { id: 'c', question: '正文是空白', detail: '   ' },
    ],
  }, exec);
  const [a, b, c] = asked[0].questions;
  assert.equal(a.detail, '第一段。\n\n第二段。');
  assert.equal('detail' in b, false);
  assert.equal('detail' in c, false);
});

await test('强制多选：模型给 multi_select false 也盖不掉', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({ questions: [{ id: 'a', question: '？', multi_select: false }] }, exec);
  const [a] = asked[0].questions;
  assert.equal(a.multiSelect, true);
  assert.equal('multi_select' in a, false);
});

await test('推荐标记：送审 label 带（推荐），回传还原成模型原本那一个', async () => {
  const { tool, asked } = await assemble(firstLabelAnswers);
  const result = await tool.execute({
    questions: [{ id: 'a', question: '？', options: [{ label: 'A：移走', description: '只留一个；推荐' }, { label: 'B：都留' }] }],
  }, exec);
  assert.equal(asked[0].questions[0].options[0].label, 'A：移走（推荐）');
  assert.equal(asked[0].questions[0].options[0].description, '只留一个');
  assert.deepEqual(result.answers[0].selected, ['A：移走']);
});

await test('轮末补充题：每次调用固定在末尾，且不撞模型 id', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({ questions: [{ id: 'a', question: '？' }] }, exec);
  const questions = asked[0].questions;
  assert.equal(questions.at(-1).id, '__grill_round_supplement__');
  assert.equal(questions.length, 2);
});

await test('agent 透传：没有就省略这个键；有就真的送进 seam（真服务因此按 CALLER_NOT_LIVE 拒绝未注册的 agent）', async () => {
  const omitted = await assemble();
  await omitted.tool.execute({ questions: [{ id: 'a', question: '？' }] }, exec);
  assert.equal('agent' in omitted.asked[0], false);

  const agent = { id: 'agent-live' };
  const rejected = await assemble();
  await assert.rejects(
    () => rejected.tool.execute({ questions: [{ id: 'b', question: '？' }] }, { ...exec, agent }),
    (err) => err.code === 'CALLER_NOT_LIVE',
  );
  assert.deepEqual(rejected.asked, [], '被服务拒绝的请求不应抵达应答者');

  const live = await assemble();
  live.ctx.provide('agents');
  live.ctx.set('agents', { get: (id) => (id === agent.id ? agent : undefined), roots: () => [agent] });
  await live.tool.execute({ questions: [{ id: 'c', question: '？' }] }, { ...exec, agent });
  assert.deepEqual(live.asked[0].agent, agent);
});

// --- 拒绝 ---
const rejected = async (questions) => {
  const { tool, asked } = await assemble();
  const result = await tool.execute({ questions }, exec);
  assert.equal(result.rejected, true);
  assert.deepEqual(result.answers, []);
  assert.equal(asked.length, 0, '被拒的轮次不该送进 seam');
  return result.violations;
};

await test('保留前缀 __grill_ 的 id 被拒', async () => {
  const violations = await rejected([{ id: '__grill_sneak__', question: '？' }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /reserved prefix __grill_/);
});

await test('同一轮里重复的 id 被拒', async () => {
  const violations = await rejected([{ id: 'dup', question: '甲？' }, { id: 'dup', question: '乙？' }]);
  assert.match(violations[0], /repeats an id/);
});

await test('空题干被拒（原生 schema 只保证字段存在，不保证有内容）', async () => {
  const violations = await rejected([{ id: 'a', question: '   ' }]);
  assert.match(violations[0], /empty question text/);
});

await test('空 label 被拒', async () => {
  const violations = await rejected([{ id: 'a', question: '？', options: [{ label: ' ' }] }]);
  assert.match(violations[0], /option 1 has an empty label/);
});

await test('同题两个选项归一化后同名：被拒（界面按 label 认选项）', async () => {
  const violations = await rejected([
    { id: 'a', question: '？', options: [{ label: 'A：移走；推荐' }, { label: 'A：移走（推荐）' }] },
  ]);
  assert.match(violations[0], /same label "A：移走（推荐）"/);
});

await test('缺 label 由 defineTool 的入参校验拦住，不进本插件的 violations', async () => {
  const { tool } = await assemble();
  await assert.rejects(
    () => tool.execute({ questions: [{ id: 'a', question: '？', options: [{ description: 'x' }] }] }, exec),
    /missing required property "questions\[0\]\.options\[0\]\.label"/,
  );
});

// --- 两条行形状：preset 行注册工具，bundle 载体行什么都不注册 ---

await test('缺省 config：preset 行照常注册工具', async () => {
  const { tool } = await assemble(undefined, undefined);
  assert.equal(tool.name, 'ask_user_grilling');
  const withEmpty = await assemble(undefined, {});
  assert.equal(withEmpty.tool.name, 'ask_user_grilling');
});

await test('载体行：config.carrier 为 true 时什么都不注册（浏览器 bundle 的 servable entry）', async () => {
  const { tool, asked } = await assemble(undefined, { carrier: true });
  assert.equal(tool, undefined);
  assert.deepEqual(asked, []);
});

await test('config 校验：拼错的载体行当场抛，不静默多注册一个全局工具', async () => {
  await assert.rejects(() => assemble(undefined, { carrrier: true }), /unknown config key\(s\) "carrrier"/);
  await assert.rejects(() => assemble(undefined, { carrier: 'yes' }), /config\.carrier must be a boolean/);
  await assert.rejects(() => assemble(undefined, 'carrier'), /config must be an object/);
});

// --- 手抄的界面规则是否还在安装副本里 ---
await test('测试里抄的推荐标记规则与安装副本逐字相同（漂移即失败）', async () => {
  const { CLIENT_ACCEPTS } = await import('./recommended-label-rule.mjs');
  const source = readFileSync(clientBundle, 'utf8');
  assert.ok(
    source.includes(`const suffix = ${CLIENT_ACCEPTS};`),
    `安装副本里已不是这条规则：${CLIENT_ACCEPTS}（去 ${clientBundle} 核对 parseRecommendedLabel）`,
  );
});

console.log(`${passed}/${total} passed`);

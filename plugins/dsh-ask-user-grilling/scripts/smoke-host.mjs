/**
 * 宿主半边自检：用假 seam 真跑 defineTool 包起来的 execute()，断言送进表单的每一处
 * 转换（题号并入标题、detail 落位、强制多选、推荐标记归一化、轮末补充题）与每一条
 * 拒绝（保留前缀、重复 id、空题干、空 label、同题重名 label）。
 *
 * seam 用假实现是必要的：真实 ask() 要等界面点选。断言对象只有本插件的转换——
 * defineTool 的入参校验走 DSH 真包，不是桩件。
 *
 * 内核包（@deepseek-ai/dsh-tools、@deepseek-ai/dsh-user-questions）由 DSH 运行副本
 * 供给，仓库根不放 node_modules（见 docs/rules/dev-copy.md）。
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const kernelPackage = (name) => join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', name, 'lib', 'index.js');
for (const pkg of ['dsh-tools', 'dsh-user-questions']) {
  if (!existsSync(kernelPackage(pkg))) throw new Error(`内核包未找到：${kernelPackage(pkg)}（用 DSH_HOME 指向 DSH 主目录）`);
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const pkg of ['dsh-tools', 'dsh-user-questions']) {
      if (specifier === `@deepseek-ai/${pkg}`) return { url: pathToFileURL(kernelPackage(pkg)).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const clientCopy = join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-user-questions', 'lib', 'client.js');
if (!existsSync(clientCopy)) throw new Error(`界面侧副本未找到：${clientCopy}`);

const plugin = await import('../lib/index.js');

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
 * 装配一次插件，拿到注册进真 defineTool 的工具，并留下 seam 的收件箱。
 * @param {{(request: object): {answers: object[]}}} [answerer] - 假 seam 的应答实现。
 * @returns {Promise<{tool: object, asked: object[]}>} 工具与每次调用的送审问题。
 */
async function assemble(answerer) {
  const asked = [];
  const ctx = {
    tools: { register: () => {} },
    userQuestions: {
      ask: async (request) => {
        asked.push(request);
        return answerer === undefined
          ? { answers: request.questions.map((question) => ({ id: question.id, selected: [] })) }
          : answerer(request);
      },
    },
  };
  let tool;
  ctx.tools.register = (registered) => { tool = registered; };
  plugin.apply(ctx);
  return { tool, asked };
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

await test('共有参数描述与原生逐字一致，本插件独有的参数留在旁边', async () => {
  const nativeEntry = join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-tool-ask-user', 'lib', 'index.js');
  const nativeSource = readFileSync(nativeEntry, 'utf8');
  const properties = shape.tool.parameters.properties.questions.items.properties;
  for (const key of ['id', 'question', 'header', 'options']) {
    assert.ok(nativeSource.includes(`description: ${JSON.stringify(properties[key].description)}`), `${key} 的描述与原生不再逐字相同`);
  }
  for (const key of ['label', 'description']) {
    const optionText = properties.options.items.properties[key].description;
    assert.ok(nativeSource.includes(`description: ${JSON.stringify(optionText)}`), `options.${key} 的描述与原生不再逐字相同`);
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

await test('agent 透传：exec 里有就带，没有就不写这个键', async () => {
  const { tool, asked } = await assemble();
  await tool.execute({ questions: [{ id: 'a', question: '？' }] }, exec);
  assert.equal('agent' in asked[0], false);
  await tool.execute({ questions: [{ id: 'b', question: '？' }] }, { ...exec, agent: { id: 'agent-live' } });
  assert.deepEqual(asked[1].agent, { id: 'agent-live' });
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

// --- 手抄的界面规则是否还在安装副本里 ---
await test('测试里抄的推荐标记规则与安装副本逐字相同（漂移即失败）', async () => {
  const { CLIENT_ACCEPTS } = await import('./recommended-label-rule.mjs');
  const source = readFileSync(clientCopy, 'utf8');
  assert.ok(
    source.includes(`const suffix = ${CLIENT_ACCEPTS};`),
    `安装副本里已不是这条规则：${CLIENT_ACCEPTS}（去 ${clientCopy} 核对 parseRecommendedLabel）`,
  );
});

console.log(`${passed}/${total} passed`);

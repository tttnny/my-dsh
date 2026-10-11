/**
 * 宿主半边自检：**真实的 0.2.1-alpha.2 内核服务**，断言这个工具「投出表单就结束本轮」的每一步。
 *
 * 承重点全在真货上：真 cordis `Context`、真 `ctx.tools`（ToolRuntime：工具经它注册、再经它取回）。
 * 唯一假的是**执行上下文**——真 DSH 里 `exec.concludeTurn()` 把本轮标记为结束，这里换成假件记录
 * 「喊没喊过」。工具不再等任何答案，所以这条链上没有假应答者：它必须自己立即返回。
 *
 * 内核包是本插件的 devDependencies（与 engines.dsh 同版本）：自检不指向任何 DSH 安装副本，
 * `pnpm install` 后即可离线跑（见 docs/rules/dev-copy.md）。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

import * as plugin from '../lib/index.js';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
/** 包名：与包内 cordis.patch.yml 那条装配行的 name 比对，两边各自独立，不共用字面量。 */
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

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
 * 起一个真内核 Context：装工具表与它写工具 schema 用的提示词服务。这一版不再需要提问服务——
 * 工具把它整条 seam 让给了原生 `ask_user_question`，自己既不投递也不等待。
 * @returns {Context} 装配好工具表的根上下文。
 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  return ctx;
}

/**
 * 装配一次插件并从真工具表取回工具。
 * @param {object} [config] - loader 交给插件行的 config（正常装配不写 config）。
 * @returns {Promise<{ctx: Context, tool: object|undefined}>} 上下文与取回的工具。
 */
async function assemble(config) {
  const ctx = host();
  plugin.apply(ctx, config);
  return { ctx, tool: ctx.tools.get('grilling_form') };
}

/** 假执行上下文：真 DSH 的执行上下文带着 concludeTurn，这里只记录它被喊了几次。 */
function makeExec() {
  const concluded = [];
  return {
    concluded,
    exec: {
      signal: new AbortController().signal,
      concludeTurn: () => { concluded.push('concludeTurn'); },
    },
  };
}

// --- 装配形状 ---
const shape = await assemble();

await test('导出的行身份与新名字一致，宿主半边只依赖工具表', async () => {
  assert.equal(plugin.name, 'tool-grilling-form');
  assert.deepEqual(plugin.inject, ['tools']);
  assert.equal(shape.tool.name, 'grilling_form');
});

await test('不再需要提问服务：这个上下文里根本没有 userQuestions，工具照样注册得上', async () => {
  assert.equal(shape.ctx.get('userQuestions'), undefined);
  assert.ok(shape.tool !== undefined);
});

await test('自我介绍按新行为重写：本轮唯一且最后的调用、发完即结束', async () => {
  const description = shape.tool.description;
  assert.match(description, /only and final tool call of the round/);
  assert.match(description, /end your turn/);
  assert.match(description, /their own composer/);
});

await test('题型开关：schema 里有 multi_select，描述里讲清缺省是多选、写 false 才是单选', async () => {
  const properties = shape.tool.parameters.properties.questions.items.properties;
  assert.deepEqual(Object.keys(properties.multi_select), ['type', 'description']);
  assert.equal(properties.multi_select.type, 'boolean');
  assert.match(properties.multi_select.description, /Default true/);
  assert.match(properties.multi_select.description, /Set false/);
});

await test('输出 schema 是 pending 声明，不再有等答案那套 answers/callId', async () => {
  const properties = shape.tool.output.schema.properties;
  assert.deepEqual(
    Object.keys(properties).sort(),
    ['error', 'message', 'pending', 'rejected', 'violations'],
  );
  assert.equal('callId' in properties, false);
  assert.equal('answers' in properties, false);
});

// --- 投出表单 ---

await test('执行立即返回 pending 声明：不携带 callId，message 讲清「表单已展示、答案会晚到」', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions: [{ id: 'a', question: '选哪个？' }] }, exec);
  assert.equal(result.pending, true);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
  assert.equal('callId' in result, false, '下游没有任何东西会回传 callId，带上只会让模型误以为会收到被标记的回答');
  assert.equal('answers' in result, false);
  assert.deepEqual(concluded, ['concludeTurn'], '发完表单必须标记本轮结束');
});

await test('同一个执行上下文只标记一次；两次调用各自标记各自的那一次', async () => {
  const { tool } = await assemble();
  const first = makeExec();
  const second = makeExec();
  await tool.execute({ questions: [{ id: 'a', question: '？' }] }, first.exec);
  await tool.execute({ questions: [{ id: 'b', question: '？' }] }, first.exec);
  await tool.execute({ questions: [{ id: 'c', question: '？' }] }, second.exec);
  assert.equal(first.concluded.length, 2);
  assert.equal(second.concluded.length, 1);
});

await test('render 给出模型读到的那段 JSON（message 就在里面）', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({ questions: [{ id: 'a', question: '？' }] }, exec);
  const blocks = tool.output.render({ questions: [] }, result);
  assert.deepEqual(blocks, [{ type: 'text', text: JSON.stringify(result) }]);
});

// --- 拒绝：可修复，且不能标记结束 ---

const rejected = async (questions) => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions }, exec);
  assert.equal(result.rejected, true);
  assert.equal('pending' in result, false);
  assert.deepEqual(concluded, [], '被拒的轮次没有表单可展示，绝不能让本轮就此结束');
  return result.violations;
};

await test('重复的 id 被拒', async () => {
  const violations = await rejected([{ id: 'dup', question: '甲？' }, { id: 'dup', question: '乙？' }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /repeats an id/);
});

await test('空题干被拒（schema 只保证字段存在，不保证有内容）', async () => {
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

await test('选项名里的标点不再是拒收项：顿号、冒号、换行都照常投出', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({
    questions: [{
      id: 'a',
      question: '？',
      options: [{ label: '甲、乙两种做法' }, { label: '丙：另起一行' }, { label: '两行\n的选项名' }],
    }],
  }, exec);
  assert.equal(result.pending, true);
  assert.deepEqual(concluded, ['concludeTurn']);
});

await test('questions 不是数组：由 defineTool 的入参校验拦住，不进本插件的 violations', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  await assert.rejects(
    () => tool.execute({ questions: 'not an array' }, exec),
    /"questions" must be an array/,
  );
});

await test('总说明不再手写规则清单：只报数量，规则由逐条违规自己说', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({
    questions: [{ id: 'a', question: '   ' }, { id: 'b', question: '？', options: [{ label: ' ' }] }],
  }, exec);
  assert.equal(result.rejected, true);
  assert.equal(result.violations.length, 2);
  assert.match(result.error, /^2 violation\(s\) in this round/);
  assert.doesNotMatch(result.error, /ids must be unique|must not share a label/, '摘要里再抄一份清单，就会在加规则时漂');
});

await test('投出表单后那句话里的作答格式与真实格式一致（标题以全角冒号收尾、每项一行带记号）', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({ questions: [{ id: 'a', question: '？' }] }, exec);
  assert.match(result.message, /"<title>："/);
  assert.match(result.message, /"- " line per chosen option or typed text/);
});

await test('保留前缀这条规则已随轮末补充题删除：__grill_ 前缀的 id 可以正常投出', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions: [{ id: '__grill_round_supplement__', question: '？' }] }, exec);
  assert.equal(result.pending, true);
  assert.deepEqual(concluded, ['concludeTurn']);
});

await test('展开正文里把选项又列了一遍：被拒（页面上会出现两遍选项）', async () => {
  const violations = await rejected([{
    id: 'a',
    question: '配置入口放哪？',
    detail: '先交代一个会左右选法的事实。\n\n- **甲**·详情页里的「配置」入口\n- **乙**·列表里直接多一张卡片',
    options: [{ label: '甲：详情页里的配置入口，进去是一整页' }, { label: '乙：列表里直接一张卡片' }],
  }]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /restates its options in detail/);
});

await test('展开正文只写各选项共用的背景：照常投出', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({
    questions: [{
      id: 'a',
      question: '配置入口放哪？',
      detail: '这一版本来就是这么设计的：三个落点都已经预留在插件页。',
      options: [{ label: '甲：详情页里的配置入口' }, { label: '乙：列表里直接一张卡片' }],
    }],
  }, exec);
  assert.equal(result.pending, true);
  assert.deepEqual(concluded, ['concludeTurn']);
});

await test('字段说明把三条规则讲给模型：展开正文只写共用的、推荐项默认勾上、标记里禁用顿号', async () => {
  const properties = shape.tool.parameters.properties.questions.items.properties;
  assert.match(properties.detail.description, /only for what all the options share/);
  assert.match(properties.options.items.properties.recommended.description, /checked by default/);
  assert.match(properties.options.items.properties.label.description, /Any punctuation is fine/);
});

await test('缺 label 由 defineTool 的入参校验拦住，不进本插件的 violations', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  await assert.rejects(
    () => tool.execute({ questions: [{ id: 'a', question: '？', options: [{ description: 'x' }] }] }, exec),
    /missing required property "questions\[0\]\.options\[0\]\.label"/,
  );
});

// --- 一条行的形状：bundle 行既注册工具，又承载浏览器半边 ---

await test('缺省 config：工具行照常注册工具', async () => {
  const omitted = await assemble(undefined);
  assert.equal(omitted.tool.name, 'grilling_form');
  const empty = await assemble({});
  assert.equal(empty.tool.name, 'grilling_form');
});

await test('这一行不接受 config：写任何键当场抛，不静默接受一个拼错的行', async () => {
  await assert.rejects(() => assemble({ carrrier: true }), /unknown config key\(s\) "carrrier"/);
  await assert.rejects(() => assemble({ carrier: true }), /unknown config key\(s\) "carrier"/);
  await assert.rejects(() => assemble('carrier'), /config must be an object/);
});

await test('包内 cordis.patch.yml 就是那条装配行：id 与宿主导出名同名、且不带 config', async () => {
  // 先剥掉注释：整行注释与行尾注释都算。注释里出现 `config` 字样是合法文档（本文件开头就写了它
  // 不写 config），不该让这条断言误报红；断言只该盯配置本身。
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');

  // 抽出那条 insert 行，而不是把期望值写成字面量：这样 id 与宿主导出名是**两个独立来源**的比对。
  const rows = [...patch.matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*'([^']+)'/g)];
  assert.equal(rows.length, 1, '包内 cordis.patch.yml 应当只有一条装配行');
  const [, rowId, packageName] = rows[0];

  // 行 id 与宿主导出名一致：旧装配留下的同名手写行会被 loader 按 id 合成一条，不会把包挂两遍。
  assert.equal(rowId, plugin.name);
  assert.equal(packageName, pkgName);
  // 不带 config：这一行既注册工具，又是浏览器半边的 root loader entry。
  assert.equal(/\bconfig\b/.test(patch), false, '装配行不该带 config');
});

console.log(`${passed}/${total} passed`);

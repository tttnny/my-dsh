/**
 * 宿主半边自检：**真实的 0.2.1-alpha.4 内核服务**，断言这个工具「投出表单就结束本轮」的每一步，
 * 以及闸门那三分支。承重点全在真货上：真 cordis Context、真 ctx.tools（ToolRuntime：工具经它
 * 注册、再经它取回）、真会话投影（SessionProjectionRegistry：闸门就是挂在它上面的一个单元）。
 * 假的只有两处：**执行上下文**（真 DSH 里 exec.concludeTurn() 把本轮标记为结束，这里换成假件
 * 记录「喊没喊过」）与**会话**（只给投影读得到的那些成员：事件序列、按 seq 取事件、按序读全量）。
 *
 * 内核包是本插件的 devDependencies（与 engines.dsh 同版本）：自检不指向任何 DSH 安装副本，
 * pnpm install 后即可离线跑（见 docs/rules/dev-copy.md）。
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
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';

import * as plugin from '../lib/index.js';
import { GATE_KEY, TOOL_NAME, importBlockStart } from '../src/form-model.js';

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
 * 起一个真内核 Context：装工具表与它写工具 schema 用的提示词服务，再挂真的会话投影服务。
 * @param {{ projections?: boolean }} [options] - projections 为 false 时故意不挂投影服务。
 * @returns {Context} 装配好的根上下文。
 */
function host(options = {}) {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  if (options.projections !== false) new SessionProjectionRegistry(ctx);
  return ctx;
}

/**
 * 装配一次插件并从真工具表取回工具。
 * @param {object} [config] - loader 交给插件行的 config（正常装配不写 config）。
 * @param {{ projections?: boolean }} [options] - 是否挂会话投影服务。
 * @returns {Promise<{ctx: Context, tool: object|undefined}>} 上下文与取回的工具。
 */
async function assemble(config, options) {
  const ctx = host(options);
  plugin.apply(ctx, config);
  return { ctx, tool: ctx.tools.get('grilling_form') };
}

/**
 * 只给投影读的那几个成员的假会话：事件按 seq 排（seq 就是下标），全量读与按位置读各一个。
 * header / inheritedEventCount 是投影初始化单元时要的两件元数据。
 * @param {object[]} [events] - 初始事件。
 * @returns {{events: object[], append: (event: object) => void, session: object}} 假会话与追加事件的口。
 */
function makeSession(events = []) {
  const log = [...events];
  const session = {
    id: 'sess-1',
    header: {},
    inheritedEventCount: 0,
    get seq() { return log.length; },
    snapshotEvents: () => log,
    eventAt: (seq) => log[seq],
  };
  return {
    events: log,
    session,
    append: (event) => { log.push({ ...event, seq: log.length }); },
  };
}

/** 真 DSH 里这一步由 agent 循环做：调用事件与结果事件先后落进会话。 */
function recordRound({ append }, { callId, argsRaw, result }) {
  append({ type: 'tool/call', data: { turn: 1, step: 1, callId, name: TOOL_NAME, arguments: argsRaw } });
  append({
    type: 'tool/result',
    data: { turn: 1, step: 1, message: { toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(result) }] } },
  });
}

/** 真 DSH 里用户那条发言也是一个事件。 */
function recordUserMessage({ append }, text) {
  append({ type: 'user/message', data: { role: 'user', content: [{ type: 'text', text }] } });
}

/** 假执行上下文：真 DSH 的执行上下文带着 concludeTurn 与会话，这里只记录它被喊了几次。 */
function makeExec(session) {
  const concluded = [];
  return {
    concluded,
    exec: {
      signal: new AbortController().signal,
      concludeTurn: () => { concluded.push('concludeTurn'); },
      ...(session === undefined ? {} : { agent: { session } }),
    },
  };
}

const args = (questions) => JSON.stringify({ questions });

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

await test('自我介绍：本轮唯一且最后的调用、发完即结束', async () => {
  const description = shape.tool.description;
  assert.match(description, /only tool call/);
  assert.match(description, /end your turn/);
});

await test('工具面只剩六个字段：questions / question / type / options / label / replace', async () => {
  const parameters = shape.tool.parameters;
  assert.deepEqual(Object.keys(parameters.properties).sort(), ['questions', 'replace']);
  const question = parameters.properties.questions.items;
  assert.deepEqual(Object.keys(question.properties).sort(), ['options', 'question', 'type']);
  assert.deepEqual(question.required, ['question'], '只有题干必填');
  assert.equal('required' in question.properties.type, false, '题型不必填：缺省由插件按有没有选项兜底');
  assert.deepEqual(question.properties.type.enum, ['single', 'multi', 'free']);
  assert.deepEqual(question.properties.options.items.required, ['label']);
  // 工具面上不该再有别的字段
  for (const gone of ['id', 'header', 'number', 'detail', 'multi_select', 'recommended', 'description']) {
    assert.equal(gone in question.properties, false, gone);
    assert.equal(gone in question.properties.options.items.properties, false, gone);
  }
});

await test('描述只写「填什么」：默认值、兜底、校验规则都不进描述', async () => {
  const question = shape.tool.parameters.properties.questions.items;
  const texts = [
    shape.tool.description,
    shape.tool.parameters.properties.questions.description,
    shape.tool.parameters.properties.replace.description,
    question.properties.question.description,
    question.properties.type.description,
    question.properties.options.description,
    question.properties.options.items.properties.label.description,
    shape.tool.output.schema.properties.ok.description,
    shape.tool.output.schema.properties.message.description,
  ];
  assert.equal(texts.length, 9, '字段描述就到这九条');
  assert.match(shape.tool.parameters.properties.questions.items.properties.options.description, /（推荐）/, '推荐约定挂在 options 上');
  for (const text of texts) {
    assert.doesNotMatch(text, /default|falls back|fallback|Required for type/i, text);
  }
});

await test('输出 schema 只有 ok 与 message', async () => {
  assert.deepEqual(Object.keys(shape.tool.output.schema.properties).sort(), ['message', 'ok']);
});

// --- 投出表单 ---

await test('执行立即返回 ok: true 与那条说明，并标记本轮结束', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions: [{ question: '选哪个？' }] }, exec);
  assert.equal(result.ok, true);
  assert.equal(typeof result.message, 'string');
  assert.match(result.message, /this turn has ended/);
  assert.deepEqual(concluded, ['concludeTurn'], '发完表单必须标记本轮结束');
});

await test('说明里的作答格式与块里的行形一致（题号独占一行、每项一行带记号）', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({ questions: [{ question: '选哪个？' }] }, exec);
  assert.match(result.message, /"1\."/);
  assert.match(result.message, /"- " line per chosen option or typed text/);
});

await test('render 给出模型读到的那段 JSON（message 就在里面）', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({ questions: [{ question: '？' }] }, exec);
  const blocks = tool.output.render({ questions: [] }, result);
  assert.deepEqual(blocks, [{ type: 'text', text: JSON.stringify(result) }]);
});

await test('同一个执行上下文只标记一次；两次调用各自标记各自的那一次', async () => {
  const { tool } = await assemble();
  const first = makeExec();
  const second = makeExec();
  await tool.execute({ questions: [{ question: '？' }] }, first.exec);
  await tool.execute({ questions: [{ question: '？' }] }, first.exec);
  await tool.execute({ questions: [{ question: '？' }] }, second.exec);
  assert.equal(first.concluded.length, 2);
  assert.equal(second.concluded.length, 1);
});

// --- 入参校验：留下的三条 ---

await test('漏写题型不再被拒：有选项按多选、没选项按自由，照常投出', async () => {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions: [{ question: '？', options: [{ label: '甲' }] }, { question: '？' }] }, exec);
  assert.equal(result.ok, true);
  assert.deepEqual(concluded, ['concludeTurn']);
});

await test('老开关 multi_select、题型与选项不搭都不再是拒收项', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  const result = await tool.execute({
    questions: [{ question: '？', type: 'free', multi_select: false, options: [{ label: '甲' }] }],
  }, exec);
  assert.equal(result.ok, true);
});

/** 被本插件拒掉的一轮：ok:false、不结束本轮，把那段说明交回来。 */
async function notShown(questions) {
  const { tool } = await assemble();
  const { exec, concluded } = makeExec();
  const result = await tool.execute({ questions }, exec);
  assert.equal(result.ok, false);
  assert.deepEqual(concluded, [], '没投出的轮次绝不能让本轮就此结束');
  return result.message;
}

await test('空题干被拒（schema 只保证字段存在，不保证有内容）', async () => {
  assert.match(await notShown([{ question: '   ' }]), /empty question text/);
});

await test('空选项文字被拒', async () => {
  assert.match(await notShown([{ question: '？', options: [{ label: ' ' }] }]), /option 1 has an empty label/);
});

await test('同一题里两段只差推荐标记的文字被拒（界面看着一模一样，选的是哪一项就分不出来了）', async () => {
  const message = await notShown([{ question: '？', options: [{ label: 'A：移走；推荐' }, { label: 'A：移走（推荐）' }] }]);
  assert.match(message, /same label "A：移走"/);
});

await test('多条违规一条一行地交回去，不另写一份规则清单', async () => {
  const message = await notShown([{ question: '  ' }, { question: '？', options: [{ label: ' ' }] }]);
  assert.equal(message.split('\n').length, 2);
});

await test('缺题干、缺 label、questions 不是数组、题型越界都由 defineTool 的入参校验拦住', async () => {
  const { tool } = await assemble();
  const { exec } = makeExec();
  await assert.rejects(
    () => tool.execute({ questions: [{ options: [{ label: '甲' }] }] }, exec),
    /missing required property "questions\[0\]\.question"/,
  );
  await assert.rejects(
    () => tool.execute({ questions: [{ question: '？', options: [{ description: 'x' }] }] }, exec),
    /missing required property "questions\[0\]\.options\[0\]\.label"/,
  );
  await assert.rejects(() => tool.execute({ questions: 'not an array' }, exec), /"questions" must be an array/);
  await assert.rejects(
    () => tool.execute({ questions: [{ question: '？', type: 'checkbox' }] }, exec),
    /must be one of \["single","multi","free"\]/,
  );
});

// --- 闸门 ---

await test('投影单元真的注册在投影表里：键读得出状态', async () => {
  const { ctx, tool } = await assemble();
  const world = makeSession();
  const { exec } = makeExec(world.session);
  await tool.execute({ questions: [{ question: '？' }] }, exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '？' }]), result: { ok: true, message: 'x' } });
  const state = ctx.sessionProjections.stateOf(world.session, GATE_KEY);
  assert.equal(state.pending.callId, 'call-1');
  assert.deepEqual(state.pending.questions, ['？']);
});

await test('闸门：有一张待答的表时再调被拦下——不投出、不结束本轮，说明里带着旧表问了什么', async () => {
  const { tool } = await assemble();
  const world = makeSession();
  const first = makeExec(world.session);
  await tool.execute({ questions: [{ question: '第一张问的？' }] }, first.exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '第一张问的？' }]), result: { ok: true, message: 'x' } });

  const second = makeExec(world.session);
  const result = await tool.execute({ questions: [{ question: '第二张问的？' }] }, second.exec);
  assert.equal(result.ok, false);
  assert.deepEqual(second.concluded, [], '拦下的这一轮不能结束本轮');
  assert.match(result.message, /still waiting for the user's answer/);
  assert.match(result.message, /It asked: 1\. 第一张问的？/);
  assert.match(result.message, /replace: true/);
  assert.doesNotMatch(result.message, /第二张问的？/);
});

await test('闸门：带 replace: true 重调就投出，旧表退场、新表接上', async () => {
  const { ctx, tool } = await assemble();
  const world = makeSession();
  const first = makeExec(world.session);
  await tool.execute({ questions: [{ question: '第一张问的？' }] }, first.exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '第一张问的？' }]), result: { ok: true, message: 'x' } });

  const second = makeExec(world.session);
  const result = await tool.execute({ questions: [{ question: '更新的？' }], replace: true }, second.exec);
  assert.equal(result.ok, true);
  assert.deepEqual(second.concluded, ['concludeTurn']);
  recordRound(world, { callId: 'call-2', argsRaw: JSON.stringify({ questions: [{ question: '更新的？' }], replace: true }), result });
  const state = ctx.sessionProjections.stateOf(world.session, GATE_KEY);
  assert.equal(state.pending.callId, 'call-2');
});

await test('闸门：用户带着那张表的记号作答之后，下一轮照常投出', async () => {
  const { ctx, tool } = await assemble();
  const world = makeSession();
  const first = makeExec(world.session);
  await tool.execute({ questions: [{ question: '？' }] }, first.exec);
  recordRound(world, { callId: 'call-abc123', argsRaw: args([{ question: '？' }]), result: { ok: true, message: 'x' } });
  const mark = importBlockStart('call-abc123');
  recordUserMessage(world, `${mark}\n1.\n- 甲\n【/拷问作答】`);

  const second = makeExec(world.session);
  const result = await tool.execute({ questions: [{ question: '新的？' }] }, second.exec);
  assert.equal(result.ok, true);
  assert.equal(ctx.sessionProjections.stateOf(world.session, GATE_KEY).pending, null);
});

await test('闸门：转向消息、聊别的事、答别的表都不解闸', async () => {
  const { tool } = await assemble();
  const world = makeSession();
  await tool.execute({ questions: [{ question: '？' }] }, makeExec(world.session).exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '？' }]), result: { ok: true, message: 'x' } });
  recordUserMessage(world, '边跑边补一句');
  recordUserMessage(world, `${importBlockStart('zzzz')}\n1.\n- 另一张表的作答\n【/拷问作答】`);

  const blocked = await tool.execute({ questions: [{ question: '新的？' }] }, makeExec(world.session).exec);
  assert.equal(blocked.ok, false, '没答这张表之前，闸门一直关着');
});

await test('闸门：只有开头那行、收尾行没来，不算这张表被答了', async () => {
  const { tool } = await assemble();
  const world = makeSession();
  await tool.execute({ questions: [{ question: '？' }] }, makeExec(world.session).exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '？' }]), result: { ok: true, message: 'x' } });
  recordUserMessage(world, importBlockStart('call-1'));

  const blocked = await tool.execute({ questions: [{ question: '新的？' }] }, makeExec(world.session).exec);
  assert.equal(blocked.ok, false, '起止行不配对的半截块什么都没答，闸门照旧关着');
});

await test('闸门：没挂投影服务的组合里退化成不拦，工具照常注册、照常投出', async () => {
  const { ctx, tool } = await assemble(undefined, { projections: false });
  assert.equal(ctx.get('sessionProjections'), undefined);
  const { exec, concluded } = makeExec(makeSession().session);
  const result = await tool.execute({ questions: [{ question: '？' }] }, exec);
  assert.equal(result.ok, true);
  assert.deepEqual(concluded, ['concludeTurn']);
});

await test('闸门：投影服务比这个插件晚挂上也接得上（单元在服务出现的那一刻注册）', async () => {
  const { ctx, tool } = await assemble(undefined, { projections: false });
  const world = makeSession();
  new SessionProjectionRegistry(ctx);
  await Promise.resolve();

  await tool.execute({ questions: [{ question: '第一张问的？' }] }, makeExec(world.session).exec);
  recordRound(world, { callId: 'call-1', argsRaw: args([{ question: '第一张问的？' }]), result: { ok: true, message: 'x' } });
  assert.equal(ctx.sessionProjections.stateOf(world.session, GATE_KEY).pending.callId, 'call-1');

  const blocked = await tool.execute({ questions: [{ question: '第二张问的？' }] }, makeExec(world.session).exec);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /It asked: 1. 第一张问的？/);
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
  // 先剥掉注释：整行注释与行尾注释都算。注释里出现 config 字样是合法文档（本文件开头就写了它
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

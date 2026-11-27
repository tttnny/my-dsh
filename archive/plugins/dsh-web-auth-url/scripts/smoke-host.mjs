/**
 * 宿主半边自检：把承重点放在 **真实的 0.2.2-rc.3 内核服务** 上跑，而不是桩件——
 * 每条断言的全部意义就是「DSH 换了实现，本插件立刻挂」：
 *
 * 1. 「登录地址」工具真的注册进真 `ctx.tools`（@deepseek-ai/dsh-tools 的 ToolRuntime），
 *    并把 connection 为公布根加过 token 的地址原样交给模型。
 * 2. 地址取对外公布的那个根：配了 `publicUrl` 时与 `DSH_WEB_URL` 同源，模型拿它
 *    换 cookie 时命中的就是 `$DSH_WEB_URL` 那一份。
 * 3. 托管环境变量：真 `ctx.shellEnv` 的 `collect()` 每次调用都重新执行本插件的
 *    `resolve`，token 轮换后下一次 shell 调用拿到新地址。
 * 4. 不碰提示词：插件只注册工具与托管变量，导出面里没有 Config，也不注册任何段落——
 *    用法全部由工具描述承担（内核的「工具语义归工具描述」规则）。
 *
 * 内核包是本插件的 devDependencies（与 engines.dsh 同版本），因此自检不需要指向
 * 任何 DSH 安装副本，`pnpm install` 后即可离线跑。文件末尾另有一段守卫反例：
 * cordis 对未声明服务的属性读取真的抛错，上面「用 inject 拿服务」才不是装饰。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as ShellEnv from '@deepseek-ai/dsh-shell-env';
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native';
import ToolRuntime from '@deepseek-ai/dsh-tools';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, '..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const plugin = await import('../lib/index.js');
const { inject, name } = plugin;

const TOKEN = 'launch-token-example';
const ORIGIN = 'http://127.0.0.1:3080';

/** 模型看到的工具名。 */
const TOOL_NAME = 'web_gui_login';

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  await fn();
  passed += 1;
  console.log(`  ok   ${label}`);
}

/** 读一个已安装包的真实版本号（沿解析出的入口向上找同名 package.json）。 */
function installedVersion(pkg) {
  let dir = dirname(require.resolve(pkg));
  while (dirname(dir) !== dir) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const found = JSON.parse(readFileSync(candidate, 'utf8'));
      if (found.name === pkg) return found.version;
    }
    dir = dirname(dir);
  }
  throw new Error(`已安装包 ${pkg} 的 package.json 未找到`);
}

/**
 * 装配一套真实的宿主树：真 systemPrompt + 真 shellEnv + 真 ToolRuntime + 真 native executor。
 * 工具描述由 executor 插件产出，`systemPrompt.assemble` 前必须装一个，否则抛
 * `TOOL_EXECUTOR_UNAVAILABLE`。
 * web 侧只桩「监听器自己报根」「对外公布的根」与「给根加 token」三个面——它们是
 * webServer、webApp 与 connection 的公开契约，dsh-web-app 读的也是这三个。
 * @param {{ token?: string, web?: boolean, origin?: string, advertised?: string, originFails?: boolean }} options - 装配参数。
 * @returns {Promise<{ ctx: object, state: { token: string } }>} 上下文与可轮换的 token。
 */
async function host({ token = TOKEN, web = true, origin = ORIGIN, advertised, originFails = false } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ShellEnv, {});
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(NativeToolExecutor);
  const state = { token };
  if (web) {
    ctx.provide('webServer', {
      getOrigin: () => {
        if (originFails) throw new Error('webserver: origin read before the listener bound a port');
        return origin;
      },
    });
    if (advertised !== undefined) ctx.provide('webApp', { getAdvertisedUrl: () => advertised });
    ctx.provide('connection', { authenticatedUrl: (baseUrl) => `${baseUrl}/?token=${state.token}` });
  }
  return { ctx, state };
}

/**
 * 把本插件装进上下文。依赖齐备时 `apply` 同步执行；这里仍 await 一次 fiber，
 * 是为了让「将来改成异步注册」变成失败而不是静默漏断言。
 * @param {object} ctx - 已装配的上下文。
 * @returns {Promise<object>} 同一个上下文。
 */
async function mount(ctx) {
  await ctx.plugin(plugin, {});
  await ctx.fiber.await();
  return ctx;
}

// --- 插件身份与清单口径 ---------------------------------------------------
await test('插件名与硬依赖：工具、连接、监听器三者缺一就不该激活', () => {
  assert.equal(name, 'dsh-web-auth-url');
  assert.deepEqual(inject, ['tools', 'connection', 'webServer'], '三个硬依赖缺一，apply 就不该跑');
});

await test('本插件不贡献提示词：导出里没有 Config，也没有段落相关的东西', () => {
  assert.equal(plugin.Config, undefined, '没有配置面：用法全部由工具描述承担');
  assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject', 'name']);
});

await test('内核基线声明齐整（engines / peer / dev 同串）', () => {
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.3', 'engines.dsh 必须声明不低于基线 0.2.2-rc.3 的支持范围');
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '^4.1.0');
  assert.equal(installedVersion('@deepseek-ai/cordis'), '4.1.0', 'cordis 必须对齐安装版本');
  assert.equal(manifest.dependencies, undefined, '本插件不导出 Config，因此不再需要 schemastery');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-tools'], manifest.engines.dsh, '工具表是硬依赖，peer 要与 engines 同串');
  // 声明层写「大于等于当前内核」的范围，安装层钉住同一个版本：范围只表达兼容下界，
  // 自检跑的是钉住的那一份，两者各管一件事。
  for (const pkg of ['@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-shell-env', '@deepseek-ai/dsh-tool-executor-native', '@deepseek-ai/dsh-tools']) {
    assert.equal(manifest.devDependencies[pkg], manifest.engines.dsh, `${pkg} 的 devDependency 必须与 engines.dsh 同串`);
    assert.equal(installedVersion(pkg), '0.2.2-rc.3', '自检跑的内核包必须仍是基线版本 0.2.2-rc.3');
  }
});

// --- 承重点一：真 ToolRuntime 里拿出一把能用的地址 ------------------------
{
  const { ctx } = await host();
  await mount(ctx);
  const tool = ctx.tools.get(TOOL_NAME);

  await test('工具注册进真工具表，参数面为空、输出面只有一个 url 字段', () => {
    assert.ok(tool !== undefined, '工具没注册上');
    assert.equal(tool.name, TOOL_NAME);
    assert.deepEqual(tool.parameters.properties, {}, '参数面必须为空：取地址不需要模型给任何东西');
    assert.deepEqual(Object.keys(tool.output.schema.properties), ['url'], '结果里只有模型要用的那一件东西');
    assert.equal(tool.output.schema.additionalProperties, false, '输出面必须封闭');
  });

  const value = await tool.execute({}, {});

  await test('返回值就是公布根加进程 token：地址与 shell 里的 DSH_WEB_AUTH_URL 同一条', () => {
    assert.deepEqual(Object.keys(value), ['url'], '结果只有地址');
    assert.equal(value.url, `${ORIGIN}/?token=${TOKEN}`);
  });

  await test('render 把地址与两条 curl 交出来：先定 jar 路径，再用它换 cookie、复用 cookie', () => {
    const rendered = tool.output.render({}, value).map((block) => block.text).join('\n');
    assert.ok(rendered.includes(value.url), '地址必须出现在 render 里，否则模型读不到它');
    assert.ok(rendered.includes('curl -s -c "$JAR"'), '要给出换 cookie 的命令');
    assert.ok(rendered.includes('curl -s -b "$JAR" "$DSH_WEB_URL/"'), '后续请求要挂到干净地址上');
    // 两条命令都引用 $JAR：不先给出它的定义，复制出去就执行不了。
    const jarDefined = rendered.indexOf('JAR=./tmp/');
    assert.ok(jarDefined !== -1, 'jar 路径必须由调用者在项目 ./tmp 下选定，并写进 render');
    assert.ok(jarDefined < rendered.indexOf('curl -s -c "$JAR"'), 'jar 的定义必须排在换 cookie 的命令之前');
    assert.equal(rendered.includes('JAR=/tmp/'), false, '不要引导使用系统 /tmp');
  });
}

// --- 承重点二：公布根优先，地址随 token 轮换 ------------------------------
{
  const { ctx, state } = await host({ advertised: 'http://localhost:3080' });
  await mount(ctx);
  const tool = ctx.tools.get(TOOL_NAME);

  await test('公布根与监听根不同时跟公布根走：模型拿它换 cookie，命中的就是 $DSH_WEB_URL 那一份', async () => {
    const value = await tool.execute({}, {});
    assert.equal(value.url, `http://localhost:3080/?token=${TOKEN}`);
  });

  await test('token 轮换后重调一次就拿到新地址，不做缓存', async () => {
    state.token = 'rotated-token';
    const value = await tool.execute({}, {});
    assert.equal(value.url, 'http://localhost:3080/?token=rotated-token');
  });
}

// --- 监听器未 bind：可 grep 的错误码，而不是内核原话 --------------------
{
  const { ctx } = await host({ originFails: true });
  await mount(ctx);
  await test('监听器未 bind 时抛带 code 的 HarnessError，并说明等实例服务后重调', async () => {
    const error = await ctx.tools.get(TOOL_NAME).execute({}, {}).then(
      () => assert.fail('这个分支必须失败'),
      (reason) => reason,
    );
    // 可预期失败要带稳定 code，工具结果才会保留 error.info.code；
    // 只把码写进消息文本的话，调用方只能去解析人话。
    assert.equal(error.code, 'WEB_GUI_LOGIN_NOT_READY');
    assert.equal(error.name, 'WebGuiLoginNotReadyError');
    assert.equal(error.message.includes('listener bound a port'), false, '不要把内核的原始异常原样抛给模型');
  });
}

// --- 承重点三：真 shellEnv，每次 collect 即时解析 --------------------------
{
  const { ctx, state } = await host();
  await mount(ctx);

  await test('真实 shellEnv.collect 每次调用即时解析，token 轮换后跟着变', () => {
    const first = ctx.shellEnv.collect({});
    assert.equal(first.DSH_WEB_AUTH_URL, `${ORIGIN}/?token=${TOKEN}`, '必须给出带 token 的当前地址');

    state.token = 'rotated-token';
    const second = ctx.shellEnv.collect({});
    assert.equal(second.DSH_WEB_AUTH_URL, `${ORIGIN}/?token=rotated-token`, 'token 轮换后下一次 collect 必须重新解析');

    const declared = ctx.shellEnv.list().find((variable) => variable.key === 'DSH_WEB_AUTH_URL');
    assert.equal(declared?.contributor, 'dsh-web-auth-url', '变量必须以本插件名登记');
    assert.ok(declared.description.trim().length > 0, '登记的变量必须有描述（真实注册表会拒绝空描述）');
    assert.match(declared.description, /web_gui_login/u, '变量描述必须把模型指向工具，而不是让它自己拼地址');
  });

  await test('工具与变量给出的是同一条地址：两边各解析一次，口径不能分叉', async () => {
    const value = await ctx.tools.get(TOOL_NAME).execute({}, {});
    assert.equal(value.url, ctx.shellEnv.collect({}).DSH_WEB_AUTH_URL);
  });
}

// --- 不碰提示词：装上本插件与不装，系统提示词一模一样 ----------------------
{
  // 工具描述由 executor 插件产出：assemble 前必须装一个。
  const bare = new Context();
  await bare.plugin(SystemPrompt, {});
  await bare.plugin(ToolRuntime);
  await bare.plugin(NativeToolExecutor);
  const without = await bare.systemPrompt.assemble({});

  const { ctx } = await host();
  await mount(ctx);
  const withPlugin = await ctx.systemPrompt.assemble({});

  await test('装上本插件不改变系统提示词：段落、上下文、变量都与不装时相同', () => {
    assert.deepEqual(
      withPlugin.sections.map((section) => section.name),
      without.sections.map((section) => section.name),
      '本插件不得新增任何提示词段落',
    );
    assert.deepEqual(
      withPlugin.contexts.map((context) => context.name),
      without.contexts.map((context) => context.name),
      '也不得新增运行时上下文',
    );
    assert.deepEqual(Object.keys(withPlugin.variables).sort(), Object.keys(without.variables).sort(), '也不得注册提示词变量');
  });
}

// --- 没有 web 部署：整条插件不激活 ----------------------------------------
{
  const { ctx } = await host({ web: false });
  await mount(ctx);

  await test('缺 connection / webServer 时 apply 不跑：工具与变量都不出现', async () => {
    assert.equal(ctx.tools.get(TOOL_NAME), undefined, '没有 web 部署就不该有登录工具');
    assert.equal('DSH_WEB_AUTH_URL' in ctx.shellEnv.collect({}), false, '也不该注入变量');
  });
}

// --- 守卫反例：cordis 真的拒绝未声明服务的属性读取 ------------------------
{
  const ctx = new Context();
  await ctx.plugin(ShellEnv, {});
  await test('未声明服务必须抛错，否则上面用 inject 取服务就不是必需的', async () => {
    await assert.rejects(
      async () => {
        await ctx.plugin({ name: 'guarded', apply: (guardedCtx) => void guardedCtx.shellEnv });
      },
      /cannot get property "shellEnv" without inject/u,
    );
    assert.equal(ctx.get('shellEnv') !== undefined, true, 'ctx.get 不抛错，可选能力走它');
  });
}

console.log(`smoke-host: ${String(passed)}/${String(total)} ok`);

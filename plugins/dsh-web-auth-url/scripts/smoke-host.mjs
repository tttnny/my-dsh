/**
 * 宿主半边自检：把承重点放在 **真实的 0.2.1-rc.2 内核服务** 上跑，而不是桩件——
 * 每条断言的全部意义就是「DSH 换了实现，本插件立刻挂」：
 *
 * 1. 登录工具真的注册进真 `ctx.tools`（@deepseek-ai/dsh-tools 的 ToolRuntime），
 *    并且一次真实 HTTP 往返就把 cookie 换成 curl 能直接读的 jar：本文件起一个
 *    本地 `node:http` 假服，回 303 + `Set-Cookie`，断言 jar 的内容、权限与过期。
 * 2. token 不外泄：工具返回的规范值、`render` 出来的文本、抛出的错误文本里都不
 *    出现 token。错误里带上 url 是最容易犯的那种泄漏，所以专门验一条失败分支。
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
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as ShellEnv from '@deepseek-ai/dsh-shell-env';
import ToolRuntime from '@deepseek-ai/dsh-tools';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const packageDir = realpathSync(join(here, '..'));
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const plugin = await import('../lib/index.js');
const { inject, name, selfDir } = plugin;

const TOKEN = 'launch-token-example';
const COOKIE_NAME = 'dsh-auth-smoke';
const COOKIE_VALUE = 'v1.smoke.cookie';

/** 0.2.1-rc.2 `SECTION_ORDERS.WEB_SURFACE` 的实际取值，锚点漂了必须当场失败。 */
const ANCHOR_ORDER = 10100;
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
 * 起一个假 Web GUI：`GET /` 回 303 与一条 `Set-Cookie`，其余路径回 200。
 * 它只模仿 connection 对根请求做的事，够验「换 cookie 并落 jar」这一段。
 * @param {{ status?: number, cookie?: boolean }} [options] - 故意跑偏的分支。
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>} 根地址与收尾。
 */
async function fakeGui(options = {}) {
  const status = options.status ?? 303;
  const withCookie = options.cookie ?? true;
  const sessionOnly = options.sessionOnly ?? false;
  const delayMs = options.delayMs ?? 0;
  const server = createServer((request, response) => {
    // token 地址是 `/?token=…`：按 pathname 判根，否则这条分支永远走不到。
    const { pathname } = new URL(request.url ?? '/', 'http://placeholder');
    if (pathname === '/') {
      setTimeout(() => {
        /** @type {Record<string, string>} */
        const headers = { location: './' };
        if (withCookie) {
          const lifetime = sessionOnly ? '' : 'Max-Age=2592000; ';
          headers['set-cookie'] = `${COOKIE_NAME}=${COOKIE_VALUE}; ${lifetime}Path=/; HttpOnly; SameSite=Strict`;
        }
        response.writeHead(status, headers);
        response.end();
      }, delayMs);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {{ port: number }} */ (server.address());
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * 装配一套真实的宿主树：真 systemPrompt + 真 shellEnv + 真 ToolRuntime。
 * web 侧只桩「监听器自己报根」「对外公布的根」与「给根加 token」三个面——它们是
 * webServer、webApp 与 connection 的公开契约，dsh-web-app 读的也是这三个。
 * @param {{ token?: string, web?: boolean, gui?: string, advertised?: string, originFails?: boolean }} [options] - 装配参数。
 * @returns {Promise<{ ctx: object, state: { token: string } }>} 上下文与可轮换的 token。
 */
async function host({ token = TOKEN, web = true, gui, advertised, originFails = false } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ShellEnv, { dshHome: join(tmpdir(), 'dsh-web-auth-url-smoke') });
  await ctx.plugin(ToolRuntime);
  const state = { token };
  if (web) {
    ctx.provide('webServer', {
      getOrigin: () => {
        if (originFails) throw new Error('webserver: origin read before the listener bound a port');
        return gui ?? 'http://127.0.0.1:3080';
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
 * @param {object} [config] - loader 交给插件行的 config。
 * @returns {Promise<object>} 同一个上下文。
 */
async function mount(ctx, config) {
  await ctx.plugin(plugin, config);
  await ctx.fiber.await();
  return ctx;
}

/** 一次工具调用的执行上下文：真 DSH 里还会带 agent 与会话，这里只给取消信号。 */
const exec = () => ({ signal: new AbortController().signal });

// --- 插件身份与清单口径 ---------------------------------------------------
await test('插件名与硬依赖：工具、连接、监听器三者缺一就不该激活', () => {
  assert.equal(name, 'dsh-web-auth-url');
  assert.deepEqual(inject, ['tools', 'connection', 'webServer'], '三个硬依赖缺一，apply 就不该跑');
});

await test('本插件不贡献提示词：导出里没有 Config，也没有段落相关的东西', () => {
  assert.equal(plugin.Config, undefined, '没有配置面：用法全部由工具描述承担');
  assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject', 'name', 'selfDir']);
});

// --- selfDir：本插件自身安装目录（预留工具） ------------------------------
// 钉「realpath 后的落点 = 本包目录」：开发副本下包名会被解析到 profiles 里的
// 链接路径，只有 realpath 之后才回到仓库。不 realpath 的实现在开发副本当场挂。
await test('selfDir 解析回本包目录，且已是 realpath', () => {
  assert.equal(selfDir(), packageDir, 'selfDir 必须 realpath 回本包目录');
  assert.equal(realpathSync(selfDir()), selfDir(), 'selfDir 必须已经是 realpath');
  assert.equal(existsSync(join(selfDir(), manifest.main)), true, 'selfDir 必须能拼出真实入口文件');
  assert.equal(existsSync(join(selfDir(), 'cordis.patch.yml')), true, 'selfDir 必须能拼出随包文件');
});

await test('内核基线声明齐整（engines / peer / dev 同串）', () => {
  assert.equal(manifest.engines.dsh, '>=0.2.1-rc.2', 'engines.dsh 必须声明不低于基线 0.2.1-rc.2 的支持范围');
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '^4.0.5');
  assert.equal(installedVersion('@deepseek-ai/cordis'), '4.0.5', 'cordis 必须对齐安装版本');
  assert.equal(manifest.dependencies, undefined, '本插件不导出 Config，因此不再需要 schemastery');
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-tools'], manifest.engines.dsh, '工具表是硬依赖，peer 要与 engines 同串');
  // engines.dsh 写成 >=0.2.1-rc.2（大于等于当前版本），而 devDependencies 仍定向
  // 安装基线版本 0.2.1-rc.2，两者刻意不同：声明层写同一个范围，安装层钉住基线。
  for (const pkg of ['@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-shell-env', '@deepseek-ai/dsh-tools']) {
    assert.equal(manifest.devDependencies[pkg], manifest.engines.dsh, `${pkg} 的 devDependency 必须与 engines.dsh 同串`);
    assert.equal(installedVersion(pkg), '0.2.1-rc.2', '自检跑的内核包必须仍是基线版本 0.2.1-rc.2');
  }
});

// --- 承重点一：真 ToolRuntime + 一次真实 HTTP 往返 --------------------------
{
  const gui = await fakeGui();
  const dshHome = mkdtempSync(join(tmpdir(), 'dsh-web-auth-url-home-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = dshHome;
  try {
    const { ctx } = await host({ gui: gui.origin });
    await mount(ctx, {});
    const tool = ctx.tools.get(TOOL_NAME);

    await test('工具注册进真工具表，参数面为空、输出面两个字段', () => {
      assert.ok(tool !== undefined, '工具没注册上');
      assert.equal(tool.name, TOOL_NAME);
      assert.deepEqual(tool.parameters.properties, {}, '参数面必须为空：登录不需要模型给任何东西');
      // 成功路径只可能是 303（其余状态在 execute 里已抛错），状态码放进结果就是一条恒定的废话。
      assert.deepEqual(Object.keys(tool.output.schema.properties).sort(), ['expiresAt', 'jar']);
      assert.equal(tool.output.schema.additionalProperties, false, '输出面必须封闭');
      assert.ok(tool.timeoutMs > 0, '必须声明协作式超时预算');
    });

    const value = await tool.execute({}, exec());

    await test('303 + Set-Cookie 被换成 jar：路径在 $DSH_HOME/cache 下，内容是可读的 Netscape 表', () => {
      assert.deepEqual(Object.keys(value).sort(), ['expiresAt', 'jar'], '结果里只有模型要用的两件东西');
      assert.ok(value.jar.startsWith(join(dshHome, 'cache')), `jar 必须落在 $DSH_HOME/cache 下，实为 ${value.jar}`);
      assert.equal(existsSync(value.jar), true, 'jar 文件必须真的写出来');
      const lines = readFileSync(value.jar, 'utf8').split('\n');
      assert.equal(lines[0], '# Netscape HTTP Cookie File', 'curl 靠这行认格式');
      const row = lines.find((line) => line.includes(COOKIE_NAME));
      assert.ok(row !== undefined, 'cookie 行必须写进 jar');
      const fields = row.split('\t');
      assert.equal(fields.length, 7, 'cookie 行必须是 Netscape 的七段');
      assert.equal(fields[0], '#HttpOnly_127.0.0.1', 'HttpOnly cookie 要带 curl 认的前缀，域取监听器自己的 host');
      assert.equal(fields[2], '/');
      assert.equal(fields[3], 'FALSE', 'HTTP 监听器下 cookie 不是 Secure');
      assert.equal(fields[5], COOKIE_NAME);
      assert.equal(fields[6], COOKIE_VALUE, 'cookie 值必须原样落盘');
      assert.ok(Number(fields[4]) > Math.floor(Date.now() / 1000), 'Max-Age 必须换算成未来的绝对时间');
    });

    await test('过期时间：取 jar 里最早的 cookie 过期，写成 ISO', () => {
      assert.match(String(value.expiresAt), /^\d{4}-\d{2}-\d{2}T/u);
      assert.ok(Date.parse(value.expiresAt) > Date.now(), '过期时间必须在未来');
    });

    await test('jar 权限是 0600，目录是 0700', () => {
      assert.equal(statSync(value.jar).mode & 0o777, 0o600, 'cookie jar 只许本人读写');
      assert.equal(statSync(dirname(value.jar)).mode & 0o777, 0o700, 'jar 所在目录只许本人进入');
    });

    await test('token 不进工具结果：规范值与 render 文本里都没有它', () => {
      const rendered = tool.output.render({}, value).map((block) => block.text).join('\n');
      for (const text of [JSON.stringify(value), rendered]) {
        assert.equal(text.includes('token='), false, '工具结果里不能出现 token');
        assert.equal(text.includes(TOKEN), false, '工具结果里不能出现 launch token');
      }
      assert.ok(rendered.includes(value.jar), 'render 必须把 jar 路径交给模型');
      assert.ok(rendered.includes('$DSH_WEB_URL'), '示例命令要挂到干净地址上，而不是带 token 的地址');
    });

  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    rmSync(dshHome, { recursive: true, force: true });
    await gui.close();
  }
}

// --- 承重点一之二：会话 cookie、并发、取消、未 bind、跨域 ------------------
{
  await test('只有会话 cookie 时 expiresAt 是 null，字段照样在', async () => {
    const gui = await fakeGui({ sessionOnly: true });
    const home = mkdtempSync(join(tmpdir(), 'dsh-web-auth-url-session-'));
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    try {
      const { ctx } = await host({ gui: gui.origin });
      await mount(ctx, {});
      const value = await ctx.tools.get(TOOL_NAME).execute({}, exec());
      assert.equal('expiresAt' in value, true, '输出面声明了 expiresAt，就不能有时在有时不在');
      assert.equal(value.expiresAt, null);
      assert.equal(readFileSync(value.jar, 'utf8').includes(`\t0\t${COOKIE_NAME}\t`), true, '会话 cookie 的过期为 0');
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
      rmSync(home, { recursive: true, force: true });
      await gui.close();
    }
  });

  await test('取消信号真的到达请求：abort 后调用以 AbortError 结束', async () => {
    const gui = await fakeGui({ delayMs: 2_000 });
    const { ctx } = await host({ gui: gui.origin });
    await mount(ctx, {});
    const controller = new AbortController();
    const pending = ctx.tools.get(TOOL_NAME).execute({}, { signal: controller.signal });
    controller.abort();
    const error = await pending.then(
      () => assert.fail('取消之后不该成功'),
      (reason) => reason,
    );
    assert.equal(error.name, 'AbortError');
    await gui.close();
  });

  await test('监听器未 bind：给出可 grep 的 NOT_READY 错误，而不是内核原话', async () => {
    const { ctx } = await host({ originFails: true });
    await mount(ctx, {});
    const error = await ctx.tools.get(TOOL_NAME).execute({}, exec()).then(
      () => assert.fail('这个分支必须失败'),
      (reason) => reason,
    );
    assert.match(error.message, /WEB_GUI_LOGIN_NOT_READY/u);
    assert.equal(error.message.includes('listener bound a port'), false, '不要把内核的原始异常原样抛给模型');
  });

  await test('DSH_HOME 以 ~ 开头时按内核的规则展开，不落到当前目录', async () => {
    const gui = await fakeGui();
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = '~/dsh-web-auth-url-tilde';
    try {
      const { ctx } = await host({ gui: gui.origin });
      await mount(ctx, {});
      const value = await ctx.tools.get(TOOL_NAME).execute({}, exec());
      assert.equal(
        value.jar.startsWith(join(homedir(), 'dsh-web-auth-url-tilde', 'cache')),
        true,
        `~ 必须展开成用户主目录（内核 resolveDshHome 同款），实为 ${value.jar}`,
      );
      assert.equal(value.jar.includes(`${sep}~${sep}`), false, '不能在当前目录下造一个叫 ~ 的目录');
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
      rmSync(join(homedir(), 'dsh-web-auth-url-tilde'), { recursive: true, force: true });
      // 不展开 ~ 的实现会把目录造在当前目录下：无论断言成败都清掉，别让工作区留垃圾。
      rmSync(join(packageDir, '~'), { recursive: true, force: true });
      await gui.close();
    }
  });

  await test('公布根与监听根不同时，jar 名与 cookie 域都跟公布根走（jar 才发得出去）', async () => {
    const gui = await fakeGui();
    const home = mkdtempSync(join(tmpdir(), 'dsh-web-auth-url-advertised-'));
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = home;
    try {
      // 同一个监听器，两个写法都指向它：监听根写 127.0.0.1，公布根写 localhost。
      const { port } = new URL(gui.origin);
      const advertised = `http://localhost:${port}`;
      const { ctx } = await host({ gui: gui.origin, advertised });
      await mount(ctx, {});
      const value = await ctx.tools.get(TOOL_NAME).execute({}, exec());
      assert.equal(value.jar.includes(`localhost-${port}.jar`), true, 'jar 按公布根命名，与模型要访问的地址一致');
      const row = readFileSync(value.jar, 'utf8').split('\n').find((line) => line.includes(COOKIE_NAME));
      assert.equal(row.split('\t')[0], '#HttpOnly_localhost', 'cookie 域取自公布根');
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
      rmSync(home, { recursive: true, force: true });
      await gui.close();
    }
  });
}

// --- 承重点二：失败分支也不泄漏 token -------------------------------------
for (const [label, options] of [
  ['没有 Set-Cookie', { cookie: false }],
  ['状态不是 303', { status: 500 }],
]) {
  const gui = await fakeGui(options);
  const { ctx } = await host({ gui: gui.origin });
  await mount(ctx, {});
  const tool = ctx.tools.get(TOOL_NAME);
  await test(`${label}：抛出可修复的错误，且错误文本里没有 token`, async () => {
    const value = await tool.execute({}, exec()).then(
      () => assert.fail('这个分支必须失败'),
      (error) => error,
    );
    assert.match(value.message, /web_gui_login/u);
    assert.match(value.message, /303/u, '错误要交代期望的状态码');
    assert.equal(value.message.includes(TOKEN), false, '错误文本会落进会话记录，不能带 token');
    assert.equal(value.message.includes('token='), false, '错误文本不能带带 token 的地址');
  });
  await gui.close();
}

// --- 承重点三：真 shellEnv，每次 collect 即时解析 --------------------------
{
  const { ctx, state } = await host();
  await mount(ctx, {});

  await test('真实 shellEnv.collect 每次调用即时解析，token 轮换后跟着变', () => {
    const first = ctx.shellEnv.collect({});
    assert.equal(first.DSH_WEB_AUTH_URL, `http://127.0.0.1:3080/?token=${TOKEN}`, '必须给出带 token 的当前地址');

    state.token = 'rotated-token';
    const second = ctx.shellEnv.collect({});
    assert.equal(
      second.DSH_WEB_AUTH_URL,
      'http://127.0.0.1:3080/?token=rotated-token',
      'token 轮换后下一次 collect 必须重新解析',
    );

    const declared = ctx.shellEnv.list().find((variable) => variable.key === 'DSH_WEB_AUTH_URL');
    assert.equal(declared?.contributor, 'dsh-web-auth-url', '变量必须以本插件名登记');
    assert.ok(declared.description.trim().length > 0, '登记的变量必须有描述（真实注册表会拒绝空描述）');
    assert.match(declared.description, /web_gui_login/u, '变量描述必须把模型指向工具，而不是让它自己拼 curl');
  });
}

// --- 不碰提示词：装上本插件与不装，系统提示词一模一样 ----------------------
{
  const bare = new Context();
  await bare.plugin(SystemPrompt, {});
  await bare.plugin(ToolRuntime);
  const without = await bare.systemPrompt.assemble({});

  const { ctx } = await host();
  await mount(ctx, {});
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
  await mount(ctx, {});

  await test('缺 connection / webServer 时 apply 不跑：工具与变量都不出现', async () => {
    assert.equal(ctx.tools.get(TOOL_NAME), undefined, '没有 web 部署就不该有登录工具');
    assert.equal('DSH_WEB_AUTH_URL' in ctx.shellEnv.collect({}), false, '也不该注入变量');
  });
}

// --- 守卫反例：cordis 真的拒绝未声明服务的属性读取 ------------------------
{
  const ctx = new Context();
  await ctx.plugin(ShellEnv, { dshHome: join(tmpdir(), 'dsh-web-auth-url-smoke') });
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

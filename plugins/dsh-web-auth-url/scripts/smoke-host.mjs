/**
 * 宿主半边自检：把两个承重点放在 **真实的 0.1.7-rc.2 内核服务** 上跑，而不是桩件——
 * 这两条断言的全部意义就是「DSH 换了实现，本插件立刻挂」：
 *
 * 1. 托管环境变量：真实 `ctx.shellEnv`（@deepseek-ai/dsh-shell-env）的
 *    `collect()` 每次调用都重新执行本插件的 `resolve`，所以 token 轮换后
 *    下一次 shell 调用拿到新地址。桩件只能证明我们自己的闭包新鲜，证不了这一点。
 * 2. 段落锚点：真实 `ctx.systemPrompt`（@deepseek-ai/dsh-system-prompt）里
 *    `app:web-auth-url` 必须紧跟 `app:web-surface`。`getSectionOrder('WEB_SURFACE')`
 *    返回 undefined 时本插件算出的 order 是 NaN，真实 `section()` 会直接抛错。
 *
 * 两个内核包是本插件的 devDependencies（与 engines.dsh 同版本），因此自检不需要
 * 指向任何 DSH 安装副本，`pnpm install` 后即可离线跑。文件末尾另有一段守卫
 * 反例：cordis 对未声明服务的属性读取真的抛错，上面的「用 ctx.inject 拿服务」
 * 才不是装饰。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import * as ShellEnv from '@deepseek-ai/dsh-shell-env';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const { apply, Config, inject, name } = await import('../lib/index.js');

const PORT = 3080;
const TOKEN = 'launch-token-example';
const CLEAN_URL = `http://127.0.0.1:${PORT}`;
const AUTH_URL = `${CLEAN_URL}/?token=${TOKEN}`;

/** 本插件贡献的段落名。 */
const SECTION_NAME = 'app:web-auth-url';
/** 0.1.7-rc.2 `SECTION_ORDERS.WEB_SURFACE` 的实际取值，锚点漂了必须当场失败。 */
const ANCHOR_ORDER = 10100;

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
 * 装配一套真实的宿主树：真 systemPrompt + 真 shellEnv，web 侧用最小桩供给
 * `webServer.port` 与 `connection.authenticatedUrl`（dsh-web-app 依赖同样的两个面）。
 * @param {{token?: string, web?: boolean}} [options] - token 初值与是否提供 web 部署。
 * @returns {Promise<{ctx: object, state: {token: string}}>} 上下文与可轮换的 token 状态。
 */
async function host({ token = TOKEN, web = true } = {}) {
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ShellEnv, { dshHome: join(tmpdir(), 'dsh-web-auth-url-smoke') });
  const state = { token };
  if (web) {
    ctx.provide('webServer', { port: PORT });
    ctx.provide('connection', { authenticatedUrl: (baseUrl) => `${baseUrl}/?token=${state.token}` });
  }
  return { ctx, state };
}

/**
 * 把本插件应用到真实上下文。依赖齐备时 `ctx.inject` 的登记回调同步执行；
 * 这里仍 await 一次 fiber，是为了让「将来改成异步注册」变成失败而不是静默漏断言。
 */
async function mount(ctx, config) {
  apply(ctx, config);
  await ctx.fiber.await();
  return ctx;
}

// --- 插件身份与清单口径 ---------------------------------------------------
assert.equal(name, 'dsh-web-auth-url');
assert.deepEqual(inject, [], '插件必须声明零硬依赖，web 缺失时靠 ctx.get 降级');
assert.equal(Config({}).prompt, 'env', 'prompt 默认必须是 env（token 不进提示词）');
assert.equal(Config({ prompt: 'inline' }).prompt, 'inline');
assert.equal(Config({ prompt: 'off' }).prompt, 'off');
assert.throws(() => Config({ prompt: 'nope' }), '非法 prompt 必须被 schema 拒绝');

assert.equal(manifest.engines.dsh, '0.1.7-rc.2', 'engines.dsh 必须是精确的目标版本');
assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '^4.0.4');
assert.equal(installedVersion('@deepseek-ai/cordis'), '4.0.4', 'cordis 必须对齐安装版本');
assert.equal(manifest.dependencies['@deepseek-ai/schemastery'], '^3.18.4');
assert.equal(installedVersion('@deepseek-ai/schemastery'), '3.18.4', 'schemastery 必须对齐安装版本');
for (const pkg of ['@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-shell-env']) {
  assert.equal(
    installedVersion(pkg),
    manifest.engines.dsh,
    `${pkg} 的 devDependency 必须与 engines.dsh 同版本，否则自检跑的不是目标版本`,
  );
}

// --- 承重点一：真 shellEnv，每次 collect 即时解析 --------------------------
{
  const { ctx, state } = await host();
  await mount(ctx, { prompt: 'env' });

  const first = ctx.shellEnv.collect({});
  assert.equal(first.DSH_WEB_AUTH_URL, AUTH_URL, '真实 shellEnv.collect 必须给出带 token 的当前地址');

  state.token = 'rotated-token';
  const second = ctx.shellEnv.collect({});
  assert.equal(
    second.DSH_WEB_AUTH_URL,
    `${CLEAN_URL}/?token=rotated-token`,
    'token 轮换后下一次 collect 必须重新解析（每次 shell 调用即时解析）',
  );

  const declared = ctx.shellEnv.list().find((variable) => variable.key === 'DSH_WEB_AUTH_URL');
  assert.equal(declared?.contributor, 'dsh-web-auth-url', '变量必须以本插件名登记，真实注册表校验名字与键唯一性');
  assert.ok(declared.description.trim().length > 0, '登记的变量必须有描述（真实注册表会拒绝空描述）');
}

// --- 承重点二：真 systemPrompt，段落紧贴 app:web-surface --------------------
{
  const { ctx } = await host();
  await mount(ctx, { prompt: 'env' });

  const anchorOrder = ctx.systemPrompt.getSectionOrder('WEB_SURFACE');
  assert.ok(
    Number.isFinite(anchorOrder),
    "真实 systemPrompt 必须仍认识 'WEB_SURFACE' 位置——返回 undefined 时本插件算出 NaN，真实 section() 会抛错",
  );
  assert.equal(anchorOrder, ANCHOR_ORDER, 'WEB_SURFACE 位置值变了，+10 的紧邻关系必须重新核对');

  /**
   * 复刻 dsh-web-app 的锚点：它在 0.1.7-rc.2 以
   * `section({ name: 'app:web-surface', order: getSectionOrder('WEB_SURFACE') })` 注册
   * （安装副本 `lib/index.js` 第 180-184 行）。它不在本插件的依赖里，所以只能照同样的
   * 两件事复刻一个再断言紧邻；「这个名字对得上 dsh-web-app」靠读那一处源码保证，不是
   * 这条断言证明的。名字与期望值都写死成字面量，改任何一处都得同时面对另一处。
   */
  ctx.systemPrompt.section({ name: 'app:web-surface', order: anchorOrder, text: () => 'web surface' });
  const assembly = await ctx.systemPrompt.assemble({});
  const names = assembly.sections.map((section) => section.name);
  const mine = names.indexOf(SECTION_NAME);
  assert.notEqual(mine, -1, '段落必须注册进真实 systemPrompt');
  assert.deepEqual(
    names.slice(mine - 1, mine + 1),
    ['app:web-surface', SECTION_NAME],
    '本段落必须紧跟 app:web-surface',
  );

  const text = assembly.sections[mine].text;
  assert.ok(text.includes('DSH_WEB_AUTH_URL'), 'env 档必须报出变量名');
  assert.ok(!text.includes(TOKEN), 'env 档绝不能把 token 写进段落');

  const rendered = renderPrompt(assembly);
  assert.ok(rendered.includes('DSH_WEB_AUTH_URL'), 'env 档渲染后的系统提示词必须交代变量名');
  assert.ok(!rendered.includes(TOKEN), 'env 档渲染后的系统提示词里绝不能出现 token');
  assert.ok(
    text.includes('401') && text.includes('303') && text.includes('$JAR'),
    'env 档必须交代 401 / 303 / cookie jar 用法',
  );
}

// --- inline / off 两档 ----------------------------------------------------
{
  const { ctx } = await host();
  await mount(ctx, { prompt: 'inline' });
  const rendered = renderPrompt(await ctx.systemPrompt.assemble({}));
  assert.ok(rendered.includes(AUTH_URL), 'inline 档必须把带 token 的地址写进段落');
  assert.ok(!rendered.includes('DSH_WEB_AUTH_URL'), 'inline 档不再报变量名');
  assert.equal(ctx.shellEnv.collect({}).DSH_WEB_AUTH_URL, AUTH_URL, 'inline 档仍须托管环境变量');
}
{
  const { ctx } = await host();
  await mount(ctx, { prompt: 'off' });
  const sections = (await ctx.systemPrompt.assemble({})).sections;
  assert.ok(!sections.some((section) => section.name === SECTION_NAME), 'off 档不得注册段落');
  assert.equal(ctx.shellEnv.collect({}).DSH_WEB_AUTH_URL, AUTH_URL, 'off 档仍须托管环境变量');
}

// --- 无 web 部署：注册照常、值与段落都为空 --------------------------------
{
  const { ctx } = await host({ web: false });
  await mount(ctx, { prompt: 'env' });

  assert.equal('DSH_WEB_AUTH_URL' in ctx.shellEnv.collect({}), false, '缺 connection 时不得注入该变量');

  const assembly = await ctx.systemPrompt.assemble({});
  const mine = assembly.sections.find((section) => section.name === SECTION_NAME);
  assert.notEqual(mine, undefined, '段落注册不依赖 web 部署，照常完成');
  assert.equal(mine.text, '', '缺 connection 时段落必须渲染成空串');
  assert.ok(
    !renderPrompt(assembly).includes('Shell access to this Web GUI'),
    '空段落由真实 renderPrompt 过滤，系统提示词里不留痕迹',
  );
}

// --- 守卫反例：cordis 真的拒绝未声明服务的属性读取 ------------------------
{
  const ctx = new Context();
  await ctx.plugin(ShellEnv, { dshHome: join(tmpdir(), 'dsh-web-auth-url-smoke') });
  await assert.rejects(
    async () => {
      await ctx.plugin({ name: 'guarded', apply: (guardedCtx) => void guardedCtx.shellEnv });
    },
    /cannot get property "shellEnv" without inject/,
    '未声明服务必须抛错，否则本插件用 ctx.inject([...]) 取服务就不是必需的了',
  );
  assert.equal(ctx.get('shellEnv') !== undefined, true, 'ctx.get 不抛错，可选能力走它');
}

console.log('smoke-host: ok');
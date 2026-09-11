/**
 * 宿主半边装配自检：用带守卫的假上下文真跑一遍 apply()，断言登记形状、
 * 即时解析的地址，以及三种 prompt 模式各自的段落文本。
 *
 * 守卫必须真的抛错（末尾有反例断言），否则「未声明的服务」这类断言全是空转。
 */

import assert from 'node:assert/strict';
import { apply, Config, inject, name } from '../lib/index.js';

const PORT = 3080;
const TOKEN = 'launch-token-example';
const CLEAN_URL = `http://127.0.0.1:${PORT}`;
const AUTH_URL = `${CLEAN_URL}/?token=${TOKEN}`;

/**
 * 造一个假上下文。
 * @param services - 树上可读到的服务。
 * @param declared - 本上下文已 inject 的服务名。
 * @returns 读未声明服务即抛 cordis 同款错误的上下文。
 */
function makeContext(services, declared = new Set()) {
  const base = {
    get: (key) => services[key],
    inject: (names, callback) => {
      for (const key of names) {
        if (!(key in services)) throw new Error(`fake tree is missing service "${key}"`);
      }
      callback(makeContext(services, new Set(names)));
    },
  };
  return new Proxy(base, {
    get(target, property, receiver) {
      if (typeof property === 'symbol' || property in target) return Reflect.get(target, property, receiver);
      if (!declared.has(property)) throw new Error(`cannot get property "${property}" without inject`);
      return services[property];
    },
  });
}

/** 一套带 web 部署的服务桩。 */
function webServices() {
  return {
    webServer: { port: PORT },
    connection: { authenticatedUrl: (baseUrl) => `${baseUrl}/?token=${TOKEN}` },
    shellEnv: { register: () => () => {} },
    systemPrompt: { section: () => () => {}, getSectionOrder: (order) => (order === 'WEB_SURFACE' ? 10100 : Number.NaN) },
  };
}

/** 捕获一次 apply() 的登记结果。 */
function load(config, services = webServices()) {
  const captured = { contributor: undefined, section: undefined };
  services.shellEnv.register = (contributor) => {
    captured.contributor = contributor;
    return () => {};
  };
  services.systemPrompt.section = (section) => {
    captured.section = section;
    return () => {};
  };
  apply(makeContext(services), config);
  return { captured, services };
}

// --- 插件身份 -------------------------------------------------------------
assert.equal(name, 'dsh-web-auth-url');
assert.deepEqual(inject, [], '插件必须声明零硬依赖，web 缺失时靠 ctx.get 降级');
assert.equal(Config({}).prompt, 'env', 'prompt 默认必须是 env（token 不进提示词）');
assert.equal(Config({ prompt: 'inline' }).prompt, 'inline');
assert.throws(() => Config({ prompt: 'nope' }), '非法 prompt 必须被 schema 拒绝');

// --- 环境变量 -------------------------------------------------------------
{
  const { captured } = load({ prompt: 'env' });
  const contributor = captured.contributor;
  assert.equal(contributor.name, 'dsh-web-auth-url');
  assert.deepEqual(Object.keys(contributor.variables), ['DSH_WEB_AUTH_URL']);
  assert.ok(contributor.variables.DSH_WEB_AUTH_URL.description.trim().length > 0, '登记的变量必须有描述');
  assert.deepEqual(contributor.resolve({}), { DSH_WEB_AUTH_URL: AUTH_URL }, 'resolve 必须给出带 token 的当前地址');
}

// --- token 轮换：每次 resolve 重新解析 -------------------------------------
{
  const { captured, services } = load({ prompt: 'env' });
  services.connection.authenticatedUrl = (baseUrl) => `${baseUrl}/?token=rotated`;
  assert.deepEqual(captured.contributor.resolve({}), { DSH_WEB_AUTH_URL: `${CLEAN_URL}/?token=rotated` });
}

// --- 无 web 部署：不报错、不贡献值 -----------------------------------------
{
  const services = webServices();
  delete services.connection;
  delete services.webServer;
  const { captured } = load({ prompt: 'env' }, services);
  assert.deepEqual(captured.contributor.resolve({}), {}, '缺 connection 时 resolve 必须返回空');
  assert.equal(captured.section.text(), '', '缺 connection 时段落必须渲染成空串');
}

// --- 提示词段落 -----------------------------------------------------------
{
  const { captured } = load({ prompt: 'env' });
  assert.equal(captured.section.name, 'app:web-auth-url');
  assert.equal(captured.section.order, 10110, '段落必须紧跟 WEB_SURFACE（10100）');
  const text = captured.section.text();
  assert.ok(text.includes('DSH_WEB_AUTH_URL'), 'env 模式必须报出变量名');
  assert.ok(!text.includes(TOKEN), 'env 模式绝不能把 token 写进提示词');
  assert.ok(text.includes('401') && text.includes('303') && text.includes('$JAR'), 'env 模式必须交代 401 / 303 / cookie jar 用法');
}
{
  const { captured } = load({ prompt: 'inline' });
  const text = captured.section.text();
  assert.ok(text.includes(AUTH_URL), 'inline 模式必须把带 token 的地址写进段落');
  assert.ok(!text.includes('DSH_WEB_AUTH_URL'), 'inline 模式不再报变量名');
}
{
  const { captured } = load({ prompt: 'off' });
  assert.equal(captured.section, undefined, 'off 模式不得注册段落');
  assert.ok(captured.contributor !== undefined, 'off 模式仍须登记环境变量');
}

// --- 守卫自身的反例断言（守卫失效即失败） ---------------------------------
{
  const ctx = makeContext(webServices());
  assert.throws(() => ctx.shellEnv, /without inject/, '读未声明服务必须抛错，否则上面的断言全是空转');
  assert.equal(ctx.get('shellEnv') !== undefined, true, 'ctx.get 不抛错，可选能力走它');
}

console.log('smoke-host: ok');

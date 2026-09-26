/**
 * 浏览器半边的装配自检（约定见 docs/rules/client-wiring.md）。
 *
 * 1. 按 Web shell 的方式加载构建出来的 `lib/client.js`（`window.__ModuleLoader__.load` 桩件，
 *    require 只解答平台模块表里的请求，其余当场抛）；
 * 2. 用带内核 inject 守卫的假上下文跑 `apply()`：少声明服务会抛
 *    `cannot get property "x" without inject`，插件会整条 entry 变 failed 从页面消失，
 *    而宿主日志无异常——所以守卫必须在这里现身，且自身要有反例断言证明它还会抛；
 * 3. 顺带守住 class 名：`dsg-*` 在 JSX 与 CSS 之间只能一一对应，单边漂移只是样式静默失效；
 * 4. 守住 ui-primitives 的导出名：0.1.7 把 `Icon*Outline16/14/12` 成对改名成
 *    `Icon*OutlineRegular/Medium`，漏改只是页面上少一个图标（React 对 undefined 组件
 *    只 warning），没有任何运行时断言会现形，所以按安装副本的真实导出表点名核对。
 *
 * 运行：node scripts/smoke-client.mjs [plugin-dir]
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const bundleEntry = join(root, 'lib', 'client.js');
if (!existsSync(bundleEntry)) throw new Error(`浏览器半边未构建：${bundleEntry}（先跑 pnpm build）`);

const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
const styles = [];
const errors = [];
const registrations = [];
const locales = [];

/** 假 <style>：只记 data-plugin-css 与内容。 */
function makeStyleTag() {
  const tag = { dataset: {}, textContent: '' };
  return tag;
}

globalThis.document = {
  querySelector: (selector) => {
    const match = /^style\[data-plugin-css="(.*)"\]$/.exec(selector);
    assert.ok(match !== null, `未预期的选择器：${selector}`);
    return styles.find((tag) => tag.dataset.pluginCss === match[1]) ?? null;
  },
  createElement: () => makeStyleTag(),
  head: { appendChild: (tag) => { styles.push(tag); } },
};

/** 平台模块表：值导入只允许这些；其余请求是构建期纯净度门禁的漏网之鱼，这里当场抛。 */
const tolerant = new Proxy({}, {
  get: (_target, key) => (key === 'then' || typeof key === 'symbol' ? undefined : () => tolerant),
});
const platformModules = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]);

let exported;
let loadedId;
globalThis.window = {
  __ModuleLoader__: {
    load: ({ id, factory }) => {
      loadedId = id;
      exported = factory((specifier) => {
        if (!platformModules.has(specifier)) throw new Error(`module table miss: ${specifier}`);
        return tolerant;
      });
    },
  },
};

await import(`${pathToFileURL(bundleEntry).href}?smoke=${String(Date.now())}`);

/** 内核 inject 守卫的假上下文：声明过的服务可按属性读，其余抛，`get()` 不抛。 */
function makeCtx(declared = []) {
  const services = {
    slots: {
      inject: (key, callback) => {
        try {
          callback();
        } catch (error) {
          errors.push(`slots.inject(${key}) threw: ${error?.message}`);
        }
        return () => {};
      },
      register: (options, component) => {
        registrations.push({ name: options.name, key: options.key, locale: options.locale, component });
        return () => {};
      },
    },
    locale: { register: (ns) => { locales.push(ns); return () => {}; } },
  };
  const base = {
    on: () => () => {},
    effect: (fn) => { fn(); return () => {}; },
    get: (name) => services[name],
  };
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in target) return target[prop];
      if (declared.includes(prop)) return services[prop];
      throw new Error(`cannot get property "${prop}" without inject`);
    },
  });
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log(`${pkgName} 浏览器半边`);
test('bundle 按包名自注册', () => assert.equal(loadedId, pkgName));
test('导出 apply 与 inject', () => {
  assert.equal(typeof exported.apply, 'function');
  assert.deepEqual(exported.inject, ['locale', 'slots']);
});

test('守卫会拒绝未声明的服务读取（反例，否则下面的断言都是空转）', () => {
  assert.throws(() => makeCtx().locale, /cannot get property "locale" without inject/);
});
test('ctx.get 对未知服务不抛', () => assert.equal(makeCtx().get('nope'), undefined));

test('apply() 在守卫下跑得通', () => {
  exported.apply(makeCtx(exported.inject));
  assert.deepEqual(errors, []);
});
test('注册了自有 key 的 tool.call.toolview 行', () => {
  const row = registrations.find((entry) => entry.name === 'tool.call.toolview');
  assert.ok(row !== undefined, '没有注册 tool.call.toolview');
  assert.equal(row.key, 'ask_user_grilling');
  assert.equal(row.locale, 'askGrilling');
  assert.equal(typeof row.component, 'function');
});
test('只注册这一行，不接管官方 key', () => {
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].key === 'ask_user_question', false);
});
test('字典注册在本插件名字空间下', () => assert.deepEqual(locales, ['askGrilling']));
test('样式注入一次，标签带包身份', () => {
  assert.equal(styles.length, 1);
  assert.equal(styles[0].dataset.pluginCss, `${pkgName}/AskGrillingRow.css`);
  assert.ok(styles[0].textContent.includes('.dsg-card'));
});

// class 名在 JSX 与 CSS 之间单边漂移 = 样式静默失效，构建与运行都不报错
const jsx = readFileSync(join(root, 'src', 'client', 'AskGrillingRow.jsx'), 'utf8');
const css = readFileSync(join(root, 'src', 'client', 'AskGrillingRow.css'), 'utf8');
const used = new Set([...jsx.matchAll(/"(dsg-[A-Za-z0-9-]+)"/g)].map((match) => match[1]));
const defined = new Set([...css.matchAll(/\.(dsg-[A-Za-z0-9-]+)/g)].map((match) => match[1]));
test('JSX 里用到的 class 名都在 CSS 里', () => {
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, []);
});
test('CSS 里的 class 名都在 JSX 里用到（没有死样式）', () => {
  const dead = [...defined].filter((name) => !used.has(name));
  assert.deepEqual(dead, []);
});

// ui-primitives 的导出名核对：安装副本入口的导出表就是浏览器模块表会给的键，
// 源里引的名字不在表里 = 页面上那一处是 undefined（React 只 warning、测试全绿）。
const require = createRequire(import.meta.url);
const primitivesEntry = join(
  dirname(require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json')),
  'lib',
  'index.js',
);
const primitiveExports = new Set(
  [...readFileSync(primitivesEntry, 'utf8').matchAll(/export \{([^}]*)\}/g)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim().split(/\s+as\s+/).pop()))
    .filter((name) => name.length > 0),
);
const primitiveImports = new Set();
for (const file of readdirSync(join(root, 'src', 'client'))) {
  if (!/\.jsx?$/.test(file)) continue;
  const source = readFileSync(join(root, 'src', 'client', file), 'utf8');
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@deepseek-ai\/dsh-client-ui-primitives'/g)) {
    for (const name of match[1].split(',')) {
      const identifier = name.trim().split(/\s+as\s+/).pop();
      if (identifier.length > 0) primitiveImports.add(identifier);
    }
  }
}
test('引到的 ui-primitives 名字都在安装副本的导出表里（成对改名后漏改即失败）', () => {
  assert.ok(primitiveImports.size > 0, '没有从 ui-primitives 引任何东西，下面的核对是空转');
  const missing = [...primitiveImports].filter((name) => !primitiveExports.has(name));
  assert.deepEqual(missing, []);
});

console.log('  浏览器半边：全部通过');

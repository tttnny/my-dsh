/**
 * 浏览器半边的装配自检（约定见 docs/rules/client-wiring.md）。
 *
 * 1. 按 Web shell 的方式加载构建出来的 `lib/client.js`（`window.__ModuleLoader__.load` 桩件，
 *    require 只解答平台模块表里的请求，其余当场抛）；
 * 2. 用带内核 inject 守卫的假上下文跑 `apply()`：少声明服务会抛
 *    `cannot get property "x" without inject`，插件会整条 entry 变 failed 从页面消失，
 *    而宿主日志无异常——所以守卫必须在这里现身，且自身要有反例断言证明它还会抛；
 * 3. 顺带守住 class 名：`dsg-*` 在 JSX 与 CSS 之间只能一一对应，单边漂移只是样式静默失效；
 * 4. 守住 ui-primitives 的导出名：源里引的名字若不在安装副本的导出表里，页面上那一处
 *    就是 undefined（React 对 undefined 组件只 warning），没有任何运行时断言会现形，
 *    所以按安装副本的真实导出表点名核对。
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
const dictionaries = [];
const forkCalls = [];
const opened = [];

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
        registrations.push({ name: options.name, key: options.key, id: options.id, locale: options.locale, inject: options.inject, component });
        return () => {};
      },
    },
    locale: { register: (ns, dictionary) => { locales.push(ns); dictionaries.push(dictionary); return () => {}; } },
    sessions: { fork: (opts) => { forkCalls.push(opts); return Promise.resolve('child-1'); } },
    uiWorkspace: { openSession: (sessionId) => { opened.push(sessionId); } },
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

/** 要等一个 promise 才算完的那几条。 */
async function testAsync(name, fn) {
  try {
    await fn();
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
  // 服务注入是硬契约：少声明一个，插件整条 entry 变 failed、从页面上消失
  assert.deepEqual(exported.inject, ['locale', 'slots', 'sessions', 'uiWorkspace']);
});

test('守卫会拒绝未声明的服务读取（反例，否则下面的断言都是空转）', () => {
  assert.throws(() => makeCtx().locale, /cannot get property "locale" without inject/);
});
test('ctx.get 对未知服务不抛', () => assert.equal(makeCtx().get('nope'), undefined));

test('apply() 在守卫下跑得通', () => {
  exported.apply(makeCtx(exported.inject));
  assert.deepEqual(errors, []);
});
test('表单注册进轮次尾部槽位（自有 id），工具行按 wire 工具名照旧注册', () => {
  const tail = registrations.find((entry) => entry.name === 'conversation.chat.turnTail');
  assert.ok(tail !== undefined, '没有注册 conversation.chat.turnTail');
  assert.equal(tail.id, pkgName);
  assert.equal(tail.locale, 'grillingForm');
  assert.equal(typeof tail.component, 'function');
  assert.equal(typeof tail.inject, 'function', '分叉动作要以注入形式交给组件');
  const row = registrations.find((entry) => entry.name === 'tool.call.toolview');
  assert.ok(row !== undefined, '没有注册 tool.call.toolview');
  assert.equal(row.key, 'grilling_form');
  assert.equal(row.locale, 'grillingForm');
  assert.equal(typeof row.component, 'function');
});
test('只注册这两项，不接管官方 key', () => {
  assert.equal(registrations.length, 2);
  assert.equal(registrations.some((entry) => entry.key === 'ask_user_question'), false);
});
test('槽位条目声明的注入在守卫下拿得到会话与工作台服务', () => {
  const tail = registrations.find((entry) => entry.name === 'conversation.chat.turnTail');
  const face = tail.inject('sess-1');
  assert.equal(typeof face.forkAt, 'function');
});
await testAsync('注入的分叉动作：按本轮结束点分叉，然后把子会话打开', async () => {
  const tail = registrations.find((entry) => entry.name === 'conversation.chat.turnTail');
  tail.inject('sess-1').forkAt(8);
  assert.deepEqual(forkCalls, [{ sessionId: 'sess-1', atSeq: 8, increaseTitle: true }]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(opened, ['child-1']);
});
test('字典注册在本插件名字空间下', () => assert.deepEqual(locales, ['grillingForm']));
test('中英文字典键集逐条对齐（丢一条就是页面上某一处空白，而渲染自检只跑中文）', () => {
  assert.equal(dictionaries.length, 1, '没有拿到注册进来的字典');
  const { zh, en } = dictionaries[0];
  assert.ok(Object.keys(zh).length > 0, '字典是空的，下面的断言是空转');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});
test('样式注入一次，标签带包身份', () => {
  assert.equal(styles.length, 1);
  assert.equal(styles[0].dataset.pluginCss, `${pkgName}/GrillingForm.css`);
  assert.ok(styles[0].textContent.includes('.dsg-form'));
});

// class 名在 JSX 与 CSS 之间单边漂移 = 样式静默失效，构建与运行都不报错
const jsx = readFileSync(join(root, 'src', 'client', 'GrillingForm.jsx'), 'utf8');
const css = readFileSync(join(root, 'src', 'client', 'GrillingForm.css'), 'utf8');
// 一个 className 字符串里可能列多个类名（如 'dsg-option dsg-optionSingle'），逐个取出来；
// 引号两种都认（三元表达式里为整洁用单引号）。
const used = new Set(
  [...jsx.matchAll(/['"]((?:dsg-[A-Za-z0-9-]+\s*)+)['"]/g)]
    .flatMap((match) => match[1].trim().split(/\s+/)),
);
const defined = new Set([...css.matchAll(/\.(dsg-[A-Za-z0-9-]+)/g)].map((match) => match[1]));
test('JSX 里用到的 class 名都在 CSS 里', () => {
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, []);
});
test('CSS 里的 class 名都在 JSX 里用到（没有死样式）', () => {
  const dead = [...defined].filter((name) => !used.has(name));
  assert.deepEqual(dead, []);
});

// 圈与方框都是本插件画的：原生勾选框视觉上藏起来（仍决定开关状态），画出来的那个是 .dsg-optionControl。
// 这几条断言钉住两种画法的分派：单选是圆（含选中的实心点），多选是方框（选中填品牌色 + 画勾），
// 且原生 input 只被藏起来、没有被删掉或改成别的控件。
const controlRule = /\.dsg-optionControl\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const inputRule = /\.dsg-optionInput\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const singleRule = /\.dsg-optionSingle \.dsg-optionControl\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const singleCheckedRule = /\.dsg-optionSingle:has\(\.dsg-optionInput:checked\) \.dsg-optionControl\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const multiCheckedRule = /\.dsg-option:has\(\.dsg-optionInput:checked\):not\(\.dsg-optionSingle\) \.dsg-optionControl\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
test('画出来的控件：16×16 的方框，位置跟文字第一行对齐', () => {
  assert.notEqual(controlRule, '', '找不到画出来的控件那条规则');
  assert.match(controlRule, /width:\s*16px/);
  assert.match(controlRule, /height:\s*16px/);
  assert.match(controlRule, /margin-top:\s*2px/);
  assert.match(controlRule, /border-radius:\s*4px/, '多选的默认画法是方框');
});
test('原生勾选框只是藏起来，没有被删掉（开关状态与 label 的点击都靠它）', () => {
  assert.notEqual(inputRule, '', '找不到原生勾选框那条规则');
  assert.match(inputRule, /opacity:\s*0/);
  assert.doesNotMatch(inputRule, /display:\s*none|visibility:\s*hidden/, '藏法不能让它拿不到焦点');
});
// 题干那一行是「题号 + 题型 + 题干」三列，且三列的宽度由整张表定义一次（题目列表给列、
// 每题用 subgrid 接上去）。少了 subgrid 或列数退回两列，各题题干的左缘就会随题型词长短左右跳
// ——中文三个词一样宽看不出来，换成英文（Single choice / Freeform）当场露馅。
const listRule = /\.dsg-list\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const itemRule = /\.dsg-item\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const questionRule = /\.dsg-question\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
test('题干那一行是题号、题型、题干三列，且三列由整张表定义一次（各题题干左缘才对得齐）', () => {
  assert.match(listRule, /grid-template-columns:\s*20px auto minmax\(0,\s*1fr\)/, '列在题目列表上定义：题号定宽、题型按全表最宽的那个词、题干吃剩下的');
  assert.match(itemRule, /grid-template-columns:\s*subgrid/, '每题接着列表那三列排');
  assert.match(questionRule, /grid-template-columns:\s*subgrid/, '题干那一行也用同一组列');
});

test('题号与题型同一档：字号跟随题干继承，只有题号用等宽数字', () => {
  // 两条规则共用一档颜色，题型不另外写 font-size（写了就比题号小一号，「同一档」当场不成立）
  const sharedRule = /\.dsg-number,\s*\n\.dsg-type\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.notEqual(sharedRule, '', '题号与题型没有共用那一条');
  assert.match(sharedRule, /--dsw-alias-label-caption/);
  // 只认题型自己那一条：共用那条写成「.dsg-number,」换行再接「.dsg-type {」，直接找 /\.dsg-type\s*\{/
  // 会先命中它（断言就成了空转）。先把注释与空白抹平，再按「选择器恰好是 .dsg-type」取。
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const typeRule = [...cssNoComments.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((match) => match[1].trim() === '.dsg-type')
    .map((match) => match[2])
    .join('\n');
  assert.notEqual(typeRule, '', '找不到题型自己那一条规则');
  assert.doesNotMatch(typeRule, /font-size/, '题型不另设字号，才跟题号一样大');
  assert.match(/\.dsg-number\s*\{([^}]*)\}/.exec(css)?.[1] ?? '', /tabular-nums/);
});

test('单选：圈是完整圆形，按仓库约定配 corner-shape: round', () => {
  assert.notEqual(singleRule, '', '找不到单选那条规则');
  assert.match(singleRule, /border-radius:\s*50%/);
  assert.match(singleRule, /corner-shape:\s*round/);
});
test('单选选中态：圈里一个实心点，颜色用与方框同一个 --dsw-alias-brand-primary', () => {
  assert.notEqual(singleCheckedRule, '', '找不到单选选中态的规则');
  assert.match(singleCheckedRule, /--dsw-alias-brand-primary/);
  assert.match(singleCheckedRule, /radial-gradient/);
});
test('多选选中态：方框填品牌色，勾是图标画的（不是圆圈那个点）', () => {
  assert.notEqual(multiCheckedRule, '', '找不到多选选中态的规则');
  assert.match(multiCheckedRule, /--dsw-alias-brand-primary/);
  assert.doesNotMatch(multiCheckedRule, /radial-gradient/, '方框里不画点');
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

// 渲染自检（test-render.mjs）用一张替身表顶掉真 ui-primitives。替身漏一个名字，那一处就是
// undefined：React 只打一行 warning、渲染自检全绿，而**依赖它的那条分支根本没被测到**
// （本项目就漏过 IconCheckOutlineRegular——「已导入」那半边从没真渲染过）。
const renderScript = readFileSync(join(root, 'scripts', 'test-render.mjs'), 'utf8');
const stubBlock = /const primitives = \{(.*?)\n\};/s.exec(renderScript)?.[1] ?? '';
const stubbedPrimitives = new Set(
  [...stubBlock.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm)].map((match) => match[1]),
);
test('渲染替身表覆盖源码引到的每一个 ui-primitives 名字（漏一个＝那处是 undefined、且那条分支没被测到）', () => {
  assert.ok(stubbedPrimitives.size > 0, '没解析到替身表，下面的核对是空转');
  const unstubbed = [...primitiveImports].filter((name) => !stubbedPrimitives.has(name));
  assert.deepEqual(unstubbed, [], '这些名字在渲染自检里是 undefined');
});
test('渲染替身表没有用不到的替身（死替身会让人以为那一处被测过）', () => {
  const dead = [...stubbedPrimitives].filter((name) => !primitiveImports.has(name));
  assert.deepEqual(dead, []);
});

console.log('  浏览器半边：全部通过');

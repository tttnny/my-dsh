/**
 * 浏览器半边自检：按 Web shell 的方式装载 lib/client.js（`window.__ModuleLoader__.load` 桩件），
 * 喂假 cordis 服务，断言注册结果。**未声明的服务读取必须抛**——漏声明不会报错，只会让插件
 * 在页面里消失（docs/rules/client-wiring.md），守卫自身要有反例断言证明它还能抛。
 *
 * 这里还守住配置卡片的两条静默失败：key 必须是 bundle 的包名（写歪一个字符配置永远不出现），
 * 而卡片读写的命名空间是另一个字面量（Loader 行的 id）。
 *
 * 跑法：pnpm test / node scripts/smoke-client.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

const failures = [];
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`);
  else { console.error(`  FAIL ${label}`); failures.push(label); }
};

// --- 浏览器环境的最小替身：插件 apply 期间不碰真实 DOM，只碰这几样 ---
const stubElement = {
  dataset: {}, style: {}, appendChild() {}, remove() {}, setAttribute() {},
  addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {} },
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};
/** 插件在 apply() 里追加样式表，靠 id 判重；替身要把这份记账做出来。 */
const appendedStyles = [];
globalThis.document = {
  ...stubElement,
  documentElement: stubElement, body: stubElement, head: {
    ...stubElement,
    appendChild: (node) => { appendedStyles.push(node); },
  },
  createElement: () => ({ ...stubElement, id: '', textContent: '' }),
  createTextNode: () => ({}),
  getElementById: (id) => appendedStyles.find((node) => node.id === id) ?? null,
  querySelector: () => null, querySelectorAll: () => [],
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.HTMLElement = class HTMLElement {};
globalThis.Element = class Element {};
globalThis.Node = class Node {};
globalThis.Event = class Event {};
globalThis.CustomEvent = class CustomEvent {};

// --- 模块表：bundle 把 react 与 ui-primitives 留给 Web shell 的模块表 ---
const tolerant = new Proxy({}, {
  get: (_target, key) => (key === 'then' || typeof key === 'symbol' ? undefined : () => tolerant),
});

let exported;
globalThis.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    exported = factory((spec) => {
      if (spec === 'react' || spec === 'react/jsx-runtime' || spec === 'react-dom') return tolerant;
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return tolerant;
      throw new Error(`module table miss: ${spec}`);
    });
    exported.__loadedId = id;
  },
};

// --- cordis 忠实的上下文 ---
const registrations = [];
const injects = [];
const locales = [];
/** 卡片向共享配置表单要过的命名空间。 */
const formLookups = [];
/** 卡片以「宿主是否在服务这个命名空间」为条件挂载过的命名空间。 */
const servedWatches = [];
const errors = [];
let formSubscribes = 0;

/** `ConfigForm<T>` 的客户端形状：某个条目配置面的读写口。 */
const form = {
  getSnapshot: () => ({ status: 'ready', value: { enabled: true }, writable: true, revision: 1 }),
  subscribe: () => { formSubscribes += 1; return () => {}; },
  mutate: async () => true,
};

const services = {
  slots: {
    inject: (key, callback) => {
      injects.push(`slot:${key}`);
      const before = registrations.length;
      try {
        callback();
      } catch (error) {
        errors.push(`slots.inject(${key}) threw: ${error?.message}`);
      }
      const created = registrations.slice(before);
      return () => { for (const record of created) record.dispose(); };
    },
    register: (options, component) => {
      const record = {
        name: options.name,
        key: options.key,
        locale: options.locale,
        component,
        disposed: false,
      };
      record.dispose = () => { record.disposed = true; };
      registrations.push(record);
      return record.dispose;
    },
  },
  locale: {
    register: (ns) => { locales.push(ns); return () => {}; },
    bind: (ns) => (key) => `${ns}:${key}`,
  },
  // `whileServed` 在命名空间进入 describe 镜像时跑注册；替身立即回答，让下面几条
  // 走的就是生产里那条路。
  configForms: {
    get: (ns) => { formLookups.push(ns); return form; },
    whileServed: (namespaces, register) => {
      servedWatches.push([...namespaces]);
      return register(new Set(namespaces));
    },
  },
  remote: tolerant,
  'remote.session': tolerant,
};

/**
 * 带内核守卫的上下文代理：声明过的服务读得到，其余一律抛，`get()` 回 undefined。
 * @param {string[]} declared - 本层已声明的服务名。
 * @returns {object} 上下文代理。
 */
function makeCtx(declared = []) {
  const base = {
    on: () => () => {},
    effect: (fn) => { fn(); return () => {}; },
    inject: (names, callback) => {
      const list = Array.isArray(names) ? names : [names];
      try {
        const dispose = callback(makeCtx([...declared, ...list]));
        if (typeof dispose === 'function') dispose();
      } catch (error) {
        errors.push(`inject[${list.join(',')}] threw: ${error?.message}`);
      }
      return () => {};
    },
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

await import(`${join(root, 'lib/client.js')}?smoke=${Date.now()}`);

check('bundle 以包 id 自注册', exported?.__loadedId === '@lynn123411/dsh-subagent-judge-dispatch');
check('导出 name / apply / inject', exported?.name === '@lynn123411/dsh-subagent-judge-dispatch' && typeof exported?.apply === 'function' && Array.isArray(exported?.inject));

// 守卫必须有牙齿，否则下面每一条都是空转。
try {
  makeCtx().locale;
  check('守卫拒绝未声明的服务读取', false);
} catch (error) {
  check('守卫拒绝未声明的服务读取', /cannot get property "locale" without inject/.test(error.message));
}

try {
  exported.apply(makeCtx(exported.inject ?? []));
  check('apply() 过得了 inject 守卫', true);
} catch (error) {
  check('apply() 过得了 inject 守卫', false);
  console.error(`       ${error.message}`);
}

check('apply 期间没有接线错误', errors.length === 0);
for (const error of errors) console.error(`       ${error}`);

// 配置卡片挂在宿主「插件」页上，键是 bundle 的包名：于是它出现在这个 bundle 自己的
// 详情页上、描述之下、行列表之上。
const card = registrations.find((record) => record.name === 'plugins.bundle.config');
check('配置卡片注册到插件页的 bundle 座位', card !== undefined);
check('卡片的 key 是 bundle 的包名', card?.key === '@lynn123411/dsh-subagent-judge-dispatch');
check('卡片走 slots.inject 注册', injects.includes('slot:plugins.bundle.config'));
check('卡片自带一个组件', typeof card?.component === 'function');
check('卡片用自己的字典命名空间', card?.locale === 'subagentjudgedispatch');

check('卡片绑定了本插件自己的配置表单', formLookups.includes('dsh-subagent-judge-dispatch'));
check('卡片读了宿主那份「子代理可选用哪些模型」设置', formLookups.includes('subagent-model-selection-settings'));
check('卡片以「宿主在服务本插件条目」为挂载条件', JSON.stringify(servedWatches[0]) === '["dsh-subagent-judge-dispatch"]');
check('store 订阅了共享配置表单', formSubscribes > 0);
check('字典注册上了', locales.includes('subagentjudgedispatch'));
check('没有占用设置页', registrations.every((record) => record.name !== 'settings.section'));

check('样式表在 apply() 时追加一次，且带 id 便于判重', appendedStyles.length === 1 && appendedStyles[0].id === 'dsh-subagent-judge-dispatch-styles');
check('样式表里没有写死色值（只从主题变量取）', !/#[0-9a-fA-F]{3,8}\b/.test(appendedStyles[0]?.textContent ?? ''));

// 字典键集：英文是键集的唯一来源，中文逐一对齐，且每条非空。
const dictionaries = exported.__dictionaries;
if (dictionaries !== undefined) {
  const zhKeys = Object.keys(dictionaries.zh).sort();
  const enKeys = Object.keys(dictionaries.en).sort();
  check('zh/en 键集一致且非空', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys));
  check('每条文案都非空', enKeys.every((key) => typeof dictionaries.en[key] === 'string' && dictionaries.en[key].length > 0));
} else {
  check('字典随 bundle 导出（键集据此核对）', false);
}

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

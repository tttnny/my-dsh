/**
 * 浏览器半边自检：按 Web shell 的方式装载 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），
 * 喂假 cordis 服务，断言三件事——样式表带归属键挂上去了、配置投影真的写到了 `<html>` 上、
 * 配置卡片注册进了 `plugins.bundle.config` 且 key 是包名。
 *
 * **未声明的服务读取必须抛**（docs/rules/client-wiring.md）：漏声明不会报错，只会让插件在
 * 页面里消失。所以这个文件自己也带一条反例断言，证明那层守卫还在响。
 *
 * 跑法：pnpm test / node scripts/smoke-client.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

const failures = [];
const check = (label, ok, detail) => {
  if (ok) console.log(`  ok   ${label}`);
  else {
    console.error(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
    failures.push(label);
  }
};

/** 浏览器 bundle 会碰 DOM（注入样式、写根元素），所以先装一个真 document。 */
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

/** 只顶掉组件本身：这个包在真 bundle 里塞了图标与 shiki，自检不需要它们。 */
const primitivesStub = new Proxy({}, { get: (_target, key) => (key === '__esModule' ? true : () => null) });

let exported;
const requires = [];
window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    requires.push(id);
    exported = factory((spec) => {
      if (spec === 'react') return require('react');
      if (spec === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (spec === 'react-dom') return require('react-dom');
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
      throw new Error(`module table miss: ${spec}`);
    });
  },
};

/**
 * 一张假表单：快照可改、订阅可触发、写入被记下来。
 * 形状与 `ConfigForm` 的结构子集一致，所以自检走的是卡片真正会遇到的那几个方法。
 * @param initial - 初始配置值（空对象表示「宿主还没给值」）。
 */
function fakeForm(initial) {
  let snapshot = { status: 'ready', value: { ...initial }, writable: true, revision: 1 };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async set(field, value) {
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value }, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
      return true;
    },
    /** 只给自检用：外部改动（模拟宿主回写）。 */
    push(next) {
      snapshot = { ...snapshot, value: { ...snapshot.value, ...next }, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
    },
  };
}

const form = fakeForm({});
const localeRegistrations = [];
const slotRegistrations = [];
const injectCalls = [];
const errors = [];

/** 服务表：只有这里列出的服务存在；读别的就是「未声明」。 */
function services() {
  return {
    configForms: {
      get: () => form,
      whileServed: (_namespaces, register) => register(new Set(['dsh-maple-theme'])),
    },
    slots: {
      inject: (slot, register) => {
        injectCalls.push(slot);
        try {
          const dispose = register();
          return typeof dispose === 'function' ? dispose : () => {};
        } catch (error) {
          errors.push(`slots.inject(${slot}) threw: ${error?.message}`);
          return () => {};
        }
      },
      register: (options) => { slotRegistrations.push(options); return () => {}; },
    },
    locale: {
      register: (namespace, dictionaries) => {
        localeRegistrations.push({ namespace, dictionaries });
        return () => {};
      },
    },
  };
}

/** cordis 忠实的上下文：读未声明的服务抛 `cannot get property "x" without inject`。 */
function makeCtx(label, declared = []) {
  const table = services();
  const effects = [];
  const base = {
    label,
    effects,
    effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return () => {}; },
    on: () => () => {},
    inject: (names, callback) => {
      const list = Array.isArray(names) ? names : [names];
      const dispose = callback(makeCtx(`${label}/${list.join(',')}`, [...declared, ...list]));
      return typeof dispose === 'function' ? dispose : () => {};
    },
    get: (name) => table[name],
  };
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in target) return target[prop];
      if (declared.includes(prop)) return table[prop];
      throw new Error(`cannot get property "${prop}" without inject`);
    },
  });
}

await import(`${join(root, 'lib/client.js')}?smoke=${Date.now()}`);

check('bundle 以包 id 自注册', requires[0] === '@lynn123411/dsh-maple-theme', String(requires[0]));
check(
  '导出 name / apply / inject',
  exported?.name === '@lynn123411/dsh-maple-theme' && typeof exported?.apply === 'function' && Array.isArray(exported?.inject),
);
check(
  'inject 写的就是它真正读的服务',
  JSON.stringify([...exported.inject].sort()) === '["configForms","locale","slots"]',
  JSON.stringify(exported.inject),
);

try {
  makeCtx('teeth').locale;
  check('守卫拒绝未声明的服务读取', false);
} catch (error) {
  check('守卫拒绝未声明的服务读取', /cannot get property "locale" without inject/.test(error.message));
}

const rootElement = document.documentElement;
const ctx = makeCtx('root', exported.inject ?? []);
try {
  exported.apply(ctx);
  check('apply() 过得了 inject 守卫', true);
} catch (error) {
  check('apply() 过得了 inject 守卫', false, error.message);
}
check('apply 期间没有接线错误', errors.length === 0, errors.join('; '));

/* ---- 样式表：三张都挂上、都带归属键 ---- */
const styleKeys = [...document.head.querySelectorAll('style[data-plugin]')].map((tag) => tag.getAttribute('data-plugin-css'));
check('四张样式表都注入了', styleKeys.length === 4, JSON.stringify(styleKeys));
check(
  '样式表的归属键按「包名/文件名」拼',
  ['tokens.css', 'markdown.css', 'shell.css', 'card.css'].every((file) => styleKeys.includes(`@lynn123411/dsh-maple-theme/${file}`)),
  JSON.stringify(styleKeys),
);
const pluginTags = [...document.head.querySelectorAll('style')].map((tag) => tag.getAttribute('data-plugin'));
check('每张标签都带 data-plugin（卸载时按它清理）', pluginTags.every((value) => value === '@lynn123411/dsh-maple-theme'), JSON.stringify(pluginTags));

/* ---- 投影：出厂的几个值真的落到 <html> 上 ---- */
check('根元素带上了开启属性', rootElement.getAttribute('data-maple-theme') === 'on', String(rootElement.getAttribute('data-maple-theme')));
check('标题配色默认六级换色', rootElement.getAttribute('data-maple-heading') === 'colorful', String(rootElement.getAttribute('data-maple-heading')));
check('等级标记默认开', rootElement.getAttribute('data-maple-indicator') === 'on', String(rootElement.getAttribute('data-maple-indicator')));
check('代码配色默认开', rootElement.getAttribute('data-maple-code') === 'on', String(rootElement.getAttribute('data-maple-code')));
check('外壳装饰默认开', rootElement.getAttribute('data-maple-shell') === 'on', String(rootElement.getAttribute('data-maple-shell')));
check('浅色色相写进了行内变量', rootElement.style.getPropertyValue('--maple-hue-light') === '35', rootElement.style.getPropertyValue('--maple-hue-light'));
check('深色色相写进了行内变量', rootElement.style.getPropertyValue('--maple-hue-dark') === '207', rootElement.style.getPropertyValue('--maple-hue-dark'));
check('行高写进了行内变量', rootElement.style.getPropertyValue('--maple-line-height') === '1.75', rootElement.style.getPropertyValue('--maple-line-height'));

/* ---- 投影随配置变化：改值 → 属性跟着换 ---- */
form.push({ hueLight: 210, lineHeight: 1.9, headingColor: 'accent', headingIndicator: false, codePalette: false, shellSkin: false });
check('色相改动传到了行内变量', rootElement.style.getPropertyValue('--maple-hue-light') === '210', rootElement.style.getPropertyValue('--maple-hue-light'));
check('行高改动传到了行内变量', rootElement.style.getPropertyValue('--maple-line-height') === '1.9', rootElement.style.getPropertyValue('--maple-line-height'));
check('标题配色改动传到了属性', rootElement.getAttribute('data-maple-heading') === 'accent', String(rootElement.getAttribute('data-maple-heading')));
check('关掉的开关把属性删掉了', rootElement.getAttribute('data-maple-indicator') === null, String(rootElement.getAttribute('data-maple-indicator')));
check('关掉代码配色也删属性', rootElement.getAttribute('data-maple-code') === null, String(rootElement.getAttribute('data-maple-code')));
check('关掉外壳装饰也删属性', rootElement.getAttribute('data-maple-shell') === null, String(rootElement.getAttribute('data-maple-shell')));

/* ---- 卡片：座位、key、词典 ---- */
check('走插件的 plugins.bundle.config 座位', injectCalls.includes('plugins.bundle.config'), JSON.stringify(injectCalls));
check('注册了一项配置卡片', slotRegistrations.length === 1, String(slotRegistrations.length));
check('卡片的 key 是 bundle 的包名', slotRegistrations[0]?.key === '@lynn123411/dsh-maple-theme', String(slotRegistrations[0]?.key));
check('卡片声明了自己的词典命名空间', slotRegistrations[0]?.locale === 'mapletheme', String(slotRegistrations[0]?.locale));

const dictionary = localeRegistrations.find((entry) => entry.namespace === 'mapletheme')?.dictionaries;
check('字典注册上了', dictionary !== undefined);
const zhKeys = Object.keys(dictionary?.zh ?? {}).sort();
const enKeys = Object.keys(dictionary?.en ?? {}).sort();
check('zh/en 键集一致且非空', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys));
check('每条文案都非空', enKeys.every((key) => typeof dictionary.en[key] === 'string' && dictionary.en[key].length > 0));

/* ---- 卸载：痕迹撤干净 ---- */
for (const dispose of ctx.effects.splice(0)) dispose();
check('卸载后根元素不留属性', rootElement.getAttribute('data-maple-theme') === null);
check('卸载后根元素不留变量', rootElement.style.getPropertyValue('--maple-hue-light') === '');
check('卸载后样式标签全删了', document.head.querySelectorAll('style[data-plugin]').length === 0);

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

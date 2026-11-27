/**
 * 浏览器半边自检：按 Web shell 的方式装载 lib/client.js，喂假 cordis 服务，断言
 * 字典与插件页状态卡注册。**未声明的服务读取必须抛**——漏声明不会报错，只会让插件
 * 在页面里消失（docs/rules/client-wiring.md），守卫自身要有反例断言证明它还能抛。
 *
 * 跑法：pnpm test / node scripts/smoke-client.mjs
 */
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { dirname, join, resolve } from 'node:path';

import { loadClientBundle } from './lib/client-bundle.mjs';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse((await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8')).name;

const failures = [];
const check = (label, ok) => {
  if (ok) console.log('  ok   ' + label);
  else { console.error('  FAIL ' + label); failures.push(label); }
};

const dom = new JSDOM();
globalThis.document = dom.window.document;

const { exported, requires } = await loadClientBundle(root);

const locales = [];
const registrations = [];
const errors = [];
const effects = [];

/** cordis 忠实的上下文：读未声明的服务抛 cannot get property "x" without inject。 */
function makeCtx(label, declared = []) {
  const table = {
    locale: {
      register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {}; },
      bind: () => (key) => key,
    },
    slots: {
      inject: (_slot, register) => {
        try {
          register();
        } catch (error) {
          errors.push('slots.inject threw: ' + error?.message);
        }
        return () => {};
      },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  const base = {
    label,
    effect: (fn) => {
      const dispose = fn();
      if (typeof dispose === 'function') effects.push(dispose);
      return dispose;
    },
    inject: () => () => {},
    get: (name) => table[name],
  };
  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in target) return target[prop];
      if (declared.includes(prop)) return table[prop];
      throw new Error('cannot get property "' + prop + '" without inject');
    },
  });
}

check('bundle 以包 id 自注册', requires[0] === pkgName);
check('导出 name / apply / inject', exported?.name === pkgName && typeof exported?.apply === 'function' && Array.isArray(exported?.inject));
check('inject 写的就是它真正读的服务', JSON.stringify(exported?.inject) === '["slots","locale"]');

try {
  makeCtx('teeth').locale;
  check('守卫拒绝未声明的服务读取', false);
} catch (error) {
  check('守卫拒绝未声明的服务读取', /cannot get property "locale" without inject/.test(error.message));
}

try {
  exported.apply(makeCtx('root', exported.inject ?? []));
  check('apply() 过得了 inject 守卫', true);
} catch (error) {
  check('apply() 过得了 inject 守卫', false);
  console.error('       ' + error.message);
}

const dictionary = locales.find((entry) => entry.ns !== undefined)?.dictionaries;
check('字典注册上了', dictionary !== undefined);
const zhKeys = Object.keys(dictionary?.zh ?? {}).sort();
const enKeys = Object.keys(dictionary?.en ?? {}).sort();
check('zh/en 键集一致且非空', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys));
check('每条文案都非空', enKeys.every((key) => typeof dictionary.en[key] === 'string' && dictionary.en[key].length > 0));

const card = registrations.find((entry) => entry.options?.name === 'plugins.bundle.config');
check('状态卡注册在 plugins.bundle.config 且 key 是包名', card?.options?.key === pkgName);
check('状态卡带本插件的字典命名空间', card?.options?.locale === 'kimiCu');
check('状态卡组件是个函数', typeof card?.component === 'function');

const pluginStyles = () => document.head.querySelectorAll(`style[data-plugin="${pkgName}"]`);
check('启用后挂载插件样式', pluginStyles().length === 1);
for (const dispose of effects.splice(0).reverse()) dispose();
check('停用后不残留插件样式', pluginStyles().length === 0);
exported.apply(makeCtx('restarted', exported.inject ?? []));
check('重新启用后每张样式各有一份', pluginStyles().length === 1);
for (const dispose of effects.splice(0).reverse()) dispose();
dom.window.close();

check('apply 期间没有接线错误', errors.length === 0);
for (const error of errors) console.error('       ' + error);

console.log(failures.length === 0 ? '\nsmoke-client: PASS' : '\nsmoke-client: FAIL (' + failures.length + ')');
process.exit(failures.length === 0 ? 0 : 1);

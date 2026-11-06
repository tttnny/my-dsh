/**
 * 浏览器半边自检：按 Web shell 的方式装载 lib/client.js（`window.__ModuleLoader__.load` 桩件），
 * 喂假 cordis 服务，断言对话节点定义、三处座位注册与字典。**未声明的服务读取必须抛**——漏声明不会报错，
 * 只会让插件在页面里消失（docs/rules/client-wiring.md），守卫自身要有反例断言证明它还能抛。
 *
 * 跑法：pnpm test / node scripts/smoke-client.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadClientBundle } from './lib/client-bundle.mjs';

const require = createRequire(import.meta.url);
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse(require('node:fs').readFileSync(join(root, 'package.json'), 'utf8')).name;

const failures = [];
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`);
  else { console.error(`  FAIL ${label}`); failures.push(label); }
};

const { exported, requires } = await loadClientBundle(root);

const locales = [];
const registrations = [];
const definitions = [];
const whileServedCalls = [];
const errors = [];
const services = () => ({
  locale: {
    register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {}; },
    bind: () => (key) => key,
  },
  slots: {
    inject: (_slot, register) => {
      try {
        register();
      } catch (error) {
        errors.push(`slots.inject threw: ${error?.message}`);
      }
      return () => {};
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => {};
    },
  },
  configForms: {
    get: () => ({
      getSnapshot: () => ({ status: 'ready', value: { nudgeAfter: 8 } }),
      subscribe: () => () => {},
      set: async () => true,
    }),
    whileServed: (namespaces, register) => {
      whileServedCalls.push([...namespaces]);
      return register(new Set(namespaces));
    },
  },
  uiConversation: {
    events: {
      register: (definition) => { definitions.push(definition); return () => {}; },
    },
  },
});

/** cordis 忠实的上下文：读未声明的服务抛 `cannot get property "x" without inject`。 */
function makeCtx(label, declared = []) {
  const table = services();
  const base = {
    label,
    effect: (fn) => { fn(); return () => {}; },
    on: () => () => {},
    inject: (names, callback) => {
      const list = Array.isArray(names) ? names : [names];
      try {
        const dispose = callback(makeCtx(`${label}/${list.join(',')}`, [...declared, ...list]));
        if (typeof dispose === 'function') dispose();
      } catch (error) {
        errors.push(`${label} inject[${list.join(',')}] threw: ${error?.message}`);
      }
      return () => {};
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

check('bundle 以包 id 自注册', requires[0] === pkgName);
check('导出 name / apply / inject', exported?.name === pkgName && typeof exported?.apply === 'function' && Array.isArray(exported?.inject));
check('inject 写的就是它真正读的服务', JSON.stringify(exported?.inject) === '["configForms","slots","locale","uiConversation"]');

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
  console.error(`       ${error.message}`);
}

const dictionary = locales.find((entry) => entry.ns !== undefined)?.dictionaries;
check('字典注册上了', dictionary !== undefined);
const zhKeys = Object.keys(dictionary?.zh ?? {}).sort();
const enKeys = Object.keys(dictionary?.en ?? {}).sort();
check('zh/en 键集一致且非空', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys));
check('每条文案都非空', enKeys.every((key) => typeof dictionary.en[key] === 'string' && dictionary.en[key].length > 0));

const definition = definitions[0];
check('注册了一个对话节点定义', definitions.length === 1 && definition?.kind === 'notify-user');
check('定义的目标是 chat', definition?.target === 'chat');
check('定义会投影节点', typeof definition?.buildViewNode === 'function');

const nodeView = registrations.find((entry) => entry.options?.name === 'conversation.chat.node');
check('进度卡注册在 conversation.chat.node 且 key 是 notify-user', nodeView?.options?.key === 'notify-user');
check('节点渲染器带本插件的字典命名空间', nodeView?.options?.locale === 'notifyUser');
check('节点渲染器是个函数', typeof nodeView?.component === 'function');
check('节点渲染器注入了一张配置表单', typeof nodeView?.options?.inject === 'function' && nodeView.options.inject().form !== undefined);

const toolview = registrations.find((entry) => entry.options?.name === 'tool.call.toolview');
check('兜底进度卡注册在 tool.call.toolview 且 key 是 notify_user', toolview?.options?.key === 'notify_user');
check('兜底进度卡带本插件的字典命名空间', toolview?.options?.locale === 'notifyUser');
check('兜底进度卡组件是个函数', typeof toolview?.component === 'function');
check('兜底进度卡注入了一张配置表单', typeof toolview?.options?.inject === 'function' && toolview.options.inject().form !== undefined);

const configCard = registrations.find((entry) => entry.options?.name === 'plugins.bundle.config');
check('配置卡注册在 plugins.bundle.config 且 key 是包名', configCard?.options?.key === pkgName);
check('配置卡带本插件的字典命名空间', configCard?.options?.locale === 'notifyUser');
check('配置卡通过 whileServed 读本插件的命名空间', JSON.stringify(whileServedCalls[0]) === '["dsh-notify-user"]');
check('配置卡注入了一张配置表单', typeof configCard?.options?.inject === 'function' && configCard.options.inject().form !== undefined);

check('apply 期间没有接线错误', errors.length === 0);
for (const error of errors) console.error(`       ${error}`);

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

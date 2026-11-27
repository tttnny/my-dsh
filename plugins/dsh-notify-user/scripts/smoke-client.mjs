/**
 * 浏览器半边自检：按 Web shell 的方式装载 lib/client.js（`window.__ModuleLoader__.load` 桩件），
 * 喂假 cordis 服务，断言对话节点定义、三处座位注册与字典。**未声明的服务读取必须抛**——漏声明不会报错，
 * 只会让插件在页面里消失（docs/rules/client-wiring.md），守卫自身要有反例断言证明它还能抛。
 *
 * 跑法：pnpm test / node scripts/smoke-client.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { dirname, join, resolve } from 'node:path';
import { loadClientBundle, syncedConfig } from './lib/client-bundle.mjs';

const require = createRequire(import.meta.url);
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse(require('node:fs').readFileSync(join(root, 'package.json'), 'utf8')).name;

const failures = [];
const check = (label, ok) => {
  if (ok) console.log(`  ok   ${label}`);
  else { console.error(`  FAIL ${label}`); failures.push(label); }
};

const dom = new JSDOM();
globalThis.document = dom.window.document;
const { exported, requires } = await loadClientBundle(root);

const locales = [];
const registrations = [];
const definitions = [];
const whileServedCalls = [];
const errors = [];
const effects = [];

/** 可变的配置表单：改字段会通知订阅者，用来验「位置切换会重挂定义」。 */
let configValue = {
  nudgeAfter: 10,
  collapsible: true,
  summaryOnly: false,
  bodyExpandedByDefault: false,
  showTime: false,
  cardPlacement: 'boundary',
  defaultEnabled: true,
  sessionOverrides: {},
};
const configListeners = new Set();
const configForm = {
  getSnapshot: () => ({ status: 'ready', value: configValue }),
  subscribe: (listener) => {
    configListeners.add(listener);
    return () => { configListeners.delete(listener); };
  },
  set: async (field, value) => {
    configValue = { ...configValue, [field]: value };
    for (const listener of configListeners) listener();
    return true;
  },
};

let syncedPlacement = 'boundary';
const syncedListeners = new Set();
const synced = syncedConfig(field => field === 'cardPlacement' ? syncedPlacement : undefined, listener => {
  syncedListeners.add(listener);
  return () => { syncedListeners.delete(listener); };
});
function setSyncedPlacement(placement) {
  syncedPlacement = placement;
  for (const listener of syncedListeners) listener();
}
const services = () => ({
  locale: {
    register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {}; },
    bind: () => (key) => key,
  },
  slots: {
    inject: (_slot, register) => {
      try {
        return register();
      } catch (error) {
        errors.push(`slots.inject threw: ${error?.message}`);
      }
      return () => {};
    },
    register: (options, component) => {
      const entry = { options, component };
      registrations.push(entry);
      return () => { registrations.splice(registrations.indexOf(entry), 1); };
    },
  },
  configForms: {
    get: () => configForm,
    whileServed: (namespaces, register) => {
      whileServedCalls.push([...namespaces]);
      return register(new Set(namespaces));
    },
  },
  uiConversation: {
    events: {
      register: (definition) => {
        definitions.push(definition);
        return () => {
          const index = definitions.indexOf(definition);
          if (index >= 0) definitions.splice(index, 1);
        };
      },
    },
  },
});

/** cordis 忠实的上下文：读未声明的服务抛 `cannot get property "x" without inject`。 */
function makeCtx(label, declared = []) {
  const table = services();
  const base = {
    label,
    effect: (fn) => {
      const dispose = fn();
      if (typeof dispose === 'function') effects.push(dispose);
      return dispose;
    },
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
  exported.apply(makeCtx('root', exported.inject ?? []), synced);
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

await configForm.set('cardPlacement', 'inline');
check('表单值先变化时图仍按同步值投影', definitions.length === 1);
check('边界模式把工具行交给宿主', !registrations.some(entry => entry.options?.name === 'tool.call.toolview'));
setSyncedPlacement('inline');
check('切到跟随工具行后撤掉对话节点定义', definitions.length === 0);

const nodeView = registrations.find((entry) => entry.options?.name === 'conversation.chat.node');
check('进度卡注册在 conversation.chat.node 且 key 是 notify-user', nodeView?.options?.key === 'notify-user');
check('节点渲染器带本插件的字典命名空间', nodeView?.options?.locale === 'notifyUser');
check('节点渲染器是个函数', typeof nodeView?.component === 'function');
check('节点渲染器注入同步展示配置', typeof nodeView?.options?.inject === 'function' && nodeView.options.inject().hooks.showTime === synced.showTime);

const toolview = registrations.find((entry) => entry.options?.name === 'tool.call.toolview');
check('兜底进度卡注册在 tool.call.toolview 且 key 是 notify_user', toolview?.options?.key === 'notify_user');
check('兜底进度卡带本插件的字典命名空间', toolview?.options?.locale === 'notifyUser');
check('兜底进度卡组件是个函数', typeof toolview?.component === 'function');
check('工具行注入同步展示配置', typeof toolview?.options?.inject === 'function' && toolview.options.inject().hooks.summaryOnly === synced.summaryOnly);
setSyncedPlacement('boundary');
check('切回步骤组边界后重新注册定义', definitions.length === 1);
check('切回后撤销工具行注册', !registrations.some(entry => entry.options?.name === 'tool.call.toolview'));

const menuToggle = registrations.find((entry) => entry.options?.name === 'conversation.input.model.options');
check('菜单开关注册在模型与推理等级菜单的选项座位', menuToggle?.options?.id === 'notify-user-enabled');
check('菜单开关带本插件的字典命名空间', menuToggle?.options?.locale === 'notifyUser');
check('菜单开关组件是个函数', typeof menuToggle?.component === 'function');
check('菜单开关注入了一张配置表单', typeof menuToggle?.options?.inject === 'function' && menuToggle.options.inject().form !== undefined);

const configCard = registrations.find((entry) => entry.options?.name === 'plugins.bundle.config');
check('配置卡注册在 plugins.bundle.config 且 key 是包名', configCard?.options?.key === pkgName);
check('配置卡带本插件的字典命名空间', configCard?.options?.locale === 'notifyUser');
check('配置卡通过 whileServed 读本插件的命名空间', JSON.stringify(whileServedCalls[0]) === '["dsh-notify-user"]');
check('配置卡注入了一张配置表单', typeof configCard?.options?.inject === 'function' && configCard.options.inject().form !== undefined);

const styleKeys = () => [...document.head.querySelectorAll(`style[data-plugin="${pkgName}"]`)]
  .map((tag) => tag.dataset.pluginCss).sort();
const expectedStyles = ['ConfigCard.css', 'EnabledToggle.css', 'NotifyCard.css'].map((file) => `${pkgName}/${file}`);
check('启用后每张样式各有一份', JSON.stringify(styleKeys()) === JSON.stringify(expectedStyles));
for (const dispose of effects.splice(0).reverse()) dispose();
check('停用后不残留插件样式', styleKeys().length === 0);
exported.apply(makeCtx('restarted', exported.inject ?? []), synced);
check('重新启用后每张样式各有一份', JSON.stringify(styleKeys()) === JSON.stringify(expectedStyles));
for (const dispose of effects.splice(0).reverse()) dispose();
dom.window.close();

check('apply 期间没有接线错误', errors.length === 0);
for (const error of errors) console.error(`       ${error}`);

console.log(failures.length === 0 ? '\nsmoke: PASS' : `\nsmoke: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

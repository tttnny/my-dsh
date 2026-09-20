import { AskGrillingRow } from './AskGrillingRow.jsx';
import css from './AskGrillingRow.css';
import { NS, en, zh } from './locales.js';

/** 浏览器半边的包身份，也是 bundle 里 <style> 的归属标记。 */
const PACKAGE_ID = '@lynn123411/dsh-ask-user-grilling';
const CSS_TAG = `${PACKAGE_ID}/AskGrillingRow.css`;

/**
 * 浏览器半边要的 cordis 服务。`locale` 装字典，`slots` 注册行；
 * 少声明一个不会当场报错，插件会整条 entry 变 failed、从页面上消失（见 docs/rules/client-wiring.md）。
 */
export const inject = ['locale', 'slots'];

/** 注入本插件的样式表：按标签键复用同一个 <style>，HMR 重跑时替换内容而不是叠一份。 */
function injectStyles() {
  if (typeof document === 'undefined') return;
  let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']');
  if (tag === null) {
    tag = document.createElement('style');
    tag.dataset.plugin = PACKAGE_ID;
    tag.dataset.pluginCss = CSS_TAG;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

/**
 * 浏览器半边：装本插件的字典，然后按 wire 工具名注册 `ask_user_grilling` 的行。
 * 注册的是自有 key，官方 `ask_user_question` 那张卡不受影响。
 * @param {object} ctx - 客户端根上下文。
 */
export function apply(ctx) {
  injectStyles();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ask-user-grilling: dictionaries');
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'ask_user_grilling',
    locale: NS,
  }, AskGrillingRow));
}

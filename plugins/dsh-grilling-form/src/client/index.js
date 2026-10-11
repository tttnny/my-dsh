import { GrillingFormRow, GrillingFormTail } from './GrillingForm.jsx';
import css from './GrillingForm.css';
import { NS, en, zh } from './locales.js';

/** 浏览器半边的包身份，也是 bundle 里 <style> 的归属标记，以及轮次尾部那个槽位条目的 id。 */
const PACKAGE_ID = '@lynn123411/dsh-grilling-form';
const CSS_TAG = `${PACKAGE_ID}/GrillingForm.css`;

/**
 * 浏览器半边的 cordis 上下文：只声明本插件**读到**的那几个服务。
 *
 * 客户端上下文没有可导入的类型（槽位契约发布在 `@deepseek-ai/dsh-client-ui-slots`，
 * 上下文本身由 Web shell 在运行时装配），所以就地声明。刻意**不用**
 * `declare module '@deepseek-ai/cordis'` 加索引签名：那个 interface 是全局合并的，
 * 一加就把宿主半边（`src/index.js` 的 `ctx`）也一起放宽，那边的错会静默消失。
 * @typedef {object} ClientContext
 * @property {(fn: () => unknown, label?: string) => unknown} effect 随插件生命周期回收的副作用。
 * @property {{ register: (namespace: string, dictionaries: { zh: object, en: object }) => unknown }} locale 字典服务。
 * @property {{ inject: (name: string, fn: () => unknown) => unknown, register: (definition: object, component: unknown) => unknown }} slots 槽位服务。
 * @property {{ fork: (input: { sessionId: unknown, atSeq: number, increaseTitle: boolean }) => Promise<unknown> }} sessions 会话服务。
 * @property {{ openSession: (childId: unknown) => unknown }} uiWorkspace 把会话打开的服务。
 */

/**
 * 浏览器半边要的 cordis 服务。`locale` 装字典，`slots` 注册条目，`sessions` 分叉出子会话，
 * `uiWorkspace` 把子会话打开；少声明一个不会当场报错，插件会整条 entry 变 failed、从页面上
 * 消失（见 docs/rules/client-wiring.md）。输入动作、会话记录与输入状态不是服务，而是槽位给
 * session 作用域组件的标准属性，不用声明。
 */
export const inject = ['locale', 'slots', 'sessions', 'uiWorkspace'];

/** 注入本插件的样式表：按标签键复用同一个 <style>，HMR 重跑时替换内容而不是叠一份。 */
function injectStyles() {
  if (typeof document === 'undefined') return;
  /** @type {HTMLStyleElement|null} querySelector 只保证 Element，这里的选择器认的就是 <style>。 */
  let tag = /** @type {HTMLStyleElement|null} */ (
    document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG) + ']')
  );
  if (tag === null) {
    tag = document.createElement('style');
    tag.dataset.plugin = PACKAGE_ID;
    tag.dataset.pluginCss = CSS_TAG;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

/**
 * 浏览器半边：装本插件的字典，然后把表单挂到对话流的轮次尾部，并保留工具行服务被拒的轮次。
 *
 * - `conversation.chat.turnTail`：表单住在这里——轮次尾部与正文同处一层，不被过程折叠吞掉。
 *   分叉动作以注入形式交给组件（组件自己不去取服务），切点是本轮结束位置。
 * - `tool.call.toolview`：按 wire 工具名注册自有 key，只在入参被拒时画违规清单；表不在那儿。
 *
 * @param {ClientContext} ctx - 客户端根上下文。
 * @returns {void}
 */
export function apply(ctx) {
  injectStyles();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-grilling-form: dictionaries');
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: PACKAGE_ID,
    locale: NS,
    inject: (/** @type {unknown} */ sessionId) => ({
      /** @param {number} seq - 本轮结束位置。 */
      forkAt: (seq) => {
        ctx.sessions.fork({ sessionId, atSeq: seq, increaseTitle: true })
          .then((/** @type {unknown} */ childId) => { ctx.uiWorkspace.openSession(childId); })
          .catch(() => {});
      },
    }),
  }, GrillingFormTail));
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'grilling_form',
    locale: NS,
  }, GrillingFormRow));
}

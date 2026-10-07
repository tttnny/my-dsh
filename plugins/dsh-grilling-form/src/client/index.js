import { GrillingFormRow, GrillingFormTail } from './GrillingForm.jsx';
import css from './GrillingForm.css';
import { NS, en, zh } from './locales.js';

/** 浏览器半边的包身份，也是 bundle 里 <style> 的归属标记，以及轮次尾部那个槽位条目的 id。 */
const PACKAGE_ID = '@lynn123411/dsh-grilling-form';
const CSS_TAG = `${PACKAGE_ID}/GrillingForm.css`;

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
 * 浏览器半边：装本插件的字典，然后把表单挂到对话流的轮次尾部，并保留工具行服务被拒的轮次。
 *
 * - `conversation.chat.turnTail`：表单住在这里——轮次尾部与正文同处一层，不被过程折叠吞掉。
 *   分叉动作以注入形式交给组件（组件自己不去取服务），切点是本轮结束位置。
 * - `tool.call.toolview`：按 wire 工具名注册自有 key，只在入参被拒时画违规清单；表不在那儿。
 *
 * @param {object} ctx - 客户端根上下文。
 */
export function apply(ctx) {
  injectStyles();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-grilling-form: dictionaries');
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: PACKAGE_ID,
    locale: NS,
    inject: (sessionId) => ({
      forkAt: (seq) => {
        ctx.sessions.fork({ sessionId, atSeq: seq, increaseTitle: true })
          .then((childId) => { ctx.uiWorkspace.openSession(childId); })
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

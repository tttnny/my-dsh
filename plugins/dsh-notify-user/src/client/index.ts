import type { Context as ClientContext } from '@deepseek-ai/cordis';
// 类型只读：这几个包的浏览器半边把 `ctx.locale`、`ctx.slots`、`ctx.configForms`
// 与两个座位的契约合并进 Context。
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-tool/client';
import { ConfigCard } from './ConfigCard.js';
import { BUNDLE_CONFIG_SLOT, BUNDLE_NAME, SETTINGS_NAMESPACE } from './config.js';
import { NS, en, zh } from './locales.js';
import { NotifyRow } from './NotifyRow.js';
import cardCss from './ConfigCard.css';
import rowCss from './NotifyRow.css';

export { NS } from './locales.js';

/**
 * @lynn123411/dsh-notify-user 的浏览器半边：进度卡 + 插件页配置卡。
 *
 * 两件事各有归属：
 *   1. `tool.call.toolview` 按 wire 工具名接管 `notify_user` 那一行，画成一张
 *      带标题的进度卡；本轮进行中工具行内联可见，结束后随「工作过程」折叠。
 *   2. `plugins.bundle.config` 画催办阈值的配置卡；宿主没服务这份配置时整块不出现，
 *      所以注册包在 `configForms.whileServed` + `slots.inject` 里。
 *
 * 样式在 `apply()` 里注入，标签带 `data-plugin` / `data-plugin-css`：client-modules
 * 按前者在卸载与热更时删掉它们。
 */

/** 包名：样式表标签的归属键，也是浏览器 bundle 的自注册 id。 */
export const name = BUNDLE_NAME;

/** 声明的服务：配置表单、座位、字典。漏声明不会报错，只会让整个半边在页面里消失。 */
export const inject = ['configForms', 'slots', 'locale'];

/** 本插件的样式表：归属键按「包名/文件名」拼，卸载时整批删。 */
const SHEETS: readonly (readonly [string, string])[] = [
  ['NotifyRow.css', rowCss],
  ['ConfigCard.css', cardCss],
];

/** 注入本插件的样式表；同一个键已存在时替换内容而不是再插一张。 */
function injectStyles(): void {
  if (typeof document === 'undefined') return;
  for (const [file, css] of SHEETS) {
    const key = `${BUNDLE_NAME}/${file}`;
    const existing = document.head.querySelector<HTMLStyleElement>(`style[data-plugin-css="${key}"]`);
    const tag = existing ?? document.createElement('style');
    tag.dataset.plugin = BUNDLE_NAME;
    tag.dataset.pluginCss = key;
    tag.textContent = css;
    if (existing === null) document.head.appendChild(tag);
  }
}

/** 撤掉本插件的样式标签。 */
function removeStyles(): void {
  if (typeof document === 'undefined') return;
  for (const tag of document.head.querySelectorAll(`style[data-plugin="${BUNDLE_NAME}"]`)) tag.remove();
}

/**
 * 插件本体。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    injectStyles();
    return () => { removeStyles(); };
  }, 'dsh-notify-user: stylesheets');

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-notify-user: dictionaries');

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'notify_user',
    locale: NS,
    // 进度卡读同一份配置：`collapsible` 决定带不带折叠键。
    inject: () => ({ form: ctx.configForms.get(SETTINGS_NAMESPACE) }),
  }, NotifyRow));

  ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () => ctx.slots.inject(
    BUNDLE_CONFIG_SLOT,
    () => ctx.slots.register({
      name: BUNDLE_CONFIG_SLOT,
      key: BUNDLE_NAME,
      locale: NS,
      inject: () => ({ form: ctx.configForms.get(SETTINGS_NAMESPACE) }),
    }, ConfigCard),
  )), 'dsh-notify-user: plugins page config');
}

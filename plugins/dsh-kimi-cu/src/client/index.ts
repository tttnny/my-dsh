import type { Context as ClientContext } from '@deepseek-ai/cordis';
// 类型只读：这几个包的浏览器半边把 ctx.locale、ctx.slots 与插件页座位契约合并进 Context。
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';

import { ConfigCard } from './ConfigCard.tsx';
import cardCss from './ConfigCard.css';
import { NS, en, zh } from './locales.ts';

/** 包名：样式表标签的归属键，也是 plugins.bundle.config 的 key。 */
export const name = '@lynn123411/dsh-kimi-cu';

/** 声明的服务：座位与字典。漏声明不会报错，只会让整个半边在页面里消失。 */
export const inject = ['slots', 'locale'];

/** 插件页上的座位名。 */
const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config';

/** 本插件样式表的归属键。 */
const STYLE_KEY = name + '/ConfigCard.css';

/** 注入本插件的样式表；同一个键已存在时替换内容而不是再插一张。 */
function injectStyles(): void {
  if (typeof document === 'undefined') return;
  const existing = document.head.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_KEY}"]`);
  const tag = existing ?? document.createElement('style');
  tag.dataset.plugin = name;
  tag.dataset.pluginCss = STYLE_KEY;
  tag.textContent = cardCss;
  if (existing === null) document.head.appendChild(tag);
}

/** 撤掉本插件的样式标签。 */
function removeStyles(): void {
  if (typeof document === 'undefined') return;
  for (const tag of document.head.querySelectorAll(`style[data-plugin="${name}"]`)) tag.remove();
}

/**
 * 浏览器半边：插件页上的 KimiCU 状态卡。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    injectStyles();
    return () => {
      removeStyles();
    };
  }, 'dsh-kimi-cu: stylesheets');

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-kimi-cu: dictionaries');

  ctx.slots.inject(BUNDLE_CONFIG_SLOT, () => ctx.slots.register({
    name: BUNDLE_CONFIG_SLOT,
    key: name,
    locale: NS,
  }, ConfigCard));
}

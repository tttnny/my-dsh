import type { Context as ClientContext } from '@deepseek-ai/cordis';
// 类型只读：这几个包的浏览器半边把 `ctx.locale`、`ctx.slots`、`ctx.configForms`、
// `ctx.uiConversation` 与三个座位的契约合并进 Context。
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-tool/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SyncedConfig } from '@deepseek-ai/dsh-client-config/types';
import type { PluginConfig } from '../config.js';
import { NOTIFY_TOOL_NAME } from '../shared/config.js';
import { ConfigCard } from './ConfigCard.js';
import {
  BUNDLE_CONFIG_SLOT,
  BUNDLE_NAME,
  DEFAULT_CARD_PLACEMENT,
  MODEL_OPTIONS_SLOT,
  SETTINGS_NAMESPACE,
} from './config.js';
import { EnabledToggle } from './EnabledToggle.js';
import { NS, en, zh } from './locales.js';
import { NOTIFY_NODE_KIND, createNotifyDefinition } from './notify-node.js';
import type { CardHooks } from './NotifyCard.js';
import { NotifyNodeView } from './NotifyNodeView.js';
import { NotifyRow } from './NotifyRow.js';
import configCss from './ConfigCard.css';
import cardCss from './NotifyCard.css';
import toggleCss from './EnabledToggle.css';

export { NS } from './locales.js';

/**
 * @lynn123411/dsh-notify-user 的浏览器半边：进度卡 + 菜单开关 + 插件页配置卡。
 *
 * 四件事各有归属：
 *   1. 对话节点定义把 `notify_user` 的每次调用投影成声明了 `process` 位置的节点，
 *      卡片因此站在步骤组外，前后各断一个原生子折叠。
 *   2. `tool.call.toolview` 在跟随工具行模式下，把通用工具定义建出的行画成进度卡。
 *   3. `conversation.input.model.options` 画按会话的「主动汇报」开关，与官方智能体
 *      团队开关同处一个菜单；写回的是本插件配置里的按会话字典。
 *   4. `plugins.bundle.config` 画配置卡；宿主没服务这份配置时整块不出现，
 *      所以注册包在 `configForms.whileServed` + `slots.inject` 里。
 *
 * 样式在 `apply()` 里注入，标签带 `data-plugin` / `data-plugin-css`：client-modules
 * 按前者在卸载与热更时删掉它们。
 */

/** 包名：样式表标签的归属键，也是浏览器 bundle 的自注册 id。 */
export const name = BUNDLE_NAME;

/** 声明的服务：配置表单、座位、字典、对话装配。漏声明不会报错，只会让整个半边在页面里消失。 */
export const inject = ['configForms', 'slots', 'locale', 'uiConversation'];

/** 本插件的样式表：归属键按「包名/文件名」拼，卸载时整批删。 */
const SHEETS: readonly (readonly [string, string])[] = [
  ['NotifyCard.css', cardCss],
  ['ConfigCard.css', configCss],
  ['EnabledToggle.css', toggleCss],
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
 * @param config - 宿主下发的同步配置引用。
 */
export function apply(ctx: ClientContext, config: SyncedConfig<PluginConfig>): void {
  const cardHooks: CardHooks = {
    collapsible: config.collapsible,
    summaryOnly: config.summaryOnly,
    summaryRender: config.summaryRender,
    bodyExpandedByDefault: config.bodyExpandedByDefault,
    showTime: config.showTime,
  };
  ctx.effect(() => {
    injectStyles();
    return () => { removeStyles(); };
  }, 'dsh-notify-user: stylesheets');

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-notify-user: dictionaries');

  // 边界模式接管进度节点，跟随工具行模式只接管工具座位。边界模式下失败的 PTC 子调用走原生工具行。
  ctx.effect(() => {
    let placement: 'boundary' | 'inline' | undefined;
    let dispose: (() => void) | undefined;
    const sync = (): void => {
      const next = config.cardPlacement.get() === 'inline' ? 'inline' : DEFAULT_CARD_PLACEMENT;
      if (next === placement) return;
      dispose?.();
      placement = next;
      dispose = next === 'boundary'
        ? ctx.uiConversation.events.register(createNotifyDefinition())
        : ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key: NOTIFY_TOOL_NAME,
          locale: NS,
          inject: () => ({ hooks: cardHooks }),
        }, NotifyRow));
    };
    sync();
    const unsubscribe = config.cardPlacement.subscribe(sync);
    return () => {
      unsubscribe();
      dispose?.();
    };
  }, 'dsh-notify-user: card placement');

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: NOTIFY_NODE_KIND,
    locale: NS,
    inject: () => ({ hooks: cardHooks }),
  }, NotifyNodeView));

  // 按会话的开关住在模型与推理等级菜单里，与官方智能体团队开关同处一个菜单。
  ctx.slots.inject(MODEL_OPTIONS_SLOT, () => ctx.slots.register({
    name: MODEL_OPTIONS_SLOT,
    id: 'notify-user-enabled',
    locale: NS,
    inject: () => ({ form: ctx.configForms.get(SETTINGS_NAMESPACE) }),
  }, EnabledToggle));

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

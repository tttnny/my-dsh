/**
 * Maple 主题的浏览器半边：注入样式表、把配置投影到 `<html>`、在宿主「插件」页上挂配置卡片。
 *
 * 三件事各有归属：
 *   1. 样式表在 `apply()` 里注入，标签带 `data-plugin` / `data-plugin-css`：client-modules
 *      按前者在卸载与热更时删掉它们（docs/rules/plugin-ui.md「覆盖宿主控件的样式」）。
 *   2. 投影订阅本插件那一行的配置表单，值变了只改 `<html>` 上的属性与变量，样式表不重建。
 *   3. 卡片走 `plugins.bundle.config`，key 是 bundle 的 npm 包名；宿主「插件」页没挂载时
 *      这个座位不存在，所以注册必须包在 `slots.inject` 里，并与 `configForms.whileServed`
 *      串起来——宿主没服务这份配置，就一个字的界面都不出现。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
// 类型只读：这几个包的浏览器半边把座位契约、`ctx.configForms` 与 `ctx.locale` 合并进 Context。
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import { bindProjection, BUNDLE_NAME, BUNDLE_CONFIG_SLOT, SETTINGS_NAMESPACE, type MapleForm } from './binding.ts';
import { CARD_CSS } from './card-css.ts';
import { MapleThemeCard } from './card.tsx';
import { NS, en, zh } from './locales.ts';
import tokens from './styles/tokens.css?inline';
import markdown from './styles/markdown.css?inline';
import shell from './styles/shell.css?inline';

export { NS } from './locales.ts';
export {
  BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, BUNDLE_NAME, SETTINGS_NAMESPACE, bindProjection, paint, readSettings,
} from './binding.ts';
export { MapleThemeCard } from './card.tsx';
export {
  DEFAULT_SETTINGS, HEADING_ATTRIBUTE, INDICATOR_ATTRIBUTE, CODE_ATTRIBUTE, ROOT_ATTRIBUTE, ROOT_VARIABLES,
  applyProjection, clearProjection, clampNumber, normalizeSettings, projectSettings,
} from './settings.ts';

/** 包名：样式表标签的归属键，也是浏览器 bundle 的自注册 id。 */
export const name = '@lynn123411/dsh-maple-theme';

/**
 * 声明的服务：`configForms` 读本插件那一行的配置，`slots` 与 `locale` 画配置卡片。
 * 漏声明不会报错，只会让整个浏览器半边在页面里消失（docs/rules/client-wiring.md）。
 */
export const inject = ['configForms', 'slots', 'locale'];

/** 本插件的样式表：归属键按「包名/文件名」拼，卸载时整批删。 */
const SHEETS: readonly (readonly [string, string])[] = [
  ['tokens.css', tokens],
  ['markdown.css', markdown],
  ['shell.css', shell],
  ['card.css', CARD_CSS],
];

/**
 * 注入本插件的样式表；同一个键已存在时替换内容而不是再插一张。
 * 键按文件走：热更后重新执行这个模块时，新内容覆盖旧标签，不会叠出第二份。
 */
function injectStyles(): void {
  if (typeof document === 'undefined') return;
  for (const [file, css] of SHEETS) {
    const key = `${name}/${file}`;
    const existing = document.head.querySelector<HTMLStyleElement>(`style[data-plugin-css="${key}"]`);
    const tag = existing ?? document.createElement('style');
    tag.dataset.plugin = name;
    tag.dataset.pluginCss = key;
    tag.textContent = css;
    if (existing === null) document.head.appendChild(tag);
  }
}

/** 撤掉本插件的样式标签。 */
function removeStyles(): void {
  if (typeof document === 'undefined') return;
  for (const tag of document.head.querySelectorAll(`style[data-plugin="${name}"]`)) tag.remove();
}

/** 浏览器上下文里本插件用到的成员。 */
interface ClientServices {
  configForms: {
    get(namespace: string): MapleForm;
    whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
  };
  slots: {
    inject(slot: string, register: () => () => void): () => void;
    register(options: Record<string, unknown>, component: unknown): () => void;
  };
  locale: {
    register(namespace: string, dictionaries: { zh: unknown; en: unknown }): () => void;
  };
}

/**
 * 插件本体。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  const services = ctx as unknown as ClientServices;

  ctx.effect(() => {
    injectStyles();
    return () => { removeStyles(); };
  }, 'dsh-maple-theme: stylesheets');

  ctx.effect(
    () => services.locale.register(NS, { zh, en }),
    'dsh-maple-theme: dictionaries',
  );

  // 投影：配置一变就重写 <html>，卸载时把痕迹撤干净。
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    return bindProjection(document.documentElement, services.configForms.get(SETTINGS_NAMESPACE));
  }, 'dsh-maple-theme: projection');

  // 配置卡片：宿主「插件」页挂载时才注册，宿主没服务这份配置就不出现。
  ctx.effect(
    () => services.configForms.whileServed([SETTINGS_NAMESPACE], () => services.slots.inject(
      BUNDLE_CONFIG_SLOT,
      () => slotsRegister(services, () => ({
        name: BUNDLE_CONFIG_SLOT,
        key: BUNDLE_NAME,
        locale: NS,
        inject: () => ({ form: services.configForms.get(SETTINGS_NAMESPACE) }),
      })),
    )),
    'dsh-maple-theme: plugins page config',
  );
}

/**
 * 把「注册项的选项」与组件绑在一起，抽出来只为让上面那段读起来是三层而不是五层。
 * @param services - 上下文里用到的服务。
 * @param options - 注册项的选项工厂（每次注册都新建一份）。
 * @returns 注册的 disposer。
 */
function slotsRegister(services: ClientServices, options: () => Record<string, unknown>): () => void {
  return services.slots.register(options(), MapleThemeCard);
}

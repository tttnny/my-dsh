import type { Context as ClientContext } from '@deepseek-ai/cordis';
// 类型只读：这些包的浏览器半边把座位契约与 `ctx.configForms` 合并进 Context。
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import { injectCardStyles, setupSettingsUi } from './settings/ui.tsx';
import { apply as registerDictionaries, en, zh } from './locales.ts';

/**
 * 浏览器半边：把配置卡片挂到宿主的「插件」页上。
 *
 * `inject` 是 cordis 服务名（`remote.credentials` 是判断密钥的写入通道）；
 * `package.json` 的 `dsh.client.inject` 是包名。
 * 两层都要声明，漏一层整条 loader entry 会静默变成 failed，页面上什么也看不见
 * （见 docs/rules/client-wiring.md）。
 */
export const name = '@lynn123411/dsh-subagent-judge-dispatch';
export const inject = ['slots', 'configForms', 'remote', 'remote.session', 'remote.credentials', 'locale'];

/**
 * 插件本体：注册字典，再挂配置卡片。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  injectCardStyles();
  registerDictionaries(ctx);
  ctx.effect(
    () => {
      setupSettingsUi(ctx as never);
      return () => {};
    },
    'dsh-subagent-judge-dispatch: plugins page config',
  );
}

export { NS } from './locales.ts';
export { en, zh } from './locales.ts';

/** 字典本体，随 bundle 导出供自检核对键集。 */
export const __dictionaries = { en, zh };
export { JudgeDispatchPanel, injectCardStyles, setupSettingsUi } from './settings/ui.tsx';
export {
  ALLOWED_MODELS_NAMESPACE,
  buildModelOptions,
  createDispatchRemote,
  describeChoice,
  describeModel,
  dispatchCardStore,
  readRow,
  SETTINGS_NAMESPACE,
  validateRows,
} from './settings/store.ts';

import z from '@deepseek-ai/schemastery';

import { FIELDS } from './client/schema.ts';

/**
 * `@lynn123411/dsh-native-plus` —— 在 DSH 原生的蓝白黑之上增强对话正文的排版与装饰。
 *
 * 宿主半边只声明这份配置的形状：界面全部由浏览器半边画（注入样式表 + 插件页上的配置卡片），
 * 这里不碰任何界面，也不注册工具。配置项落进本插件那一行的 config，浏览器半边经
 * `ctx.configForms.get('dsh-native-plus')` 读写同一份值。
 *
 * 形状从浏览器半边那张字段表生成，所以两边不会各写一份、各漏一项。
 * 每个字段都标 `volatile()`：改一个旋钮不该重挂整条 loader entry。
 */
export const name = 'dsh-native-plus';

/** 只需要 settings 服务：它承载这一行的配置，也是「不自动生成设置页」那条策略的入口。 */
export const inject = ['settings'];

/** 本插件在 profile 里的 loader 行 id，同时是设置的命名空间。 */
export const SETTINGS_NAMESPACE = name;

/** 由字段表拼出 schemastery 的形状。 */
function buildShape(): Record<string, unknown> {
  const shape: Record<string, unknown> = {};
  for (const field of FIELDS) {
    shape[field.key] = z.number().step(field.step).min(field.min).max(field.max).default(field.default).volatile();
  }
  return shape;
}

/** 配置的形状与默认值，由字段表生成。 */
export const Config = z.object(buildShape());

/** 宿主上下文里本插件用到的那两个成员。 */
interface HostContext {
  fiber: unknown;
  settings: {
    /** 登记这一行在设置页上的自动生成策略；`auto: false` 表示不生成。 */
    configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
  };
}

/**
 * 插件本体：声明本行的设置页策略。
 *
 * 配置界面在宿主「插件」页上（浏览器半边注册 `plugins.bundle.config`），
 * 所以这里要显式关掉内核按 Config schema 自动生成的设置页，否则同一批字段会出现两次。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx: HostContext): void {
  ctx.settings.configure({ auto: false }, ctx.fiber);
}

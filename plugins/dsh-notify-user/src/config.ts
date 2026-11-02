import z from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';

/**
 * 本插件在 profile 里的 loader 行 id，同时是设置的命名空间。
 * 配置卡经 `ctx.configForms.get(SETTINGS_NAMESPACE)` 读写同一份值。
 */
export const SETTINGS_NAMESPACE = 'dsh-notify-user';

/** 催办阈值：连续多少次根工具调用没有汇报时催一次。 */
export const DEFAULT_NUDGE_AFTER = 8;

/** 阈值上限；0 是关闭催办，其余按次数算。 */
export const MAX_NUDGE_AFTER = 100;

/** 进度卡默认带折叠按钮；正文始终默认展开。 */
export const DEFAULT_COLLAPSIBLE = true;

/** 宿主拿到的配置：`.volatile()` 的字段是稳定引用，读当前值要 `.get()`。 */
export interface PluginConfig {
  nudgeAfter: Volatile<number>;
  collapsible: Volatile<boolean>;
}

/** 配置形状；volatile 让改配置不重挂这条 loader entry，当前会话下一步就用新值。 */
export const Config = z.object({
  nudgeAfter: z.number().min(0).max(MAX_NUDGE_AFTER).default(DEFAULT_NUDGE_AFTER).volatile(),
  collapsible: z.boolean().default(DEFAULT_COLLAPSIBLE).volatile(),
});

/**
 * 读当前阈值。
 * @param config - 本行的配置。
 * @returns 0 表示关闭催办；非有限值按默认算。
 */
export function nudgeAfterOf(config: PluginConfig): number {
  const value = config.nudgeAfter.get();
  if (!Number.isFinite(value)) return DEFAULT_NUDGE_AFTER;
  return Math.min(MAX_NUDGE_AFTER, Math.max(0, Math.floor(value)));
}

/**
 * 读当前「进度卡是否带折叠按钮」。
 * @param config - 本行的配置。
 * @returns 缺省或非布尔值按默认算。
 */
export function collapsibleOf(config: PluginConfig): boolean {
  const value = config.collapsible.get();
  return typeof value === 'boolean' ? value : DEFAULT_COLLAPSIBLE;
}

import z from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import {
  CARD_PLACEMENTS,
  DEFAULT_CARD_PLACEMENT,
  DEFAULT_COLLAPSIBLE,
  DEFAULT_NUDGE_AFTER,
  DEFAULT_RESET_ON_PROSE,
  MAX_NUDGE_AFTER,
} from './shared/config.js';

/** 宿主拿到的配置：`.volatile()` 的字段是稳定引用，读当前值要 `.get()`。 */
export interface PluginConfig {
  nudgeAfter: Volatile<number>;
  resetOnProse: Volatile<boolean>;
  collapsible: Volatile<boolean>;
  cardPlacement: Volatile<string>;
}

/** 配置形状；volatile 让改配置不重挂这条 loader entry，当前会话下一步就用新值。 */
export const Config = z.object({
  nudgeAfter: z.number().min(0).max(MAX_NUDGE_AFTER).default(DEFAULT_NUDGE_AFTER).volatile(),
  resetOnProse: z.boolean().default(DEFAULT_RESET_ON_PROSE).volatile(),
  collapsible: z.boolean().default(DEFAULT_COLLAPSIBLE).volatile(),
  cardPlacement: z.union(CARD_PLACEMENTS.map(value => z.const(value)))
    .default(DEFAULT_CARD_PLACEMENT)
    .volatile(),
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

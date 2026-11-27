/**
 * 配置卡、菜单开关与宿主配置表单之间的接线：座位、包名，以及「读当前配置」。
 *
 * 配置卡、菜单开关与自检都从这里取字面量，所以
 * 「key 写歪一个字符」这类静默失败不会两边各写一份。与宿主共用的命名空间/默认值/
 * 按会话的判定在 `src/shared/config.ts`，这里只再导出。
 */

import {
  CARD_PLACEMENTS,
  DEFAULT_BODY_EXPANDED_BY_DEFAULT,
  DEFAULT_CARD_PLACEMENT,
  DEFAULT_COLLAPSIBLE,
  DEFAULT_ENABLED,
  DEFAULT_NUDGE_AFTER,
  DEFAULT_RESET_ON_PROSE,
  DEFAULT_SHOW_TIME,
  DEFAULT_SUMMARY_ONLY,
  DEFAULT_SUMMARY_RENDER,
  MAX_NUDGE_AFTER,
  SUMMARY_RENDERS,
  type CardPlacement,
  type SessionOverrides,
  type SummaryRender,
} from '../shared/config.js';

export {
  CARD_PLACEMENTS,
  DEFAULT_BODY_EXPANDED_BY_DEFAULT,
  DEFAULT_CARD_PLACEMENT,
  DEFAULT_COLLAPSIBLE,
  DEFAULT_ENABLED,
  DEFAULT_NUDGE_AFTER,
  DEFAULT_RESET_ON_PROSE,
  DEFAULT_SHOW_TIME,
  DEFAULT_SUMMARY_ONLY,
  DEFAULT_SUMMARY_RENDER,
  MAX_NUDGE_AFTER,
  SETTINGS_NAMESPACE,
  SUMMARY_RENDERS,
  enabledFor,
  overridesAfterWrite,
} from '../shared/config.js';

export type { CardPlacement, SessionOverrides, SummaryRender } from '../shared/config.js';

/** 本插件 bundle 的包名：`plugins.bundle.config` 的 key 就是它。 */
export const BUNDLE_NAME = '@lynn123411/dsh-notify-user';

/** 宿主「插件」页上的配置座位。 */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config';

/** 模型与推理等级菜单里的会话选项座位：菜单开关注册在这里。 */
export const MODEL_OPTIONS_SLOT = 'conversation.input.model.options';

/** 设置表单快照里本卡片读到的那几件。 */
export interface ConfigFormSnapshot {
  status: 'loading' | 'ready' | 'unavailable';
  value?: unknown;
}

/** 判断一个值是不是普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 一张配置卡要用到的表单：只取真正用到的那几个成员的结构子集。
 * 自检用假件冒充它时不必拖进整个 ui-settings 运行时。
 */
export interface ConfigForm {
  getSnapshot(): ConfigFormSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
}

/** 本插件在浏览器侧读到的配置。 */
export interface ClientConfig {
  nudgeAfter: number;
  resetOnProse: boolean;
  collapsible: boolean;
  summaryOnly: boolean;
  summaryRender: SummaryRender;
  bodyExpandedByDefault: boolean;
  showTime: boolean;
  cardPlacement: CardPlacement;
  defaultEnabled: boolean;
  sessionOverrides: SessionOverrides;
}

/** 字段缺失或配置还没就绪时的那份快照；默认值只在这里写一遍。 */
export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  nudgeAfter: DEFAULT_NUDGE_AFTER,
  resetOnProse: DEFAULT_RESET_ON_PROSE,
  collapsible: DEFAULT_COLLAPSIBLE,
  summaryOnly: DEFAULT_SUMMARY_ONLY,
  summaryRender: DEFAULT_SUMMARY_RENDER,
  bodyExpandedByDefault: DEFAULT_BODY_EXPANDED_BY_DEFAULT,
  showTime: DEFAULT_SHOW_TIME,
  cardPlacement: DEFAULT_CARD_PLACEMENT,
  defaultEnabled: DEFAULT_ENABLED,
  sessionOverrides: {},
};

/**
 * 读按会话的选择：只收布尔值，别的脏数据当没写。
 * @param value - 配置里的 `sessionOverrides` 字段。
 * @returns 会话 id 到开关值的字典。
 */
function readOverrides(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const overrides: Record<string, boolean> = {};
  for (const [sessionId, enabled] of Object.entries(value)) {
    if (typeof enabled === 'boolean') overrides[sessionId] = enabled;
  }
  return overrides;
}

/**
 * 读当前配置。
 * @param form - 本命名空间的配置表单。
 * @returns 宿主还没服务这个命名空间时返回 undefined；字段缺失按 {@link DEFAULT_CLIENT_CONFIG} 算。
 */
export function readConfig(form: ConfigForm): ClientConfig | undefined {
  const snapshot = form.getSnapshot();
  if (snapshot.status === 'unavailable') return undefined;
  const value = isRecord(snapshot.value) ? snapshot.value : {};
  const rawThreshold = value['nudgeAfter'];
  const nudgeAfter = typeof rawThreshold === 'number' && Number.isFinite(rawThreshold)
    ? Math.min(MAX_NUDGE_AFTER, Math.max(0, Math.floor(rawThreshold)))
    : DEFAULT_CLIENT_CONFIG.nudgeAfter;
  const rawResetOnProse = value['resetOnProse'];
  const resetOnProse = typeof rawResetOnProse === 'boolean' ? rawResetOnProse : DEFAULT_CLIENT_CONFIG.resetOnProse;
  const rawCollapsible = value['collapsible'];
  const collapsible = typeof rawCollapsible === 'boolean' ? rawCollapsible : DEFAULT_CLIENT_CONFIG.collapsible;
  const rawSummaryOnly = value['summaryOnly'];
  const summaryOnly = typeof rawSummaryOnly === 'boolean' ? rawSummaryOnly : DEFAULT_CLIENT_CONFIG.summaryOnly;
  const rawSummaryRender = value['summaryRender'];
  const summaryRender = SUMMARY_RENDERS.find(render => render === rawSummaryRender) ?? DEFAULT_CLIENT_CONFIG.summaryRender;
  const rawBodyExpanded = value['bodyExpandedByDefault'];
  const bodyExpandedByDefault = typeof rawBodyExpanded === 'boolean' ? rawBodyExpanded : DEFAULT_CLIENT_CONFIG.bodyExpandedByDefault;
  const rawShowTime = value['showTime'];
  const showTime = typeof rawShowTime === 'boolean' ? rawShowTime : DEFAULT_CLIENT_CONFIG.showTime;
  const rawPlacement = value['cardPlacement'];
  const cardPlacement = CARD_PLACEMENTS.find(placement => placement === rawPlacement) ?? DEFAULT_CLIENT_CONFIG.cardPlacement;
  const rawDefaultEnabled = value['defaultEnabled'];
  const defaultEnabled = typeof rawDefaultEnabled === 'boolean' ? rawDefaultEnabled : DEFAULT_CLIENT_CONFIG.defaultEnabled;
  const sessionOverrides = readOverrides(value['sessionOverrides']);
  return { nudgeAfter, resetOnProse, collapsible, summaryOnly, summaryRender, bodyExpandedByDefault, showTime, cardPlacement, defaultEnabled, sessionOverrides };
}

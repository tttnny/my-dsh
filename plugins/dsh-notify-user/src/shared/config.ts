/**
 * 宿主与浏览器两半边共用的配置字面量：改一处两边一起走，避免「两处各写一份」。
 * 这里只放纯值，不碰 schemastery 与 cordis，浏览器 bundle 可以直接内联。
 */

/** 本插件在 profile 里的 loader 行 id，也是设置的命名空间。 */
export const SETTINGS_NAMESPACE = 'dsh-notify-user';

/** 汇报工具的名字：宿主注册、客户端认领、催办清零都用这一个字面量。 */
export const NOTIFY_TOOL_NAME = 'notify_user';

/** 催办阈值：连续多少次根工具调用没有汇报时催一次。 */
export const DEFAULT_NUDGE_AFTER = 10;

/** 阈值上限；0 是关闭催办，其余按次数算。 */
export const MAX_NUDGE_AFTER = 100;

/** 助手消息里的散文回复算不算一次汇报：默认算。 */
export const DEFAULT_RESET_ON_PROSE = true;

/** 进度卡默认带折叠按钮；正文始终默认展开。 */
export const DEFAULT_COLLAPSIBLE = true;

/** 进度卡在对话流里的位置：步骤组边界，或跟随工具行。 */
export const CARD_PLACEMENTS = ['boundary', 'inline'] as const;

/** 进度卡位置。 */
export type CardPlacement = typeof CARD_PLACEMENTS[number];

/** 默认把进度卡放在步骤组边界。 */
export const DEFAULT_CARD_PLACEMENT: CardPlacement = 'boundary';

/** 会话没有自己的选择时，主动汇报默认开着。 */
export const DEFAULT_ENABLED = true;

/**
 * 按会话的选择：只记与默认值不同的那些会话，缺一条表示跟随默认值。
 * 键是会话 id，值是那个会话开关的落定值。
 */
export type SessionOverrides = Readonly<Record<string, boolean>>;

/**
 * 一个会话是否开启主动汇报：会话有自己的选择就用它，否则用默认值。
 * @param overrides - 按会话的选择。
 * @param fallback - 会话没有自己的选择时用的默认值。
 * @param sessionId - 会话 id。
 * @returns 这个会话是否开启主动汇报。
 */
export function enabledFor(
  overrides: SessionOverrides | undefined,
  fallback: boolean,
  sessionId: string,
): boolean {
  const explicit = overrides?.[sessionId];
  return typeof explicit === 'boolean' ? explicit : fallback;
}

/**
 * 算出写入一个会话的选择之后的那份字典。
 *
 * 切回默认值就删掉那条：字典里只留与默认值不同的会话，配置不会随会话数一直长。
 * @param overrides - 当前的选择。
 * @param sessionId - 改的是哪个会话。
 * @param enabled - 这个会话改成开还是关。
 * @param fallback - 默认值；改成的值与它相同时不留记录。
 * @returns 新的选择；没有变化时返回同一个对象，调用方据此跳过写入。
 */
export function overridesAfterWrite(
  overrides: SessionOverrides | undefined,
  sessionId: string,
  enabled: boolean,
  fallback: boolean,
): SessionOverrides {
  const current = overrides ?? {};
  const hasEntry = Object.hasOwn(current, sessionId);
  if (enabled === fallback) {
    if (!hasEntry) return current;
    const next = { ...current };
    delete next[sessionId];
    return next;
  }
  if (hasEntry && current[sessionId] === enabled) return current;
  return { ...current, [sessionId]: enabled };
}

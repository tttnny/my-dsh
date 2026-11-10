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

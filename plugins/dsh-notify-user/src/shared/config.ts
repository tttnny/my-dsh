/**
 * 宿主与浏览器两半边共用的配置字面量：改一处两边一起走，避免「两处各写一份」。
 * 这里只放纯值，不碰 schemastery 与 cordis，浏览器 bundle 可以直接内联。
 */

/** 本插件在 profile 里的 loader 行 id，也是设置的命名空间。 */
export const SETTINGS_NAMESPACE = 'dsh-notify-user';

/** 催办阈值：连续多少次根工具调用没有汇报时催一次。 */
export const DEFAULT_NUDGE_AFTER = 8;

/** 阈值上限；0 是关闭催办，其余按次数算。 */
export const MAX_NUDGE_AFTER = 100;

/** 进度卡默认带折叠按钮；正文始终默认展开。 */
export const DEFAULT_COLLAPSIBLE = true;

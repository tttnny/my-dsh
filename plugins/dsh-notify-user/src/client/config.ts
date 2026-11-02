/**
 * 配置卡与宿主配置表单之间的接线：命名空间、座位、包名，以及「读当前配置」。
 *
 * 卡片（`ConfigCard.tsx`）、进度卡（`NotifyRow.tsx`）与自检（`scripts/smoke-client.mjs`）
 * 都从这里取字面量，所以「key 写歪一个字符」这类静默失败不会两边各写一份。
 */

/** 本插件在 profile 里的 loader 行 id，也是设置的命名空间。 */
export const SETTINGS_NAMESPACE = 'dsh-notify-user';

/** 本插件 bundle 的包名：`plugins.bundle.config` 的 key 就是它。 */
export const BUNDLE_NAME = '@lynn123411/dsh-notify-user';

/** 宿主「插件」页上的配置座位。 */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config';

/** 阈值默认值与上限：与宿主 `src/config.ts` 的 schema 同值。 */
export const DEFAULT_NUDGE_AFTER = 8;
export const MAX_NUDGE_AFTER = 100;

/** 进度卡默认带折叠按钮。 */
export const DEFAULT_COLLAPSIBLE = true;

/** 设置表单快照里本卡片读到的那几件。 */
export interface ConfigFormSnapshot {
  status: 'loading' | 'ready' | 'unavailable';
  value?: Partial<Record<string, unknown>> | undefined;
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
  collapsible: boolean;
}

/**
 * 读当前配置。
 * @param form - 本命名空间的配置表单。
 * @returns 宿主还没服务这个命名空间时返回 undefined；字段缺失按默认算。
 */
export function readConfig(form: ConfigForm): ClientConfig | undefined {
  const snapshot = form.getSnapshot();
  if (snapshot.status === 'unavailable') return undefined;
  const rawThreshold = snapshot.value?.['nudgeAfter'];
  const nudgeAfter = typeof rawThreshold === 'number' && Number.isFinite(rawThreshold)
    ? Math.min(MAX_NUDGE_AFTER, Math.max(0, Math.floor(rawThreshold)))
    : DEFAULT_NUDGE_AFTER;
  const rawCollapsible = snapshot.value?.['collapsible'];
  const collapsible = typeof rawCollapsible === 'boolean' ? rawCollapsible : DEFAULT_COLLAPSIBLE;
  return { nudgeAfter, collapsible };
}

/**
 * 配置卡片与主题投影的唯一接线处：读哪一份表单、写哪几个字段。
 *
 * 这一层只做「读快照 → 收拢 → 投影 → 写到 <html>」三件事，不画界面。
 * 卡片（`card.tsx`）与自检（`scripts/test-projection.mjs`）都从这里的同一个函数走，
 * 所以「卡片改了字段」与「页面真的换了样子」不可能各走一边。
 */
import {
  applyProjection,
  clearProjection,
  normalizeSettings,
  projectSettings,
  type MapleSettings,
} from './settings.ts';

/** 本插件在 profile 里的 loader 行 id，也是配置表单的命名空间。 */
export const SETTINGS_NAMESPACE = 'dsh-maple-theme';

/** 主题在宿主「插件」页上的座位。 */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config';

/** 本插件 bundle 的包名：`plugins.bundle.config` 的 key 就是它。 */
export const BUNDLE_NAME = '@lynn123411/dsh-maple-theme';

/**
 * 一张卡片要用到的配置表单：只取真正用到的那几个成员的结构子集。
 * 这样自检用假件冒充它时不必拖进整个 ui-settings 运行时。
 */
export interface MapleForm {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable';
    value?: Partial<MapleSettings> | undefined;
    writable?: boolean;
    revision?: number | undefined;
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<boolean>;
}

/**
 * 读表单当前值，收拢成一份可信配置。
 * @param form - 本命名空间的配置表单。
 * @returns 宿主还没服务这个命名空间时返回 undefined。
 */
export function readSettings(form: MapleForm): MapleSettings | undefined {
  const snapshot = form.getSnapshot();
  if (snapshot.status === 'unavailable') return undefined;
  return normalizeSettings(snapshot.value);
}

/**
 * 订阅表单并持续投影，直到返回的 disposer 被调用。
 * 这也包括卸载时把 `<html>` 上的痕迹撤干净——插件停用后页面必须回到宿主原本的样子。
 * @param root - 文档根元素。
 * @param form - 本命名空间的配置表单。
 * @returns 停止订阅并撤掉投影的 disposer。
 */
export function bindProjection(root: HTMLElement, form: MapleForm): () => void {
  const sync = (): void => {
    const settings = readSettings(form);
    applyProjection(root, projectSettings(settings ?? normalizeSettings(undefined)));
  };
  sync();
  const off = form.subscribe(sync);
  return () => {
    off();
    clearProjection(root);
  };
}

/**
 * 配置到页面的投影：把一份扁平配置算成「<html> 上要挂的属性与变量」。
 *
 * 这里是纯函数，不碰 document、不读配置源。落点只有两处：
 *   - 一个根属性，样式表全部挂在它下面，关掉整层就整段不匹配；
 *   - 两个数值变量，正文行高与段落间距。
 *
 * 这里不产生任何颜色：本插件一个颜色令牌都不写，蓝阶、纸面、语法色都读宿主的。
 */
import { defaultConfig, normalizeConfig, type Config } from './schema.ts';

/** 本插件在 `<html>` 上用的根属性：开着时才加，关掉整层样式一并失效。 */
export const ROOT_ATTRIBUTE = 'data-native-plus';

/** 一份配置投影出来的结果。 */
export interface Projection {
  /** `<html>` 上要设的属性（值为 `null` 表示删掉）。 */
  attributes: Record<string, string | null>;
  /** `<html>` 行内样式上要写的自定义变量（值为 `null` 表示删掉）。 */
  variables: Record<string, string | null>;
}

/** 一份配置。 */
export type Settings = Config;

/** 出厂配置。 */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze(defaultConfig());

/** 把宿主给的脏值收拢成一份可信配置。 */
export function normalizeSettings(raw: Partial<Record<string, unknown>> | undefined | null): Settings {
  return normalizeConfig(raw);
}

/** 本插件写在 `<html>` 上的全部变量名：撤痕迹时按这张表逐个删，不靠猜。 */
export const ROOT_VARIABLES: readonly string[] = ['--np-line-height', '--np-p-gap'];

/**
 * 算出一份配置该在 `<html>` 上留下什么。
 * @param settings - 已收拢的配置。
 * @param enabled - 整层是否启用；关掉时全部撤掉。
 * @returns 要写的属性与变量。
 */
export function projectSettings(settings: Settings, enabled = true): Projection {
  if (!enabled) {
    const variables: Record<string, null> = {};
    for (const name of ROOT_VARIABLES) variables[name] = null;
    return { attributes: { [ROOT_ATTRIBUTE]: null }, variables };
  }

  return {
    attributes: { [ROOT_ATTRIBUTE]: 'on' },
    variables: {
      '--np-line-height': String(Number(settings.lineHeight)),
      '--np-p-gap': `${Number(settings.paragraphGap)}px`,
    },
  };
}

/** 把投影写到页面上；同一个元素重复调用是幂等的。 */
export function applyProjection(root: HTMLElement, projection: Projection): void {
  for (const [attribute, value] of Object.entries(projection.attributes)) {
    if (value === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
  }
  for (const [property, value] of Object.entries(projection.variables)) {
    if (value === null) root.style.removeProperty(property);
    else root.style.setProperty(property, value);
  }
}

/** 撤掉本插件在页面上留下的一切痕迹（卸载与关掉整层都走这一条）。 */
export function clearProjection(root: HTMLElement): void {
  applyProjection(root, projectSettings(normalizeSettings(undefined), false));
}

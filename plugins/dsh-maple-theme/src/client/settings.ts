/**
 * 配置到 DOM 的投影：把一份已解析的配置算成 `<html>` 上要写的属性与自定义变量。
 *
 * 这里是纯函数，不碰 document、不读配置源——浏览器半边负责把它的结果写到页面上，
 * 自检直接 import 这个文件断言映射，不用起 DOM。
 *
 * 为什么写在 `<html>` 而不是 `body`：宿主把令牌声明在 `body` 上，我们的样式表也要覆盖
 * 同名变量，写在同一层只能靠注入顺序取胜；写到 `<html>` 上，`body` 里那些 `var(--maple-*)`
 * 一律读得到，而两套配色各自的选择器 (`body` / `body[data-ds-dark-theme]`) 与宿主同形，
 * 只靠后注入这一条优势。**但开关必须写在祖先上**：属性选择器要多一个 key 才能稳定压过宿主。
 */

/** 本插件在 `<html>` 上用的根属性：开着时才加，关掉整层样式一并失效。 */
export const ROOT_ATTRIBUTE = 'data-maple-theme';

/** 标题配色方式落到 `<html>` 上的属性名。 */
export const HEADING_ATTRIBUTE = 'data-maple-heading';

/** 标题等级标记的开关属性名。 */
export const INDICATOR_ATTRIBUTE = 'data-maple-indicator';

/** 代码配色的开关属性名。 */
export const CODE_ATTRIBUTE = 'data-maple-code';

/** 外壳装饰（侧栏、标签条、输入区）的开关属性名。 */
export const SHELL_ATTRIBUTE = 'data-maple-shell';

/** 内嵌字体的开关属性名。 */
export const FONT_ATTRIBUTE = 'data-maple-font';

/**
 * 「DSH 原生」配色：整层令牌接管失效，退回宿主自己的配色。
 *
 * 这一个开关同时压住两件事，缺一件都退不干净：
 *   1. 调色板——`ctx.theme.overrideTokens` 的这一层要撤掉，否则宿主拿到的还是我们的值；
 *   2. 装饰层——样式表里**不读令牌、直接写颜色**的那些地方（标题六色、语法色、
 *      引用条、表格头、行内代码）必须整段不匹配，否则会出现「宿主底 + Maple 彩标题」。
 * 它不参与色相匹配：原生与色相无关，切换时两个色相值原地留着，换回来还是原来那一组。
 */
export const NATIVE_ATTRIBUTE = 'data-maple-native';

/** 一份配置投影出来的结果：要写的属性与变量。 */
export interface MapleProjection {
  /** `<html>` 上要设的属性（值为 `null` 表示删掉）。 */
  attributes: Record<string, string | null>;
  /** `<html>` 行内样式上要写的自定义变量（值为 `null` 表示删掉）。 */
  variables: Record<string, string | null>;
}

/** 本插件写在 `<html>` 上的全部变量名：撤痕迹时按这张表逐个删，不靠猜。 */
export const ROOT_VARIABLES = [
  '--maple-hue-light',
  '--maple-hue-dark',
  '--maple-line-height',
  '--maple-p-gap',
] as const;

/** 配置里取色相关字段的兜底：宿主没给值时按 Maple 出厂值走。 */
export interface MapleSettings {
  hueLight: number;
  hueDark: number;
  lineHeight: number;
  paragraphGap: number;
  headingColor: 'colorful' | 'accent' | 'text';
  headingIndicator: boolean;
  codePalette: boolean;
  shellSkin: boolean;
  /** 配色退回宿主自己的（「DSH 原生」预设）。 */
  nativePalette: boolean;
  /** 内嵌 Maple 的字体。 */
  mapleFont: boolean;
}

/** 出厂值，与宿主半边 Config 的默认值同一组数字。 */
export const DEFAULT_SETTINGS: Readonly<MapleSettings> = Object.freeze({
  hueLight: 35,
  hueDark: 207,
  lineHeight: 1.75,
  paragraphGap: 10,
  headingColor: 'colorful',
  headingIndicator: true,
  codePalette: true,
  shellSkin: true,
  nativePalette: false,
  mapleFont: true,
});

/**
 * 把一个数夹进闭区间；不是有限数就用兜底值。
 * 手改过的设置文档可能存进越界值或字符串，投影这一步不信任它。
 * @param value - 候选值。
 * @param min - 下界。
 * @param max - 上界。
 * @param fallback - 不是有限数时用它。
 * @returns 夹好的数。
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  // 空串、全空白，以及 null 被 Number 读成 0 的那一类，都不算「给了一个数」。
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * 把宿主可能给出的任意值收成一份可信的配置。
 * @param raw - 配置源里的原始值（可能缺字段、可能越界）。
 * @returns 每个字段都在合法范围内的一份配置。
 */
export function normalizeSettings(raw: Partial<MapleSettings> | undefined | null): MapleSettings {
  const source = raw ?? {};
  const heading = source.headingColor;
  return {
    hueLight: clampNumber(source.hueLight, 0, 360, DEFAULT_SETTINGS.hueLight),
    hueDark: clampNumber(source.hueDark, 0, 360, DEFAULT_SETTINGS.hueDark),
    lineHeight: clampNumber(source.lineHeight, 1.4, 2, DEFAULT_SETTINGS.lineHeight),
    paragraphGap: clampNumber(source.paragraphGap, 4, 24, DEFAULT_SETTINGS.paragraphGap),
    headingColor: heading === 'colorful' || heading === 'accent' || heading === 'text'
      ? heading
      : DEFAULT_SETTINGS.headingColor,
    headingIndicator: source.headingIndicator ?? DEFAULT_SETTINGS.headingIndicator,
    codePalette: source.codePalette ?? DEFAULT_SETTINGS.codePalette,
    shellSkin: source.shellSkin ?? DEFAULT_SETTINGS.shellSkin,
    nativePalette: source.nativePalette ?? DEFAULT_SETTINGS.nativePalette,
    mapleFont: source.mapleFont ?? DEFAULT_SETTINGS.mapleFont,
  };
}

/**
 * 算出一份配置该在 `<html>` 上留下什么。
 *
 * 关掉的开关写成 `null`（调用方删属性），而不是写 `off`：属性不存在时那批规则整段不匹配，
 * 少一个匹配分支也少一处能跟宿主撞车的地方。
 * @param settings - 已收拢到合法范围的配置。
 * @param enabled - 整个主题是否启用；关掉时只留一个「关」标记，其余全部撤掉。
 * @returns 要写的属性与变量。
 */
export function projectSettings(settings: MapleSettings, enabled = true): MapleProjection {
  if (!enabled) {
    const variables: Record<string, null> = {};
    for (const name of ROOT_VARIABLES) variables[name] = null;
    return {
      attributes: {
        [ROOT_ATTRIBUTE]: null,
        [HEADING_ATTRIBUTE]: null,
        [INDICATOR_ATTRIBUTE]: null,
        [CODE_ATTRIBUTE]: null,
        [SHELL_ATTRIBUTE]: null,
        [FONT_ATTRIBUTE]: null,
        [NATIVE_ATTRIBUTE]: null,
      },
      variables,
    };
  }
  return {
    attributes: {
      [ROOT_ATTRIBUTE]: 'on',
      [HEADING_ATTRIBUTE]: settings.headingColor,
      [INDICATOR_ATTRIBUTE]: settings.headingIndicator ? 'on' : null,
      [CODE_ATTRIBUTE]: settings.codePalette ? 'on' : null,
      [SHELL_ATTRIBUTE]: settings.shellSkin ? 'on' : null,
      [FONT_ATTRIBUTE]: settings.mapleFont ? 'on' : null,
      // 「DSH 原生」时挂上这一个属性，样式表里所有「不读令牌、直接写颜色」的装饰段
      // 靠它整段失效；令牌那一层在浏览器半边撤掉（见 index.ts）。
      [NATIVE_ATTRIBUTE]: settings.nativePalette ? 'on' : null,
    },
    variables: {
      '--maple-hue-light': String(settings.hueLight),
      '--maple-hue-dark': String(settings.hueDark),
      '--maple-line-height': String(settings.lineHeight),
      '--maple-p-gap': `${settings.paragraphGap}px`,
    },
  };
}

/**
 * 把投影写到页面上；同一个元素重复调用是幂等的。
 * @param root - 文档根元素（真实浏览器里是 `document.documentElement`）。
 * @param projection - {@link projectSettings} 的结果。
 */
export function applyProjection(root: HTMLElement, projection: MapleProjection): void {
  for (const [attribute, value] of Object.entries(projection.attributes)) {
    if (value === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
  }
  for (const [property, value] of Object.entries(projection.variables)) {
    if (value === null) root.style.removeProperty(property);
    else root.style.setProperty(property, value);
  }
}

/**
 * 撤掉本插件在页面上留下的一切痕迹（卸载与关掉主题都走这一条）。
 * @param root - 文档根元素。
 */
export function clearProjection(root: HTMLElement): void {
  applyProjection(root, projectSettings(normalizeSettings(undefined), false));
}

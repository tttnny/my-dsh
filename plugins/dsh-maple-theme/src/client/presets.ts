/**
 * 配色预设：一次定下浅色与深色两个色相，或者整个退回宿主原色。
 *
 * 两个色相是成套的——只改一个会得到「暖白配冷灰」这种半套配色，
 * 所以切换预设走一次原子写入，而不是两次分开的字段写。
 *
 * 这些位置都有名字：35° 是 Maple 出厂值（暖白），230° 是浅深同调的蓝（天青）。
 * 色相预设只换色相、不动明度，所以每一个的正文对比度都与出厂值持平（自检里有这一条）。
 */

/** 词典里所有键名；预设表里的 `key` 必须是其一，写错字在类型这一层就红。 */
type LocaleKey = keyof typeof import('./locales.ts').en;

/** 一个色相预设：浅色与深色各一个基础色相。 */
export interface HuePreset {
  id: string;
  light: number;
  dark: number;
  key: LocaleKey;
}

/**
 * 色相预设表。
 *
 * `azure` 是浅深同调的蓝（两个基础色相都是 230）：只想要一个方向、不想浅深两套
 * 各有各的色相时用它。
 */
export const HUE_PRESETS: readonly HuePreset[] = [
  { id: 'maple', light: 35, dark: 207, key: 'card.presetMaple' },
  { id: 'azure', light: 230, dark: 230, key: 'card.presetAzure' },
] as const;

/**
 * 「DSH 原生」这一档的 id。
 *
 * 它不是又一组色相，而是**让本插件的整层令牌接管失效**：配色退回宿主自己的，
 * 就像这个插件没装过。所以它不进 {@link HUE_PRESETS}——那几条是「换一组色相」，
 * 这一条是「不要我的色相」。
 */
export const NATIVE_PRESET_ID = 'native';

/** 下拉里的全部条目：两个色相组合，加一条退回宿主的。`key` 是词典里的键名。 */
export const PALETTE_PRESETS = [
  ...HUE_PRESETS,
  { id: NATIVE_PRESET_ID, key: 'card.presetNative' },
] as const satisfies readonly { id: string; key: LocaleKey }[];

/**
 * 把一个色相收进 0…359：色相环上 360° 就是 0°，滑块的右端与左端是同一个颜色。
 * @param hue - 任意色相。
 * @returns 同一个颜色的规范角度。
 */
function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/**
 * 一对色相命中哪个预设；一个都没命中时返回 undefined。
 *
 * 这是「当前是自定义配色」的唯一判据，配置卡片与自检都走它。不要拿它去凑一个
 * 「最接近的预设」——手调过的色相不对应任何预设，说它对应某一个是谎话。
 * 「DSH 原生」不参与匹配：它由 `nativePalette` 这个开关决定，与色相无关。
 * @param hueLight - 浅色基础色相。
 * @param hueDark - 深色基础色相。
 * @returns 命中的预设，或 undefined。
 */
export function matchPreset(hueLight: number, hueDark: number): HuePreset | undefined {
  const light = normalizeHue(hueLight);
  const dark = normalizeHue(hueDark);
  return HUE_PRESETS.find(preset => normalizeHue(preset.light) === light && normalizeHue(preset.dark) === dark);
}

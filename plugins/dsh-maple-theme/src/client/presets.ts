/**
 * 配色预设：一次定下浅色与深色两个色相。
 *
 * 两个色相是成套的——只改一个会得到「暖白配冷灰」这种半套配色，
 * 所以切换预设走一次原子写入，而不是两次分开的字段写。
 *
 * 这些位置都有名字：35° 是 Maple 出厂值（暖白），207° 是它的深色出厂值（冷灰），
 * 其余几个覆盖日常会想要的方向。预设只换色相、不动明度，
 * 所以每一个的正文对比度都与出厂值持平（自检里有这一条）。
 */
export const PALETTE_PRESETS = [
  { id: 'maple', light: 35, dark: 207, key: 'card.presetMaple' },
  { id: 'lavender', light: 280, dark: 250, key: 'card.presetLavender' },
  { id: 'mint', light: 160, dark: 175, key: 'card.presetMint' },
  { id: 'forest', light: 110, dark: 140, key: 'card.presetForest' },
  { id: 'rose', light: 345, dark: 320, key: 'card.presetRose' },
  { id: 'steel', light: 210, dark: 215, key: 'card.presetSteel' },
] as const;

/**
 * Maple 两套调色板的令牌表：`--dsw-*` 名字 → 浅色 / 深色各一个值。
 *
 * 值里允许出现 `var(--maple-hue-light, 35)` 这类引用：宿主把这份表写到 `body` 的
 * 行内样式上，色相变量写在 `<html>` 上，行内样式按继承链解析得到，所以整套色板
 * 仍然由一个数字转动，而令牌本身走宿主的主题通道（不是另立一份全局主题）。
 *
 * 与 Maple 原版的偏差都在 `DETAILS.md`「与 Maple 原版的偏差」里写明；
 * 对比度由 scripts/test-tokens.mjs 读这份表自己算。
 */
/** 一条令牌在浅色与深色下各一个值；与宿主 `ThemeTokenOverrides` 的结构一致。 */
export type ThemeTokenOverrides = Record<string, { light: string; dark: string }>;

/** 本插件在主题通道里的来源名，与包名一致，便于在宿主里认出是谁改的。 */
export const THEME_SOURCE = '@lynn123411/dsh-maple-theme';

/**
 * 两套色板。浅色取 Maple 的暖白（基础色相 35°）、深色取冷灰（207°）。
 * 令牌名与宿主 `design-platform.css` 一致，换的是值，不是名字。
 */
export const MAPLE_TOKENS = {
  /* 宿主的 static 色阶里有几个纯灰被组件直接拿来当卡片头部的填充（`ChangedFiles`、
   * `Deliverables`、`PlanPreview`、`ScheduleCreateCard`）。纯灰在暖白底上会发冷，
   * 所以把这一档也按色相推导一遍。只动被这几处用到的那几档，不动整条色阶。 */
  '--dsw-static-neutral-50': { light: 'hsl(var(--maple-hue-light, 35) 12% 98%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 13%)' },
  '--dsw-static-neutral-100': { light: 'hsl(var(--maple-hue-light, 35) 12% 96%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-static-neutral-800': { light: 'hsl(var(--maple-hue-light, 35) 10% 30%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 17%)' },
  '--dsw-static-neutral-850': { light: 'hsl(var(--maple-hue-light, 35) 10% 26%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 14%)' },
  /* ---- 宿主定义、组件在用、本插件此前未覆盖的令牌 ---- */
  /* 层级再往上一档与文档预览底：取 Maple 的纸色，深色下比 layer-2 略亮。 */
  '--dsw-alias-bg-layer-3': { light: 'hsl(var(--maple-hue-light, 35) 14% 99%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 19%)' },
  '--dsw-alias-bg-document-preview': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 16%)' },
  '--dsw-alias-button-elevated-fill': { light: 'hsl(var(--maple-hue-light, 35) 14% 99%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 20%)' },
  '--dsw-alias-switch-thumb': { light: 'hsl(var(--maple-hue-light, 35) 20% 99%)', dark: 'hsl(var(--maple-hue-dark, 207) 20% 96%)' },
  '--dsw-alias-menu-group-header-fill': { light: 'hsl(var(--maple-hue-light, 35) 12% 97%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 14%)' },
  '--dsw-alias-turn-trigger-bg': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 16%)' },
  '--dsw-alias-turn-trigger-bg-hover': { light: 'hsl(var(--maple-hue-light, 35) 12% 93%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 20%)' },

  /* 幽灵按钮的激活态：底与描边都取 Maple 的控件级。 */
  '--dsw-alias-button-ghost-active-fill': { light: 'hsl(var(--maple-hue-light, 35) 14% 92%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 22%)' },
  '--dsw-alias-button-ghost-active-border': { light: 'hsl(var(--maple-hue-light, 35) 10% 60%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 55%)' },

  /* 深色浮层：提示与轻提示用比正文深一档的暖墨，不是宿主的冷蓝灰。 */
  '--dsw-alias-tooltip-bg': { light: 'hsl(var(--maple-hue-light, 35) 10% 23%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 30%)' },
  '--dsw-alias-toast-bg': { light: 'hsl(var(--maple-hue-light, 35) 10% 26%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 32%)' },
  '--dsw-alias-tooltip-key-bg': { light: 'hsl(var(--maple-hue-light, 35) 10% 36%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 42%)' },
  '--dsw-alias-tooltip-label': { light: 'hsl(var(--maple-hue-light, 35) 20% 97%)', dark: 'hsl(var(--maple-hue-dark, 207) 20% 97%)' },
  '--dsw-alias-toast-label': { light: 'hsl(var(--maple-hue-light, 35) 20% 97%)', dark: 'hsl(var(--maple-hue-dark, 207) 20% 97%)' },

  /* 遮罩与骨架：中性做法，只把冷蓝灰换成不带偏色的黑/白。 */
  '--dsw-alias-bg-mask-1': { light: 'rgba(0, 0, 0, 0.24)', dark: 'rgba(0, 0, 0, 0.5)' },
  '--dsw-alias-bg-mask-drop': { light: 'hsl(var(--maple-hue-light, 35) 14% 99% / 70%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 16% / 70%)' },
  '--dsw-alias-bg-skeleton': { light: 'hsl(var(--maple-hue-light, 35) 10% 20% / 4%)', dark: 'hsl(var(--maple-hue-dark, 207) 20% 90% / 6%)' },
  '--dsw-alias-bg-document-selection': { light: 'hsl(var(--maple-hue-light, 35) 60% 62% / 40%)', dark: 'hsl(var(--maple-hue-dark, 207) 50% 62% / 44%)' },
  '--dsw-alias-border-inverted': { light: 'rgba(0, 0, 0, 0)', dark: 'rgba(0, 0, 0, 0)' },
  '--dsw-alias-border-l2-darkmode-thin': { light: 'hsl(var(--maple-hue-light, 35) 10% 20% / 10%)', dark: 'hsl(var(--maple-hue-dark, 207) 20% 90% / 12%)' },

  /* 工具条按钮：压在正文上的半透明浮层，取 Maple 的暖墨。 */
  '--dsw-alias-button-tool-bar-fill': { light: 'hsl(var(--maple-hue-light, 35) 10% 35% / 50%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 70% / 30%)' },
  '--dsw-alias-button-tool-bar-hover': { light: 'hsl(var(--maple-hue-light, 35) 10% 35% / 62%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 70% / 42%)' },

  /* 危险悬停：红保持不变，只把底色调成 Maple 的红。 */
  '--dsw-alias-interactive-bg-hover-danger': { light: 'hsl(0 62% 46% / 7%)', dark: 'hsl(0 55% 68% / 12%)' },
  '--dsw-alias-button-contrast-fill': { light: 'hsl(var(--maple-hue-light, 35) 10% 32%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 86%)' },

  /* 状态色的次级与三级：色相沿用 Maple 的红/绿/琥珀，明度按层级取。 */
  '--dsw-alias-state-error-secondary': { light: 'hsl(0 45% 66%)', dark: 'hsl(0 44% 74%)' },
  '--dsw-alias-state-warn-label': { light: 'hsl(32 70% 37%)', dark: 'hsl(20 40% 68%)' },
  '--dsw-alias-state-warn-secondary': { light: 'hsl(32 70% 58%)', dark: 'hsl(20 45% 72%)' },
  '--dsw-alias-state-warn-tertiary': { light: 'hsl(32 70% 92%)', dark: 'hsl(20 30% 24%)' },
  '--dsw-alias-state-success-secondary': { light: 'hsl(95 60% 56%)', dark: 'hsl(130 32% 72%)' },
  '--dsw-alias-state-success-tertiary': { light: 'hsl(95 55% 92%)', dark: 'hsl(130 22% 24%)' },
  '--dsw-alias-state-idle-primary': { light: 'hsl(var(--maple-hue-light, 35) 8% 80%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 36%)' },

  /* 文件差异的增删底色：绿与红沿用 Maple 的语义色，底色取极浅一档。 */
  '--dsw-alias-code-diff-added': { light: 'hsl(95 60% 32% / 10%)', dark: 'hsl(130 35% 62% / 14%)' },
  '--dsw-alias-code-diff-deleted': { light: 'hsl(0 45% 46% / 10%)', dark: 'hsl(0 45% 70% / 14%)' },
  '--dsw-alias-file-diff-added-bg': { light: 'hsl(95 40% 94%)', dark: 'hsl(130 22% 17%)' },
  '--dsw-alias-file-diff-added-gutter': { light: 'hsl(95 40% 96%)', dark: 'hsl(130 22% 15%)' },
  '--dsw-alias-file-diff-added-marker': { light: 'hsl(95 75% 32%)', dark: 'hsl(130 35% 62%)' },
  '--dsw-alias-file-diff-deleted-bg': { light: 'hsl(0 45% 95%)', dark: 'hsl(0 30% 18%)' },
  '--dsw-alias-file-diff-deleted-gutter': { light: 'hsl(0 45% 97%)', dark: 'hsl(0 30% 16%)' },
  '--dsw-alias-file-diff-deleted-marker': { light: 'hsl(0 62% 44%)', dark: 'hsl(0 45% 68%)' },

  /* 预览与深潜文字：前者取 Maple 的三级文字，后者沿用宿主品牌的靛蓝。 */
  '--dsw-alias-label-document-preview': { light: 'hsl(var(--maple-hue-light, 35) 8% 35%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 70%)' },
  '--dsw-alias-label-deep-diving': { light: 'hsl(245 60% 50%)', dark: 'hsl(245 65% 74%)' },
  '--dsw-alias-label-deep-diving-shimmer': { light: 'hsl(245 60% 50% / 30%)', dark: 'hsl(245 65% 74% / 34%)' },

  /* 菜单材质归主题所有，但它的底是纯色时也该跟着配色。 */
  '--dsw-specific-menu': { light: 'hsl(var(--maple-hue-light, 35) 12% 97% / 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 16% / 94%)' },
  '--dsw-alias-bg-base': { light: 'hsl(var(--maple-hue-light, 35) 12% 97%)', dark: 'hsl(var(--maple-hue-dark, 207) 6% 11%)' },
  '--dsw-alias-bg-layer-1': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 13%)' },
  '--dsw-alias-bg-layer-2': { light: 'hsl(calc(var(--maple-hue-light, 35) - 18) 8% 93%)', dark: 'hsl(calc(var(--maple-hue-dark, 207) - 8) 6% 12%)' },
  '--dsw-alias-bg-overlay': { light: 'hsl(var(--maple-hue-light, 35) 10% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 14%)' },
  '--dsw-alias-bg-module-platform': { light: 'hsl(var(--maple-hue-light, 35) 13.2% 90.6%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 12.4%)' },
  '--dsw-alias-label-primary': { light: 'hsl(var(--maple-hue-light, 35) 10% 18%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88%)' },
  '--dsw-alias-label-secondary': { light: 'hsl(var(--maple-hue-light, 35) 8% 35%)', dark: 'hsl(var(--maple-hue-dark, 207) 16% 72%)' },
  '--dsw-alias-label-tertiary': { light: 'hsl(var(--maple-hue-light, 35) 7% 42%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 58%)' },
  '--dsw-alias-label-caption': { light: 'hsl(var(--maple-hue-light, 35) 6% 50%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 46%)' },
  '--dsw-alias-label-dimmed': { light: 'hsl(var(--maple-hue-light, 35) 8% 82%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 26%)' },
  '--dsw-alias-label-primary-dimmed': { light: 'hsl(var(--maple-hue-light, 35) 9% 27%)', dark: 'hsl(var(--maple-hue-dark, 207) 18% 80%)' },
  '--dsw-alias-label-primary-bluish': { light: 'hsl(var(--maple-hue-light, 35) 26% 38%)', dark: 'hsl(var(--maple-hue-dark, 207) 26% 72%)' },
  '--dsw-alias-label-primary-foreground': { light: 'hsl(var(--maple-hue-light, 35) 40% 96%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 9%)' },
  '--dsw-alias-label-primary-inverted': { light: 'hsl(var(--maple-hue-light, 35) 40% 96%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 13%)' },
  '--dsw-alias-label-shimmer': { light: 'hsl(var(--maple-hue-light, 35) 10% 18% / 30%)', dark: 'hsl(0 0% 100% / 45%)' },
  '--dsw-alias-link': { light: 'hsl(162 76% 29%)', dark: 'hsl(178 30% 62%)' },
  '--dsw-alias-brand-primary': { light: 'hsl(var(--maple-hue-light, 35) 26% 38%)', dark: 'hsl(var(--maple-hue-dark, 207) 26% 72%)' },
  '--dsw-alias-brand-text': { light: 'hsl(var(--maple-hue-light, 35) 10% 18%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88%)' },
  '--dsw-alias-state-business-primary': { light: 'hsl(var(--maple-hue-light, 35) 26% 38%)', dark: 'hsl(var(--maple-hue-dark, 207) 26% 72%)' },
  '--dsw-alias-state-business-tertiary': { light: 'hsl(var(--maple-hue-light, 35) 40% 88%)', dark: 'hsl(var(--maple-hue-dark, 207) 18% 22%)' },
  '--dsw-alias-state-error-primary': { light: 'hsl(0 45% 48%)', dark: 'hsl(0 44% 68%)' },
  '--dsw-alias-state-warn-primary': { light: 'hsl(32 70% 37%)', dark: 'hsl(20 40% 68%)' },
  '--dsw-alias-state-success-primary': { light: 'hsl(95 75% 29%)', dark: 'hsl(130 32% 68%)' },
  '--dsw-alias-border-l1': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 10%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 7%)' },
  '--dsw-alias-border-l2': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 16%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 13%)' },
  '--dsw-alias-border-l3': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 20%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 17%)' },
  '--dsw-alias-border-l4': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 26%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 22%)' },
  '--dsw-alias-bg-l1': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 15%)' },
  '--dsw-alias-bg-l2': { light: 'hsl(var(--maple-hue-light, 35) 12% 92%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 18%)' },
  '--dsw-alias-bg-layer-4': { light: 'hsl(var(--maple-hue-light, 35) 14% 98%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 16%)' },
  '--dsw-alias-fill-l1': { light: 'hsl(var(--maple-hue-light, 35) 12% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 17%)' },
  '--dsw-alias-fill-l2': { light: 'hsl(var(--maple-hue-light, 35) 14% 90%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 21%)' },
  '--dsw-alias-fill-tertiary': { light: 'hsl(var(--maple-hue-light, 35) 10% 91%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 19%)' },
  '--dsw-alias-fill-tsp-secondary': { light: 'hsl(var(--maple-hue-light, 35) 14% 92%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 20%)' },
  '--dsw-alias-label-error': { light: 'hsl(0 60% 42%)', dark: 'hsl(0 52% 68%)' },
  '--dsw-alias-label-quaternary': { light: 'hsl(var(--maple-hue-light, 35) 6% 50%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 52%)' },
  '--dsw-alias-separator-primary': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 16%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 13%)' },
  '--dsw-alias-interactive-bg-hover': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 7%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 8%)' },
  '--dsw-alias-interactive-bg-active': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 12%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 14%)' },
  '--dsw-alias-interactive-bg-hover-solid': { light: 'hsl(var(--maple-hue-light, 35) 12% 93%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 16%)' },
  /* 发送键读的是 button-info-fill，不是 button-primary-fill：宿主 InputBar 用它给那一枚圆钮上色，
   * 箭头是宿主自己写死的 #fff（不跟前景令牌）。这一对必须跟随色相，否则换过预设之后
   * 同一屏里「充值」跟着走、「发送」不跟着走。
   * 明度取 36% / 34%：色相环上每个角度压白字都过 4.5:1（最差 4.67:1，在 60°）。 */
  '--dsw-alias-button-info-fill': { light: 'hsl(var(--maple-hue-light, 35) 30% 36%)', dark: 'hsl(var(--maple-hue-dark, 207) 30% 34%)' },
  '--dsw-alias-button-info-hover': { light: 'hsl(var(--maple-hue-light, 35) 32% 30%)', dark: 'hsl(var(--maple-hue-dark, 207) 32% 40%)' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: 'hsl(var(--maple-hue-light, 35) 30% 42%)', dark: 'hsl(var(--maple-hue-dark, 207) 30% 66%)' },
  '--dsw-alias-button-primary-fill': { light: 'hsl(var(--maple-hue-light, 35) 30% 42%)', dark: 'hsl(var(--maple-hue-dark, 207) 30% 66%)' },
  '--dsw-alias-button-primary-hover': { light: 'hsl(var(--maple-hue-light, 35) 32% 34%)', dark: 'hsl(var(--maple-hue-dark, 207) 32% 76%)' },
  '--dsw-alias-button-floating-fill': { light: 'hsl(var(--maple-hue-light, 35) 14% 98.5%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-alias-button-floating-hover': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
  '--dsw-alias-markdown-code-block': { light: 'hsl(var(--maple-hue-light, 35) 10% 95%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 13%)' },
  '--dsw-alias-markdown-code-block-banner': { light: 'hsl(var(--maple-hue-light, 35) 13.2% 90.6%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-alias-markdown-inline-code': { light: 'hsl(var(--maple-hue-light, 35) 14% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-alias-markdown-tag': { light: 'hsl(var(--maple-hue-light, 35) 40% 88%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 20%)' },
  '--dsw-alias-markdown-citation': { light: 'hsl(var(--maple-hue-light, 35) 10% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 14%)' },
  '--dsw-alias-scrollbar-bg-l1': { light: 'hsl(var(--maple-hue-light, 35) 14% 84%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 25%)' },
  '--dsw-alias-scrollbar-hover-l1': { light: 'hsl(var(--maple-hue-light, 35) 18% 71%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 39%)' },
  '--dsw-alias-scrollbar-bg-l2': { light: 'hsl(var(--maple-hue-light, 35) 20% 78%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 32%)' },
  '--dsw-alias-scrollbar-hover-l2': { light: 'hsl(var(--maple-hue-light, 35) 18% 71%)', dark: 'hsl(var(--maple-hue-dark, 207) 10% 39%)' },
  '--dsw-alias-menu-icon': { light: 'hsl(var(--maple-hue-light, 35) 8% 35%)', dark: 'hsl(var(--maple-hue-dark, 207) 18% 80%)' },
  /* 侧栏是「桌面」，正文区是浮在上面的纸。这一档颜色取的是 Maple 在 Obsidian 里
   * **画出来**的结果，不是它写下的 --background-secondary 原值：那份原值（h-18、8%、93%）
   * 只是垫在卡片布局的渐变背景上的一层，实际看到的是它与渐变混合之后的颜色——
   * 更深一档、也更带色相。照原值取会得到一块发白的灰，与纸面分不开。 */
  '--dsw-specific-sidebar-fill': { light: 'hsl(calc(var(--maple-hue-light, 35) - 10) 17% 91%)', dark: 'hsl(calc(var(--maple-hue-dark, 207) + 2) 12% 16%)' },
  '--dsw-specific-sidebar-nav-item-active': { light: 'hsl(var(--maple-hue-light, 35) 28% 86%)', dark: 'hsl(var(--maple-hue-dark, 207) 16% 22%)' },
  '--dsw-specific-sidebar-nav-item-hover': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 8%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 8%)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: 'hsl(var(--maple-hue-light, 35) 40% 84%)', dark: 'hsl(var(--maple-hue-dark, 207) 18% 24%)' },
  '--dsw-specific-tip': { light: 'hsl(var(--maple-hue-light, 35) 18% 90%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 18%)' },
  '--dsw-specific-bubble': { light: 'hsl(var(--maple-hue-light, 35) 24% 93%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
  '--dsw-specific-bubble-highlight': { light: 'hsl(var(--maple-hue-light, 35) 30% 87%)', dark: 'hsl(var(--maple-hue-dark, 207) 16% 24%)' },
  '--dsw-specific-input-major': { light: 'hsl(var(--maple-hue-light, 35) 14% 98.5%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-specific-selector': { light: 'hsl(var(--maple-hue-light, 35) 14% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
} satisfies ThemeTokenOverrides;

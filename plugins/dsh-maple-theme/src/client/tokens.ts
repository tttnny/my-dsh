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
  '--dsw-alias-button-info-fill': { light: 'hsl(162 62% 30%)', dark: 'hsl(178 34% 34%)' },
  '--dsw-alias-button-info-hover': { light: 'hsl(162 62% 24%)', dark: 'hsl(178 34% 42%)' },
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
  '--dsw-specific-sidebar-fill': { light: 'hsl(calc(var(--maple-hue-light, 35) - 18) 8% 93%)', dark: 'hsl(calc(var(--maple-hue-dark, 207) - 8) 6% 12%)' },
  '--dsw-specific-sidebar-nav-item-active': { light: 'hsl(var(--maple-hue-light, 35) 26% 88%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
  '--dsw-specific-sidebar-nav-item-hover': { light: 'hsl(var(--maple-hue-light, 35) 26% 38% / 8%)', dark: 'hsl(var(--maple-hue-dark, 207) 24% 88% / 8%)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: 'hsl(var(--maple-hue-light, 35) 40% 84%)', dark: 'hsl(var(--maple-hue-dark, 207) 18% 24%)' },
  '--dsw-specific-tip': { light: 'hsl(var(--maple-hue-light, 35) 18% 90%)', dark: 'hsl(var(--maple-hue-dark, 207) 12% 18%)' },
  '--dsw-specific-bubble': { light: 'hsl(var(--maple-hue-light, 35) 24% 93%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
  '--dsw-specific-bubble-highlight': { light: 'hsl(var(--maple-hue-light, 35) 30% 87%)', dark: 'hsl(var(--maple-hue-dark, 207) 16% 24%)' },
  '--dsw-specific-input-major': { light: 'hsl(var(--maple-hue-light, 35) 14% 98.5%)', dark: 'hsl(var(--maple-hue-dark, 207) 8% 15%)' },
  '--dsw-specific-selector': { light: 'hsl(var(--maple-hue-light, 35) 14% 94%)', dark: 'hsl(var(--maple-hue-dark, 207) 14% 19%)' },
} satisfies ThemeTokenOverrides;

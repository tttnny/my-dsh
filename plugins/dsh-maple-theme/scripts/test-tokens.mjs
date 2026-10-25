/**
 * 配色自检：读 `src/client/tokens.ts` 里的两套令牌表，把每一对「文字放在底色上」算成
 * WCAG 对比度，低于阈值就红。
 *
 * 为什么要这一条：主题层写的是具体色值，改一个数不会让任何构建失败，只会让人读不清。
 * 阈值按 WCAG AA 取：正文 4.5:1、大字（标题、粗体大字）3:1、非文字的分隔线不查。
 * 深色的正文**不叠** Maple 原版的 15% 透明度，那条偏差的理由就写在这里。
 *
 * 跑法：pnpm test / node scripts/test-tokens.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const { PALETTE_PRESETS } = await import(join(root, 'src/client/presets.ts'));
const css = readFileSync(join(root, 'src/client/styles/tokens.css'), 'utf8');
const tokenSource = readFileSync(join(root, 'src/client/tokens.ts'), 'utf8');

let passed = 0;
let total = 0;
function test(label, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

/**
 * 用一组分量拼出一个 hsl() 字面量，供「换色相、不动明度」那类断言使用。
 * @param hue - 色相（度）。
 * @param saturation - 饱和度（百分比数值）。
 * @param lightness - 明度（百分比数值）。
 * @returns 可直接交给 {@link contrast} 的 hsl() 字符串。
 */
function hslLiteral(hue, saturation, lightness) {
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

/**
 * 从一条 hsl() 配方里取明度那个分量。
 * 配方里可能嵌着 `var(...)` 或 `calc(...)`，所以按最外层括号内的空白分段，取最后一段；
 * 不能用 `[^)]*?` 去啃，那会在内层 `)` 处停住，一个明度都取不到。
 * @param value - 一个 hsl() 颜色值。
 * @returns 明度数值（百分比，去掉符号）；取不到时返回 undefined。
 */
function lightnessOf(value) {
  const inner = /^hsl\((.+)\)$/.exec(value.trim());
  if (inner === null) return undefined;
  // 带 `/ a` 的半透明覆盖层，最后三段是「明度 / 透明度」，明度在倒数第二段。
  const parts = inner[1].trim().split(/\s+/);
  const last = parts.length >= 3 && parts[parts.length - 2] === '/'
    ? parts[parts.length - 3]
    : parts[parts.length - 1];
  const num = /\(?([\d.]+)%|^([\d.]+)%/.exec(last);
  return num === null ? undefined : Number(num[1] ?? num[2]);
}

/**
 * 把令牌表读成「令牌名 → 某一个模式的值」。
 * 每条的形状是 `'--dsw-…': { light: '…', dark: '…' },`，所以按模式各收一份。
 * @param mode - `light` 或 `dark`。
 * @returns 该模式下所有令牌的值。
 */
function palette(mode) {
  const vars = {};
  for (const match of tokenSource.matchAll(/'(--dsw-[a-z0-9-]+)':\s*\{([^}]*)\}/g)) {
    const value = new RegExp(`${mode}:\\s*'([^']*)'`).exec(match[2]);
    if (value !== null) vars[match[1]] = value[1];
  }
  return vars;
}

/** 取一个变量在指定模式下的值，展开 `var(--x, fallback)` 与 fallback 里那一串。 */
function resolveVar(vars, name, seen = new Set()) {
  assert.ok(!seen.has(name), `变量 ${name} 的引用成环`);
  seen.add(name);
  const raw = vars[name];
  if (raw === undefined) return undefined;
  const nested = /^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/.exec(raw.trim());
  if (nested === null) return raw.trim();
  const inner = resolveVar(vars, nested[1], seen);
  return inner ?? (nested[2] === undefined ? undefined : nested[2].trim());
}

/**
 * 把色相里的变量换成它的兜底值：样式表写的是 `hsl(var(--maple-hue-light, 35) 12% 97%)`，
 * 也就是「配置页没给值时用 35」，所以按兜底值算是这一层的出厂样子。
 * `calc(var(--maple-hue-light, 35) - 18)` 这种偏移也要能算。
 * @param value - 一个 CSS 颜色值。
 * @returns 变量已换掉的同形字符串。
 */
function inlineFallbacks(value) {
  return value
    .replace(/var\(--maple-hue-light,\s*(-?[\d.]+)\)/g, '$1')
    .replace(/var\(--maple-hue-dark,\s*(-?[\d.]+)\)/g, '$1')
    .replace(/calc\((-?[\d.]+)\s*-\s*([\d.]+)\)/g, (_m, a, b) => String(Number(a) - Number(b)));
}

/** 把 hsl(h s% l% / a) 或 hsl(h s% l%) 求值成 rgb（忽略 alpha，按最坏情况算）。 */
function hslaToRgb(value) {
  const match = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/i.exec(inlineFallbacks(value).trim());
  assert.notEqual(match, null, `认不出的颜色值：${value}`);
  const h = Number(match[1]) / 360;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const hue = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
    .map((channel) => Math.round(channel * 255));
}

/** 相对亮度（WCAG 2.1 的公式）。 */
function luminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 两个已算好的 rgb 三元组的对比度。 */
function contrastRgb(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** 两色的对比度。 */
function contrast(foreground, background) {
  return contrastRgb(hslaToRgb(foreground), hslaToRgb(background));
}

const light = palette('light');
const dark = palette('dark');

/**
 * 断言某个前景色在某个底色上达到阈值。
 * @param vars - 该模式的变量表。
 * @param label - 报错时用的名字。
 * @param foreground - 前景变量名。
 * @param background - 背景变量名。
 * @param minimum - 阈值。
 */
function assertContrast(vars, label, foreground, background, minimum) {
  const fg = resolveVar(vars, foreground);
  const bg = resolveVar(vars, background);
  assert.notEqual(fg, undefined, `缺变量 ${foreground}`);
  assert.notEqual(bg, undefined, `缺变量 ${background}`);
  const ratio = contrast(fg, bg);
  assert.ok(
    ratio >= minimum,
    `${label}：${foreground} (${fg}) 在 ${background} (${bg}) 上只有 ${ratio.toFixed(2)}:1，要求 ${minimum}:1`,
  );
  return ratio;
}

const report = [];

test('浅色：正文与三个层级的辅助文字都达到 AA', () => {
  report.push(['light label-primary', assertContrast(light, '浅色正文', '--dsw-alias-label-primary', '--dsw-alias-bg-base', 4.5)]);
  report.push(['light label-secondary', assertContrast(light, '浅色次要文字', '--dsw-alias-label-secondary', '--dsw-alias-bg-base', 4.5)]);
  report.push(['light label-tertiary', assertContrast(light, '浅色三级文字', '--dsw-alias-label-tertiary', '--dsw-alias-bg-base', 4.5)]);
});

test('深色：正文与三个层级的辅助文字都达到 AA', () => {
  report.push(['dark label-primary', assertContrast(dark, '深色正文', '--dsw-alias-label-primary', '--dsw-alias-bg-base', 4.5)]);
  report.push(['dark label-secondary', assertContrast(dark, '深色次要文字', '--dsw-alias-label-secondary', '--dsw-alias-bg-base', 4.5)]);
  report.push(['dark label-tertiary', assertContrast(dark, '深色三级文字', '--dsw-alias-label-tertiary', '--dsw-alias-bg-base', 4.5)]);
});

test('链接色两套都达到 AA（Maple 原版的浅色强调色不达标）', () => {
  report.push(['light link', assertContrast(light, '浅色链接', '--dsw-alias-link', '--dsw-alias-bg-base', 4.5)]);
  report.push(['dark link', assertContrast(dark, '深色链接', '--dsw-alias-link', '--dsw-alias-bg-base', 4.5)]);
});

test('主按钮文字压在强调色上仍然读得清（AA 大字）', () => {
  report.push(['light button', assertContrast(light, '浅色主按钮', '--dsw-alias-label-primary-foreground', '--dsw-alias-brand-primary', 3)]);
  report.push(['dark button', assertContrast(dark, '深色主按钮', '--dsw-alias-label-primary-foreground', '--dsw-alias-brand-primary', 3)]);
});

test('发送按钮的白色图标压在填充色上达到 AA（宿主写死 #fff，不跟前景令牌）', () => {
  const fgs = [[255, 255, 255], [255, 255, 255]];
  const pairs = [
    ['浅色发送按钮', resolveVar(light, '--dsw-alias-button-info-fill'), fgs[0]],
    ['深色发送按钮', resolveVar(dark, '--dsw-alias-button-info-fill'), fgs[1]],
  ];
  for (const [label, fill, white] of pairs) {
    const ratio = contrastRgb(hslaToRgb(fill), white);
    assert.ok(ratio >= 4.5, `${label}：${fill} 与白色只有 ${ratio.toFixed(2)}:1，要求 4.5:1`);
  }
});

test('代码块与行内代码的背景与正文对比够（AA 大字）', () => {
  report.push(['light code block', assertContrast(light, '浅色代码块', '--dsw-alias-label-primary', '--dsw-alias-markdown-code-block', 4.5)]);
  report.push(['dark code block', assertContrast(dark, '深色代码块', '--dsw-alias-label-primary', '--dsw-alias-markdown-code-block', 4.5)]);
});

test('侧栏与提示框上的文字也达到 AA（它们是独立的底色）', () => {
  report.push(['light sidebar text', assertContrast(light, '浅色侧栏正文', '--dsw-alias-label-primary', '--dsw-specific-sidebar-fill', 4.5)]);
  report.push(['dark sidebar text', assertContrast(dark, '深色侧栏正文', '--dsw-alias-label-primary', '--dsw-specific-sidebar-fill', 4.5)]);
  report.push(['light tip text', assertContrast(light, '浅色提示框', '--dsw-alias-label-primary', '--dsw-specific-tip', 4.5)]);
  report.push(['dark tip text', assertContrast(dark, '深色提示框', '--dsw-alias-label-primary', '--dsw-specific-tip', 4.5)]);
  report.push(['light bubble text', assertContrast(light, '浅色气泡', '--dsw-alias-label-primary', '--dsw-specific-bubble', 4.5)]);
  report.push(['dark bubble text', assertContrast(dark, '深色气泡', '--dsw-alias-label-primary', '--dsw-specific-bubble', 4.5)]);
});

test('两种模式的底色与正文色不是同一个值（避免「看起来没换主题」）', () => {
  const bgLight = resolveVar(light, '--dsw-alias-bg-base');
  const bgDark = resolveVar(dark, '--dsw-alias-bg-base');
  assert.notEqual(bgLight, bgDark);
  const textLight = resolveVar(light, '--dsw-alias-label-primary');
  const textDark = resolveVar(dark, '--dsw-alias-label-primary');
  assert.notEqual(textLight, textDark);
});

test('浅色是暖调、深色是冷调：基础色相分居色环两侧', () => {
  // 样式表里的色相走 `var(--maple-hue-light, 35)`：默认值必须与插件出厂值一致。
  assert.match(resolveVar(light, '--dsw-alias-bg-base'), /--maple-hue-light, 35/);
  assert.match(resolveVar(dark, '--dsw-alias-bg-base'), /--maple-hue-dark, 207/);
});

test('标题六色两套都达到 AA 大字阈值', () => {
  const colorful = /\[data-maple-heading='colorful'\]\s*\{([^}]*)\}/.exec(css);
  assert.notEqual(colorful, null, '找不到标题六色的浅色块');
  const colorfulDark = /\[data-maple-heading='colorful'\]\s*body\[data-ds-dark-theme\]\s*\{([^}]*)\}/.exec(css);
  assert.notEqual(colorfulDark, null, '找不到标题六色的深色块');
  const read = (source) => {
    const vars = {};
    for (const line of source.split(';')) {
      const at = line.indexOf(':');
      if (at > 0 && line.trimStart().startsWith('--')) vars[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return vars;
  };
  const headingLight = read(colorful[1]);
  const headingDark = read(colorfulDark[1]);
  const bgLight = resolveVar(light, '--dsw-alias-bg-base');
  const bgDark = resolveVar(dark, '--dsw-alias-bg-base');
  for (const level of ['--maple-h1', '--maple-h2', '--maple-h3', '--maple-h4', '--maple-h5', '--maple-h6']) {
    const ratioLight = contrast(headingLight[level], bgLight);
    // h5/h6 的字号降到了正文量级，所以这六级统一按 4.5 守。
    assert.ok(ratioLight >= 4.5, `浅色 ${level} 行只有 ${ratioLight.toFixed(2)}:1，要求 4.5:1`);
    const ratioDark = contrast(headingDark[level], bgDark);
    assert.ok(ratioDark >= 4.5, `深色 ${level} 行只有 ${ratioDark.toFixed(2)}:1，要求 4.5:1`);
  }
});

test('caption 一档只用于装饰性文字：正文与三级文字都不许退到这一档', () => {
  for (const [label, vars] of [['浅色', light], ['深色', dark]]) {
    const caption = resolveVar(vars, '--dsw-alias-label-caption');
    for (const role of ['--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary']) {
      assert.notEqual(resolveVar(vars, role), caption, `${label} ${role} 退成了 caption 一档`);
    }
  }
});

test('三种标题配色各有自己的声明，且「强调色」与「正文色」不是同一个值', () => {
  for (const mode of ['colorful', 'accent', 'text']) {
    assert.match(
      css,
      new RegExp(`\\[data-maple-heading='${mode}'\\]\\s*\\{`),
      `标题配色 ${mode} 在浅色下没有声明`,
    );
    assert.match(
      css,
      new RegExp(`\\[data-maple-heading='${mode}'\\]\\s*body\\[data-ds-dark-theme\\]\\s*\\{`),
      `标题配色 ${mode} 在深色下没有声明`,
    );
  }
  // 强调色与正文色若取同一个值，配置页上那两档就分不出来，等于少了一档。
  const accentLight = /\[data-maple-heading='accent'\]\s*\{([^}]*)\}/.exec(css);
  const textLight = /\[data-maple-heading='text'\]\s*\{([^}]*)\}/.exec(css);
  assert.notEqual(accentLight, null);
  assert.notEqual(textLight, null);
  const value = (block) => /--maple-heading-color:\s*([^;]+);/.exec(block[1])?.[1]?.trim();
  assert.notEqual(value(accentLight), undefined, '强调色一档没声明 --maple-heading-color');
  assert.notEqual(value(textLight), undefined, '正文色一档没声明 --maple-heading-color');
  assert.notEqual(value(accentLight), value(textLight), '强调色与正文色取了同一个值');
});

test('六级标题的两种单色模式都逐级挂到了元素上', () => {
  const markdown = readFileSync(join(root, 'src/client/styles/markdown.css'), 'utf8');
  for (const mode of ['accent', 'text']) {
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      assert.match(
        markdown,
        new RegExp(`\\[data-maple-heading='${mode}'\\][^{]*:where\\(${level}\\)`),
        `${mode} 模式没给 ${level} 挂颜色`,
      );
    }
  }
});

test('每条令牌的配方都是一个真颜色，不是空串或认不出的写法', () => {
  // 令牌写错一个字符不会让任何构建失败，只会让那一处界面静默变回宿主原色。
  // 这里只做形状校验：每条的浅色与深色都必须是 hsl() 开头、括号配平、分量齐全的值。
  for (const [mode, vars] of [['浅色', light], ['深色', dark]]) {
    for (const [name, value] of Object.entries(vars)) {
      assert.match(value, /^hsl\(/, `${mode} ${name} 不是一个 hsl() 值：${value}`);
      assert.equal(
        (value.match(/\(/g) ?? []).length,
        (value.match(/\)/g) ?? []).length,
        `${mode} ${name} 的括号不配平：${value}`,
      );
      assert.doesNotMatch(value, /undefined|NaN|\[object/, `${mode} ${name} 里混进了非法值：${value}`);
    }
  }
});

/**
 * 宿主组件引用、但 `design-platform.css` 里没有定义的令牌。
 * 这些位置在宿主里本来就无色（`var()` 落到空值），只有主题补上才会显示，
 * 主题不补就一直是空的。清单随宿主演进，这里钉住的是「补了没有」。
 */
const HOST_USED_UNDEFINED = [
  '--dsw-alias-bg-l1',
  '--dsw-alias-bg-l2',
  '--dsw-alias-bg-layer-4',
  '--dsw-alias-fill-l1',
  '--dsw-alias-fill-l2',
  '--dsw-alias-fill-tertiary',
  '--dsw-alias-fill-tsp-secondary',
  '--dsw-alias-label-error',
  '--dsw-alias-label-quaternary',
  '--dsw-alias-separator-primary',
];

test('名字里带 fill / bg 的令牌是背景，明度必须在浅色里偏亮、深色里偏暗', () => {
  // 这条挡的是「把背景令牌当文字色给」：fill 类令牌铺在文字底下，
  // 给它一个深色就是一块压不住的色块（会话头部的预设标签就这样冒出来过一块棕色）。
  const offenders = [];
  for (const [name, value] of Object.entries(light)) {
    if (!/-(fill|bg)[-a-z0-9]*$/.test(name)) continue;
    // 这几类不按「背景板」判：
    // 按钮填充是深色底配浅色字，本来就该深；
    // interactive-* 与 scrollbar-* 是叠在别处之上的覆盖层或滑块，不是底板。
    if (name.includes('button-')) continue;
    if (name.includes('interactive-')) continue;
    if (name.includes('scrollbar-')) continue;
    if (name.includes('interactive-')) continue;
    if (name.includes('scrollbar-')) continue;
    const l = lightnessOf(value);
    if (l === undefined) offenders.push(`浅色 ${name} 的明度取不出来：${value}`);
    else if (l < 80) offenders.push(`浅色 ${name} 的明度只有 ${l}%`);
  }
  for (const [name, value] of Object.entries(dark)) {
    if (!/-(fill|bg)[-a-z0-9]*$/.test(name)) continue;
    // 这几类不按「背景板」判：
    // 按钮填充是深色底配浅色字，本来就该深；
    // interactive-* 与 scrollbar-* 是叠在别处之上的覆盖层或滑块，不是底板。
    if (name.includes('button-')) continue;
    if (name.includes('interactive-')) continue;
    if (name.includes('scrollbar-')) continue;
    const l = lightnessOf(value);
    if (l === undefined) offenders.push(`深色 ${name} 的明度取不出来：${value}`);
    else if (l > 40) offenders.push(`深色 ${name} 的明度到了 ${l}%`);
  }
  assert.deepEqual(offenders, [], offenders.join('；'));
});

test('宿主用了却没自己定义的令牌，插件都补上了', () => {
  const missing = HOST_USED_UNDEFINED.filter((name) => !(name in light) || !(name in dark));
  assert.deepEqual(missing, [], `这些令牌宿主在用但没定义，插件也没补：${missing.join('、')}`);
});

test('补上的错误色与标注级文字也过 AA', () => {
  report.push(['light label-error', assertContrast(light, '浅色错误色', '--dsw-alias-label-error', '--dsw-alias-bg-base', 4.5)]);
  report.push(['dark label-error', assertContrast(dark, '深色错误色', '--dsw-alias-label-error', '--dsw-alias-bg-base', 4.5)]);
});

test('代码块的九个语法色在自己那块底色上都过 4.5:1', () => {
  // 语法色是小字号等宽的，4.5:1 才读得清；注释与标点最容易漏。
  const backgrounds = {
    light: 'hsl(var(--maple-hue-light, 35) 10% 95%)',
    dark: 'hsl(var(--maple-hue-dark, 207) 10% 13%)',
  };
  const markers = {
    light: "html[data-maple-theme='on'][data-maple-code='on'] {",
    dark: "html[data-maple-theme='on'][data-maple-code='on'] body[data-ds-dark-theme] {",
  };
  for (const mode of ['light', 'dark']) {
    const at = css.indexOf(markers[mode]);
    assert.notEqual(at, -1, `找不到 ${mode} 的语法色块`);
    const block = css.slice(css.indexOf('{', at) + 1, css.indexOf('\n}', at));
    const entries = [...block.matchAll(/--shiki-token-([a-z-]+):\s*(hsl\([^;]+\));/g)];
    assert.ok(entries.length >= 9, `${mode} 语法色只找到 ${entries.length} 条`);
    for (const [, name, value] of entries) {
      const ratio = contrast(inlineFallbacks(value), inlineFallbacks(backgrounds[mode]));
      assert.ok(ratio >= 4.5, `${mode} 语法色 ${name} 在代码块底色上只有 ${ratio.toFixed(2)}:1，要求 4.5:1`);
    }
  }
});

test('被组件直接拿来当填充的四档静态灰也带色相', () => {
  // 宿主有四个组件（ChangedFiles / Deliverables / PlanPreview / ScheduleCreateCard）
  // 直接用 --dsw-static-neutral-* 当卡片头部填充。纯灰在暖白底上会发冷。
  const warmed = ['--dsw-static-neutral-50', '--dsw-static-neutral-100', '--dsw-static-neutral-800', '--dsw-static-neutral-850'];
  for (const name of warmed) {
    assert.ok(name in light, `缺少 ${name}`);
    assert.ok(name in dark, `深色缺少 ${name}`);
    for (const [mode, vars] of [['浅色', light], ['深色', dark]]) {
      const rgb = hslaToRgb(inlineFallbacks(vars[name]));
      assert.ok(new Set(rgb).size > 1, `${mode}的 ${name} 是纯灰 ${rgb.join(',')}，应当带色相`);
    }
  }
});

test('滚动条的三个令牌都在，悬停色带 Maple 的暖调而不是灰色', () => {
  // 宿主默认的悬停色取 scrollbar-hover-l1；只覆盖 l2 不会生效（l2 只有少数面板用）。
  for (const name of ['--dsw-alias-scrollbar-bg-l1', '--dsw-alias-scrollbar-hover-l1', '--dsw-alias-scrollbar-bg-l2']) {
    assert.ok(name in light, `缺少 ${name}`);
    assert.ok(name in dark, `深色缺少 ${name}`);
  }
  // 暖调意味着三个分量不完全相等（灰色的 R=G=B）。
  for (const [mode, vars] of [['浅色', light], ['深色', dark]]) {
    const rgb = hslaToRgb(inlineFallbacks(vars['--dsw-alias-scrollbar-hover-l1']));
    assert.ok(
      new Set(rgb).size > 1,
      `${mode}的滚动条悬停色是纯灰 ${rgb.join(',')}，应当带 Maple 的色相`,
    );
  }
});

test('预设表自身自洽：六个、id 不重、色相在合法范围内', () => {
  assert.equal(PALETTE_PRESETS.length, 6, `预设表里有 ${PALETTE_PRESETS.length} 个`);
  const ids = PALETTE_PRESETS.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length, `预设 id 有重复：${ids.join('、')}`);
  for (const preset of PALETTE_PRESETS) {
    for (const [side, hue] of [['浅色', preset.light], ['深色', preset.dark]]) {
      assert.ok(
        Number.isInteger(hue) && hue >= 0 && hue <= 360,
        `预设 ${preset.id} 的${side}色相 ${hue} 不在 0…360 里`,
      );
    }
  }
});

test('配置页的六个预设，两套模式的正文对比度都过 AA', () => {
  // 预设只换色相、不动明度，所以对比度本应与 Maple 出厂值持平；
  // 这条挡的是「哪天有人给某个预设单独调了明度」——那会悄悄破坏可读性。
  for (const preset of PALETTE_PRESETS) {
    const { id: name, light: lightHue, dark: darkHue } = preset;
    for (const [mode, hue, fgS, fgL, bgS, bgL] of [
      ['浅色', lightHue, 10, 18, 12, 97],
      ['深色', darkHue, 24, 88, 6, 11],
    ]) {
      const ratio = contrast(hslLiteral(hue, fgS, fgL), hslLiteral(hue, bgS, bgL));
      assert.ok(ratio >= 4.5, `${name}·${mode} 的正文只有 ${ratio.toFixed(2)}:1，要求 4.5:1`);
    }
  }
});

test('每一个 --dsw-alias-* / --dsw-specific-* 都在两套里各写了一次', () => {
  const lightNames = Object.keys(light).sort();
  const darkNames = Object.keys(dark).sort();
  assert.deepEqual(darkNames, lightNames, '两套配色的令牌集不一致');
  assert.ok(lightNames.length >= 45, `令牌只有 ${lightNames.length} 条，少得不正常`);
});

for (const [label, ratio] of report) console.log(`        ${label.padEnd(20)} ${ratio.toFixed(2)}:1`);
console.log(`${passed}/${total} passed`);

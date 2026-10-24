/**
 * 配色自检：直接读 `src/client/styles/tokens.css`，把里面每一对「文字放在底色上」算成
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
const css = readFileSync(join(root, 'src/client/styles/tokens.css'), 'utf8');

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
 * 把一份 CSS 的一个规则块读成「变量名 → 值」。
 * 按字符串定位大括号，不拼正则：选择器里有 `[` `]` 与 `-`，拼进正则很容易被转义坑到。
 * @param selector - 块的选择器原文（例如 `body[data-ds-dark-theme]`）。
 * @returns 该块里声明的自定义变量。
 */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `找不到选择器 ${selector} 的规则块`);
  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('\n}', bodyStart);
  assert.notEqual(bodyEnd, -1, `选择器 ${selector} 的规则块没有闭合`);
  const vars = {};
  for (const line of css.slice(bodyStart, bodyEnd).split(';')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    const name = line.slice(0, at).trim();
    if (!name.startsWith('--')) continue;
    vars[name] = line.slice(at + 1).trim();
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

const light = block('body');
const dark = block('body[data-ds-dark-theme]');

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

test('每一个 --dsw-alias-* / --dsw-specific-* 都在两套里各写了一次', () => {
  const lightNames = Object.keys(light).sort();
  const darkNames = Object.keys(dark).sort();
  assert.deepEqual(darkNames, lightNames, '两套配色的令牌集不一致');
  assert.ok(lightNames.length >= 45, `令牌只有 ${lightNames.length} 条，少得不正常`);
});

for (const [label, ratio] of report) console.log(`        ${label.padEnd(20)} ${ratio.toFixed(2)}:1`);
console.log(`${passed}/${total} passed`);

/**
 * 配色自检：本插件不拥有任何颜色，所以这里查的不是「色值好不好看」，而是两件事——
 *
 *   1. 正文层一个色值都没写死：所有颜色必须是 var(--dsw-*) 或由它们混出来的。
 *      写死一个 hsl(...)，宿主的深浅两套主题就会在那一条上失灵。
 *   2. 标题六档的蓝阶在宿主的两套纸面上都读得清。端点取自宿主的 --dsw-static-deepseek-*，
 *      中间的档由 color-mix 插值，插值后的明度落在两端之间，所以两端过 4.5:1 就够了。
 *
 * 跑法：pnpm test / node scripts/test-tokens.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const tokensCss = readFileSync(join(root, 'src/client/styles/tokens.css'), 'utf8');
const markdownCss = readFileSync(join(root, 'src/client/styles/markdown.css'), 'utf8');

let passed = 0;
let total = 0;
function test(label, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + ': ' + error.message);
    throw error;
  }
}

/** 宿主蓝阶与纸面的取值，抄自 dsh-client-ui-theme。只用来算对比度，不参与样式。 */
const HOST = {
  light: { paper: '#ffffff', strong: '#1e40af', soft: '#2563eb' },
  dark: { paper: '#151517', strong: '#93c5fd', soft: '#3b82f6' },
};

/** 相对亮度（WCAG 2.1 的公式）。 */
function luminance(hex) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** 两色的对比度。 */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 把一份样式表的注释剥掉：说明文字里会出现颜色名，不能算进色值扫描。 */
function strip(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('正文层没有写死任何色值', () => {
  const offenders = [];
  for (const [file, css] of [['tokens.css', tokensCss], ['markdown.css', markdownCss]]) {
    for (const match of strip(css).matchAll(/(color|background(-color)?|border(-[a-z]+)?-color|outline-color|accent-color)\s*:\s*([^;]+);/g)) {
      const value = match[4].trim();
      if (/^(none|inherit|transparent|currentColor)$/i.test(value)) continue;
      if (/hsla?\(|rgba?\(|#[0-9a-fA-F]{3,8}/.test(value) && !value.includes('var(--')) offenders.push(file + ': ' + value.slice(0, 60));
    }
  }
  assert.deepEqual(offenders, [], '这些颜色没有跟随宿主的令牌：' + offenders.join(' | '));
});

test('标题的六个档位都取 --np-* 变量，不是逐级写色值', () => {
  for (let level = 1; level <= 6; level += 1) {
    assert.match(tokensCss, new RegExp('--np-h' + level + ': '), '缺 --np-h' + level);
    assert.match(
      markdownCss,
      new RegExp(':where\\(h' + level + '\\) \\{ color: var\\(--np-h' + level + '\\)'),
      'h' + level + ' 没用 var(--np-h' + level + ')',
    );
  }
});

test('两套模式的蓝阶端点都是宿主的蓝阶令牌', () => {
  assert.match(tokensCss, /--np-heading-strong: var\(--dsw-static-blue-800\)/);
  assert.match(tokensCss, /--np-heading-soft: var\(--dsw-static-blue-600\)/);
  assert.match(tokensCss, /body\[data-ds-dark-theme\][\s\S]*--np-heading-strong: var\(--dsw-static-blue-300\)/);
  assert.match(tokensCss, /body\[data-ds-dark-theme\][\s\S]*--np-heading-soft: var\(--dsw-static-blue-500\)/);
});

test('浅色下最深与最浅两档标题都过 4.5:1', () => {
  const { paper, strong, soft } = HOST.light;
  const deep = contrast(strong, paper);
  const shallow = contrast(soft, paper);
  assert.ok(deep >= 4.5, 'h1 只有 ' + deep.toFixed(2) + ':1');
  assert.ok(shallow >= 4.5, 'h6 只有 ' + shallow.toFixed(2) + ':1');
  console.log('        浅色 h1 ' + deep.toFixed(2) + ':1 · h6 ' + shallow.toFixed(2) + ':1');
});

test('深色下最深与最浅两档标题都过 4.5:1', () => {
  const { paper, strong, soft } = HOST.dark;
  const bright = contrast(strong, paper);
  const dimmest = contrast(soft, paper);
  assert.ok(bright >= 4.5, 'h1 只有 ' + bright.toFixed(2) + ':1');
  assert.ok(dimmest >= 4.5, 'h6 只有 ' + dimmest.toFixed(2) + ':1');
  console.log('        深色 h1 ' + bright.toFixed(2) + ':1 · h6 ' + dimmest.toFixed(2) + ':1');
});

test('六档的插值步长均匀，逐级之间拉得开', () => {
  const steps = [
    '--np-h1: var(--np-heading-strong)',
    '80%',
    '60%',
    '40%',
    '20%',
    '--np-h6: var(--np-heading-soft)',
  ];
  for (const step of steps) assert.ok(tokensCss.includes(step), '缺插值步长 ' + step);
});

test('正文纸面与线都从宿主令牌出发', () => {
  for (const name of ['--np-tint-weak', '--np-tint-strong', '--np-hairline', '--np-rule', '--np-inline-code-bg']) {
    assert.match(tokensCss, new RegExp(name + ': color-mix\\(in srgb, var\\(--dsw-'), name + ' 不是从宿主令牌混出来的');
  }
  assert.match(tokensCss, /--np-code-block: var\(--dsw-alias-markdown-code-block\)/);
  assert.match(tokensCss, /--np-code-banner: var\(--dsw-alias-markdown-code-block-banner\)/);
});

console.log(passed + '/' + total + ' passed');
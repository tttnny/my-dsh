/**
 * 锚点契约自检：把三张样式表里用到的宿主钩子挑出来，逐个证明「宿主今天确实还在发它们」。
 *
 * 为什么要有这一条：配色与装饰全靠宿主那几样不带哈希的钩子——`data-slot`、`data-chat-flow-kind`、
 * `md-code-block`、`data-composer-card`、`data-conversation-tabs`、`data-row-key`。宿主是内部依赖，
 * 这些名字**不是公开契约**。它哪天改名，样式不会报错，只会静默不生效：页面看着「就是没变」，
 * 而构建、类型检查、其余自检全绿。所以这里直接去宿主源码里查名字还在不在，顺便确认样式表
 * 没有偷偷用上 CSS Modules 的哈希类名。
 *
 * 查的是**宿主的源码**（路径由 tools/lib/dsh-source.mjs 找，也可以 --source 给），不是运行中的页面：
 * 这一条要能在 CI 与本机之外的地方跑，不依赖有一个 DSH 实例开着。
 *
 * 跑法：pnpm test / node scripts/test-anchors.mjs
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

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

/** 三张样式表的全文，按文件名索引。 */
const sheets = Object.fromEntries(
  ['tokens.css', 'markdown.css', 'shell.css'].map((file) => [
    file,
    readFileSync(join(root, 'src/client/styles', file), 'utf8'),
  ]),
);

/**
 * 从样式表里挑出所有属性选择器的名字。
 * 只认 `[data-…` 与 `[aria-…`：主题层的令牌块没有属性选择器，装饰层才有。
 * @param css - 一份样式表。
 * @returns 用到的属性名集合。
 */
function attributeNames(css) {
  const names = new Set();
  for (const match of css.matchAll(/\[(data-[a-z-]+|aria-[a-z-]+)/g)) names.add(match[1]);
  return names;
}

const shellAttributes = attributeNames(sheets['shell.css']);
const markdownAttributes = attributeNames(sheets['markdown.css']);

test('样式表里没有 CSS Modules 的哈希类名（一出现就说明抄了宿主内部实现）', () => {
  for (const [file, css] of Object.entries(sheets)) {
    // 哈希类名的形状是「五六个混合字符 + 下划线 + 名字」，例如 `_markdown_1ypvv_5`、`pI_x6G_frame`。
    const hashed = [...css.matchAll(/\.(_?[A-Za-z0-9-]{5,}_[A-Za-z0-9]+)/g)].map((match) => match[1]);
    assert.deepEqual(hashed, [], `${file} 里出现了哈希类名：${hashed.join('、')}`);
  }
});

test('装饰层与外壳层只挂在自己的根属性下面（关掉就整段不匹配）', () => {
  // 逐条规则看选择器：把注释与 at-rule 剥掉，剩下的每个 `选择器 { … }` 都必须以根属性开头。
  const offenders = [];
  for (const file of ['markdown.css', 'shell.css']) {
    const css = sheets[file].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const selector = rule[1].trim();
      if (selector === '' || selector.startsWith('@')) continue;
      if (!selector.startsWith("html[data-maple-theme='on']")) offenders.push(`${file}: ${selector.slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], `这些规则没挂在根属性下：${offenders.join(' | ')}`);
});

test('段落间距落在 p 的 margin 上（宿主就是用它给段落分段的）', () => {
  const markdown = sheets['markdown.css'];
  // 宿主给 `.markdown p` 写的是 `margin: 16px 0`；跟着改 margin 才生效。
  // 中间那层容器是 block 不是 flex，给它 gap 不会产生任何间距。
  assert.match(
    markdown,
    /:where\(p\)\s*\{[^}]*margin:\s*var\(--maple-p-gap/,
    '段距没有落在 p 的 margin 上',
  );
  assert.doesNotMatch(
    markdown,
    /gap:\s*var\(--maple-p-gap/,
    '段距又写回了容器的 gap——那一层是 block，gap 不产生间距',
  );
});

test('文档里写死的数字与实际一致', () => {
  // 这几处数字改一次代码就会过期一次，写进自检比靠人记可靠。
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const details = readFileSync(join(root, 'DETAILS.md'), 'utf8');
  const host = readFileSync(join(root, 'src/index.ts'), 'utf8');
  const card = readFileSync(join(root, 'src/client/card.tsx'), 'utf8');
  const index = readFileSync(join(root, 'src/client/index.ts'), 'utf8');

  /** 阿拉伯数字与中文数字都要认：文档里两种写法都在用。 */
  const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const forms = (n) => [String(n), CN[n]].filter((x) => x !== undefined);
  // 文档里数字与单位之间没有空格（「九个字段」），所以直接相接。
  const says = (text, n, unit) => forms(n).some((x) => text.includes(`${x}${unit}`));

  const fields = (host.match(/^\s+\w+: z\./gm) ?? []).length;
  const controls = (card.match(/<Row title=/g) ?? []).length;
  const sheets = (index.match(/^\s*\['[a-z]+\.css',/gm) ?? []).length;

  assert.ok(says(details, fields, '个字段'), `DETAILS 里的字段数不是 ${fields}`);
  assert.ok(says(readme, controls, '项'), `README 里的项数不是 ${controls}`);
  assert.ok(says(details, sheets, '张样式表'), `DETAILS 里的样式表数不是 ${sheets}`);
  // 投影写的属性数
  const projection = readFileSync(join(root, 'src/client/settings.ts'), 'utf8');
  const attrs = (projection.match(/\[(ROOT|HEADING|CODE|SHELL|FONT|NATIVE)_ATTRIBUTE\]:/g) ?? []).length / 2;
  assert.ok(says(details, attrs, '个属性'), `DETAILS 里的属性数不是 ${attrs}`);
});

test('「DSH 原生」下所有直接写颜色的装饰段都整段失效', () => {
  // 退回宿主配色时最难看的那种半套状态是「宿主底 + Maple 彩标题」：令牌那一层撤掉了，
  // 而样式表里**不读令牌、直接写颜色**的规则还在。所以这些规则必须与原生互斥，
  // 判据不是「有没有写 data-maple-native」，而是「这条规则里出现 var(--maple-*) 或字面 hsl()
  // 颜色时，选择器上带不带 :not([data-maple-native='on'])」。
  const offenders = [];
  for (const [file, css] of Object.entries(sheets)) {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      const block = rule[2];
      if (selector.includes(":not([data-maple-native='on'])")) continue;
      // 只看「给颜色」的声明：背景、前景、边框、描边、accent-color、::selection。
      const paints = /(^|;)\s*(background(-color)?|color|border(-[a-z]+)?-color|outline-color|accent-color)\s*:/.test(block);
      if (!paints) continue;
      // 直接写死的颜色才会在原生下留下痕迹；纯 var(--dsw-*) 的会跟着令牌一起退。
      const hardColor = /var\(--maple-(h[1-6]|inline-code|quote-bar|quote-fill|table-head|heading-color)\)|hsl\(/.test(block);
      if (!hardColor) continue;
      // 标题六色那一组由贴身的 :not 判据守着，这里只统计漏掉的。
      offenders.push(`${file}: ${selector.slice(0, 72)}`);
    }
  }
  assert.deepEqual(offenders, [], `这些直接写颜色的规则没跟「DSH 原生」互斥：${offenders.join('；')}`);
});

test('跟随配色的那些颜色都读 --maple-hue-*，不写死色相', () => {
  // 写死一个度数，换预设后那一处还停在原来的颜色上。这条钉的是「哪些必须跟随」：
  // 判据在注释里写明——标题六色、语法色、行内代码是固定的设计色，不随配色走；
  // 其余以 hsl() 直接出现的值都属于跟随配色的，必须带 --maple-hue-*。
  const pinned = new Set([
    '--maple-inline-code', '--maple-h1', '--maple-h2', '--maple-h3',
    '--maple-h4', '--maple-h5', '--maple-h6', '--maple-table-head',
    '--shiki',
  ]);
  const offenders = [];
  for (const [file, css] of Object.entries(sheets)) {
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      for (const decl of rule[2].matchAll(/([a-z-]+):\s*([^;]*hsl\([0-9][^;]*);/g)) {
        const [, property, value] = decl;
        // 只有「背景 / 边框 / 描边」这类跟随配色的位置需要跟随；固定色见 pinned。
        if (!/^(background|border|outline)/.test(property)) continue;
        if ([...pinned].some((name) => selector.includes(name) || value.includes(name))) continue;
        if (selector.includes('data-maple-heading') || selector.includes('data-maple-code')) continue;
        offenders.push(`${file}: ${selector.slice(0, 40)} 的 ${property} 写死了 ${value.trim().slice(0, 24)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('；'));
});

test('每一处圆角都取 --dsw-radius-* 或 Maple 自己的变量，没有字面 px', () => {
  const offenders = [];
  for (const [file, css] of Object.entries(sheets)) {
    for (const match of css.matchAll(/border(?:-[a-z]+)?-radius:\s*([^;]+);/g)) {
      const value = match[1].trim();
      if (value.startsWith('var(--dsw-radius-')) continue;
      if (value.startsWith('var(--maple-radius-')) continue;
      if (value === '0' || value === '0px' || value === 'inherit') continue;
      // 药丸与整圆是允许的形状，但必须与 corner-shape: round 同一条规则里出现。
      if (/^(50%|100%|999px)$/.test(value)) continue;
      offenders.push(`${file}: ${value}`);
    }
  }
  assert.deepEqual(offenders, [], `圆角写了字面值：${offenders.join('、')}`);
});

test('药丸与整圆的每条规则都配了 corner-shape: round', () => {
  for (const [file, css] of Object.entries(sheets)) {
    for (const rule of css.matchAll(/\{([^{}]*)\}/g)) {
      const body = rule[1];
      if (!/border-radius:\s*(50%|100%|999px)/.test(body)) continue;
      assert.match(body, /corner-shape:\s*round/, `${file} 有一条药丸圆角没配 corner-shape: round`);
    }
  }
});

/**
 * 宿主源码根：优先用 --source，其次按仓库工具脚本同一套顺序找
 * （`DSH_SOURCE`、仓库同级的 ../other/deepseek-harness、再上一层的 ../deepseek-harness）。
 * 与 tools/lib/dsh-source.mjs 保持同样三个位置，路径里不写死任何人的机器。
 */
function findHostSource() {
  const explicit = process.argv.slice(2).find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  if (explicit !== undefined) return resolve(explicit);
  const candidates = [
    process.env.DSH_SOURCE,
    resolve(root, '../../../other/deepseek-harness'),
    resolve(root, '../../../deepseek-harness'),
  ].filter((value) => typeof value === 'string' && value !== '');
  return candidates.find((candidate) => existsSync(join(candidate, 'packages/client')));
}

/**
 * 在一个目录下递归找文本文件里是否出现过某个字面量。
 * @param dir - 起始目录。
 * @param needle - 要找的字面量。
 * @returns 命中的文件相对路径（找不到时返回 undefined）。
 */
function findLiteral(dir, needle) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === 'lib' || entry === 'tests') continue;
        stack.push(path);
        continue;
      }
      if (!/\.(ts|tsx|css)$/.test(entry)) continue;
      if (readFileSync(path, 'utf8').includes(needle)) return relative(dir, path);
    }
  }
  return undefined;
}

const source = findHostSource();
/** 宿主 client 包目录；取不到宿主源码时是 undefined。 */
const clientDir = source === undefined ? undefined : join(source, 'packages/client');
if (source === undefined) {
  console.log('  skip 找不到宿主源码（用 --source=<deepseek-harness 路径> 指定），锚点契约这一条跳过');
} else {
  // 本插件自己写的属性（data-maple-*）不归宿主发，不能拿去宿主源码里找。
  const anchors = new Set(
    [...shellAttributes, ...markdownAttributes].filter((name) => !name.startsWith('data-maple-')),
  );
  for (const anchor of [...anchors].sort()) {
    // aria-* 与 md-code-block 这类装饰钩子由宿主组件自己发出，data-* 里有一部分是座位契约。
    test(`宿主还在发 ${anchor}`, () => {
      const hit = findLiteral(clientDir, anchor);
      assert.notEqual(hit, undefined, `宿主源码里再也找不到 ${anchor}——这条锚点已失效，样式会静默不生效`);
    });
  }
}

if (source !== undefined) {
  // 光有 `data-slot` 这个属性名不够：每个座位名也都是宿主发的字面量。
  // 座位名写错一个字符，那条规则就静默不生效，而属性名那一条照样绿。
  const slotNames = new Set(
    [...Object.values(sheets).join('\n').matchAll(/data-slot='([^']+)'/g)].map((match) => match[1])
      .filter((name) => name !== '…'),
  );
  // 座位名分散在各自的包里，所以按「谁声明谁负责」逐个查，查不到再退回全量扫描。
  const declared = {
    'sidebar': join(source, 'packages/client/ui-sidebar/src/client/index.ts'),
    'main': join(source, 'packages/client/ui-layout/src/client/index.ts'),
    'shell.bottom': join(source, 'packages/client/ui-layout/src/client/index.ts'),
    'conversation.header': join(source, 'packages/client/ui-conversation/src/client/apply.ts'),
    'conversation.session.header.actions': join(source, 'packages/client/ui-conversation/src/client/contract/slots.ts'),
  };
  for (const name of [...slotNames].sort()) {
    test(`宿主仍然声明座位 ${name}`, () => {
      const own = declared[name];
      const text = own !== undefined && existsSync(own) ? readFileSync(own, 'utf8') : '';
      if (text.includes(`'${name}'`)) return;
      const hit = findLiteral(clientDir, `'${name}'`);
      assert.notEqual(hit, undefined, `宿主源码里再也找不到座位 ${name}——外壳那条规则已失效`);
    });
  }
}

console.log(`${passed}/${total} passed`);

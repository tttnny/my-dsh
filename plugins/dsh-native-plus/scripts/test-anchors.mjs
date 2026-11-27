/**
 * 锚点契约自检：把两张样式表里用到的宿主钩子挑出来，逐个证明「宿主今天确实还在发它们」。
 *
 * 为什么要有这一条：装饰全靠宿主那几样不带哈希的钩子——data-chat-flow-kind、
 * data-chat-group-part、data-code-block-banner、data-line-numbers。宿主是内部依赖，
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
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + ': ' + error.message);
    throw error;
  }
}

/** 三张样式表的全文，按文件名索引。 */
const sheets = Object.fromEntries(
  ['tokens.css', 'markdown.css', 'sidebar.css'].map((file) => [
    file,
    readFileSync(join(root, 'src/client/styles', file), 'utf8'),
  ]),
);

/**
 * 从样式表里挑出所有属性选择器的名字。
 * 只认 [data-… 与 [aria-…：装饰层才有属性选择器。
 * @param css - 一份样式表。
 * @returns 用到的属性名集合。
 */
function attributeNames(css) {
  const names = new Set();
  for (const match of css.matchAll(/\[(data-[a-z-]+|aria-[a-z-]+)/g)) names.add(match[1]);
  return names;
}

/** 剥掉注释，剩下的才是真规则。 */
function strip(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 剥掉 @keyframes 块：里面的 `0%, 100% { … }` 是帧，不是选择器规则，
 * 留着会被规则遍历当成「没挂在根属性下」。
 * @param css - 一份样式表。
 * @returns 去掉关键帧块之后的样式表。
 */
function withoutKeyframes(css) {
  let out = css;
  for (;;) {
    const start = out.indexOf('@keyframes');
    if (start === -1) return out;
    const open = out.indexOf('{', start);
    if (open === -1) return out;
    let depth = 0;
    let end = -1;
    for (let i = open; i < out.length; i += 1) {
      if (out[i] === '{') depth += 1;
      else if (out[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) return out;
    out = out.slice(0, start) + out.slice(end);
  }
}

/**
 * 挑出没有挂在根属性下的规则。
 * @param css - 一份样式表。
 * @returns 违规的选择器。
 */
function ungatedRules(css) {
  const offenders = [];
  for (const rule of withoutKeyframes(strip(css)).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selector = rule[1].trim();
    if (selector === '' || selector.startsWith('@')) continue;
    if (!selector.startsWith("html[data-native-plus='on']")) offenders.push(selector);
  }
  return offenders;
}

/** 三张样式表里用到的宿主属性名（本插件自己的 data-native-plus / data-np-* 另算）。 */
const hostAttributes = new Set(
  Object.values(sheets).flatMap((css) => [...attributeNames(css)]),
);

test('样式表里没有 CSS Modules 的哈希类名（一出现就说明抄了宿主内部实现）', () => {
  for (const [file, css] of Object.entries(sheets)) {
    // 哈希类名的形状是「五六个混合字符 + 下划线 + 名字」，例如 _markdown_1ypvv_5、pI_x6G_frame。
    const hashed = [...strip(css).matchAll(/\.(_?[A-Za-z0-9-]{5,}_[A-Za-z0-9]+)/g)].map((match) => match[1]);
    assert.deepEqual(hashed, [], file + ' 里出现了哈希类名：' + hashed.join('、'));
  }
});

test('每一层都挂在根属性下面（关掉就整段不匹配）', () => {
  // 逐条规则看选择器：把注释、at-rule 与关键帧剥掉，剩下的每个「选择器 { … }」都必须以根属性开头。
  const offenders = [];
  for (const [file, css] of Object.entries(sheets)) {
    for (const selector of ungatedRules(css)) offenders.push(file + ': ' + selector.slice(0, 60));
  }
  assert.deepEqual(offenders, [], '这些规则没挂在根属性下：' + offenders.join(' | '));
});

test('规则遍历器抓得住漏挂根属性的规则，也认得关键帧（否则上一条是空转）', () => {
  assert.deepEqual(ungatedRules("[data-y] { color: red; }"), ['[data-y]']);
  assert.deepEqual(ungatedRules('@keyframes k { 0%, 100% { opacity: 0.4; } }'), []);
});

test('段落间距落在 p 的 margin 上（宿主就是用它给段落分段的）', () => {
  const markdown = sheets['markdown.css'];
  // 宿主给 .markdown p 写的是 margin: 16px 0；跟着改 margin 才生效。
  // 中间那层容器是 block 不是 flex，给它 gap 不会产生任何间距。
  assert.match(
    markdown,
    /:where\(p\)\s*\{[^}]*margin:\s*var\(--np-p-gap/,
    '段距没有落在 p 的 margin 上',
  );
  assert.doesNotMatch(
    markdown,
    /gap:\s*var\(--np-p-gap/,
    '段距又写回了容器的 gap——那一层是 block，gap 不产生间距',
  );
});

test('样式表里不写颜色，只引用 --np-* 或 --dsw-* 令牌', () => {
  // 本插件的配色承诺是「就是 DSH 那一套」。样式表里出现字面色值，就是悄悄多出了一套。
  const offenders = [];
  for (const file of Object.keys(sheets)) {
    for (const match of strip(sheets[file]).matchAll(/(color|background(-color)?|border(-[a-z]+)?-color)\s*:\s*([^;]+);/g)) {
      const value = match[4].trim();
      if (/^(none|inherit|transparent|currentColor)$/i.test(value)) continue;
      if (/hsla?\(|rgba?\(|#[0-9a-fA-F]{3,8}/.test(value) && !value.includes('var(--')) offenders.push(file + ': ' + value.slice(0, 60));
    }
  }
  assert.deepEqual(offenders, [], '这些颜色是写死的：' + offenders.join(' | '));
});

test('外形层只用宿主的圆角变量，没有字面 px', () => {
  const offenders = [];
  for (const [file, css] of Object.entries(sheets)) {
    for (const match of strip(css).matchAll(/border(?:-[a-z]+)?-radius:\s*([^;]+);/g)) {
      const value = match[1].trim();
      if (value.startsWith('var(--dsw-radius-')) continue;
      if (value === '0' || value === '0px' || value === 'inherit') continue;
      // 药丸与整圆是允许的形状，但必须与 corner-shape: round 同一条规则里出现。
      if (/^(50%|100%|999px)$/.test(value)) continue;
      offenders.push(file + ': ' + value);
    }
  }
  assert.deepEqual(offenders, [], '圆角写了字面值：' + offenders.join('、'));
});

test('药丸与整圆的每条规则都配了 corner-shape: round', () => {
  for (const [file, css] of Object.entries(sheets)) {
    for (const rule of strip(css).matchAll(/\{([^{}]*)\}/g)) {
      const body = rule[1];
      if (!/border-radius:\s*(50%|100%|999px)/.test(body)) continue;
      assert.match(body, /corner-shape:\s*round/, file + ' 有一条药丸圆角没配 corner-shape: round');
    }
  }
});

test('文档里写死的数字与实际一致', () => {
  // 这几处数字改一次代码就会过期一次，写进自检比靠人记可靠。
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const schema = readFileSync(join(root, 'src/client/schema.ts'), 'utf8');
  const index = readFileSync(join(root, 'src/client/index.ts'), 'utf8');

  /** 阿拉伯数字与中文数字都要认：文档里两种写法都在用。 */
  const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  /** 「两」与「二」都指 2：文档里两种写法都在用。 */
  const forms = (n) => [String(n), ...(n === 2 ? ['二', '两'] : [CN[n]]), CN[n]].filter((x) => x !== undefined);
  // 数字与单位之间可能夹着空白，两边都去掉再比。
  const compact = (text) => text.replace(/\s+/g, '');
  const says = (text, n, unit) => forms(n).some((x) => compact(text).includes(x + unit));

  const fields = (schema.match(/^\s*\{ key: '/gm) ?? []).length;
  const sheetsCount = (index.match(/^\s*\['[a-z]+\.css',/gm) ?? []).length;

  assert.ok(says(readme, fields, '个字段'), 'README 里的字段数不是 ' + fields);
  assert.ok(says(readme, fields, '个可调项'), 'README 里的可调项数不是 ' + fields);
  assert.ok(says(readme, sheetsCount, '张样式表'), 'README 里的样式表数不是 ' + sheetsCount);
});

/**
 * 宿主源码根：优先用 --source，其次按仓库工具脚本同一套顺序找
 * （DSH_SOURCE、仓库同级的 ../github/deepseek-harness、再上一层的 ../deepseek-harness）。
 * 与 tools/lib/dsh-source.mjs 保持同样三个位置，路径里不写死任何人的机器。
 */
function findHostSource() {
  const explicit = process.argv.slice(2).find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  if (explicit !== undefined) return resolve(explicit);
  const candidates = [
    process.env.DSH_SOURCE,
    resolve(root, '../../../github/deepseek-harness'),
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
  // 本插件自己写的属性（data-native-plus / data-np-*）不归宿主发，不能拿去宿主源码里找。
  const anchors = new Set(
    [...hostAttributes, 'data-sidebar-list-area'].filter((name) => !name.startsWith('data-native-plus') && !name.startsWith('data-np-')),
  );
  for (const anchor of [...anchors].sort()) {
    test('宿主还在发 ' + anchor, () => {
      const hit = findLiteral(clientDir, anchor);
      assert.notEqual(hit, undefined, '宿主源码里再也找不到 ' + anchor + '——这条锚点已失效，样式会静默不生效');
    });
  }
}

console.log(passed + '/' + total + ' passed');

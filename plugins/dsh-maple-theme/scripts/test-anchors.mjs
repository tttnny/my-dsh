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

/** 宿主源码根：优先用 --source，其次按工具脚本的约定找。 */
function findHostSource() {
  const explicit = process.argv.slice(2).find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
  if (explicit !== undefined) return resolve(explicit);
  const candidates = [
    process.env.DSH_SOURCE,
    '/Users/tny/Desktop/work/other/deepseek-harness',
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

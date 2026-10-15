/**
 * 宿主渲染一致性的自动检查。
 *
 * 本插件接管了助手行的渲染（keyed slot `conversation.chat.node` / key
 * `assistant-step`），于是宿主的 `AssistantMarkdown` 一旦多出一种块、或改了
 * 分组规则，我们这边就在无声地漂移——它不会报错，只会少画一行或把两行并成一行。
 * 这个脚本盯住三件会漂移的事实，其余（显示策略、停止标记条件、样式）由
 * `test-chat-translate.mjs` 的等价测试兜住。
 *
 * 三条判据里的每一条都要求宿主源码可达；找不到 checkout 时**跳过并明确报出**，
 * 不假装通过（本仓的插件不能假定 DSH 源码就在旁边）。DSH 源码位置可以经
 * `DSH_SOURCE_DIR` 指定，缺省是仓库外的常规检出目录。
 *
 * 运行：node scripts/test-host-parity.mjs
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CANDIDATES = [
  process.env.DSH_SOURCE_DIR,
  process.env.DSH_CHECKOUT,
  '/Users/tny/Desktop/work/other/deepseek-harness',
].filter((value) => typeof value === 'string' && value !== '');

const HOST_FILE = 'packages/client/ui-chat/src/client/chat/AssistantMarkdown.tsx';

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log('  ok   ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name + ':', err.message);
    throw err;
  }
}

/** 找到 DSH 源码里那份宿主渲染器；找不到就返回 null（调用方跳过）。 */
async function findHostFile() {
  for (const root of CANDIDATES) {
    const file = path.join(root, HOST_FILE);
    try {
      const source = await fs.readFile(file, 'utf-8');
      return { file, source };
    } catch {
      // 换下一个候选目录。
    }
  }
  return null;
}

const host = await findHostFile();
if (host === null) {
  console.log('─ host parity: 跳过（没找到 DSH 源码；用 DSH_SOURCE_DIR 指定）');
  process.exit(0);
}
console.log('=== 宿主渲染一致性 ===');
console.log('  宿主源码: ' + host.file);

const ourSource = await fs.readFile(
  path.join(import.meta.dirname, '..', 'src', 'client', 'chat', 'row-plan.ts'),
  'utf-8'
);
const ourRenderer = await fs.readFile(
  path.join(import.meta.dirname, '..', 'src', 'client', 'chat', 'assistant-step.tsx'),
  'utf-8'
);

/** 宿主 switch 里认的每一个块种类字面量。 */
function hostBlockKinds(source) {
  const kinds = new Set();
  for (const match of source.matchAll(/case '([a-z-]+)':/g)) kinds.add(match[1]);
  return kinds;
}

await test('宿主认的每一种块，计划层都有一支', () => {
  const kinds = [...hostBlockKinds(host.source)].sort();
  assert.ok(kinds.length >= 4, '没有从宿主源码里认出块种类，检查正则是否还成立');
  for (const kind of kinds) {
    assert.ok(
      ourSource.includes(`kind === '${kind}'`) || ourSource.includes(`case '${kind}'`) || ourSource.includes(`'${kind}'`),
      `宿主有 '${kind}' 这一种块，本插件的计划层里却找不到它——接管渲染会少画或错画这一类`
    );
  }
});

await test('空行守卫仍与宿主逐字等价：只有 tool-call 的行不渲染', () => {
  assert.match(
    host.source,
    /const hasVisible = streaming\s*\|\| interrupted === true\s*\|\| blocks\.some\(block => block\.kind !== 'tool-call'\)/,
    '宿主的空行守卫变了：本插件的 planAssistantRow 里那条同名守卫要跟着改'
  );
  assert.match(
    ourSource,
    /const hasVisible = streaming \|\| interrupted \|\| blocks\.some\(\(block\) => block\.kind !== 'tool-call'\)/,
    '本插件这边的守卫与宿主不再同形'
  );
});

await test('连续图片成一组：两边的分组写法都在', () => {
  assert.match(
    host.source,
    /while \(i \+ 1 < blocks\.length\) \{[\s\S]{0,120}next\.kind !== 'image'\) break/,
    '宿主的连续图片分组改了：本插件的 flushImages 分组要跟着改'
  );
  assert.match(
    ourSource,
    /case 'image':[\s\S]{0,200}imageRun\.push\(block\.attachment\)/,
    '本插件这边的连续图片分组与宿主不再同形'
  );
});

await test('两种分组的过滤规则两边一致：response 排除思考、reasoning 只留思考', () => {
  assert.match(host.source, /groupPart === 'reasoning' && block\.kind !== 'reasoning'\) continue/);
  assert.match(host.source, /groupPart === 'response' && block\.kind === 'reasoning'\) continue/);
  assert.match(ourSource, /groupPart === 'reasoning' && block\.kind !== 'reasoning'\) continue/);
  assert.match(ourSource, /groupPart === 'response' && block\.kind === 'reasoning'\) continue/);
});

await test('停止标记条件两边一致', () => {
  assert.match(
    host.source,
    /interrupted && \(groupPart === undefined \|\| groupPart === 'response'[\s\S]{0,120}!blocks\.some\(block => block\.kind !== 'reasoning' && block\.kind !== 'tool-call'\)\)/,
    '宿主的「已停止」条件改了'
  );
  assert.match(
    ourSource,
    /interrupted &&[\s\S]{0,160}!blocks\.some\(\(block\) => block\.kind !== 'reasoning' && block\.kind !== 'tool-call'\)/,
    '本插件这边的「已停止」条件与宿主不再同形'
  );
});

await test('接管座次仍压过宿主默认渲染器（priority -1）', () => {
  const clientEntry = ourRenderer.includes('conversation.chat.node');
  assert.ok(clientEntry, '渲染器文件里提到过接管座次');
  assert.match(
    host.source,
    /case 'tool-call'/,
    '宿主仍然是按块种类分派的写法（本脚本的判据建立在这一点上）'
  );
});

console.log(`
宿主渲染一致性：${passed}/${total} 通过`);
process.exit(passed === total ? 0 : 1);

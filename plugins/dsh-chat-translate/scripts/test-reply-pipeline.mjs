// 正文翻译的宿主侧回归：估算、切分、打包、标记还原、串行队列、单缓存池、
// 单通道与路由形状。
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// 隔离文件状态：缓存与配置都写到临时目录，绝不碰真实的 ~/.dsh。
const TMP_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-chat-translate-reply-'));
process.env.DSH_HOME = TMP_HOME;

import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import {
  ConfigManager,
  RETIRED_CONFIG_KEYS,
  retireRemovedConfigKeys,
  sanitizePatch,
} from '../src/server/config.ts';
import { LruDiskCache, retireStoreFiles } from '../src/server/cache.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { createFetchRoutes, REPLY_ROUTE_PATH } from '../src/server/router.ts';
import {
  buildBatchPayload,
  createBatchFormat,
  estimateTokens,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
} from '../src/server/pipeline/blocks.ts';
import { createFakeSettingsEntry, createFakeCredentials } from './test-helpers.mjs';

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log('  PASS ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name + ':', err.message);
    throw err;
  }
}

/** 假设置条目当前用户层的内容（迁移断言用）。 */
function describeUser(source) {
  const entry = source.describe().find((item) => item.ns === 'dsh-chat-translate');
  return entry?.user ?? {};
}

/** 把打包后的负载按标记原样回显，用来模拟一个守规矩的翻译模型。 */
function echoBlocks(text) {
  const pattern = new RegExp('⟪([a-z]{4})(\\d+)⟫', 'g');
  const matches = [...text.matchAll(pattern)];
  return matches
    .map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      return match[0] + '\n译:' + text.slice(start, end).trim();
    })
    .join('\n\n');
}

function makeDispatcher(initial = {}) {
  // The fake entry is the live config source: `source.update` simulates one
  // accepted edit of the profile entry's config section.
  const source = createFakeSettingsEntry({
    enabled: true,
    baseUrl: 'http://127.0.0.1:9/v1',
    model: 'test-model',
    ...initial,
  });
  const config = new ConfigManager(source, new CredentialsReader(createFakeCredentials('test-key')));
  const cache = new LruDiskCache(100, 'reply-cache-test.json');
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);
  return { config, source, dispatcher, cache };
}

function useFakeAdapter(dispatcher, translate) {
  dispatcher.adapters.set('openai', {
    id: 'openai',
    name: 'Fake OpenAI',
    isAvailable: () => true,
    translate,
  });
}

/**
 * 四个各约 1200 token 的块：客户端一次会送出许多段，宿主按输入上限把它们
 * 打包成尽量少的请求（这里是三块 + 一块）。
 */
function manyBlocks() {
  return Array.from({ length: 4 }, (_, index) => 'word '.repeat(720).trim() + ' #' + index);
}

console.log('=== dsh-chat-translate 正文翻译回归 ===');
await test('estimateTokens 保守估算：汉字一字一 token，其余三字符一 token', () => {
  assert.equal(estimateTokens('中文'), 2);
  assert.equal(estimateTokens('abcdef'), 2);
  assert.equal(estimateTokens('abc'), 1);
  assert.equal(estimateTokens(''), 0);
});

await test('超限块按空行切分且拼回等于原文', () => {
  const paragraph = 'word '.repeat(200).trim();
  const text = [paragraph, paragraph, paragraph].join('\n\n');
  const parts = splitOversizedBlock(text, 100);
  assert.ok(parts.length > 1, '必须真的切开');
  assert.equal(parts.join(''), text, '切分不得丢字符');
  for (const part of parts) assert.ok(estimateTokens(part) <= 100, '每段都不得超过上限');
});

await test('没有自然边界的超限块按字符硬切且拼回等于原文', () => {
  const text = 'a'.repeat(500);
  const parts = splitOversizedBlock(text, 20);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(''), text);
  for (const part of parts) assert.ok(estimateTokens(part) <= 20);
});

await test('打包把相邻片段合到上限以内，且不重排、不丢段', () => {
  // 每段 60 字符 = 20 估算 token；上限 30 时每批只能放一段。
  const pieces = [{ text: 'a'.repeat(60) }, { text: 'b'.repeat(60) }, { text: 'c'.repeat(60) }];
  const batches = packPieces(pieces, 30);
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.flat().map((piece) => piece.text[0]), ['a', 'b', 'c']);
  assert.equal(packPieces([{ text: 'a'.repeat(60) }, { text: 'b'.repeat(60) }], 40).length, 1);
  assert.equal(packPieces([{ text: 'a'.repeat(60) }], 40).length, 1);
  assert.equal(packPieces([], 40).length, 0);
});

await test('块标记负载与切回互为逆运算', () => {
  const format = createBatchFormat();
  const pieces = ['第一段原文。', 'second paragraph', 'third one'];
  const payload = buildBatchPayload(pieces, format);
  assert.ok(payload.startsWith(format.token(0)));
  const echoed = pieces.map((text, index) => format.token(index) + '\n译' + index + ':' + text).join('\n\n');
  assert.deepEqual(
    splitBatchTranslation(echoed, format, pieces.length),
    pieces.map((text, index) => '译' + index + ':' + text)
  );
});

await test('块标记被弄乱时整批作废', () => {
  const format = createBatchFormat();
  const good = format.token(0) + '\nA\n\n' + format.token(1) + '\nB';
  assert.deepEqual(splitBatchTranslation(good, format, 2), ['A', 'B']);
  assert.equal(splitBatchTranslation(good, format, 3), null, '标记数不足');
  assert.equal(splitBatchTranslation(format.token(0) + '\nA', format, 2), null, '少一个标记');
  assert.equal(
    splitBatchTranslation(format.token(1) + '\nA\n\n' + format.token(0) + '\nB', format, 2),
    null,
    '次序错乱'
  );
  assert.equal(
    splitBatchTranslation(format.token(0) + '\nA\n\n' + format.token(0) + '\nB', format, 2),
    null,
    '序号重复'
  );
  assert.equal(
    splitBatchTranslation(good, { ...format, id: 'zzzz' }, 2),
    null,
    '别的批次的标记'
  );
  assert.equal(splitBatchTranslation(format.token(0) + '\nA\n\n' + format.token(1) + '\n', format, 2), null, '空段');
});

await test('总开关关闭时原样返回且不发请求', async () => {
  const { dispatcher, source } = makeDispatcher();
  await source.update({ enabled: false });
  let calls = 0;
  useFakeAdapter(dispatcher, async (text) => {
    calls++;
    return text;
  });
  const results = await dispatcher.translateReplyBlocks(['一段正文']);
  assert.equal(calls, 0);
  assert.equal(results[0].translated, '一段正文');
  assert.equal(results[0].ok, false);
  assert.equal(results[0].channel, 'none');
});

await test('AI 未配置时不发请求、保留原文', async () => {
  const { dispatcher } = makeDispatcher();
  const results = await dispatcher.translateReplyBlocks(['一段正文']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, '一段正文');
});

await test('正文只有 openai 一条通道：别的适配器不参与', async () => {
  const { dispatcher } = makeDispatcher();
  let otherCalls = 0;
  dispatcher.adapters.set('other', {
    id: 'other',
    name: 'Fake other channel',
    isAvailable: () => true,
    translate: async (text) => {
      otherCalls++;
      return 'other:' + text;
    },
  });
  useFakeAdapter(dispatcher, async (text) => 'ai:' + text);
  const results = await dispatcher.translateReplyBlocks(['Hello world']);
  assert.equal(otherCalls, 0);
  assert.equal(results[0].channel, 'openai');
  assert.equal(results[0].translated, 'ai:Hello world');
});

await test('单段请求带 max_tokens 与 plain 模式；多段打包带 blocks 模式', async () => {
  const { dispatcher } = makeDispatcher();
  const seen = [];
  useFakeAdapter(dispatcher, async (text, signal, config, options) => {
    seen.push({ text, options });
    return options?.mode === 'blocks' ? echoBlocks(text) : '译:' + text;
  });

  const short = await dispatcher.translateReplyBlocks(['Short paragraph']);
  assert.equal(seen[0].options.mode, 'plain');
  assert.equal(seen[0].options.maxTokens, 8192);
  assert.equal(short[0].translated, '译:Short paragraph');

  seen.length = 0;
  const long = await dispatcher.translateReplyBlocks(manyBlocks());
  assert.equal(seen.length, 2, '四块应打包成两个请求');
  assert.equal(seen[0].options.mode, 'blocks', '合并的那一批走 blocks 模式');
  assert.equal(seen[1].options.mode, 'plain', '落单的那一批走 plain 模式');
  assert.ok(seen.every((entry) => entry.options.maxTokens === 8192));
  assert.equal(long.length, 4);
  assert.ok(long.every((result) => result.ok));
  assert.ok(long.every((result) => result.translated.startsWith('译:word')));
});

await test('掩码占位符在正文里同样还原', async () => {
  const { dispatcher } = makeDispatcher();
  useFakeAdapter(dispatcher, async (text) => '请看 ' + text);
  const source = 'Read src/server/dispatcher.ts and https://example.com/docs now';
  const results = await dispatcher.translateReplyBlocks([source]);
  assert.equal(results[0].ok, true);
  assert.ok(results[0].translated.includes('src/server/dispatcher.ts'), '路径必须原样回来');
  assert.ok(results[0].translated.includes('https://example.com/docs'), 'URL 必须原样回来');
  assert.ok(!results[0].translated.includes('⟦'), '不得留下掩码标记');
});

await test('整批标记损坏时退回逐段单发', async () => {
  const { dispatcher } = makeDispatcher();
  const modes = [];
  useFakeAdapter(dispatcher, async (text, signal, config, options) => {
    modes.push(options?.mode);
    if (options?.mode === 'blocks') return '完全丢掉了标记的译文';
    return '译:' + text;
  });
  const results = await dispatcher.translateReplyBlocks(manyBlocks());
  assert.equal(modes[0], 'blocks', '第一批是多段打包');
  assert.ok(modes.length >= 2);
  assert.ok(modes.slice(1).every((mode) => mode === 'plain'), '整批失败后必须逐段单发：' + modes.join(','));
  assert.ok(results.every((result) => result.ok));
  assert.ok(results.every((result) => result.translated.startsWith('译:')));
});

await test('单段也失败时保留原文且不写缓存', async () => {
  const { dispatcher, cache } = makeDispatcher();
  useFakeAdapter(dispatcher, async () => {
    throw new Error('503');
  });
  const results = await dispatcher.translateReplyBlocks(['一段会失败的正文']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, '一段会失败的正文');
  assert.equal(cache.get('一段会失败的正文'), undefined);
});

await test('正文译文进唯一的缓存池，命中后不再请求', async () => {
  const { dispatcher, cache } = makeDispatcher();
  let calls = 0;
  useFakeAdapter(dispatcher, async (text) => {
    calls++;
    return '译:' + text;
  });
  const first = await dispatcher.translateReplyBlocks(['A stable paragraph']);
  assert.equal(first[0].ok, true);
  assert.equal(calls, 1);
  assert.equal(cache.get('a stable paragraph'), '译:A stable paragraph');

  const second = await dispatcher.translateReplyBlocks(['A stable paragraph']);
  assert.equal(calls, 1, '第二次必须命中缓存');
  assert.equal(second[0].cached, true);
  assert.equal(second[0].channel, 'cache');
  assert.equal(second[0].translated, '译:A stable paragraph');
});

await test('正文请求串行执行，同时最多一个在途', async () => {
  const { dispatcher } = makeDispatcher();
  let active = 0;
  let peak = 0;
  useFakeAdapter(dispatcher, async (text) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 40));
    active--;
    return '译:' + text;
  });
  await Promise.all([
    dispatcher.translateReplyBlocks(['First concurrent block']),
    dispatcher.translateReplyBlocks(['Second concurrent block']),
    dispatcher.translateReplyBlocks(['Third concurrent block']),
  ]);
  assert.equal(peak, 1, '正文请求必须串行，peak=' + peak);
});

await test('退役的配置键在 sanitizePatch 里被丢掉', () => {
  const patch = sanitizePatch({
    enabled: true,
    concurrency: 8,
    timeoutMs: 2000,
    thinkEnabled: true,
    thinkTimeoutMs: 600000,
    aiEnabled: true,
    bingEnabled: true,
  });
  assert.deepEqual(patch, { enabled: true });
});

await test('正文路由按块返回，坏请求体给 400', async () => {
  const { dispatcher } = makeDispatcher();
  useFakeAdapter(dispatcher, async (text, signal, config, options) =>
    options?.mode === 'blocks' ? echoBlocks(text) : '译:' + text
  );
  const routes = createFetchRoutes(dispatcher);
  const route = routes.find((entry) => entry.path === REPLY_ROUTE_PATH);
  assert.ok(route, '正文路由必须存在');
  assert.equal(route.requestBody, 'buffered');

  const post = (body) =>
    new Request('http://127.0.0.1' + REPLY_ROUTE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  const ok = await route.fetch(post({ blocks: ['Hello', 42, 'World'] }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.results.length, 2, '非字符串项必须被丢掉');
  assert.deepEqual(body.results.map((result) => result.translated), ['译:Hello', '译:World']);

  const empty = await route.fetch(post({ blocks: [] }));
  assert.deepEqual(await empty.json(), { ok: true, results: [] });

  const malformed = await route.fetch(post('{not json'));
  assert.equal(malformed.status, 400);
});

await test('升级遗留：退役的配置键被一次性清掉', async () => {
  const source = createFakeSettingsEntry();
  // A profile that predates this release: every retired key sits in the user layer.
  source.setUserLayer({ enabled: true, concurrency: 3, thinkEnabled: true, bingEnabled: true });
  const settings = {
    describe: () => source.describe(),
    mutate: (ns, ops, revision) => source.mutate(ns, ops, revision),
  };

  assert.equal(await retireRemovedConfigKeys(settings), true, 'must report the cleanup');
  for (const key of RETIRED_CONFIG_KEYS) {
      assert.equal(describeUser(source)[key], undefined, `${key} must be gone from the user layer`);
  }
  assert.equal(describeUser(source).enabled, true, 'surviving keys are untouched');
  assert.equal(await retireRemovedConfigKeys(settings), false, 'a second boot is a no-op');
});

await test('升级遗留：退役的配置键清理失败时不抛错（下次启动重试）', async () => {
  const source = createFakeSettingsEntry();
  source.setUserLayer({ concurrency: 3 });
  const failing = {
    describe: () => source.describe(),
    mutate: async () => {
      throw new Error('provider is read-only');
    },
  };
  assert.equal(await retireRemovedConfigKeys(failing), false);
});

await test('升级遗留：退役的思考链缓存文件被删除，缺失时也不报错', async () => {
  const path = await import('node:path');
  const home = process.env.DSH_HOME;
  assert.ok(home, 'the suite runs under an isolated DSH_HOME');
  const pluginDir = path.join(home, 'dsh-chat-translate');
  await fs.mkdir(pluginDir, { recursive: true });
  const stale = path.join(pluginDir, 'think-cache.json');
  await fs.writeFile(stale, '{"stale":"译文"}', 'utf-8');

  assert.equal(await retireStoreFiles(['think-cache.json']), true, 'the stale pool file is removed');
  await assert.rejects(fs.access(stale), 'the retired pool file must be gone');
  assert.equal(await retireStoreFiles(['think-cache.json']), false, 'missing file is a quiet no-op');
});

console.log('');
console.log('正文回归：' + passed + '/' + total + ' 通过');
process.exit(passed === total ? 0 : 1);

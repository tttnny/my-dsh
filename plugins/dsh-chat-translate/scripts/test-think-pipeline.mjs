// 思考链翻译的宿主侧回归：估算、切分、打包、标记还原、串行队列、缓存分池、
// 通道选择与路由形状。
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// 隔离文件状态：缓存与配置都写到临时目录，绝不碰真实的 ~/.dsh。
const TMP_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-chat-translate-think-'));
process.env.DSH_HOME = TMP_HOME;

import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { ConfigManager, sanitizePatch } from '../src/server/config.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { createFetchRoutes, THINK_ROUTE_PATH } from '../src/server/router.ts';
import {
  buildBatchPayload,
  createThinkBatchFormat,
  estimateTokens,
  packPieces,
  splitBatchTranslation,
  splitOversizedBlock,
} from '../src/server/pipeline/think.ts';
import { createFakeSettingsScope, createFakeCredentials } from './test-helpers.mjs';

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
  const config = new ConfigManager(
    createFakeSettingsScope({
      enabled: true,
      aiEnabled: true,
      bingEnabled: true,
      thinkEnabled: true,
      baseUrl: 'http://127.0.0.1:9/v1',
      model: 'test-model',
      ...initial,
    }),
    new CredentialsReader(createFakeCredentials('test-key'))
  );
  const cache = new LruDiskCache(100, 'title-cache-test.json');
  const thinkCache = new LruDiskCache(100, 'think-cache-test.json');
  thinkCache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache, undefined, thinkCache);
  return { config, dispatcher, thinkCache, cache };
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

console.log('=== dsh-chat-translate 思考链翻译回归 ===');
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
  const format = createThinkBatchFormat();
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
  const format = createThinkBatchFormat();
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

await test('总开关或思考链开关关闭时原样返回且不发请求', async () => {
  for (const patch of [{ enabled: false }, { thinkEnabled: false }]) {
    const { dispatcher } = makeDispatcher({ thinkEnabled: true });
    await dispatcher.configManager.updateConfig(patch);
    let calls = 0;
    useFakeAdapter(dispatcher, async (text) => {
      calls++;
      return text;
    });
    const results = await dispatcher.translateThinkBlocks(['一段思考']);
    assert.equal(calls, 0);
    assert.equal(results[0].translated, '一段思考');
    assert.equal(results[0].ok, false);
    assert.equal(results[0].channel, 'none');
  }
});

await test('AI 未配置时不发请求、保留原文', async () => {
  const { dispatcher } = makeDispatcher();
  const results = await dispatcher.translateThinkBlocks(['一段思考']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, '一段思考');
});

await test('思考链翻译只走 AI 通道，Bing 从不参与', async () => {
  const { dispatcher } = makeDispatcher();
  let bingCalls = 0;
  dispatcher.adapters.set('bing', {
    id: 'bing',
    name: 'Fake Bing',
    isAvailable: () => true,
    translate: async (text) => {
      bingCalls++;
      return 'bing:' + text;
    },
  });
  useFakeAdapter(dispatcher, async (text) => 'ai:' + text);
  const results = await dispatcher.translateThinkBlocks(['Hello world']);
  assert.equal(bingCalls, 0);
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

  const short = await dispatcher.translateThinkBlocks(['Short paragraph']);
  assert.equal(seen[0].options.mode, 'plain');
  assert.equal(seen[0].options.maxTokens, 8192);
  assert.equal(short[0].translated, '译:Short paragraph');

  seen.length = 0;
  const long = await dispatcher.translateThinkBlocks(manyBlocks());
  assert.equal(seen.length, 2, '四块应打包成两个请求');
  assert.equal(seen[0].options.mode, 'blocks', '合并的那一批走 blocks 模式');
  assert.equal(seen[1].options.mode, 'plain', '落单的那一批走 plain 模式');
  assert.ok(seen.every((entry) => entry.options.maxTokens === 8192));
  assert.equal(long.length, 4);
  assert.ok(long.every((result) => result.ok));
  assert.ok(long.every((result) => result.translated.startsWith('译:word')));
});

await test('掩码占位符在思考链里同样还原', async () => {
  const { dispatcher } = makeDispatcher();
  useFakeAdapter(dispatcher, async (text) => '请看 ' + text);
  const source = 'Read src/server/dispatcher.ts and https://example.com/docs now';
  const results = await dispatcher.translateThinkBlocks([source]);
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
  const results = await dispatcher.translateThinkBlocks(manyBlocks());
  assert.equal(modes[0], 'blocks', '第一批是多段打包');
  assert.ok(modes.length >= 2);
  assert.ok(modes.slice(1).every((mode) => mode === 'plain'), '整批失败后必须逐段单发：' + modes.join(','));
  assert.ok(results.every((result) => result.ok));
  assert.ok(results.every((result) => result.translated.startsWith('译:')));
});

await test('单段也失败时保留原文且不写缓存', async () => {
  const { dispatcher, thinkCache } = makeDispatcher();
  useFakeAdapter(dispatcher, async () => {
    throw new Error('503');
  });
  const results = await dispatcher.translateThinkBlocks(['一段会失败的思考']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, '一段会失败的思考');
  assert.equal(thinkCache.get('一段会失败的思考'), undefined);
});

await test('思考链译文进独立缓存池，命中后不再请求', async () => {
  const { dispatcher, thinkCache, cache } = makeDispatcher();
  let calls = 0;
  useFakeAdapter(dispatcher, async (text) => {
    calls++;
    return '译:' + text;
  });
  const first = await dispatcher.translateThinkBlocks(['A stable paragraph']);
  assert.equal(first[0].ok, true);
  assert.equal(calls, 1);
  assert.equal(thinkCache.get('a stable paragraph'), '译:A stable paragraph');
  assert.equal(cache.get('a stable paragraph'), undefined, '不得写进工具标题的池');

  const second = await dispatcher.translateThinkBlocks(['A stable paragraph']);
  assert.equal(calls, 1, '第二次必须命中缓存');
  assert.equal(second[0].cached, true);
  assert.equal(second[0].channel, 'cache');
  assert.equal(second[0].translated, '译:A stable paragraph');
});

await test('思考链请求串行执行，同时最多一个在途', async () => {
  const { dispatcher } = makeDispatcher({ concurrency: 50 });
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
    dispatcher.translateThinkBlocks(['First concurrent block']),
    dispatcher.translateThinkBlocks(['Second concurrent block']),
    dispatcher.translateThinkBlocks(['Third concurrent block']),
  ]);
  assert.equal(peak, 1, '思考链必须串行，peak=' + peak);
});

await test('思考链设置项在 sanitizePatch 里被夹到范围内', () => {
  assert.equal(sanitizePatch({ thinkEnabled: true }).thinkEnabled, true);
  assert.equal(sanitizePatch({ thinkEnabled: 'yes' }).thinkEnabled, undefined);
  assert.equal(sanitizePatch({ thinkTimeoutMs: 10 }).thinkTimeoutMs, 500);
  assert.equal(sanitizePatch({ thinkTimeoutMs: 10 ** 9 }).thinkTimeoutMs, 900000);
  assert.equal(sanitizePatch({ thinkTimeoutMs: 600000 }).thinkTimeoutMs, 600000);
});

await test('translate-think 路由按块返回，坏请求体给 400', async () => {
  const { dispatcher } = makeDispatcher();
  useFakeAdapter(dispatcher, async (text, signal, config, options) =>
    options?.mode === 'blocks' ? echoBlocks(text) : '译:' + text
  );
  const routes = createFetchRoutes(dispatcher);
  const route = routes.find((entry) => entry.path === THINK_ROUTE_PATH);
  assert.ok(route, '思考链路由必须存在');
  assert.equal(route.requestBody, 'buffered');

  const post = (body) =>
    new Request('http://127.0.0.1' + THINK_ROUTE_PATH, {
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

console.log('');
console.log('思考链回归：' + passed + '/' + total + ' 通过');
process.exit(passed === total ? 0 : 1);

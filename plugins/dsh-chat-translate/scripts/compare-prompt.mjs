/**
 * 用真实服务量一次默认提示词：已通顺中文被改了多少，病句有没有被改动。
 *
 * 这不是 `pnpm test` 的一部分（那条路不联网）。改完 `src/prompt.ts` 想确认
 * 新措辞真的比旧的好时手动跑：
 *
 *   node scripts/compare-prompt.mjs [--base-url <url>] [--model <name>] [--api-key <key>]
 *
 * 不给参数时用配置页上此刻的通道（读当前 profile 的 patch 与
 * `~/.dsh/.credentials.yaml`），平时跑哪一套就量哪一套。
 *
 * 输出汇总与逐条明细：改动率（编辑距离 / 两者中较长的字数）、完全一致率、
 * 病句被改动的次数、多段中文的丢段次数。判据是「已通顺中文平均改动率 ≤ 10%，
 * 两条病句都被动过，多段中文一段都不丢」——前两条防它偷懒，最后一条防它把
 * 后几段整段省掉。
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_PROMPT } from '../src/prompt.ts';
import { buildUserMessage } from '../src/server/adapters/openai.ts';
import { SAMPLING_TEMPERATURE, SAMPLING_TOP_P } from '../src/server/sampling.ts';
import {
  BAD_CHINESE,
  FOREIGN,
  GOOD_CHINESE,
  INJECTION,
  MARKDOWN,
  PARAGRAPH_KEEP,
} from './prompt-samples.mjs';

const ROUNDS = 5;

function arg(name) {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** 空行分隔的段落数：模型少写几段，这个数就变小。 */
function paragraphCount(text) {
  return text.split(/\n\s*\n/).filter((part) => part.trim() !== '').length;
}

/** 编辑距离除以两者中较长的字数：0 = 一个字没动。 */
function changeRatio(original, translated) {
  const a = [...original];
  const b = [...translated];
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return b.length === 0 ? 1 : dp[a.length][b.length] / Math.max(a.length, b.length);
}

/** 从 credentials 文件里取 Key：只认这一条 ref，别的都不碰。 */
async function readApiKey(home) {
  const file = path.join(home, '.credentials.yaml');
  const text = await fs.readFile(file, 'utf8');
  const match = /^\s*TRANSLATE_API_KEY:\s*["']?([^"'\n]+)["']?\s*$/m.exec(text);
  return match ? match[1] : undefined;
}

/**
 * 从 profile 的 patch 里读取本插件此刻的 Base URL 与模型：平时跑的那一套
 * 就是该拿来量的一套，不为量一次再抄一遍地址。
 */
async function readChannelFromProfile(home) {
  const profiles = path.join(home, 'profiles');
  let entries;
  try {
    entries = await fs.readdir(profiles);
  } catch {
    return {};
  }
  for (const profile of entries) {
    const patch = path.join(profiles, profile, 'cordis.patch.yml');
    let text;
    try {
      text = await fs.readFile(patch, 'utf8');
    } catch {
      continue;
    }
    const block = /- id: dsh-chat-translate[\s\S]*?(?=\n {0,2}- id: |$)/.exec(text)?.[0];
    if (!block) continue;
    const baseUrl = /^\s*baseUrl:\s*(\S+)\s*$/m.exec(block)?.[1];
    const model = /^\s*model:\s*(\S+)\s*$/m.exec(block)?.[1];
    if (baseUrl && model) return { baseUrl, model };
  }
  return {};
}

async function translate({ baseUrl, apiKey, model, text }) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: SAMPLING_TEMPERATURE,
      top_p: SAMPLING_TOP_P,
      max_tokens: 900,
      messages: [{ role: 'user', content: buildUserMessage('plain', text, DEFAULT_PROMPT) }],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content ?? '').trim();
}

const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileChannel = await readChannelFromProfile(home);
const baseUrl = arg('base-url') || profileChannel.baseUrl;
const model = arg('model') || profileChannel.model;
const apiKey = arg('api-key') || (await readApiKey(home));
assert.ok(
  baseUrl && model && apiKey,
  '缺通道配置：在配置页填好 Base URL 与模型，或用 --base-url / --model / --api-key 传进来'
);
const call = (text) => translate({ baseUrl, apiKey, model, text });

// 1. 已通顺中文：跑 ROUNDS 轮，看平均改动率与完全一致率。
const ratios = [];
let identical = 0;
for (let round = 0; round < ROUNDS; round++) {
  for (const sample of GOOD_CHINESE) {
    const ratio = changeRatio(sample, await call(sample));
    ratios.push(ratio);
    if (ratio === 0) identical += 1;
  }
}
ratios.sort((a, b) => a - b);
const average = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
const median = ratios[Math.floor(ratios.length / 2)];
const p90 = ratios[Math.floor(ratios.length * 0.9)];

// 2. 病句：数「被改动了」几次。改得通不通要靠人看下面打出的原文与结果，
//    这里只保证它没有对病句一言不发（那说明模型已经退化成完全不动）。
const badTouched = [];
for (const sample of BAD_CHINESE) {
  let touched = 0;
  for (let round = 0; round < 3; round++) {
    if (changeRatio(sample, await call(sample)) > 0.05) touched += 1;
  }
  badTouched.push(touched);
}

// 3. 外文、markdown、注入句：只看有没有明显退化，各自打一行预览。
const previews = {};
for (const sample of [...FOREIGN, ...MARKDOWN, ...INJECTION]) {
  previews[sample.slice(0, 30)] = await call(sample);
}

// 4. 病句原文与一次实际改写并排打出来，供人判断改得对不对。
const badPreviews = [];
for (const sample of BAD_CHINESE) {
  badPreviews.push({ original: sample, result: await call(sample) });
}

// 5. 成段保真：中文多段原文里，后几段会不会整段不写回来。这是最伤的一类
//    退化——丢掉的正文读者再也看不到，只剩开头那一小段。
const paragraphLoss = [];
for (const sample of PARAGRAPH_KEEP) {
  let lost = 0;
  for (let round = 0; round < ROUNDS; round++) {
    if (paragraphCount(await call(sample)) < paragraphCount(sample)) lost += 1;
  }
  paragraphLoss.push(lost);
}

console.log(`已通顺中文：${GOOD_CHINESE.length} 条 × ${ROUNDS} 轮`);
console.log(`  平均改动率 ${(average * 100).toFixed(1)}%   中位数 ${(median * 100).toFixed(1)}%   p90 ${(p90 * 100).toFixed(1)}%`);
console.log(`  完全一致 ${identical}/${ratios.length}（${((identical / ratios.length) * 100).toFixed(0)}%）`);
console.log(`病句被改动：${badTouched.map((n) => `${n}/3`).join('、')}`);
console.log(`成段保真：${paragraphLoss.map((n) => `${n}/${ROUNDS} 丢段`).join('、')}`);
console.log('');
for (const { original, result } of badPreviews) {
  console.log(`— 病句原文：${original}`);
  console.log(`  译文：${result}`);
}
console.log('');
for (const [key, value] of Object.entries(previews)) {
  console.log(`— ${key}…`);
  console.log(`  ${value.replace(/\n/g, '\n  ')}`);
}

const pass =
  average <= 0.1 && badTouched.every((n) => n > 0) && paragraphLoss.every((n) => n === 0);
console.log('');
console.log(
  pass
    ? '判据通过：平均改动率 ≤ 10%，两条病句都被动过，中文段落一段不丢。'
    : '判据未通过。'
);
process.exitCode = pass ? 0 : 1;

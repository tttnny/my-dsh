/**
 * 用真实服务量一次默认提示词：已通顺中文被改了多少，病句改没改通。
 *
 * 这不是 `pnpm test` 的一部分（那条路不联网）。改完 `src/prompt.ts` 想确认
 * 新措辞真的比旧的好时手动跑：
 *
 *   node scripts/compare-prompt.mjs --base-url http://127.0.0.1:8081/v1 --api-key <key> [--model hy-mt2-1.8b]
 *
 * 不给 `--api-key` 时读 `~/.dsh/.credentials.yaml` 里的 `TRANSLATE_API_KEY`。
 * 输出三行汇总与逐条明细：改动率（编辑距离 / 原文字数）、完全一致率、
 * 病句改通次数。判据是「已通顺中文平均改动率 ≤ 10%，且两条病句至少改通一条」。
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_PROMPT } from '../src/prompt.ts';
import { SAMPLING_TEMPERATURE, SAMPLING_TOP_P } from '../src/server/sampling.ts';
import {
  BAD_CHINESE,
  FOREIGN,
  GOOD_CHINESE,
  INJECTION,
  MARKDOWN,
} from './prompt-samples.mjs';

const ROUNDS = 5;

function arg(name) {
  const index = process.argv.indexOf('--' + name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** 编辑距离除以原文字数：0 = 一个字没动。 */
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
      messages: [{ role: 'user', content: `${DEFAULT_PROMPT}\n\n${text}` }],
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

// 2. 病句：每轮都算「改动了」，三轮里改通几次。
const badFixed = [];
for (const sample of BAD_CHINESE) {
  let fixed = 0;
  for (let round = 0; round < 3; round++) {
    if (changeRatio(sample, await call(sample)) > 0.05) fixed += 1;
  }
  badFixed.push(fixed);
}

// 3. 外文、markdown、注入句：只看有没有明显退化，各自打一行预览。
const previews = {};
for (const sample of [...FOREIGN, ...MARKDOWN, ...INJECTION]) {
  previews[sample.slice(0, 30)] = await call(sample);
}

console.log(`已通顺中文：${GOOD_CHINESE.length} 条 × ${ROUNDS} 轮`);
console.log(`  平均改动率 ${(average * 100).toFixed(1)}%   中位数 ${(median * 100).toFixed(1)}%   p90 ${(p90 * 100).toFixed(1)}%`);
console.log(`  完全一致 ${identical}/${ratios.length}（${((identical / ratios.length) * 100).toFixed(0)}%）`);
console.log(`病句改通：${badFixed.map((n) => `${n}/3`).join('、')}`);
console.log('');
for (const [key, value] of Object.entries(previews)) {
  console.log(`— ${key}…`);
  console.log(`  ${value.replace(/\n/g, '\n  ')}`);
}

const pass = average <= 0.1 && badFixed.some((n) => n > 0);
console.log('');
console.log(pass ? '判据通过：平均改动率 ≤ 10%，且至少一条病句被改通。' : '判据未通过。');
process.exitCode = pass ? 0 : 1;

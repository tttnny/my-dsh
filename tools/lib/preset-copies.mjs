/**
 * 抄本登记表的读法与归一规则。
 *
 * `tools/lib/preset-copies.json` 登记「抄的是哪一个官方 preset、保留哪些差异」。
 * `assert-ledger.mjs` 判据 11 与 `tools/preset-copy.mjs` 都从这里取同一份规则：
 * 归一规则只有一处，才不会出现「检查放行的差异」与「人看到的差异」对不上。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 读抄本登记表。
 * @param {string} root - 仓库根。
 * @returns {{path: string, copies: Array<any>}} 登记表路径与条目。
 */
export function loadCopies(root) {
  const path = join(root, 'tools/lib/preset-copies.json');
  if (!existsSync(path)) return { path, copies: [] };
  return { path, copies: JSON.parse(readFileSync(path, 'utf8')).copies ?? [] };
}

/**
 * 按一条登记把文本归一：去掉空行与注释行、按 dropLines 丢掉抄本自定义行、按 renames
 * 把抄本改回官方写法。官方文件也用同一套 dropLines，两边比较的才是同一件事。
 * @param {string} text - 文件内容。
 * @param {{renames?: Array<{pattern: string, replacement: string}>, dropLines?: string[]}} copy - 登记项。
 * @param {boolean} [applyRenames] - 是否套用 renames（官方那一边不套）。
 * @returns {string} 归一后的文本。
 */
export function normalize(text, copy, applyRenames = true) {
  const drop = (copy.dropLines ?? []).map((pattern) => new RegExp(pattern));
  const renames = applyRenames
    ? (copy.renames ?? []).map(({ pattern, replacement }) => [new RegExp(pattern), replacement])
    : [];
  const kept = text
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^\s*#/.test(line) && !drop.some((re) => re.test(line)));
  return kept
    .map((line) => renames.reduce((out, [re, replacement]) => out.replace(re, replacement), line))
    .filter((line) => line.trim() !== '' && !/^\s*#/.test(line))
    .join('\n')
    .trim();
}

/**
 * 逐行找第一处差异。
 * @param {string} a - 期望文本（官方）。
 * @param {string} b - 实际文本（抄本）。
 * @returns {{line: number, expected: string, actual: string}|undefined} 第一处差异。
 */
export function firstDifference(a, b) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  for (let i = 0; i < Math.max(linesA.length, linesB.length); i += 1) {
    if (linesA[i] !== linesB[i]) return { line: i + 1, expected: linesA[i] ?? '（文件在这里结束）', actual: linesB[i] ?? '（文件在这里结束）' };
  }
  return undefined;
}

/**
 * 列全部差异（最多 limit 条），供人一次性看全。
 * @param {string} a - 期望文本（官方）。
 * @param {string} b - 实际文本（抄本）。
 * @param {number} [limit] - 最多几条。
 * @returns {Array<{line: number, expected: string, actual: string}>} 差异清单。
 */
export function allDifferences(a, b, limit = 40) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(linesA.length, linesB.length) && out.length < limit; i += 1) {
    if (linesA[i] !== linesB[i]) out.push({ line: i + 1, expected: linesA[i] ?? '（文件在这里结束）', actual: linesB[i] ?? '（文件在这里结束）' });
  }
  return out;
}

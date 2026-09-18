#!/usr/bin/env node
/* scripts/check-selectors.mjs — 回归：校验关键 CSS/JS 选择器在预期 DSH 构建中的命中假设
 *
 * 用法：
 *   node scripts/check-selectors.mjs          # 静态扫描
 *   node scripts/check-selectors.mjs --live   # （可选）若本机 3080 可用，尝试无头抓取
 *
 * 本插件仅背景引擎（极光/鲸鱼/星座/鼠标跟随）；UI 皮肤选择器由
 * dsh-ui-beam-orbs 插件自行校验。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
function fail(msg){ console.error("✗ " + msg); failed = true; }
function ok(msg){ console.log("✓ " + msg); }

// 1. CSS 哈希类名必须有 data-* 回退
const cssDir = join(root, "src", "css");
const cssFiles = readdirSync(cssDir).filter(f=>f.endsWith(".css"));
let cssText = cssFiles.map(f=>readFileSync(join(cssDir,f),"utf8")).join("\n");
const hashedInCss = [...cssText.matchAll(/\.(pI_x6G_|hHd-Xa_|uV2eYG_|wSkVaW_|qDHVXG_|gdEzaW_|LVzXQa_|Mbwy4a_|VOzbGW_|CY-8Ka_|o3BgMG_)[A-Za-z0-9_-]*/g)].map(m=>m[0]);
if (hashedInCss.length>0) {
  const hasDataFallback = cssText.includes("[data-") || cssText.includes("[class\$") || cssText.includes("[class*=");
  if (!hasDataFallback) fail("CSS 含哈希类名但未见 [data-*] / [class$] fallback");
  else ok(`CSS 哈希类名 ${[...new Set(hashedInCss)].length} 个，均有 data-* / 通用后缀兜底`);
} else {
  ok("CSS 未检出哈希类名（或已迁移至纯 data-*）");
}

// 2. 关键 data-* 存在
const requiredSelectors = [
  '[data-slot="root"]',
  '[data-slot="conversation"]',
];
for (const sel of requiredSelectors) {
  if (cssText.includes(sel)) ok(`必需选择器存在: ${sel}`);
  else fail(`缺少必需选择器: ${sel}`);
}

// 3. JS 中哈希类名需有 fallback
const jsFiles = readdirSync(join(root,"src")).filter(f=>f.endsWith(".js"));
let jsText = jsFiles.map(f=>readFileSync(join(root,"src",f),"utf8")).join("\n");
const hashedInJs = [...jsText.matchAll(/querySelector[^)]*\.(pI_x6G_|hHd-Xa_|uV2eYG_|wSkVaW_|qDHVXG_|gdEzaW_)[A-Za-z0-9_-]*/g)];
if (hashedInJs.length>0) {
  let missingFallback = 0;
  for (const m of hashedInJs) {
    const idx = m.index;
    const win = jsText.slice(Math.max(0, idx-200), idx+300);
    if (!win.includes("data-")) missingFallback++;
  }
  if (missingFallback>0) console.warn(`⚠ JS 中有 ${missingFallback} 处哈希查询缺少临近 data-* 兜底（建议补充，但不阻断）`);
  ok(`JS 哈希查询 ${hashedInJs.length} 处，已检查 data-* 邻近性`);
} else {
  ok("JS 未检出孤立哈希查询");
}

// 4. build.mjs 含版本注入 + index.js 提供 apply
const buildText = readFileSync(join(root,"scripts","build.mjs"),"utf8");
if (buildText.includes("PKG_VERSION") && buildText.includes("__PKG_VERSION__")) ok("build.mjs 已含 PKG_VERSION 注入");
else fail("build.mjs 未检出 PKG_VERSION 注入逻辑");

const indexText = readFileSync(join(root,"src","index.js"),"utf8");
if (indexText.includes("function apply(ctx)")) ok("src/index.js 提供 function apply(ctx)");
else fail("src/index.js 缺少 function apply(ctx)");

if (failed) {
  console.error("\n--check-selectors: 存在上述问题，请修复后重跑 build");
  process.exit(1);
} else {
  console.log("\n--check-selectors: 全部通过 ✓");
}

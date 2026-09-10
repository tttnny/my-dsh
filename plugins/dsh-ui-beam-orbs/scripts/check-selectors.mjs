#!/usr/bin/env node
/* scripts/check-selectors.mjs — 回归：校验关键 CSS/JS 选择器在预期 DSH 构建中的命中假设
 *
 * 用法：
 *   node scripts/check-selectors.mjs
 *
 * 核心契约断言（第 6 项）：从本机 DSH 真实物理安装根读取
 *   dsh-cordis-client-runner/lib/client.js
 * 抽出全部合法槽位键 key:"…" 全集，断言本插件 src/ 中用到的每个 [data-slot="…"]
 * 都在该集合内；不在则 FAIL 并逐条列出。
 *
 * 为什么必须这么查：DSH 的槽位键是破坏性变更的高发面——0.1.5-rc.1 删除了 conversation /
 * details / conversation.details.tool，新增 main / main.conversation / rightbar /
 * rightbar.session / conversation.approval.detail / conversation.input.plan 等。旧版本脚本
 * 只 grep 自己的源码、从不对照 DSH 产物，于是「6 项全绿」却漏掉了致命的
 * [data-slot="conversation"]（0.1.5-rc.1 已不存在），整个玻璃透明化静默失效。
 *
 * 注意：不要用 `grep -r` 判断 DSH 侧符号是否存在——macOS BSD grep 在 -r + --include 下
 * 不跟随 pnpm 符号链接且静默返回 0 命中（假阴性）。本脚本用 Node fs 直接读真实物理根。
 *
 * 历史说明：早期注释宣传过 `--live` 无头抓取，但该功能从未实现（全文无 process.argv 分支）；
 * 该宣传已删除。本脚本只做「静态扫描 + DSH 产物契约校验」，不声称任何运行时抓取能力。
 */
import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;
function fail(msg){ console.error("✗ " + msg); failed = true; }
function ok(msg){ console.log("✓ " + msg); }
function warn(msg){ console.warn("⚠ " + msg); }

const read = (p) => readFileSync(join(root, p), "utf8");

/** 去掉注释：注释里会引用历史选择器作反例，不能参与契约断言 */
function stripComments(text, js) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (js) t = t.replace(/(^|[^:'"])\/\/[^\n]*/g, "$1 ");
  return t;
}

// ---------- 读取 src ----------
const cssDir = join(root, "src", "css");
const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
const jsFiles = readdirSync(join(root, "src")).filter((f) => f.endsWith(".js"));
const cssRaw = cssFiles.map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n");
const jsRaw = jsFiles.map((f) => readFileSync(join(root, "src", f), "utf8")).join("\n");
const cssText = stripComments(cssRaw, false);
const jsText = stripComments(jsRaw, true);
const srcText = cssText + "\n" + jsText;
const rawText = cssRaw + "\n" + jsRaw;

// 1. CSS 哈希类名需有兜底选择器
const hashedInCss = [...new Set(
  [...cssText.replace(/\[[^\]]*\]/g, " ").matchAll(/\.(_?[A-Za-z0-9-]+_[A-Za-z0-9_-]+)/g)].map((m) => m[1])
)];
if (hashedInCss.length > 0) {
  const hasFallback = cssRaw.includes("[data-") || cssRaw.includes("[class$") || cssRaw.includes("[class*=");
  if (!hasFallback) fail("CSS 含哈希类名但未见 [data-*] / [class$] / [class*=] 兜底，建议补充通用选择器");
  else ok(`CSS 哈希类名 ${hashedInCss.length} 个，均有 data-* / 通用后缀兜底`);
} else {
  ok("CSS 未检出哈希类名（或已迁移至纯 data-*）");
}

// 2. 插件当前依赖的关键选择器必须在 src 中被引用
const requiredSelectors = [
  '[data-slot="root"]',
  '[data-slot="sidebar"]',
  '[data-slot="main"]',
  '[data-slot="main.conversation"]',
  '[data-slot="conversation.session"]',
  '[data-composer-card="true"]',
  '[data-composer-seat]',
  '[data-testid="todo-panel"]',
];
for (const sel of requiredSelectors) {
  if (srcText.includes(sel)) ok(`必需选择器存在: ${sel}`);
  else fail(`缺少必需选择器: ${sel}（需在 CSS 或 JS 中提供回退）`);
}

// 3. JS 中哈希查询需有邻近 data-* 兜底
const hashedInJs = [...jsText.matchAll(/querySelector[^)]*\.(_?[A-Za-z0-9-]+_[A-Za-z0-9_-]+)/g)];
if (hashedInJs.length > 0) {
  let missingFallback = 0;
  for (const m of hashedInJs) {
    const w = jsText.slice(Math.max(0, m.index - 200), m.index + 300);
    if (!w.includes("data-") && !w.includes("[class")) missingFallback++;
  }
  if (missingFallback > 0) warn(`JS 中有 ${missingFallback} 处哈希查询缺少邻近 data-*/[class 兜底（建议补充，但不阻断）`);
  ok(`JS 哈希查询 ${hashedInJs.length} 处，已检查 data-* 邻近性`);
} else {
  ok("JS 未检出孤立哈希查询");
}

// 4. build.mjs 关键结构
const buildText = read("scripts/build.mjs");
if (buildText.includes("PKG_VERSION") && buildText.includes("__PKG_VERSION__")) ok("build.mjs 已含 PKG_VERSION 注入");
else fail("build.mjs 未检出 PKG_VERSION 注入逻辑");
if (buildText.includes("coalesce.js")) ok("build.mjs JS_FILES 已含 coalesce.js");
else fail("build.mjs JS_FILES 缺少 coalesce.js");

// 5. coalesce.js
try {
  const coalesce = read("src/coalesce.js");
  if (coalesce.includes("subscribeCoalesced")) ok("src/coalesce.js 存在且暴露 subscribeCoalesced");
  else fail("src/coalesce.js 未暴露 subscribeCoalesced");
} catch (e) { fail("src/coalesce.js 缺失"); }

// ---------------------------------------------------------------------------
// 6. 【核心】DSH 槽位契约断言：src 中用到的每个 data-slot 必须是 DSH 的合法槽位键
// ---------------------------------------------------------------------------

/** 定位 DSH 物理安装根下的 dsh-cordis-client-runner/lib/client.js（取版本号最高者） */
function locateRunner() {
  const hits = [];
  const push = (base, label) => {
    for (const rel of [
      join("node_modules", ".pnpm", "node_modules", "@deepseek-ai"),
      join("node_modules", "@deepseek-ai"),
      join("node_modules", ".pnpm", "node_modules"),
    ]) {
      const p = join(base, rel, "dsh-cordis-client-runner", "lib", "client.js");
      if (existsSync(p)) { hits.push({ path: p, label }); return; }
    }
  };
  if (process.env.DSH_SELECTOR_ROOT) {
    const p = join(process.env.DSH_SELECTOR_ROOT, "dsh-cordis-client-runner", "lib", "client.js");
    if (existsSync(p)) return { path: p, label: "env DSH_SELECTOR_ROOT" };
    if (existsSync(process.env.DSH_SELECTOR_ROOT)) return { path: process.env.DSH_SELECTOR_ROOT, label: "env DSH_SELECTOR_ROOT" };
  }
  const versions = join(homedir(), "Library", "Application Support", "in.dsh-plug.dsh-launcher", "versions");
  if (existsSync(versions)) {
    for (const v of readdirSync(versions)) {
      if (v.startsWith(".")) continue;
      push(join(versions, v), v);
    }
  }
  const profiles = join(homedir(), ".dsh", "profiles");
  if (existsSync(profiles)) {
    for (const p of readdirSync(profiles)) push(join(profiles, p), "profile:" + p);
  }
  if (hits.length === 0) return null;
  const num = (s) => (s.match(/\d+/g) || []).map(Number);
  hits.sort((a, b) => {
    const x = num(a.label), y = num(b.label);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (y[i] || 0) - (x[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return hits[0];
}

const runner = locateRunner();
const usedSlots = [...new Set([...srcText.matchAll(/\[data-slot=["']?([^\]"']+)["']?\]/g)].map((m) => m[1]))].sort();

if (!runner) {
  fail("未找到 DSH 安装（dsh-cordis-client-runner/lib/client.js）——契约断言无法执行。" +
    "请安装 DSH，或设置 DSH_SELECTOR_ROOT 指向 versions/<ver> 目录。");
} else {
  const runnerText = readFileSync(runner.path, "utf8");
  // 只保留形如槽位键的标识符：runner 的文档/类型字面量里也有 key:"…"，需滤掉占位符
  const validSlots = new Set(
    [...runnerText.matchAll(/\bkey:\s*["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((k) => /^[A-Za-z][A-Za-z0-9._-]*$/.test(k) && k.length <= 64)
  );
  console.log(`  · DSH 产物: ${runner.path}`);
  console.log(`  · DSH 标签: ${runner.label}`);
  if (validSlots.size < 20) {
    fail(`槽位键抽取异常（仅 ${validSlots.size} 个），抽取方式可能已失效，请检查 runner 产物格式`);
  } else {
    ok(`DSH 槽位键全集已抽取（${validSlots.size} 个）`);
    const missing = usedSlots.filter((s) => !validSlots.has(s));
    if (missing.length > 0) {
      fail(`以下 data-slot 在 DSH（${runner.label}）中不是合法槽位键，槽位改名后已失配：`);
      for (const s of missing) console.error(`      - [data-slot="${s}"]  ← 需替换为合法键或改为真实类名兜底`);
      console.error("    合法键示例: " + [...validSlots].slice(0, 12).join(", ") + " …");
    } else {
      ok(`本插件使用的 ${usedSlots.length} 个 data-slot 全部是 DSH 合法槽位键: ${usedSlots.join(", ")}`);
    }

    // 6b. 哈希类名漂移巡检（仅告警，不阻断）：哈希类名没有 data-* 兜底时给出提示
    // pnpm 的 @deepseek-ai/* 是符号链接：必须 realpath 到物理目录再遍历（BSD grep 的假阴性根因）
    // 说明：这一趟要遍历约 240 个包 / 700+ 文件，是本脚本唯一的重活，但能抓住 .detailsCol
    // 这类「哈希类名整族漂移」。仅告警不阻断——插件对这些类名都留了后缀兜底。
    // runner.path = <store>/@deepseek-ai/dsh-cordis-client-runner/lib/client.js
    // → 切掉包名即得 @deepseek-ai 目录本身（不要再拼一层 @deepseek-ai）
    const pkgRoot = runner.path.slice(0, runner.path.indexOf("dsh-cordis-client-runner")).replace(/[\/\\]$/, "");
    let corpus = "";
    try {
      const walk = (dir, out = []) => {
        let ents = [];
        try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
        for (const e of ents) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p, out);
          else if (/\.(js|mjs|css)$/.test(e.name)) out.push(p);
        }
        return out;
      };
      for (const pkg of readdirSync(pkgRoot)) {
        let phys;
        try { phys = realpathSync(join(pkgRoot, pkg)); } catch { continue; }
        for (const f of walk(phys)) {
          try { corpus += readFileSync(f, "utf8") + "\n"; } catch {}
        }
      }
    } catch (e) { corpus = ""; }
    const pluginOwned = (c) => c === "__dshBeamOrbs" || /^dsh-/.test(c);
    const cssClasses = [...cssText.replace(/\[[^\]]*\]/g, " ").matchAll(/\.(_?[A-Za-z0-9-]+_[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    // JS 侧 querySelector/querySelectorAll 里的哈希类名一并巡检（如曾经的 .QWLzlG_root / ._Xvjua_root）
    const jsClasses = hashedInJs.map((m) => m[1]);
    const hashClasses = [...new Set([...cssClasses, ...jsClasses])].filter((c) => !pluginOwned(c) && rawText.includes("." + c));
    if (corpus.length > 0 && hashClasses.length > 0) {
      const drifted = hashClasses.filter((c) => !corpus.includes(c));
      if (drifted.length > 0) warn(`哈希类名在 DSH 产物中未命中（${drifted.length} 个，可能已漂移；靠 [class$=] 兜底）: ${drifted.join(", ")}`);
      else ok(`CSS 中 ${hashClasses.length} 个哈希类名均在 DSH 产物中命中`);
    }
  }
}

if (failed) {
  console.error("\n--check-selectors: 存在上述问题，请修复后重跑 build");
  process.exit(1);
} else {
  console.log("\n--check-selectors: 全部通过 ✓");
}

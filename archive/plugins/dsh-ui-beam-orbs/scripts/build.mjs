#!/usr/bin/env node
/* scripts/build.mjs — 把 src/ 拼接为 lib/client.js（零依赖，Node ≥ 18）
 *
 * 用法：
 *   node scripts/build.mjs          重新生成 lib/client.js（确定性输出）
 *   node scripts/build.mjs --check  校验现有 lib/client.js 与 src/ 一致（不一致退出码 1）
 *
 * 布局约定：
 *   - src/css/*.css         原始样式表，按文件名排序拼接进 <style> 标签
 *   - src/*.js              工厂级片段（纯常量/纯函数）与 initX(shared) 模块，
 *                           按下方 JS_FILES 顺序拼接进工厂闭包；index.js 必须最后
 *   - 源码禁止顶层 import/export（拼接构建不支持 ESM 语法）
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "lib", "client.js");
const PKG_VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version || "0.0.0";

/** JS 源码文件（按序拼接；index.js 必须最后，负责 apply 与 init 编排）
 *  本插件为 UI 皮肤层：玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse。 */
const JS_FILES = [
  "beam-css.js",         // 工厂级：Border Beam 调色板与 CSS 生成
  "orbs-math.js",        // 工厂级：Thinking Orbs 几何数学
  "theme.js",            // initTheme（主题检测）
  "settings.js",         // initSettings（界面特效设置）
  "coalesce.js",         // 合批 MutationObserver（供 beam/orbs/shell 订阅）
  "beam.js",             // initBeam
  "orbs.js",             // initOrbs
  "shell.js",            // initShell（玻璃透明化 + 诊断）
  "observer.js",         // initObserver
  "boot.js",             // initBoot
  "index.js"             // apply(ctx)
];

/** 样式表头（CSS 模板字面量开头的说明块，与原 client.js 一致） */
const CSS_HEADER = `/*!
 * dsh-ui-beam-orbs.css
 * DSH Web GUI 界面皮肤层：玻璃拟态 + Border Beam + Thinking Orbs +
 * Pulse 任务清单框 + 发送按钮微动效。
 *
 * 深色主题：全部界面覆盖生效（body[data-ds-dark-theme]）；
 * 浅色主题：恢复 DSH 官方原版外观，不匹配任何覆盖规则。
 * 背景引擎（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 */`;

function read(name) {
  return readFileSync(join(root, name), "utf8");
}

function build() {
  // 1. CSS：src/css/*.css 按文件名排序，去尾部空行后以空行拼接
  const cssDir = join(root, "src", "css");
  if (!existsSync(cssDir)) throw new Error("src/css 目录缺失——源码结构被破坏，请检查仓库状态");
  const cssFiles = readdirSync(cssDir)
    .filter((f) => f.endsWith(".css"))
    .sort();
  if (cssFiles.length === 0) throw new Error("src/css/ 下没有 .css 文件");
  const parts = cssFiles.map((f) => read(join("src", "css", f)).replace(/\s+$/, "\n"));
  const css = CSS_HEADER + "\n\n" + parts.join("\n");
  if (/`|\$\{/.test(css)) {
    throw new Error("src/css/*.css 含反引号或 ${——会破坏产物模板字面量，请改写或转义");
  }

  // 2. 校验：src 内不允许顶层 import/export；index.js 必须提供 apply
  const jsDir = join(root, "src");
  const onDisk = readdirSync(jsDir).filter((f) => f.endsWith(".js")).sort();
  const untracked = onDisk.filter((f) => !JS_FILES.includes(f));
  if (untracked.length > 0) {
    throw new Error(`src/ 下有未加入 JS_FILES 的 JS 文件（会静默漏拼进产物）: ${untracked.join(", ")}`);
  }
  for (const f of JS_FILES) {
    const src = read(join("src", f));
    for (const m of src.matchAll(/^(?!\s*\/\/)\s*(import|export)\b/gm)) {
      throw new Error(`${f}: 源码含顶层 ${m[1]} 语句——拼接构建不支持 ESM，请用普通 function/var 声明`);
    }
    if (f === "index.js" && !src.includes("function apply(ctx)")) {
      throw new Error("src/index.js 缺少 function apply(ctx)");
    }
  }

  // 3. JS：按序拼接，每段前加来源标记；注入 package.json 版本号到 dom.js 占位
  let js = JS_FILES.map((f) => `\n/* ===================== ${f} ===================== */\n${read(join("src", f))}`).join("\n");
  js = js.replaceAll("__PKG_VERSION__", PKG_VERSION);

  // 4. 组装工厂闭包（产物结构与原 client.js 一致）
  return `/*!
 * dsh-ui-beam-orbs 客户端入口（自动生成）
 * 由 scripts/build.mjs 从 src/ 拼接生成——请勿直接修改本文件；
 * 修改源码（src/ 下的模块与 CSS）后运行：node scripts/build.mjs
 */
window.__ModuleLoader__.load({
  id: "@lynn123411/dsh-ui-beam-orbs",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // 设置页面板需要 React（平台 seed 模块）；拿不到就跳过设置 UI，不影响界面效果
    var react = null;
    try { react = require("react"); } catch (e) {}
    if (document.getElementById("dsh-beam-orbs-css") === null) {
      var styleTag = document.createElement("style");
      styleTag.id = "dsh-beam-orbs-css";
      styleTag.textContent = \`
${css}
\`;
      document.head.appendChild(styleTag);
    }
${js}

    exports.apply = apply;
    // 设置面板依赖 slots 服务（由 dsh-client-ui-slots 提供）；未就绪时等待其出现
    exports.inject = ["slots"];
    return module.exports;
  }
});
`;
}

const checkOnly = process.argv.includes("--check");
const out = build();

if (checkOnly) {
  const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
  if (existing !== out) {
    console.error("--check: lib/client.js 与 src/ 不一致（先运行 node scripts/build.mjs 重新生成）");
    process.exit(1);
  }
  console.log("--check: lib/client.js 与 src/ 一致 ✓");
} else {
  const tmp = mkdtempSync(join(tmpdir(), "dsh-bg-"));
  const tmpFile = join(tmp, "client.js");
  writeFileSync(tmpFile, out);
  renameSync(tmpFile, OUT);
  try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(`已生成 lib/client.js（${out.length} 字节：CSS ${readdirSync(join(root, "src", "css")).filter((f) => f.endsWith(".css")).length} 个文件 + JS ${JS_FILES.length} 个文件）`);
}

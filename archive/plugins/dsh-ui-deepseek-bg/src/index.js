/* ===================================================================== *
 * src/index.js — 客户端入口 apply(ctx)（由 scripts/build.mjs 拼接进工厂闭包）
 *   本插件只负责背景引擎：极光 / 粒子鲸鱼 / 星座网格 + 鼠标跟随交互
 *   （玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse 已拆分至
 *    dsh-ui-beam-orbs 插件）。
 *   创建 shared（media / state / settings / dom / refs），按依赖顺序调用
 *   各子系统的 initX，装配 window.__dshDeepSeekBg 调试句柄，最后按原执行
 *   顺序执行 applyThemeClass → boot。
 * ===================================================================== */
function apply(ctx) {
  "use strict";
  if (window.__dshDeepSeekBg && window.__dshDeepSeekBg._inited) return;
  if (typeof document === "undefined") return;

  if (typeof window.__dshDeepSeekBg !== 'object' || window.__dshDeepSeekBg === null) window.__dshDeepSeekBg = {};
  window.__dshDeepSeekBg._inited = true;

  /* 跨模块共享状态：预建全部容器对象，各 initX 捕获引用后后续填充依然有效 */
  var shared = {
    media: {
      darkQuery: window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null,
      reducedMotion: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      coarse: !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches),
      isWindows: (navigator.userAgentData && navigator.userAgentData.platform === "Windows") ||
        navigator.userAgent.indexOf("Windows") !== -1
    },
    state: { dark: false },
    settings: {},
    dom: {},
    refs: {},
    ctx: ctx
  };

  // 依赖顺序：theme → settings → dom → 渲染引擎 → observer → diag → boot
  initTheme(shared);         // 主题检测 / 官方参数配置 / state.dark 初值
  initSettings(shared);      // bgSettings（shared.settings）+ 设置页 UI（背景引擎四项）
  initDom(shared);           // 背景容器 / 极光 / 星座 canvas / 鲸鱼层 / diag
  initAurora(shared);        // 极光引擎（shader 在 aurora-shaders.js）
  initWhale(shared);         // 粒子鲸鱼（shader/矩阵在 whale-shaders.js）
  initConstellation(shared); // 星座网格
  initObserver(shared);      // 主题联动（MutationObserver + matchMedia）
  initDiag(shared);          // 诊断面板（?dshtest=1）
  initBoot(shared);          // 启动编排（原 boot()）

  // 与原执行顺序一致：applyThemeClass（原 1833）→ setupSettingsUi（原 5014）→ boot()（原 5015）
  if (shared.refs.applyThemeClass) shared.refs.applyThemeClass();
  if (shared.refs.setupSettingsUi) shared.refs.setupSettingsUi(ctx);
  if (shared.refs.boot) shared.refs.boot();
}

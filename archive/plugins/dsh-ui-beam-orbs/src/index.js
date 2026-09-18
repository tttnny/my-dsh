/* ===================================================================== *
 * src/index.js — 客户端入口 apply(ctx)（由 scripts/build.mjs 拼接进工厂闭包）
 *   dsh-ui-beam-orbs：UI 皮肤层插件 —— 玻璃拟态 / Border Beam /
 *   Thinking Orbs / 任务清单 Pulse / 发送按钮微动效。
 *   背景引擎（极光/鲸鱼/星座/鼠标跟随）在 dsh-ui-deepseek-bg 插件。
 *   深色主题全部生效；浅色主题恢复 DSH 官方原版（CSS 门控 body[data-ds-dark-theme]）。
 *   创建 shared（media / state / settings / dom / refs），按依赖顺序调用
 *   各子系统的 initX，装配 window.__dshBeamOrbs 调试句柄。
 *   工厂级 seed `react`（构建模板注入）仅由 src/settings.js 的设置页 UI 使用。
 * ===================================================================== */
function apply(ctx) {
  "use strict";
  if (window.__dshBeamOrbs && window.__dshBeamOrbs._inited) return;
  if (typeof document === "undefined") return;

  if (typeof window.__dshBeamOrbs !== 'object' || window.__dshBeamOrbs === null) window.__dshBeamOrbs = {};
  window.__dshBeamOrbs._inited = true;

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
    dom: { diag: { theme: "?", bodyBg: "?", htmlBg: "?", containerPos: "?", containerZ: "?", containerBg: "?", frameFound: false, frameBg: "?", glassEls: 0 } },
    refs: {},
    ctx: ctx
  };

  // 依赖顺序：theme → settings → coalesce → beam → orbs → shell → observer → boot
  initTheme(shared);         // 主题检测 / state.dark 初值
  initSettings(shared);      // gsSettings（shared.settings）+ 设置页 UI（界面特效）
  initCoalesce(shared);      // 合批 MutationObserver（供 beam/orbs/shell 订阅）
  initBeam(shared);          // Border Beam 状态机 + composer/todo 集成（CSS 在 beam-css.js）
  initOrbs(shared);          // Thinking Orbs 运行时（几何数学在 orbs-math.js）
  initShell(shared);         // 玻璃透明化 + 诊断面板
  initObserver(shared);      // 主题联动（MutationObserver + matchMedia）
  initBoot(shared);          // 启动编排（原 boot()）

  // 调试句柄（beam/orbs 句柄对象由各自模块构造后注册）
  try {
    if (typeof window.__dshBeamOrbs !== "object" || window.__dshBeamOrbs === null) window.__dshBeamOrbs = {};
    window.__dshBeamOrbs.beam = shared.refs.beamHandle;
    window.__dshBeamOrbs.orbs = shared.refs.orbsHandle;
  } catch (e) {}

  if (shared.refs.setupSettingsUi) shared.refs.setupSettingsUi(ctx);
  if (shared.refs.boot) shared.refs.boot();
}

/* ------------------------------------------------------------------ *
 * src/boot.js — 启动编排（initBoot）
 *   在全部 initX 之后由 apply 调用；跨模块启动函数一律经 shared.refs.*。
 *   仅启动背景引擎（极光/鲸鱼/星座/主题观察/诊断）；
 *   UI 皮肤启动（玻璃/Beam/Orbs）在 dsh-ui-beam-orbs 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBoot(shared) {
  var media = shared.media;

  function boot() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", boot, { once: true }); return; }
    // body 背景透明化由 applyThemeClass 按主题管理（浅色主题保持官方原版）
    shared.refs.applyThemeClass();
    document.body.appendChild(shared.dom.container);
    shared.refs.startAurora();
    if (typeof location === "undefined" || location.search.indexOf("nowhale") === -1) shared.refs.startWhale();
    if (!media.coarse || media.reducedMotion) shared.refs.startConstellation();
    shared.refs.observeTheme();
    if (typeof location !== "undefined" && (location.search.indexOf("dshtest") !== -1)) shared.refs.startDiagPanel();
  }

  shared.refs.boot = boot;
}

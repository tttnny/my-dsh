/* ------------------------------------------------------------------ *
 * src/observer.js — 主题联动（initObserver，MutationObserver + matchMedia）
 *   监听到主题属性 / prefers-color-scheme 变化时重新检测 state.dark，
 *   并联动 applyThemeClass（深色显示背景层；浅色恢复官方原版）。
 *   UI 皮肤联动（玻璃/Beam）由 dsh-ui-beam-orbs 插件自行处理。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initObserver(shared) {
  var state = shared.state;

  function observeTheme() {
    var apply = function () {
      var d = (shared.refs.detectDark) ? shared.refs.detectDark() :
        !!(shared.media.darkQuery && shared.media.darkQuery.matches);
      if (d !== state.dark) {
        state.dark = d;
        try { shared.refs.applyThemeClass(); } catch(e){}
      }
    };
    if (window.MutationObserver) {
      if (!shared.refs.themeObserver) {
        var mo = new MutationObserver(apply);
        shared.refs.themeObserver = mo;
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
      }
    }
    if (shared.media.darkQuery && shared.media.darkQuery.addEventListener) {
      shared.media.darkQuery.addEventListener("change", apply);
    } else if (shared.media.darkQuery && shared.media.darkQuery.addListener) {
      shared.media.darkQuery.addListener(apply); // 旧版 Safari/WebView 回退
    }
  }

  shared.refs.observeTheme = observeTheme;
}

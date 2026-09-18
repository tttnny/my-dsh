/* ------------------------------------------------------------------ *
 * src/observer.js — 主题联动（initObserver，MutationObserver + matchMedia）
 *   监听到主题属性 / prefers-color-scheme 变化时重新检测 state.dark，
 *   并联动 Border Beam（深浅两套参数）与玻璃层（仅深色应用）。
 *   背景引擎的主题联动在 dsh-ui-deepseek-bg 插件。
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
        try{ if (shared.refs.applyThemeClass) shared.refs.applyThemeClass(); }catch(e){}
        try{ if (shared.refs.refreshBeamTheme) shared.refs.refreshBeamTheme(); }catch(e){}
        try{ if (shared.refs.shellGlassApply) shared.refs.shellGlassApply(); }catch(e){}
      } else {
        // theme 值未变也要保证 beam 的深浅参数与当前主题一致（如初始浅色）
        try{ if (shared.refs.refreshBeamTheme) shared.refs.refreshBeamTheme(); }catch(e){}
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

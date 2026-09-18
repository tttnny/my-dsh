/* ------------------------------------------------------------------ *
 * src/theme.js — 主题检测（initTheme）
 *   本插件（dsh-ui-beam-orbs）独立检测主题：深色时应用
 *   玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse；
 *   浅色主题恢复 DSH 官方原版外观（CSS 全部门控在 body[data-ds-dark-theme]）。
 *   背景引擎（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initTheme(shared) {
  var state = shared.state;

  function detectDark() {
    var b = document.body;
    var d = document.documentElement;
    if (b && b.hasAttribute("data-ds-dark-theme")) return true;
    if (d && d.hasAttribute("data-ds-dark-theme")) return true;
    if (b && b.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.dataset) {
      if (d.dataset.theme === "dark") return true;
      if (d.dataset.theme === "light") return false;
    }
    // 官方 ThemePresenter 会把解析后的主题写入 <html> 的 color-scheme，
    // 比 prefers-color-scheme 更权威（用户显式选浅色而系统深色时依然正确）
    if (d && d.style && d.style.colorScheme) {
      if (d.style.colorScheme === "dark") return true;
      if (d.style.colorScheme === "light") return false;
    }
    return !!(shared.media.darkQuery && shared.media.darkQuery.matches);
  }

  state.dark = detectDark();

  shared.refs.detectDark = detectDark;
}

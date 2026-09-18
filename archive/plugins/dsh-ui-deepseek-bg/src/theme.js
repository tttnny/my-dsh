/* ------------------------------------------------------------------ *
 * src/theme.js — 主题检测与官方参数配置（initTheme）
 *   深色主题：官方 harness 深色配置（fluid 渲染 + 深色星座）；
 *   浅色主题：恢复 DSH 官方原版外观——背景层隐藏、界面零覆盖，
 *   极光/星座（若引擎运行）使用官方浅色 hero 参数（particle 渲染）。
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

  /* ------------------------------------------------------------------ *
   * 官方参数配置
   *   浅色：www.deepseek.com 首页 hero（particle 渲染）
   *   深色：www.deepseek.com/harness hero（fluid 渲染）
   * ------------------------------------------------------------------ */
  var LIGHT_AURORA = {
    type: "particle",
    mouseRadius: 0.22, mouseStrength: 1.1, mouseSmoothing: 0.12, mouseVelocity: 0.15,
    decay: 0.96, distortBoost: 1.35, noiseBoost: 0, swirlBoost: 0.45,
    glowIntensity: 0, glowColors: ["#ffffff", "#ffffff", "#ffffff"],
    speed: 14, distortion: 20, swirl: 12, swirlIterations: 8,
    scale: 0.5, rotation: -5, proportion: 50, softness: 100, shapeScale: 10,
    offsetX: 0, offsetY: 65,
    colors: ["#8AA3D6", "#FFFFFF", "#FFFFFF"],
    lightX: 0.89, lightY: 0.46, lightCore: 0, lightHalo: 0, vignette: 0, lightFollow: 0,
    bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0, grain: 0
  };

  /* 官方深色 hero（www.deepseek.com/harness）参数，逐项取自缓存
     page-07f506a1408ad0e8.js 中的 k 配置（fluid 渲染） */
  var DARK_AURORA = {
    type: "fluid",
    mouseRadius: 0.09, mouseStrength: 1.8, mouseSmoothing: 0.1, mouseVelocity: 0.2,
    decay: 0.925, distortBoost: 2.2, noiseBoost: 0.3, swirlBoost: 0.8,
    glowIntensity: 0.13, glowColors: ["#fff7d1", "#538dca", "#2d448b"],
    speed: 28, distortion: 18, swirl: 20, swirlIterations: 12,
    scale: 1.77, rotation: 15, proportion: 60, softness: 80, shapeScale: 0,
    offsetX: -124, offsetY: -48,
    colors: ["#000000", "#1A3870", "#204a7e", "#eed8aa", "#000000"],
    lightX: 0.89, lightY: 0.46, lightCore: 0.14, lightHalo: 0.2, vignette: 0.38, lightFollow: 0.63,
    bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0.4, grain: 0.005
  };

  var LIGHT_CONSTELLATION = { lineColor: "rgba(60, 100, 160,", dotColor: "rgba(60, 100, 160,", lineOpacity: 0.1, dotOpacity: 0.2, round: true };
  var DARK_CONSTELLATION = { lineColor: "rgba(255, 255, 255,", dotColor: "rgba(255, 255, 255,", lineOpacity: 0.08, dotOpacity: 0.16, round: false };

  function currentAuroraConfig() { return state.dark ? DARK_AURORA : LIGHT_AURORA; }
  function currentConstellation() { return state.dark ? DARK_CONSTELLATION : LIGHT_CONSTELLATION; }

  state.dark = detectDark();

  shared.refs.detectDark = detectDark;
  shared.refs.currentAuroraConfig = currentAuroraConfig;
  shared.refs.currentConstellation = currentConstellation;
}

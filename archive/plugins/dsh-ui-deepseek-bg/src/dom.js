/* ------------------------------------------------------------------ *
 * src/dom.js — DOM 骨架（initDom）
 *   创建背景容器 / 极光画布 / 星座画布 / 鲸鱼层 / 诊断对象，填入 shared.dom；
 *   定义 applyThemeClass（按主题切换：深色全特效；浅色恢复官方原版）。
 *   主题标记（body[data-ds-dark-theme]）由 DSH 官方 ThemePresenter 管理，
 *   本插件不再回写，避免与官方主题系统互相覆盖。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initDom(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;

/* ------------------------------------------------------------------ *
   * DOM 骨架
   * ------------------------------------------------------------------ */
  shared.dom.container = document.createElement("div");
  shared.dom.container.id = "dsh-ds-bg";
  shared.dom.container.dataset.version = "__PKG_VERSION__"; // 部署版本标记：由 build.mjs 从 package.json 注入，页面可查 document.getElementById('dsh-ds-bg')?.dataset.version
  // 关键样式内联兜底：背景层 fixed + 底层；浅色为官方浅色渐变（由 CSS 隐藏），
  // 深色为主题底色（.dsh-ds-dark / applyThemeClass 切换）
  // GPU 优化：不再常驻 will-change:opacity,filter——它会在入场动画结束后仍强制
  // 全屏容器保持独立合成层；合成器对运行中的动画本就会自动提升，观感不变
  shared.dom.container.style.cssText = "position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;" +
    "background:linear-gradient(180deg,#9cc1e7 0%,rgba(250,250,250,0) 100%),#f9f8f8;" +
    "animation:dsh-ds-enter 1.8s ease-out backwards;";
  var MASK = "linear-gradient(#000000fc 0%,#000000e8 8.98%,transparent 100%)";
  shared.dom.auroraCanvas = document.createElement("canvas");
  shared.dom.auroraCanvas.id = "dsh-ds-aurora";
  shared.dom.auroraCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;" +
    "mask:" + MASK + ";-webkit-mask:" + MASK + ";";
  shared.dom.constellationCanvas = document.createElement("canvas");
  shared.dom.constellationCanvas.id = "dsh-ds-constellation";
  shared.dom.constellationCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;background:transparent;" +
    "mask:" + MASK + ";-webkit-mask:" + MASK + ";";
  shared.dom.container.appendChild(shared.dom.auroraCanvas);
  // 鲸鱼层：仅深色主题显示（官方深色 hero 元素），浅色保持官方原版
  shared.dom.whaleLayer = document.createElement("div");
  shared.dom.whaleLayer.className = "dsh-ds-whale";
  shared.dom.whaleLayer.setAttribute("aria-hidden", "true");
  shared.dom.whaleLayer.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;" +
    "pointer-events:none;mix-blend-mode:screen;z-index:2;";
  shared.dom.whaleCanvas = document.createElement("canvas");
  shared.dom.whaleCanvas.className = "dsh-ds-whale-canvas";
  shared.dom.whaleCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";
  shared.dom.whaleLayer.appendChild(shared.dom.whaleCanvas);
  shared.dom.container.appendChild(shared.dom.whaleLayer);
  shared.dom.container.appendChild(shared.dom.constellationCanvas);

  /* 诊断信息（?dshtest=1 时输出到页面面板） */
  shared.dom.diag = { theme: "?", bodyBg: "?", htmlBg: "?", containerPos: "?", containerZ: "?", containerBg: "?", frameFound: false, frameBg: "?", auroraGL: false, auroraProgs: "", whaleGL: false, whaleProgs: "", constellation: false, canvasW: 0, canvasH: 0 };

  function applyThemeClass() {
    var dark = state.dark;
    shared.dom.container.classList.toggle("dsh-ds-dark", dark);
    shared.dom.container.style.setProperty("background", dark ? "#0a0a0a" :
      "linear-gradient(180deg,#9cc1e7 0%,rgba(250,250,250,0) 100%),#f9f8f8", "important");
    if (shared.refs.updateWhaleDisplay) shared.refs.updateWhaleDisplay();
    try { document.body.classList.toggle("dsh-bg-no-glass", !bgSettings.glass); } catch (e) {}
    if (document.body) {
      // 深色主题：body 透明让背景透出；浅色主题：移除覆盖，恢复官方原版
      if (dark) document.body.style.setProperty("background", "transparent", "important");
      else document.body.style.removeProperty("background");
    }
  }

  shared.refs.applyThemeClass = applyThemeClass;
}

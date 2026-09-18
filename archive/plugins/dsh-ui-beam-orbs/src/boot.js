/* ------------------------------------------------------------------ *
 * src/boot.js — 启动编排（initBoot）
 *   在全部 initX 之后由 apply 调用；跨模块启动函数一律经 shared.refs.*。
 *   启动 UI 皮肤：主题观察 / 玻璃透明化 / Beam（composer+todo）/ Orbs。
 *   背景引擎启动（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBoot(shared) {
  function boot() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", boot, { once: true }); return; }
    shared.refs.observeTheme();
    shared.refs.makeShellTransparent();
    try{ shared.refs.watchBeamComposer(); }catch(e){}
    try{ shared.refs.watchBeamTodo(); }catch(e){}
    try{ shared.refs.watchThinkingOrbs(); }catch(e){}
    if (typeof location !== "undefined" && (location.search.indexOf("dshtest") !== -1)) shared.refs.startDiagPanel();
    // 调试钩子：显式开启（localStorage dsh-bg-debug=1 或 ?dshdbg=1）才执行 opencv/opendbg，避免生产 URL 误触
    var dbgEnabled = false; try { dbgEnabled = localStorage.getItem("dsh-bg-debug") === "1" || (typeof location !== "undefined" && location.search.indexOf("dshdbg") !== -1); } catch(e){}
    // 调试钩子：?opencv=1 时展开侧边栏并打开第一个会话（检查真实消息 DOM 的代码块类名）
    if (dbgEnabled && typeof location !== "undefined" && location.search.indexOf("opencv") !== -1) {
      setTimeout(function () {
        var toggle = document.querySelector(".hHd-Xa_toggle, [aria-label*=\"sidebar\"], [aria-label*=\"侧边栏\"]");
        if (toggle) toggle.click();
        setTimeout(function () {
          var first = document.querySelector('.bhn1Oq_list [role="button"], .bhn1Oq_list button, [data-slot="sidebar.workspaces"] [role="button"]');
          if (first) first.click();
          setTimeout(function () {
            var codes = document.querySelectorAll("pre, [class*=\"_block_\"], [class*=\"_banner\"], [class*=\"_body\"], code");
            var dump = document.createElement("div");
            dump.id = "dsh-dbg-codes";
            dump.style.display = "none";
            var cls = [];
            for (var i = 0; i < codes.length; i++) {
              var c = codes[i].className;
              if (typeof c === "string" && c) cls.push(c.split(" ")[0]);
            }
            dump.setAttribute("data-classes", cls.join(","));
            document.body.appendChild(dump);
          }, 3000);
        }, 2500);
      }, 3500);
    }
    // 调试钩子：?opendbg=1 时自动打开设置页（用于无头浏览器检查设置页布局）
    if (dbgEnabled && typeof location !== "undefined" && location.search.indexOf("opendbg") !== -1) {
      setTimeout(function () {
        var triggers = document.querySelectorAll('button, [role="button"]');
        for (var i = 0; i < triggers.length; i++) {
          var t = triggers[i];
          var label = (t.getAttribute("aria-label") || t.textContent || "").toLowerCase();
          if (label.indexOf("settings") !== -1 || label.indexOf("设置") !== -1) { t.click(); break; }
        }
        setTimeout(function () {
          var panel = document.querySelector(".VOzbGW_panel");
          var dump = document.createElement("div");
          dump.id = "dsh-dbg-settings";
          dump.style.display = "none";
          dump.setAttribute("data-opened", panel ? "yes" : "no");
          if (panel) dump.setAttribute("data-html", panel.outerHTML.slice(0, 20000));
          document.body.appendChild(dump);
        }, 2500);
      }, 4000);
    }
  }

  shared.refs.boot = boot;
}

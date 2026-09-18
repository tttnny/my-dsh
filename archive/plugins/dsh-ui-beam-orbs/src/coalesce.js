/* ------------------------------------------------------------------ *
 * src/coalesce.js — 合批 MutationObserver（initCoalesce）
 *   单例 + rAF 合批，将 #root 全树突变分发给 shell/beam/orbs/todo；
 *   与主题观察器（observer.js）职责分离。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initCoalesce(shared) {
  var cbs = [];
  var scheduled = false;
  var mo = null;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function(fn){ return setTimeout(fn, 16); };
    raf(function(){
      scheduled = false;
      var list = cbs.slice();
      for (var i=0;i<list.length;i++) { try{ list[i].fn(); }catch(e){} }
    });
  }
  function ensure() {
    if (mo) return;
    if (!window.MutationObserver) return;
    mo = new MutationObserver(function(){ schedule(); });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try {
      mo.observe(rootEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-ds-dark-theme","data-ds-light-theme","data-theme","class","data-state","data-tool","data-status","aria-label","aria-expanded","data-testid","role","data-plan-mode","data-beam","data-active","data-pulse-active"]
      });
    } catch(e){}
    // 暴露给 diag/调试
    try{ shared.refs.coalescedObserver = mo; }catch(_){}
  }
  function subscribe(fn) {
    cbs.push({fn: fn});
    ensure();
    return function unsubscribe(){
      for (var i=0;i<cbs.length;i++) if (cbs[i].fn===fn) { cbs.splice(i,1); break; }
      if (cbs.length===0 && mo) { try{ mo.disconnect(); }catch(_){} mo=null; }
    };
  }
  shared.refs.subscribeCoalesced = subscribe;
  shared.refs.ensureCoalesced = ensure;
  shared.refs.scheduleCoalesced = schedule;
}



/* ------------------------------------------------------------------ *
 * src/beam.js — Border Beam 状态机与 composer/todo 集成（initBeam）
 *   含全部 beam 状态变量、attach/detach/watch 与调试句柄对象；
 *   CSS 生成（buildBeamCSS 等）在 src/beam-css.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBeam(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;

  /* ------------------------------------------------------------------ *
   * Border Beam — composer integration (D S H)
   * ------------------------------------------------------------------ */
  var beamStyleTag = null;
  var beamAttachedCard = null;
  var beamResizeObs = null;
  var beamMutObs = null;
  var beamCoalesceUnsub = null;
  var pendingExecuting = false;
  var pendingTimer = null;
  var beamPollTimer = null;
  var beamTypingHandler = null;
  var beamKeydownHandler = null;
  var typingActive = false;
  var typingTimer = null;
  var currentBeamMode = "hairline";
  // IME 组合输入锁：Enter 选词确认时 isComposing 可能已为 false，靠组合事件锁避免误判为发送
  var beamIsComposing = false;
  var beamComposingLockTimer = null;
  var pulseTimer = null;
  var beamState = { mode: "hairline", idleStrength: 0.65, focusStrength: 1.0, disabled: false };
  // 命名 handler 供 attach/update 共用，cleanup 可成对移除，避免匿名监听泄漏；解锁窗口 150ms（原 350ms 会吞选词后快速真实 Enter）
  var BEAM_COMPOSE_LOCK_MS = 150;
  var beamCompStart = function() {
    beamIsComposing = true;
    if (beamComposingLockTimer) { clearTimeout(beamComposingLockTimer); beamComposingLockTimer = null; }
    triggerTypingBreathe();
  };
  var beamCompUpdate = function() {
    beamIsComposing = true;
    triggerTypingBreathe();
  };
  var beamCompEnd = function() {
    triggerTypingBreathe();
    if (beamComposingLockTimer) clearTimeout(beamComposingLockTimer);
    beamComposingLockTimer = setTimeout(function(){ beamIsComposing = false; beamComposingLockTimer = null; }, BEAM_COMPOSE_LOCK_MS);
  };
  var beamCompKeyUp = function(e){
    if (e.keyCode === 229) {
      beamIsComposing = true;
      if (beamComposingLockTimer) clearTimeout(beamComposingLockTimer);
      beamComposingLockTimer = setTimeout(function(){ beamIsComposing = false; beamComposingLockTimer = null; }, BEAM_COMPOSE_LOCK_MS);
    }
  };

  function isBeamDisabled() {
    // 设置面板的 Beam 开关优先；URL/localStorage 逃生舱保留
    if (bgSettings && bgSettings.beam === false) return true;
    try {
      if (typeof location !== "undefined" && (location.search.indexOf("beam=0") !== -1 || location.search.indexOf("nobeam") !== -1 || location.search.indexOf("beam=false") !== -1)) return true;
      if (typeof localStorage !== "undefined" && localStorage.getItem("dsh-beam-disabled") === "1") return true;
    } catch(e) {}
    return false;
  }
  function getBeamThemeIsDark() { return !!state.dark; } // Border Beam 深浅两套参数跟随主题（浅色用 BEAM_CFG_LIGHT）
  function getBeamIdleStrength() { if (beamState && typeof beamState.idleStrength === "number") return beamState.idleStrength; return getBeamThemeIsDark() ? 0.65 : 0.5; }
  function resolveBorderRadius(el) {
    try {
      var cs = window.getComputedStyle(el);
      var v = parseFloat(cs.borderTopLeftRadius);
      if (!isNaN(v) && v > 0) return Math.round(v);
    } catch(e) {}
    return 16;
  }

  function ensureBeamStyles(borderRadius, variant) {
    var isDark = getBeamThemeIsDark();
    var r = typeof borderRadius === "number" ? borderRadius : 16;
    var v = variant || "colorful";
    var css = buildBeamCSS(BEAM_ID, r, isDark, v);
    if (!beamStyleTag) {
      beamStyleTag = document.getElementById("dsh-beam-css");
      if (!beamStyleTag) {
        beamStyleTag = document.createElement("style");
        beamStyleTag.id = "dsh-beam-css";
        document.head.appendChild(beamStyleTag);
      }
    }
    if (beamStyleTag.textContent !== css) beamStyleTag.textContent = css;
  }

  function setBeamStrength(v, opts) {
    var card = beamAttachedCard;
    if (!card) return;
    var strength = Math.max(0, Math.min(1, v));
    card.style.setProperty("--beam-strength", strength);
    if (opts && opts.persist) { try { localStorage.setItem("dsh-beam-strength", String(strength)); } catch(e) {} }
  }

  function findComposerInput(card) {
    if (!card) return null;
    return card.querySelector('textarea, [contenteditable="true"], [data-composer-input], .uV2eYG_input');
  }

  function isTyping() {
    return typingActive;
  }

  function triggerTypingBreathe() {
    var card = beamAttachedCard || document.querySelector('[data-composer-card="true"], .uV2eYG_card');
    if (!card || isExecuting()) return;
    typingActive = true;
    if (currentBeamMode !== "typing" && !isExecuting()) {
      applyBeamMode("typing");
    }
    // Refresh breathing animation by toggling data-typing
    card.removeAttribute("data-typing");
    void card.offsetWidth;
    card.setAttribute("data-typing", "");

    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(function() {
      typingActive = false;
      if (!isExecuting()) {
        updateBeamState();
      }
    }, 700);
  }

  function isPlanMode() {
    try {
      if (document.querySelector('[aria-label*="plan mode 已开启"], [aria-label*="Plan mode on"], [aria-label*="plan mode is on"], [aria-label*="Plan Mode on"]')) return true;
      // 0.1.5-rc.1：plan 状态由输入栏的 plan chip 承载（dsh-client-ui-plan PlanModeControl，
      // 类名 rS3zOq_chip）。该组件在非 plan mode 时 return null，仅计划模式开启才渲染，
      // 故其存在即 plan mode 开启，且与 locale 无关（上一行的 aria-label 判定保留为哈希漂移兜底）。
      // 原 [data-slot="plan"] 在 0.1.3-alpha.2 / 0.1.5-rc.1 均非合法槽位键（从未生效）；
      // 不可改用 [data-slot="conversation.input.plan"]——那是只要有会话就渲染的 plan 开关槽位，
      // 会导致 isPlanMode() 恒为 true、beam 永久停在 planning 态。
      if (document.querySelector('.rS3zOq_chip')) return true;
      if (document.documentElement.dataset && document.documentElement.dataset.planMode === "1") return true;
    } catch(e) {}
    return false;
  }

  function isRealExecuting() {
    try {
      var stopBtn = document.querySelector('button[aria-label*="停止生成"], button[aria-label*="Stop generating"], button[aria-label*="Stop generating message"], [data-composer-card] button[aria-label*="停止"], [data-composer-card] button[aria-label*="Stop"]');
      if (stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null) return true;
      // 身份限定执行探测：只认真实工具行 / 推理流 / 答案流的 DOM 特征，
      // 不再裸查全文档 [data-state="running"]——否则任意第三方面板
      // （如 AgentTeams 活动面板的成员/任务状态芯片）都会误触发执行态流光
      var EXECUTING_IDENTITY_SELECTOR = [
        '[data-tool][data-state="running"]',
        '[data-sample="bash"][data-state="running"]',
        '[data-subcalls] [data-tool][data-state="running"]',
        '.CY-8Ka_root[data-state="running"]',
        '.o3BgMG_root[data-state="running"]',
        '.iWrAna_card[data-state="running"]',
        '[data-variant="think"][data-state="running"]',
        '[data-variant="answer"][data-state="running"]',
        '[data-role="assistant"][data-streaming="true"]'
      ].join(", ");
      var runningRows = document.querySelectorAll(EXECUTING_IDENTITY_SELECTOR);
      for (var ri = 0; ri < runningRows.length; ri++) {
        var runningEl = runningRows[ri];
        if (!runningEl || runningEl.offsetParent === null) continue;
        if (runningEl.classList && (runningEl.classList.contains("dsh-thinking-orb-wrap") || runningEl.classList.contains("dsh-turn-status-text") || runningEl.classList.contains("dsh-thinking-orb-canvas"))) {
          continue;
        }
        return true;
      }
    } catch(e) {}
    return false;
  }

  function isExecuting() {
    try {
      if (pendingExecuting) return true;
      return isRealExecuting();
    } catch(e) { return false; }
  }

  function applyBeamMode(mode) {
    var card = beamAttachedCard;
    if (!card) return;

    currentBeamMode = mode;

    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    if (mode === "pulse") {
      pendingExecuting = false;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    }

    var isDark = getBeamThemeIsDark();
    var r = resolveBorderRadius(card);
    var variant = mode === "typing" ? "mono" : (mode === "planning" ? "sunset" : "colorful");
    ensureBeamStyles(r, variant);

    // Clean state attributes and inline style overrides
    card.removeAttribute("data-active");
    card.removeAttribute("data-fading");
    card.removeAttribute("data-typing");
    card.removeAttribute("data-planning");
    card.removeAttribute("data-pulse");
    card.removeAttribute("data-paused");
    card.style.removeProperty("filter");
    card.style.removeProperty("--beam-hue-base");

    if (mode === "hairline") {
      card.setAttribute("data-beam", BEAM_ID);
      card.style.removeProperty("--beam-strength");
      card.style.setProperty("--beam-strength", "0.08");
      return;
    }

    if (mode === "typing") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-typing", "");
      card.removeAttribute("data-active");
      card.style.setProperty("--beam-strength", "0.85");
      card.style.setProperty("--beam-hue-base", "0deg");
      return;
    }

    if (mode === "planning") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-planning", "");
      card.setAttribute("data-active", "");
      card.style.setProperty("--beam-strength", "1");
      card.style.setProperty("--beam-hue-base", "15deg");
      return;
    }

    if (mode === "executing") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-active", "");
      card.style.setProperty("--beam-strength", "1");
      return;
    }

    if (mode === "pulse") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-pulse", "");
      card.style.setProperty("--beam-strength", "1");
      pulseTimer = setTimeout(function() {
        if (currentBeamMode === "pulse") {
          applyBeamMode("hairline");
        }
      }, 800);
      return;
    }
  }

  function resolveBeamMode() {
    if (isBeamDisabled()) return "hairline";
    if (pendingExecuting || isExecuting()) {
      if (isPlanMode()) return "planning";
      return "executing";
    }
    if (currentBeamMode === "pulse") return "pulse";
    if (typingActive) return "typing";
    return "hairline";
  }

  function updateBeamState() {
    if (!beamAttachedCard || !document.contains(beamAttachedCard) || !beamAttachedCard.isConnected) {
      var freshCard = document.querySelector('[data-composer-card="true"], .uV2eYG_card');
      if (freshCard && freshCard !== beamAttachedCard) {
        try { if (beamAttachedCard && beamAttachedCard._dshBeamCleanup) beamAttachedCard._dshBeamCleanup(); } catch(e) {}
        beamAttachedCard = null;
        attachComposerBeam();
        return;
      }
    }

    if (beamAttachedCard) {
      var freshInput = findComposerInput(beamAttachedCard);
      var boundInput = beamAttachedCard._dshBeamInput;
      if (freshInput && freshInput !== boundInput) {
        if (boundInput) {
          try {
            if (beamTypingHandler) {
              boundInput.removeEventListener("input", beamTypingHandler);
              boundInput.removeEventListener("change", beamTypingHandler);
            }
            if (beamKeydownHandler) {
              boundInput.removeEventListener("keydown", beamKeydownHandler);
            }
            boundInput.removeEventListener("compositionstart", beamCompStart);
            boundInput.removeEventListener("compositionupdate", beamCompUpdate);
            boundInput.removeEventListener("compositionend", beamCompEnd);
            boundInput.removeEventListener("keyup", beamCompKeyUp);
          } catch(e) {}
        }
        if (beamTypingHandler && beamKeydownHandler) {
          try {
            freshInput.addEventListener("input", beamTypingHandler);
            freshInput.addEventListener("change", beamTypingHandler);
            freshInput.addEventListener("keydown", beamKeydownHandler);
            freshInput.addEventListener("compositionstart", beamCompStart);
            freshInput.addEventListener("compositionupdate", beamCompUpdate);
            freshInput.addEventListener("compositionend", beamCompEnd);
            freshInput.addEventListener("keyup", beamCompKeyUp);
            beamAttachedCard._dshBeamInput = freshInput;
          } catch(e) {}
        }
      }
    }

    if (pendingExecuting && isRealExecuting()) {
      pendingExecuting = false;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    }

    var next = resolveBeamMode();

    if ((currentBeamMode === "executing" || currentBeamMode === "planning") &&
        next !== "executing" && next !== "planning" && next !== "pulse") {
      applyBeamMode("pulse");
      try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
      return;
    }

    if (currentBeamMode === "pulse" && next === "pulse") {
      try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
      return;
    }

    if (currentBeamMode !== next) {
      applyBeamMode(next);
    }
    try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
  }

  function ensureBeamMutObs() {
    if (beamMutObs || beamCoalesceUnsub) return;
    if (shared.refs.subscribeCoalesced) {
      try {
        beamCoalesceUnsub = shared.refs.subscribeCoalesced(function() {
          if (!beamAttachedCard || !document.contains(beamAttachedCard)) {
            try { attachComposerBeam(); } catch(e) {}
          } else {
            try { updateBeamState(); } catch(e) {}
          }
        });
        return;
      } catch(e){}
    }
    if (!window.MutationObserver) return;
    beamMutObs = new MutationObserver(function() {
      if (!beamAttachedCard || !document.contains(beamAttachedCard)) {
        try { attachComposerBeam(); } catch(e) {}
      } else {
        try { updateBeamState(); } catch(e) {}
      }
    });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try { beamMutObs.observe(rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "class", "data-plan-mode", "data-state", "data-status"] }); } catch(e) {}
  }
  function detachBeamMutObs() {
    if (beamCoalesceUnsub) { try { beamCoalesceUnsub(); } catch(e) {} beamCoalesceUnsub = null; return; }
    if (beamMutObs) { try { beamMutObs.disconnect(); } catch(e) {} beamMutObs = null; }
  }

    function attachComposerBeam() {
    if (isBeamDisabled()) return;
    if (beamAttachedCard && document.contains(beamAttachedCard)) return;
    var card = document.querySelector('[data-composer-card="true"], .uV2eYG_card');
    if (!card) return;
    card.setAttribute("data-beam", BEAM_ID);
    if (!card.querySelector("[data-beam-bloom]")) {
      var bloom = document.createElement("div");
      bloom.setAttribute("data-beam-bloom", "");
      card.appendChild(bloom);
    }
    var radius = resolveBorderRadius(card);
    ensureBeamStyles(radius, "colorful");
    card.style.setProperty("overflow", "visible");
    card.style.setProperty("isolation", "isolate");
    if (window.getComputedStyle(card).position === "static") card.style.position = "relative";
    beamAttachedCard = card;
    currentBeamMode = "hairline";
    updateBeamState();

    var input = findComposerInput(card);
    if (input) {
      beamTypingHandler = function() {
        triggerTypingBreathe();
      };
      beamKeydownHandler = function(e) {
        // 输入法组合中：优先以浏览器原生 isComposing / keyCode 229 为准，beamIsComposing 仅兜底非 Enter 按键，避免 150ms 锁吞选词后真实 Enter
        if (e.isComposing || e.keyCode === 229) {
          triggerTypingBreathe();
          return;
        }
        if (beamIsComposing) {
          if (e.key !== "Enter") {
            triggerTypingBreathe();
            return;
          }
          // Enter 且处于锁窗口但浏览器已判定非 composing：视为真实发送，透传至下方发送逻辑
        }
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // @/slash 联想菜单打开时：回车是选中候选（文件/命令/技能），不应进入彩色执行态，只触发白色呼吸
          var _menuOpen = false;
          try {
            var _lb = document.querySelector('[role="listbox"]');
            if (_lb && _lb.offsetParent !== null) _menuOpen = true;
            if (!_menuOpen) {
              var _m = document.querySelector('._3e4SsG_menu');
              if (_m && _m.offsetParent !== null) _menuOpen = true;
            }
            if (!_menuOpen) {
              var _ad = document.querySelector('[aria-activedescendant]');
              if (_ad) {
                var _aid = _ad.getAttribute('aria-activedescendant');
                if (_aid && document.getElementById(_aid) && document.getElementById(_aid).offsetParent !== null) _menuOpen = true;
              }
            }
          } catch (_e) {}
          if (_menuOpen) {
            triggerTypingBreathe();
            return;
          }
          var val = input.value !== undefined ? input.value : input.textContent;
          if (val && String(val).trim().length > 0) {
            // 回车发送：设置短时 pending（1.4s），桥接 DOM 尚未挂载 running 状态的空档，
            // 让 Thinking Orbs 与 Border Beam 立即进入执行态，避免工具间隙误判为空闲
            pendingExecuting = true;
            if (pendingTimer) clearTimeout(pendingTimer);
            pendingTimer = setTimeout(function(){ pendingExecuting = false; try{ updateBeamState(); }catch(e){} }, 1400);
            try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
            setTimeout(function(){ try{ updateBeamState(); }catch(e){} }, 60);
            setTimeout(function(){ try{ updateBeamState(); }catch(e){} }, 180);
            if (!typingActive) triggerTypingBreathe();
            return;
          } else {
            triggerTypingBreathe();
            return;
          }
        }
        if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")) {
          triggerTypingBreathe();
        }
      };

      input.addEventListener("input", beamTypingHandler);
      input.addEventListener("change", beamTypingHandler);
      input.addEventListener("keydown", beamKeydownHandler);
      input.addEventListener("compositionstart", beamCompStart);
      input.addEventListener("compositionupdate", beamCompUpdate);
      input.addEventListener("compositionend", beamCompEnd);
      input.addEventListener("keyup", beamCompKeyUp);
      card._dshBeamInput = input;
    }

    var sendBtn = card.querySelector('button[aria-label="Send message"], button[aria-label="发送消息"], button[aria-label*="Send"], button[aria-label*="发送"], .uV2eYG_primary');
    if (sendBtn) {
      var sendHandler = function() {
        typingActive = false;
        if (typingTimer) clearTimeout(typingTimer);
        pendingExecuting = true;
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() { pendingExecuting = false; updateBeamState(); }, 2000);
        updateBeamState();
      };
      sendBtn.addEventListener("click", sendHandler);
      card._dshBeamSendBtn = sendBtn;
      card._dshBeamSendHandler = sendHandler;
    }

    if (window.ResizeObserver) {
      if (beamResizeObs) try { beamResizeObs.disconnect(); } catch(e) {}
      beamResizeObs = new ResizeObserver(function() {
        if (!beamAttachedCard) return;
        var nr = resolveBorderRadius(beamAttachedCard);
        ensureBeamStyles(nr, currentBeamMode === "typing" ? "mono" : (currentBeamMode === "planning" ? "sunset" : "colorful"));
      });
      try { beamResizeObs.observe(card); } catch(e) {}
    }

    if (beamPollTimer) clearInterval(beamPollTimer);
    beamPollTimer = setInterval(updateBeamState, 450);

    ensureBeamMutObs();

    card._dshBeamCleanup = function() {
      if (input) {
        try {
          if (beamTypingHandler) {
            input.removeEventListener("input", beamTypingHandler);
            input.removeEventListener("change", beamTypingHandler);
          }
          if (beamKeydownHandler) {
            input.removeEventListener("keydown", beamKeydownHandler);
          }
          input.removeEventListener("compositionstart", beamCompStart);
          input.removeEventListener("compositionupdate", beamCompUpdate);
          input.removeEventListener("compositionend", beamCompEnd);
          input.removeEventListener("keyup", beamCompKeyUp);
        } catch(e) {}
      }
      if (card._dshBeamSendBtn && card._dshBeamSendHandler) {
        try { card._dshBeamSendBtn.removeEventListener("click", card._dshBeamSendHandler); } catch(e) {}
      }
      if (beamPollTimer) { clearInterval(beamPollTimer); beamPollTimer = null; }
      try { detachBeamMutObs(); } catch(e) {}
      if (beamResizeObs) { try { beamResizeObs.disconnect(); beamResizeObs = null; } catch(e) {} }
      if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; }
      if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      if (beamComposingLockTimer) { clearTimeout(beamComposingLockTimer); beamComposingLockTimer = null; }
      beamIsComposing = false;
      try { if (shared.refs.stopThinkingOrb) shared.refs.stopThinkingOrb(); } catch(e) {}
    };
  }

  function detachComposerBeam() {
    var card = beamAttachedCard;
    if (!card) return;
    try { if (card._dshBeamCleanup) card._dshBeamCleanup(); } catch(e) {}
    try { if (shared.refs.stopThinkingOrb) shared.refs.stopThinkingOrb(); } catch(e) {}
    card.removeAttribute("data-beam");
    card.removeAttribute("data-active");
    card.removeAttribute("data-fading");
    card.removeAttribute("data-typing");
    card.removeAttribute("data-planning");
    card.removeAttribute("data-pulse");
    card.removeAttribute("data-paused");
    card.style.removeProperty("--beam-strength");
    card.style.removeProperty("--beam-hue-base");
    card.style.removeProperty("filter");
    card.style.removeProperty("isolation");
    var bloom = card.querySelector("[data-beam-bloom]");
    if (bloom) try { bloom.remove(); } catch(e) {}
    if (beamResizeObs) try { beamResizeObs.disconnect(); beamResizeObs = null; } catch(e) {}
    // 清理挂在 DOM 节点上的自定义属性，防止 React 节点复用池携带旧闭包
    try { delete card._dshBeamCleanup; } catch(e) {}
    try { delete card._dshBeamInput; } catch(e) {}
    try { delete card._dshBeamSendBtn; } catch(e) {}
    try { delete card._dshBeamSendHandler; } catch(e) {}
    beamAttachedCard = null;
    currentBeamMode = "hairline";
  }

  function refreshBeamTheme() {
    if (!beamAttachedCard) return;
    var r = resolveBorderRadius(beamAttachedCard);
    var v = currentBeamMode === "typing" ? "mono" : (currentBeamMode === "planning" ? "sunset" : "colorful");
    ensureBeamStyles(r, v);
    updateBeamState();
  }

  function watchBeamComposer() {
    if (isBeamDisabled()) { detachComposerBeam(); return; }
    attachComposerBeam();
    ensureBeamMutObs();
  }

  /* ------------------------------------------------------------------ *
   * Border Beam — Todo List Panel integration
   * ------------------------------------------------------------------ */
  var todoAttachedPanel = null;
  var todoPollTimer = null;
  var todoMutObs = null;
  var todoCoalesceUnsub = null;

  function findTodoPanel() {
    var panel = document.querySelector('[data-testid="todo-panel"], .lXshSW_root, [data-slot="conversation.input.dock"] [data-testid="todo-panel"], [data-slot="conversation.input.dock"] .lXshSW_root');
    if (panel) return panel;
    var dockSections = document.querySelectorAll('[data-slot="conversation.input.dock"] section, [data-slot="conversation.input.dock"] > div > section');
    for (var i = 0; i < dockSections.length; i++) {
      var s = dockSections[i];
      if (s.querySelector('.lXshSW_body, .lXshSW_header, [data-testid="todo-panel"], [aria-label*="待办"], [aria-label*="Todo"], [aria-label*="todo"]')) {
        return s;
      }
    }
    return null;
  }

  function isTodoActive(panel) {
    if (!panel) return false;
    if (panel.querySelector('[data-status="in_progress"]')) return true;
    if (panel.querySelector('.lXshSW_glyphProgress, [class*="glyphProgress"]')) return true;
    var progressEl = panel.querySelector('.lXshSW_progress, [class*="progress"]');
    if (progressEl && progressEl.textContent) {
      var ptxt = progressEl.textContent.toLowerCase();
      if (ptxt.indexOf('进行中') !== -1 || ptxt.indexOf('in progress') !== -1 || ptxt.indexOf('active') !== -1) {
        return true;
      }
    }
    if (isExecuting()) return true;
    return false;
  }

  function cleanupTodoPanelDom(panel) {
    if (!panel) return;
    try {
      panel.removeAttribute("data-beam");
      panel.removeAttribute("data-active");
      panel.removeAttribute("data-pulse-active");
      var bloom = panel.querySelector("[data-beam-bloom]");
      if (bloom) bloom.remove();
    } catch(e) {}
  }

  function updateTodoBeamState() {
    if (!state.dark) {
      // 浅色主题：不放任何 DOM 标记/元素，保持官方原版任务清单
      if (todoAttachedPanel) { try { cleanupTodoPanelDom(todoAttachedPanel); } catch(e){} todoAttachedPanel = null; }
      return;
    }
    if (isBeamDisabled() || !bgSettings.beam) {
      if (todoAttachedPanel) {
        cleanupTodoPanelDom(todoAttachedPanel);
        todoAttachedPanel = null;
      }
      return;
    }
    var panel = findTodoPanel();
    if (!panel || !document.contains(panel)) {
      if (todoAttachedPanel) {
        cleanupTodoPanelDom(todoAttachedPanel);
        todoAttachedPanel = null;
      }
      return;
    }
    if (panel !== todoAttachedPanel || panel.getAttribute("data-beam") !== "dsh-todo" || !panel.querySelector("[data-beam-bloom]")) {
      attachTodoBeam(panel);
      return;
    }
    var hasActiveTask = isTodoActive(panel);
    if (hasActiveTask) {
      if (!panel.hasAttribute("data-pulse-active")) panel.setAttribute("data-pulse-active", "");
      if (!panel.hasAttribute("data-active")) panel.setAttribute("data-active", "");
    } else {
      if (panel.hasAttribute("data-pulse-active")) panel.removeAttribute("data-pulse-active");
      if (panel.hasAttribute("data-active")) panel.removeAttribute("data-active");
    }
  }

  function attachTodoBeam(panel) {
    if (!panel) panel = findTodoPanel();
    if (!panel) return;
    if (!state.dark) {
      if (todoAttachedPanel) { try { cleanupTodoPanelDom(todoAttachedPanel); } catch(e){} todoAttachedPanel = null; }
      return;
    }
    if (isBeamDisabled() || !bgSettings.beam) return;
    if (todoAttachedPanel && todoAttachedPanel !== panel) {
      cleanupTodoPanelDom(todoAttachedPanel);
    }
    todoAttachedPanel = panel;
    if (panel.getAttribute("data-beam") !== "dsh-todo") {
      panel.setAttribute("data-beam", "dsh-todo");
    }
    if (!panel.querySelector("[data-beam-bloom]")) {
      var bloom = document.createElement("div");
      bloom.setAttribute("data-beam-bloom", "");
      bloom.setAttribute("aria-hidden", "true");
      panel.appendChild(bloom);
    }
    var hasActiveTask = isTodoActive(panel);
    if (hasActiveTask) {
      panel.setAttribute("data-pulse-active", "");
      panel.setAttribute("data-active", "");
    } else {
      panel.removeAttribute("data-pulse-active");
      panel.removeAttribute("data-active");
    }
  }

  function ensureTodoMutObs() {
    if (todoMutObs || todoCoalesceUnsub) return;
    if (shared.refs.subscribeCoalesced) {
      try {
        todoCoalesceUnsub = shared.refs.subscribeCoalesced(function() {
          try {
            var panel = findTodoPanel();
            if (!todoAttachedPanel || !document.contains(todoAttachedPanel) || (panel && panel !== todoAttachedPanel) || (panel && panel.getAttribute("data-beam") !== "dsh-todo")) {
              if (panel) attachTodoBeam(panel);
              else updateTodoBeamState();
            } else {
              updateTodoBeamState();
            }
          } catch(e) {}
        });
        return;
      } catch(e) {}
    }
    if (!window.MutationObserver) return;
    todoMutObs = new MutationObserver(function() {
      try {
        var panel = findTodoPanel();
        if (!todoAttachedPanel || !document.contains(todoAttachedPanel) || (panel && panel !== todoAttachedPanel) || (panel && panel.getAttribute("data-beam") !== "dsh-todo")) {
          if (panel) attachTodoBeam(panel);
          else updateTodoBeamState();
        } else {
          updateTodoBeamState();
        }
      } catch(e) {}
    });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try {
      todoMutObs.observe(rootEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-status", "class", "aria-expanded", "data-state", "data-testid", "aria-label", "data-beam"]
      });
    } catch(e) {}
  }

  function detachTodoMutObs() {
    if (todoCoalesceUnsub) { try { todoCoalesceUnsub(); } catch(e) {} todoCoalesceUnsub = null; return; }
    if (todoMutObs) { try { todoMutObs.disconnect(); } catch(e) {} todoMutObs = null; }
  }

  function detachTodoBeam() {
    var panel = todoAttachedPanel || findTodoPanel();
    if (panel) cleanupTodoPanelDom(panel);
    if (todoPollTimer) { clearInterval(todoPollTimer); todoPollTimer = null; }
    detachTodoMutObs();
    todoAttachedPanel = null;
  }

  function watchBeamTodo() {
    if (isBeamDisabled() || !bgSettings.beam) { detachTodoBeam(); return; }
    attachTodoBeam();
    ensureTodoMutObs();
    if (!todoPollTimer) {
      todoPollTimer = setInterval(updateTodoBeamState, 450);
    }
  }

  shared.refs.isExecuting = isExecuting;
  shared.refs.isPlanMode = isPlanMode;
  shared.refs.getBeamThemeIsDark = getBeamThemeIsDark;
  shared.refs.watchBeamComposer = watchBeamComposer;
  shared.refs.watchBeamTodo = watchBeamTodo;
  shared.refs.detachComposerBeam = detachComposerBeam;
  shared.refs.detachTodoBeam = detachTodoBeam;
  shared.refs.refreshBeamTheme = refreshBeamTheme;
  shared.refs.getBeamAttachedCard = function () { return beamAttachedCard; };
  shared.refs.beamHandle = {
    attach: attachComposerBeam,
    detach: detachComposerBeam,
    attachTodo: attachTodoBeam,
    detachTodo: detachTodoBeam,
    updateTodo: updateTodoBeamState,
    get todoPanel() { return todoAttachedPanel; },
    setStrength: function(v) { setBeamStrength(v, { persist: false }); },
    setIdleStrength: function(v) { beamState.idleStrength = Math.max(0, Math.min(1, v)); if (beamAttachedCard) beamAttachedCard.style.setProperty("--beam-strength", String(beamState.idleStrength)); refreshBeamTheme(); },
    setFocusStrength: function(v) { beamState.focusStrength = Math.max(0, Math.min(1, v)); if (beamAttachedCard) beamAttachedCard.style.setProperty("--beam-strength", String(beamState.focusStrength)); refreshBeamTheme(); },
    disable: function() { try { localStorage.setItem("dsh-beam-disabled", "1"); } catch(e) {} detachComposerBeam(); detachTodoBeam(); },
    enable: function() { try { localStorage.removeItem("dsh-beam-disabled"); } catch(e) {} watchBeamComposer(); watchBeamTodo(); },
    refresh: function() { refreshBeamTheme(); updateTodoBeamState(); },
    get state() { return currentBeamMode; },
    get isExecuting() { return isExecuting(); },
    get isTyping() { return isTyping(); },
    update: updateBeamState,
    get id() { return BEAM_ID; },
    get card() { return beamAttachedCard; }
  };
}



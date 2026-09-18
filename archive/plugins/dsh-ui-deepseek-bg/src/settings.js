/* ===================================================================== *
 * src/settings.js — 背景特效设置（initSettings）
 *   档位/开关/高级参数 + 设置页「背景特效」面板（React）。
 *   本插件只管理背景引擎四项：极光背景 / 粒子鲸鱼 / 星座网格 /
 *   鼠标跟随交互 + 极光分辨率/帧率/跟手/光线高级参数
 *   （玻璃拟态 / Beam / Orbs 设置在 dsh-ui-beam-orbs 插件）。
 *   创建 shared.settings（loadSettings 结果，各模块经 shared.settings 只读）；
 *   跨模块回调一律走 shared.refs.*（星座唤醒、鲸鱼显隐）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ===================================================================== */
function initSettings(shared) {
  var ctx = shared.ctx;

  /* ===================================================================== *
   * 背景特效设置（设置页「背景特效」面板 + 运行时联动）
   *   档位预设 → 独立开关（自动转自定义）→ 高级参数
   *   全部即时生效、localStorage 持久化（dsh-bg-settings）
   *   默认档位：全特效（下载后即开即用，无需手动切换）
   * ===================================================================== */
  var SETTINGS_KEY = "dsh-bg-settings";
  var PRESETS = {
    // 全特效：极光分辨率拉满（滑杆上限 1.0x）——下载后默认即为此档
    full: { label: "全特效", aurora: true, whale: true, constellation: true, mouse: true, auroraScale: 1, fps: 60, followMs: 120, lightFollow: 1 },
    half: { label: "均衡", aurora: false, whale: true, constellation: true, mouse: true, auroraScale: 0.55, fps: 60, followMs: 20, lightFollow: 1 },
    eco:  { label: "节能", aurora: false, whale: false, constellation: false, mouse: false, auroraScale: 0.4, fps: 20, followMs: 20, lightFollow: 1 }
  };

  function loadSettings() {
    var d = { mode: "full" };
    var parsed = null;
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {}
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.mode === "string") d.mode = parsed.mode;
    }
    if (PRESETS[d.mode]) {
      // 档位模式：数值全部跟随预设（预设调整后自动生效，无需清理旧缓存）
      var p = PRESETS[d.mode];
      for (var k in p) if (k !== "label") d[k] = p[k];
    } else {
      // 自定义模式：全特效为底，白名单叠加已存数值（防原型污染）
      d.mode = "custom";
      var base = PRESETS.full;
      for (var k2 in base) if (k2 !== "label") d[k2] = base[k2];
      if (parsed && typeof parsed === "object") {
        var allowed = { aurora:1, whale:1, constellation:1, mouse:1, auroraScale:1, fps:1, followMs:1, lightFollow:1 };
        for (var k3 in parsed) if (Object.prototype.hasOwnProperty.call(parsed, k3) && allowed[k3]) d[k3] = parsed[k3];
      }
      d.mode = "custom"; // 非法/过期 mode 值不得覆盖自定义档位
    }
    return d;
  }
  shared.settings = loadSettings();
  var bgSettings = shared.settings;

  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(bgSettings)); } catch (e) { try { if (e && e.name === "QuotaExceededError") console.warn("[dsh-bg] localStorage quota exceeded", e); } catch(_){} } }
  function estimateGpu() {
    var s = bgSettings, score = 0;
    if (s.aurora) score += 52 * Math.min(1.2, (s.auroraScale || 0.75) / 0.75);
    if (s.whale) score += 20;
    if (s.constellation) score += 9;
    if (s.mouse) score += 1; // 光标交互物理（极光漫游笔刷始终在跑，成本几乎无差）
    score *= ((s.fps || 30) / 30);
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  function snapshotSettings() {
    return {
      mode: bgSettings.mode,
      aurora: !!bgSettings.aurora, whale: !!bgSettings.whale, constellation: !!bgSettings.constellation,
      mouse: !!bgSettings.mouse,
      auroraScale: Number(bgSettings.auroraScale) || 1, fps: Number(bgSettings.fps) || 30,
      followMs: bgSettings.followMs != null ? Number(bgSettings.followMs) : 20,
      lightFollow: bgSettings.lightFollow != null ? Number(bgSettings.lightFollow) : 1,
      gpu: estimateGpu(),
      canvasW: (shared.dom && shared.dom.auroraCanvas) ? shared.dom.auroraCanvas.width : 0,
      canvasH: (shared.dom && shared.dom.auroraCanvas) ? shared.dom.auroraCanvas.height : 0
    };
  }
  var settingsListeners = [];
  function notifySettings() { for (var i = 0; i < settingsListeners.length; i++) { try { settingsListeners[i](); } catch (e) {} } }
  function subscribeSettings(fn) {
    settingsListeners.push(fn);
    return function () { var i = settingsListeners.indexOf(fn); if (i >= 0) settingsListeners.splice(i, 1); };
  }
  function applyPreset(mode) {
    var p = PRESETS[mode]; if (!p) return;
    for (var k in p) if (k !== "label") bgSettings[k] = p[k];
    bgSettings.mode = mode;
    commitSettings();
  }
  function updateSetting(key, value) {
    bgSettings[key] = value;
    bgSettings.mode = "custom";
    commitSettings();
  }
  function resetSettings() { applyPreset("full"); commitSettings(); }
  function commitSettings() { saveSettings(); applyBgSettings(); notifySettings(); }


  /** 把每个子系统立即切换到当前设置 */
  function applyBgSettings() {
    try { if (shared.refs.updateWhaleDisplay) shared.refs.updateWhaleDisplay(); } catch (e) {}
    try { if (bgSettings.constellation && shared.refs.wakeConstellation) shared.refs.wakeConstellation(); } catch (e) {}
  }

  /* ---- 设置页「背景特效」面板 ---- */
  var SETTINGS_UI_CSS = [
    ".dsh-bg-settings{display:flex;flex-direction:column;gap:14px;max-width:560px;padding-bottom:28px;}",
    ".dsh-bg-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:14px 16px;background:rgba(128,128,128,.05);}",
    ".dsh-bg-sec-title{font-size:13px;font-weight:600;opacity:.9;margin-bottom:10px;letter-spacing:0.2px;}",
    ".dsh-bg-div{border-top:1px solid rgba(128,128,128,.12);margin:14px 0;}",
    /* 档位：一行三键分段控件 */
    ".dsh-bg-presets{display:flex;gap:6px;}",
    ".dsh-bg-preset{flex:1;cursor:pointer;border:1px solid rgba(128,128,128,.2);background:rgba(128,128,128,.04);color:inherit;border-radius:8px;padding:7px 6px;font-size:13px;font-weight:500;font-family:inherit;text-align:center;transition:all .15s ease;}",
    ".dsh-bg-preset:hover{background:rgba(128,128,128,.1);border-color:rgba(128,128,128,.35);}",
    ".dsh-bg-preset[data-active='true']{border-color:#4d8bf5;color:#6ea8ff;background:rgba(77,139,245,.14);font-weight:600;}",
    ".dsh-bg-preset-caption{font-size:11px;opacity:.65;margin-top:8px;line-height:1.5;}",
    /* GPU 仪表 */
    ".dsh-bg-meter-label{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.85;margin-bottom:6px;}",
    ".dsh-bg-meter{height:8px;border-radius:999px;background:rgba(128,128,128,.16);overflow:hidden;}",
    ".dsh-bg-meter>div{height:100%;border-radius:999px;transition:width .25s ease,background .25s ease;}",
    ".dsh-bg-meta{font-size:11px;opacity:.55;line-height:1.6;margin-top:8px;}",
    /* 开关行：细分隔线 + 紧凑内边距 */
    ".dsh-bg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;}",
    ".dsh-bg-row+.dsh-bg-row{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-row-info{flex:1;min-width:0;}",
    ".dsh-bg-row-title{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;}",
    ".dsh-bg-row-desc{font-size:11px;opacity:.6;margin-top:2px;line-height:1.4;}",
    ".dsh-bg-chip{font-size:10px;line-height:16px;padding:0 6px;border-radius:999px;border:1px solid rgba(128,128,128,.3);opacity:.85;white-space:nowrap;flex:none;}",
    ".dsh-bg-chip[data-level='high']{color:#ff9d6b;border-color:rgba(255,140,80,.4);}",
    ".dsh-bg-chip[data-level='mid']{color:#ffd166;border-color:rgba(255,200,90,.4);}",
    ".dsh-bg-chip[data-level='low']{color:#7ee2a8;border-color:rgba(110,220,160,.4);}",
    ".dsh-bg-switch{position:relative;width:36px;height:20px;flex:none;cursor:pointer;border-radius:999px;border:none;background:rgba(128,128,128,.3);transition:background .15s;padding:0;}",
    ".dsh-bg-switch[aria-checked='true']{background:#4d8bf5;}",
    ".dsh-bg-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.2);}",
    ".dsh-bg-switch[aria-checked='true']::after{transform:translateX(16px);}",
    /* 高级折叠面板 */
    ".dsh-bg-adv summary{cursor:pointer;font-size:13px;font-weight:600;opacity:.9;user-select:none;padding:2px 0;outline:none;display:flex;align-items:center;gap:6px;}",
    ".dsh-bg-adv summary::-webkit-details-marker{display:none;}",
    ".dsh-bg-adv summary::before{content:'▶';font-size:9px;display:inline-block;transition:transform .2s ease;opacity:.7;}",
    ".dsh-bg-adv[open] summary::before{transform:rotate(90deg);}",
    ".dsh-bg-adv[open] summary{margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(128,128,128,.12);}",
    ".dsh-bg-adv summary:hover{opacity:1;}",
    /* 高级区条目 */
    ".dsh-bg-slider-item,.dsh-bg-adv-row{padding:10px 2px;}",
    ".dsh-bg-slider-item+.dsh-bg-slider-item,.dsh-bg-slider-item+.dsh-bg-adv-row,.dsh-bg-adv-row+.dsh-bg-slider-item,.dsh-bg-adv-row+.dsh-bg-adv-row{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-item-title{font-size:13px;font-weight:500;}",
    ".dsh-bg-item-desc{font-size:11px;opacity:.6;line-height:1.45;margin-top:2px;}",
    ".dsh-bg-slider-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    ".dsh-bg-val-badge{font-size:11px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-numeric:tabular-nums;color:#6ea8ff;background:rgba(77,139,245,.12);border:1px solid rgba(77,139,245,.25);border-radius:6px;padding:1px 7px;line-height:16px;flex:none;}",
    ".dsh-bg-range{display:block;width:100%;height:6px;border-radius:3px;background:rgba(128,128,128,.2);outline:none;margin:10px 0 4px;cursor:pointer;-webkit-appearance:none;appearance:none;transition:background .15s;}",
    ".dsh-bg-range:hover{background:rgba(128,128,128,.28);}",
    ".dsh-bg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .12s ease;}",
    ".dsh-bg-range::-webkit-slider-thumb:hover{transform:scale(1.15);}",
    ".dsh-bg-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);}",
    ".dsh-bg-range-labels{display:flex;justify-content:space-between;font-size:10px;opacity:.45;user-select:none;margin-top:2px;}",
    ".dsh-bg-adv-row{display:flex;align-items:center;justify-content:space-between;gap:16px;}",
    ".dsh-bg-adv-info{flex:1;min-width:0;}",
    ".dsh-bg-select{background:rgba(128,128,128,.1);color:inherit;border:1px solid rgba(128,128,128,.28);border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;flex:none;cursor:pointer;outline:none;transition:border-color .15s,background .15s;}",
    ".dsh-bg-select:hover{background:rgba(128,128,128,.16);border-color:rgba(128,128,128,.4);}",
    ".dsh-bg-select:focus{border-color:#4d8bf5;}",
    ".dsh-bg-select option{background:#1c1d22;color:#e5e5e5;}",
    /* 底部 */
    ".dsh-bg-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px;}",
    ".dsh-bg-reset{cursor:pointer;border:1px solid rgba(128,128,128,.25);background:transparent;color:inherit;border-radius:8px;padding:6px 14px;font-size:12px;font-family:inherit;transition:background .15s,border-color .15s;}",
    ".dsh-bg-reset:hover{background:rgba(128,128,128,.1);border-color:rgba(128,128,128,.4);}",
    ".dsh-bg-note{font-size:11px;opacity:.55;line-height:1.5;}",
    "@media (prefers-reduced-motion: reduce){.dsh-bg-meter>div{transition:none;}}"
  ].join("\n");

  function injectSettingsCss() {
    try {
      var tag = document.getElementById("dsh-bg-settings-css");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "dsh-bg-settings-css";
        document.head.appendChild(tag);
      }
      tag.textContent = SETTINGS_UI_CSS;
    } catch (e) {}
  }

  function BgSettingsSection() {
    var h = react.createElement;
    var snapState = react.useState(function () { return snapshotSettings(); });
    var snap = snapState[0];
    var setSnap = snapState[1];
    react.useEffect(function () {
      return subscribeSettings(function () { setSnap(snapshotSettings()); });
    }, []);
    var gpu = snap.gpu;
    var meterColor = gpu < 35 ? "#4ade80" : (gpu < 60 ? "#facc15" : "#fb7185");
    var presetIds = ["full", "half", "eco"];
    var presetNames = { full: "全特效", half: "均衡", eco: "节能" };
    var presetDescs = {
      full: "所有背景特效拉满：极光 1.0x、60fps、跟手 120ms",
      half: "保留粒子鲸鱼/星座/鼠标跟随，关闭高开销极光流体（60fps）",
      eco: "仅保留静态深色背景与最低开销（20fps）"
    };
    var modeName = presetNames[snap.mode] || "自定义";
    var modeCaption = presetDescs[snap.mode] || "手动调整的特效组合，可随时切回预设档位";
    var rows = [
      { key: "aurora", title: "极光背景", desc: "WebGL2 流体渐变，本插件最大 GPU 开销", level: "high" },
      { key: "whale", title: "粒子鲸鱼", desc: "全屏 WebGL2 点阵粒子，光线跟随鼠标", level: "mid" },
      { key: "constellation", title: "星座网格", desc: "2D 网格，鼠标斥力弹簧物理", level: "low" },
      { key: "mouse", title: "鼠标跟随交互", desc: "极光/鲸鱼/星座跟随光标互动；关闭后极光改为自主缓慢漂移，画面保持流动", level: "low" }
    ];
    var levelText = { high: "高", mid: "中", low: "低" };
    function presetButtons() {
      return presetIds.map(function (id) {
        return h("button", {
          key: id,
          type: "button",
          className: "dsh-bg-preset",
          "data-active": snap.mode === id,
          onClick: function () { applyPreset(id); }
        }, presetNames[id]);
      });
    }
    function switchBtn(key) {
      return h("button", {
        type: "button",
        className: "dsh-bg-switch",
        role: "switch",
        "aria-checked": snap[key] ? "true" : "false",
        "aria-label": "开关",
        onClick: function () { updateSetting(key, !snap[key]); }
      });
    }
    function rowEl(row) {
      return h("div", { key: row.key, className: "dsh-bg-row" },
        h("div", { className: "dsh-bg-row-info" },
          h("div", { className: "dsh-bg-row-title" }, row.title,
            h("span", { className: "dsh-bg-chip", "data-level": row.level }, levelText[row.level] + "负载")),
          h("div", { className: "dsh-bg-row-desc" }, row.desc)),
        switchBtn(row.key));
    }
    function sliderItem(title, desc, valText, min, max, step, val, minLabel, maxLabel, onValChange) {
      return h("div", { className: "dsh-bg-slider-item" },
        h("div", { className: "dsh-bg-slider-head" },
          h("span", { className: "dsh-bg-item-title" }, title),
          h("span", { className: "dsh-bg-val-badge" }, valText)),
        desc ? h("div", { className: "dsh-bg-item-desc" }, desc) : null,
        h("input", {
          type: "range",
          className: "dsh-bg-range",
          min: min,
          max: max,
          step: step,
          value: val,
          onChange: function (e) { onValChange(e.target.value); }
        }),
        (minLabel || maxLabel) ? h("div", { className: "dsh-bg-range-labels" },
          h("span", null, minLabel || ""),
          h("span", null, maxLabel || "")) : null
      );
    }
    function selectItem(title, desc, value, options, onValChange) {
      return h("div", { className: "dsh-bg-adv-row" },
        h("div", { className: "dsh-bg-adv-info" },
          h("div", { className: "dsh-bg-item-title" }, title),
          desc ? h("div", { className: "dsh-bg-item-desc" }, desc) : null),
        h("select", {
          className: "dsh-bg-select",
          value: value,
          onChange: function (e) { onValChange(e.target.value); }
        }, options.map(function (opt) {
          return h("option", { key: opt.value, value: opt.value }, opt.label);
        }))
      );
    }
    return h("div", { className: "dsh-bg-settings" },
      h("div", { className: "dsh-bg-card" },
        h("div", { className: "dsh-bg-sec-title" }, "性能档位"),
        h("div", { className: "dsh-bg-presets" }, presetButtons()),
        h("div", { className: "dsh-bg-preset-caption" }, modeName + " · " + modeCaption),
        h("div", { className: "dsh-bg-div" }),
        h("div", { className: "dsh-bg-meter-label" },
          h("span", null, "估算 GPU 负载"),
          h("span", { style: { color: meterColor, fontWeight: 600 } }, gpu + "%")),
        h("div", { className: "dsh-bg-meter" }, h("div", { style: { width: gpu + "%", background: meterColor } })),
        h("div", { className: "dsh-bg-meta" },
          "按 分辨率 × 帧率 估算（背景引擎四项），仅供参考；切换即时生效并自动保存。" +
          (snap.canvasW ? " 当前极光画布 " + snap.canvasW + "×" + snap.canvasH + "（×" + snap.auroraScale.toFixed(2) + "）" : "")),
        h("div", { className: "dsh-bg-div" }),
        h("div", { className: "dsh-bg-sec-title" }, "特效开关"),
        rows.map(rowEl)),
      h("details", { className: "dsh-bg-adv dsh-bg-card" },
        h("summary", null, "渲染质量（高级）"),
        sliderItem("极光分辨率", "降低画布内部分辨率可显著减轻 GPU 渲染与显存开销", "×" + snap.auroraScale.toFixed(2), 0.4, 1, 0.05, snap.auroraScale, "0.40× (节能)", "1.00× (高清)", function (v) { updateSetting("auroraScale", parseFloat(v)); }),
        selectItem("动画帧率上限", "鼠标交互期间自动提升至 60fps 保证操作跟手，停止 200ms 后回落", snap.fps, [
          { value: 20, label: "20 fps（最省）" },
          { value: 24, label: "24 fps（均衡）" },
          { value: 30, label: "30 fps（流畅）" },
          { value: 60, label: "60 fps（极致流畅）" }
        ], function (v) { updateSetting("fps", parseInt(v, 10)); }),
        sliderItem("跟手灵敏度", "鼠标跟随平滑时间常数（越小越贴手响应越快，越大越绵柔滞后）", snap.followMs + " ms", 5, 120, 5, snap.followMs, "5 ms (极速贴手)", "120 ms (绵柔)", function (v) { updateSetting("followMs", parseInt(v, 10)); }),
        sliderItem("光线跟随强度", "粒子鲸鱼与高光聚焦点随光标移动的响应幅度", Math.round(snap.lightFollow * 100) + "%", 0, 100, 5, Math.round(snap.lightFollow * 100), "0% (固定不动)", "100% (完全跟随)", function (v) { updateSetting("lightFollow", parseInt(v, 10) / 100); })),
      h("div", { className: "dsh-bg-foot" },
        h("button", { type: "button", className: "dsh-bg-reset", onClick: function () { resetSettings(); } }, "恢复默认"),
        h("span", { className: "dsh-bg-note" }, "v__PKG_VERSION__ · 即时生效并自动保存")));
  }

  /** 注册设置页条目（需要 slots 服务；缺 ctx/slots 时静默跳过） */
  function setupSettingsUi(ctx) {
    if (!react) return;
    try {
      var slots = ctx && ctx.get ? ctx.get("slots") : null;
      if (!slots) return;
      injectSettingsCss();
      slots.inject("settings.section", function () {
        return slots.register({
          name: "settings.section",
          id: "dsh-bg-effects",
          order: 5,
          label: function () { return "背景特效"; }
        }, BgSettingsSection);
      });
    } catch (e) {}
  }

  shared.refs.setupSettingsUi = setupSettingsUi;
}

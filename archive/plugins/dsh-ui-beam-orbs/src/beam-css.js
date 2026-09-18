/* ===================================================================== *
 * src/beam-css.js — 工厂级片段（无副作用：纯常量与纯函数）
 *   Border Beam 调色板 / BEAM_* 参数 / CSS 生成函数（buildBeamCSS 等），
 *   被 src/beam.js（initBeam）直接调用。拼接时置于工厂闭包顶层。
 * ===================================================================== */
/* ===================================================================== *
 * Border Beam (beam.jakubantalik.com) — ported for DSH composer
 * Copyright (c) Jakub Antalik, MIT — https://github.com/Jakubantalik/Libraries
 * Variant: md conic-gradient / colorful, mono, sunset, duration 2.45s, 0.8x
 * ===================================================================== */
  var BEAM_ID = "dsh-composer";
  var BEAM_DURATION = 2.45; // 0.8x md full border
  var BEAM_HUE_RANGE = 30;
  var BEAM_BRIGHTNESS = 1.3;
  var BEAM_CFG_DARK = { stroke: 0.26, inner: 0.42, bloom: 0.24, innerShadow: "rgba(255, 255, 255, 0.27)" };
  var BEAM_CFG_LIGHT = { stroke: 0.12, inner: 0.26, bloom: 0.34, innerShadow: "rgba(0, 0, 0, 0.14)" };

  var colorPalettes = {
    colorful: {
      border: [
        { color: "rgb(255, 50, 100)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(40, 140, 255)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(50, 200, 80)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(30, 185, 170)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(100, 70, 255)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(40, 140, 255)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(255, 120, 40)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(240, 50, 180)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(180, 40, 240)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    },
    mono: {
      border: [
        { color: "rgb(180, 180, 180)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(140, 140, 140)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(160, 160, 160)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(130, 130, 130)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(170, 170, 170)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(150, 150, 150)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(190, 190, 190)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(145, 145, 145)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(165, 165, 165)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    },
    sunset: {
      border: [
        { color: "rgb(255, 80, 50)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(255, 160, 40)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(255, 120, 60)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(255, 200, 50)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(255, 100, 80)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(255, 180, 60)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(255, 60, 60)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(255, 140, 50)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(255, 90, 70)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    }
  };

  function getColorGradients(variant, isDark, id) {
    var _v = variant || "colorful";
    var pal = (colorPalettes[_v] || colorPalettes.colorful).border;
    return pal.map(function(c) {
      return "radial-gradient(ellipse " + c.size + " at " + c.pos + ", " + c.color + ", transparent)";
    }).join(",\n    ");
  }

  function getInnerGradients(variant, isDark, id) {
    var _v = variant || "colorful";
    var pal = (colorPalettes[_v] || colorPalettes.colorful).border;
    var baseOpacity = _v === "mono" ? 0.225 : 0.45;
    return pal.map(function(c) {
      var rgba = c.color.replace("rgb(", "rgba(").replace(")", ", " + baseOpacity + ")");
      var sz = c.size.split(" ").map(function(s) { return Math.round(parseInt(s) * 0.9) + "px"; }).join(" ");
      return "radial-gradient(ellipse " + sz + " at " + c.pos + ", " + rgba + ", transparent)";
    }).join(",\n    ");
  }

  function buildBeamCSS(id, borderRadius, isDark, variant) {
    variant = variant || "colorful";
    var cfg = isDark ? BEAM_CFG_DARK : BEAM_CFG_LIGHT;
    var sat = isDark ? 1.2 : 1.5;
    var innerRadius = Math.max(0, borderRadius - 1);
    var hueAnim = "animation: beam-hue-shift-" + id + " 12s ease-in-out infinite;";
    var hueKeyframes = "@keyframes beam-hue-shift-" + id + " {\n" +
      "  0% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "  50% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "  100% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "}";

    var whiteGrad = isDark
      ? "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 54%,\n" +
        "  rgba(255, 255, 255, 0.1) 57%,\n" +
        "  rgba(255, 255, 255, 0.3) 60%,\n" +
        "  rgba(255, 255, 255, 0.6) 63%,\n" +
        "  rgba(255, 255, 255, 0.75) 66%,\n" +
        "  rgba(255, 255, 255, 0.6) 69%,\n" +
        "  rgba(255, 255, 255, 0.3) 72%,\n" +
        "  rgba(255, 255, 255, 0.1) 75%,\n" +
        "  transparent 78%, transparent 100%\n" +
        ")"
      : "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 54%,\n" +
        "  rgba(0, 0, 0, 0.08) 57%,\n" +
        "  rgba(0, 0, 0, 0.2) 60%,\n" +
        "  rgba(0, 0, 0, 0.4) 63%,\n" +
        "  rgba(0, 0, 0, 0.55) 66%,\n" +
        "  rgba(0, 0, 0, 0.4) 69%,\n" +
        "  rgba(0, 0, 0, 0.2) 72%,\n" +
        "  rgba(0, 0, 0, 0.08) 75%,\n" +
        "  transparent 78%, transparent 100%\n" +
        ")";

    var colorGrads, innerGrads;
    if (variant === "sunset") {
      colorGrads = "conic-gradient(from var(--beam-angle-" + id + "), transparent 0%, transparent 45%, rgb(255, 60, 20) 50%, rgb(255, 90, 0) 55%, rgb(220, 40, 0) 60%, transparent 65%, transparent 100%)";
      innerGrads = "conic-gradient(from var(--beam-angle-" + id + "), transparent 0%, transparent 45%, rgba(255, 60, 20, 0.6) 50%, rgba(255, 90, 0, 0.5) 55%, transparent 65%)";
    } else {
      colorGrads = getColorGradients(variant, isDark, id);
      innerGrads = getInnerGradients(variant, isDark, id);
    }

    var bloomGrad = isDark
      ? "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 58%,\n" +
        "  rgba(255, 255, 255, 0.03) 62%,\n" +
        "  rgba(255, 255, 255, 0.08) 65%,\n" +
        "  rgba(255, 255, 255, 0.2) 67%,\n" +
        "  rgba(255, 255, 255, 0.45) 69%,\n" +
        "  rgba(255, 255, 255, 0.85) 70%,\n" +
        "  rgba(255, 255, 255, 0.85) 70.5%,\n" +
        "  rgba(255, 255, 255, 0.45) 71.5%,\n" +
        "  rgba(255, 255, 255, 0.2) 73%,\n" +
        "  rgba(255, 255, 255, 0.08) 75%,\n" +
        "  rgba(255, 255, 255, 0.03) 78%,\n" +
        "  transparent 82%\n" +
        ")"
      : "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 58%,\n" +
        "  rgba(0, 0, 0, 0.02) 62%,\n" +
        "  rgba(0, 0, 0, 0.08) 65%,\n" +
        "  rgba(0, 0, 0, 0.2) 67%,\n" +
        "  rgba(0, 0, 0, 0.4) 69%,\n" +
        "  rgba(0, 0, 0, 0.6) 70%,\n" +
        "  rgba(0, 0, 0, 0.6) 70.5%,\n" +
        "  rgba(0, 0, 0, 0.4) 71.5%,\n" +
        "  rgba(0, 0, 0, 0.2) 73%,\n" +
        "  rgba(0, 0, 0, 0.08) 75%,\n" +
        "  rgba(0, 0, 0, 0.02) 78%,\n" +
        "  transparent 82%\n" +
        ")";

    return "@property --beam-angle-" + id + " {\n" +
      "  syntax: \"<angle>\";\n" +
      "  initial-value: 0deg;\n" +
      "  inherits: true;\n" +
      "}\n" +
      "@property --beam-opacity-" + id + " {\n" +
      "  syntax: \"<number>\";\n" +
      "  initial-value: 0;\n" +
      "  inherits: true;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"] {\n" +
      "  position: relative;\n" +
      "  border-radius: " + borderRadius + "px;\n" +
      "  overflow: visible;\n" +
      "  isolation: isolate;\n" +
      "  transition: --beam-strength 0.35s cubic-bezier(0.16, 1, 0.3, 1);\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"]:not([data-active]):not([data-pulse]):hover {\n" +
      "  --beam-strength: 0.22;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active] {\n" +
      "  animation:\n" +
      "    beam-spin-" + id + " " + BEAM_DURATION + "s linear infinite,\n" +
      "    beam-fade-in-" + id + " 0.6s ease forwards;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-fading] {\n" +
      "  animation:\n" +
      "    beam-spin-" + id + " " + BEAM_DURATION + "s linear infinite,\n" +
      "    beam-fade-out-" + id + " 0.5s ease forwards;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active]::after,\n" +
      "[data-beam=\"" + id + "\"][data-fading]::after,\n" +
      "[data-beam=\"" + id + "\"][data-typing]::after,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::after {\n" +
      "  content: \"\";\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + innerRadius + "px;\n" +
      "  padding: 1px;\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  background: " + whiteGrad + ",\n" +
      "    " + colorGrads + ";\n" +
      "  -webkit-mask:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(#fff 0 0) content-box,\n" +
      "    linear-gradient(#fff 0 0);\n" +
      "  -webkit-mask-composite: source-in, xor;\n" +
      "  mask:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(#fff 0 0) content-box,\n" +
      "    linear-gradient(#fff 0 0);\n" +
      "  mask-composite: intersect, exclude;\n" +
      "  pointer-events: none;\n" +
      "  z-index: 2;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.stroke.toFixed(2) + " * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));\n" +
      "  " + hueAnim + "\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active]::before,\n" +
      "[data-beam=\"" + id + "\"][data-fading]::before,\n" +
      "[data-beam=\"" + id + "\"][data-typing]::before,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::before {\n" +
      "  content: \"\";\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + borderRadius + "px;\n" +
      "  background: " + innerGrads + ";\n" +
      "  box-shadow: inset 0 0 9px 1px " + cfg.innerShadow + ";\n" +
      "  -webkit-mask-image:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),\n" +
      "    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);\n" +
      "  -webkit-mask-composite: source-in, source-over;\n" +
      "  mask-image:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),\n" +
      "    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);\n" +
      "  mask-composite: intersect, add;\n" +
      "  pointer-events: none;\n" +
      "  z-index: 1;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.inner.toFixed(2) + " * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  " + hueAnim + "\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"] [data-beam-bloom] {\n" +
      "  display: none;\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + innerRadius + "px;\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  background: " + bloomGrad + ";\n" +
      "  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n" +
      "  -webkit-mask-composite: xor;\n" +
      "  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n" +
      "  mask-composite: exclude;\n" +
      "  padding: 1px;\n" +
      "  filter: blur(8px) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + ");\n" +
      "  pointer-events: none;\n" +
      "  z-index: 3;\n" +
      "  opacity: 0;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-fading] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-typing] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-pulse] [data-beam-bloom] {\n" +
      "  display: block;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.bloom.toFixed(2) + " * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));\n" +
      "}\n" +
      "@keyframes beam-spin-" + id + " {\n" +
      "  to { --beam-angle-" + id + ": 360deg; }\n" +
      "}\n" +
      "@keyframes beam-fade-in-" + id + " {\n" +
      "  to { --beam-opacity-" + id + ": 1; }\n" +
      "}\n" +
      "@keyframes beam-fade-out-" + id + " {\n" +
      "  from { --beam-opacity-" + id + ": 1; }\n" +
      "  to { --beam-opacity-" + id + ": 0; }\n" +
      "}\n" +
      hueKeyframes + "\n" +
      "/* Typing edge breathing override (stationary mono beam, no spin/rainbow) */\n" +
      "[data-beam=\"" + id + "\"][data-typing] {\n" +
      "  --beam-opacity-" + id + ": 1;\n" +
      "  animation: none !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing]::after {\n" +
      "  animation: beam-typing-stroke-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing]::before {\n" +
      "  animation: beam-typing-inner-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing] [data-beam-bloom] {\n" +
      "  animation: beam-typing-bloom-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "@keyframes beam-typing-stroke-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.35;\n" +
      "    filter: brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.55);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.55;\n" +
      "    filter: brightness(1.1);\n" +
      "  }\n" +
      "}\n" +
      "@keyframes beam-typing-inner-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.25;\n" +
      "    filter: brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 0.85;\n" +
      "    filter: brightness(1.4);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.4;\n" +
      "    filter: brightness(1.05);\n" +
      "  }\n" +
      "}\n" +
      "@keyframes beam-typing-bloom-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.2;\n" +
      "    filter: blur(6px) brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 0.95;\n" +
      "    filter: blur(10px) brightness(1.6);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.35;\n" +
      "    filter: blur(7px) brightness(1.15);\n" +
      "  }\n" +
      "}\n" +
      "/* Completion pulse flash */\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::after,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::before,\n" +
      "[data-beam=\"" + id + "\"][data-pulse] [data-beam-bloom] {\n" +
      "  animation: beam-pulse-flash 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;\n" +
      "}\n" +
      "@keyframes beam-pulse-flash {\n" +
      "  0% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.6) saturate(1.4);\n" +
      "    transform: scale(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.8) saturate(1.6);\n" +
      "    transform: scale(1.015);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0;\n" +
      "    filter: brightness(1) saturate(1);\n" +
      "    transform: scale(1);\n" +
      "  }\n" +
      "}\n" +
      "/* Paused rule */\n" +
      "[data-beam=\"" + id + "\"][data-paused],\n" +
      "[data-beam=\"" + id + "\"][data-paused]::after,\n" +
      "[data-beam=\"" + id + "\"][data-paused]::before,\n" +
      "[data-beam=\"" + id + "\"][data-paused] [data-beam-bloom] {\n" +
      "  animation-play-state: paused !important;\n" +
      "}\n" +
      "@media (prefers-reduced-motion: reduce) {\n" +
      "  [data-beam=\"" + id + "\"][data-active],\n" +
      "  [data-beam=\"" + id + "\"][data-fading],\n" +
      "  [data-beam=\"" + id + "\"][data-active]::after,\n" +
      "  [data-beam=\"" + id + "\"][data-fading]::after,\n" +
      "  [data-beam=\"" + id + "\"][data-active]::before,\n" +
      "  [data-beam=\"" + id + "\"][data-fading]::before,\n" +
      "  [data-beam=\"" + id + "\"][data-active] [data-beam-bloom],\n" +
      "  [data-beam=\"" + id + "\"][data-fading] [data-beam-bloom] {\n" +
      "    animation: none !important;\n" +
      "  }\n" +
      "}";
  }

  



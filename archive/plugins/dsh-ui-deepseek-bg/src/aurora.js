/* ------------------------------------------------------------------ *
 * src/aurora.js — 极光引擎（initAurora，WebGL2 流体/粒子）
 *   shader 源码常量（VERT/FLOWMAP_FS/PARTICLE_FS/FLUID_FS）在 src/aurora-shaders.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initAurora(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /* ------------------------------------------------------------------ *
   * 极光引擎（WebGL2）
   * ------------------------------------------------------------------ */
  function startAurora() {
    var canvas = shared.dom.auroraCanvas;
    // GPU 优化：单张全屏三角形/条带没有任何几何边缘，MSAA 对片元着色结果零影响，
    // antialias:false 直接省掉 MSAA tile 显存与每帧 resolve 带宽（鲸鱼层同款处理）。
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, powerPreference: "low-power", antialias: false });
    if (!gl) { canvas.dataset.state = "no-webgl2"; return; }
    diag.auroraGL = true;
    // 上下文丢失防护：GPU 内存回收后可重建
    try {
      canvas.addEventListener("webglcontextlost", function(e){ try{ e.preventDefault(); }catch(_){} running=false; if(raf){ try{ cancelAnimationFrame(raf);}catch(_){} raf=0; } canvas.dataset.state="context-lost"; });
      canvas.addEventListener("webglcontextrestored", function(){ try{ canvas.dataset.state="restoring"; startAurora(); }catch(_){} });
    } catch(_){}

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = ""; try{ log = gl.getShaderInfoLog(s) || "compile failed"; }catch(_){}
        try{ console.error("[dsh-bg] aurora shader compile failed:", log.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state = "shader-compile-fail:" + log.slice(0,200); diag.auroraProgs = "compile-fail"; }catch(_){}
        try{ gl.deleteShader(s); }catch(_){}
        return null;
      }
      return s;
    }
    function link(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        var log2=""; try{ log2 = gl.getProgramInfoLog(p) || "link failed"; }catch(_){}
        try{ console.error("[dsh-bg] aurora program link failed:", log2.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state = "shader-link-fail:" + log2.slice(0,200); diag.auroraProgs = "link-fail"; }catch(_){}
        try{ gl.deleteProgram(p); }catch(_){}
        return null;
      }
      return p;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var progFlow = link(vs, compile(gl.FRAGMENT_SHADER, FLOWMAP_FS));
    var progPart = link(vs, compile(gl.FRAGMENT_SHADER, PARTICLE_FS));
    var progFluid = link(vs, compile(gl.FRAGMENT_SHADER, FLUID_FS));
    diag.auroraProgs = [progFlow ? "flow" : "", progPart ? "particle" : "", progFluid ? "fluid" : ""].filter(Boolean).join(",");
    if (!progFlow || !progPart || !progFluid) return;

    var uFlow = {
      prev: gl.getUniformLocation(progFlow, "u_prev"),
      mouse: gl.getUniformLocation(progFlow, "u_mouse"),
      velocity: gl.getUniformLocation(progFlow, "u_velocity"),
      brushRadius: gl.getUniformLocation(progFlow, "u_brushRadius"),
      brushStrength: gl.getUniformLocation(progFlow, "u_brushStrength"),
      decay: gl.getUniformLocation(progFlow, "u_decay")
    };
    var uPart = {
      time: gl.getUniformLocation(progPart, "u_time"),
      pixelRatio: gl.getUniformLocation(progPart, "u_pixelRatio"),
      resolution: gl.getUniformLocation(progPart, "u_resolution"),
      scale: gl.getUniformLocation(progPart, "u_scale"),
      rotation: gl.getUniformLocation(progPart, "u_rotation"),
      offset: gl.getUniformLocation(progPart, "u_offset"),
      color1: gl.getUniformLocation(progPart, "u_color1"),
      color2: gl.getUniformLocation(progPart, "u_color2"),
      color3: gl.getUniformLocation(progPart, "u_color3"),
      color4: gl.getUniformLocation(progPart, "u_color4"),
      color5: gl.getUniformLocation(progPart, "u_color5"),
      colorCount: gl.getUniformLocation(progPart, "u_colorCount"),
      proportion: gl.getUniformLocation(progPart, "u_proportion"),
      softness: gl.getUniformLocation(progPart, "u_softness"),
      shape: gl.getUniformLocation(progPart, "u_shape"),
      shapeScale: gl.getUniformLocation(progPart, "u_shapeScale"),
      distortion: gl.getUniformLocation(progPart, "u_distortion"),
      swirl: gl.getUniformLocation(progPart, "u_swirl"),
      swirlIterations: gl.getUniformLocation(progPart, "u_swirlIterations"),
      flowmap: gl.getUniformLocation(progPart, "u_flowmap"),
      distortBoost: gl.getUniformLocation(progPart, "u_distortBoost"),
      noiseBoost: gl.getUniformLocation(progPart, "u_noiseBoost"),
      swirlBoost: gl.getUniformLocation(progPart, "u_swirlBoost"),
      glowIntensity: gl.getUniformLocation(progPart, "u_glowIntensity"),
      glowColor1: gl.getUniformLocation(progPart, "u_glowColor1"),
      glowColor2: gl.getUniformLocation(progPart, "u_glowColor2"),
      glowColor3: gl.getUniformLocation(progPart, "u_glowColor3")
    };
    var uFluid = {
      time: gl.getUniformLocation(progFluid, "u_time"),
      resolution: gl.getUniformLocation(progFluid, "u_resolution"),
      scale: gl.getUniformLocation(progFluid, "u_scale"),
      offset: gl.getUniformLocation(progFluid, "u_offset"),
      grain: gl.getUniformLocation(progFluid, "u_grain"),
      speed: gl.getUniformLocation(progFluid, "u_speed"),
      flowmap: gl.getUniformLocation(progFluid, "u_flowmap"),
      distortBoost: gl.getUniformLocation(progFluid, "u_distortBoost"),
      swirlBoost: gl.getUniformLocation(progFluid, "u_swirlBoost"),
      glowIntensity: gl.getUniformLocation(progFluid, "u_glowIntensity"),
      glowColor1: gl.getUniformLocation(progFluid, "u_glowColor1"),
      glowColor2: gl.getUniformLocation(progFluid, "u_glowColor2"),
      glowColor3: gl.getUniformLocation(progFluid, "u_glowColor3"),
      c1: gl.getUniformLocation(progFluid, "u_c1"),
      c2: gl.getUniformLocation(progFluid, "u_c2"),
      c3: gl.getUniformLocation(progFluid, "u_c3"),
      c4: gl.getUniformLocation(progFluid, "u_c4"),
      c5: gl.getUniformLocation(progFluid, "u_c5"),
      lightPos: gl.getUniformLocation(progFluid, "u_lightPos"),
      lightCore: gl.getUniformLocation(progFluid, "u_lightCore"),
      lightHalo: gl.getUniformLocation(progFluid, "u_lightHalo"),
      vignette: gl.getUniformLocation(progFluid, "u_vignette"),
      bloomThreshold: gl.getUniformLocation(progFluid, "u_bloomThreshold"),
      bloomRange: gl.getUniformLocation(progFluid, "u_bloomRange"),
      bloomStrength: gl.getUniformLocation(progFluid, "u_bloomStrength")
    };

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var _locFlow = gl.getAttribLocation(progFlow, "a_position");
    var _locPart = gl.getAttribLocation(progPart, "a_position");
    var _locFluid = gl.getAttribLocation(progFluid, "a_position");
    function bindAttrib(prog) {
      var loc = prog === progFlow ? _locFlow : (prog === progPart ? _locPart : (prog === progFluid ? _locFluid : gl.getAttribLocation(prog, "a_position")));
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    function makeTarget(w, h, data) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, tex: tex };
    }

    var W = 0, H = 0, wQ = 0, hQ = 0;
    var flip = false;
    // GPU 优化：极光是柔和渐变背景，内部分辨率按 DPR 上限 1.5 再乘 0.75 渲染，
    // 由 CSS 放大到全屏。像素量约为原 1.5x 的 1/4（1x 屏幕）~ 56%（retina），
    // 对流动渐变背景肉眼几乎无差，fragment 负载（本插件最大 GPU 开销）大幅下降。
    var AURORA_SCALE = 0.75;
    // 分辨率由设置面板的「极光分辨率」滑杆实时控制（0.4–1.0）
    function auroraScale() { return Math.min(window.devicePixelRatio || 1, 1.5) * (bgSettings.auroraScale || AURORA_SCALE); }
    var k = auroraScale();
    function resizeAll() {
      // 释放旧渲染目标（纹理+FBO），避免窗口/DPR 变化时 GPU 内存堆积
      if (targetA) { try { gl.deleteTexture(targetA.tex); gl.deleteFramebuffer(targetA.fbo); } catch (e) {} }
      if (targetB) { try { gl.deleteTexture(targetB.tex); gl.deleteFramebuffer(targetB.fbo); } catch (e) {} }
      k = auroraScale(); // DPR 变化时保持 resize 判定与渲染一致，避免每帧重建纹理
      W = Math.round(canvas.clientWidth * k);
      H = Math.round(canvas.clientHeight * k);
      canvas.width = W; canvas.height = H;
      wQ = Math.round(W / 4); hQ = Math.round(H / 4);
      var init = new Uint8Array(wQ * hQ * 4);
      for (var i = 0; i < wQ * hQ; i++) { init[4 * i] = 0; init[4 * i + 1] = 128; init[4 * i + 2] = 128; init[4 * i + 3] = 255; }
      targetA = makeTarget(wQ, hQ, init);
      targetB = makeTarget(wQ, hQ, init);
    }
    var targetA = null, targetB = null;
    resizeAll();

    var mouse = { x: 0.5, y: 0.5, smoothX: 0.5, smoothY: 0.5, vx: 0, vy: 0, svx: 0, svy: 0, rawVX: 0, rawVY: 0, lastT: 0, lastMove: 0 };
    // 鼠标笔刷/光线跟随：由设置面板「鼠标跟随交互」开关实时控制（每帧判定）
    function auroraMouseEnabled() { return !media.reducedMotion && !media.coarse && !media.isWindows && bgSettings.mouse; }
    function onMove(e) {
      // 画布为 position:fixed inset:0 铺满视口，直接用视口尺寸换算，
      // 避免 mousemove 高频事件里 getBoundingClientRect() 的强制布局
      var w = window.innerWidth || canvas.clientWidth || 1;
      var h = window.innerHeight || canvas.clientHeight || 1;
      var nx = e.clientX / w;
      var ny = 1 - e.clientY / h;
      var t = performance.now();
      var dt = Math.max(1, t - (mouse.lastT || t));
      // 用事件时间戳求真实速度（归一化坐标/秒），驱动流场拖尾方向；限幅防异常事件
      var vx = (nx - mouse.x) / (dt / 1000);
      var vy = (ny - mouse.y) / (dt / 1000);
      var sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > 6) { vx = vx / sp * 6; vy = vy / sp * 6; }
      mouse.rawVX = vx; mouse.rawVY = vy;
      mouse.x = nx; mouse.y = ny;
      mouse.lastT = t; mouse.lastMove = t;
    }
    // 监听常驻（一个 passive listener 成本可忽略），是否生效由 auroraMouseEnabled 逐帧决定
    window.addEventListener("mousemove", onMove, { passive: true });

    var start = performance.now();
    var raf = 0;
    var running = true;
    // flowmap 与渲染解耦为两个独立节奏：交互活跃期均 60Hz，静止回落低频
    var lastFlow = 0, lastRender = 0;
    var latestTex = null;
    var auroraBlanked = false;

    var _hexCache = {};
    function hex2rgb(hex) {
      if (_hexCache[hex]) return _hexCache[hex];
      var h = hex.replace("#", "");
      var rgb = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
      _hexCache[hex] = rgb;
      return rgb;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      if (!bgSettings.aurora) {
        // 关闭：清空画布一次（透明）后跳过渲染，rAF 空转成本可忽略
        if (!auroraBlanked) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); auroraBlanked = true; }
        return;
      }
      var cfg = shared.refs.currentAuroraConfig();

      var kk = auroraScale();
      var w = Math.round(canvas.clientWidth * kk);
      var h = Math.round(canvas.clientHeight * kk);
      if (w !== W || h !== H) resizeAll();

      var useM = auroraMouseEnabled();
      // 交互活跃期（最近 200ms 内有鼠标移动）：flowmap 与渲染同步提到 60fps，
      // 笔刷轨迹/光线跟手无感；静止后自动回落设置帧率，不白烧 GPU
      var active = useM && (now - (mouse.lastMove || 0) < 200);
      var flowHz = active ? 60 : 30;
      var renderHz = active ? Math.max(60, bgSettings.fps || 30) : (bgSettings.fps || 30);

      // 漫游笔刷目标（鼠标跟随关闭时）：Lissajous 轨迹 + 解析速度
      var driftX = 0.5, driftY = 0.5, driftVX = 0, driftVY = 0;
      if (!useM) {
        var driftT = (now - start) * 0.001;
        var a1 = driftT * 0.09, b1 = driftT * 0.13;
        driftX = 0.5 + 0.38 * Math.sin(a1);
        driftY = 0.5 + 0.3 * Math.cos(b1);
        var e1 = 0.1;
        driftVX = (0.38 * (Math.sin(a1 + e1) - Math.sin(a1))) / e1;
        driftVY = (0.3 * (Math.cos(b1 + e1) - Math.cos(b1))) / e1;
      }

      // ---- flowmap 更新（独立节奏：交互期 60Hz，静止 30Hz；与渲染解耦保证笔刷实时性） ----
      if (now - lastFlow >= 1000 / flowHz) {
        var fdt = Math.min(0.25, (now - lastFlow) / 1000);
        lastFlow = now - (now - lastFlow) % (1000 / flowHz);
        // 帧率无关临界阻尼平滑：时间常数由「跟手灵敏度」控制（默认 20ms）
        // —— 越小越贴手、滤掉事件抖动，越大越绵柔
        var followTau = (bgSettings.followMs != null ? bgSettings.followMs : 20) / 1000;
        var kp = 1 - Math.exp(-fdt / followTau);
        mouse.smoothX += ((useM ? mouse.x : driftX) - mouse.smoothX) * kp;
        mouse.smoothY += ((useM ? mouse.y : driftY) - mouse.smoothY) * kp;
        // 速度平滑：时间常数为跟手灵敏度的 4 倍（默认 80ms），拖尾方向稳定不抖
        var kv = 1 - Math.exp(-fdt / (followTau * 4));
        mouse.svx += (mouse.rawVX - mouse.svx) * kv;
        mouse.svy += (mouse.rawVY - mouse.svy) * kv;

        var brushX = mouse.smoothX, brushY = mouse.smoothY;
        var brushVX = useM ? mouse.svx : driftVX;
        var brushVY = useM ? mouse.svy : driftVY;
        var brushStrength = useM ? cfg.mouseStrength : cfg.mouseStrength * 0.28;

        // --- flowmap pass（低分辨率流场，双缓冲乒乓；鼠标或漫游笔刷持续喂入） ---
        var src = flip ? targetA : targetB;
        var dst = flip ? targetB : targetA;
        flip = !flip;
        latestTex = dst.tex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, wQ, hQ);
        gl.useProgram(progFlow);
        bindAttrib(progFlow);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(uFlow.prev, 0);
        gl.uniform2f(uFlow.mouse, brushX, brushY);
        gl.uniform2f(uFlow.velocity, brushVX, brushVY);
        gl.uniform1f(uFlow.brushRadius, cfg.mouseRadius);
        gl.uniform1f(uFlow.brushStrength, brushStrength);
        // 衰减按实际帧间隔归一化（基准 30fps）：任何更新频率下拖尾淡出速度一致
        gl.uniform1f(uFlow.decay, Math.pow(cfg.decay, fdt * 30));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
      }

      // ---- 渲染（帧率跟随设置；交互活跃期提到 60fps） ----
      if (now - lastRender < 1000 / renderHz) return;
      lastRender = now - (now - lastRender) % (1000 / renderHz);
      auroraBlanked = false;

      // --- 渲染 ---
      var t = (performance.now() - start) * 0.001 * (cfg.speed / 100);
      if (cfg.type === "fluid") {
        gl.useProgram(progFluid);
        bindAttrib(progFluid);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, latestTex);
        gl.uniform1i(uFluid.flowmap, 0);
        gl.uniform1f(uFluid.time, t);
        gl.uniform2f(uFluid.resolution, W, H);
        gl.uniform1f(uFluid.scale, cfg.scale);
        gl.uniform2f(uFluid.offset, cfg.offsetX / 100, cfg.offsetY / 100);
        gl.uniform1f(uFluid.grain, cfg.grain);
        gl.uniform1f(uFluid.distortBoost, cfg.distortBoost);
        gl.uniform1f(uFluid.swirlBoost, cfg.swirlBoost);
        var lx = cfg.lightX != null ? cfg.lightX : 0.89;
        // 光线跟随：官方 lightFollow × 设置面板强度，关闭鼠标跟随时完全静止（用 useM 守卫而非 0.85 衰减）
        var lf = cfg.lightFollow != null ? cfg.lightFollow * (bgSettings.lightFollow != null ? bgSettings.lightFollow : 1) * (useM ? 1 : 0) : 0;
        gl.uniform2f(uFluid.lightPos, lx + (mouse.smoothX - lx) * lf, cfg.lightY != null ? cfg.lightY : 0.46);
        gl.uniform1f(uFluid.lightCore, media.coarse ? 0 : (cfg.lightCore != null ? cfg.lightCore : 0.14));
        gl.uniform1f(uFluid.lightHalo, media.coarse ? 0 : (cfg.lightHalo != null ? cfg.lightHalo : 0.2));
        gl.uniform1f(uFluid.vignette, cfg.vignette != null ? cfg.vignette : 0.38);
        gl.uniform1f(uFluid.bloomThreshold, cfg.bloomThreshold != null ? cfg.bloomThreshold : 0.61);
        gl.uniform1f(uFluid.bloomRange, cfg.bloomRange != null ? cfg.bloomRange : 0.18);
        gl.uniform1f(uFluid.bloomStrength, cfg.bloomStrength != null ? cfg.bloomStrength : 0.4);
        gl.uniform1f(uFluid.glowIntensity, cfg.glowIntensity);
        var gc1 = hex2rgb(cfg.glowColors[0] || "#ffffff");
        var gc2 = hex2rgb(cfg.glowColors[1] || cfg.glowColors[0] || "#ffffff");
        var gc3 = hex2rgb(cfg.glowColors[2] || cfg.glowColors[0] || "#ffffff");
        gl.uniform3f(uFluid.glowColor1, gc1[0], gc1[1], gc1[2]);
        gl.uniform3f(uFluid.glowColor2, gc2[0], gc2[1], gc2[2]);
        gl.uniform3f(uFluid.glowColor3, gc3[0], gc3[1], gc3[2]);
        var cs = cfg.colors || [];
        for (var ci = 0; ci < 5; ci++) {
          var c = hex2rgb(cs[ci] || cs[cs.length - 1] || "#000000");
          gl.uniform3f([uFluid.c1, uFluid.c2, uFluid.c3, uFluid.c4, uFluid.c5][ci], c[0], c[1], c[2]);
        }
      } else {
        gl.useProgram(progPart);
        bindAttrib(progPart);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, latestTex);
        gl.uniform1i(uPart.flowmap, 0);
        gl.uniform1f(uPart.time, t);
        gl.uniform1f(uPart.pixelRatio, window.devicePixelRatio || 1);
        gl.uniform2f(uPart.resolution, W, H);
        gl.uniform1f(uPart.scale, cfg.scale);
        gl.uniform1f(uPart.rotation, cfg.rotation / 90);
        gl.uniform2f(uPart.offset, cfg.offsetX / 100, cfg.offsetY / 100);
        var cols = cfg.colors || ["#2E58A4", "#D2E2EE", "#FFFFFF"];
        for (var pi = 0; pi < 5; pi++) {
          var pc = hex2rgb(cols[pi] || cols[cols.length - 1] || "#000000");
          gl.uniform4f([uPart.color1, uPart.color2, uPart.color3, uPart.color4, uPart.color5][pi], pc[0], pc[1], pc[2], 1);
        }
        gl.uniform1f(uPart.colorCount, cols.length);
        gl.uniform1f(uPart.proportion, cfg.proportion / 100);
        gl.uniform1f(uPart.softness, cfg.softness / 100);
        gl.uniform1f(uPart.shape, 0);
        gl.uniform1f(uPart.shapeScale, cfg.shapeScale / 100);
        gl.uniform1f(uPart.distortion, cfg.distortion / 100);
        gl.uniform1f(uPart.swirl, cfg.swirl / 50);
        gl.uniform1f(uPart.swirlIterations, cfg.swirlIterations);
        gl.uniform1f(uPart.distortBoost, cfg.distortBoost);
        gl.uniform1f(uPart.noiseBoost, cfg.noiseBoost);
        gl.uniform1f(uPart.swirlBoost, cfg.swirlBoost);
        gl.uniform1f(uPart.glowIntensity, cfg.glowIntensity);
        var pc1 = hex2rgb(cfg.glowColors[0] || "#ffffff");
        var pc2 = hex2rgb(cfg.glowColors[1] || cfg.glowColors[0] || "#ffffff");
        var pc3 = hex2rgb(cfg.glowColors[2] || cfg.glowColors[0] || "#ffffff");
        gl.uniform3f(uPart.glowColor1, pc1[0], pc1[1], pc1[2]);
        gl.uniform3f(uPart.glowColor2, pc2[0], pc2[1], pc2[2]);
        gl.uniform3f(uPart.glowColor3, pc3[0], pc3[1], pc3[2]);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (media.reducedMotion) {
      // 单帧静态（原代码误用未声明的 last，严格模式下抛 ReferenceError）
      lastFlow = 0;
      lastRender = 0;
      running = true;
      frame(performance.now());
      cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    } else {
      raf = requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        if (!raf && running) raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    window.addEventListener("resize", function () { resizeAll(); }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 粒子化鲸鱼引擎（官方移植：HeroDigitileR3F → 原生 WebGL2）
   * 源码取自官网 harness 页懒加载 chunk 776（未进缓存，已从官网抓取）：
   *   - 粒子位置：官方算法从 hero-whale.svg 像素亮度采样（60x60，边缘保留）
   *   - 顶点/片元 shader：官方 GLSL 逐字移植（three.js 矩阵替换为原生 uniform）
   *   - 交互：鼠标扭曲粒子（radius/strength/decay/distort）、光线跟随鼠标
   *     （lightParams.followX）、入场组装动画、松散漂移、游泳波动
   *   - 参数：DIGITILE_LIGHT_DEFAULTS / DIGITILE_MOUSE_DEFAULTS 与官方一致
   * ------------------------------------------------------------------ */
  // 官方鲸鱼纹理（hero-whale.svg，抓自 https://www.deepseek.com/harness/images/hero-whale.svg）

  shared.refs.startAurora = startAurora;
}

/* ------------------------------------------------------------------ *
 * src/whale.js — 粒子化鲸鱼引擎（initWhale）+ 鲸鱼层显隐
 *   shader/纹理常量与矩阵工具在 src/whale-shaders.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initWhale(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /** 鲸鱼层显隐：仅深色主题显示（官方深色 hero 元素），浅色保持官方原版 */
  function updateWhaleDisplay() {
    if (!shared.dom.whaleLayer) return;
    shared.dom.whaleLayer.style.display = (state.dark && bgSettings.whale) ? "flex" : "none";
  }
  function startWhale() {
    var canvas = shared.dom.whaleCanvas;
    // GPU 优化：点精灵粒子不需要 MSAA，antialias:false 省掉全屏 MSAA resolve；
    // low-power 提示驱动选择低功耗 GPU。渲染效果与原来一致（GL_POINTS 本来就不走多边形 AA）。
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) { canvas.dataset.state = "no-webgl2"; return; }
    diag.whaleGL = true;
    try {
      canvas.addEventListener("webglcontextlost", function(e){ try{ e.preventDefault(); }catch(_){} canvas.dataset.state="context-lost"; });
      canvas.addEventListener("webglcontextrestored", function(){ try{ canvas.dataset.state="restoring"; startWhale(); }catch(_){} });
    } catch(_){}
    var img = new Image();
    img.onload = function () {
      var data;
      try { data = sampleWhalePixels(img); } catch (e) { canvas.dataset.state = "sample-fail"; return; }
      if (!data || data.count === 0) { canvas.dataset.state = "sample-empty"; return; }
      canvas.dataset.count = data.count;
      initWhaleGL(gl, canvas, data);
    };
    img.onerror = function () { canvas.dataset.state = "img-fail"; };
    img.src = WHALE_SRC;
  }

  function initWhaleGL(gl, canvas, data) {
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log=""; try{ log=gl.getShaderInfoLog(s)||"compile failed"; }catch(_){}
        try{ console.error("[dsh-bg] whale shader compile failed:", log.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state="whale-compile-fail:"+log.slice(0,200); diag.whaleProgs="compile-fail"; }catch(_){}
        try{ gl.deleteShader(s); }catch(_){}
        return null;
      }
      return s;
    }
    var prog = gl.createProgram();
    var vsS = compile(gl.VERTEX_SHADER, WHALE_VS);
    var fsS = compile(gl.FRAGMENT_SHADER, WHALE_FS);
    if (!vsS || !fsS) { try{ canvas.dataset.state="whale-shader-null"; diag.whaleProgs="compile-fail"; }catch(_){} return; }
    gl.attachShader(prog, vsS);
    gl.attachShader(prog, fsS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log2=""; try{ log2=gl.getProgramInfoLog(prog)||"link failed"; }catch(_){}
      try{ console.error("[dsh-bg] whale program link failed:", log2.slice(0,400)); }catch(_){}
      try{ canvas.dataset.state = "link-fail:"+log2.slice(0,200); diag.whaleProgs = "link-fail"; }catch(_){}
      try{ gl.deleteProgram(prog); }catch(_){}
      return;
    }
    canvas.dataset.state = "shader-ok";
    diag.whaleProgs = "ok";
    gl.useProgram(prog);

    function buf(attr, arr, size) {
      var loc = gl.getAttribLocation(prog, attr);
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    buf("aCenter", data.positions, 3);
    buf("aScattered", data.scatteredPositions, 3);
    buf("aOpacity", data.opacities, 1);
    buf("aEdge", data.edges, 1);
    var idx = new Float32Array(data.count);
    for (var i = 0; i < data.count; i++) idx[i] = i;
    buf("aIndex", idx, 1);
    // 官方实例缩放：s = .5 + 1*Math.random()（0.5–1.5）——粒子大小有变化，
    // 大粒子呈现小方块，是官方鲸鱼层次感的关键（chunk 776 源码原逻辑）
    var scaleArr = new Float32Array(data.count);
    for (var i2 = 0; i2 < data.count; i2++) scaleArr[i2] = 0.5 + 1 * Math.random();
    buf("aScale", scaleArr, 1);
    // position 属性默认 (0,0,0,1) —— 官方 BoxGeometry 的局部偏移对点精灵为 0

    var u = {};
    ["uTime","uWaveSpeed","uWaveAmount","uMouse","uMouseRadius","uMouseStrength","uMouseDistort",
     "uAssembly","uLoose","uScatter","uLightPos","uLightRange","uShadeMin","uShadeMax",
     "uModel","uView","uProj","uPointScale","uColor"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // three.js AdditiveBlending
    gl.disable(gl.DEPTH_TEST);

    // 鼠标状态机（官方：mouseActive / mouseHasMoved）
    var mouse = { x: 0, y: 0, active: false, hasMoved: false };
    function onMove(e) {
      if (!bgSettings.mouse) return; // 设置面板「鼠标跟随交互」关闭时忽略
      mouse.active = true;
      mouse.hasMoved = true;
      var w = window.innerWidth || 1, h = window.innerHeight || 1;
      mouse.x = (e.clientX / w) * 2 - 1;
      mouse.y = -((e.clientY / h) * 2 - 1);
    }
    function onLeave() { mouse.active = false; }
    function onVis() { if (document.hidden) mouse.active = false; }
    if (!media.reducedMotion) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);
      document.addEventListener("visibilitychange", onVis);
    }

    var start = performance.now();
    var raf = 0;
    var last = 0;
    var strength = 0;
    var b = { x: 0, y: 0 };
    // 光线跟随的平滑状态（屏幕归一化坐标，帧率无关指数平滑，时间常数 ~40ms）
    var wSX = 0, wSY = 0;
    var FOV = 50 * Math.PI / 180;
    // 相机距离：官方 18 → 15（18/15 = 1.2），鲸鱼整体等比放大 1.2 倍
    var CAM_DIST = 15;
    var HALF_H = Math.tan(FOV / 2) * CAM_DIST; // viewport（z=0 平面）半高
    var view = m4Translation(0, 0, -15);
    // GPU 优化：恒定不变的 uniform 只在初始化时上传一次（该 program 在此上下文常驻绑定），
    // 每帧省去约 10 次冗余 uniform 调用；动态值仍逐帧上传
    gl.uniformMatrix4fv(u.uView, false, view);
    gl.uniform1f(u.uWaveSpeed, WAVE_DEFAULTS.speed);
    gl.uniform1f(u.uWaveAmount, WAVE_DEFAULTS.amount);
    gl.uniform1f(u.uMouseRadius, MOUSE_DEFAULTS.radius);
    gl.uniform1f(u.uMouseDistort, MOUSE_DEFAULTS.distort);
    gl.uniform1f(u.uLoose, 1);
    gl.uniform1f(u.uScatter, 0);
    gl.uniform1f(u.uLightRange, LIGHT_DEFAULTS.range);
    gl.uniform1f(u.uShadeMin, LIGHT_DEFAULTS.shadeMin);
    gl.uniform1f(u.uShadeMax, LIGHT_DEFAULTS.shadeMax);
    // 复用矩阵缓冲，避免每帧分配 6 个 Float32Array(16)
    var _mTmpA = new Float32Array(16), _mTmpB = new Float32Array(16), _mTmpC = new Float32Array(16), _mTmpD = new Float32Array(16), _mTmpE = new Float32Array(16), _mTmpF = new Float32Array(16);
    var _modelBuf = new Float32Array(16), _projBuf = new Float32Array(16);
    var _invBuf = new Float32Array(16);

    // GPU 优化：鲸鱼是柔光粒子层，1.25x 物理分辨率渲染（原 1.5x 上限），
    // 像素量减少约 30%，屏幕混合的柔光粒子放大后无感知差异
    var WHALE_DPR = 1.25;

    // out 参数版矩阵工具（复用缓冲，零分配）
    function m4TranslationOut(tx, ty, tz, out) { out[0]=1;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=1;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=1;out[11]=0; out[12]=tx;out[13]=ty;out[14]=tz;out[15]=1; return out; }
    function m4ScaleOut(s, out) { out[0]=s;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=s;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=s;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationXOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=1;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=c;out[6]=s;out[7]=0; out[8]=0;out[9]=-s;out[10]=c;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationYOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=c;out[1]=0;out[2]=-s;out[3]=0; out[4]=0;out[5]=1;out[6]=0;out[7]=0; out[8]=s;out[9]=0;out[10]=c;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationZOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=c;out[1]=s;out[2]=0;out[3]=0; out[4]=-s;out[5]=c;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=1;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4MulOut(a,b,out){ for(var c=0;c<4;c++) for(var r=0;r<4;r++) out[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3]; return out; }
    function m4PerspectiveOut(fovY, aspect, near, far, out){ var f=1/Math.tan(fovY/2), nf=1/(near-far); out[0]=f/aspect;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=f;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=(far+near)*nf;out[11]=-1; out[12]=0;out[13]=0;out[14]=2*far*near*nf;out[15]=0; return out; }

    function resize() {
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      var dpr = WHALE_DPR;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (shared.dom.whaleLayer.style.display === "none") return;
      // 鼠标跟随开启时鲸鱼提到 60fps（点精灵渲染开销小），光线/扭曲跟手更顺滑
      var frameMs = 1000 / (bgSettings.mouse ? 60 : (bgSettings.fps || 30));
      if (now - last < frameMs) return;
      var dt = Math.min(0.5, (now - last) / 1000);
      last = now - (now - last) % frameMs;

      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (Math.round(w * WHALE_DPR) !== canvas.width || Math.round(h * WHALE_DPR) !== canvas.height) resize();

      var elapsed = (now - start) / 1000;
      var L = Math.max(0, Math.min(1, (elapsed - 0.3) / 2.5));
      var D = 1 - Math.pow(1 - L, 3); // 官方 easeOutCubic 组装
      var E = 0; // 固定背景无滚动分散

      // 官方 group 变换（fish：spin=false）
      var rotZ = elapsed * ((1 - D) * 0.3) + 0.04 * Math.sin(0.25 * elapsed);
      var rotX = 0.05 * Math.sin(0.08 * elapsed * 0.7);
      var rotY = 0.1 * Math.sin(0.08 * elapsed);
      var posY = 0.15 * Math.sin(0.4 * elapsed);
      var scale = 0.75 + 0.25 * D;
      var aspect = canvas.width / canvas.height;
      var halfW = HALF_H * aspect;
      // 靠右布局：将鲸鱼中心进一步向右侧偏移（占据右侧开阔区域，文字区彻底清爽）
      var posX = halfW * 0.52;
      // 使用复用缓冲的 out 版矩阵，避免每帧新建 6 个 Float32Array
      m4RotationXOut(rotX, _mTmpA);
      m4RotationYOut(rotY, _mTmpB);
      m4MulOut(_mTmpB, _mTmpA, _mTmpC);
      m4RotationZOut(rotZ, _mTmpD);
      m4MulOut(_mTmpD, _mTmpC, _mTmpE);
      m4TranslationOut(posX, posY, 0, _mTmpA);
      m4MulOut(_mTmpA, _mTmpE, _mTmpB);
      m4ScaleOut(scale, _mTmpC);
      m4MulOut(_mTmpB, _mTmpC, _modelBuf);
      var model = _modelBuf;
      m4PerspectiveOut(FOV, aspect, 0.1, 100, _projBuf);
      var proj = _projBuf;
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniformMatrix4fv(u.uProj, false, proj);
      gl.uniform1f(u.uTime, elapsed);
      gl.uniform1f(u.uAssembly, D);
      // 鼠标强度：官方以 (1-0.05^dt) 插值；设置面板关闭时恒为 0
      var target = (mouse.active && bgSettings.mouse) ? MOUSE_DEFAULTS.strength : 0;
      strength += (target - strength) * (1 - Math.pow(0.05, dt));
      gl.uniform1f(u.uMouseStrength, strength);
      // 光线：跟随鲸鱼右移基准 + 光标移动响应
      var wk = 1 - Math.exp(-dt / ((bgSettings.followMs != null ? bgSettings.followMs : 20) * 2 / 1000));
      wSX += ((bgSettings.mouse ? mouse.x : 0) - wSX) * wk;
      wSY += ((bgSettings.mouse ? mouse.y : 0) - wSY) * wk;
      gl.uniform3f(u.uLightPos, posX + 2.5 + wSX * halfW * LIGHT_DEFAULTS.followX * (bgSettings.mouse ? (bgSettings.lightFollow != null ? bgSettings.lightFollow : 1) : 0), LIGHT_DEFAULTS.y, LIGHT_DEFAULTS.z);
      // uMouse：屏幕鼠标 → 世界(z=0) → 组局部空间（官方 matrixWorld 逆变换）
      if (mouse.hasMoved) {
        var wx = mouse.x * halfW, wy = mouse.y * HALF_H;
        if (strength < 0.01) { b.x = wx; b.y = wy; }
        // 帧率无关：官方 decay 是每 30fps 帧的插值系数，按实际 dt 归一化，60fps 下手感一致
        else { b.x += (wx - b.x) * (1 - Math.pow(1 - MOUSE_DEFAULTS.decay, dt * 30)); b.y += (wy - b.y) * (1 - Math.pow(1 - MOUSE_DEFAULTS.decay, dt * 30)); }
      }
      var inv = m4Inverse(model, _invBuf); // 复用缓冲，帧循环零分配
      var ux = inv[0]*b.x + inv[4]*b.y + inv[12];
      var uy = inv[1]*b.x + inv[5]*b.y + inv[13];
      gl.uniform2f(u.uMouse, ux, uy);
      // 颜色：晶透亮白粒子（带极微量冰蓝高光）
      gl.uniform3f(u.uColor, 0.95 * D, 0.97 * D, 1.0 * D);
      // 点尺寸：官方 BoxGeometry 0.065 单位 × 实例缩放 × 组缩放（提升粒子点阵清晰度）
      gl.uniform1f(u.uPointScale, 0.065 * scale * (canvas.height / (2 * HALF_H)));

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, data.count);
    }

    if (media.reducedMotion) {
      start = performance.now() - 30000; // 组装动画已完成的状态下绘制单帧
      last = 0;
      frame(performance.now());
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      raf = requestAnimationFrame(frame);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        if (!raf && !media.reducedMotion) raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
  }

  shared.refs.startWhale = startWhale;
  shared.refs.updateWhaleDisplay = updateWhaleDisplay;
}

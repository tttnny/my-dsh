/* ------------------------------------------------------------------ *
 * src/constellation.js — 星座网格引擎（initConstellation，2D canvas）
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initConstellation(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /* ------------------------------------------------------------------ *
   * 星座网格引擎（2D canvas）
   * ------------------------------------------------------------------ */
  function startConstellation() {
    var canvas = shared.dom.constellationCanvas;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    diag.constellation = true;

    // GPU 优化：细线星座网格的 2D canvas 上限 1.5x（原 2x），
    // 填充像素量约减 44%；0.5px 线条在 1.5x 下仍为 0.75 物理像素，观感不变
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var dots = [], cols = 0, rows = 0;
    var mouse = { x: NaN, y: NaN };
    var raf = 0;
    var idle = false;
    var last = 0;
    var resizeTimer = null;

    function buildGrid() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      cols = Math.ceil(w / 90) + 1;
      rows = Math.ceil(h / 90) + 1;
      var ox = (w - (cols - 1) * 90) / 2;
      var oy = (h - (rows - 1) * 90) / 2;
      dots = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var rx = ox + 90 * x, ry = oy + 90 * y;
          dots.push({ restX: rx, restY: ry, x: rx, y: ry, vx: 0, vy: 0 });
        }
      }
    }
    function resize() {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    }
    resize();

    function onMove(e) {
      if (!bgSettings.mouse) return; // 设置面板「鼠标跟随交互」关闭时忽略（网格保持静止）
      // 画布为 position:fixed inset:0 铺满视口，直接用视口尺寸换算，
      // 避免 mousemove 高频事件里 getBoundingClientRect() 的强制布局
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      wake();
    }
    if (!media.reducedMotion) window.addEventListener("mousemove", onMove, { passive: true });

    function draw(mx, my, active) {
      var opts = shared.refs.currentConstellation();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // GPU/CPU 优化：线段互不重叠，逐段 beginPath/stroke 与「单路径收集 + 一次 stroke」
      // 的栅格化结果完全一致，但绘制调用从 O(n) 次降为 1 次（全屏网格每帧省下数百次 stroke）
      ctx.strokeStyle = opts.lineColor + " " + opts.lineOpacity + ")";
      ctx.lineWidth = 0.5;
      var i, j, a, b, dx, dy, dist, ux, uy;
      ctx.beginPath();
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols - 1; i++) {
          a = dots[j * cols + i]; b = dots[j * cols + i + 1];
          dx = b.x - a.x; dy = b.y - a.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) continue;
          ux = dx / dist; uy = dy / dist;
          ctx.moveTo(a.x + 10 * ux, a.y + 10 * uy);
          ctx.lineTo(b.x - 10 * ux, b.y - 10 * uy);
        }
      }
      for (i = 0; i < cols; i++) {
        for (j = 0; j < rows - 1; j++) {
          a = dots[j * cols + i]; b = dots[(j + 1) * cols + i];
          dx = b.x - a.x; dy = b.y - a.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) continue;
          ux = dx / dist; uy = dy / dist;
          ctx.moveTo(a.x + 10 * ux, a.y + 10 * uy);
          ctx.lineTo(b.x - 10 * ux, b.y - 10 * uy);
        }
      }
      ctx.stroke();

      // 点批量合并：远离光标的点尺寸与透明度完全相同（n=1.8 / dotOpacity），
      // 合并进单一 path 一次填充；仅光标邻近点保留逐个绘制（亮度/尺寸渐变不变）
      ctx.fillStyle = opts.dotColor + " " + opts.dotOpacity + ")";
      var hasMouse = !isNaN(mx) && !isNaN(my);
      var nearIdx = [];
      ctx.globalAlpha = opts.dotOpacity;
      ctx.beginPath();
      for (i = 0; i < dots.length; i++) {
        var p = dots[i];
        if (hasMouse) {
          dx = p.x - mx; dy = p.y - my;
          dist = Math.sqrt(dx * dx + dy * dy);
          var l = Math.max(0, 1 - dist / 140);
          if (l > 0) { nearIdx.push(i); continue; }
        }
        if (opts.round) {
          ctx.moveTo(p.x + 1.8, p.y);
          ctx.arc(p.x, p.y, 1.8, 0, 2 * Math.PI);
        } else {
          ctx.rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
        }
      }
      ctx.fill();
      for (j = 0; j < nearIdx.length; j++) {
        p = dots[nearIdx[j]];
        dx = p.x - mx; dy = p.y - my;
        dist = Math.sqrt(dx * dx + dy * dy);
        var ln = Math.max(0, 1 - dist / 140);
        var n = 1.8 + 2 * ln;
        ctx.globalAlpha = opts.dotOpacity + 0.4 * ln;
        if (opts.round) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, n, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - n, p.y - n, 2 * n, 2 * n);
        }
      }
      ctx.globalAlpha = 1;
    }

    function wake() {
      if (idle) {
        idle = false;
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }
    shared.refs.wakeConstellation = wake; // 设置面板重新开启星座时唤醒（idle 停止后 rAF 已停）

    var constBlanked = false;
    function loop(now) {
      if (!bgSettings.constellation) {
        // 关闭：清空画布一次后空转（与浅色主题同一模式，代价可忽略）
        if (!bgSettings.constellation && !constBlanked) {
          ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          constBlanked = true;
        }
        raf = requestAnimationFrame(loop);
        return;
      }
      constBlanked = false;
      // 鼠标跟随开启时活跃期 60fps（2D 画布开销小），斥力响应更顺滑；静止仍按设置帧率
      var frameMs = 1000 / (bgSettings.mouse ? 60 : (bgSettings.fps || 30));
      if (now - last < frameMs) { raf = requestAnimationFrame(loop); return; }
      last = now - (now - last) % frameMs;

      // 布局未就绪时补一次尺寸同步
      if (Math.round(canvas.clientWidth * dpr) !== canvas.width ||
          Math.round(canvas.clientHeight * dpr) !== canvas.height) {
        resize();
      }

      var mx = bgSettings.mouse ? mouse.x : NaN, my = bgSettings.mouse ? mouse.y : NaN;
      var maxSpeed = 0;
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        if (!isNaN(mx) && !isNaN(my)) {
          var dx = p.x - mx, dy = p.y - my;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140 && d > 0.1) {
            var e = (1 - d / 140) * 30;
            var ux = dx / d, uy = dy / d;
            p.vx += ux * e * 0.1;
            p.vy += uy * e * 0.1;
          }
        }
        p.vx += 0.05 * (p.restX - p.x);
        p.vy += 0.05 * (p.restY - p.y);
        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;
        var sp = Math.abs(p.vx) + Math.abs(p.vy);
        if (sp > maxSpeed) maxSpeed = sp;
      }
      draw(mx, my, true);
      if (maxSpeed < 0.01) {
        idle = true;
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    if (media.reducedMotion) {
      draw(NaN, NaN, false); // 静态单帧
    } else {
      idle = false;
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        wake();
      }, 150);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 主题联动
   * ------------------------------------------------------------------ */

  shared.refs.startConstellation = startConstellation;
}

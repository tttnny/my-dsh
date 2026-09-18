/* ===================================================================== *
 * src/orbs-math.js — 工厂级片段（无副作用：纯函数）
 *   Thinking Orbs 几何数学（orbs.jakubantalik.com 移植）：Jl..up、
 *   drawOrb 系列与 getOrbPreset，被 src/orbs.js（initOrbs）直接调用。
 * ===================================================================== */
  /* ------------------------------------------------------------------ *
   * Thinking Orbs (orbs.jakubantalik.com) — agent activity indicator
   * Copyright (c) Jakub Antalik, MIT
   * Dotted thought-orb loading indicators for AI & agent UIs
   * 9 hand-tuned mathematical state models:
   *   working (orbits), searching (globe), solving (rubik), listening (wave),
   *   connecting (web), weaving (braid), composing (ribbon), breathing (ring),
   *   shaping (morph).
   * ------------------------------------------------------------------ */
  /* 模块级排序闭包：避免 Ct 每帧新建比较函数（本文件唯一允许的微优化） */
  var ORB_Z_SORT = function(a, b) { return a.z - b.z; };

  function Jl(e, t, n) { return e + (t - e) * n; }
  function pc(e) { return e - Math.floor(e); }
  function ze(e, t) {
    var n = Math.sin(e * 12.9898 + t * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function ql(e, t) {
    var n = Math.floor(e), r = Math.floor(t);
    var l = e - n, o = t - r;
    l = l * l * (3 - 2 * l);
    o = o * o * (3 - 2 * o);
    var u = ze(n, r), i = ze(n + 1, r), s = ze(n, r + 1), f = ze(n + 1, r + 1);
    return u + (i - u) * l + (s - u) * o + (u - i - s + f) * l * o;
  }
  function Wu(e, t) {
    var n = Math.PI * (3 - Math.sqrt(5));
    var r = 1 - 2 * (e + 0.5) / t;
    var l = Math.sqrt(Math.max(0, 1 - r * r));
    var o = e * n;
    return [l * Math.cos(o), r, l * Math.sin(o)];
  }
  function Qd(e, t) {
    return Math.atan2(Math.sin(e - t), Math.cos(e - t));
  }
  function $t(e, t, n, r, l) {
    var o = Math.sin(t), u = Math.cos(t);
    var i = Math.sin(e), s = Math.cos(e);
    return function(f, v, h) {
      var p = f * s + h * i;
      var y = -f * i + h * s;
      var g = v * u - y * o;
      var w = v * o + y * u;
      return [n + p * l, r - g * l, w];
    };
  }
  function Ct(e, t, n) {
    if (n === undefined) n = 0.3;
    var r = [];
    for (var i = 0; i < e.length; i++) {
      var l = e[i];
      if ((l.a !== undefined ? l.a : 1) >= 0.02) {
        l.r = Math.max(n, l.r);
        r.push(l);
      }
    }
    r.sort(ORB_Z_SORT);
    var lines = [];
    for (var j = 0; j < t.length; j++) {
      if ((t[j].a !== undefined ? t[j].a : 1) >= 0.02) lines.push(t[j]);
    }
    return { dots: r, lines: lines };
  }
  function Vt(e, t) {
    return Math.pow(e / 300, t);
  }
  function Kd(ctx, dots, isDark) {
    for (var i = 0; i < dots.length; i++) {
      var l = dots[i];
      var o = l.a !== undefined ? l.a : 1;
      var u = Math.min(1, Math.max(0, l.white !== undefined ? l.white : 0.5));
      var val = Math.round((isDark ? 1 - u : u) * 255);
      ctx.fillStyle = "rgba(" + val + "," + val + "," + val + "," + o.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function Yd(ctx, lines, isDark) {
    for (var i = 0; i < lines.length; i++) {
      var r = lines[i];
      var l = r.a !== undefined ? r.a : 1;
      var o = Math.min(1, Math.max(0, r.white !== undefined ? r.white : 0.5));
      var u = Math.round((isDark ? 1 - o : o) * 255);
      ctx.strokeStyle = "rgba(" + u + "," + u + "," + u + "," + l.toFixed(3) + ")";
      ctx.lineWidth = r.w || 1;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
    }
  }
  function Xd(ctx, data, isDark) {
    if (data.lines && data.lines.length > 0) Yd(ctx, data.lines, isDark);
    if (data.dots && data.dots.length > 0) Kd(ctx, data.dots, isDark);
  }

  var Gd = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.76;
    var u = $t(t * 0.4, 0.3, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.ghostN !== undefined ? n.ghostN : 150;
    for (var p = 0; p < f; p++) {
      var y = Wu(p, f);
      var pt = u(y[0] * o, y[1] * o, y[2] * o);
      var c = (pt[2] / o + 1) / 2;
      s.push({ x: pt[0], y: pt[1], z: pt[2], r: 0.8 * i, white: 0.78, a: 0.1 + 0.22 * c });
    }
    var v = n.strandN !== undefined ? n.strandN : 52, h = n.turns !== undefined ? n.turns : 3;
    for (var p2 = 0; p2 < 3; p2++) {
      var y2 = p2 / 3 * 2 * Math.PI;
      for (var g = 0; g < v; g++) {
        var w = (pc(g / v + t * 0.045) * 2 - 1) * 0.96;
        var C = Math.sqrt(Math.max(0, 1 - w * w));
        var c2 = Math.min(1, (1 - Math.abs(w)) / 0.1);
        var a = w * Math.PI * h + y2;
        var d = 1 + 0.075 * Math.sin(w * Math.PI * h * 2 + y2 * 2 + t * 0.8);
        var m = C * o * d;
        var pt2 = u(Math.cos(a) * m, w * o * d, Math.sin(a) * m);
        var E = (pt2[2] / o + 1) / 2;
        s.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.rBase !== undefined ? n.rBase : 1.2) + (n.rDepth !== undefined ? n.rDepth : 1.8) * E) * i,
          white: 0.55 - 0.45 * E,
          a: c2 * (0.45 + 0.55 * E)
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  function Zd(e, t, n, r) {
    var l = 2 * t * n + r;
    var o = e % l;
    var u = new Array(t).fill(0);
    var i = -1;
    if (o < 2 * t * n) {
      var s = Math.floor(o / n);
      var f = (o - s * n) / n;
      var h = 1 - Math.pow(1 - Math.min(1, f / 0.7), 3);
      if (s < t) {
        for (var p = 0; p < s; p++) u[p] = 1;
        u[s] = h;
        i = s;
      } else {
        var p2 = 2 * t - 1 - s;
        for (var y = 0; y < p2; y++) u[y] = 1;
        u[p2] = 1 - h;
        i = p2;
      }
    }
    return { amount: u, active: i };
  }

  function Jd(e, t, n) {
    var r = e[0], l = e[1], o = e[2];
    var u = false;
    for (var i = 0; i < t.length; i++) {
      if (n.amount[i] <= 0) continue;
      var s = t[i];
      var f = s.axis === 0 ? r : s.axis === 1 ? l : o;
      if (f < s.lo || f >= s.hi) continue;
      if (i === n.active) u = true;
      var v = s.ang * n.amount[i];
      var h = Math.cos(v), p = Math.sin(v);
      if (s.axis === 0) {
        var y = l * h - o * p;
        o = l * p + o * h;
        l = y;
      } else if (s.axis === 1) {
        var y2 = r * h + o * p;
        o = -r * p + o * h;
        r = y2;
      } else {
        var y3 = r * h - l * p;
        l = r * p + l * h;
        r = y3;
      }
    }
    return [r, l, o, u];
  }

  function qd(e) {
    var t = [];
    for (var n = 0; n < e; n++) {
      var r = Math.min(2, Math.floor(ze(n, 2.3) * 3));
      var l = -1 + 0.5 * Math.min(3, Math.floor(ze(n, 5.9) * 4));
      var o = ze(n, 7.7) < 0.5 ? 1 : -1;
      t.push({ axis: r, lo: l, hi: l + 0.5, ang: o * Math.PI / 2 });
    }
    return t;
  }

  var bd = function(e, t, n) {
    var l = e / 2, o = e / 2, u = e / 2 * 0.82;
    var i = 0.4 + 0.06 * Math.sin(t * 0.35);
    var s = $t(t * 0.5, i, l, o, u);
    var f = t * (0.5 + (1.7 - 0.5) * (n.scanMul !== undefined ? n.scanMul : 1));
    var v = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var h = n.dimBase !== undefined ? n.dimBase : 1;
    var p = [];
    var y = n.latRings !== undefined ? n.latRings : 17, g = n.lonDensity !== undefined ? n.lonDensity : 44;
    for (var w = 0; w <= y; w++) {
      var C = -Math.PI / 2 + w / y * Math.PI;
      var c = Math.cos(C), a = Math.sin(C);
      var d = Math.max(1, Math.round(Math.abs(c) * g));
      for (var m = 0; m < d; m++) {
        var k = m / d * 2 * Math.PI;
        var pt = s(c * Math.cos(k), a, c * Math.sin(k));
        var L = (pt[2] + 1) / 2;
        var N = Qd(k + t * 0.5, f);
        var D = Math.exp(-(N * N) / 0.18) * Math.max(0, pt[2]);
        p.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * L + (n.rBoost !== undefined ? n.rBoost : 1) * D) * v,
          white: (n.inkFar !== undefined ? n.inkFar : 0.62) - (n.inkSpan !== undefined ? n.inkSpan : 0.54) * L,
          a: h + (1 - h) * Math.min(1, D)
        });
      }
    }
    return Ct(p, [], n.rMin);
  };

  var ep = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.82;
    var u = $t(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), r, l, o);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = n.moveCount !== undefined ? n.moveCount : 14;
    var f = qd(s);
    var v = Zd(t, s, 0.42, 1.2);
    var h = [];
    var p = n.latRings !== undefined ? n.latRings : 15, y = n.lonDensity !== undefined ? n.lonDensity : 40;
    for (var g = 0; g <= p; g++) {
      var w = -Math.PI / 2 + g / p * Math.PI;
      var C = Math.cos(w), c = Math.sin(w);
      var a = Math.max(1, Math.round(Math.abs(C) * y));
      for (var d = 0; d < a; d++) {
        var m = d / a * 2 * Math.PI;
        var rot = Jd([C * Math.cos(m), c, C * Math.sin(m)], f, v);
        var pt = u(rot[0], rot[1], rot[2]);
        var I = (pt[2] + 1) / 2;
        h.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * I + (rot[3] ? (n.rActive !== undefined ? n.rActive : 0.3) : 0)) * i,
          white: (n.inkFar !== undefined ? n.inkFar : 0.62) - (n.inkSpan !== undefined ? n.inkSpan : 0.54) * I - (rot[3] ? 0.14 : 0)
        });
      }
    }
    return Ct(h, [], n.rMin);
  };

  var tp = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.874;
    var u = $t(t * 0.18, 0.38, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.rings !== undefined ? n.rings : 15, v = n.lonDensity !== undefined ? n.lonDensity : 40;
    for (var h = 0; h <= f; h++) {
      var p = -Math.PI / 2 + h / f * Math.PI;
      var y = Math.cos(p), g = Math.sin(p);
      var w = 0.62 * Math.sin(t * 2.1 - h * 0.52) + 0.38 * Math.sin(t * 1.27 + h * 0.83);
      var C = o * (0.88 + 0.105 * w);
      var c = Math.max(1, Math.round(Math.abs(y) * v));
      for (var a = 0; a < c; a++) {
        var d = a / c * 2 * Math.PI;
        var pt = u(y * Math.cos(d) * C, g * C, y * Math.sin(d) * C);
        var x = (pt[2] / o + 1) / 2;
        var E = Math.max(0, w);
        s.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * x) * (1 + 0.4 * E) * i,
          white: 0.66 - 0.56 * x - 0.1 * E
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  function np(e) { return e * e * (3 - 2 * e); }
  function hc(e) {
    var t = e.length, n = [];
    var r = 0;
    for (var l = 0; l < t; l++) {
      var o = e[l], u = e[(l + 1) % t], i = Math.hypot(u[0] - o[0], u[1] - o[1]);
      n.push(i);
      r += i;
    }
    return function(l2) {
      var o2 = l2 * r, u2 = 0;
      for (; o2 > n[u2] && u2 < t - 1;) {
        o2 -= n[u2];
        u2++;
      }
      var i2 = e[u2], s = e[(u2 + 1) % t], f = n[u2] ? Math.min(1, o2 / n[u2]) : 0;
      return [i2[0] + (s[0] - i2[0]) * f, i2[1] + (s[1] - i2[1]) * f];
    };
  }
  var rp = function(e) {
    var t = -Math.PI / 2 + e * 2 * Math.PI;
    return [Math.cos(t) * 0.24, Math.sin(t) * 0.24];
  };
  var lp = hc([[0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
  var op = hc([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
  var bl = [rp, lp, op];
  function up(e) { return Math.max(6, Math.round(34 * e)); }
  var Xo = 1.4, mc = 0.9, eo = Xo + mc;
  var ip = function(e, t, n) {
    var r = bl.length, l = t % (eo * r), o = Math.floor(l / eo), u = l - o * eo;
    var i = u > Xo ? np((u - Xo) / mc) : 0;
    var s = n.spread !== undefined ? n.spread : 1;
    var f = bl[o], v = bl[(o + 1) % r];
    var h = 160, p = [];
    for (var S = 0; S < h; S++) {
      var x = S / h, E = f(x), L = v(x);
      p.push([(E[0] + (L[0] - E[0]) * i) * s, (E[1] + (L[1] - E[1]) * i) * s]);
    }
    var y = [];
    var g = 0;
    for (var S2 = 0; S2 < h; S2++) {
      var x2 = p[S2], E2 = p[(S2 + 1) % h], L2 = Math.hypot(E2[0] - x2[0], E2[1] - x2[1]);
      y.push(L2);
      g += L2;
    }
    var w = up(n.iconD !== undefined ? n.iconD : 1);
    var C = (n.rDot !== undefined ? n.rDot : 0.021) * 1.35 * s;
    var c = 1 + 0.02 * Math.sin(u * 3.1);
    var a = [], d = e / 2;
    var m = 0, k = 0;
    for (var S3 = 0; S3 < w; S3++) {
      var x3 = S3 / w * g;
      for (; k + y[m] < x3 && m < h - 1;) {
        k += y[m];
        m++;
      }
      var E3 = p[m], L3 = p[(m + 1) % h], N = y[m] ? Math.min(1, (x3 - k) / y[m]) : 0;
      var D = (E3[0] + (L3[0] - E3[0]) * N) * c, I = (E3[1] + (L3[1] - E3[1]) * N) * c;
      a.push({ x: d + D * e, y: d + I * e, z: 0, r: Math.max(0.35, C * e), white: 0.1 });
    }
    return Ct(a, [], n.rMin);
  };

  var sp = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.82;
    var u = $t(t * 0.12, 0.3, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.orbitN !== undefined ? n.orbitN : 12, v = n.ghostN !== undefined ? n.ghostN : 40, h = n.particles !== undefined ? n.particles : 3;
    for (var p = 0; p < f; p++) {
      var y = ze(p, 1.7), g = ze(p, 5.2), w = ze(p, 8.9);
      var C = o * (0.45 + 0.52 * y);
      var c = y * 2 * Math.PI;
      var a = Math.acos(2 * g - 1);
      var d = Math.sin(a) * Math.cos(c), m = Math.cos(a), k = Math.sin(a) * Math.sin(c);
      var S = -m, x = d;
      var E = 0, L = Math.max(1e-6, Math.sqrt(S * S + x * x));
      S /= L; x /= L;
      var N = m * E - k * x, D = k * S - d * E, I = d * x - m * S;
      var pe = (0.25 + 0.55 * w) * (w > 0.5 ? 1 : -1);
      for (var se = 0; se < v; se++) {
        var Y = se / v * 2 * Math.PI;
        var pt = u((S * Math.cos(Y) + N * Math.sin(Y)) * C, (x * Math.cos(Y) + D * Math.sin(Y)) * C, (E * Math.cos(Y) + I * Math.sin(Y)) * C);
        var z = (pt[2] / C + 1) / 2;
        s.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: (n.ghostR !== undefined ? n.ghostR : 0.9) * i,
          white: 0.72,
          a: (n.ghostA !== undefined ? n.ghostA : 0.5) * (0.4 + 0.6 * z)
        });
      }
      for (var se2 = 0; se2 < h; se2++) {
        var Y2 = t * pe + se2 / h * 2 * Math.PI + g * 6;
        var pt2 = u((S * Math.cos(Y2) + N * Math.sin(Y2)) * C, (x * Math.cos(Y2) + D * Math.sin(Y2)) * C, (E * Math.cos(Y2) + I * Math.sin(Y2)) * C);
        var z2 = (pt2[2] / C + 1) / 2;
        s.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.partR !== undefined ? n.partR : 1.2) + (n.partRDepth !== undefined ? n.partRDepth : 1.6) * z2) * i,
          white: 0.3 - 0.22 * z2
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  var bi = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.78;
    var u = n.spin !== undefined ? n.spin : 1;
    var i = 0.3;
    var s = $t(t * 0.1 * u, i, r, l, 1);
    var f = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var v = [];
    var h = n.ghostN !== undefined ? n.ghostN : 150;
    for (var I = 0; I < h; I++) {
      var pe = Wu(I, h);
      var pt = s(pe[0] * o, pe[1] * o, pe[2] * o);
      var Ce = (pt[2] / o + 1) / 2;
      v.push({ x: pt[0], y: pt[1], z: pt[2], r: 0.8 * f, white: 0.78, a: 0.1 + 0.22 * Ce });
    }
    var p = t * 0.24 * u;
    var y = n.faceOn ? -i : 0.55 + 0.3 * Math.sin(t * 0.18) * u;
    var g = Math.cos(p), w = 0, C = Math.sin(p);
    var c = -C * Math.sin(y), a = Math.cos(y), d = g * Math.sin(y);
    var m = w * d - C * a, k = C * c - g * d, S = g * a - w * c;
    var x = 0.23 * (n.wobMul !== undefined ? n.wobMul : 1);
    var E = n.faceOn ? o / (1 + 0.85 * x) : o;
    var L = n.lanes !== undefined ? n.lanes : 5, N = n.segs !== undefined ? n.segs : 88;
    var D = Math.max(1, Math.round(L * (n.bandMul !== undefined ? n.bandMul : 1)));
    for (var I2 = 0; I2 < D; I2++) {
      var pe2 = (I2 - (D - 1) / 2) * 0.075;
      var se = Math.abs(I2 - (D - 1) / 2) / Math.max(1, (D - 1) / 2);
      for (var Y = 0; Y < N; Y++) {
        var Z = Y / N * 2 * Math.PI;
        var Ce2 = (0.16 * Math.sin(Z * 3 - t * 1.7 + I2 * 0.22) + 0.07 * Math.sin(Z * 5 + t * 1.1)) * (n.wobMul !== undefined ? n.wobMul : 1);
        var _ = n.faceOn ? 1 + Ce2 : 1;
        var z = n.faceOn ? pe2 : pe2 + Ce2;
        var T = g * Math.cos(Z) + c * Math.sin(Z) + m * z;
        var U = w * Math.cos(Z) + a * Math.sin(Z) + k * z;
        var Q = C * Math.cos(Z) + d * Math.sin(Z) + S * z;
        var rt = Math.sqrt(T * T + U * U + Q * Q);
        var De = E * _;
        var pt2 = s(T / rt * De, U / rt * De, Q / rt * De);
        var Ml = (pt2[2] / o + 1) / 2;
        v.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.rBase !== undefined ? n.rBase : 1.1) + (n.rDepth !== undefined ? n.rDepth : 1.7) * Ml) * (1 - 0.25 * se) * f,
          white: 0.52 - 0.44 * Ml + 0.18 * se,
          a: 0.4 + 0.6 * Ml
        });
      }
    }
    return Ct(v, [], n.rMin);
  };

  var ap = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.8 * (n.spread !== undefined ? n.spread : 1);
    var u = $t(t * 0.12, 0.32, r, l, o);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = n.nodeN !== undefined ? n.nodeN : 30, f = n.thr !== undefined ? n.thr : 0.72;
    var v = n.nodeR !== undefined ? n.nodeR : 1.4, h = n.nodeRDepth !== undefined ? n.nodeRDepth : 1.8;
    var p = [];
    for (var C = 0; C < s; C++) {
      var c = Wu(C, s);
      var a = c[0] + 0.3 * (ql(C * 0.31 + 9, t * 0.24) - 0.5) * 2;
      var d = c[1] + 0.3 * (ql(C * 0.53 + 27, t * 0.21) - 0.5) * 2;
      var m = c[2] + 0.3 * (ql(C * 0.77 + 55, t * 0.27) - 0.5) * 2;
      var k = Math.sqrt(a * a + d * d + m * m);
      p.push([a / k, d / k, m / k]);
    }
    var y = [], g = [];
    for (var C2 = 0; C2 < s; C2++) {
      for (var c2 = C2 + 1; c2 < s; c2++) {
        var a2 = p[C2][0] - p[c2][0];
        var d2 = p[C2][1] - p[c2][1];
        var m2 = p[C2][2] - p[c2][2];
        var k2 = Math.sqrt(a2 * a2 + d2 * d2 + m2 * m2);
        if (k2 >= f) continue;
        var ptA = u(p[C2][0], p[C2][1], p[C2][2]);
        var ptB = u(p[c2][0], p[c2][1], p[c2][2]);
        var I = ((ptA[2] + ptB[2]) / 2 + 1) / 2;
        y.push({
          x1: ptA[0],
          y1: ptA[1],
          x2: ptB[0],
          y2: ptB[1],
          white: 0.42,
          a: (1 - k2 / f) * (0.3 + 0.55 * I),
          w: Math.max(0.6, (n.lineW !== undefined ? n.lineW : 0.8) * i)
        });
      }
    }
    for (var C3 = 0; C3 < s; C3++) {
      var pt3 = u(p[C3][0], p[C3][1], p[C3][2]);
      var m3 = (pt3[2] + 1) / 2;
      var k3 = 1 + 0.25 * Math.sin(t * 1.4 + C3 * 2.7);
      g.push({
        x: pt3[0],
        y: pt3[1],
        z: pt3[2],
        r: (v + h * m3) * k3 * i,
        white: 0.55 - 0.45 * m3
      });
    }
    var w = n.signals !== undefined ? n.signals : 5;
    for (var C4 = 0; C4 < w; C4++) {
      var c4 = Math.floor(t * 0.55 + C4 * 7.31);
      var a4 = Math.floor(ze(c4, C4 * 3.1 + 1.7) * s);
      var d4 = Math.floor(ze(c4, C4 * 5.7 + 4.2) * s);
      if (a4 === d4) continue;
      var m4 = pc(t * 0.55 + C4 * 7.31);
      var k4 = Jl(p[a4][0], p[d4][0], m4);
      var S4 = Jl(p[a4][1], p[d4][1], m4);
      var x4 = Jl(p[a4][2], p[d4][2], m4);
      var E4 = Math.max(1e-6, Math.sqrt(k4 * k4 + S4 * S4 + x4 * x4));
      var pt4 = u(k4 / E4, S4 / E4, x4 / E4);
      var I4 = (pt4[2] + 1) / 2;
      g.push({
        x: pt4[0],
        y: pt4[1],
        z: pt4[2],
        r: (v * 1.5 + h * I4) * i,
        white: 0.05,
        a: 0.5 + 0.5 * I4
      });
    }
    return Ct(g, y, n.rMin);
  };

  var cp = {
    orbits: sp,
    globe: bd,
    rubik: ep,
    wave: tp,
    web: ap,
    braid: Gd,
    ribbon: bi,
    ring: bi,
    morph: ip
  };

  var dp = [["latRings", "lonDensity"], ["rings", "lonDensity"], ["lanes", "segs"]];
  var pp = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
  var hp = ["iconD"];
  var mp = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];

  function vp(e, t) {
    var n = Object.assign({}, e), r = new Set(), l = Math.sqrt(t);
    for (var i = 0; i < dp.length; i++) {
      var pair = dp[i];
      var o = pair[0], u = pair[1];
      if (n[o] != null && n[u] != null && !r.has(o) && !r.has(u)) {
        n[o] = Math.max(2, Math.round(n[o] * l));
        n[u] = Math.max(2, Math.round(n[u] * l));
        r.add(o); r.add(u);
      }
    }
    for (var j = 0; j < pp.length; j++) {
      var o2 = pp[j];
      if (n[o2] != null && n[o2] !== 0 && !r.has(o2)) {
        n[o2] = Math.max(1, Math.round(n[o2] * t));
      }
    }
    for (var k = 0; k < hp.length; k++) {
      var o3 = hp[k];
      if (n[o3] != null) {
        n[o3] = Math.max(0.02, n[o3] * t);
      }
    }
    return n;
  }

  function yp(e, t) {
    var n = Object.assign({}, e);
    for (var i = 0; i < mp.length; i++) {
      var r = mp[i];
      if (n[r] != null) {
        n[r] = n[r] * t;
      }
    }
    n.rSizeMul = (n.rSizeMul != null ? n.rSizeMul : 1) * t;
    return n;
  }

  var gp = {
    globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
    rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
    braid: { strandN: 52, turns: 3, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
    ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    morph: { rDot: 0.021, iconD: 1, rMin: 0.25 }
  };

  var wp = {
    working: "orbits",
    searching: "globe",
    solving: "rubik",
    listening: "wave",
    connecting: "web",
    weaving: "braid",
    composing: "ribbon",
    breathing: "ring",
    shaping: "morph"
  };

  var kp = {
    orbits: { 64: { speed: 1.885, count: 1, size: 1 }, 20: { speed: 3.9, count: 0.238, size: 2.4 } },
    globe: { 64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } }, 20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } } },
    rubik: { 64: { speed: 1.82, count: 0.35, size: 1.05 }, 20: { speed: 1.95, count: 0.088, size: 1.9 } },
    wave: { 64: { speed: 4.388, count: 0.341, size: 1 }, 20: { speed: 3.998, count: 0.105, size: 1.6 } },
    web: { 64: { speed: 3.315, count: 1.35, size: 0.95 }, 20: { speed: 6.63, count: 0.25, size: 1.52 } },
    braid: { 64: { speed: 1.625, count: 0.5, size: 1 }, 20: { speed: 2.75, count: 0.1125, size: 1.36 } },
    ribbon: { 64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } }, 20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } } },
    ring: { 64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } }, 20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } } },
    morph: { 64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } }, 20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } } }
  };

  var orbPresetsCache = new Map();
  function getOrbPreset(stateKey, size) {
    var key = stateKey + "-" + size;
    var cached = orbPresetsCache.get(key);
    if (cached) return cached;
    var mode = wp[stateKey] || "orbits";
    var preset = (kp[mode] && kp[mode][size]) ? kp[mode][size] : kp.orbits[20];
    var opts = Object.assign({}, gp[mode]);
    if (preset.count !== 1) opts = vp(opts, preset.count);
    if (preset.size !== 1) opts = yp(opts, preset.size);
    if (preset.extra) opts = Object.assign(opts, preset.extra);
    var res = { mode: mode, speed: preset.speed, opts: opts };
    orbPresetsCache.set(key, res);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 工具调用状态映射 (Tool Call → Thinking Orb Style & Status Text)
   * 9 种几何动效: searching / listening / composing / solving /
   *               connecting / shaping / weaving / breathing / working
   * ------------------------------------------------------------------ */



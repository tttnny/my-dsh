// gen-fixture-capsule-fold.js — 由真源 styles.js 提取整段 STYLE_TEXT，生成胶囊窄宽折叠复现页 tests/fixtures/capsule-fold.html
// 目标：窄对话区下 一级折文字 → 二级整段折（沉淀 → 交接静态半 → 诊断 → BUG）→ 极窄压缩间距 后无裁剪。
const fs = require('fs');
const vm = require('vm');
const Q = String.fromCharCode(39);
const NL = String.fromCharCode(10);

const styleSrc = fs.readFileSync('src/client/kernel/styles.js', 'utf8');
const i0 = styleSrc.indexOf('export const STYLE_TEXT = [');
const j0 = styleSrc.indexOf("].join('')", i0);
if (i0 < 0 || j0 < 0) throw new Error('STYLE_TEXT 未找到');
const STYLE_TEXT = vm.runInNewContext(styleSrc.slice(i0, j0 + "].join('')".length).replace('export ', '') + '; STYLE_TEXT;', {});

const IC = '<span style="width:12px;height:12px;display:inline-block;flex:none;background:currentColor;border-radius:3px"></span>';
const ICR = '<span style="width:11px;height:11px;display:inline-block;flex:none;background:currentColor;border-radius:3px"></span>';
const num = (v, minW) => '<span class="dsws-num"' + (minW ? ' style="min-width:' + minW + '"' : '') + '>' + v + '</span>';
const seg = (color, inner, fold2, core) => '<span class="dsws-seg"' + (fold2 ? ' data-fold2-priority="' + fold2 + '"' : '') + (core ? ' data-core="' + core + '"' : '') + ' style="display:inline-flex;align-items:center;gap:4px;color:' + color + '">' + inner + '</span>';

const capsule = [
  '<div class="dsws-capsule" style="position:relative;width:100%;box-sizing:border-box">',
  '<span class="dsws-capsule-word" data-core="brand"><span style="width:14px;height:14px;display:inline-block;flex:none;background:currentColor;border-radius:3px"></span><span data-fold-priority="1">MattSkills</span></span>',
  seg('#4ade80', IC + '<span data-fold-priority="5">可接</span>' + num('0', '2ch'), null, 'takeable'),
  '<span data-fold2-priority="4" style="position:relative;display:inline-flex">' + seg('#f87171', IC + '<span data-fold-priority="6">BUG</span>' + num('0', '2ch'), null, null) + '</span>',
  seg('#f59e0b', IC + '<span data-fold-priority="7">诊断</span>' + num('0', '2ch'), 3, null),
  seg('#c084fc', IC + '<span data-fold-priority="2">沉淀</span>', 1, null),
  '<span class="dsws-split"><span class="dsws-split-part" data-fold2-priority="2" style="color:#58a6ff">' + IC + '<span data-fold-priority="3">交接</span></span><span class="dsws-split-div"></span><span class="dsws-split-part" data-core="handoff-open" style="color:#58a6ff">' + IC + '</span></span>',
  seg('#4ade80', IC + '<span data-fold-priority="8">环境</span>' + num('10/10', null), null, 'env'),
  '<span class="dsws-timebtn" data-core="refresh">' + ICR + '<span data-fold-priority="4">更新</span><span data-fold-priority="9"> 09-20 00:30</span></span>',
  '<span style="position:relative;display:inline-flex" data-core="skill"><span style="width:20px;height:12px;display:inline-block;background:currentColor;border-radius:3px"></span></span>',
  '</div>'
].join('');

const wrap = (w) => '<div class="case" data-w="' + w + '" style="width:' + w + 'px;margin:10px 0">' +
  '<div style="display:flex;flex:none;flex-direction:column;align-items:center;gap:2px;width:100%;box-sizing:border-box;padding:3px 8px 0;overflow:hidden">' + capsule + '</div></div>';
const cases = [800, 600, 480, 380, 320, 260].map(wrap).join(NL);

const script = [
  'function pass(cap, t1, t2, items, items2, useStage2){',
  '  t1.concat(t2).forEach(function(el){ el.classList.remove(' + Q + 'dsws-folded' + Q + '); });',
  '  void cap.offsetWidth;',
  '  for (var i=0;i<items.length;i++){ if (cap.scrollWidth <= cap.clientWidth+1) break; items[i].el.classList.add(' + Q + 'dsws-folded' + Q + '); void cap.offsetWidth; }',
  '  if (useStage2){',
  '    for (var j=0;j<items2.length;j++){ if (cap.scrollWidth <= cap.clientWidth+1) break; items2[j].el.classList.add(' + Q + 'dsws-folded' + Q + '); void cap.offsetWidth; }',
  '  }',
  '}',
  'function fold(cap, useStage2, useTight){',
  '  var t1 = Array.prototype.slice.call(cap.querySelectorAll(' + Q + '[data-fold-priority]' + Q + '));',
  '  var t2 = Array.prototype.slice.call(cap.querySelectorAll(' + Q + '[data-fold2-priority]' + Q + '));',
  '  var items = t1.map(function(el){ return { el: el, p: Number(el.getAttribute(' + Q + 'data-fold-priority' + Q + ')||99) }; }).sort(function(a,b){ return a.p-b.p; });',
  '  var items2 = t2.map(function(el){ return { el: el, p: Number(el.getAttribute(' + Q + 'data-fold2-priority' + Q + ')||99) }; }).sort(function(a,b){ return a.p-b.p; });',
  '  cap.classList.remove(' + Q + 'dsws-tight' + Q + ');',
  '  void cap.offsetWidth;',
  '  pass(cap, t1, t2, items, items2, useStage2);',
  '  var tight = !!useTight && cap.scrollWidth > cap.clientWidth+1;',
  '  if (tight){ cap.classList.add(' + Q + 'dsws-tight' + Q + '); void cap.offsetWidth; pass(cap, t1, t2, items, items2, useStage2); }',
  '  return {',
  '    cw: cap.clientWidth,',
  '    sw: cap.scrollWidth,',
  '    tight: tight,',
  '    folded1: t1.filter(function(el){ return el.classList.contains(' + Q + 'dsws-folded' + Q + '); }).length,',
  '    folded2: t2.filter(function(el){ return el.classList.contains(' + Q + 'dsws-folded' + Q + '); }).map(function(el){ return Number(el.getAttribute(' + Q + 'data-fold2-priority' + Q + ')); }),',
  '    coreFolded: Array.prototype.slice.call(cap.querySelectorAll(' + Q + '[data-core].dsws-folded' + Q + ')).length',
  '  };',
  '}',
  'window.capsuleCases = Array.prototype.slice.call(document.querySelectorAll(' + Q + '.case' + Q + ')).map(function(c){',
  '  var cap = c.querySelector(' + Q + '.dsws-capsule' + Q + ');',
  '  return { w: Number(c.getAttribute(' + Q + 'data-w' + Q + ')), s2: fold(cap, true, true), s2nt: fold(cap, true, false), s1: fold(cap, false, false) };',
  '});'
].join(NL);

const html = '<!doctype html><html><head><meta charset="utf-8"><style>' + STYLE_TEXT +
  ' body{margin:0;font-family:Arial,"PingFang SC",sans-serif;color:#e6edf3;background:#10131a}' +
  ' </style></head><body>' + cases + '<script>' + script + '</script></body></html>';
fs.mkdirSync('tests/fixtures', { recursive: true });
fs.writeFileSync('tests/fixtures/capsule-fold.html', html);
console.log('fixture written', html.length, 'bytes');

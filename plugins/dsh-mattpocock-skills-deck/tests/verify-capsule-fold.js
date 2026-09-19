// verify-capsule-fold.js — 真实 Chromium 验证状态栏胶囊窄极限三级收缩（一级文字 → 二级整段 → 极窄压缩）
// 依赖：playwright（含浏览器）；fixture 由 scripts/gen-fixture-capsule-fold.js 从真源 styles.js 生成
// 判据：三级收缩后 scrollWidth <= clientWidth+1（不裁剪）；最小核心（品牌/可接/环境/刷新/交接动作/技能按钮）从不折；
//       反证：仅一级折叠在窄档溢出（证明二级必要）、二级折叠但禁用压缩在最窄档溢出（证明压缩必要）。
const { chromium } = require('playwright');
const path = require('path');

const PREFIX = [1, 2, 3, 4];

;(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const url = 'file://' + path.resolve(__dirname, 'fixtures/capsule-fold.html');
  await page.goto(url);
  const data = await page.evaluate(() => window.capsuleCases);
  console.log(JSON.stringify(data, null, 2));
  let ok = true;
  const fail = (m) => { console.log('FAIL ' + m); ok = false; };
  const pass = (m) => console.log('PASS ' + m);
  for (const d of data) {
    if (d.s2.sw > d.s2.cw + 1) fail('w=' + d.w + ' 三级收缩后仍裁剪 sw=' + d.s2.sw + ' cw=' + d.s2.cw);
    else pass('w=' + d.w + ' 无裁剪 sw=' + d.s2.sw + ' cw=' + d.s2.cw + ' fold1=' + d.s2.folded1 + ' fold2=[' + d.s2.folded2.join(',') + '] tight=' + d.s2.tight);
    if (d.s2.coreFolded !== 0) fail('w=' + d.w + ' 最小核心被折 ' + d.s2.coreFolded + ' 个');
  }
  for (const d of data) {
    const s = d.s2.folded2.slice().sort((a, b) => a - b);
    if (!s.every((v, i) => v === PREFIX[i])) fail('w=' + d.w + ' 二级折叠集非前缀 [' + s.join(',') + ']');
    else pass('w=' + d.w + ' 二级折叠集为前缀 [' + s.join(',') + ']');
  }
  for (const d of data.filter(x => x.w <= 380)) {
    if (!(d.s1.sw > d.s1.cw + 1)) fail('w=' + d.w + ' 反证失败：仅一级折叠竟然不溢出 sw=' + d.s1.sw + ' cw=' + d.s1.cw);
    else pass('w=' + d.w + ' 反证成立：仅一级折叠溢出 sw=' + d.s1.sw + ' cw=' + d.s1.cw);
  }
  const minCase = data.reduce((a, b) => (a.w <= b.w ? a : b));
  if (!(minCase.s2nt.sw > minCase.s2nt.cw + 1)) fail('w=' + minCase.w + ' 反证失败：二级但不压缩竟然不溢出 sw=' + minCase.s2nt.sw + ' cw=' + minCase.s2nt.cw);
  else pass('w=' + minCase.w + ' 反证成立：二级但不压缩溢出 sw=' + minCase.s2nt.sw + ' cw=' + minCase.s2nt.cw);
  if (minCase.s2.tight !== true) fail('w=' + minCase.w + ' 最窄档未进入极窄压缩');
  else pass('w=' + minCase.w + ' 最窄档进入极窄压缩');
  if (minCase.s2.folded1 !== 9) fail('w=' + minCase.w + ' 一级未折满 folded1=' + minCase.s2.folded1);
  else pass('w=' + minCase.w + ' 一级折满 9 后进入二级');
  const wide = data.reduce((a, b) => (a.w >= b.w ? a : b));
  if (wide.s2.folded2.length !== 0 || wide.s2.tight) fail('w=' + wide.w + ' 宽档不应触发二级/压缩');
  else pass('w=' + wide.w + ' 宽档不触发二级/压缩');
  await browser.close();
  console.log(ok ? '全部通过：三级收缩消除窄极限裁剪，最小核心保留' : '存在失败项');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

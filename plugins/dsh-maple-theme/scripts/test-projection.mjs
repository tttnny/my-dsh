/**
 * 投影自检：把「一份配置」算成「页面该长什么样」这步单独钉住。
 *
 * 承重点是**边界与脏输入**，不是默认可爱的样子：手改过的设置文档可能存进越界值、
 * 字符串、缺字段，甚至把整个 section 删掉。投影这一步若不收拢，样式表就会拿到
 * `--maple-hue-light: NaN` 这种值，而页面只是「有点怪」，不报错。
 *
 * 跑法：pnpm test / node scripts/test-projection.mjs
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  ROOT_ATTRIBUTE, HEADING_ATTRIBUTE, INDICATOR_ATTRIBUTE, CODE_ATTRIBUTE, SHELL_ATTRIBUTE, ROOT_VARIABLES,
  DEFAULT_SETTINGS, clampNumber, normalizeSettings, projectSettings, applyProjection, clearProjection,
} from '../src/client/settings.ts';

let passed = 0;
let total = 0;
function test(label, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

test('空配置落到出厂值', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS });
  assert.deepEqual(normalizeSettings({}), { ...DEFAULT_SETTINGS });
});

test('越界值被夹进范围，不是被丢掉', () => {
  const low = normalizeSettings({ hueLight: -90, hueDark: 999, lineHeight: 0.2, paragraphGap: 0 });
  assert.equal(low.hueLight, 0);
  assert.equal(low.hueDark, 360);
  assert.equal(low.lineHeight, 1.4);
  assert.equal(low.paragraphGap, 4);
  const high = normalizeSettings({ hueLight: 720, lineHeight: 9, paragraphGap: 999 });
  assert.equal(high.hueLight, 360);
  assert.equal(high.lineHeight, 2);
  assert.equal(high.paragraphGap, 24);
});

test('不是数字的脏值退回出厂值', () => {
  const dirty = normalizeSettings({ hueLight: 'warm', lineHeight: Number.NaN, paragraphGap: null });
  assert.equal(dirty.hueLight, DEFAULT_SETTINGS.hueLight);
  assert.equal(dirty.lineHeight, DEFAULT_SETTINGS.lineHeight);
  assert.equal(dirty.paragraphGap, DEFAULT_SETTINGS.paragraphGap);
});

test('认不出的标题配色退回六级换色', () => {
  assert.equal(normalizeSettings({ headingColor: 'rainbow' }).headingColor, 'colorful');
  assert.equal(normalizeSettings({ headingColor: 'accent' }).headingColor, 'accent');
});

test('布尔开关缺失时按出厂值走，显式 false 才算关', () => {
  assert.equal(normalizeSettings({}).codePalette, true);
  assert.equal(normalizeSettings({ codePalette: false }).codePalette, false);
});

test('clampNumber 认得出数字字符串，认不出的用兜底', () => {
  assert.equal(clampNumber('120', 0, 360, 35), 120);
  assert.equal(clampNumber('', 0, 360, 35), 35);
  assert.equal(clampNumber(null, 0, 360, 35), 35);
  assert.equal(clampNumber(undefined, 0, 360, 35), 35);
  assert.equal(clampNumber(Number.POSITIVE_INFINITY, 0, 360, 35), 35);
});

test('投影写的是五个属性与四个变量，没有别的', () => {
  const projection = projectSettings(normalizeSettings({}));
  assert.deepEqual(Object.keys(projection.attributes).sort(), [
    CODE_ATTRIBUTE, HEADING_ATTRIBUTE, INDICATOR_ATTRIBUTE, ROOT_ATTRIBUTE, SHELL_ATTRIBUTE,
  ].sort());
  assert.deepEqual(Object.keys(projection.variables).sort(), [...ROOT_VARIABLES].sort());
  assert.equal(projection.attributes[ROOT_ATTRIBUTE], 'on');
  assert.equal(projection.variables['--maple-p-gap'], '10px');
  assert.equal(projection.variables['--maple-line-height'], '1.75');
});

test('关掉的开关写成 null（调用方删属性），不是写个 off', () => {
  const projection = projectSettings(normalizeSettings({ headingIndicator: false, codePalette: false, shellSkin: false }));
  assert.equal(projection.attributes[INDICATOR_ATTRIBUTE], null);
  assert.equal(projection.attributes[CODE_ATTRIBUTE], null);
  assert.equal(projection.attributes[SHELL_ATTRIBUTE], null);
});

test('外壳装饰默认开，显式关掉才撤', () => {
  assert.equal(normalizeSettings({}).shellSkin, true);
  assert.equal(projectSettings(normalizeSettings({})).attributes[SHELL_ATTRIBUTE], 'on');
  assert.equal(normalizeSettings({ shellSkin: false }).shellSkin, false);
});

test('整体停用时不留任何生效痕迹', () => {
  const projection = projectSettings(normalizeSettings({}), false);
  assert.ok(Object.values(projection.attributes).every((value) => value === null));
  assert.ok(Object.values(projection.variables).every((value) => value === null));
});

test('写到真 DOM 上再撤掉，元素上不留东西', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const root = dom.window.document.documentElement;
  applyProjection(root, projectSettings(normalizeSettings({ hueLight: 120, paragraphGap: 18 })));
  assert.equal(root.getAttribute(ROOT_ATTRIBUTE), 'on');
  assert.equal(root.style.getPropertyValue('--maple-hue-light'), '120');
  assert.equal(root.style.getPropertyValue('--maple-p-gap'), '18px');
  clearProjection(root);
  assert.equal(root.getAttribute(ROOT_ATTRIBUTE), null);
  assert.equal(root.getAttribute(HEADING_ATTRIBUTE), null);
  for (const name of ROOT_VARIABLES) assert.equal(root.style.getPropertyValue(name), '', `${name} 没撤掉`);
});

test('重复投影是幂等的，不会叠出第二份', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const root = dom.window.document.documentElement;
  const projection = projectSettings(normalizeSettings({ hueLight: 200 }));
  applyProjection(root, projection);
  applyProjection(root, projection);
  assert.equal(root.style.getPropertyValue('--maple-hue-light'), '200');
});

console.log(`${passed}/${total} passed`);

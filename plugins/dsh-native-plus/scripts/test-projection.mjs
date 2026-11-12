/**
 * 投影自检：把「一份配置」算成「页面该长什么样」这步单独钉住。
 *
 * 承重点是**边界与脏输入**，不是默认可爱的样子：手改过的设置文档可能存进越界值、
 * 字符串、缺字段。投影这一步若不收拢，样式表就会拿到 `--np-line-height: NaN`
 * 这种值，而页面只是「有点怪」，不报错。
 *
 * 另有一条「不写颜色」的断言：本插件一个颜色令牌都不设，投影只能产出根属性与两个尺寸变量。
 *
 * 跑法：pnpm test / node scripts/test-projection.mjs
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  DEFAULT_SETTINGS, ROOT_ATTRIBUTE, ROOT_VARIABLES,
  applyProjection, clearProjection, normalizeSettings, projectSettings,
} from '../src/client/settings.ts';
import { FIELDS, defaultConfig } from '../src/client/schema.ts';

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
  assert.deepEqual(normalizeSettings(undefined), defaultConfig());
  assert.deepEqual(normalizeSettings({}), defaultConfig());
});

test('越界值被夹进范围，不是被丢掉', () => {
  const low = normalizeSettings({ lineHeight: 0.2, paragraphGap: 0 });
  assert.equal(low.lineHeight, 1.4);
  assert.equal(low.paragraphGap, 4);
  const high = normalizeSettings({ lineHeight: 9, paragraphGap: 999 });
  assert.equal(high.lineHeight, 2);
  assert.equal(high.paragraphGap, 24);
});

test('不是数字的脏值退回出厂值', () => {
  const dirty = normalizeSettings({ lineHeight: Number.NaN, paragraphGap: null });
  assert.equal(dirty.lineHeight, DEFAULT_SETTINGS.lineHeight);
  assert.equal(dirty.paragraphGap, DEFAULT_SETTINGS.paragraphGap);
});

test('投影写的就是一个根属性与两个变量，没有别的', () => {
  const projection = projectSettings(normalizeSettings({}));
  assert.deepEqual(Object.keys(projection.attributes), [ROOT_ATTRIBUTE]);
  assert.deepEqual(Object.keys(projection.variables).sort(), [...ROOT_VARIABLES].sort());
  assert.equal(projection.attributes[ROOT_ATTRIBUTE], 'on');
  assert.equal(projection.variables['--np-p-gap'], '10px');
  assert.equal(projection.variables['--np-line-height'], '1.75');
});

test('投影不产生任何颜色', () => {
  // 本插件不改配色：投影里出现颜色值就说明又有东西开始写色板了。
  const projection = projectSettings(normalizeSettings({}));
  for (const [name, value] of Object.entries(projection.variables)) {
    assert.doesNotMatch(String(value), /hsl|rgb|#|color-mix/, `${name} 写了颜色：${value}`);
  }
});

test('整体停用时不留任何生效痕迹', () => {
  const projection = projectSettings(normalizeSettings({}), false);
  assert.ok(Object.values(projection.attributes).every((value) => value === null));
  assert.ok(Object.values(projection.variables).every((value) => value === null));
});

test('写到真 DOM 上再撤掉，元素上不留东西', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const root = dom.window.document.documentElement;
  applyProjection(root, projectSettings(normalizeSettings({ paragraphGap: 18 })));
  assert.equal(root.getAttribute(ROOT_ATTRIBUTE), 'on');
  assert.equal(root.style.getPropertyValue('--np-p-gap'), '18px');
  clearProjection(root);
  assert.equal(root.getAttribute(ROOT_ATTRIBUTE), null);
  for (const name of ROOT_VARIABLES) assert.equal(root.style.getPropertyValue(name), '', `${name} 没撤掉`);
});

test('重复投影是幂等的，不会叠出第二份', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const root = dom.window.document.documentElement;
  const projection = projectSettings(normalizeSettings({ lineHeight: 1.9 }));
  applyProjection(root, projection);
  applyProjection(root, projection);
  assert.equal(root.style.getPropertyValue('--np-line-height'), '1.9');
});

test('字段表里每个字段的默认值都在合法范围内', () => {
  for (const field of FIELDS) {
    assert.ok(field.default >= field.min && field.default <= field.max, `${field.key} 的默认值越界`);
  }
});

test('配置项保持精简：字段数在预期内', () => {
  // 这一条挡的是「又长回几十个配色项」那种回退。
  assert.ok(FIELDS.length <= 4, `字段表长到了 ${FIELDS.length} 条`);
});

console.log(`${passed}/${total} passed`);

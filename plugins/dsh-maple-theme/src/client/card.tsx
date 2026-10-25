/**
 * 宿主「插件」页上的配置卡片：Maple 主题的全部旋钮。
 *
 * 改动即时生效：控件的每一次变化都直接写进配置表单，表单回写快照，投影订阅把值
 * 写到 <html> 上，样式表不重建。没有「保存」按钮——这几个旋钮都是所见即所得的，
 * 加一步保存只会让人以为没生效。
 */
import { useEffect, useState } from 'react';
import * as React from 'react';
import { IconChevronDownOutlineRegular, Input, Menu, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { readSettings, type MapleForm, type MapleOp } from './binding.ts';
import { DEFAULT_SETTINGS, type MapleSettings } from './settings.ts';
import { NS } from './locales.ts';
import { matchPreset, PALETTE_PRESETS } from './presets.ts';

/**
 * 常用配色的色相预设：一键把浅色与深色色相同时切过去。
 *
 * 这些都是「暖 / 冷」两极里有名字的位置，不是随手取的数：
 * 35° 是 Maple 出厂值（暖白），207° 是它的深色出厂值（冷灰），
 * 其余几个覆盖日常会想要的方向（紫、青、绿、玫瑰）。
 * 浅色取偏亮的一侧、深色取偏冷的一侧，两套同时给，切过去立刻成套。
 */


/** 标题配色的三个选项：值、文案键、面板 id 后缀。 */
const HEADING_OPTIONS = [
  { value: 'colorful', key: 'card.headingColorColorful' },
  { value: 'accent', key: 'card.headingColorAccent' },
  { value: 'text', key: 'card.headingColorText' },
] as const;

/**
 * 色相滑块：拖动时逐点提交，松手才算一次改动。
 *
 * 色相要一边拖一边看效果才有意义，所以不像数字框那样等失焦；
 * 但每移动一像素就写一次配置会让表单反复重建，所以按 `input` 事件节流到动画帧。
 * @param props.value - 当前色相（0…360）。
 * @param props.onChange - 拖动过程中持续回报。
 * @param props.label - 控件的可访问名。
 */
function HueSlider({ value, label, onChange }: {
  value: number;
  label: string;
  onChange: (next: number) => void;
}): React.ReactElement {
  return (
    <input
      type="range"
      className="dsh-maple-hue"
      min={0}
      max={360}
      step={1}
      value={value}
      aria-label={label}
      // 读屏报「色相 35 度」而不是裸数字：这个值的单位对理解很关键。
      aria-valuetext={`${value}°`}
      onChange={(event) => { onChange(Number(event.currentTarget.value)) }}
    />
  );
}

/** 一行「标题 + 说明 + 控件」。 */
function Row({ title, hint, children }: {
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="dsh-maple-row">
      <div className="dsh-maple-row-info">
        <div className="dsh-maple-row-title">{title}</div>
        {hint !== undefined && <div className="dsh-maple-row-hint">{hint}</div>}
      </div>
      <div className="dsh-maple-row-field">{children}</div>
    </div>
  );
}

/**
 * 一个数字旋钮：本地保存输入中的字符串，失焦或回车时才提交。
 *
 * 不逐键提交：输入 `1.75` 的中途会经过 `1`、`1.` 这些值，逐键写会让页面在中间态闪一下。
 * @param props.value - 当前生效的值。
 * @param props.onCommit - 提交一个合法值。
 */
function NumberField({ value, min, max, step, unit, label, onCommit }: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
  onCommit: (next: number) => void;
}): React.ReactElement {
  const [text, setText] = useState(String(value));
  // 外部改了值（别处写入、恢复默认）就跟着换，但正在编辑时不打断。
  useEffect(() => { setText(String(value)) }, [value]);
  const commit = (): void => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) { setText(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed / step) * step));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <>
      <Input
        className="dsh-maple-number"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-label={label}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setText(event.target.value) }}
        onBlur={commit}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') { event.currentTarget.blur(); }
        }}
      />
      <span className="dsh-maple-unit">{unit}</span>
    </>
  );
}

/**
 * 预设选择器：一个下拉按钮，列出六个配色预设。
 *
 * 用下拉而不是分段控件，两个理由：
 *   1. 分段控件没有「一个都没选中」这种状态。手调过色相之后一对色相不对应任何预设，
 *      传个空串进去，指示块会被平移到轨道外面、压在同一行的说明文字上。
 *   2. 六个中文标签铺开要 600px 以上，会把同一行的说明挤成两行。
 * 下拉按钮的文案本身就是状态：对上某个预设就显示它的名字，对不上显示「自定义」。
 * @param props.value - 当前命中的预设 id；自定义时为 undefined。
 * @param props.items - 六个预设的 id 与已本地化的名字。
 * @param props.customLabel - 自定义状态下按钮显示的名字。
 * @param props.onSelect - 选中一个预设。
 * @param props.label - 控件的可访问名。
 */
function PresetPicker({ value, items, customLabel, onSelect, label }: {
  value: string | undefined;
  items: readonly { id: string; label: string }[];
  customLabel: string;
  onSelect: (id: string) => void;
  label: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const currentLabel = items.find(item => item.id === value)?.label ?? customLabel;
  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={items}
      selectedId={value}
      onSelect={onSelect}
      align="end"
      portal
      anchor={(
        <button
          type="button"
          className="dsh-maple-select"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={() => { setOpen(current => !current) }}
        >
          <span className="dsh-maple-select-label">{currentLabel}</span>
          <IconChevronDownOutlineRegular className="dsh-maple-chevron" size={14} />
        </button>
      )}
    />
  );
}

/**
 * 渲染配置卡片。
 * @param props - 座位给的 `t`，加上本插件在 `inject` 里投出去的那张表单。
 * @returns 卡片的元素树。
 */
export function MapleThemeCard(
  props: PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS> & { form: MapleForm },
): React.ReactElement {
  // 座位在 `locale: NS` 时把绑定好的 t 挂在 `t` 上；类型声明里它是运行期注入的，这里取出来。
  const { form } = props;
  const t = (key: keyof typeof import('./locales.ts').en): string =>
    (props as unknown as { t: (k: string) => string }).t(key);
  const [settings, setSettings] = useState<MapleSettings | undefined>(() => readSettings(form));
  const [available, setAvailable] = useState(() => form.getSnapshot().status !== 'unavailable');

  useEffect(() => {
    const sync = (): void => {
      setSettings(readSettings(form));
      setAvailable(form.getSnapshot().status !== 'unavailable');
    };
    sync();
    return form.subscribe(sync);
  }, [form]);

  if (!available) return <div className="dsh-maple-card"><div className="dsh-maple-empty">{t('card.unavailable')}</div></div>;

  const current = settings ?? DEFAULT_SETTINGS;
  /*
   * 当前落在哪个预设上：两个色相都与某个预设对得上才算，否则是 undefined（自定义）。
   * 不硬选一个「最接近的」——用户手调过之后，控件不该假装他还停在某个预设上。
   */
  const currentPreset = matchPreset(current.hueLight, current.hueDark)?.id;
  const write = (field: keyof MapleSettings, value: unknown): void => { void form.set(field, value); };
  /**
   * 一次写多个字段：浅色与深色是成套的，分开写会让页面闪一次「半套」配色。
   * @param changes - 字段与目标值。
   */
  const writeMany = (changes: Partial<Record<keyof MapleSettings, unknown>>): void => {
    const ops: MapleOp[] = Object.entries(changes).map(
      ([field, value]) => ({ op: 'set', path: [field], value }),
    );
    void form.mutate(ops);
  };

  return (
    <div className="dsh-maple-card">
      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.colors')}</div>
        <Row title={t('card.preset')} hint={t('card.presetHint')}>
          <PresetPicker
            value={currentPreset}
            label={t('card.preset')}
            customLabel={t('card.presetCustom')}
            items={PALETTE_PRESETS.map(preset => ({ id: preset.id, label: t(preset.key) }))}
            onSelect={(next) => {
              const preset = PALETTE_PRESETS.find(item => item.id === next);
              if (preset === undefined) return;
              // 一次改两个字段：浅色与深色是成套的，只改一个会得到半套配色。
              writeMany({ hueLight: preset.light, hueDark: preset.dark });
            }}
          />
        </Row>
        <Row title={t('card.hueLight')} hint={t('card.hueLightHint')}>
          <HueSlider value={current.hueLight} label={t('card.hueLight')}
            onChange={(next) => { write('hueLight', next) }} />
          <NumberField value={current.hueLight} min={0} max={360} step={1} unit="°"
            label={t('card.hueLight')} onCommit={(next) => { write('hueLight', next) }} />
        </Row>
        <Row title={t('card.hueDark')} hint={t('card.hueDarkHint')}>
          <HueSlider value={current.hueDark} label={t('card.hueDark')}
            onChange={(next) => { write('hueDark', next) }} />
          <NumberField value={current.hueDark} min={0} max={360} step={1} unit="°"
            label={t('card.hueDark')} onCommit={(next) => { write('hueDark', next) }} />
        </Row>
      </section>

      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.typography')}</div>
        <Row title={t('card.lineHeight')} hint={t('card.lineHeightHint')}>
          <NumberField value={current.lineHeight} min={1.4} max={2} step={0.05} unit="×"
            label={t('card.lineHeight')} onCommit={(next) => { write('lineHeight', next) }} />
        </Row>
        <Row title={t('card.paragraphGap')} hint={t('card.paragraphGapHint')}>
          <NumberField value={current.paragraphGap} min={4} max={24} step={1} unit="px"
            label={t('card.paragraphGap')} onCommit={(next) => { write('paragraphGap', next) }} />
        </Row>
      </section>

      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.headings')}</div>
        <Row title={t('card.headingColor')}>
          <SegmentedControl
            id="dsh-maple-heading"
            value={current.headingColor}
            label={t('card.headingColor')}
            options={HEADING_OPTIONS.map(option => ({ value: option.value, label: t(option.key) }))}
            onChange={(next) => { write('headingColor', next) }}
          />
        </Row>
        <Row title={t('card.headingIndicator')} hint={t('card.headingIndicatorHint')}>
          <Switch checked={current.headingIndicator} label={t('card.headingIndicator')}
            onChange={(next) => { write('headingIndicator', next) }} />
        </Row>
      </section>

      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.code')}</div>
        <Row title={t('card.codePalette')} hint={t('card.codePaletteHint')}>
          <Switch checked={current.codePalette} label={t('card.codePalette')}
            onChange={(next) => { write('codePalette', next) }} />
        </Row>
      </section>

      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.font')}</div>
        <Row title={t('card.mapleFont')} hint={t('card.mapleFontHint')}>
          <Switch checked={current.mapleFont} label={t('card.mapleFont')}
            onChange={(next) => { write('mapleFont', next) }} />
        </Row>
      </section>

      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.shell')}</div>
        <Row title={t('card.shellSkin')} hint={t('card.shellSkinHint')}>
          <Switch checked={current.shellSkin} label={t('card.shellSkin')}
            onChange={(next) => { write('shellSkin', next) }} />
        </Row>
      </section>

      <div className="dsh-maple-note">{t('card.scope')}</div>
    </div>
  );
}

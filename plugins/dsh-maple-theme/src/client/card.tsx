/**
 * 宿主「插件」页上的配置卡片：Maple 主题的全部旋钮。
 *
 * 改动即时生效：控件的每一次变化都直接写进配置表单，表单回写快照，投影订阅把值
 * 写到 <html> 上，样式表不重建。没有「保存」按钮——这几个旋钮都是所见即所得的，
 * 加一步保存只会让人以为没生效。
 */
import { useEffect, useState } from 'react';
import * as React from 'react';
import { Input, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { readSettings, type MapleForm } from './binding.ts';
import { DEFAULT_SETTINGS, type MapleSettings } from './settings.ts';
import { NS } from './locales.ts';

/**
 * 常用配色的色相预设：一键把浅色与深色色相同时切过去。
 *
 * 这些都是「暖 / 冷」两极里有名字的位置，不是随手取的数：
 * 35° 是 Maple 出厂值（暖白），207° 是它的深色出厂值（冷灰），
 * 其余几个覆盖日常会想要的方向（紫、青、绿、玫瑰）。
 * 浅色取偏亮的一侧、深色取偏冷的一侧，两套同时给，切过去立刻成套。
 */
const PALETTE_PRESETS = [
  { id: 'maple', light: 35, dark: 207, key: 'card.presetMaple' },
  { id: 'lavender', light: 280, dark: 250, key: 'card.presetLavender' },
  { id: 'mint', light: 160, dark: 175, key: 'card.presetMint' },
  { id: 'forest', light: 110, dark: 140, key: 'card.presetForest' },
  { id: 'rose', light: 345, dark: 320, key: 'card.presetRose' },
  { id: 'steel', light: 210, dark: 215, key: 'card.presetSteel' },
] as const;

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
   * 当前落在哪个预设上：两个色相都与某个预设对得上才算，否则返回空串。
   * 返回空串而不是硬选一个——用户手调过之后，分段控件不该假装他还停在某个预设上。
   */
  const currentPreset = PALETTE_PRESETS.find(
    preset => preset.light === current.hueLight && preset.dark === current.hueDark,
  )?.id ?? '';
  const write = (field: keyof MapleSettings, value: unknown): void => { void form.set(field, value); };

  return (
    <div className="dsh-maple-card">
      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.colors')}</div>
        <Row title={t('card.preset')} hint={t('card.presetHint')}>
          <SegmentedControl
            id="dsh-maple-preset"
            value={currentPreset}
            label={t('card.preset')}
            options={PALETTE_PRESETS.map(preset => ({ value: preset.id, label: t(preset.key) }))}
            onChange={(next) => {
              const preset = PALETTE_PRESETS.find(item => item.id === next);
              if (preset === undefined) return;
              // 一次改两个字段：浅色与深色是成套的，只改一个会得到半套配色。
              write('hueLight', preset.light);
              write('hueDark', preset.dark);
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

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

/** 标题配色的三个选项：值、文案键、面板 id 后缀。 */
const HEADING_OPTIONS = [
  { value: 'colorful', key: 'card.headingColorColorful' },
  { value: 'accent', key: 'card.headingColorAccent' },
  { value: 'text', key: 'card.headingColorText' },
] as const;

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
  const write = (field: keyof MapleSettings, value: unknown): void => { void form.set(field, value); };

  return (
    <div className="dsh-maple-card">
      <section className="dsh-maple-group">
        <div className="dsh-maple-group-title">{t('card.colors')}</div>
        <Row title={t('card.hueLight')} hint={t('card.hueLightHint')}>
          <NumberField value={current.hueLight} min={0} max={360} step={1} unit="°"
            label={t('card.hueLight')} onCommit={(next) => { write('hueLight', next) }} />
        </Row>
        <Row title={t('card.hueDark')} hint={t('card.hueDarkHint')}>
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

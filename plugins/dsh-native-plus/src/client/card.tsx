/**
 * 宿主「插件」页上的配置卡片：本插件的全部旋钮。
 *
 * 卡片从 `schema.ts` 的字段表生成，所以加一个可调项不必改这里——只有「怎么画」是这里的事。
 *
 * 改动即时生效：控件的每一次变化都直接写进配置表单，表单回写快照，投影订阅把值
 * 写到 <html> 上，样式表不重建。没有「保存」按钮。
 */
import { useEffect, useState } from 'react';
import * as React from 'react';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { readSettings, type ConfigForm } from './binding.ts';
import { FIELDS, defaultConfig, type Field } from './schema.ts';
import { NS } from './locales.ts';

/** 本地化函数。 */
type Translate = (key: string) => string;

/** 配置值。 */
type Value = string | number | boolean;

/** 取值，缺了就是空串。 */
function valueOf(settings: Record<string, Value>, key: string): Value {
  return settings[key] ?? '';
}

/**
 * 一行「标题 + 说明 + 控件」。
 * @param props.title - 行标题。
 * @param props.hint - 行说明，可选。
 * @param props.children - 右侧控件。
 */
function Row({ title, hint, children }: {
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="dsh-np-row">
      <div className="dsh-np-row-info">
        <div className="dsh-np-row-title">{title}</div>
        {hint !== undefined && <div className="dsh-np-row-hint">{hint}</div>}
      </div>
      <div className="dsh-np-row-field">{children}</div>
    </div>
  );
}

/**
 * 一个数值旋钮：滑块与数字框共用一份本地文本，失焦或回车时提交。
 * @param props.field - 字段定义。
 * @param props.value - 当前值。
 * @param props.onCommit - 提交一个合法值。
 */
function NumberControl({ field, value, onCommit }: {
  field: Field;
  value: number;
  onCommit: (next: number) => void;
}): React.ReactElement {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)) }, [value]);
  const commit = (): void => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) { setText(String(value)); return; }
    const clamped = Math.min(field.max, Math.max(field.min, Math.round(parsed / field.step) * field.step));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <>
      <input
        type="range"
        className="dsh-np-slider"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        aria-label={field.label}
        onChange={(event) => { onCommit(Number(event.currentTarget.value)) }}
      />
      <Input
        className="dsh-np-number"
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        value={text}
        aria-label={field.label}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setText(event.target.value) }}
        onBlur={commit}
        onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') { event.currentTarget.blur(); }
        }}
      />
      <span className="dsh-np-unit">{field.unit}</span>
    </>
  );
}

/**
 * 渲染配置卡片。
 * @param props - 座位给的 `t`，加上本插件在 `inject` 里投出去的那张表单。
 * @returns 卡片的元素树。
 */
export function NativePlusCard(
  props: PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS> & { form: ConfigForm },
): React.ReactElement {
  const { form } = props;
  const t: Translate = (key: string) => (props as unknown as { t: (k: string) => string }).t(key);
  const [settings, setSettings] = useState<Record<string, Value> | undefined>(() => readSettings(form));
  const [available, setAvailable] = useState(() => form.getSnapshot().status !== 'unavailable');

  useEffect(() => {
    const sync = (): void => {
      setSettings(readSettings(form));
      setAvailable(form.getSnapshot().status !== 'unavailable');
    };
    sync();
    return form.subscribe(sync);
  }, [form]);

  if (!available) {
    return <div className="dsh-np-card"><div className="dsh-np-empty">{t('state.unavailable')}</div></div>;
  }

  const current: Record<string, Value> = settings ?? defaultConfig();
  const write = (key: string, next: Value): void => { void form.set(key, next); };

  return (
    <div className="dsh-np-card">
      <div className="dsh-np-rows">
        {FIELDS.map((field) => (
          <Row
            key={field.key}
            title={t(field.label)}
            hint={field.hint === undefined ? undefined : t(field.hint)}
          >
            <NumberControl
              field={field}
              value={Number(valueOf(current, field.key))}
              onCommit={(next) => { write(field.key, next) }}
            />
          </Row>
        ))}
      </div>
      <div className="dsh-np-note">{t('note.scope')}</div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';
import { Input, Pill, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  CARD_PLACEMENTS,
  DEFAULT_NUDGE_AFTER,
  MAX_NUDGE_AFTER,
  readConfig,
  type ConfigForm,
} from './config.js';
import { NS } from './locales.js';

/**
 * 宿主「插件」页上的配置卡：催办阈值、进度卡位置与「带不带折叠键」。
 *
 * 没有保存按钮：数字框失焦或回车时写一次，打字期间只改草稿；开关与位置在动作发生的那一刻写。
 * 写入交给设置表单自己排队（它按 revision 串行化），卡片只负责把失败就地报出来。
 */

/** 座位给的取词，加上本插件在 `inject` 里投出去的那张表单。 */
type ConfigCardProps = PropsLocale<typeof NS> & { form: ConfigForm };

/**
 * 渲染配置卡。
 * @param props - 座位给的 `t` 与配置表单。
 * @returns 卡片的元素树；宿主没服务这份配置时只有一行说明。
 */
export function ConfigCard(props: ConfigCardProps): ReactElement {
  const { form, t } = props;
  const [config, setConfig] = useState(() => readConfig(form));
  const [text, setText] = useState<string>(() => String(readConfig(form)?.nudgeAfter ?? DEFAULT_NUDGE_AFTER));
  const [error, setError] = useState<string | null>(null);
  // 离开页面时把还没失焦的草稿写下去（切标签/关页面会直接卸载这张卡）。
  const draftRef = useRef(text);
  const committedRef = useRef(config?.nudgeAfter);

  useEffect(() => {
    const sync = (): void => {
      const next = readConfig(form);
      setConfig(next);
      if (next !== undefined) setText(String(next.nudgeAfter));
    };
    sync();
    return form.subscribe(sync);
  }, [form]);

  useEffect(() => { draftRef.current = text; }, [text]);
  useEffect(() => { committedRef.current = config?.nudgeAfter; }, [config?.nudgeAfter]);
  useEffect(() => () => {
    const parsed = Number(draftRef.current);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(MAX_NUDGE_AFTER, Math.max(0, Math.floor(parsed)));
    if (next !== committedRef.current) void form.set('nudgeAfter', next);
  }, [form]);

  if (config === undefined) {
    return (
      <div className="dsh-notify-config">
        <div className="dsh-notify-config-note">{t('config.unavailable')}</div>
      </div>
    );
  }

  const write = (field: string, value: unknown): void => {
    void form.set(field, value).then(
      (accepted) => { setError(accepted ? null : t('config.write.failed')); },
      () => { setError(t('config.write.failed')); },
    );
  };

  const commitThreshold = (): void => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(String(config.nudgeAfter));
      return;
    }
    const next = Math.min(MAX_NUDGE_AFTER, Math.max(0, Math.floor(parsed)));
    setText(String(next));
    if (next === config.nudgeAfter) return;
    setConfig({ ...config, nudgeAfter: next });
    write('nudgeAfter', next);
  };

  return (
    <div className="dsh-notify-config">
      <div className="dsh-notify-config-row">
        <div className="dsh-notify-config-info">
          <div className="dsh-notify-config-label">{t('config.threshold.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.threshold.hint')}</div>
        </div>
        <div className="dsh-notify-config-field">
          <Input
            className="dsh-notify-config-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_NUDGE_AFTER}
            step={1}
            value={text}
            aria-label={t('config.threshold.label')}
            onChange={(event: ChangeEvent<HTMLInputElement>) => { setText(event.target.value); }}
            onBlur={commitThreshold}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <span className="dsh-notify-config-unit">{t('config.threshold.unit')}</span>
        </div>
      </div>
      <div className="dsh-notify-config-row">
        <div className="dsh-notify-config-info">
          <div className="dsh-notify-config-label">{t('config.placement.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.placement.hint')}</div>
        </div>
        <div className="dsh-notify-config-field" role="group" aria-label={t('config.placement.label')}>
          {CARD_PLACEMENTS.map((placement) => (
            <Pill
              key={placement}
              active={config.cardPlacement === placement}
              aria-pressed={config.cardPlacement === placement}
              onClick={() => {
                if (config.cardPlacement === placement) return;
                setConfig({ ...config, cardPlacement: placement });
                write('cardPlacement', placement);
              }}
            >
              {t(placement === 'boundary' ? 'config.placement.boundary' : 'config.placement.inline')}
            </Pill>
          ))}
        </div>
      </div>
      <div className="dsh-notify-config-row">
        <div className="dsh-notify-config-info">
          <div className="dsh-notify-config-label">{t('config.collapsible.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.collapsible.hint')}</div>
        </div>
        <div className="dsh-notify-config-field">
          <Switch
            checked={config.collapsible}
            label={t('config.collapsible.label')}
            onChange={(next: boolean) => {
              setConfig({ ...config, collapsible: next });
              write('collapsible', next);
            }}
          />
        </div>
      </div>
      {error === null ? null : <div className="dsh-notify-config-error" role="status">{error}</div>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react';
import { Input, Pill, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  CARD_PLACEMENTS,
  DEFAULT_NUDGE_AFTER,
  MAX_NUDGE_AFTER,
  SUMMARY_RENDERS,
  readConfig,
  type ClientConfig,
  type ConfigForm,
  type SummaryRender,
} from './config.js';
import { NS, type NotifyKey } from './locales.js';

/**
 * 宿主「插件」页上的配置卡：主动汇报的默认开关、催办阈值、「散文回复算不算汇报」、
 * 汇报形态（结构化正文 / 只报摘要）、正文显示（始终展开 / 默认收起 / 默认展开）与
 * 进度卡位置。
 *
 * 没有保存按钮：数字框失焦或回车时写一次，打字期间只改草稿；开关与位置在动作发生的那一刻写。
 * 写入交给设置表单自己排队（它按 revision 串行化），卡片只负责把失败就地报出来。
 */

/** 座位给的取词，加上本插件在 `inject` 里投出去的那张表单。 */
type ConfigCardProps = PropsLocale<typeof NS> & { form: ConfigForm };

/** 汇报形态：结构化正文，或只写一行标题。 */
const REPORT_MODES = ['structured', 'summary'] as const;

/** 正文显示的三档：始终展开、默认收起、默认展开。 */
const BODY_MODES = ['always', 'collapsed', 'expanded'] as const;

/** 正文显示的一档。 */
type BodyMode = typeof BODY_MODES[number];

/** 汇报形态的文案键。 */
const REPORT_MODE_LABELS = {
  structured: 'config.reportMode.structured',
  summary: 'config.reportMode.summary',
} as const satisfies Record<typeof REPORT_MODES[number], NotifyKey>;

/** 摘要呈现的文案键。 */
const SUMMARY_RENDER_LABELS = {
  card: 'config.summaryRender.card',
  prose: 'config.summaryRender.prose',
} as const satisfies Record<SummaryRender, NotifyKey>;

/** 正文显示三档的文案键。 */
const BODY_MODE_LABELS = {
  always: 'config.bodyMode.always',
  collapsed: 'config.bodyMode.collapsed',
  expanded: 'config.bodyMode.expanded',
} as const satisfies Record<BodyMode, NotifyKey>;

/**
 * 正文显示当前落在哪一档：由 `collapsible` 与 `bodyExpandedByDefault` 折算。
 * @param config - 读到的配置。
 * @returns 三档之一。
 */
function bodyModeOf(config: ClientConfig): BodyMode {
  if (!config.collapsible) return 'always';
  return config.bodyExpandedByDefault ? 'expanded' : 'collapsed';
}

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

  const bodyMode = bodyModeOf(config);

  const write = (field: string, value: unknown): void => {
    void form.set(field, value).then(
      (accepted) => { setError(accepted ? null : t('config.write.failed')); },
      () => { setError(t('config.write.failed')); },
    );
  };

  /** 三选一写回两个布尔：只写真正变了的字段，按顺序排队。 */
  const chooseBodyMode = (mode: BodyMode): void => {
    if (mode === bodyMode) return;
    const collapsible = mode !== 'always';
    const bodyExpandedByDefault = mode === 'expanded';
    const pairs: [string, unknown][] = [];
    if (collapsible !== config.collapsible) pairs.push(['collapsible', collapsible]);
    if (bodyExpandedByDefault !== config.bodyExpandedByDefault) pairs.push(['bodyExpandedByDefault', bodyExpandedByDefault]);
    setConfig({ ...config, collapsible, bodyExpandedByDefault });
    void (async () => {
      try {
        for (const [field, value] of pairs) {
          if (!await form.set(field, value)) {
            setError(t('config.write.failed'));
            return;
          }
        }
        setError(null);
      } catch {
        setError(t('config.write.failed'));
      }
    })();
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
          <div className="dsh-notify-config-label">{t('config.defaultEnabled.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.defaultEnabled.hint')}</div>
        </div>
        <div className="dsh-notify-config-field">
          <Switch
            checked={config.defaultEnabled}
            label={t('config.defaultEnabled.label')}
            onChange={(next: boolean) => {
              setConfig({ ...config, defaultEnabled: next });
              write('defaultEnabled', next);
            }}
          />
        </div>
      </div>
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
          <div className="dsh-notify-config-label">{t('config.resetOnProse.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.resetOnProse.hint')}</div>
        </div>
        <div className="dsh-notify-config-field">
          <Switch
            checked={config.resetOnProse}
            label={t('config.resetOnProse.label')}
            onChange={(next: boolean) => {
              setConfig({ ...config, resetOnProse: next });
              write('resetOnProse', next);
            }}
          />
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
          <div className="dsh-notify-config-label">{t('config.reportMode.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.reportMode.hint')}</div>
        </div>
        <div className="dsh-notify-config-field" role="group" aria-label={t('config.reportMode.label')}>
          {REPORT_MODES.map((mode) => {
            const summary = mode === 'summary';
            return (
              <Pill
                key={mode}
                active={config.summaryOnly === summary}
                aria-pressed={config.summaryOnly === summary}
                onClick={() => {
                  if (config.summaryOnly === summary) return;
                  setConfig({ ...config, summaryOnly: summary });
                  write('summaryOnly', summary);
                }}
              >
                {t(REPORT_MODE_LABELS[mode])}
              </Pill>
            );
          })}
        </div>
      </div>
      {config.summaryOnly ? (
        <div className="dsh-notify-config-row">
          <div className="dsh-notify-config-info">
            <div className="dsh-notify-config-label">{t('config.summaryRender.label')}</div>
            <div className="dsh-notify-config-hint">{t('config.summaryRender.hint')}</div>
          </div>
          <div className="dsh-notify-config-field" role="group" aria-label={t('config.summaryRender.label')}>
            {SUMMARY_RENDERS.map((render) => (
              <Pill
                key={render}
                active={config.summaryRender === render}
                aria-pressed={config.summaryRender === render}
                onClick={() => {
                  if (config.summaryRender === render) return;
                  setConfig({ ...config, summaryRender: render });
                  write('summaryRender', render);
                }}
              >
                {t(SUMMARY_RENDER_LABELS[render])}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
      {config.summaryOnly ? null : (
        <div className="dsh-notify-config-row">
          <div className="dsh-notify-config-info">
            <div className="dsh-notify-config-label">{t('config.bodyMode.label')}</div>
            <div className="dsh-notify-config-hint">{t('config.bodyMode.hint')}</div>
          </div>
          <div className="dsh-notify-config-field" role="group" aria-label={t('config.bodyMode.label')}>
            {BODY_MODES.map((mode) => (
              <Pill
                key={mode}
                active={bodyMode === mode}
                aria-pressed={bodyMode === mode}
                onClick={() => { chooseBodyMode(mode); }}
              >
                {t(BODY_MODE_LABELS[mode])}
              </Pill>
            ))}
          </div>
        </div>
      )}
      {error === null ? null : <div className="dsh-notify-config-error" role="status">{error}</div>}
    </div>
  );
}

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
 * 汇报形态（结构化正文 / 只报摘要）、摘要呈现（进度卡 / 散文）、正文显示
 * （始终展开 / 默认收起 / 默认展开）与进度卡位置。
 *
 * 没有保存按钮：数字框失焦或回车时写一次，打字期间只改草稿；开关、切换按钮与位置在
 * 动作发生的那一刻写。写入排成一条队列，一次只发一个：宿主按 revision 给每次写入设
 * 栅栏，并行发出会让后一次撞上前一次刚换掉的 revision。
 */

/** 座位给的取词，加上本插件在 `inject` 里投出去的那张表单。 */
type ConfigCardProps = PropsLocale<typeof NS> & { form: ConfigForm };

/** 汇报形态：结构化正文，或只写一行标题。 */
const REPORT_MODES = ['structured', 'summary'] as const;

/** 正文显示的三档：始终展开、默认收起、默认展开。 */
const BODY_MODES = ['always', 'collapsed', 'expanded'] as const;

/** 正文显示的一档。 */
type BodyMode = typeof BODY_MODES[number];

/** 切换按钮的一项。 */
interface Choice<T extends string> {
  readonly id: T;
  readonly label: string;
}

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
 * 一组切换按钮：标签、当前值与选中回调；点当前项不做事。
 * @param props - 组标签、可选项、当前值与选中回调。
 * @returns 一组 Pill。
 */
function ChoiceGroup<T extends string>({ label, options, value, onSelect }: {
  readonly label: string;
  readonly options: readonly Choice<T>[];
  readonly value: T;
  readonly onSelect: (id: T) => void;
}): ReactElement {
  return (
    <div className="dsh-notify-config-field" role="group" aria-label={label}>
      {options.map((option) => (
        <Pill
          key={option.id}
          active={value === option.id}
          aria-pressed={value === option.id}
          onClick={() => { if (value !== option.id) onSelect(option.id); }}
        >
          {option.label}
        </Pill>
      ))}
    </div>
  );
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

  /** 写入队列：一次只发一个，后一次读到最新草稿。 */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (pairs: readonly (readonly [string, unknown])[]): void => {
    queueRef.current = queueRef.current.then(async () => {
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
    });
  };

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
    if (next !== committedRef.current) enqueue([['nudgeAfter', next]]);
  }, [form]);

  if (config === undefined) {
    return (
      <div className="dsh-notify-config">
        <div className="dsh-notify-config-note">{t('config.unavailable')}</div>
      </div>
    );
  }

  const bodyMode = bodyModeOf(config);

  /** 写一个字段：排进队列。 */
  const write = (field: string, value: unknown): void => { enqueue([[field, value]]); };

  /** 三选一写回两个布尔：两个字段一起写，队列里最后一次选择赢。 */
  const chooseBodyMode = (mode: BodyMode): void => {
    if (mode === bodyMode) return;
    const collapsible = mode !== 'always';
    const bodyExpandedByDefault = mode === 'expanded';
    setConfig({ ...config, collapsible, bodyExpandedByDefault });
    enqueue([['collapsible', collapsible], ['bodyExpandedByDefault', bodyExpandedByDefault]]);
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
        <ChoiceGroup
          label={t('config.placement.label')}
          value={config.cardPlacement}
          options={CARD_PLACEMENTS.map((id) => ({
            id,
            label: t(id === 'boundary' ? 'config.placement.boundary' : 'config.placement.inline'),
          }))}
          onSelect={(id) => {
            setConfig({ ...config, cardPlacement: id });
            write('cardPlacement', id);
          }}
        />
      </div>
      <div className="dsh-notify-config-row">
        <div className="dsh-notify-config-info">
          <div className="dsh-notify-config-label">{t('config.reportMode.label')}</div>
          <div className="dsh-notify-config-hint">{t('config.reportMode.hint')}</div>
        </div>
        <ChoiceGroup
          label={t('config.reportMode.label')}
          value={config.summaryOnly ? 'summary' : 'structured'}
          options={REPORT_MODES.map((id) => ({ id, label: t(REPORT_MODE_LABELS[id]) }))}
          onSelect={(id) => {
            const summary = id === 'summary';
            setConfig({ ...config, summaryOnly: summary });
            write('summaryOnly', summary);
          }}
        />
      </div>
      {config.summaryOnly ? (
        <div className="dsh-notify-config-row">
          <div className="dsh-notify-config-info">
            <div className="dsh-notify-config-label">{t('config.summaryRender.label')}</div>
            <div className="dsh-notify-config-hint">{t('config.summaryRender.hint')}</div>
          </div>
          <ChoiceGroup
            label={t('config.summaryRender.label')}
            value={config.summaryRender}
            options={SUMMARY_RENDERS.map((id) => ({ id, label: t(SUMMARY_RENDER_LABELS[id]) }))}
            onSelect={(id) => {
              setConfig({ ...config, summaryRender: id });
              write('summaryRender', id);
            }}
          />
        </div>
      ) : null}
      {config.summaryOnly ? null : (
        <div className="dsh-notify-config-row">
          <div className="dsh-notify-config-info">
            <div className="dsh-notify-config-label">{t('config.bodyMode.label')}</div>
            <div className="dsh-notify-config-hint">{t('config.bodyMode.hint')}</div>
          </div>
          <ChoiceGroup
            label={t('config.bodyMode.label')}
            value={bodyMode}
            options={BODY_MODES.map((id) => ({ id, label: t(BODY_MODE_LABELS[id]) }))}
            onSelect={(id) => { chooseBodyMode(id); }}
          />
        </div>
      )}
      {error === null ? null : <div className="dsh-notify-config-error" role="status">{error}</div>}
    </div>
  );
}

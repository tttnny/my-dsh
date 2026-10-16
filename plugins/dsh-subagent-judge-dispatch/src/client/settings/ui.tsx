import { useEffect, useState } from 'react';
import * as React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import {
  Button,
  CodeBlock,
  Input,
  Menu,
  Modal,
  SegmentedTabs,
  Switch,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  BUNDLE_CONFIG_KEY,
  BUNDLE_CONFIG_SLOT,
  setupPluginPage,
} from './plugin-page.ts';
import {
  ALLOWED_MODELS_NAMESPACE,
  createDispatchRemote,
  dispatchCardStore,
  JUDGE_API_KEY_REF,
  type CredentialsRemoteLike,
  routeKey,
  SETTINGS_NAMESPACE,
  splitRouteKey,
  type LogRow,
  type PageState,
  type Section,
  type TypeRowDraft,
} from './store.ts';
import { NS } from '../locales.ts';

/** The ready-made entries, each with the effort hint it ships. */
const PRESETS: readonly { key: string; effortHint: string }[] = [
  { key: 'mechanical', effortHint: 'preset.effortLow' },
  { key: 'research', effortHint: 'preset.effortLow' },
  { key: 'smallFeature', effortHint: 'preset.effortMedium' },
  { key: 'spec', effortHint: 'preset.effortHigh' },
  { key: 'review', effortHint: 'preset.effortMedium' },
  { key: 'debug', effortHint: 'preset.effortHigh' },
  { key: 'design', effortHint: 'preset.effortHigh' },
  { key: 'test', effortHint: 'preset.effortLow' },
];

/** Path shown in the key hint; the value itself never reaches the page. */
const CREDENTIALS_PATH = '~/.dsh/.credentials.yaml';

/** One localized template with technical samples rendered inline. */
function withSamples(text: string, samples: Record<string, string>): React.ReactNode {
  return text.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{\w+\}$/.test(part) ? part.slice(1, -1) : '';
    const sample = name === '' ? undefined : samples[name];
    return sample === undefined ? part : <code key={index}>{sample}</code>;
  });
}

/**
 * The card's own styles.
 *
 * Only the shapes the Host's controls do not carry: the settings-card material
 * (R20, the settings stroke and fill), the section and field rows, and the
 * task-type table. Every colour resolves through a `--dsw-alias-*` token, and
 * every elevated surface uses the settings-card material rather than a border
 * plus a shadow.
 */
const CARD_CSS = `
.dsh-judge-card { display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; width: 100%; max-width: 760px; color: var(--dsw-alias-label-primary); }
.dsh-judge-panel { display: flex; flex-direction: column; gap: 16px; }
.dsh-judge-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.dsh-judge-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dsh-judge-title { font: var(--dsw-font-s-strong-14); }
.dsh-judge-desc { max-width: 46em; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); }
.dsh-judge-desc code { font-family: var(--ds-font-family-code); }
.dsh-judge-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.dsh-judge-row + .dsh-judge-row { padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-judge-row-info { flex: 1; min-width: 0; }
.dsh-judge-row-title { font: var(--dsw-font-xs-strong-13); }
.dsh-judge-row-hint { margin-top: 2px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); }
.dsh-judge-row-field { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; box-sizing: border-box; width: 360px; max-width: 100%; }
/* 宿主的 Input 把输入框包在一层 inline-flex 的 span 里，类名落在那层 span 上，
   所以要撑的是它，只给 input 写宽度没用。 */
.dsh-judge-field { display: flex; box-sizing: border-box; width: 100%; min-width: 0; }
.dsh-judge-field input { box-sizing: border-box; width: 100%; min-width: 0; }
.dsh-judge-key-line { display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; }
.dsh-judge-off { display: block; color: var(--dsw-alias-state-warn-label); font: var(--dsw-font-xxxs-11); white-space: nowrap; }
.dsh-judge-head-actions { display: flex; align-items: center; gap: 8px; }
.dsh-judge-actions { display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-judge-hint { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); }
.dsh-judge-note-ok { color: var(--dsw-alias-state-success-primary); font: var(--dsw-font-xxs-12); }
.dsh-judge-note-bad { color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xxs-12); }
.dsh-judge-field-wrap { display: flex; box-sizing: border-box; width: 100%; min-width: 0; }
.dsh-judge-table { box-sizing: border-box; width: 100%; border-collapse: collapse; table-layout: fixed; }
.dsh-judge-table th, .dsh-judge-table td { box-sizing: border-box; }
.dsh-judge-table th {
  padding: 0 8px 6px 0;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-12);
  text-align: left;
}
.dsh-judge-table td { padding: 6px 8px 6px 0; vertical-align: middle; }
.dsh-judge-table tbody tr + tr td { border-top: 0.5px solid var(--dsw-alias-border-l3); }
.dsh-judge-table td:last-child, .dsh-judge-table th:last-child { padding-right: 0; }
.dsh-judge-col-no { width: 52px; }
.dsh-judge-col-model { width: 188px; }
.dsh-judge-col-effort { width: 124px; }
.dsh-judge-col-actions { width: 148px; }
.dsh-judge-no { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); font-variant-numeric: tabular-nums; }
.dsh-judge-row-off .dsh-judge-field { opacity: 0.6; }
.dsh-judge-cell-actions { display: flex; gap: 6px; }
.dsh-judge-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-judge-preset { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 10px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.dsh-judge-preset:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-judge-preset-title { font: var(--dsw-font-xs-13); }
.dsh-judge-preset-hint { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11); }
.dsh-judge-log { display: flex; flex-direction: column; gap: 4px; font: var(--dsw-font-xxs-12); }
.dsh-judge-log-row { display: grid; grid-template-columns: 40px 150px 70px 1fr 92px 72px 160px 1fr; gap: 8px; align-items: center; text-align: left; border: 0; background: none; padding: 6px 4px; border-radius: var(--dsw-radius-sm); cursor: pointer; color: inherit; }
.dsh-judge-cell-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-judge-log-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-judge-log-head { font-weight: 600; color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-judge-log-head:hover { background: none; }
.dsh-judge-detail { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font: var(--dsw-font-xs-13); }
/* 预览里是一整段 JSON，默认的弹窗宽度会把它折得很碎。 */
.dsh-judge-modal { width: min(760px, 100%); max-height: min(85vh, 100%); }
`;

/**
 * Append this card's stylesheet once, at apply() time.
 *
 * Injection happens here rather than on first render because the host's own
 * stylesheets are already-loaded `<link>` elements: a plugin sheet appended
 * later wins at equal specificity, and doing it once in apply() keeps that
 * order stable across remounts. The id makes the append idempotent.
 */
export function injectCardStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID) !== null) return;
  const element = document.createElement('style');
  element.id = STYLE_ID;
  element.textContent = CARD_CSS;
  document.head.appendChild(element);
}

/** DOM id of this card's stylesheet, so a remount does not append a second one. */
const STYLE_ID = 'dsh-subagent-judge-dispatch-styles';

/**
 * This plugin's configuration card inside the DSH **Plugins** page.
 *
 * Two tabs. The design tab holds two independently saved sections — the
 * judgement service, and the task-type table — because each is edited on its own
 * occasion and fails on its own terms; a single save for both would let an
 * unfinished description block an endpoint change. The log tab reads the Host's
 * runtime log. Nothing is written while the reader types.
 *
 * @param props - the renderer-bound seat of `plugins.bundle.config`.
 * @returns the card element.
 */
export function JudgeDispatchPanel(
  props: PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS>,
): React.ReactElement {
  const { t } = props;

  const [state, setState] = useState<PageState>(() => dispatchCardStore.getState());
  const [tab, setTab] = useState<'design' | 'log'>('design');
  const [browsing, setBrowsing] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; latencyMs: number; reason?: string } | null>(null);
  const [detail, setDetail] = useState<LogRow | null>(null);
  /** Which row's dropdown is open, and which of the two. */
  const [openMenu, setOpenMenu] = useState<{ index: number; kind: 'model' | 'effort' } | null>(null);
  /** The reason a save was refused, shown as a popup. */
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    setState(dispatchCardStore.getState());
    return dispatchCardStore.subscribe(() => setState(dispatchCardStore.getState()));
  }, []);

  useEffect(() => {
    if (tab === 'log') void dispatchCardStore.refreshLog();
  }, [tab]);

  /** Localized reason text for one fallback. */
  const reasonText = (reason: string | undefined): string =>
    t(`reason.${reason ?? 'other'}` as never) || t('reason.unknown');

  const runProbe = async (): Promise<void> => {
    setProbing(true);
    setProbeResult(await dispatchCardStore.probe());
    setProbing(false);
  };

  /** 类型清单有缺时按按钮不给写：把原因弹出来，而不是让按钮点不动。 */
  const saveRows = (): void => {
    if (state.rowsInvalid !== '') {
      setRefusal(state.rowsInvalid);
      return;
    }
    void dispatchCardStore.save('rows');
  };

  const openPreview = async (): Promise<void> => {
    const text = await dispatchCardStore.preview();
    setPreview(text ?? t('preview.failed'));
    setPreviewOpen(true);
  };

  /** One section's save row: the write, the discard, and what a save would do. */
  const saveRow = (section: Section, dirty: boolean, onSave: () => void): React.ReactElement => (
    <div className="dsh-judge-actions">
      {/* 类型清单有缺时按钮仍可点：按下去由 saveRows 弹窗说明为什么存不了。
          做成 disabled 的话，读者只看到一个点不动的按钮，不知道要改哪里。 */}
      <Button
        variant="primary"
        size="sm"
        disabled={state.saving !== '' || !dirty || !state.writable}
        onClick={onSave}
      >
        {state.saving === section ? t('save.saving') : t('save.button')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={state.saving !== '' || !dirty}
        onClick={() => dispatchCardStore.revert(section)}
      >
        {t('save.discard')}
      </Button>
      {dirty && <span className="dsh-judge-hint">{t('save.unsaved')}</span>}
      {/* 失败按节报：判断服务那次保存没落地时，任务类型那一节不该跟着报错。 */}
      {state.saveFailed === section && state.saveError !== '' && (
        <span className="dsh-judge-note-bad" role="alert">
          {t('save.failed').replace('{error}', state.saveError)}
        </span>
      )}
    </div>
  );

  /** One task-type row as three cells plus its row number and its actions. */
  const row = (draft: TypeRowDraft, index: number): React.ReactElement => {
    const efforts = dispatchCardStore.effortsFor(draft);
    const usable = dispatchCardStore.rowUsable(draft);
    // 只有「目录读到了、且这个路由确实声明了档位」时才给下拉；否则自由填写。
    const catalogOffersEffort = state.catalogRead && efforts.length > 0;
    return (
      <tr key={index} className={usable ? undefined : 'dsh-judge-row-off'}>
        <td className="dsh-judge-col-no">
          <span className="dsh-judge-no">{index + 1}</span>
          {usable ? null : <span className="dsh-judge-off">{t('rows.incomplete')}</span>}
        </td>
        <td>
          <Input
            type="text"
            className="dsh-judge-field"
            value={draft.description}
            placeholder={t('rows.descriptionPlaceholder')}
            aria-label={`${t('rows.colDescription')} ${index + 1}`}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              dispatchCardStore.cell(index, 'description', event.target.value)}
          />
        </td>
        <td>
          <Menu
            open={openMenu?.index === index && openMenu.kind === 'model'}
            anchor={<Input
              type="text"
              className="dsh-judge-field"
              readOnly
              value={draft.model === '' ? '' : `${draft.provider}/${draft.model}`}
              placeholder={t('rows.modelPlaceholder')}
              aria-label={`${t('rows.colModel')} ${index + 1}`}
              aria-haspopup="listbox"
              aria-expanded={openMenu?.index === index && openMenu.kind === 'model'}
              onClick={() => setOpenMenu({ index, kind: 'model' })}
              onFocus={() => setOpenMenu({ index, kind: 'model' })}
            />}
            items={[
              { type: 'label', id: 'model', text: t('rows.colModel') },
              ...(state.models.length === 0
                ? []
                : state.models.map((option) => ({
                  id: routeKey(option.provider, option.model),
                  label: `${option.provider}/${option.label}`,
                }))),
            ]}
            selectedId={draft.model === '' ? undefined : routeKey(draft.provider, draft.model)}
            onSelect={(id) => {
              const { provider, model } = splitRouteKey(id);
              dispatchCardStore.cell(index, 'provider', provider);
              dispatchCardStore.cell(index, 'model', model);
              setOpenMenu(null);
            }}
            onClose={() => setOpenMenu(null)}
            className="dsh-judge-field-wrap"
            portal
          />
        </td>
        {/* 目录读得到时，强度是这份可选档位里的一个；读不到（或这个路由没声明档位）
            时退回自由填写——把格子禁掉会让整张表永远填不全，也就永远不再判断任何东西。 */}
        <td>
          {catalogOffersEffort ? (
            <Menu
              open={openMenu?.index === index && openMenu.kind === 'effort'}
              anchor={<Input
                type="text"
                className="dsh-judge-field"
                readOnly
                value={draft.effort}
                placeholder={t('rows.effortPlaceholder')}
                aria-label={`${t('rows.colEffort')} ${index + 1}`}
                aria-haspopup="listbox"
                aria-expanded={openMenu?.index === index && openMenu.kind === 'effort'}
                onClick={() => setOpenMenu({ index, kind: 'effort' })}
                onFocus={() => setOpenMenu({ index, kind: 'effort' })}
              />}
              items={[
                { type: 'label', id: 'effort', text: t('rows.colEffort') },
                ...efforts.map((effort) => ({ id: effort, label: effort })),
              ]}
              selectedId={draft.effort === '' ? undefined : draft.effort}
              onSelect={(id) => {
                dispatchCardStore.cell(index, 'effort', id);
                setOpenMenu(null);
              }}
              onClose={() => setOpenMenu(null)}
              className="dsh-judge-field-wrap"
              portal
            />
          ) : (
            <Input
              type="text"
              className="dsh-judge-field"
              value={draft.effort}
              placeholder={t('rows.effortPlaceholder')}
              aria-label={`${t('rows.colEffort')} ${index + 1}`}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.cell(index, 'effort', event.target.value)}
            />
          )}
        </td>
        <td className="dsh-judge-col-actions">
          <div className="dsh-judge-cell-actions">
            <Button
              variant="outline"
              size="sm"
              aria-label={`${t('rows.browse')} ${index + 1}`}
              onClick={() => setBrowsing(index)}
            >
              {t('rows.browse')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`${t('rows.remove')} ${index + 1}`}
              onClick={() => dispatchCardStore.removeRow(index)}
            >
              {t('rows.remove')}
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const design = (
    <div className="dsh-judge-panel">
      <div className="dsh-judge-section">
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('judge.title')}</span>
          {/* 预览与试通都是「这套设置会怎样」的检查，跟着设置一起放，不另占一块。 */}
          <div className="dsh-judge-head-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={probing || state.dirty}
              onClick={() => void runProbe()}
            >
              {probing ? t('judge.probing') : t('judge.probe')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={state.dirty}
              onClick={() => void openPreview()}
            >
              {t('preview.open')}
            </Button>
          </div>
        </div>
        <div className="dsh-judge-desc">{t('judge.desc')}</div>

        {/* 这一节里的每一格都归下面那个保存按钮管：开关、端点、判断模型、密钥一次写入。
            开关不另外给保存按钮，也不即时写入——「只有按保存才写」这条规则在一个节里
            只能有一个出口，否则读者无法预判哪一下会落盘。 */}
        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('switch.rewrite.title')}</div>
            <div className="dsh-judge-row-hint">{t('switch.rewrite.desc')}</div>
          </div>
          <Switch
            checked={state.enabled}
            onChange={(next: boolean) => dispatchCardStore.toggle('enabled', next)}
            label={t('switch.rewrite.title')}
            disabled={!state.writable || state.saving !== ''}
          />
        </div>

        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('switch.log.title')}</div>
            <div className="dsh-judge-row-hint">{t('switch.log.desc')}</div>
          </div>
          <Switch
            checked={state.logEnabled}
            onChange={(next: boolean) => dispatchCardStore.toggle('logEnabled', next)}
            label={t('switch.log.title')}
            disabled={!state.writable || state.saving !== ''}
          />
        </div>

        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('judge.endpoint')}</div>
            <div className="dsh-judge-row-hint">{t('judge.endpointDesc')}</div>
          </div>
          <div className="dsh-judge-row-field">
            <Input
              type="text"
              className="dsh-judge-field"
              value={state.endpointUrl}
              placeholder="http://127.0.0.1:3425/v1/systemone"
              aria-label={t('judge.endpoint')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('endpointUrl', event.target.value)}
            />
          </div>
        </div>

        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('judge.model')}</div>
            <div className="dsh-judge-row-hint">{t('judge.modelDesc')}</div>
          </div>
          <div className="dsh-judge-row-field">
            <Input
              type="text"
              className="dsh-judge-field"
              value={state.judgeModel}
              placeholder="future-jev/jev-latest"
              aria-label={t('judge.model')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('judgeModel', event.target.value)}
            />
          </div>
        </div>

        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('judge.key')}</div>
            <div className="dsh-judge-row-hint">
              {withSamples(t('judge.keyDesc'), { ref: JUDGE_API_KEY_REF, path: CREDENTIALS_PATH })}
            </div>
          </div>
          <div className="dsh-judge-row-field">
            {/* 密钥格与上面两格同宽：状态与「删掉」放在输入框下面那一行，
                这样三格的左右边缘对齐。 */}
            <Input
              type="password"
              autoComplete="new-password"
              className="dsh-judge-field"
              value={state.key.text}
              placeholder={state.key.configured ? t('judge.keyPlaceholderSet') : t('judge.keyPlaceholder')}
              aria-label={t('judge.key')}
              disabled={state.key.unavailable}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.key(event.target.value)}
            />
            <div className="dsh-judge-key-line">
              <Tag tone={state.key.configured ? 'success' : 'warning'}>
                {t(state.key.configured ? 'judge.keySet' : 'judge.keyUnset')}
              </Tag>
              {state.key.configured && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={state.key.saving || !state.key.writable}
                  onClick={() => void dispatchCardStore.clearKey()}
                >
                  {t('judge.keyClear')}
                </Button>
              )}
              {state.key.unavailable && <span className="dsh-judge-hint">{t('judge.keyUnavailable')}</span>}
              {state.key.landed === 'saved' && <span className="dsh-judge-note-ok">{t('judge.keySaved')}</span>}
              {state.key.landed === 'cleared' && <span className="dsh-judge-note-ok">{t('judge.keyCleared')}</span>}
              {state.key.failed && (
                <span className="dsh-judge-note-bad" role="alert">
                  {t('judge.keyFailed').replace('{error}', state.key.error || t('save.invalid'))}
                </span>
              )}
            </div>
          </div>
        </div>

        {probeResult !== null && (
          <div className={probeResult.ok ? 'dsh-judge-note-ok' : 'dsh-judge-note-bad'}>
            {probeResult.ok
              ? t('judge.probeOk').replace('{latency}', String(probeResult.latencyMs))
              : t('judge.probeFail').replace('{reason}', reasonText(probeResult.reason))}
          </div>
        )}
        {state.dirty && <div className="dsh-judge-hint">{t('preview.blocked')}</div>}

        {saveRow('judge', state.judgeDirty, () => void dispatchCardStore.save('judge'))}
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-title">{t('rows.title')}</div>
        <div className="dsh-judge-desc">{t('rows.desc')}</div>
        {state.models.length === 0 && <div className="dsh-judge-off">{t('rows.allowedEmpty')}</div>}
        {state.rows.length === 0 && <div className="dsh-judge-desc">{t('rows.empty')}</div>}
        {state.rows.length > 0 && (
          <table className="dsh-judge-table">
            <thead>
              <tr>
                <th className="dsh-judge-col-no">{t('rows.colId')}</th>
                <th>{t('rows.colType')}</th>
                <th className="dsh-judge-col-model">{t('rows.colModel')}</th>
                <th className="dsh-judge-col-effort">{t('rows.colEffort')}</th>
                <th className="dsh-judge-col-actions" />
              </tr>
            </thead>
            <tbody>
              {state.rows.map((draft, index) => row(draft, index))}
            </tbody>
          </table>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => dispatchCardStore.addRow()}>
            {t('rows.add')}
          </Button>
        </div>
        {state.rowsInvalid !== '' && state.rowsDirty && (
          <div className="dsh-judge-note-bad" role="alert">{state.rowsInvalid}</div>
        )}
        {saveRow('rows', state.rowsDirty, saveRows)}
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-title">{t('presets.title')}</div>
        <div className="dsh-judge-desc">{t('presets.desc')}</div>
        <div className="dsh-judge-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="dsh-judge-preset"
              onClick={() => dispatchCardStore.addPreset(t(`preset.${preset.key}.desc` as never))}
            >
              <span className="dsh-judge-preset-title">{t(`preset.${preset.key}` as never)}</span>
              <span className="dsh-judge-preset-hint">
                {t('presets.effortHint').replace('{effort}', t(preset.effortHint as never))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const log = (
    <div className="dsh-judge-panel">
      <div className="dsh-judge-section">
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('log.title')}</span>
          <Button variant="outline" size="sm" onClick={() => void dispatchCardStore.refreshLog()}>
            {t('log.refresh')}
          </Button>
        </div>
        <div className="dsh-judge-desc">{t('log.desc')}</div>
        {state.logFailed && <div className="dsh-judge-note-bad">{t('log.loadFailed')}</div>}
        {state.logLoaded && state.log.length === 0 && (
          <div className="dsh-judge-desc">{t('log.empty')}</div>
        )}
        {state.log.length > 0 && (
          <div className="dsh-judge-log">
            <div className="dsh-judge-log-row dsh-judge-log-head">
              <span>{t('log.colType')}</span>
              <span>{t('log.colModel')}</span>
              <span>{t('log.colEffort')}</span>
              <span>{t('log.colSource')}</span>
              <span>{t('log.colTime')}</span>
              <span>{t('log.colLatency')}</span>
              <span>{t('log.colParent')}</span>
              <span>{t('log.colChild')}</span>
            </div>
            {state.log.map((entry, index) => (
              <button
                key={index}
                type="button"
                className="dsh-judge-log-row"
                onClick={() => setDetail(entry)}
              >
                <span>{entry.typeId ?? '—'}</span>
                <span>{entry.model || '—'}</span>
                <span>{entry.effort || '—'}</span>
                <span>
                  {entry.source === 'judged'
                    ? t('log.sourceJudged').replace('{id}', String(entry.typeId ?? ''))
                    : t('log.sourceInherited').replace('{reason}', reasonText(entry.reason))}
                </span>
                <span>{new Date(entry.at).toLocaleTimeString()}</span>
                <span>{t('ms').replace('{value}', String(entry.latencyMs))}</span>
                <span className="dsh-judge-cell-clip" title={entry.parentTitle}>{entry.parentTitle || '—'}</span>
                <span className="dsh-judge-cell-clip" title={entry.childLabel}>{entry.childLabel || '—'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="dsh-judge-card">
      <SegmentedTabs
        items={[
          { value: 'design' as const, label: t('tab.design'), id: 'judge-tab-design', panelId: 'judge-panel-design' },
          { value: 'log' as const, label: t('tab.log'), id: 'judge-tab-log', panelId: 'judge-panel-log' },
        ]}
        value={tab}
        onChange={setTab}
        label={t('tab.design')}
      />
      {tab === 'design' ? design : log}

      <Modal
        open={refusal !== null}
        onClose={() => setRefusal(null)}
        title={t('save.refusedTitle')}
        closeLabel={t('rows.browseClose')}
      >
        <div className="dsh-judge-note-bad" role="alert">{refusal ?? ''}</div>
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={t('preview.title')}
        closeLabel={t('preview.close')}
        className="dsh-judge-modal"
      >
        <div className="dsh-judge-desc">{t('preview.desc')}</div>
        <CodeBlock code={preview ?? ''} copyLabel={t('preview.copy')} copiedLabel={t('preview.copied')} />
      </Modal>

      <Modal
        open={browsing !== null}
        onClose={() => setBrowsing(null)}
        title={t('rows.browseTitle').replace('{id}', String((browsing ?? 0) + 1))}
        closeLabel={t('rows.browseClose')}
      >
        <div className="dsh-judge-desc" style={{ whiteSpace: 'pre-wrap' }}>
          {browsing === null ? '' : state.rows[browsing]?.description ?? ''}
        </div>
      </Modal>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={t('log.detailTitle')}
        closeLabel={t('log.detailClose')}
      >
        {detail !== null && (
          <div className="dsh-judge-detail">
            <span>{t('log.detailType')}</span>
            <span>{detail.typeId ?? '—'}</span>
            <span>{t('log.detailSource')}</span>
            <span>
              {detail.source === 'judged'
                ? t('log.sourceJudged').replace('{id}', String(detail.typeId ?? ''))
                : t('log.sourceInherited').replace('{reason}', reasonText(detail.reason))}
            </span>
            <span>{t('log.detailReason')}</span>
            <span>{detail.reason === undefined ? '—' : reasonText(detail.reason)}</span>
            <span>{t('log.detailLatency')}</span>
            <span>{t('ms').replace('{value}', String(detail.latencyMs))}</span>
            <span>{t('log.detailParent')}</span>
            <span>{detail.parentTitle || '—'}</span>
            <span>{t('log.detailChild')}</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{detail.childLabel || '—'}</span>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** The client context surface this file uses. */
interface ClientContextLike {
  effect(factory: () => void | (() => void), label?: string): void;
  slots?: {
    inject(name: string, register: () => unknown): () => void;
    register(options: Record<string, unknown>, component: unknown): () => void;
  };
  configForms: {
    get(namespace: string): any;
    whileServed(namespaces: readonly string[], register: (served: ReadonlySet<string>) => () => void): () => void;
  };
  locale?: any;
  remote?: { session?: any; credentials?: CredentialsRemoteLike };
}

/**
 * Bind the card to this plugin's own configuration form, the Host's allowlist,
 * the credentials service, and this plugin's runtime routes, then contribute it
 * to the Plugins page.
 * @param ctx - the browser client context.
 */
export function setupSettingsUi(ctx: ClientContextLike): void {
  if (typeof window === 'undefined') return;
  const t = ctx.locale?.bind?.(NS) ?? ((key: string) => key);
  try {
    dispatchCardStore.attach({
      form: ctx.configForms.get(SETTINGS_NAMESPACE),
      // The Host owns which models a subagent may use; this card only reads it so
      // the plugin never keeps a second list that could drift from it.
      allowedForm: ctx.configForms.get(ALLOWED_MODELS_NAMESPACE),
      session: ctx.remote?.session ?? null,
      remote: createDispatchRemote(),
      // The judgement key is written here; its value never rides a response.
      credentials: ctx.remote?.credentials ?? null,
      t,
    });
  } catch (error) {
    console.warn('[dsh-subagent-judge-dispatch] 配置表单绑定失败：', error);
  }

  // The dictionaries are registered once by the client entry point; the card's
  // seat resolves `t` against them through its `locale: NS` registration above.

  // The card lives on the Plugins page, which declares `plugins.bundle.config`
  // only while its own entry is mounted; `whileServed` additionally ties the
  // contribution to the Host actually serving this plugin's own settings entry.
  ctx.effect(
    () => ctx.configForms.whileServed([SETTINGS_NAMESPACE], () =>
      setupPluginPage(ctx.slots, () =>
        (ctx.slots as NonNullable<ClientContextLike['slots']>).register(
          {
            name: BUNDLE_CONFIG_SLOT,
            key: BUNDLE_CONFIG_KEY,
            locale: NS,
          },
          JudgeDispatchPanel,
        ))),
    'dsh-subagent-judge-dispatch: plugins page config',
  );
}

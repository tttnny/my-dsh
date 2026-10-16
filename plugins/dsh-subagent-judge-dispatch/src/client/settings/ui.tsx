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
  routeKey,
  SETTINGS_NAMESPACE,
  splitRouteKey,
  type LogRow,
  type PageState,
  type TypeRowDraft,
} from './store.ts';
import { NS } from '../locales.ts';

/** Path shown in the key-name hint; the value itself never reaches the page. */
const CREDENTIALS_PATH = '~/.dsh/.credentials.yaml';

/** The ready-made entries, each with the description and effort hint it ships. */
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

/** One localized template with technical samples rendered inline. */
function withSamples(text: string, samples: Record<string, string>): React.ReactNode {
  return text.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{\w+\}$/.test(part) ? part.slice(1, -1) : '';
    const sample = name === '' ? undefined : samples[name];
    return sample === undefined ? part : <code key={index}>{sample}</code>;
  });
}

/** The card's own styles: only the states the Host's controls do not carry. */
const CARD_CSS = `
.dsh-judge-card { display: flex; flex-direction: column; gap: 16px; }
.dsh-judge-panel { display: flex; flex-direction: column; gap: 12px; }
.dsh-judge-section { border: 0; box-shadow: var(--dsw-elevation-soft); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--dsw-alias-bg-layer-2); }
.dsh-judge-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dsh-judge-title { font-weight: 600; }
.dsh-judge-desc { color: var(--dsw-alias-text-secondary); font-size: 12px; line-height: 1.6; }
.dsh-judge-field { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 8px 12px; align-items: start; }
.dsh-judge-field-label { font-size: 12px; padding-top: 6px; }
/* 端点地址是一整条 URL。宿主的 Input 把输入框包在一层 inline-flex 的 span 里，
   类名落在那层 span 上，所以要撑的是它，只给 input 写宽度没用。 */
.dsh-judge-field .dsh-judge-input { display: flex; width: 100%; max-width: 460px; }
.dsh-judge-field .dsh-judge-input input { width: 100%; }
.dsh-judge-row-warn { color: var(--dsw-alias-text-warning); font-size: 12px; }
.dsh-judge-table { display: flex; flex-direction: column; gap: 8px; }
.dsh-judge-record { display: grid; grid-template-columns: 36px minmax(180px, 1fr) 190px 120px auto; gap: 8px; align-items: start; }
.dsh-judge-record input, .dsh-judge-record select { width: 100%; }
.dsh-judge-record-dim { opacity: 0.55; }
.dsh-judge-no { text-align: right; font-variant-numeric: tabular-nums; padding-top: 6px; font-size: 12px; }
.dsh-judge-presets { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-judge-preset { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dsh-judge-preset-hint { font-size: 11px; color: var(--dsw-alias-text-secondary); }
.dsh-judge-actions { display: flex; align-items: center; gap: 10px; }
.dsh-judge-note-ok { color: var(--dsw-alias-text-success); font-size: 12px; }
.dsh-judge-note-bad { color: var(--dsw-alias-text-danger); font-size: 12px; }
.dsh-judge-log { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.dsh-judge-log-row { display: grid; grid-template-columns: 40px 150px 70px 1fr 92px 72px 160px 1fr; gap: 8px; align-items: center; text-align: left; border: 0; background: none; padding: 6px 4px; border-radius: 6px; cursor: pointer; color: inherit; }
.dsh-judge-cell-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-judge-log-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-judge-log-head { font-weight: 600; color: var(--dsw-alias-text-secondary); cursor: default; }
.dsh-judge-log-head:hover { background: none; }
.dsh-judge-detail { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 13px; }
/* 预览里是一整段 JSON，默认的弹窗宽度会把它折得很碎。 */
.dsh-judge-modal { width: min(760px, 100%); max-height: min(85vh, 100%); }
.dsh-judge-incomplete { font-size: 10px; color: var(--dsw-alias-text-warning); }
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
 * Two tabs: the design tab stages every edit and writes them as one batch on
 * save, the log tab reads the Host's runtime log. Nothing is written while the
 * reader types, so a half-finished endpoint can never reach a delegation.
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

  /** 保存被拒时把原因弹出来（第16条要的是弹窗，不是按钮下方一行字）。 */
  const [refusal, setRefusal] = useState<string | null>(null);

  const requestSave = (): void => {
    if (state.invalid !== '') {
      setRefusal(state.invalid);
      return;
    }
    void dispatchCardStore.save();
  };

  const openPreview = async (): Promise<void> => {
    const text = await dispatchCardStore.preview();
    setPreview(text ?? t('preview.failed'));
    setPreviewOpen(true);
  };

  const row = (draft: TypeRowDraft, index: number): React.ReactElement => {
    const efforts = dispatchCardStore.effortsFor(draft);
    const usable = dispatchCardStore.rowUsable(draft);
    // 只有「目录读到了、且这个路由确实声明了档位」时才给下拉；否则自由填写。
    const catalogOffersEffort = state.catalogRead && efforts.length > 0;
    return (
      <div
        key={index}
        className={`dsh-judge-record${usable ? '' : ' dsh-judge-record-dim'}`}
      >
        <div className="dsh-judge-no">
          {index + 1}
          {usable ? null : <div className="dsh-judge-incomplete">{t('rows.incomplete')}</div>}
        </div>
        <Input
          type="text"
          className="dsh-judge-input"
          value={draft.description}
          placeholder={t('rows.descriptionPlaceholder')}
          aria-label={`${t('rows.colDescription')} ${index + 1}`}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            dispatchCardStore.cell(index, 'description', event.target.value)}
        />
        <Menu
          open={openMenu?.index === index && openMenu.kind === 'model'}
          anchor={<Input
            type="text"
            className="dsh-judge-input"
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
          portal
        />
        {/* 目录读得到时，强度是这份可选档位里的一个；读不到（或这个路由没声明档位）
            时退回自由填写——把格子禁掉会让整张表永远填不全，也就永远不再判断任何东西。 */}
        {catalogOffersEffort ? (
          <Menu
            open={openMenu?.index === index && openMenu.kind === 'effort'}
            anchor={<Input
              type="text"
              className="dsh-judge-input"
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
            portal
          />
        ) : (
          <Input
            type="text"
            className="dsh-judge-input"
            value={draft.effort}
            placeholder={t('rows.effortPlaceholder')}
            aria-label={`${t('rows.colEffort')} ${index + 1}`}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              dispatchCardStore.cell(index, 'effort', event.target.value)}
          />
        )}
        <div className="dsh-judge-actions">
          <Button variant="outline" size="sm" onClick={() => setBrowsing(index)}>
            {t('rows.browse')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => dispatchCardStore.removeRow(index)}>
            {t('rows.remove')}
          </Button>
        </div>
      </div>
    );
  };

  const design = (
    <div className="dsh-judge-panel">
      <div className="dsh-judge-section">
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('switch.rewrite.title')}</span>
          <Switch
            checked={state.enabled}
            onChange={(next: boolean) => dispatchCardStore.toggle('enabled', next)}
            label={t('switch.rewrite.title')}
          />
        </div>
        <div className="dsh-judge-desc">{t('switch.rewrite.desc')}</div>
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('switch.log.title')}</span>
          <Switch
            checked={state.logEnabled}
            onChange={(next: boolean) => dispatchCardStore.toggle('logEnabled', next)}
            label={t('switch.log.title')}
          />
        </div>
        <div className="dsh-judge-desc">{t('switch.log.desc')}</div>
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-title">{t('judge.title')}</div>
        <div className="dsh-judge-desc">{t('judge.desc')}</div>
        <div className="dsh-judge-field">
          <div className="dsh-judge-field-label">{t('judge.endpoint')}</div>
          <div>
            <Input
              type="text"
              className="dsh-judge-input"
              value={state.endpointUrl}
              aria-label={t('judge.endpoint')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('endpointUrl', event.target.value)}
            />
            <div className="dsh-judge-desc">{t('judge.endpointDesc')}</div>
          </div>
          <div className="dsh-judge-field-label">{t('judge.model')}</div>
          <div>
            <Input
              type="text"
              className="dsh-judge-input"
              value={state.judgeModel}
              aria-label={t('judge.model')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('judgeModel', event.target.value)}
            />
            <div className="dsh-judge-desc">{t('judge.modelDesc')}</div>
          </div>
          <div className="dsh-judge-field-label">{t('judge.keyRef')}</div>
          <div>
            <Input
              type="text"
              className="dsh-judge-input"
              value={state.apiKeyRef}
              aria-label={t('judge.keyRef')}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('apiKeyRef', event.target.value)}
            />
            <div className="dsh-judge-desc">
              {withSamples(t('judge.keyRefDesc'), { path: CREDENTIALS_PATH })}
            </div>
          </div>
        </div>
        <div className="dsh-judge-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={probing || state.dirty}
            onClick={() => void runProbe()}
          >
            {probing ? t('judge.probing') : t('judge.probe')}
          </Button>
          {state.dirty && <span className="dsh-judge-desc">{t('preview.blocked')}</span>}
          {probeResult !== null && (
            <span className={probeResult.ok ? 'dsh-judge-note-ok' : 'dsh-judge-note-bad'}>
              {probeResult.ok
                ? t('judge.probeOk').replace('{latency}', String(probeResult.latencyMs))
                : t('judge.probeFail').replace('{reason}', reasonText(probeResult.reason))}
            </span>
          )}
        </div>
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-title">{t('rows.title')}</div>
        <div className="dsh-judge-desc">{t('rows.desc')}</div>
        {state.models.length === 0 && <div className="dsh-judge-row-warn">{t('rows.allowedEmpty')}</div>}
        {state.rows.length === 0 && <div className="dsh-judge-desc">{t('rows.empty')}</div>}
        <div className="dsh-judge-table">
          {state.rows.map((draft, index) => row(draft, index))}
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => dispatchCardStore.addRow()}>
            {t('rows.add')}
          </Button>
        </div>
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
              <span>{t(`preset.${preset.key}` as never)}</span>
              <span className="dsh-judge-preset-hint">
                {t('presets.effortHint').replace('{effort}', t(preset.effortHint as never))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('preview.title')}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={state.dirty}
            onClick={() => void openPreview()}
          >
            {t('preview.open')}
          </Button>
        </div>
        <div className="dsh-judge-desc">{t('preview.desc')}</div>
        <div className="dsh-judge-actions">
          {/* 描述缺了或重了时按钮仍可点：按下去由 requestSave 弹窗说明为什么存不了。
              做成 disabled 的话，读者只看到一个点不动的按钮，不知道要改哪里。 */}
          <Button
            variant="primary"
            size="sm"
            disabled={state.saving || !state.dirty || !state.writable}
            onClick={requestSave}
          >
            {state.saving ? t('save.saving') : t('save.button')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={state.saving || !state.dirty}
            onClick={() => dispatchCardStore.revert()}
          >
            {t('save.discard')}
          </Button>
          {state.dirty && <span className="dsh-judge-desc">{t('save.unsaved')}</span>}
        </div>
        {state.invalid !== '' && (
          <div className="dsh-judge-note-bad" role="alert">{state.invalid}</div>
        )}
        {state.saveFailed && (
          <div className="dsh-judge-note-bad" role="alert">
            {t('save.failed').replace('{error}', state.saveError || t('save.invalid'))}
          </div>
        )}
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
  remote?: { session?: any };
}

/**
 * Bind the card to this plugin's own configuration form, the Host's allowlist,
 * and this plugin's runtime routes, then contribute it to the Plugins page.
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

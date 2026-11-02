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
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  BUNDLE_CONFIG_KEY,
  BUNDLE_CONFIG_SLOT,
  setupPluginPage,
} from './plugin-page.ts';
import {
  ALLOWED_MODELS_NAMESPACE,
  createDispatchRemote,
  describeChoice,
  describeModel,
  dispatchCardStore,
  exportRowsJson,
  JUDGE_API_KEY_REF,
  parseRowsJson,
  rowHints,
  type CredentialsRemoteLike,
  routeKey,
  SETTINGS_NAMESPACE,
  splitRouteKey,
  type LogRow,
  type PageState,
  type TypeRowDraft,
} from './store.ts';
import { NS } from '../locales.ts';

/** 导入被拒时那句话的键：三种坏输入各说各的，不在调用处拼键名。 */
const IMPORT_ERROR_KEYS = {
  json: 'rows.importBadJson',
  shape: 'rows.importBadShape',
  empty: 'rows.importEmpty',
} as const;

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
 * One log cell: the text clips to its column, and the whole value is one hover
 * away.
 *
 * The bubble is the Host's `Tooltip`, not a native `title`: the Host's own rule
 * is that a hover surface comes from the primitives package, and the native one
 * cannot be reached by keyboard. It carries `hint` when the cell has something
 * the column itself has no room for — the reason a judgement did not match, or
 * the provider behind a choice cell that shows only model and effort — and the
 * cell's own text otherwise.
 *
 * @param props.text - the value shown in the cell.
 * @param props.hint - extra text the bubble should carry instead of `text`.
 * @returns the cell.
 */
function LogCell({ text, hint }: { text: string; hint?: string }): React.ReactElement {
  const label = hint === undefined || hint === '' ? text : hint;
  return (
    <Tooltip label={label} side="top" portal>
      <span className="dsh-judge-cell-clip">{text}</span>
    </Tooltip>
  );
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
.dsh-judge-card { display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; width: 100%; color: var(--dsw-alias-label-primary); }
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
.dsh-judge-off { display: block; color: var(--dsw-alias-state-warn-label); font: var(--dsw-font-xxxs-11); }
/* 标题行右端的一组动作：试通、导入、导出、加一行都排在这里。 */
.dsh-judge-actions-group { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* 卡片最下面的出口：只有预览这一件跨节的动作，靠右与两节的右边缘对齐。 */
.dsh-judge-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
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
.dsh-judge-col-no { width: 84px; }
.dsh-judge-col-model { width: 188px; }
.dsh-judge-col-effort { width: 124px; }
.dsh-judge-col-actions { width: 96px; }
.dsh-judge-no { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); font-variant-numeric: tabular-nums; }
.dsh-judge-row-off .dsh-judge-field { opacity: 0.6; }
.dsh-judge-cell-actions { display: flex; gap: 6px; }
.dsh-judge-log { display: flex; flex-direction: column; gap: 4px; font: var(--dsw-font-xxs-12); }
/* 六列的宽度按内容定：结果与时间是定长的，选择最长、主代理与子代理各占一份余量。
   minmax(0, …) 是截断的前提——不给下限归零，长内容会把整列撑出去。 */
.dsh-judge-log-row { display: grid; grid-template-columns: 72px minmax(0, 2.2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) 62px 74px; gap: 8px; align-items: center; text-align: left; border: 0; background: none; padding: 6px 4px; border-radius: var(--dsw-radius-sm); cursor: pointer; color: inherit; font: inherit; }
.dsh-judge-cell-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-judge-log-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-judge-log-head { font-weight: 600; color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-judge-log-head:hover { background: none; }
/* 弹窗里是一整段请求体：量宽放开，正文自己换行，高了就在框里滚动——撑到弹窗
   外面的内容既看不见也滚不到。滚动条的两种颜色跟着弹窗这层表面走。 */
.dsh-judge-modal { width: min(760px, 100%); max-height: min(85vh, 100%); --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
.dsh-judge-prompt { max-height: 58vh; overflow: auto; }
.dsh-judge-prompt pre { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
/* 粘贴框：等宽显示，好让读者看出 JSON 的层级；自己撑高到一屏的一半再滚动。 */
.dsh-judge-paste { box-sizing: border-box; width: 100%; min-height: 220px; max-height: 45vh; resize: vertical; padding: 10px 12px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: var(--dsw-font-markdown-code-block); }
.dsh-judge-paste:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary); }
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
  // 两个归属键缺一不可：client-modules 按 `data-plugin` 在卸载与换代码时整表清掉，
  // 没打键的表会一直叠在页面上（docs/rules/plugin-ui.md「样式在 apply() 里注入」）。
  element.dataset.plugin = PLUGIN_NAME;
  element.dataset.pluginCss = `${PLUGIN_NAME}/settings/ui`;
  element.textContent = CARD_CSS;
  document.head.appendChild(element);
}

/** DOM id of this card's stylesheet, so a remount does not append a second one. */
const STYLE_ID = 'dsh-subagent-judge-dispatch-styles';

/** 本插件的包名，用作样式表的归属键。 */
const PLUGIN_NAME = '@lynn123411/dsh-subagent-judge-dispatch';

/**
 * This plugin's configuration card inside the DSH **Plugins** page.
 *
 * Two tabs. The design tab holds two sections — the judgement service, and the
 * task-type table — and neither has a save button: a text field writes when
 * focus leaves it, a switch and a row action write the moment they are used, and
 * a failed write is reported at the bottom of the section that attempted it. The
 * log tab reads the Host's runtime log.
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
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; latencyMs: number; reason?: string } | null>(null);
  const [detail, setDetail] = useState<LogRow | null>(null);
  /** Which row's dropdown is open, and which of the two. */
  const [openMenu, setOpenMenu] = useState<{ index: number; kind: 'model' | 'effort' } | null>(null);
  /** The paste box for importing a task-type list; null when it is closed. */
  const [importText, setImportText] = useState<string | null>(null);
  /** Why the last import attempt was refused, or ''. */
  const [importError, setImportError] = useState('');
  /** What the last export did, shown until the next action. */
  const [copyNote, setCopyNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setState(dispatchCardStore.getState());
    const unsubscribe = dispatchCardStore.subscribe(() => setState(dispatchCardStore.getState()));
    return () => {
      unsubscribe();
      // 离开插件页时同样先写：卡片卸载之后没有人再替这几格提交。
      void dispatchCardStore.flush();
    };
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

  const openPreview = async (): Promise<void> => {
    const text = await dispatchCardStore.preview();
    setPreview(text ?? t('preview.failed'));
    setPreviewOpen(true);
  };

  /** Copy the task-type list out as plain JSON. */
  const exportRows = async (): Promise<void> => {
    const copied = await writeClipboard(exportRowsJson(state.rows));
    setCopyNote({ ok: copied, text: t(copied ? 'rows.exported' : 'rows.exportFailed') });
  };

  /** Open the paste box, empty and with no leftover complaint. */
  const openImport = (): void => {
    setImportText('');
    setImportError('');
    setCopyNote(null);
  };

  /** Read the pasted list into the table and write it; the dialog's button is the confirmation. */
  const applyImport = (): void => {
    const result = parseRowsJson(importText ?? '');
    if (!result.ok) {
      setImportError(t(IMPORT_ERROR_KEYS[result.error] as never));
      return;
    }
    dispatchCardStore.replaceRows(result.rows);
    setImportText(null);
    setImportError('');
  };

  /** 这一节最后一次写入没落地时，就地说明；两节各报各的。 */
  const failure = (section: 'judge' | 'rows'): React.ReactElement | null => (
    state.saveFailed === section && state.saveError !== ''
      ? (
        <div className="dsh-judge-note-bad" role="alert">
          {t('save.failed').replace('{error}', state.saveError)}
        </div>
      )
      : null
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
          {rowHints(state.rows, index, t).map((hint) => (
            <span key={hint} className="dsh-judge-off">{hint}</span>
          ))}
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
            onBlur={() => void dispatchCardStore.commit('rows')}
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
              void dispatchCardStore.commit('rows');
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
                void dispatchCardStore.commit('rows');
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
              onBlur={() => void dispatchCardStore.commit('rows')}
            />
          )}
        </td>
        <td className="dsh-judge-col-actions">
          <div className="dsh-judge-cell-actions">
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
          {/* 试通问的是「这份设置现在能不能用」，与这一节的写入无关：它只读已落地的值，
              所以写入还在路上时先不给按。 */}
          <Button
            variant="outline"
            size="sm"
            disabled={probing || state.saving !== ''}
            onClick={() => void runProbe()}
          >
            {probing ? t('judge.probing') : t('judge.probe')}
          </Button>
        </div>
        <div className="dsh-judge-desc">{t('judge.desc')}</div>

        {/* 开关拨了就是一次完整的决定，所以它当场写入；下面几格是文字，离开输入框才写。 */}
        <div className="dsh-judge-row">
          <div className="dsh-judge-row-info">
            <div className="dsh-judge-row-title">{t('switch.rewrite.title')}</div>
            <div className="dsh-judge-row-hint">{t('switch.rewrite.desc')}</div>
          </div>
          <Switch
            checked={state.enabled}
            onChange={(next: boolean) => dispatchCardStore.toggle('enabled', next)}
            label={t('switch.rewrite.title')}
            disabled={!state.writable}
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
            disabled={!state.writable}
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
              disabled={!state.writable}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('endpointUrl', event.target.value)}
              onBlur={() => void dispatchCardStore.commit('judge')}
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
              disabled={!state.writable}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.field('judgeModel', event.target.value)}
              onBlur={() => void dispatchCardStore.commit('judge')}
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
              disabled={state.key.unavailable || !state.writable}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                dispatchCardStore.key(event.target.value)}
              onBlur={() => void dispatchCardStore.commit('judge')}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void dispatchCardStore.commit('judge');
              }}
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

        {failure('judge')}
      </div>

      <div className="dsh-judge-section">
        <div className="dsh-judge-head">
          <span className="dsh-judge-title">{t('rows.title')}</span>
          {/* 三件都是整张表的动作：导入与导出是同一份清单的两个方向，加一行是往表尾续一条。 */}
          <div className="dsh-judge-actions-group">
            <Button variant="outline" size="sm" onClick={openImport}>
              {t('rows.importOpen')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportRows()}>
              {t('rows.export')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => dispatchCardStore.addRow()}>
              {t('rows.add')}
            </Button>
          </div>
        </div>
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
        {failure('rows')}
        {copyNote !== null && (
          <div className={copyNote.ok ? 'dsh-judge-note-ok' : 'dsh-judge-note-bad'} role="status">
            {copyNote.text}
          </div>
        )}
      </div>

      {/* 预览问的是这一整份设置存下去会发给判断服务什么：它同时用到判断模型与类型清单，
          哪一节都不独占，所以单独排在两节之外。 */}
      <div className="dsh-judge-footer">
        <Button variant="outline" size="sm" onClick={() => void openPreview()}>
          {t('preview.open')}
        </Button>
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
              <span>{t('log.colResult')}</span>
              <span>{t('log.colChoice')}</span>
              <span>{t('log.colParent')}</span>
              <span>{t('log.colChild')}</span>
              <span>{t('log.colTime')}</span>
              <span>{t('log.colLatency')}</span>
            </div>
            {state.log.map((entry, index) => {
              // 判成了写类型编号；没判成就写「未判成」，原因留给悬停——那一列宽度
              // 是给编号留的，塞一段原因会把六列的宽度全挤歪。
              const result = entry.typeId === null
                ? {
                  text: t('log.resultInherited'),
                  hint: entry.reason === undefined ? '' : reasonText(entry.reason),
                }
                : { text: t('log.resultJudged').replace('{id}', String(entry.typeId)), hint: '' };
              return (
                <button
                  key={index}
                  type="button"
                  className="dsh-judge-log-row"
                  onClick={() => setDetail(entry)}
                >
                  <LogCell text={result.text} hint={result.hint} />
                  <LogCell text={describeModel(entry) || '—'} hint={describeChoice(entry)} />
                  <LogCell text={entry.parentTitle || '—'} />
                  <LogCell text={entry.childLabel || '—'} />
                  <span>{new Date(entry.at).toLocaleTimeString()}</span>
                  <span>{t('ms').replace('{value}', String(entry.latencyMs))}</span>
                </button>
              );
            })}
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
        onChange={(next) => {
          // 切走之前先把还没失焦的那一格写下去：自动保存不留「明明填了却没存」的死角。
          void dispatchCardStore.flush();
          setTab(next);
        }}
        label={t('tab.design')}
      />
      {tab === 'design' ? design : log}

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={t('preview.title')}
        closeLabel={t('preview.close')}
        className="dsh-judge-modal"
      >
        <div className="dsh-judge-desc">{t('preview.desc')}</div>
        <div className="dsh-judge-prompt">
          <CodeBlock code={preview ?? ''} copyLabel={t('preview.copy')} copiedLabel={t('preview.copied')} />
        </div>
      </Modal>

      {/* 导入只收粘贴：这一步不读文件、不联网，读者看到的和用进去的是同一段文本。 */}
      <Modal
        open={importText !== null}
        onClose={() => setImportText(null)}
        title={t('rows.importTitle')}
        closeLabel={t('rows.importCancel')}
        description={t('rows.importDesc')}
        className="dsh-judge-modal"
        footer={(
          <>
            <Button variant="outline" size="sm" onClick={() => setImportText(null)}>
              {t('rows.importCancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={applyImport}>
              {t('rows.importApply')}
            </Button>
          </>
        )}
      >
        <textarea
          className="dsh-judge-paste"
          value={importText ?? ''}
          aria-label={t('rows.importTitle')}
          placeholder={t('rows.importPlaceholder')}
          spellCheck={false}
          data-modal-autofocus
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setImportText(event.target.value);
            setImportError('');
          }}
        />
        {importError !== '' && <div className="dsh-judge-note-bad" role="alert">{importError}</div>}
      </Modal>

      {/* 判断详情这一处只回答一个问题：这次到底发给判断模型什么。行上那几列已经写清了
          结果、选择、谁派的活、耗时，弹窗再列一遍只是把同一件事说两次。 */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={t('log.promptTitle')}
        closeLabel={t('log.promptClose')}
        description={t('log.promptDesc')}
        className="dsh-judge-modal"
      >
        {detail !== null && (detail.prompt === ''
          ? <div className="dsh-judge-desc">{t('log.promptEmpty')}</div>
          : <div className="dsh-judge-prompt">
            <CodeBlock
              code={detail.prompt}
              copyLabel={t('preview.copy')}
              copiedLabel={t('preview.copied')}
            />
          </div>)}
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

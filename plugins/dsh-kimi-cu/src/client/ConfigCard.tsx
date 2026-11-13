import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { DoctorCheck, InstallPlan } from '../shared/status.ts';
import type { UpdateCheck, UpdateFailureKind, UpdateStage } from '../shared/update.ts';
import { NS } from './locales.ts';
import { fetchStatus, type StatusResult } from './status-remote.ts';
import { fetchUpdateCheck, startUpdate as runUpdate, type UpdateCheckResult } from './update-remote.ts';

/** 座位给的取词。 */
type ConfigCardProps = PropsLocale<typeof NS>;

/** 卡片的一次加载状态。 */
type CardState = { kind: 'loading' } | StatusResult;

/** 更新检查的状态：还没查完、查到了、查不到。 */
type UpdateState =
  | { kind: 'checking' }
  | { kind: 'ready'; check: UpdateCheck }
  | { kind: 'unavailable'; message: string };

/** 一次更新的执行状态。 */
type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; stage: UpdateStage }
  | { kind: 'done'; upToDate: boolean; version: string | null; reconnect: 'done' | 'failed' | 'skipped' }
  | { kind: 'failed'; failure: UpdateFailureKind; raw: string };

/** 状态附注到文案键的映射；未知附注不渲染。 */
const NOTE_KEYS: Record<string, string> = {
  'legacy-install': 'note.legacy-install',
  'override-missing': 'note.override-missing',
  'mcp-command-missing': 'note.mcp-command-missing',
  'detection-failed': 'note.detection-failed',
};

/** doctor 检查 id 到文案键的映射；未知项直接显示原始标签。 */
const CHECK_KEYS: Record<string, string> = {
  accessibility: 'check.accessibility',
  'screen-recording': 'check.screen-recording',
  skylight: 'check.skylight',
  'bg-input': 'check.bg-input',
  'signed-keyboard': 'check.signed-keyboard',
  mcp: 'check.mcp',
};

/**
 * 取一条检查项的显示名。
 * @param tr - 字符串取词（动态键用）。
 * @param check - doctor 检查项。
 * @returns 显示名。
 */
function checkLabel(tr: (key: string) => string, check: DoctorCheck): string {
  const key = CHECK_KEYS[check.id];
  return key === undefined ? check.label : tr(key);
}

/**
 * 把一次检查结果转成卡片状态。
 * @param result - 检查结果。
 * @returns 更新检查状态。
 */
function toUpdateState(result: UpdateCheckResult): UpdateState {
  return result.kind === 'ok'
    ? { kind: 'ready', check: result.check }
    : { kind: 'unavailable', message: result.message };
}

/**
 * 按界面语言选官方文档地址。
 * @param install - 当前平台的安装计划。
 * @returns 文档 URL。
 */
function docsUrl(install: InstallPlan): string {
  const language = typeof navigator === 'undefined' ? 'en' : navigator.language.toLowerCase();
  return language.startsWith('zh') ? install.docsUrl : install.docsUrlEn;
}

/**
 * 插件页上的 KimiCU 状态卡。
 *
 * 每一行都是「标签 | 内容 | 动作」三列：状态、版本、路径、更新各自成行，动作永远在最右列，
 * 说明文字跟着它那一行，不再是一列从上到下堆着的散句。
 * @param props - 座位给的 t。
 * @returns 卡片的元素树。
 */
export function ConfigCard(props: ConfigCardProps): ReactElement {
  const { t } = props;
  const tr = t as unknown as (key: string) => string;
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [update, setUpdate] = useState<UpdateState>({ kind: 'checking' });
  const [run, setRun] = useState<RunState>({ kind: 'idle' });

  const loadUpdate = (): void => {
    setUpdate({ kind: 'checking' });
    void fetchUpdateCheck().then((result) => setUpdate(toUpdateState(result)));
  };

  useEffect(() => {
    let alive = true;
    void fetchStatus(false).then((result) => {
      if (alive) setState(result);
    });
    void fetchUpdateCheck().then((result) => {
      if (!alive) return;
      setUpdate(toUpdateState(result));
    });
    return () => {
      alive = false;
    };
  }, []);

  const recheck = (): void => {
    setState({ kind: 'loading' });
    setCopied(false);
    setCopyFailed(false);
    setRun({ kind: 'idle' });
    loadUpdate();
    void fetchStatus(true).then((result) => setState(result));
  };

  const copy = (command: string): void => {
    setCopyFailed(false);
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setCopyFailed(true);
      return;
    }
    void clipboard.writeText(command).then(
      () => setCopied(true),
      () => setCopyFailed(true),
    );
  };

  const updateNow = (): void => {
    setRun({ kind: 'running', stage: 'checking' });
    void runUpdate((event) => {
      if (event.type === 'stage') {
        setRun({ kind: 'running', stage: event.stage });
        return;
      }
      if (event.type === 'error') {
        setRun({ kind: 'failed', failure: event.kind, raw: event.raw });
        return;
      }
      setRun({ kind: 'done', upToDate: event.upToDate, version: event.version, reconnect: event.reconnect });
      void fetchStatus(true).then((result) => setState(result));
      loadUpdate();
    }).then((outcome) => {
      if (!outcome.ok) setRun({ kind: 'failed', failure: 'unknown', raw: outcome.message ?? '' });
    });
  };

  if (state.kind === 'loading') {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-hint">{t('status.loading')}</div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-row">
          <div className="dsh-kimi-cu-label">{t('status.state')}</div>
          <div className="dsh-kimi-cu-value">
            <div className="dsh-kimi-cu-hint dsh-kimi-cu-error">{t('status.error')}</div>
          </div>
          <div className="dsh-kimi-cu-control">
            <Button variant="outline" size="sm" onClick={recheck}>{t('status.retry')}</Button>
          </div>
        </div>
      </div>
    );
  }

  const status = state.status;

  if (!status.supported) {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-hint">{t('status.unsupported')}</div>
      </div>
    );
  }

  const install = status.install;
  const docs = install === null ? null : docsUrl(install);
  const legacy = status.notes.includes('legacy-install');
  const commandMissing = status.notes.includes('mcp-command-missing');
  const doctorFailed = status.installed && status.doctor.ran && !status.doctor.ok;
  const notReady = doctorFailed || (status.installed && commandMissing);
  const showInstall = !status.installed || legacy || commandMissing;
  const badge = !status.installed
    ? t('status.missing.title')
    : notReady
      ? t('status.notReady.title')
      : t('status.ready.title');

  const updateHint = ((): string => {
    if (run.kind === 'running') return tr('update.stage.' + run.stage);
    if (run.kind === 'failed') return tr('update.failed.' + run.failure);
    if (run.kind === 'done') {
      if (run.upToDate || run.version === null) return t('update.hint.latest');
      return t('update.done') + ' ' + run.version;
    }
    if (update.kind === 'checking') return t('update.hint.checking');
    if (update.kind === 'unavailable') return t('update.hint.unavailable');
    return update.check.hasUpdate ? t('update.hint.available') : t('update.hint.latest');
  })();

  const updateLabel = ((): string => {
    if (run.kind === 'running') return t('update.running');
    if (run.kind === 'failed') return t('status.retry');
    if (run.kind === 'done') return t('update.latest');
    if (update.kind === 'ready') {
      return update.check.hasUpdate
        ? t('update.to') + ' ' + (update.check.latest ?? '')
        : t('update.latest');
    }
    if (update.kind === 'unavailable') return t('update.action');
    return t('update.check');
  })();

  const updateDisabled = run.kind === 'running'
    || run.kind === 'done'
    || update.kind === 'checking'
    || (update.kind === 'ready' && !update.check.hasUpdate);
  // 清单读不到时也允许点：macOS 会交给 KimiCU 自己判断，Windows 会报网络错误。
  const updateAction = update.kind === 'ready' && !update.check.hasUpdate ? loadUpdate : updateNow;

  return (
    <div className="dsh-kimi-cu-card">
      <div className="dsh-kimi-cu-row">
        <div className="dsh-kimi-cu-label">{t('status.state')}</div>
        <div className="dsh-kimi-cu-value">
          <Tag tone={!status.installed || notReady ? 'danger' : 'info'}>{badge}</Tag>
          {status.installed ? null : <div className="dsh-kimi-cu-hint">{t('status.missing.hint')}</div>}
          {status.installed && !notReady && !legacy ? (
            <div className="dsh-kimi-cu-hint">{t('status.ready.hint')}</div>
          ) : null}
          {status.notes.map((note) => (
            NOTE_KEYS[note] === undefined
              ? null
              : <div key={note} className="dsh-kimi-cu-hint">{tr(NOTE_KEYS[note])}</div>
          ))}
        </div>
        <div className="dsh-kimi-cu-control">
          <Button variant="ghost" size="sm" disabled={run.kind === 'running'} onClick={recheck}>
            {t('status.recheck')}
          </Button>
        </div>
      </div>

      {status.installed ? (
        <>
          <div className="dsh-kimi-cu-row">
            <div className="dsh-kimi-cu-label">{t('status.version')}</div>
            <div className="dsh-kimi-cu-value">{status.version ?? '—'}</div>
          </div>
          {status.path === null ? null : (
            <div className="dsh-kimi-cu-row">
              <div className="dsh-kimi-cu-label">{t('status.path')}</div>
              <div className="dsh-kimi-cu-value dsh-kimi-cu-path">{status.path}</div>
            </div>
          )}
          <div className="dsh-kimi-cu-row">
            <div className="dsh-kimi-cu-label">{t('update.label')}</div>
            <div className="dsh-kimi-cu-value">
              <div className={run.kind === 'failed' ? 'dsh-kimi-cu-hint dsh-kimi-cu-error' : 'dsh-kimi-cu-hint'}>
                {updateHint}
              </div>
              {run.kind === 'done' && run.reconnect === 'failed' ? (
                <div className="dsh-kimi-cu-hint">{t('update.reconnectFailed')}</div>
              ) : null}
            </div>
            <div className="dsh-kimi-cu-control">
              <Button variant="outline" size="sm" disabled={updateDisabled} onClick={updateAction}>
                {updateLabel}
              </Button>
            </div>
          </div>
          {run.kind === 'failed' ? (
            <div className="dsh-kimi-cu-row">
              <div className="dsh-kimi-cu-label" />
              <div className="dsh-kimi-cu-span">
                <details className="dsh-kimi-cu-raw">
                  <summary>{t('update.raw')}</summary>
                  <pre className="dsh-kimi-cu-command"><code>{run.raw}</code></pre>
                </details>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {notReady ? (
        <div className="dsh-kimi-cu-row">
          <div className="dsh-kimi-cu-label">{t('status.checks')}</div>
          <div className="dsh-kimi-cu-span">
            <div className="dsh-kimi-cu-hint">{t('status.notReady.hint')}</div>
            {status.doctor.checks.length === 0 ? null : (
              <ul className="dsh-kimi-cu-checks">
                {status.doctor.checks.map((check) => (
                  <li key={check.id} className={check.ok ? 'dsh-kimi-cu-check-ok' : 'dsh-kimi-cu-check-bad'}>
                    <span>{check.ok ? '✅' : '❌'}</span>
                    <span>{checkLabel(tr, check)}</span>
                  </li>
                ))}
              </ul>
            )}
            {doctorFailed ? (
              <div className="dsh-kimi-cu-hint">
                {status.platform === 'darwin' ? t('fix.macos') : t('fix.windows')}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showInstall && install !== null ? (
        <div className="dsh-kimi-cu-row">
          <div className="dsh-kimi-cu-label">{t('status.install')}</div>
          <div className="dsh-kimi-cu-span">
            <pre className="dsh-kimi-cu-command"><code>{install.command}</code></pre>
            <div className="dsh-kimi-cu-actions">
              <Button variant="outline" size="sm" onClick={() => copy(install.command)}>
                {copied ? t('status.copied') : t('status.copy')}
              </Button>
              {docs === null ? null : (
                <a className="dsh-kimi-cu-link" href={docs} target="_blank" rel="noreferrer">
                  {t('status.docs')}
                </a>
              )}
            </div>
            {copyFailed ? <div className="dsh-kimi-cu-hint">{t('status.copyFailed')}</div> : null}
            <ol className="dsh-kimi-cu-steps">
              {install.steps.map((step) => <li key={step}>{tr('step.' + step)}</li>)}
            </ol>
          </div>
        </div>
      ) : (
        <div className="dsh-kimi-cu-row">
          <div className="dsh-kimi-cu-label">{t('status.docs.label')}</div>
          <div className="dsh-kimi-cu-span">
            {docs === null ? null : (
              <a className="dsh-kimi-cu-link" href={docs} target="_blank" rel="noreferrer">
                {t('status.docs')}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

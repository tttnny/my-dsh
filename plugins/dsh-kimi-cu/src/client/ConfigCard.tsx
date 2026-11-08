import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import type { DoctorCheck, InstallPlan } from '../shared/status.ts';
import { NS } from './locales.ts';
import { fetchStatus, type StatusResult } from './status-remote.ts';

/** 座位给的取词。 */
type ConfigCardProps = PropsLocale<typeof NS>;

/** 卡片的一次加载状态。 */
type CardState = { kind: 'loading' } | StatusResult;

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
 * 按界面语言选官方文档地址。
 * @param install - 当前平台的安装计划。
 * @returns 文档 URL。
 */
function docsUrl(install: InstallPlan): string {
  const language = typeof navigator === 'undefined' ? 'en' : navigator.language.toLowerCase();
  return language.startsWith('zh') ? install.docsUrl : install.docsUrlEn;
}

/**
 * 插件页上的 KimiCU 状态卡：检测结果、安装命令、复制与重新检测。
 *
 * 卡片只给命令与检测，不执行安装脚本；安装后的连接恢复由用户按提示开关插件完成。
 * @param props - 座位给的 t。
 * @returns 卡片的元素树。
 */
export function ConfigCard(props: ConfigCardProps): ReactElement {
  const { t } = props;
  const tr = t as unknown as (key: string) => string;
  const [state, setState] = useState<CardState>({ kind: 'loading' });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchStatus(false).then((result) => {
      if (alive) setState(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const recheck = (): void => {
    setState({ kind: 'loading' });
    setCopied(false);
    setCopyFailed(false);
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

  if (state.kind === 'loading') {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-note">{t('status.loading')}</div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-note">{t('status.error')}</div>
        <div className="dsh-kimi-cu-actions">
          <Button variant="outline" size="sm" onClick={recheck}>{t('status.retry')}</Button>
        </div>
      </div>
    );
  }

  const status = state.status;

  if (!status.supported) {
    return (
      <div className="dsh-kimi-cu-card">
        <div className="dsh-kimi-cu-note">{t('status.unsupported')}</div>
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

  return (
    <div className="dsh-kimi-cu-card">
      <div className="dsh-kimi-cu-head">
        <Tag tone={!status.installed || notReady ? 'danger' : 'info'}>{badge}</Tag>
        <Button variant="ghost" size="sm" onClick={recheck}>{t('status.recheck')}</Button>
      </div>

      {status.installed ? (
        <div className="dsh-kimi-cu-meta">
          {status.version === null ? null : <span>{t('status.version')}: {status.version}</span>}
          {status.path === null ? null : <span className="dsh-kimi-cu-path">{t('status.path')}: {status.path}</span>}
        </div>
      ) : (
        <div className="dsh-kimi-cu-note">{t('status.missing.hint')}</div>
      )}

      {status.notes.map((note) => (
        NOTE_KEYS[note] === undefined
          ? null
          : <div key={note} className="dsh-kimi-cu-note">{tr(NOTE_KEYS[note])}</div>
      ))}

      {notReady ? (
        <div className="dsh-kimi-cu-section">
          <div className="dsh-kimi-cu-note">{t('status.notReady.hint')}</div>
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
            <div className="dsh-kimi-cu-note">
              {status.platform === 'darwin' ? t('fix.macos') : t('fix.windows')}
            </div>
          ) : null}
        </div>
      ) : null}

      {status.installed && !notReady && !legacy ? (
        <div className="dsh-kimi-cu-note">{t('status.ready.hint')}</div>
      ) : null}

      {showInstall && install !== null ? (
        <div className="dsh-kimi-cu-section">
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
          {copyFailed ? <div className="dsh-kimi-cu-note">{t('status.copyFailed')}</div> : null}
          <ol className="dsh-kimi-cu-steps">
            {install.steps.map((step) => <li key={step}>{tr('step.' + step)}</li>)}
          </ol>
        </div>
      ) : (
        <div className="dsh-kimi-cu-actions">
          {docs === null ? null : (
            <a className="dsh-kimi-cu-link" href={docs} target="_blank" rel="noreferrer">
              {t('status.docs')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

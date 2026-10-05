import { useState, useEffect } from 'react';
import * as React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  settingsStore,
  SETTINGS_NAMESPACE,
  TRANSLATE_API_KEY_REF,
  type ClientSettingsState,
} from './store.ts';
import { SETTINGS_CSS } from './styles.ts';
import { NS, en, zh } from '../locales.ts';
import { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, setupPluginPage } from './plugin-page.ts';
let stylesInjected = false;
function ensureSettingsStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.tidySettings = 'true';
  el.textContent = SETTINGS_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}

/** Path the credentials Remote API persists the key to (technical sample). */
const CREDENTIALS_PATH = '~/.dsh/.credentials.yaml';

/**
 * Render a localized template whose `{name}` markers carry technical samples
 * (paths, env refs, endpoints, model ids). The samples stay at the render site,
 * so the dictionaries hold prose only.
 * @param text - the localized template, still carrying its `{name}` markers.
 * @param samples - marker name to the literal sample, rendered as inline code.
 * @returns The template with every resolved marker replaced by `<code>`.
 */
function withSamples(text: string, samples: Record<string, string>): React.ReactNode {
  return text.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{\w+\}$/.test(part) ? part.slice(1, -1) : '';
    const sample = name === '' ? undefined : samples[name];
    return sample === undefined ? part : <code key={index}>{sample}</code>;
  });
}

/**
 * Chat-translate's own configuration page inside the DSH **Plugins** page.
 *
 * The host's Plugins page owns per-plugin configuration: it draws the icon, the
 * title and the crumb, and renders a `plugins.bundle.config` entry ON the
 * bundle's own page, under its description and above its rows. The card keeps
 * its own chrome — the switches, the credential form, the section order — so the
 * move from the Settings page changed where it is reached from, not what it does.
 * @param props - renderer-bound seat of the `plugins.bundle.config` slot: the
 * `view` asked for plus the `t` seat its `locale: NS` registration injects.
 * @returns The card element.
 */
export function TidySettingsPanel(
  props: PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS>
): React.ReactElement {
  const { t } = props;
  ensureSettingsStyles();

  const [state, setState] = useState<ClientSettingsState>(() => settingsStore.getState());
  const [testing, setTesting] = useState<{ channel: string; running: boolean; ok?: boolean; message?: string } | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    return settingsStore.subscribe(() => {
      setState(settingsStore.getState());
    });
  }, []);

  const runTest = async (channel: string): Promise<void> => {
    setTesting({ channel, running: true });
    const res = await settingsStore.testChannel(channel);
    const message = res.ok
      ? t('testOk').replace('{latency}', String(res.latencyMs))
      : t('testFail').replace('{error}', res.error || t('unknownError'));
    setTesting({ channel, running: false, ok: res.ok, message });
  };

  const handleSaveKey = async (): Promise<void> => {
    setSavingKey(true);
    setKeyMsg(null);
    const res = await settingsStore.saveApiKey(apiKeyInput);
    setSavingKey(false);
    if (res.ok) {
      const cleared = !apiKeyInput.trim();
      setKeyMsg({
        ok: true,
        text: cleared
          ? t('keyCleared')
          : t('keySaved').replace('{home}', CREDENTIALS_PATH),
      });
      setApiKeyInput('');
    } else {
      setKeyMsg({
        ok: false,
        text: t('saveFailed').replace('{error}', res.error || t('unknownError')),
      });
    }
  };

  return (
    <div className="dsh-tidy-settings">
      {/* 1. 总开关 */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-title">
          <span>{t('masterTitle')}</span>
          <Switch
            checked={state.enabled}
            onChange={(next: boolean) => settingsStore.update({ enabled: next })}
            label={t('enableTranslation')}
          />
        </div>
        <div className="dsh-tidy-desc">
          {withSamples(t('masterDesc'), { example: 'I traced the failing path to a stale lock file.' })}
        </div>
      </div>

      {state.enabled && (
        <>
          {/* 2. AI 通道 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-title">
              <span>{t('aiTitle')}</span>
              <Tag tone={state.aiConfigured ? 'success' : 'warning'}>
                {t(state.aiConfigured ? 'badgeConfigured' : 'badgeUnconfigured')}
              </Tag>
            </div>
            <div className="dsh-tidy-desc">{t('aiRule')}</div>

            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">{t('apiKeyTitle')}</div>
                <div className="dsh-tidy-row-desc">
                  {withSamples(t('apiKeyDesc'), {
                    home: CREDENTIALS_PATH,
                    ref: TRANSLATE_API_KEY_REF,
                  })}
                </div>
              </div>
              <div className="dsh-tidy-input-row">
                <Input
                  type="password"
                  className="dsh-tidy-field-wide"
                  placeholder={state.aiConfigured ? t('apiKeyPlaceholderConfigured') : 'sk-...'}
                  value={apiKeyInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyInput(e.target.value)}
                  aria-label={t('apiKeyTitle')}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={savingKey}
                  onClick={handleSaveKey}
                >
                  {savingKey ? t('saving') : t('save')}
                </Button>
              </div>
            </div>
            {keyMsg && (
              <div className={`dsh-tidy-test-result ${keyMsg.ok ? 'ok' : 'fail'}`}>{keyMsg.text}</div>
            )}

            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">{t('baseUrlTitle')}</div>
                <div className="dsh-tidy-row-desc">
                  {withSamples(t('baseUrlDesc'), {
                    url1: 'https://api.openai.com/v1',
                    url2: 'https://api.deepseek.com/v1',
                  })}
                </div>
              </div>
              <Input
                type="text"
                className="dsh-tidy-field-wide"
                placeholder="https://api.openai.com/v1"
                value={state.baseUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  settingsStore.update({ baseUrl: e.target.value })
                }
                aria-label={t('baseUrlTitle')}
              />
            </div>
            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">{t('modelTitle')}</div>
                <div className="dsh-tidy-row-desc">
                  {withSamples(t('modelDesc'), {
                    model1: 'gpt-4o-mini',
                    model2: 'deepseek-chat',
                  })}
                </div>
              </div>
              <Input
                type="text"
                className="dsh-tidy-field-wide"
                placeholder="gpt-4o-mini"
                value={state.model}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  settingsStore.update({ model: e.target.value })
                }
                aria-label={t('modelTitle')}
              />
            </div>
            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">{t('timeoutTitle')}</div>
                <div className="dsh-tidy-row-desc">{t('timeoutDesc')}</div>
              </div>
              <Input
                type="number"
                className="dsh-tidy-field-timeout"
                min={500}
                max={900000}
                step={1000}
                value={state.aiTimeoutMs}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val)) return;
                  settingsStore.update({
                    aiTimeoutMs: Math.min(Math.max(val, 500), 900000),
                  });
                }}
                aria-label={t('timeoutTitle')}
              />
            </div>

            <div className="dsh-tidy-row">
              <Button
                variant="outline"
                size="sm"
                disabled={testing?.running}
                onClick={() => runTest('openai')}
              >
                {testing?.running ? t('testing') : t('test')}
              </Button>
              {testing?.channel === 'openai' && !testing.running && (
                <span className={`dsh-tidy-test-result ${testing.ok ? 'ok' : 'fail'}`}>{testing.message}</span>
              )}
            </div>
          </div>

          {/* 3. 行为说明 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-row-title">{t('behaviorTitle')}</div>
            <div className="dsh-tidy-desc">{t('behaviorRule')}</div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bind the settings store to this plugin's own configuration form and the
 * credentials Remote API, then contribute this plugin's configuration page to
 * the DSH **Plugins** page.
 * @param ctx - DSH browser client context.
 */
export function setupSettingsUi(ctx: any): void {
  if (typeof window === 'undefined') return;

  // Ride DSH's shared configuration forms: `ctx.configForms.get(<profile entry
  // id>)` is the read/write face of THIS plugin's own Config schema — it
  // mirrors the Host's config section for the entry and folds every accepted
  // write back. `remote.credentials` writes the API key. There is no custom
  // config HTTP endpoint and no per-namespace settings scope.
  const configForms = ctx.configForms;
  const remoteCredentials = ctx.remote?.credentials ?? null;
  try {
    settingsStore.attach(configForms.get(SETTINGS_NAMESPACE), remoteCredentials);
  } catch (err) {
    console.warn('[dsh-chat-translate] Failed to bind the configuration form:', err);
  }

  // The locale service is declared through the client `inject` table, so cordis
  // installs it before this body runs and `ctx.locale` cannot miss it.
  // Registering the dictionary HERE is what the card's seat `t` resolves
  // against; without the registration the card falls back to the shell's
  // `common` namespace and renders every unknown key as its own key text.
  const locale = ctx.locale;
  if (locale && typeof locale.register === 'function') {
    ctx.effect(
      () => locale.register(NS, { zh, en }),
      'dsh-chat-translate: locale dictionaries'
    );
  }
  // This plugin's configuration lives on the host's **Plugins** page, which
  // declares `plugins.bundle.config` only while its own entry is mounted; a
  // deployment without that page leaves no trace. `whileServed` additionally
  // ties the contribution to the Host actually serving our configuration entry,
  // so a profile missing this plugin's Host half shows no form either.
  ctx.effect(
    () => configForms.whileServed([SETTINGS_NAMESPACE], () => setupPluginPage(
      ctx.slots,
      () => ctx.slots.register(
        {
          name: BUNDLE_CONFIG_SLOT,
          // The bundle's package name: the key that puts this entry on this
          // bundle's own page, above its rows.
          key: BUNDLE_CONFIG_KEY,
          // The page draws the title, icon and crumb itself; the card keeps its
          // own chrome, controls and section order.
          locale: NS,
        },
        TidySettingsPanel
      )
    )),
    'dsh-chat-translate: plugins page config'
  );
}

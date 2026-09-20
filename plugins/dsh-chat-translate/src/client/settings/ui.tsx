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
import { claimReadingSettingsPage, READING_ITEM_SLOT } from '../reading-settings-page.tsx';
import { NS, en, zh, type ChatTranslateLocaleKey } from '../locales.ts';
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
 * Chat-translate's card inside the shared 「阅读体验」 settings page. The card
 * keeps its own chrome (title rows, switches, credential form); the shared page
 * only stacks the participants' cards.
 * @param props - renderer-bound seat of the `reading.settings.item` slot plus
 * the `t` seat its `locale: NS` registration injects.
 * @returns The card element.
 */
export function TidySettingsPanel(
  props: PropsRuntime<'reading.settings.item'> & PropsLocale<typeof NS>
): React.ReactElement {
  ensureSettingsStyles();
  const { t } = props;

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
          {withSamples(t('masterDesc'), { example: 'Locate DSH home directory structure' })}
        </div>
      </div>

      {state.enabled && (
        <>
          {/* 2. AI 通道 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-title">
              <span>{t('aiTitle')}</span>
              <Switch
                checked={state.aiEnabled}
                onChange={(next: boolean) => settingsStore.update({ aiEnabled: next })}
                label={t('enableAi')}
              />
            </div>
            <div className="dsh-tidy-desc">
              <Tag tone={state.aiConfigured ? 'success' : 'warning'}>
                {t(state.aiConfigured ? 'badgeConfigured' : 'badgeUnconfigured')}
              </Tag>{' '}
              {t('aiFallbackNote')}
            </div>

            {state.aiEnabled && (
              <>
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

                <div className="dsh-tidy-row">
                  <div className="dsh-tidy-row-info">
                    <div className="dsh-tidy-row-title">{t('thinkEnableTitle')}</div>
                    <div className="dsh-tidy-row-desc">{t('thinkEnableDesc')}</div>
                  </div>
                  <Switch
                    checked={state.thinkEnabled}
                    onChange={(next: boolean) => settingsStore.update({ thinkEnabled: next })}
                    label={t('thinkEnableTitle')}
                  />
                </div>

                {state.thinkEnabled && (
                  <div className="dsh-tidy-row">
                    <div className="dsh-tidy-row-info">
                      <div className="dsh-tidy-row-title">{t('thinkTimeoutTitle')}</div>
                      <div className="dsh-tidy-row-desc">{t('thinkTimeoutDesc')}</div>
                    </div>
                    <Input
                      type="number"
                      className="dsh-tidy-field-timeout"
                      min={500}
                      max={900000}
                      step={1000}
                      value={state.thinkTimeoutMs}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isFinite(val)) return;
                        settingsStore.update({
                          thinkTimeoutMs: Math.min(Math.max(val, 500), 900000),
                        });
                      }}
                      aria-label={t('thinkTimeoutTitle')}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. Bing 通道 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-title">
              <span>{t('bingTitle')}</span>
              <Switch
                checked={state.bingEnabled}
                onChange={(next: boolean) => settingsStore.update({ bingEnabled: next })}
                label={t('enableBing')}
              />
            </div>
            <div className="dsh-tidy-desc">{t('bingDesc')}</div>
          </div>

          {/* 4. 行为说明 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-row-title">{t('behaviorTitle')}</div>
            <ul className="dsh-tidy-desc dsh-tidy-behavior-list">
              <li>{t('behavior1')}</li>
              <li>{t('behavior2')}</li>
              <li>{t('behavior3')}</li>
              <li>{t('behavior4')}</li>
              <li>{t('behavior5')}</li>
            </ul>
          </div>

          {/* 5. 并发控制 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">{t('concurrencyTitle')}</div>
                <div className="dsh-tidy-row-desc">{t('concurrencyDesc')}</div>
              </div>
              <Input
                type="number"
                className="dsh-tidy-field-count"
                min={1}
                max={100}
                step={1}
                value={state.concurrency}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val)) return;
                  settingsStore.update({ concurrency: Math.min(Math.max(val, 1), 100) });
                }}
                aria-label={t('concurrencyTitle')}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bind the settings store to DSH's native settings/credentials services and
 * join the shared 「阅读体验」 settings page: whichever participant activates
 * first claims the page, everyone registers a card into its child slot.
 * @param ctx - DSH browser client context; services are resolved defensively.
 */
export function setupSettingsUi(ctx: any): void {
  if (typeof window === 'undefined') return;

  // Ride DSH's own settings surface: the `settingsScope` service mirrors the
  // host document (per-namespace describe) and the `credentials` Remote API
  // writes the API key. No custom config HTTP endpoint since 1.2.
  try {
    // Declared via inject: 'settingsScope' and 'remote.credentials' (plus the
    // 'remote' root). Fall back to optional lookup so a degraded environment
    // degrades to an in-memory store instead of failing loudly.
    const settingsScope = ctx?.settingsScope || (ctx?.get ? ctx.get('settingsScope') : null);
    const remoteCredentials =
      ctx?.remote?.credentials || (ctx?.get ? ctx.get('remote.credentials') : null);
    if (settingsScope && typeof settingsScope.bind === 'function') {
      const scope = settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
      settingsStore.attach(scope, remoteCredentials ?? null);
    }
  } catch (err) {
    console.warn('[dsh-chat-translate] Failed to bind settings scope:', err);
  }

  // The locale service is declared through the client `inject` table, so cordis
  // installs it before this body runs and `ctx.get('locale')` cannot miss it.
  // Registering the dictionary HERE is what the card's seat `t` resolves
  // against; a non-waiting sample left it unregistered and the card then fell
  // back to the shell's `common` namespace, rendering every unknown key as its
  // own key text.
  const locale = typeof ctx?.get === 'function' ? ctx.get('locale') : null;
  if (locale && typeof locale.register === 'function' && typeof ctx?.effect === 'function') {
    ctx.effect(
      () => locale.register(NS, { zh, en }),
      'dsh-chat-translate: locale dictionaries'
    );
  }
  const t = locale && typeof locale.bind === 'function'
    ? locale.bind(NS)
    // Key-aware fallback: an earlier revision returned `zh.pageNav` for EVERY
    // key, which labelled the shared page's tab with the page name instead of
    // this plugin's own title whenever the locale service was not yet there.
    : (key: ChatTranslateLocaleKey): string => zh[key] ?? key;

  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get('slots') : null);
    if (!slots || typeof slots.inject !== 'function') return;

    // 共享「阅读体验」设置页：本插件与 dsh-smooth-stream
    // 共用一页，内核不允许 settings.section 的同一 id 被注册两次、也不允许子 slot
    // 被声明两次，因此各参与者携带同一份页壳、先到先得当选：当选者注册页面并声明
    // reading.settings.item 子 slot，未当选者只把卡片注册进该子 slot 等页面出现。
    // 共享页壳需要真 ctx：它用 ctx.slots 读注册表，并用 ctx.get('locale') 在语言
    // 切换时重读 tab 标签（可选服务，必须走 ctx.get，不能用 ctx.locale）。
    slots.inject('settings.section', () =>
      claimReadingSettingsPage(ctx, () => t('pageNav'), NS)
    );

    slots.inject(READING_ITEM_SLOT, () =>
      slots.register(
        {
          name: READING_ITEM_SLOT,
          // id = 本插件的 Host 设置命名空间（settings.section 时代的 id 沿用）
          id: SETTINGS_NAMESPACE,
          // 卡片在共享页里的顺序：丝滑流式 10、吸顶提示 20、聊天翻译 30
          order: 30,
          // 共享页按此标签渲染 tab
          label: () => t('title'),
          locale: NS,
        },
        TidySettingsPanel
      )
    );
  } catch (err) {
    console.warn('[dsh-chat-translate] Failed to inject settings section:', err);
  }
}
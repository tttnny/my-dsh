import { useEffect, useRef, useState } from 'react';
import * as React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { DEFAULT_PROMPT } from '../../prompt.ts';
import {
  settingsStore,
  SETTINGS_NAMESPACE,
  TRANSLATE_API_KEY_REF,
  type SettingsPageState,
} from './store.ts';
import { SETTINGS_CSS } from './styles.ts';
import { NS, en, zh } from '../locales.ts';
import { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, setupPluginPage } from './plugin-page.ts';
import { testServerChannel } from '../translate/api.ts';

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
 * Every control stages its edit; **保存** writes the whole batch as one
 * revision-fenced document mutation and then probes the channel, reporting
 * what it found. Nothing here is written while the reader types, so a
 * half-finished Base URL can never reach the translation path.
 *
 * @param props - renderer-bound seat of the `plugins.bundle.config` slot: the
 * `view` asked for plus the `t` seat its `locale: NS` registration injects.
 * @returns The card element.
 */
export function TidySettingsPanel(
  props: PropsRuntime<'plugins.bundle.config'> & PropsLocale<typeof NS>
): React.ReactElement {
  const { t } = props;
  ensureSettingsStyles();

  const [state, setState] = useState<SettingsPageState>(() => settingsStore.getState());
  const [testing, setTesting] = useState<{ running: boolean; ok?: boolean; message?: string } | null>(null);
  // 提示词默认只读：打开配置页先看清模型收到的是什么，动手改要显式点一下「编辑」。
  const [editingPrompt, setEditingPrompt] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setState(settingsStore.getState());
    return settingsStore.subscribe(() => setState(settingsStore.getState()));
  }, []);

  // 进改写态就把焦点交给输入框，读者不用再点第二下。
  useEffect(() => {
    if (editingPrompt) promptRef.current?.focus();
  }, [editingPrompt]);

  // 提示词框按内容长高：整段默认指令要一眼看全，不能让它缩在一个要滚的小窗里
  // （窗口高度取决于卡片宽度与读者字号，写死一个像素值必然在某些机器上截断）。
  // `scrollHeight` 含内边距、不含边框，而 `box-sizing: border-box` 的高度含边框，
  // 所以要把border那点加回去，否则最后一行会被裁掉一两个像素。
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [state.prompt.text, editingPrompt]);

  const runTest = async (): Promise<void> => {
    setTesting({ running: true });
    const res = await testServerChannel('openai');
    setTesting({
      running: false,
      ok: res.ok,
      message: res.ok ? t('testOk').replace('{latency}', String(res.latencyMs)) : res.error || t('unknownError'),
    });
  };

  const saveDisabled = state.saving || state.invalid || !state.dirty || (!state.writable && state.apiKey.text.trim() === '');

  return (
    <div className="dsh-tidy-settings">
      {/* 1. 总开关：拨了就生效（输入框下方那颗「译」胶囊是同一个状态，它没有保存按钮） */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-title">
          <span>{t('masterTitle')}</span>
          <Switch
            checked={state.committed.enabled}
            onChange={(next: boolean) => {
              void settingsStore.setEnabled(next);
            }}
            label={t('enableTranslation')}
          />
        </div>
      </div>

      {/* 2. AI 通道 */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-title">
          <span>{t('aiTitle')}</span>
          <Tag tone={state.committed.aiConfigured ? 'success' : 'warning'}>
            {t(state.committed.aiConfigured ? 'badgeConfigured' : 'badgeUnconfigured')}
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
          <Input
            type="password"
            className="dsh-tidy-field-wide"
            placeholder={state.committed.aiConfigured ? t('apiKeyPlaceholderConfigured') : 'sk-...'}
            value={state.apiKey.text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => settingsStore.draft('apiKey', e.target.value)}
            aria-label={t('apiKeyTitle')}
          />
        </div>

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
            value={state.baseUrl.text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => settingsStore.draft('baseUrl', e.target.value)}
            aria-label={t('baseUrlTitle')}
          />
        </div>

        <div className="dsh-tidy-row">
          <div className="dsh-tidy-row-info">
            <div className="dsh-tidy-row-title">{t('modelTitle')}</div>
            <div className="dsh-tidy-row-desc">
              {withSamples(t('modelDesc'), { model1: 'gpt-4o-mini', model2: 'deepseek-chat' })}
            </div>
          </div>
          <Input
            type="text"
            className="dsh-tidy-field-wide"
            placeholder="gpt-4o-mini"
            value={state.model.text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => settingsStore.draft('model', e.target.value)}
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
            value={state.aiTimeoutMs.text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              settingsStore.draft('aiTimeoutMs', e.target.value)
            }
            aria-label={t('timeoutTitle')}
          />
        </div>

        <div className="dsh-tidy-row">
          <Button variant="outline" size="sm" disabled={testing?.running} onClick={runTest}>
            {testing?.running ? t('testing') : t('test')}
          </Button>
          {testing !== null && !testing.running && (
            <span className={`dsh-tidy-test-result ${testing.ok ? 'ok' : 'fail'}`}>
              {testing.message}
            </span>
          )}
        </div>
      </div>

      {/* 3. 提示词：发给模型的指令正文。默认只读，点「编辑」才进改写态 */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-title">
          <span>{t('promptTitle')}</span>
          <div className="dsh-tidy-title-actions">
            {editingPrompt ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={state.prompt.text.trim() === DEFAULT_PROMPT}
                  onClick={() => settingsStore.restoreDefaultPrompt()}
                >
                  {t('promptRestore')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingPrompt(false)}>
                  {t('promptDone')}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setEditingPrompt(true)}>
                {t('promptEdit')}
              </Button>
            )}
          </div>
        </div>
        <div className="dsh-tidy-desc">{t('promptDesc')}</div>
        <textarea
          ref={promptRef}
          className="dsh-tidy-prompt"
          value={state.prompt.text}
          spellCheck={false}
          readOnly={!editingPrompt}
          aria-label={t('promptTitle')}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            if (!editingPrompt) return;
            settingsStore.draft('prompt', e.target.value);
          }}
        />
      </div>

      {/* 4. 保存：唯一写盘的手势，一次提交上面所有草稿；写完自动探一次通道 */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-row dsh-tidy-actions">
          <Button
            variant="primary"
            size="sm"
            className="dsh-tidy-save"
            disabled={saveDisabled}
            onClick={() => {
              void settingsStore.save();
            }}
          >
            {state.saving ? t('saving') : t('save')}
          </Button>
          {state.dirty && !state.saving && <span className="dsh-tidy-hint">{t('unsavedHint')}</span>}
        </div>
        {state.invalid && (
          <div className="dsh-tidy-test-result fail" role="status">
            {t('invalidTimeout')}
          </div>
        )}
        {state.saveFailed && (
          <div className="dsh-tidy-test-result fail" role="status">
            {t('saveFailed').replace('{error}', t('unknownError'))}
          </div>
        )}
        {state.probe !== undefined && !state.probe.running && (
          <div className={`dsh-tidy-test-result ${state.probe.ok ? 'ok' : 'fail'}`} role="status">
            {state.probe.ok
              ? t('saveProbeOk')
              : t('saveProbeFail').replace('{error}', state.probe.message || t('unknownError'))}
          </div>
        )}
      </div>
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

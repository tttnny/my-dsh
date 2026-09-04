import { useState, useEffect } from 'react';
import * as React from 'react';
import { settingsStore, SETTINGS_NAMESPACE, type ClientSettingsState } from './store.ts';
import { SETTINGS_CSS } from './styles.ts';
let stylesInjected = false;
function ensureSettingsStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.tidySettings = 'true';
  el.textContent = SETTINGS_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}

function Switch(props: { checked: boolean; onChange: () => void; label: string }): React.ReactElement {
  return (
    <button
      type="button"
      className="dsh-tidy-switch"
      role="switch"
      aria-checked={props.checked}
      onClick={props.onChange}
      aria-label={props.label}
    />
  );
}

export function TidySettingsPanel(): React.ReactElement {
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
      ? `连接正常，延迟 ${res.latencyMs}ms`
      : `失败：${res.error || '未知错误'}`;
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
          ? '已清除 API Key（AI 通道将不可用，Bing 兜底）'
          : '已保存到 ~/.dsh/.credentials.yaml，立即生效',
      });
      setApiKeyInput('');
    } else {
      setKeyMsg({ ok: false, text: `保存失败：${res.error || '未知错误'}` });
    }
  };

  return (
    <div className="dsh-tidy-settings">
      {/* 1. 总开关 */}
      <div className="dsh-tidy-card">
        <div className="dsh-tidy-title">
          <span>工具调用与思考摘要翻译</span>
          <Switch
            checked={state.enabled}
            onChange={() => settingsStore.update({ enabled: !state.enabled })}
            label="启用工具调用与摘要翻译"
          />
        </div>
        <div className="dsh-tidy-desc">
          自动将当前会话中工具调用标题与思考折叠摘要（如 <code>Locate DSH home directory structure</code>）翻译为中文，
          点击译文可原地切换原文/译文。仅作用于当前查看的会话，对话正文永不翻译。
        </div>
      </div>

      {state.enabled && (
        <>
          {/* 2. AI 通道 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-title">
              <span>AI 翻译（OpenAI 兼容协议）</span>
              <Switch
                checked={state.aiEnabled}
                onChange={() => settingsStore.update({ aiEnabled: !state.aiEnabled })}
                label="启用 AI 翻译通道"
              />
            </div>
            <div className="dsh-tidy-desc">
              <span className={`dsh-tidy-badge ${state.aiConfigured ? 'dsh-tidy-badge-ok' : 'dsh-tidy-badge-warn'}`}>
                {state.aiConfigured ? '已配置' : '未配置'}
              </span>{' '}
              未配置时 AI 通道自动跳过，由 Bing 兜底。
            </div>

            {state.aiEnabled && (
              <>
                <div className="dsh-tidy-row">
                  <div className="dsh-tidy-row-info">
                    <div className="dsh-tidy-row-title">API Key</div>
                    <div className="dsh-tidy-row-desc">
                      保存至 <code>~/.dsh/.credentials.yaml</code> 的 <code>TRANSLATE_API_KEY</code>，保存后立即生效；留空保存 = 清除
                    </div>
                  </div>
                  <div className="dsh-tidy-input-row">
                    <input
                      type="password"
                      className="dsh-tidy-input"
                      placeholder={state.aiConfigured ? '已配置（如需更换请直接输入）' : 'sk-...'}
                      value={apiKeyInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyInput(e.target.value)}
                      style={{ width: '260px' }}
                      aria-label="API Key"
                    />
                    <button type="button" className="dsh-tidy-btn" disabled={savingKey} onClick={handleSaveKey}>
                      {savingKey ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
                {keyMsg && (
                  <div className={`dsh-tidy-test-result ${keyMsg.ok ? 'ok' : 'fail'}`}>{keyMsg.text}</div>
                )}

                <div className="dsh-tidy-row">
                  <div className="dsh-tidy-row-info">
                    <div className="dsh-tidy-row-title">Base URL</div>
                    <div className="dsh-tidy-row-desc">
                      任意 OpenAI 兼容服务端点，如 <code>https://api.openai.com/v1</code>、{' '}
                      <code>https://api.deepseek.com/v1</code>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="dsh-tidy-input"
                    placeholder="https://api.openai.com/v1"
                    value={state.baseUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      settingsStore.update({ baseUrl: e.target.value })
                    }
                    style={{ width: '260px' }}
                    aria-label="AI Base URL"
                  />
                </div>
                <div className="dsh-tidy-row">
                  <div className="dsh-tidy-row-info">
                    <div className="dsh-tidy-row-title">模型</div>
                    <div className="dsh-tidy-row-desc">
                      如 <code>gpt-4o-mini</code>、<code>deepseek-chat</code>；留空视为未配置
                    </div>
                  </div>
                  <input
                    type="text"
                    className="dsh-tidy-input"
                    placeholder="gpt-4o-mini"
                    value={state.model}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      settingsStore.update({ model: e.target.value })
                    }
                    style={{ width: '260px' }}
                    aria-label="AI 模型"
                  />
                </div>
                <div className="dsh-tidy-row">
                  <button
                    type="button"
                    className="dsh-tidy-btn"
                    disabled={testing?.running}
                    onClick={() => runTest('openai')}
                  >
                    {testing?.running ? '测试中…' : '测试 AI 通道'}
                  </button>
                  {testing?.channel === 'openai' && !testing.running && (
                    <span className={`dsh-tidy-test-result ${testing.ok ? 'ok' : 'fail'}`}>{testing.message}</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 3. Bing 通道 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-title">
              <span>Bing 网页翻译（免 Key 兜底）</span>
              <Switch
                checked={state.bingEnabled}
                onChange={() => settingsStore.update({ bingEnabled: !state.bingEnabled })}
                label="启用 Bing 翻译通道"
              />
            </div>
            <div className="dsh-tidy-desc">
              内置免 Key 翻译通道，无需任何配置。AI 未配置或请求失败时自动兜底；AI 与 Bing 同时关闭则不翻译。
            </div>
          </div>

          {/* 4. 行为说明 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-row-title">通道行为</div>
            <ul className="dsh-tidy-desc dsh-tidy-behavior-list">
              <li>AI 开启且已配置 → AI 优先翻译，失败自动降级 Bing</li>
              <li>AI 开启但未配置 + Bing 开启 → 由 Bing 翻译</li>
              <li>AI 开启但未配置 + Bing 关闭 → 不翻译</li>
              <li>AI 关闭 + Bing 开启 → 直接使用 Bing</li>
              <li>AI 关闭 + Bing 关闭 → 不翻译</li>
            </ul>
          </div>

          {/* 5. 并发控制 */}
          <div className="dsh-tidy-card">
            <div className="dsh-tidy-row">
              <div className="dsh-tidy-row-info">
                <div className="dsh-tidy-row-title">最大翻译并发数</div>
                <div className="dsh-tidy-row-desc">
                  控制视口滚动与多工具卡片时的最大并行请求数（范围 1-100，推荐 3）。
                </div>
              </div>
              <input
                type="number"
                className="dsh-tidy-input"
                min={1}
                max={100}
                step={1}
                value={state.concurrency}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val)) return;
                  settingsStore.update({ concurrency: Math.min(Math.max(val, 1), 100) });
                }}
                style={{ width: '88px' }}
                aria-label="最大翻译并发数"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get('slots') : null);
    if (!slots || typeof slots.inject !== 'function') return;

    slots.inject('settings.section', () => {
      return slots.register(
        {
          name: 'settings.section',
          id: 'dsh-chat-translate',
          // 约定：自有插件设置项 order 从 110 起步进 10（原生最大 100=桌面设置），保证排在所有原生项之下
          order: 110,
          label: () => '聊天翻译',
        },
        TidySettingsPanel
      );
    });
  } catch (err) {
    console.warn('[dsh-chat-translate] Failed to inject settings section:', err);
  }
}

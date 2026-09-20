import React, { useState, useEffect } from 'react';
import { Button, Input, Pill, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { A6apiT } from '../locales.js';
import { store } from '../store.js';
import type { A6ApiConfig } from '../../types.js';

/** 与服务端 maskConfig 一致的脱敏占位符：代表「已配置，但密钥只存于本机」 */
const MASK = '••••••••';

export const ConfigPanel: React.FC<{
  config: A6ApiConfig;
  dshConfiguredModels: string[];
  t: A6apiT;
}> = ({ config, dshConfiguredModels, t }) => {
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [accessToken, setAccessToken] = useState(config.accessToken || '');
  const [clearKey, setClearKey] = useState(false);
  const [clearToken, setClearToken] = useState(false);
  const [selectedNode, setSelectedNode] = useState(
    config.baseURL || 'https://api.a6api.com',
  );
  // 自定义节点输入框：baseURL 非官方节点时以其为初值（customBaseURL 死字段已移除）
  const [customNode, setCustomNode] = useState(
    config.baseURL && config.baseURL !== 'https://api.a6api.com' && config.baseURL !== 'https://a6.a6api.com'
      ? config.baseURL
      : '',
  );
  const [isCustom, setIsCustom] = useState(
    config.baseURL !== 'https://api.a6api.com' && config.baseURL !== 'https://a6.a6api.com',
  );
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 值为占位符即表示「已保存密钥」，此时输入框留空展示，保存时不回传占位符
  const apiKeySet = apiKey === MASK;
  const tokenSet = accessToken === MASK;

  useEffect(() => {
    setApiKey(config.apiKey || '');
    setAccessToken(config.accessToken || '');
    setClearKey(false);
    setClearToken(false);
    setSelectedNode(config.baseURL || 'https://api.a6api.com');
    setCustomNode(
      config.baseURL && config.baseURL !== 'https://api.a6api.com' && config.baseURL !== 'https://a6.a6api.com'
        ? config.baseURL
        : '',
    );
    setIsCustom(
      config.baseURL !== 'https://api.a6api.com' && config.baseURL !== 'https://a6.a6api.com',
    );
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    const finalBaseUrl = isCustom ? customNode.trim() || 'https://api.a6api.com' : selectedNode;
    // 未修改（占位符态）→ 不发送该字段，服务端保留原值；点击「清除」→ 发送空串删除
    const newApiKey = apiKeySet ? (clearKey ? '' : undefined) : apiKey.trim();
    const newToken = tokenSet ? (clearToken ? '' : undefined) : accessToken.trim();
    const ok = await store.saveConfig({
      ...(newApiKey !== undefined ? { apiKey: newApiKey } : {}),
      ...(newToken !== undefined ? { accessToken: newToken } : {}),
      baseURL: finalBaseUrl,
    });
    setSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    }
  };

  return (
    <div className="dsh-a6-config-page">
      {/* 1. API Gateway Node Selection */}
      <div className="dsh-a6-config-section">
        <div className="dsh-a6-section-heading">
          <span className="dsh-a6-heading-title">{t('nodeTitle')}</span>
          <span className="dsh-a6-heading-desc">{t('nodeDesc')}</span>
        </div>

        <div className="dsh-a6-node-picker">
          <Pill
            active={!isCustom && selectedNode === 'https://api.a6api.com'}
            onClick={() => {
              setIsCustom(false);
              setSelectedNode('https://api.a6api.com');
            }}
          >
            https://api.a6api.com ({t('nodeCdn')})
          </Pill>
          <Pill
            active={!isCustom && selectedNode === 'https://a6.a6api.com'}
            onClick={() => {
              setIsCustom(false);
              setSelectedNode('https://a6.a6api.com');
            }}
          >
            https://a6.a6api.com ({t('nodeDirect')})
          </Pill>
          <Pill active={isCustom} onClick={() => setIsCustom(true)}>
            {t('nodeCustom')}
          </Pill>
        </div>

        {isCustom && (
          <Input
            className="dsh-a6-node-custom"
            type="text"
            placeholder={t('customNodePlaceholder')}
            value={customNode}
            onChange={(e) => setCustomNode(e.target.value)}
          />
        )}
      </div>

      {/* 2. Authentication Tokens */}
      <div className="dsh-a6-config-section">
        <div className="dsh-a6-section-heading">
          <span className="dsh-a6-heading-title">{t('authTitle')}</span>
          <span className="dsh-a6-heading-desc">{t('authDesc')}</span>
        </div>

        <div className="dsh-a6-config-fields-grid">
          {/* API Key */}
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-header">
              <label className="dsh-a6-label">{t('apiKeyLabel')}</label>
              <div className="dsh-a6-field-header-actions">
                {apiKeySet && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setClearKey(true);
                      setApiKey('');
                    }}
                  >
                    {t('clear')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t('hide') : t('show')}
                </Button>
              </div>
            </div>
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder={apiKeySet ? t('apiKeyPlaceholderSet') : t('apiKeyPlaceholder')}
              value={apiKeySet ? '' : apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="dsh-a6-field-hint">
              {apiKeySet ? t('apiKeyHintSet') : t('apiKeyHint')}
            </span>
          </div>

          {/* System Access Token */}
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-header">
              <label className="dsh-a6-label">{t('tokenLabel')}</label>
              <div className="dsh-a6-field-header-actions">
                {tokenSet && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setClearToken(true);
                      setAccessToken('');
                    }}
                  >
                    {t('clear')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowToken(!showToken)}>
                  {showToken ? t('hide') : t('show')}
                </Button>
              </div>
            </div>
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder={tokenSet ? t('tokenPlaceholderSet') : t('tokenPlaceholder')}
              value={tokenSet ? '' : accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <div className="dsh-a6-field-footer">
              <span className="dsh-a6-field-hint">
                {tokenSet ? t('tokenHintSet') : t('tokenHint')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(!showHelp)}
              >
                {showHelp ? t('helpClose') : t('helpOpen')}
              </Button>
            </div>
          </div>
        </div>

        {/* Tutorial Drawer */}
        {showHelp && (
          <div className="dsh-a6-help-drawer">
            <div className="dsh-a6-help-title">{t('helpTitle')}</div>
            <ol className="dsh-a6-help-list">
              <li>
                {t('helpStep1Prefix')}
                <a href="https://a6api.com/console/personal" target="_blank" rel="noreferrer">
                  a6api.com/console/personal
                </a>
                {t('helpStep1Suffix')}
              </li>
              <li>
                {t('helpStep2Prefix')}
                <code>eyJhbGciOi...</code>
                {t('helpStep2Suffix')}
              </li>
              <li>{t('helpStep3')}</li>
            </ol>
          </div>
        )}
      </div>

      {/* 3. DSH LLM Provider Integration Overview */}
      <div className="dsh-a6-config-section">
        <div className="dsh-a6-section-heading">
          <span className="dsh-a6-heading-title">{t('integrationTitle')}</span>
          <span className="dsh-a6-heading-desc">
            {t('integrationDescPrefix')}
            <code>a6api</code>
            {t('integrationDescSuffix')}
          </span>
        </div>

        <div className="dsh-a6-integration-card">
          <div className="dsh-a6-int-row">
            <span className="dsh-a6-int-key">{t('providerKey')}</span>
            <span className="dsh-a6-int-val">
              <code>a6api</code> {t('providerCompatible')}
            </span>
          </div>
          <div className="dsh-a6-int-row">
            <span className="dsh-a6-int-key">{t('enabledModelsKey')}</span>
            <div className="dsh-a6-int-tags">
              {dshConfiguredModels.length > 0 ? (
                dshConfiguredModels.map((m) => (
                  <Tag key={m} tone="success">
                    {m}
                  </Tag>
                ))
              ) : (
                <span className="dsh-a6-empty-hint">{t('noEnabledModels')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Save Action Bar */}
      <div className="dsh-a6-save-bar">
        <div className="dsh-a6-save-status">
          {saveSuccess && <span className="dsh-a6-success-msg">{t('saveSuccess')}</span>}
        </div>
        <Button
          variant="primary"
          className="dsh-a6-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Switch,
  Tag,
  Tooltip,
  IconCloseCircleFillRegular,
  IconQuestionOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { A6apiT } from '../locales.js';
import { store } from '../store.js';
import type { A6ApiConfig } from '../../types.js';

/** 与服务端 maskConfig 一致的脱敏占位符：代表「已配置，但密钥只存于本机」 */
const MASK = '••••••••';

/**
 * 基础配置页：单列设置字段行（label / 控件 / hint 三段式），字段之间 0.5px 发丝线。
 *
 * 接入地址不在这页出现：它由插件定死为官方地址，没有展示与改动入口。
 * 密钥类字段只在客户端持有脱敏占位符 `MASK`：输入框留空表示「沿用已保存值」，
 * 保存时不回传该字段；点「清除」后回传空串删除。
 */
export const ConfigPanel: React.FC<{
  config: A6ApiConfig;
  dshConfiguredModels: string[];
  t: A6apiT;
}> = ({ config, dshConfiguredModels, t }) => {
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [accessToken, setAccessToken] = useState(config.accessToken || '');
  const [userId, setUserId] = useState(config.userId || '');
  const [clearKey, setClearKey] = useState(false);
  const [clearToken, setClearToken] = useState(false);
  const [clearUserId, setClearUserId] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 值为占位符即表示「已保存密钥」，此时输入框留空展示，保存时不回传占位符
  const apiKeySet = apiKey === MASK;
  const tokenSet = accessToken === MASK;
  const userIdSet = userId === MASK;

  useEffect(() => {
    setApiKey(config.apiKey || '');
    setAccessToken(config.accessToken || '');
    setUserId(config.userId || '');
    setClearKey(false);
    setClearToken(false);
    setClearUserId(false);
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    // 未修改（占位符态）→ 不发送该字段，服务端保留原值；点击「清除」→ 发送空串删除。
    // 请求体不含地址字段：接入地址由插件定死为官方地址，不随保存上传。
    const newApiKey = apiKeySet ? (clearKey ? '' : undefined) : apiKey.trim();
    const newToken = tokenSet ? (clearToken ? '' : undefined) : accessToken.trim();
    const newUserId = userIdSet ? (clearUserId ? '' : undefined) : userId.trim();
    const ok = await store.saveConfig({
      ...(newApiKey !== undefined ? { apiKey: newApiKey } : {}),
      ...(newToken !== undefined ? { accessToken: newToken } : {}),
      ...(newUserId !== undefined ? { userId: newUserId } : {}),
    });
    setSaving(false);
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    }
  };

  /** 字段头部右侧的 24px 图标动作，行为与原文字按钮一致；气泡走 ui-primitives Tooltip */
  const iconAction = (
    key: string,
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
  ) => (
    <Tooltip key={key} label={label} side="bottom" align="end" gap={6} portal maxWidth={240}>
      <Button
        variant="ghost"
        size="sm"
        className="dsh-a6-field-icon-btn"
        icon={icon}
        aria-label={label}
        onClick={onClick}
      />
    </Tooltip>
  );

  /** 密钥明文开关：用「显示 / 隐藏」布尔开关取代图标，图标集里没有眼睛 */
  const revealSwitch = (shown: boolean, onChange: (next: boolean) => void) => (
    <Tooltip
      label={shown ? t('hide') : t('show')}
      side="bottom"
      align="end"
      gap={6}
      portal
      maxWidth={240}
    >
      <Switch
        checked={shown}
        onChange={onChange}
        label={shown ? t('hide') : t('show')}
        className="dsh-a6-reveal-switch"
      />
    </Tooltip>
  );

  return (
    <div className="dsh-a6-config-page">
      {/* 1. Authentication Tokens */}
      <section className="dsh-a6-config-section">
        <h3 className="dsh-a6-heading-title">{t('authTitle')}</h3>
        <p className="dsh-a6-heading-desc">{t('authDesc')}</p>

        <div className="dsh-a6-fields">
          {/* API Key */}
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-head">
              <span className="dsh-a6-label">{t('apiKeyLabel')}</span>
              {apiKeySet && <Tag tone="success">{t('synced')}</Tag>}
              <span className="dsh-a6-field-actions">
                {apiKeySet &&
                  iconAction(
                    'clear',
                    t('clear'),
                    () => {
                      setClearKey(true);
                      setApiKey('');
                    },
                    <IconCloseCircleFillRegular size={16} />,
                  )}
                {revealSwitch(showKey, setShowKey)}
              </span>
            </div>
            <Input
              type={showKey ? 'text' : 'password'}
              aria-label={t('apiKeyLabel')}
              placeholder={apiKeySet ? t('apiKeyPlaceholderSet') : t('apiKeyPlaceholder')}
              value={apiKeySet ? '' : apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="dsh-a6-hint">
              {apiKeySet ? t('apiKeyHintSet') : t('apiKeyHint')}
            </span>
          </div>

          {/* System Access Token */}
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-head">
              <span className="dsh-a6-label">{t('tokenLabel')}</span>
              {tokenSet && <Tag tone="success">{t('synced')}</Tag>}
              <span className="dsh-a6-field-actions">
                {tokenSet &&
                  iconAction(
                    'clear',
                    t('clear'),
                    () => {
                      setClearToken(true);
                      setAccessToken('');
                    },
                    <IconCloseCircleFillRegular size={16} />,
                  )}
                {revealSwitch(
                  showToken,
                  setShowToken,
                )}
                {iconAction(
                  'help',
                  showHelp ? t('helpClose') : t('helpOpen'),
                  () => setShowHelp(!showHelp),
                  <IconQuestionOutlineRegular size={16} />,
                )}
              </span>
            </div>
            <Input
              type={showToken ? 'text' : 'password'}
              aria-label={t('tokenLabel')}
              placeholder={tokenSet ? t('tokenPlaceholderSet') : t('tokenPlaceholder')}
              value={tokenSet ? '' : accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <span className="dsh-a6-hint">
              {tokenSet ? t('tokenHintSet') : t('tokenHint')}
            </span>

            {/* Tutorial Drawer */}
            {showHelp && (
              <div className="dsh-a6-help-drawer">
                <div className="dsh-a6-help-title">{t('helpTitle')}</div>
                <ol className="dsh-a6-help-list">
                  <li>
                    {t('helpStep1Prefix')}
                    <a
                      href="https://a6api.com/console/personal"
                      target="_blank"
                      rel="noreferrer"
                    >
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

          {/* Account ID (New-Api-User) — the platform's account/merchant APIs require it */}
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-head">
              <span className="dsh-a6-label">{t('userIdLabel')}</span>
              {userIdSet && <Tag tone="success">{t('synced')}</Tag>}
              <span className="dsh-a6-field-actions">
                {userIdSet &&
                  iconAction(
                    'clear',
                    t('clear'),
                    () => {
                      setClearUserId(true);
                      setUserId('');
                    },
                    <IconCloseCircleFillRegular size={16} />,
                  )}
              </span>
            </div>
            <Input
              type="text"
              aria-label={t('userIdLabel')}
              placeholder={userIdSet ? t('userIdPlaceholderSet') : t('userIdPlaceholder')}
              value={userIdSet ? '' : userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <span className="dsh-a6-hint">
              {userIdSet ? t('userIdHintSet') : t('userIdHint')}
            </span>
          </div>
        </div>
      </section>

      {/* 2. DSH LLM Provider Integration Overview */}
      <section className="dsh-a6-config-section">
        <h3 className="dsh-a6-heading-title">{t('integrationTitle')}</h3>
        <p className="dsh-a6-heading-desc">
          {t('integrationDescPrefix')}
          <code>a6api</code>
          {t('integrationDescSuffix')}
        </p>

        <div className="dsh-a6-fields">
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-head">
              <span className="dsh-a6-label">{t('providerKey')}</span>
            </div>
            <span className="dsh-a6-field-value">
              <code>a6api</code> {t('providerCompatible')}
            </span>
          </div>
          <div className="dsh-a6-field">
            <div className="dsh-a6-field-head">
              <span className="dsh-a6-label">{t('enabledModelsKey')}</span>
            </div>
            {dshConfiguredModels.length > 0 ? (
              <div className="dsh-a6-int-tags">
                {dshConfiguredModels.map((m) => (
                  <Tag key={m} tone="success">
                    {m}
                  </Tag>
                ))}
              </div>
            ) : (
              <span className="dsh-a6-hint">{t('noEnabledModels')}</span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Save Action Bar */}
      <div className="dsh-a6-save-bar">
        {saveSuccess && <span className="dsh-a6-success-msg">{t('saveSuccess')}</span>}
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
};

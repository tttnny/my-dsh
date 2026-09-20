import React, { useState, useEffect } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  Button,
  IconCloseOutline16,
  IconRefreshOutline14,
  Input,
  Pill,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { NS } from '../locales.js';
import { store, type StoreState } from '../store.js';
import { MerchantCard } from './MerchantCard.js';
import { AccountPanel } from './BalanceCard.js';
import { ConfigPanel } from './ConfigPanel.js';
import { PricePill } from './PricePill.js';
import { MarketPill } from './MarketPill.js';
import { ModelCatalogPanel } from './ModelCatalogPanel.js';

type TabKey = 'models' | 'catalog' | 'account' | 'config';

export const A6ApiSettingsPanel: React.FC<PropsLocale<typeof NS>> = ({ t }) => {
  const [state, setState] = useState<StoreState>(store.getState());
  const [activeTab, setActiveTab] = useState<TabKey>('models');
  const [filterMode, setFilterMode] = useState<'all' | 'enabled' | 'probed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setState({ ...store.getState() });
    });
    store.fetchState();
    return unsub;
  }, []);

  // 全量探测的运行态（进行中/进度/总数）由 store 驱动，组件只订阅；
  // 取消/立即重开/面板重挂载时按钮与计数始终与队列真实状态一致
  const handleProbeAll = () => {
    store.probeAll();
  };

  const handleCancelProbeAll = () => {
    store.cancelProbeAll();
  };

  const handleRefreshState = async () => {
    setRefreshing(true);
    // 手动刷新 = 强制刷新：服务端绕过 /state 短缓存，立即向 A6API 重建最新数据
    await store.fetchState(true);
    setRefreshing(false);
    setRefreshSuccess(true);
    setTimeout(() => setRefreshSuccess(false), 2000);
  };

  const inDshCount = state.models.filter((m) => m.inDsh).length;
  const probedCount = state.models.filter((m) => Boolean(m.merchant)).length;

  const filteredModels = state.models.filter((m) => {
    if (filterMode === 'enabled' && !m.inDsh) return false;
    if (filterMode === 'probed' && !m.merchant) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        m.model_name.toLowerCase().includes(q) ||
        m.brand.toLowerCase().includes(q) ||
        (m.merchant?.supplier_name && m.merchant.supplier_name.toLowerCase().includes(q)) ||
        (m.merchant?.channel_name && m.merchant.channel_name.toLowerCase().includes(q)) ||
        (m.merchant?.description && m.merchant.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // 固定模型位置：启用的排在最前面，未启用的排在后面；组内按模型名称字母绝对稳定排序
  const sortedModels = [...filteredModels].sort((a, b) => {
    if (a.inDsh !== b.inDsh) {
      return a.inDsh ? -1 : 1;
    }
    return a.model_name.localeCompare(b.model_name);
  });

  return (
    <div className="dsh-a6-container">
      {/* 1. Header Title & Description */}
      <div className="dsh-a6-main-header">
        <div className="dsh-a6-header-text">
          <h2 className="dsh-a6-main-title">{t('heading')}</h2>
          <p className="dsh-a6-main-subtitle">{t('subtitle')}</p>
        </div>

        <div className="dsh-a6-header-badges">
          {state.balance?.hasAccountAuth && (
            <button
              type="button"
              className="dsh-a6-header-balance-badge"
              onClick={() => setActiveTab('account')}
              title={t('balanceBadgeTip')}
            >
              <span className="dsh-a6-hb-label">{t('balanceLabel')}</span>
              <span className="dsh-a6-hb-amount">{state.balance.accountBalanceFormatted}</span>
            </button>
          )}
          <PricePill
            pf={state.priceFluctuation}
            hasToken={Boolean(state.config?.hasToken)}
            t={t}
          />
          <MarketPill t={t} />
        </div>
      </div>

      {/* 2. Top Navigation Tabs */}
      <div className="dsh-a6-nav-tabs">
        <Pill active={activeTab === 'models'} onClick={() => setActiveTab('models')}>
          <span>{t('tabModels')}</span>
          <Tag tone="neutral">{state.models.length}</Tag>
        </Pill>

        <Pill active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')}>
          <span>{t('tabCatalog')}</span>
          {state.catalog.length > 0 && <Tag tone="neutral">{state.catalog.length}</Tag>}
        </Pill>

        <Pill active={activeTab === 'account'} onClick={() => setActiveTab('account')}>
          <span>{t('tabAccount')}</span>
          {state.balance?.hasAccountAuth && (
            <Tag tone="success">{state.balance.accountBalanceFormatted}</Tag>
          )}
        </Pill>

        <Pill active={activeTab === 'config'} onClick={() => setActiveTab('config')}>
          <span>{t('tabConfig')}</span>
        </Pill>
      </div>

      {/* 3. Tab Content Pages */}
      {activeTab === 'catalog' && (
        <div className="dsh-a6-tab-page catalog-page">
          <ModelCatalogPanel t={t} />
        </div>
      )}

      {activeTab === 'models' && (
        <div className="dsh-a6-tab-page models-page">
          {/* Models Section Toolbar */}
          <div className="dsh-a6-section-header">
            <div className="dsh-a6-filter-group">
              <Pill active={filterMode === 'all'} onClick={() => setFilterMode('all')}>
                {t('filterAll', { count: state.models.length })}
              </Pill>
              <Pill active={filterMode === 'enabled'} onClick={() => setFilterMode('enabled')}>
                {t('filterEnabled', { count: inDshCount })}
              </Pill>
              <Pill active={filterMode === 'probed'} onClick={() => setFilterMode('probed')}>
                {t('filterProbed', { count: probedCount })}
              </Pill>
            </div>

            <div className="dsh-a6-toolbar-right">
              <div className="dsh-a6-search-wrapper">
                <Input
                  className="dsh-a6-search-input"
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<IconCloseOutline16 />}
                    aria-label={t('clearSearch')}
                    title={t('clearSearch')}
                    onClick={() => setSearchQuery('')}
                  />
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={<IconRefreshOutline14 />}
                onClick={handleRefreshState}
                disabled={refreshing || state.probeAllActive}
                data-tooltip={
                  state.probeAllActive ? t('refreshBusyTip') : t('refreshTip')
                }
                data-tooltip-pos="down"
              >
                {refreshing ? t('refreshing') : refreshSuccess ? t('refreshed') : t('refresh')}
              </Button>

              {state.probeAllActive ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled
                    data-tooltip={t('probeAllProgressTip')}
                    data-tooltip-pos="down-left"
                  >
                    {t('probeAllProgress', {
                      done: state.probeAllDoneCount,
                      total: state.probeAllTotal,
                    })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelProbeAll}
                    data-tooltip={t('cancelProbeTip')}
                    data-tooltip-pos="down-left"
                  >
                    {t('cancel')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleProbeAll}
                  disabled={state.models.length === 0}
                  data-tooltip={t('probeAllTip')}
                  data-tooltip-pos="down-left"
                >
                  {t('probeAll')}
                </Button>
              )}
            </div>
          </div>

          {/* Model Cards List */}
          <div className="dsh-a6-cards-list">
            {state.loading && state.models.length === 0 ? (
              <div className="dsh-a6-empty-state">
                <div className="dsh-a6-spinner" />
                <span>{t('emptyLoading')}</span>
              </div>
            ) : sortedModels.length > 0 ? (
              sortedModels.map((m) => (
                <MerchantCard key={m.model_name} model={m} t={t} />
              ))
            ) : (
              <div className="dsh-a6-empty-state">
                {searchQuery ? (
                  <span>{t('emptyNoMatch', { query: searchQuery })}</span>
                ) : filterMode === 'enabled' ? (
                  <span>{t('emptyEnabled')}</span>
                ) : filterMode === 'probed' ? (
                  <span>{t('emptyProbed')}</span>
                ) : !state.config.hasApiKey ? (
                  <span>{t('emptyNoKey')}</span>
                ) : (
                  <span>{t('emptyNone')}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'account' && (
        <div className="dsh-a6-tab-page account-page">
          <AccountPanel
            balance={state.balance}
            config={state.config}
            recentLogs={state.recentLogs}
            onNavigateToConfig={() => setActiveTab('config')}
            t={t}
          />
        </div>
      )}

      {activeTab === 'config' && (
        <div className="dsh-a6-tab-page config-page">
          <ConfigPanel
            config={state.config}
            dshConfiguredModels={state.dshConfiguredModels}
            t={t}
          />
        </div>
      )}
    </div>
  );
};
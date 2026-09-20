import React, { useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { A6apiT } from '../locales.js';
import { store } from '../store.js';
import type { BalanceInfo, A6ApiConfig, ApiRoutingLogItem } from '../../types.js';

const CONSOLE_URL = 'https://a6api.com/console';

export const AccountPanel: React.FC<{
  balance: BalanceInfo | null;
  config: A6ApiConfig;
  recentLogs?: ApiRoutingLogItem[];
  onNavigateToConfig?: () => void;
  t: A6apiT;
}> = ({ balance, config, recentLogs = [], onNavigateToConfig, t }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshBalance = async () => {
    setRefreshing(true);
    await store.refreshBalance();
    setRefreshing(false);
  };

  const hasAuth = balance?.hasAccountAuth ?? false;
  const isLow = balance ? balance.isLow : false;

  const formatLogTime = (ts: number) => {
    if (!ts) return t('justNow');
    const d = new Date(ts * 1000);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="dsh-a6-account-page">
      {/* 1. Real Balance Banner */}
      <div className={`dsh-a6-balance-banner ${isLow ? 'low-balance' : ''}`}>
        <div className="dsh-a6-balance-header">
          <div className="dsh-a6-balance-left">
            <div className="dsh-a6-balance-main-title">
              <span className="dsh-a6-balance-label">{t('balanceTitle')}</span>
              <div className="dsh-a6-balance-num-row">
                <span className={`dsh-a6-balance-amount ${!hasAuth ? 'unauthed' : ''}`}>
                  {hasAuth ? (balance?.accountBalanceFormatted ?? '$0.00') : t('unconnected')}
                </span>
                {hasAuth && balance?.accountBalanceCnyFormatted && (
                  <span className="dsh-a6-balance-cny">{balance.accountBalanceCnyFormatted}</span>
                )}
                <Tag tone={hasAuth ? 'success' : 'warning'}>
                  {hasAuth ? t('synced') : t('notConnected')}
                </Tag>
              </div>
            </div>

            {isLow && <span className="dsh-a6-low-alert">{t('lowAlert')}</span>}
          </div>

          <div className="dsh-a6-balance-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshBalance}
              disabled={refreshing}
              data-tooltip={t('refreshBalanceTip')}
              data-tooltip-pos="down"
            >
              {refreshing ? t('refreshing') : t('refreshBalance')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open(CONSOLE_URL, '_blank', 'noopener')}
              data-tooltip={t('openConsoleTip')}
              data-tooltip-pos="down-left"
            >
              {t('openConsole')}
            </Button>
          </div>
        </div>

        {/* 2. Statistical KPI Cards */}
        <div className="dsh-a6-stat-cards-grid">
          <div className="dsh-a6-kpi-card">
            <span className="dsh-a6-kpi-label">{t('kpiAccount')}</span>
            <span className="dsh-a6-kpi-val">
              {hasAuth
                ? `${balance?.username || t('authedUser')} (#${balance?.userId || '—'})`
                : t('unconnected')}
            </span>
          </div>
          <div className="dsh-a6-kpi-card">
            <span className="dsh-a6-kpi-label">{t('kpiUsed')}</span>
            <span className="dsh-a6-kpi-val">
              {hasAuth ? `$${balance?.usedUsd?.toFixed(2) ?? '0.00'}` : '—'}
            </span>
          </div>
          <div className="dsh-a6-kpi-card">
            <span className="dsh-a6-kpi-label">{t('kpiRequests')}</span>
            <span className="dsh-a6-kpi-val">
              {hasAuth ? t('requestCount', { count: balance?.requestCount ?? 0 }) : '—'}
            </span>
          </div>
          <div className="dsh-a6-kpi-card">
            <span className="dsh-a6-kpi-label">{t('kpiRate')}</span>
            <span className="dsh-a6-kpi-val">{t('rateReference')}</span>
          </div>
        </div>
      </div>

      {/* 3. Auth Warning Banner if Not Connected */}
      {!hasAuth && (
        <div className="dsh-a6-auth-banner-box">
          <div className="dsh-a6-auth-banner-content">
            <div className="dsh-a6-auth-banner-title">{t('authBannerTitle')}</div>
            <div className="dsh-a6-auth-banner-desc">
              {t('authBannerDescPrefix')}
              <strong>{t('authBannerDescStrong')}</strong>
              {t('authBannerDescSuffix')}
            </div>
          </div>
          {onNavigateToConfig && (
            <Button variant="primary" size="sm" onClick={onNavigateToConfig}>
              {t('fillToken')}
            </Button>
          )}
        </div>
      )}

      {/* 4. Recent Routing Requests Snapshot */}
      <div className="dsh-a6-logs-section">
        <div className="dsh-a6-logs-header">
          <span className="dsh-a6-logs-title">{t('logsTitle')}</span>
          <span className="dsh-a6-logs-subtitle">{t('logsSubtitle')}</span>
        </div>

        {recentLogs && recentLogs.length > 0 ? (
          <div className="dsh-a6-logs-table-wrapper">
            <table className="dsh-a6-logs-table">
              <thead>
                <tr>
                  <th>{t('thTime')}</th>
                  <th>{t('thStatus')}</th>
                  <th>{t('thChannel')}</th>
                  <th>{t('thModel')}</th>
                  <th>{t('thTokens')}</th>
                  <th>{t('thCost')}</th>
                  <th>{t('thDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, idx) => {
                  const isErr =
                    log.status === 'error' ||
                    (log.status as string) === 'failed' ||
                    (log.raw && (
                      log.raw.type !== 2 ||
                      (log.raw.other && (
                        log.raw.other.includes('"request_final_status":"failed"') ||
                        log.raw.other.includes('"request_final_status":"error"') ||
                        log.raw.other.includes('"request_final_status":"upstream_error"')
                      )) ||
                      Boolean(log.raw.content && log.raw.content.startsWith('status_code='))
                    ));

                  const channelNum = Number(log.channel || log.raw?.channel || 0);

                  return (
                    <tr key={log.id || idx}>
                      <td className="dsh-a6-log-time">{formatLogTime(log.created_at)}</td>
                      <td>
                        <Tag tone={isErr ? 'danger' : 'success'}>
                          {isErr ? t('logFailed') : t('logSucceeded')}
                        </Tag>
                      </td>
                      <td className="dsh-a6-log-channel">
                        {channelNum > 0 ? (
                          <Tag tone="neutral">#{channelNum}</Tag>
                        ) : (
                          <span className="dsh-a6-log-channel-empty">{t('logNoChannel')}</span>
                        )}
                      </td>
                      <td className="dsh-a6-log-model">
                        <code>{log.model_name}</code>
                      </td>
                      <td className="dsh-a6-log-tokens">
                        {log.prompt_tokens || 0} / {log.completion_tokens || 0}
                      </td>
                      <td className="dsh-a6-log-cost">{log.cost_formatted || '$0.00'}</td>
                      <td className="dsh-a6-log-time-use">
                        {log.use_time ? `${log.use_time}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dsh-a6-empty-logs">
            <span>{t('emptyLogs')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export { AccountPanel as BalanceCard };
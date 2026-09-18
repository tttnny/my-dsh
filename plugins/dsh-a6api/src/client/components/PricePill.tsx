import React from 'react';
import type { PriceFluctuationState } from '../../types.js';

/**
 * 价格波动胶囊（设置页头部与输入框下方浮层共用）：
 * 未配置令牌显示 `--`（禁用），无变动置灰（禁用），有待处理时点击跳官网处理。
 * compact 为浮层内的紧凑缩窄版。
 */
export const PricePill: React.FC<{
  pf: PriceFluctuationState;
  hasToken: boolean;
  compact?: boolean;
}> = ({ pf, hasToken, compact }) => {
  const n = Number(pf?.pendingCount ?? 0);
  const hasAuth = pf?.hasAuth !== false && !pf?.authError && Boolean(hasToken);
  const isAuthError = Boolean(pf?.authError);
  const isZero = n === 0;
  const isDisabled = !hasAuth || isZero;
  const compactCls = compact ? ' compact' : '';
  const cls = isDisabled
    ? !hasAuth
      ? `dsh-a6-price-pill disabled${compactCls}`
      : `dsh-a6-price-pill is-zero is-disabled-zero${compactCls}`
    : `dsh-a6-price-pill has-change${compactCls}`;
  const title = !hasAuth
    ? isAuthError
      ? '系统访问令牌已失效，请前往基础配置更新'
      : '未配置系统访问令牌，无法获取价格变动'
    : isZero
      ? '暂无价格变动'
      : `有 ${n} 条价格变动待处理，点击前往官网处理`;
  const onClick = () => {
    if (isDisabled) return;
    window.open('https://a6api.com/console/token', '_blank', 'noopener');
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      className={cls}
      onClick={isDisabled ? undefined : onClick}
      onKeyDown={onKeyDown}
      tabIndex={isDisabled ? -1 : 0}
      title={title}
      role="button"
      aria-disabled={isDisabled}
      style={isDisabled ? { cursor: 'not-allowed' } : undefined}
    >
      <span className="dsh-a6-price-pill-label">价格波动：</span>
      <span className="dsh-a6-price-pill-count">{!hasAuth ? '--' : n}</span>
    </div>
  );
};

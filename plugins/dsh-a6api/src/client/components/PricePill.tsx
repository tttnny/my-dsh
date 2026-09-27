import React from 'react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { dictionaryT, type A6apiT } from '../locales.js';
import type { PriceFluctuationState } from '../../types.js';

/**
 * 价格波动胶囊（设置页头部与输入框下方浮层共用）：
 * 未配置令牌显示 `--`（禁用），无变动置灰（禁用），有待处理时点击跳官网处理。
 * compact 为浮层内的紧凑缩窄版。浮层侧注册未带 locale，故 `t` 缺省回落到本插件字典。
 * 悬停文案走原生 Tooltip；胶囊禁用时仍要能解释“为什么点不了”，标签因此挂在 Tooltip 上
 * （而非 `disabled`），`disabled` 只控制气泡显隐，保持锚点不重挂载。
 */
export const PricePill: React.FC<{
  pf: PriceFluctuationState;
  hasToken: boolean;
  t?: A6apiT;
  compact?: boolean;
}> = ({ pf, hasToken, t = dictionaryT, compact }) => {
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
  const tip = !hasAuth
    ? isAuthError
      ? t('priceTipAuthError')
      : t('priceTipNoToken')
    : isZero
      ? t('priceTipZero')
      : t('priceTipPending', { count: n });
  const onClick = () => {
    window.open('https://a6api.com/console/token', '_blank', 'noopener');
  };
  return (
    <Tooltip label={tip} side="bottom" align="end" gap={6} portal>
      <button
        type="button"
        className={cls}
        onClick={isDisabled ? undefined : onClick}
        disabled={isDisabled}
      >
        <span className="dsh-a6-price-pill-label">{t('priceLabel')}</span>
        <span className="dsh-a6-price-pill-count">{!hasAuth ? '--' : n}</span>
      </button>
    </Tooltip>
  );
};

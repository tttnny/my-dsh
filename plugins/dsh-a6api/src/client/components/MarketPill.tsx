import React from 'react';
import { dictionaryT, type A6apiT } from '../locales.js';

const MARKET_URL = 'https://a6api.com/models';

/**
 * 「模型市场」胶囊(仅输入框下方浮层):与账户余额 / 价格波动胶囊同款外观,
 * 点击直达 A6api 官网模型市场。浮层侧注册未带 locale，故 `t` 缺省回落到本插件字典。
 */
export const MarketPill: React.FC<{ t?: A6apiT }> = ({ t = dictionaryT }) => {
  const onClick = () => {
    window.open(MARKET_URL, '_blank', 'noopener');
  };
  return (
    <button
      type="button"
      className="dsh-a6-market-pill"
      onClick={onClick}
      title={t('marketTip')}
    >
      <span className="dsh-a6-market-pill-label">{t('marketLabel')}</span>
    </button>
  );
};
import React from 'react';

const MARKET_URL = 'https://a6api.com/models';

/**
 * 「模型市场」胶囊(仅侧边栏浮层):与账户余额 / 价格波动胶囊同款外观,
 * 点击直达 A6api 官网模型市场。
 */
export const MarketPill: React.FC = () => {
  const onClick = () => {
    window.open(MARKET_URL, '_blank', 'noopener');
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      className="dsh-a6-market-pill"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      title="前往 A6api 模型市场"
    >
      <span className="dsh-a6-market-pill-label">模型市场</span>
    </div>
  );
};

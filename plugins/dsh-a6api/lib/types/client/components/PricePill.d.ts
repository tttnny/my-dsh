import React from 'react';
import type { PriceFluctuationState } from '../../types.js';
/**
 * 价格波动胶囊（设置页头部与侧边栏浮层共用）：
 * 未配置令牌显示 `--`（禁用），无变动置灰（禁用），有待处理时点击跳官网处理。
 * compact 为浮层内的紧凑缩窄版。
 */
export declare const PricePill: React.FC<{
    pf: PriceFluctuationState;
    hasToken: boolean;
    compact?: boolean;
}>;

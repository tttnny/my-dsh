import React from 'react';
import type { BalanceInfo, A6ApiConfig, ApiRoutingLogItem } from '../../types.js';
export declare const AccountPanel: React.FC<{
    balance: BalanceInfo | null;
    config: A6ApiConfig;
    recentLogs?: ApiRoutingLogItem[];
    onNavigateToConfig?: () => void;
}>;
export { AccountPanel as BalanceCard };

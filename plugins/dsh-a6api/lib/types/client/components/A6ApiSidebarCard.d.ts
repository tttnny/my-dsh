import React from 'react';
interface A6ApiSidebarCardProps {
    /** 宿主注入:侧边栏是否宽布局(false = 56px rail) */
    wide: boolean;
    /** 宿主注入:会话列表快照钩子(取 current 即当前会话 ID) */
    useSessions?: (selector: (s: any) => any) => any;
    /** apply 注入:modelDirectories 服务访问器(与 composer 模型选择器同源) */
    getModelDirectories?: () => any;
}
/**
 * 侧边栏左下角「A6api」按钮 + 向上弹出浮层(任何会话均可展开):顶部为账户速览胶囊行,
 * 下方为当前会话模型对应的 MerchantCard;会话未使用 A6api 模型时卡片区域整体置灰不可交互。
 * 与设置页共享 A6ApiStore 单例:探测/轮询/操作结果实时同步。
 *
 * useSessions 是 React hook,不能条件调用:由外层按「壳是否注入」分派到两个固定
 * 分支(内层恒调用 / 无钩子分支恒不调用),规避 Rules of Hooks 风险。
 */
export declare const A6ApiSidebarCard: React.FC<A6ApiSidebarCardProps>;
export {};

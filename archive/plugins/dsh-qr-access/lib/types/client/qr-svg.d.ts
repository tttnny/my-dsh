import React from 'react';
export interface QrSvgProps {
    /** 编码内容（完整 URL）。 */
    text: string;
    /** 渲染边长（CSS px）。 */
    size?: number;
    /** 四周静区（模块数）。 */
    quietZone?: number;
}
/**
 * 二维码 SVG 组件：恒定白底深码（深色主题下也保证相机对比度），crispEdges
 * 防模糊；text 变化才重算矩阵。生成失败（超长等）时给出占位提示。
 */
export declare const QrSvg: React.MemoExoticComponent<({ text, size, quietZone, }: QrSvgProps) => React.ReactElement>;

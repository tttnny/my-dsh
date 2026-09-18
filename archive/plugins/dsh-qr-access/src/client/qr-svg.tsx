import React from 'react';
import { mergeRuns, qrMatrix } from './qr.ts';

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
export const QrSvg = React.memo(function QrSvg({
  text,
  size = 208,
  quietZone = 2,
}: QrSvgProps): React.ReactElement {
  const matrix = React.useMemo<boolean[][] | null>(() => {
    try {
      return qrMatrix(text);
    } catch {
      return null;
    }
  }, [text]);

  if (!matrix) {
    return <div className="dshqa-qr-fail">二维码生成失败（内容超长？）</div>;
  }

  const total = matrix.length + quietZone * 2;
  const rects: React.ReactElement[] = [];
  matrix.forEach((row, r) => {
    for (const [start, end] of mergeRuns(row)) {
      rects.push(
        <rect
          key={`${r}-${start}`}
          x={start + quietZone}
          y={r + quietZone}
          width={end - start}
          height={1}
        />,
      );
    }
  });

  return (
    <svg
      className="dshqa-qr-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="访问地址二维码"
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      <g fill="#111111">{rects}</g>
    </svg>
  );
});

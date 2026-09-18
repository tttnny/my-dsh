/**
 * 二维码生成：qrcode-generator（MIT，零依赖）打出模块矩阵，React 侧再渲染
 * 成 SVG。地址约百字符，矩阵不超过 45×45（版本 7），尺寸完全可控。
 */
import qrcode from 'qrcode-generator';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

/** 文本 → 布尔矩阵（typeNumber 0 = 按内容自动选版本；默认 M 纠错）。 */
export function qrMatrix(text: string, ecc: Ecc = 'M'): boolean[][] {
  const qr = qrcode(0, ecc);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < count; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < count; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/** 行程合并：把每行的连续暗段折叠为 [start, endExclusive)，SVG 节点数减半以上。 */
export function mergeRuns(row: readonly boolean[]): Array<readonly [number, number]> {
  const runs: Array<readonly [number, number]> = [];
  let start = -1;
  for (let c = 0; c < row.length; c++) {
    if (row[c] && start < 0) start = c;
    else if (!row[c] && start >= 0) {
      runs.push([start, c] as const);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, row.length] as const);
  return runs;
}

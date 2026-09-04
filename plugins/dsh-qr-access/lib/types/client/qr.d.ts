export type Ecc = 'L' | 'M' | 'Q' | 'H';
/** 文本 → 布尔矩阵（typeNumber 0 = 按内容自动选版本；默认 M 纠错）。 */
export declare function qrMatrix(text: string, ecc?: Ecc): boolean[][];
/** 行程合并：把每行的连续暗段折叠为 [start, endExclusive)，SVG 节点数减半以上。 */
export declare function mergeRuns(row: readonly boolean[]): Array<readonly [number, number]>;

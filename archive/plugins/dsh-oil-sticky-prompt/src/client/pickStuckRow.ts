export interface StuckRowBox {
  readonly key: string;
  readonly top: number;
}

const PIN = 0.5;
const RELEASE = 8;
/** 边界两侧允许的校正探测次数（正常单调布局下为 0 次）。 */
const CORRECTION_LIMIT = 4;

/**
 * 吸顶判定的唯一决策核：全量读取版 pickPinnedRow 与有界读取版
 * pickPinnedIndexBounded 共用它，保证两条读取路径语义不可能漂移。
 *
 * @param lastPastIndex 最后一条已越过滚动端口顶部的行号（-1 表示没有）
 * @param currentIndex  当前吸顶行号（-1 表示不在本次行列表中）
 * @param currentTop    当前吸顶行相对视口顶部的位置（仅在上面的分支需要时读取）
 */
function decidePinnedIndex(
  lastPastIndex: number,
  currentIndex: number,
  currentTop: number,
  scrollerTop: number,
): number {
  if (lastPastIndex > currentIndex) return lastPastIndex;
  if (currentIndex >= 0 && currentTop <= scrollerTop + RELEASE) return currentIndex;
  return lastPastIndex;
}

/** 参考实现：全量行列表，逐行比较。语义基准，供测试与有界版对照。 */
export function pickPinnedRow(
  rows: readonly StuckRowBox[],
  scrollerTop: number,
  currentKey?: string,
): string | undefined {
  let lastPastIndex = -1;
  for (const [index, row] of rows.entries()) {
    if (row.top <= scrollerTop + PIN) lastPastIndex = index;
  }

  const currentIndex = currentKey === undefined
    ? -1
    : rows.findIndex((row) => row.key === currentKey);
  const current = currentIndex === -1 ? undefined : rows[currentIndex];
  const index = decidePinnedIndex(
    lastPastIndex,
    currentIndex,
    current === undefined ? Number.POSITIVE_INFINITY : current.top,
    scrollerTop,
  );
  return index === -1 ? undefined : rows[index]?.key;
}

/**
 * 有界读取版：滚动帧里只做 O(log n) 次 getBoundingClientRect，替代原先 O(用户消息数) 次。
 *
 * 对话流里的 user 行按文档序自上而下堆叠，top 随行号单调不减，因此“最后一条越过顶部的行”
 * 可以用二分定位，结果与全量扫描一致；定位后在边界两侧各做少量校正探测，容忍个别非单调行，
 * 且校正次数有硬上限，永不退化成全量扫描。topOf 只允许做布局读，不得写 DOM。
 */
export function pickPinnedIndexBounded(
  rowCount: number,
  currentIndex: number,
  scrollerTop: number,
  topOf: (index: number) => number,
): number {
  if (rowCount <= 0) return -1;

  // 同一帧内同一行只测一次：二分探测与边界校正共享结果。
  const measured = new Map<number, number>();
  const top = (index: number): number => {
    const cached = measured.get(index);
    if (cached !== undefined) return cached;
    const value = topOf(index);
    measured.set(index, value);
    return value;
  };

  let low = 0;
  let high = rowCount; // 首个未越过顶部的行
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (top(middle) <= scrollerTop + PIN) low = middle + 1;
    else high = middle;
  }
  let lastPastIndex = low - 1;

  for (let step = 0; step < CORRECTION_LIMIT && lastPastIndex + 1 < rowCount; step += 1) {
    if (top(lastPastIndex + 1) > scrollerTop + PIN) break;
    lastPastIndex += 1;
  }
  for (let step = 0; step < CORRECTION_LIMIT && lastPastIndex >= 0; step += 1) {
    if (top(lastPastIndex) <= scrollerTop + PIN) break;
    lastPastIndex -= 1;
  }

  const currentTop = currentIndex !== -1 && lastPastIndex <= currentIndex
    ? top(currentIndex)
    : Number.POSITIVE_INFINITY;
  return decidePinnedIndex(lastPastIndex, currentIndex, currentTop, scrollerTop);
}

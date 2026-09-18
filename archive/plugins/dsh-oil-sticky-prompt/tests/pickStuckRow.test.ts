import { describe, expect, it } from "vitest";

import {
  pickPinnedIndexBounded,
  pickPinnedRow,
  type StuckRowBox,
} from "../src/client/pickStuckRow.ts";

function rowsFrom(tops: readonly number[]): StuckRowBox[] {
  return tops.map((top, index) => ({ key: `k${index}`, top }));
}

/** 有界读取版：把行号结果映射回 key，便于与参考实现对照。 */
function boundedPick(
  rows: readonly StuckRowBox[],
  scrollerTop: number,
  currentKey?: string,
): string | undefined {
  const currentIndex = currentKey === undefined
    ? -1
    : rows.findIndex((row) => row.key === currentKey);
  const index = pickPinnedIndexBounded(rows.length, currentIndex, scrollerTop, (position) => {
    const row = rows[position];
    return row === undefined ? Number.NEGATIVE_INFINITY : row.top;
  });
  return index === -1 ? undefined : rows[index]?.key;
}

describe("pickPinnedRow", () => {
  it("returns undefined when no row has reached the top", () => {
    expect(pickPinnedRow([
      { key: "a", top: 80 },
      { key: "b", top: 200 },
    ], 40)).toBeUndefined();
  });

  it("picks the last row that has crossed the top", () => {
    expect(pickPinnedRow([
      { key: "a", top: 20 },
      { key: "b", top: 180 },
    ], 40)).toBe("a");
  });

  it("lets a later row take over as it crosses the top", () => {
    expect(pickPinnedRow([
      { key: "a", top: -20 },
      { key: "b", top: 40 },
    ], 40)).toBe("b");
  });

  it("keeps the current row inside a small release band", () => {
    expect(pickPinnedRow([
      { key: "a", top: 46 },
      { key: "b", top: 180 },
    ], 40, "a")).toBe("a");
  });

  it("releases the current row once it is clearly below the top", () => {
    expect(pickPinnedRow([
      { key: "a", top: 56 },
      { key: "b", top: 180 },
    ], 40, "a")).toBeUndefined();
  });
});

describe("pickPinnedIndexBounded", () => {
  it("matches the reference implementation on vertically ordered rows", () => {
    const rows = rowsFrom([-4000, -1500, -240, -180, -60, 2, 48, 52, 90, 140, 640, 2400]);
    for (let scrollerTop = -200; scrollerTop <= 800; scrollerTop += 2) {
      for (const currentKey of [undefined, "k0", "k4", "k5", "k6", "k11", "missing"]) {
        expect(boundedPick(rows, scrollerTop, currentKey))
          .toBe(pickPinnedRow(rows, scrollerTop, currentKey));
      }
    }
  });

  it("handles empty, fully scrolled past and fully below lists", () => {
    expect(boundedPick([], 40)).toBeUndefined();
    expect(boundedPick(rowsFrom([-500, -400]), 40, "k0")).toBe("k1");
    expect(boundedPick(rowsFrom([-500, -400]), 40, "k1")).toBe("k1");
    expect(boundedPick(rowsFrom([80, 200]), 40)).toBeUndefined();
    expect(boundedPick(rowsFrom([80, 200]), 40, "k0")).toBeUndefined();
  });

  it("keeps the release band semantics for the pinned row", () => {
    const rows = rowsFrom([-10, 46, 300]);
    expect(boundedPick(rows, 40, "k1")).toBe("k1");
    expect(boundedPick(rowsFrom([-10, 56, 300]), 40, "k1")).toBe("k0");
  });

  it("reads a bounded number of row positions per frame", () => {
    const count = 4096;
    const rows = rowsFrom(Array.from({ length: count }, (_, index) => index * 40 - 80000));
    let reads = 0;
    const currentIndex = rows.findIndex((row) => row.key === "k2048");
    const index = pickPinnedIndexBounded(count, currentIndex, -100, (position) => {
      reads += 1;
      return rows[position]?.top ?? Number.NEGATIVE_INFINITY;
    });
    expect(rows[index]?.key).toBe(pickPinnedRow(rows, -100, "k2048"));
    // 原先每帧 O(用户消息数)=4096 次布局读，现在只允许 O(log n) 次。
    expect(reads).toBeLessThanOrEqual(16);
  });
});

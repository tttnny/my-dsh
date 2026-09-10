/**
 * CSS 属性选择器双引号值内的转义降级分支。
 *
 * 只需处理 \\ 与 "：反斜杠先转义，双引号必须转义成 \" —— 修复前误写成 \'，
 * 含双引号的 anchor key 会提前闭合属性选择器，querySelector 永远匹配不到。
 */
export function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 优先使用原生 CSS.escape；不可用时退回上面的属性选择器字符串转义。 */
export function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return escapeSelectorValue(value);
}

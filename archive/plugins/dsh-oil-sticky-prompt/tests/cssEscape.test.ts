import { describe, expect, it } from "vitest";

import { escapeSelectorValue } from "../src/client/cssEscape.ts";

describe("escapeSelectorValue", () => {
  it("escapes double quotes instead of single quotes", () => {
    expect(escapeSelectorValue('say "hi"')).toBe('say \\"hi\\"');
  });

  it("escapes backslashes first", () => {
    expect(escapeSelectorValue("back\\\\slash")).toBe("back\\\\\\\\slash");
  });

  it("keeps a quoted attribute selector closed and parseable", () => {
    const key = 'user-"quoted"-key';
    const escaped = escapeSelectorValue(key);
    const selector = `[data-chat-anchor-key="${escaped}"]`;
    // 修复前双引号被替换成反斜杠+单引号：选择器指向了错误的 key，永远匹配不到真实行。
    expect(escaped).toBe('user-\\"quoted\\"-key');
    expect(selector).toBe('[data-chat-anchor-key="user-\\"quoted\\"-key"]');
    // 每个 " 都必须紧跟在反斜杠之后（转义），selector 只剩首尾两个定界引号。
    const bare = [...escaped].filter((char, index) => char === '"' && escaped[index - 1] !== "\\");
    expect(bare).toHaveLength(0);
  });
});

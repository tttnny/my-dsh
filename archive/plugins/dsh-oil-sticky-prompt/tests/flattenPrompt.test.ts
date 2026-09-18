import { describe, expect, it } from "vitest";

import { flattenPromptText } from "../src/client/flattenPrompt.ts";

describe("flattenPromptText", () => {
  it("turns line breaks into single spaces", () => {
    expect(flattenPromptText("第一句很短\n第二句才是重点")).toBe("第一句很短 第二句才是重点");
  });

  it("collapses mixed whitespace", () => {
    expect(flattenPromptText("  hello\r\n\n\tworld  ")).toBe("hello world");
  });
});

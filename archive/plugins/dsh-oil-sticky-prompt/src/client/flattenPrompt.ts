/** Collapse original line breaks so a short first line does not hide the rest after clamp. */
export function flattenPromptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

import { resolvePrompt } from './prompt.ts';

/** 只比较会影响译文的设置，两端用同一套判据。 */
export function translationConfigKey(config: {
  prompt?: string;
  baseUrl?: string;
  model?: string;
}): string {
  return JSON.stringify([resolvePrompt(config.prompt), config.baseUrl?.trim() ?? '', config.model?.trim() ?? '']);
}

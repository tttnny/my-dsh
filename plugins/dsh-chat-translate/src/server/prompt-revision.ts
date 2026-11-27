import { createHash } from 'node:crypto';
import { translationConfigKey } from '../translation-config.ts';
import { SAMPLING_TEMPERATURE, SAMPLING_TOP_P } from './sampling.ts';

/** 内置提示词改变译文要求时递增此修订号。 */
export const PROMPT_REVISION = 'r7';

/** 磁盘缓存代号包含原文键格式、提示词、通道和采样参数。 */
export function cacheGeneration(config: Parameters<typeof translationConfigKey>[0] = {}): string {
  const source = [
    translationConfigKey(config),
    `temperature=${SAMPLING_TEMPERATURE}`,
    `top_p=${SAMPLING_TOP_P}`,
  ].join('\u0000');
  const digest = createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 12);
  return `exact-text:${PROMPT_REVISION}:${digest}`;
}

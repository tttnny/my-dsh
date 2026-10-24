import { TranslationFailure } from '../types.ts';
import type { ITranslationAdapter, PluginConfig, TranslateAdapterOptions } from '../types.ts';
import { TRANSLATE_API_KEY_REF } from '../credentials.ts';
import type { KeyReader } from '../credentials.ts';
import { BATCH_PROMPT_CLAUSE, resolvePrompt } from '../../prompt.ts';

/**
 * OpenAI-compatible Chat Completions translation channel.
 *
 * Talks to `POST {baseUrl}/chat/completions` with a Bearer token read from
 * ~/.dsh/.credentials.yaml (refs.TRANSLATE_API_KEY). Works with OpenAI,
 * DeepSeek, Qwen, Ollama and any other service exposing the standard endpoint.
 *
 * 系统指令的正文来自本插件的配置（配置页上可改），打包多段时再追加那段标记
 * 约定。指令正文本身连同它的写作要点住在 `src/prompt.ts`。
 */

/**
 * The translator instruction for one request: the configured prompt, and the
 * multi-part marker clause when the request packs several parts.
 *
 * Exported because it is the exact text the model receives as its system
 * message — the regression suite asserts on it directly rather than through a
 * request.
 *
 * @param mode - `plain` for one fragment, `blocks` for a packed multi-part request.
 * @param prompt - the prompt as configured; blank means the built-in default.
 * @returns the complete system prompt.
 */
export function buildSystemPrompt(mode: 'plain' | 'blocks', prompt?: string): string {
  const base = resolvePrompt(prompt);
  return mode === 'plain' ? base : `${base}\n\n${BATCH_PROMPT_CLAUSE}`;
}

export class OpenAiCompatibleAdapter implements ITranslationAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI 兼容 (Chat Completions)';

  private credentials: KeyReader;

  constructor(credentials: KeyReader) {
    this.credentials = credentials;
  }

  isAvailable(config: PluginConfig): boolean {
    return Boolean(config.baseUrl?.trim() && config.model?.trim() && this.credentials.getApiKey());
  }

  async translate(
    text: string,
    signal: AbortSignal,
    config: PluginConfig,
    options?: TranslateAdapterOptions
  ): Promise<string> {
    const apiKey = this.credentials.getApiKey();
    // 设置问题与通道伤分开报：前者的救法只有一个——去配置页把缺的那一项填上，
    // 所以它带上让人一眼看懂的一类，客户端的标签据此换文案。
    if (!apiKey) {
      throw new TranslationFailure(
        'not-configured',
        `${TRANSLATE_API_KEY_REF} is not configured in ~/.dsh/.credentials.yaml`
      );
    }
    const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '');
    const model = (config.model || '').trim();
    if (!baseUrl || !model) {
      throw new TranslationFailure(
        'not-configured',
        `OpenAI channel: ${!baseUrl ? 'baseUrl' : 'model'} is not configured`
      );
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        ...(options?.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        messages: [
          { role: 'system', content: buildSystemPrompt(options?.mode ?? 'plain', config.prompt) },
          { role: 'user', content: text },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errBody = (await response.json()) as { error?: { message?: string }; message?: string };
        detail = errBody?.error?.message || errBody?.message || '';
      } catch {
        // ignore body parse errors
      }
      throw new TranslationFailure(
        'channel',
        `OpenAI-compatible API responded with ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content;
    const translated = typeof content === 'string' ? content.trim() : '';
    if (!translated) {
      throw new Error('OpenAI-compatible API returned empty content');
    }
    return translated;
  }
}

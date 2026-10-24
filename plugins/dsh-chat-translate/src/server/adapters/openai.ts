import { TranslationFailure } from '../types.ts';
import type { ITranslationAdapter, PluginConfig, TranslateAdapterOptions } from '../types.ts';
import { TRANSLATE_API_KEY_REF } from '../credentials.ts';
import type { KeyReader } from '../credentials.ts';
import { BATCH_PROMPT_CLAUSE, resolvePrompt } from '../../prompt.ts';
import { SAMPLING_TEMPERATURE, SAMPLING_TOP_P } from '../sampling.ts';

/**
 * OpenAI-compatible Chat Completions translation channel.
 *
 * Talks to `POST {baseUrl}/chat/completions` with a Bearer token read from
 * ~/.dsh/.credentials.yaml (refs.TRANSLATE_API_KEY). Works with OpenAI,
 * DeepSeek, Qwen, Ollama and any other service exposing the standard endpoint.
 *
 * 请求里只有一条 user 消息：指令在前、待译正文在后，与 Hy-MT 系列的训练分布
 * 一致。指令正文连同它的写作要点住在 `src/prompt.ts`。
 */

/**
 * 一条请求的前缀：配置页上那段指令，打包多段时再接上标记约定。
 *
 * 导出是因为它就是模型在正文之前原样收到的那段文字——回归测试直接断言它，
 * 而不是绕一圈发一个请求。
 *
 * @param mode - `plain` for one fragment, `blocks` for a packed multi-part request.
 * @param prompt - the prompt as configured; blank means the built-in default.
 * @returns the complete request prefix.
 */
export function buildRequestPrefix(mode: 'plain' | 'blocks', prompt?: string): string {
  const base = resolvePrompt(prompt);
  return mode === 'plain' ? base : `${base}\n\n${BATCH_PROMPT_CLAUSE}`;
}

/**
 * 一条请求的 user 消息：前缀在前，待译正文在后，中间空一行。
 *
 * @param mode - `plain` for one fragment, `blocks` for a packed multi-part request.
 * @param text - the text to translate, markers included when packed.
 * @param prompt - the prompt as configured; blank means the built-in default.
 * @returns the user message content.
 */
export function buildUserMessage(mode: 'plain' | 'blocks', text: string, prompt?: string): string {
  return `${buildRequestPrefix(mode, prompt)}\n\n${text}`;
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
        temperature: SAMPLING_TEMPERATURE,
        top_p: SAMPLING_TOP_P,
        ...(options?.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        messages: [
          {
            role: 'user',
            content: buildUserMessage(options?.mode ?? 'plain', text, config.prompt),
          },
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

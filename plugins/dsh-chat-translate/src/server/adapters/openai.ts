import type { ITranslationAdapter, PluginConfig } from './base.ts';
import type { KeyReader } from '../credentials.ts';

/**
 * OpenAI-compatible Chat Completions translation channel.
 *
 * Talks to `POST {baseUrl}/chat/completions` with a Bearer token read from
 * ~/.dsh/.credentials.yaml (refs.TRANSLATE_API_KEY). Works with OpenAI,
 * DeepSeek, Qwen, Ollama and any other service exposing the standard endpoint.
 */

/** Map Bing-style targetLang codes to a natural language name for the prompt. */
const LANG_HINTS: Record<string, string> = {
  'zh-hans': 'Simplified Chinese',
  'zh-cn': 'Simplified Chinese',
  'zh': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  'zh-hant': 'Traditional Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese',
  it: 'Italian',
};

export class OpenAiCompatibleAdapter implements ITranslationAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI 兼容 (Chat Completions)';

  private credentials: KeyReader;

  constructor(credentials: KeyReader) {
    this.credentials = credentials;
  }

  isAvailable(config: PluginConfig): boolean {
    return Boolean(
      config.aiEnabled && config.baseUrl?.trim() && config.model?.trim() && this.credentials.getApiKey()
    );
  }

  async translate(text: string, signal: AbortSignal, config: PluginConfig): Promise<string> {
    const apiKey = this.credentials.getApiKey();
    if (!apiKey) {
      throw new Error(`TRANSLATE_API_KEY is not configured in ~/.dsh/.credentials.yaml`);
    }
    const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '');
    const model = (config.model || '').trim();
    if (!baseUrl || !model) {
      throw new Error('OpenAI channel: baseUrl or model is not configured');
    }

    const langName = LANG_HINTS[(config.targetLang || 'zh-Hans').toLowerCase()] || config.targetLang || 'Simplified Chinese';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              `You are a professional translator. Translate the user's message into ${langName}. ` +
              `Output ONLY the translated text — no explanations, no quotation marks, no extra words. ` +
              // The placeholder is described by its shape alone. Naming any of
              // its characters gives a small model something to echo: the old
              // prompt spelled the marker out and the UI filled up with that
              // word repeated once per protected fragment.
              `Some fragments of the message are opaque code between the bracket ` +
              `characters U+27E6 and U+27E7. Copy each such fragment into your output ` +
              `character-for-character, keeping its position in the sentence. ` +
              `Never invent such a fragment and never remove one.`,
          },
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
      throw new Error(`OpenAI-compatible API responded with ${response.status}${detail ? `: ${detail}` : ''}`);
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

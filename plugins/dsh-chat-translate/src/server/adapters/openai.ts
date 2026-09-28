import type {
  ITranslationAdapter,
  PluginConfig,
  TranslateAdapterOptions,
} from './base.ts';
import type { KeyReader } from '../credentials.ts';

/**
 * OpenAI-compatible Chat Completions translation channel.
 *
 * Talks to `POST {baseUrl}/chat/completions` with a Bearer token read from
 * ~/.dsh/.credentials.yaml (refs.TRANSLATE_API_KEY). Works with OpenAI,
 * DeepSeek, Qwen, Ollama and any other service exposing the standard endpoint.
 */

/**
 * The translator instruction. The placeholder is described by its shape alone:
 * naming any of its characters gives a small model something to echo. The
 * multi-part variant adds the block markers of a packed reply request — same
 * bracket-shape description, so the model never sees a token it could
 * reproduce as a word.
 *
 * Every passage is processed, including passages already in Chinese: weak
 * models write stiff machine-flavored Chinese ("硅基中文"), and that is the
 * same defect translation fixes, so Chinese gets a polishing pass too. Input
 * is reply Markdown and output is re-rendered as Markdown by the client, so
 * the instruction pins the markup: translate prose only, never add, remove,
 * or reorder Markdown syntax.
 *
 * Prompt semantics are registered in `prompt-revision.ts`; changing what this
 * prompt asks the model to do means bumping that revision with it.
 */
const TARGET_LANGUAGE = 'Simplified Chinese';

function buildSystemPrompt(mode: 'plain' | 'blocks'): string {
  const base =
    `You are a professional translator and editor. ` +
    `Rewrite the user's message as natural, idiomatic ${TARGET_LANGUAGE} the way a ` +
    `native writer would produce it. ` +
    `This applies to every passage, including passages already written in ` +
    `${TARGET_LANGUAGE}: smooth out stiff or machine-translated phrasing while ` +
    `keeping the meaning, tone, proper names, numbers and technical terms ` +
    `unchanged. Never drop content and never add content. ` +
    `The message is Markdown that will be re-rendered as Markdown: translate ` +
    `the prose only, and keep every Markdown construct exactly as authored — ` +
    `headings, list markers, table pipes and cell order, quote markers, bold ` +
    `and emphasis runs, links, and inline code. Never add, remove, reorder, ` +
    `or nest Markdown syntax of your own. ` +
    `Output ONLY the resulting text — no explanations, no quotation marks, no extra words, ` +
    `no code fence around the whole answer. ` +
    `Some fragments of the message are opaque code between the bracket ` +
    `characters U+27E6 and U+27E7. Copy each such fragment into your output ` +
    `character-for-character, keeping its position in the sentence. ` +
    `Never invent such a fragment and never remove one.`;
  if (mode === 'plain') return base;
  return (
    base +
    ` The message is a sequence of parts. Each part starts with its own line ` +
    `holding a marker: an index between the bracket characters U+27EA and ` +
    `U+27EB. For every part, output its marker line unchanged, then that ` +
    `part's rewrite on the following lines. Rewrite each part on its ` +
    `own, keep the parts in the original order, and never merge two parts ` +
    `into one answer.`
  );
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
    if (!apiKey) {
      throw new Error(`TRANSLATE_API_KEY is not configured in ~/.dsh/.credentials.yaml`);
    }
    const baseUrl = (config.baseUrl || '').trim().replace(/\/+$/, '');
    const model = (config.model || '').trim();
    if (!baseUrl || !model) {
      throw new Error('OpenAI channel: baseUrl or model is not configured');
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
          { role: 'system', content: buildSystemPrompt(options?.mode ?? 'plain') },
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

import { describeError } from '../../describe-error.ts';

export interface TranslateItemResult {
  original: string;
  translated: string;
  channel: string;
  cached: boolean;
}

export interface TranslateBatchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** 思考正文一个块的翻译结果，与请求的块列表按下标对齐。 */
export interface ThinkBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  channel: string;
}

export async function requestTranslateBatch(
  texts: string[],
  options: TranslateBatchOptions = {}
): Promise<TranslateItemResult[]> {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  
  // Filter out empty or whitespace-only texts
  const validTexts = texts.map((t) => (typeof t === 'string' ? t : ''));
  if (validTexts.length === 0) return [];

  const controller = new AbortController();
  const timeoutId = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;

  const effectiveSignal = options.signal
    ? (options.signal.aborted ? options.signal : controller.signal)
    : controller.signal;

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch('/api/dsh-chat-translate/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ texts: validTexts }),
      signal: effectiveSignal,
    });

    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; results?: TranslateItemResult[]; error?: string };
      if (data.ok && Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      } else if (data.error) {
        console.warn(`[dsh-chat-translate] 翻译接口错误: ${data.error}`);
      }
    } else {
      console.warn(`[dsh-chat-translate] 翻译请求失败 (HTTP ${res.status})`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // Intentionally aborted
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }

  // Host route unreachable or error — leave the original text untouched
  return validTexts.map((t) => ({
    original: t,
    translated: t,
    channel: 'fallback-client',
    cached: false,
  }));
}

/**
 * 请求翻译思考正文的块。宿主侧按输入上限打包、串行发送，客户端超时交给
 * 宿主（思考块可能要几分钟），这里不设自己的截止时间。
 */
export async function requestTranslateThink(blocks: string[]): Promise<ThinkBlockResult[]> {
  const fallback = (): ThinkBlockResult[] =>
    blocks.map((block) => ({
      original: block,
      translated: block,
      ok: false,
      cached: false,
      channel: 'fallback-client',
    }));

  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  try {
    const res = await fetch('/api/dsh-chat-translate/translate-think', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        results?: ThinkBlockResult[];
        error?: string;
      };
      if (data.ok && Array.isArray(data.results) && data.results.length === blocks.length) {
        return data.results;
      }
      if (data.error) {
        console.warn(`[dsh-chat-translate] 思考链翻译接口错误: ${data.error}`);
      }
    } else {
      console.warn(`[dsh-chat-translate] 思考链翻译请求失败 (HTTP ${res.status})`);
    }
  } catch (err: any) {
    console.warn(`[dsh-chat-translate] 思考链翻译请求异常: ${describeError(err)}`);
  }
  return fallback();
}

export async function testServerChannel(channel: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  try {
    const res = await fetch('/api/dsh-chat-translate/test-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, latencyMs: 0, error: describeError(err) };
  }
}

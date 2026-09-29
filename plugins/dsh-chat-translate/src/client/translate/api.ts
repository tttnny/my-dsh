import { describeError } from '../../describe-error.ts';

/** 失败分类：与宿主半边同名类型对齐——传输失败画红实线、内容拒收画红虚线。 */
export type ReplyFailReason = 'transport' | 'content';

/** 正文一个块的翻译结果，与请求的块列表按下标对齐。 */
export interface ReplyBlockResult {
  original: string;
  translated: string;
  ok: boolean;
  cached: boolean;
  /** 仅 ok=false 时出现。 */
  reason?: ReplyFailReason;
}

/**
 * 请求翻译回答正文的块。宿主侧按输入上限打包、串行发送，客户端超时交给
 * 宿主（一个长回答可能要几分钟），这里不设自己的截止时间。
 */
export async function requestTranslateReply(blocks: string[]): Promise<ReplyBlockResult[]> {
  const fallback = (): ReplyBlockResult[] =>
    blocks.map((block) => ({
      original: block,
      translated: block,
      ok: false,
      cached: false,
      reason: 'transport' as ReplyFailReason,
    }));

  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  try {
    const res = await fetch('/api/dsh-chat-translate/translate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        results?: ReplyBlockResult[];
        error?: string;
      };
      if (data.ok && Array.isArray(data.results) && data.results.length === blocks.length) {
        return data.results;
      }
      if (data.error) {
        console.warn(`[dsh-chat-translate] 正文翻译接口错误: ${data.error}`);
      }
    } else {
      console.warn(`[dsh-chat-translate] 正文翻译请求失败 (HTTP ${res.status})`);
    }
  } catch (err: any) {
    console.warn(`[dsh-chat-translate] 正文翻译请求异常: ${describeError(err)}`);
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

/**
 * 上游网络层助手：网络级瞬断的单发自动重试。
 *
 * 实测依据（2026-09，Node 24 undici 全接口测试矩阵）：
 * A6API 上游 nginx/CDN 积极回收空闲 keep-alive 连接（实测阈值在 60~95s 之间），
 * 连接池拿到被对端静默关闭的"死 socket"时，首个请求约 5s 后抛
 * `TypeError: fetch failed`（cause: ECONNRESET），新连接重试立即成功；
 * 热连接连发期 0/54 失败，随机整体约 2~5% 请求死在传输层。
 *
 * 这类错误发生在传输层——请求确定未收到任何响应（不会计费、无副作用），
 * 是唯一适合盲重试的类别。超时（TimeoutError）不重试：请求可能已在上游处理。
 */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 网络级瞬断判定（确定未收到响应，可安全重试）；超时/中止不在其列 */
export function isFlakyNetworkError(err: any): boolean {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return false;
  const cause = err?.cause;
  const raw = `${err?.message || ''} ${cause?.code || ''} ${cause?.message || ''}`;
  return /fetch failed|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EPIPE|socket hang up|other side closed|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|SSL_ERROR|ERR_SSL/i.test(
    raw,
  );
}

export interface RetryFetchInit extends RequestInit {
  /** 每次尝试独立的超时窗口（ms）；设置后替代 init.signal，重试不会被首发耗尽的时间窗直接掐死 */
  timeoutMs?: number;
}

/**
 * fetch + 网络级瞬断自动重试（默认 1 次、间隔 800ms）。
 * HTTP 状态错误（4xx/5xx）原样返回 Response 由调用方处理；只有抛出的传输层错误才重试。
 */
export async function fetchWithNetRetry(
  url: string,
  init: RetryFetchInit = {},
  opts?: { retries?: number; delayMs?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 1;
  const delayMs = opts?.delayMs ?? 800;
  const { timeoutMs, ...rest } = init;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : rest.signal;
      return await fetch(url, { ...rest, signal });
    } catch (err: any) {
      lastErr = err;
      if (attempt < retries && isFlakyNetworkError(err)) {
        console.warn(
          `[dsh-a6api] 上游连接瞬断(${err?.cause?.code || err?.message || 'network'})，${delayMs}ms 后重试:`,
          url.split('?')[0],
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

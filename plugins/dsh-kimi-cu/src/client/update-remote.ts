/** 卡片读更新检查、跑更新时用的两次 Fetch：走 Connection 的 /api 通道，失败不抛。 */

import {
  UPDATE_ROUTE_PATH,
  type UpdateCheck,
  type UpdateEvent,
} from '../shared/update.ts';

/** 一次检查的结果。 */
export type UpdateCheckResult =
  | { kind: 'ok'; check: UpdateCheck }
  | { kind: 'error'; message: string };

/**
 * 读一次更新检查结果。
 * @returns 检查结果或错误。
 */
export async function fetchUpdateCheck(): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(UPDATE_ROUTE_PATH, { cache: 'no-store' });
    if (!response.ok) return { kind: 'error', message: 'HTTP ' + String(response.status) };
    const body = await response.json() as { error?: unknown } & Partial<UpdateCheck>;
    if (typeof body.error === 'string') return { kind: 'error', message: body.error };
    return { kind: 'ok', check: body as UpdateCheck };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 跑一次更新，事件按行到达。
 * @param onEvent - 每收到一个事件回调一次。
 * @returns 流正常结束或失败的原因。
 */
export async function startUpdate(onEvent: (event: UpdateEvent) => void): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(UPDATE_ROUTE_PATH, { method: 'POST', cache: 'no-store' });
    if (!response.ok) return { ok: false, message: 'HTTP ' + String(response.status) };
    if (response.body === null) return { ok: false, message: 'empty response' };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          onEvent(JSON.parse(line) as UpdateEvent);
        } catch {
          // 半行或坏行：忽略，等下一块。
        }
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** 卡片读宿主状态的那一次 Fetch：走 Connection 的 /api 通道，失败不抛。 */

import { STATUS_ROUTE_PATH, type KimiCuStatus } from '../shared/status.ts';

/** 一次读取的结果。 */
export type StatusResult =
  | { kind: 'ok'; status: KimiCuStatus }
  | { kind: 'error'; message: string };

/**
 * 读一次状态。
 * @param refresh - true 时绕过宿主缓存。
 * @returns 状态或错误。
 */
export async function fetchStatus(refresh = false): Promise<StatusResult> {
  try {
    const url = refresh ? STATUS_ROUTE_PATH + '?refresh=1' : STATUS_ROUTE_PATH;
    const response = await fetch(url);
    if (!response.ok) return { kind: 'error', message: 'HTTP ' + String(response.status) };
    const body = await response.json() as { error?: unknown } & Partial<KimiCuStatus>;
    if (typeof body.error === 'string') return { kind: 'error', message: body.error };
    return { kind: 'ok', status: body as KimiCuStatus };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 状态路由：插件页卡片走 Connection 的 /api 通道读它。
 *
 * 只读；`?refresh=1` 绕过探测缓存。探测失败返回 500 与错误文本，卡片据此显示重试。
 */

import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';

import { STATUS_ROUTE_PATH, type KimiCuStatus } from '../shared/status.ts';

/**
 * 造状态路由。
 * @param detect - 探测器。
 * @returns 交给 Connection 注册的 Fetch 路由。
 */
export function createStatusRoute(
  detect: (refresh?: boolean) => Promise<KimiCuStatus>,
): ConnectionFetchRoute {
  return {
    path: STATUS_ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      try {
        const refresh = new URL(request.url).searchParams.get('refresh') === '1';
        const status = await detect(refresh);
        return new Response(JSON.stringify(status), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          },
        );
      }
    },
  };
}

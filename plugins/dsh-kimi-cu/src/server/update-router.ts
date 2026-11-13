/**
 * 更新路由：GET 读一次检查结果，POST 跑一次更新并把事件写成 NDJSON 流。
 *
 * 两条方法共用一条路径：卡片打开时 GET 一次决定按钮文案，点击时 POST 一条长连接，
 * 事件按行到达，所以「一行阶段文字」是实时的，不需要另开轮询路由。
 */

import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';

import { UPDATE_ROUTE_PATH, type UpdateEvent } from '../shared/update.ts';
import type { Updater } from './update.ts';

/** JSON 响应。 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * 造更新路由。
 * @param updater - 更新器。
 * @returns 交给 Connection 注册的 Fetch 路由。
 */
export function createUpdateRoute(updater: Updater): ConnectionFetchRoute {
  return {
    path: UPDATE_ROUTE_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      if (request.method === 'GET') {
        try {
          return json(await updater.check());
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const emit = (event: UpdateEvent): void => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            } catch {
              closed = true;
            }
          };
          void updater.run(emit)
            .catch((error: unknown) => {
              emit({ type: 'error', kind: 'unknown', raw: error instanceof Error ? error.message : String(error) });
            })
            .finally(() => {
              if (closed) return;
              closed = true;
              controller.close();
            });
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    },
  };
}

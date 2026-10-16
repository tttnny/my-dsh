/**
 * This plugin's exact Fetch routes, carried by Connection's authenticated
 * `/api` transport below the shared channel.
 *
 * Three surfaces, and no fourth: configuration is read and written through
 * DSH's own shared configuration form (`ctx.configForms`) and the `credentials`
 * Remote API, so nothing here touches either. What is left is what only the
 * Host knows — the runtime log, the exact text a judgement would send, and
 * whether the judge endpoint answers at all.
 */

import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';
import { buildPreview, selectableRows } from './judge-prompt.ts';
import { probeJudge } from './judge-client.ts';
import type { ResolvedConfig } from './config.ts';
import type { LogEntry } from './types.ts';

/** Runtime log route path. */
export const LOG_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/log';

/** Exact judge-prompt preview route path. */
export const PREVIEW_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/preview';

/** Judge endpoint probe route path. */
export const PROBE_ROUTE_PATH = '/api/dsh-subagent-judge-dispatch/probe';

function sendJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** What one probe reports back to the page. */
export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  /** Which failure it was, when it failed. */
  reason?: string;
}

/** The Host-side face the routes read. */
export interface DispatchRouteFace {
  /** Current committed configuration. */
  config(): ResolvedConfig;
  /** Read the runtime log, newest first. */
  log(): LogEntry[];
  /** The judge key resolved from credentials, or '' when unset. */
  apiKey(): string;
}

/**
 * Build this plugin's Fetch routes.
 * @param face - the Host-side reads the routes serve.
 * @returns the routes to register on Connection.
 */
export function createFetchRoutes(face: DispatchRouteFace): ConnectionFetchRoute[] {
  const log: ConnectionFetchRoute = {
    path: LOG_ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        return sendJson(200, { ok: true, entries: face.log() });
      } catch (err) {
        return sendJson(500, { ok: false, error: describe(err) });
      }
    },
  };

  const preview: ConnectionFetchRoute = {
    path: PREVIEW_ROUTE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        const config = face.config();
        // Built by the same function the real call uses, so what the page shows
        // cannot drift from what goes out.
        const text = buildPreview(selectableRows(config.rows), config.judgeModel.trim());
        return sendJson(200, { ok: true, preview: text });
      } catch (err) {
        return sendJson(500, { ok: false, error: describe(err) });
      }
    },
  };

  const probe: ConnectionFetchRoute = {
    path: PROBE_ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        const config = face.config();
        // 只问「这个地址与模型答不答得上来」，所以不问类型清单：清单是判断时才
        // 需要的输入，拿它当作能不能测的前提，会让空清单的读者以为服务坏了。
        const outcome = await probeJudge({
          url: config.endpointUrl,
          model: config.judgeModel,
          apiKey: face.apiKey(),
        });
        return sendJson(200, { ...outcome } satisfies ProbeResult);
      } catch (err) {
        return sendJson(500, { ok: false, error: describe(err) });
      }
    },
  };

  return [log, preview, probe];
}

/** One-line error text for a route failure. */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

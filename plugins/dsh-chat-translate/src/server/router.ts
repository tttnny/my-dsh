import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';
import { describeError } from '../describe-error.ts';
import type { TranslationDispatcher } from './dispatcher.ts';

/**
 * Translation proxy surface, carried by Connection's exact Fetch routes below
 * the shared `/api` channel.
 *
 * Config and credentials have no HTTP endpoints: since 1.2 the settings panel
 * reads and writes through DSH's own channels — the shared configuration form
 * (`ctx.configForms`) over the profile entry, and the `credentials` Remote API
 * for the key — so the plugin owns exactly three routes: short-text batch
 * translation, think-chain block translation, and the channel probe.
 */

/** Batch-translation route path. */
export const TRANSLATE_ROUTE_PATH = '/api/dsh-chat-translate/translate';

/** Single-channel probe route path. */
export const TEST_CHANNEL_ROUTE_PATH = '/api/dsh-chat-translate/test-channel';

/** Think-chain block translation route path. */
export const THINK_ROUTE_PATH = '/api/dsh-chat-translate/translate-think';

function sendJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Decode one buffered JSON request body.
 * @returns the parsed value, or the 400 response the caller must return.
 */
async function readJson(request: Request): Promise<
  { ok: true; value: any } | { ok: false; response: Response }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: sendJson(400, { ok: false, error: 'Invalid JSON body' }) };
  }
}

/**
 * Build the plugin's exact Fetch routes.
 * @param dispatcher - translation coordinator the routes proxy to.
 * @param ready - settles once host-side async resources are usable; every
 * request waits for it before touching the dispatcher.
 */
export function createFetchRoutes(
  dispatcher: TranslationDispatcher,
  ready: Promise<unknown> = Promise.resolve()
): ConnectionFetchRoute[] {
  const translate: ConnectionFetchRoute = {
    path: TRANSLATE_ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      await ready;
      try {
        const body = await readJson(request);
        if (!body.ok) return body.response;
        const parsed = body.value;
        const rawTexts: unknown = parsed.texts !== undefined ? parsed.texts : parsed.text;

        let texts: string[] = [];
        if (Array.isArray(rawTexts)) {
          texts = rawTexts.filter((t): t is string => typeof t === 'string');
        } else if (typeof rawTexts === 'string') {
          texts = [rawTexts];
        }

        const forceRefresh = Boolean(parsed.forceRefresh);

        if (texts.length === 0) {
          return sendJson(200, { ok: true, results: [] });
        }

        const results = await dispatcher.translateBatch(texts, forceRefresh);
        return sendJson(200, { ok: true, results });
      } catch (err: any) {
        return sendJson(500, { ok: false, error: describeError(err) });
      }
    },
  };

  const think: ConnectionFetchRoute = {
    path: THINK_ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      await ready;
      try {
        const body = await readJson(request);
        if (!body.ok) return body.response;
        const rawBlocks: unknown = body.value?.blocks;
        const blocks = Array.isArray(rawBlocks)
          ? rawBlocks.filter((block): block is string => typeof block === 'string')
          : [];
        if (blocks.length === 0) {
          return sendJson(200, { ok: true, results: [] });
        }
        const results = await dispatcher.translateThinkBlocks(blocks);
        return sendJson(200, { ok: true, results });
      } catch (err: any) {
        return sendJson(500, { ok: false, error: describeError(err) });
      }
    },
  };

  const testChannel: ConnectionFetchRoute = {
    path: TEST_CHANNEL_ROUTE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      await ready;
      try {
        const body = await readJson(request);
        if (!body.ok) return body.response;
        const channelId = typeof body.value.channel === 'string' ? body.value.channel : '';
        const result = await dispatcher.testChannel(channelId);
        return sendJson(200, result);
      } catch (err: any) {
        return sendJson(500, { ok: false, error: describeError(err) });
      }
    },
  };

  return [translate, think, testChannel];
}

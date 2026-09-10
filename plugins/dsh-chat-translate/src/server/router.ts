import type { IncomingMessage, ServerResponse } from 'node:http';
import { describeError } from '../describe-error.ts';
import type { ConfigManager } from './config.ts';
import type { TranslationDispatcher } from './dispatcher.ts';

const MAX_BODY_BYTES = 1024 * 1024; // 1MB body limit to prevent DoS

/**
 * HTTP surface for the translation proxy only.
 *
 * Config and credentials no longer have HTTP endpoints: since 1.2 the
 * settings panel reads/writes through DSH's own channels — the
 * `settingsScope` client service and the `credentials` Remote API — so the
 * plugin exposes exactly one route family to the browser: translation.
 */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalLength += buf.length;
      if (totalLength > MAX_BODY_BYTES) {
        if (typeof req.destroy === 'function') {
          req.destroy();
        }
        reject(new Error('Request body exceeded maximum allowed size (1MB)'));
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function createHttpHandler(configManager: ConfigManager, dispatcher: TranslationDispatcher) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathParts = url.pathname.split('/').filter(Boolean);
    // pathParts will start with ['api', 'dsh-chat-translate', ...]
    const endpoint = pathParts[2] || '';

    try {
      if (endpoint === 'translate' && req.method === 'POST') {
        const raw = await readBody(req);
        let parsed: any;
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
          return;
        }
        const rawTexts: unknown = parsed.texts !== undefined ? parsed.texts : parsed.text;

        let texts: string[] = [];
        if (Array.isArray(rawTexts)) {
          texts = rawTexts.filter((t): t is string => typeof t === 'string');
        } else if (typeof rawTexts === 'string') {
          texts = [rawTexts];
        }

        const forceRefresh = Boolean(parsed.forceRefresh);

        if (texts.length === 0) {
          sendJson(res, 200, { ok: true, results: [] });
          return;
        }

        const results = await dispatcher.translateBatch(texts, forceRefresh);
        sendJson(res, 200, { ok: true, results });
        return;
      }

      if (endpoint === 'test-channel' && req.method === 'POST') {
        const raw = await readBody(req);
        let parsed: any;
        try {
          parsed = JSON.parse(raw || '{}');
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
          return;
        }
        const channelId = typeof parsed.channel === 'string' ? parsed.channel : '';
        const result = await dispatcher.testChannel(channelId);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
    } catch (err: any) {
      const status = err?.message?.includes('exceeded maximum allowed size') ? 413 : 500;
      sendJson(res, status, { ok: false, error: describeError(err) });
    }
  };
}

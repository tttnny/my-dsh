import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import * as mcpClient from '@deepseek-ai/dsh-mcp-client';

/**
 * @lynn123411/dsh-browseros-neo — zero-config BrowserOS neo MCP mount.
 *
 * This plugin does exactly one thing: mount the official
 * @deepseek-ai/dsh-mcp-client bridge — unchanged, no transport tuning, no
 * timeout tweaks, serverName `browseros-neo` so tools appear as
 * `mcp__browseros-neo__*`, same shape Claude Code / Codex get — with an
 * endpoint a bare config line cannot resolve: the real URL is read from
 * BrowserOS neo's own runtime file ~/.browserclaw/runtime.json (the
 * documented 9200 is only the fallback; neo picks another port when 9200 is
 * taken), with `/mcp` appended.
 *
 * Everything else about neo's lifecycle belongs to the official bridge:
 *   - Connection failures (including "DSH started before Neo") retry with
 *     backoff for ~10 attempts over ~2.5 minutes and re-register tools on a
 *     successful connect; a connection that stays up past the stability
 *     window resets that budget, so a quick Neo restart self-heals.
 *   - After the budget is exhausted tools unregister; recovery is the
 *     bridge's own documented way back — reload this plugin (re-save the
 *     profile's cordis.patch.yml) or restart the DSH process. The endpoint is
 *     re-read from runtime.json on every mount.
 *   - Known upstream gap: the MCP TS SDK does not implement the spec's
 *     "session 404 → re-initialize", so after a Neo process swap the bridge
 *     can keep answering `Session not found` without ever noticing the
 *     outage. This wrapper deliberately does not intervene; same manual
 *     recovery as above.
 *
 * The auto-installed browseros-neo skill is left exactly as upstream wrote
 * it. No launch tool, no settings UI, no supervisor: configuration, nothing
 * more.
 */

/** Cordis loader entry name (matches the patch row id). */
export const name = 'dsh-browseros-neo';

/** Only ctx.plugin and ctx.logger are used. */
export const inject = [];

const SERVER_NAME = 'browseros-neo';
const FALLBACK_URL = 'http://127.0.0.1:9200/mcp';

/** Real endpoint per BrowserOS neo's own runtime file, else the documented default. */
function resolveEndpoint() {
  try {
    const raw = JSON.parse(readFileSync(join(homedir(), '.browserclaw', 'runtime.json'), 'utf8'));
    if (typeof raw?.url === 'string' && /^https?:\/\//i.test(raw.url)) {
      const base = raw.url.replace(/\/+$/, '');
      return /\/mcp$/i.test(base) ? base : `${base}/mcp`;
    }
  } catch {
    /* runtime.json missing/unparsable → documented fallback */
  }
  return FALLBACK_URL;
}

export async function apply(ctx) {
  const url = resolveEndpoint();
  const fiber = ctx.plugin(mcpClient, {
    serverName: SERVER_NAME,
    transport: 'streamable-http',
    url,
    failOnStartupError: false,
  });
  try {
    await fiber;
    ctx.logger.info(`${name}: official MCP bridge mounted → ${url} (tools: mcp__${SERVER_NAME}__*)`);
  } catch (error) {
    try {
      await fiber?.dispose?.();
    } catch {
      /* already settling down */
    }
    ctx.logger.error(
      `${name}: bridge failed to mount (${String(error?.message ?? error)}); ` +
      'check that BrowserOS neo is running, then reload the plugin to retry',
    );
  }
}

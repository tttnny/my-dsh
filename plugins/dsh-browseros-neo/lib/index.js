import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import * as mcpClient from '@deepseek-ai/dsh-mcp-client';

/**
 * @lynn123411/dsh-browseros-neo — zero-config BrowserOS neo MCP mount.
 *
 * Core job (unchanged from 1.0.0): mount the official
 * @deepseek-ai/dsh-mcp-client bridge — unchanged, no transport tuning, no
 * timeout tweaks, serverName `browseros-neo` so tools appear as
 * `mcp__browseros-neo__*` — with the endpoint resolved from neo's own
 * ~/.browserclaw/runtime.json (documented 9200 is only the fallback),
 * `/mcp` appended.
 *
 * 1.1.0 adds exactly ONE convenience, human-triggered only: a
 * 「连接 BrowserOS neo」button on a small settings section. It (a) background-launches
 * neo via `open -g` if its endpoint is not answering (macOS; never steals
 * focus — a human clicking this IS the launch consent, agents still cannot
 * launch anything), (b) re-reads runtime.json while waiting (the port can
 * change across restarts), and (c) rebuilds the bridge session (dispose +
 * fresh ctx.plugin). That covers the two states the official bridge cannot
 * recover from on its own — the ~2.5 min retry budget exhausted, and the
 * upstream zombie-session gap (SDK does not implement spec "session 404 →
 * re-initialize", so after a Neo process swap the bridge never notices).
 *
 * 1.2.0 hardens that button against two measured quirks: a cold-starting neo
 * answers HTTP 503 until it is ready (only 200 counts — 'starting' is waited
 * out, never claimed as connected), and an `open` fired while the app is
 * still terminating is swallowed by LaunchServices (rc=0, no process ever
 * comes), so the wait loop re-fires `open` once after 5 s while the endpoint
 * is fully down.
 *
 * Still nothing automatic: no supervisor tick, no in-call repair, no window
 * counting, no model-facing tool. The auto-installed browseros-neo skill is
 * left byte-for-byte upstream. Status reads live-probe the current runtime.json
 * endpoint (deduped) so the panel self-corrects once neo recovers without
 * another click; the bridge's internal reconnect bookkeeping is still not
 * observable and is not pretended to be.
 *
 * After any (re)mount, tools enter a conversation at the NEXT step: agent
 * loops snapshot the tool list per step, so mid-run registration never
 * disturbs an in-flight request.
 */

/** Cordis loader entry name (matches the patch row id). */
export const name = 'dsh-browseros-neo';

/** webServer serves the settings panel's status route + connect action. */
export const inject = ['webServer'];

const SERVER_NAME = 'browseros-neo';
const FALLBACK_URL = 'http://127.0.0.1:9200/mcp';
const LAUNCH_BUNDLE_ID = 'com.browseros.BrowserClaw';
const PROBE_TIMEOUT_MS = 3_000;
const LAUNCH_WAIT_MS = 60_000; // Chromium-family cold start (background, unfocused) often passes 25s
const REACTIVATE_AFTER_MS = 5_000; // measured: an `open` fired during app termination is swallowed (rc=0, no process); re-fire once the old instance is fully gone
const DISPOSE_TIMEOUT_MS = 5_000;

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const messageOf = (error) => String(error?.message ?? error);

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

/**
 * One MCP initialize handshake against `url`; three-state readiness (measured):
 * only 200 is `ready`; any other HTTP answer is `starting` (process up, MCP
 * not — cold boot answers 503 for seconds); a throw is `down`. Never launches.
 */
async function endpointUp(url) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: `${name}-probe`, version: '0' } },
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    return { state: 'down', detail: messageOf(error?.cause ?? error) };
  }
  const sid = res.headers.get('mcp-session-id');
  await Promise.resolve(res.body?.cancel?.()).catch(() => {});
  if (sid) {
    // Don't leak a server-side session per probe.
    fetch(url, { method: 'DELETE', headers: { 'mcp-session-id': sid }, signal: AbortSignal.timeout(2_000) }).catch(() => {});
  }
  return res.status === 200 ? { state: 'ready' } : { state: 'starting', detail: `HTTP ${res.status}` };
}

export async function apply(ctx) {
  const state = { endpoint: null, connected: false, launchedNeo: false, lastError: null, checkedAt: 0, neoInstalled: false };
  let fiber;
  let inFlight;
  let probeFlight;
  let probeTarget = null;

  const snapshot = () => ({ ...state });
  const mark = (patch) => {
    Object.assign(state, patch, { checkedAt: Date.now() });
  };

  async function disposeBridge() {
    if (!fiber) return;
    const dying = fiber;
    fiber = undefined;
    await Promise.race([Promise.resolve(dying?.dispose?.()).catch(() => {}), sleep(DISPOSE_TIMEOUT_MS)]);
  }

  /** Rebuild the bridge against `url`; `ready` (endpoint probe said 200) decides what "connected" may claim. */
  async function remount(url, ready) {
    await disposeBridge();
    try {
      fiber = ctx.plugin(mcpClient, {
        serverName: SERVER_NAME,
        transport: 'streamable-http',
        url,
        failOnStartupError: false,
      });
      await fiber;
      mark({
        endpoint: url,
        connected: ready,
        lastError: ready ? null : `端点未就绪（${url}）；桥会在 ~2.5 分钟预算内自行重试，Neo 起来后也可再点一次连接`,
      });
      return true;
    } catch (error) {
      await disposeBridge();
      mark({ endpoint: url, connected: false, lastError: messageOf(error) });
      return false;
    }
  }

  async function doConnect() {
    let url = resolveEndpoint();
    let probed = await endpointUp(url);
    let launched = false;
    let reactivated = false;
    if (probed.state === 'down') {
      if (platform() !== 'darwin') {
        mark({ launchedNeo: false, lastError: `neo 未在运行；自动拉起仅支持 macOS，请手动打开 BrowserOS neo 后再点一次（${probed.detail}）` });
      } else {
        try {
          await execFileAsync('open', ['-g', '-b', LAUNCH_BUNDLE_ID]);
          launched = true;
        } catch (error) {
          mark({ launchedNeo: false, lastError: `后台拉起 BrowserOS neo 失败：${messageOf(error)}` });
        }
        if (launched) {
          const launchedAt = Date.now();
          const deadline = launchedAt + LAUNCH_WAIT_MS;
          while (probed.state !== 'ready' && Date.now() < deadline) {
            await sleep(800);
            url = resolveEndpoint(); // 冷启动可能换端口：等待期间持续重读
            probed = await endpointUp(url);
            if (probed.state === 'down' && !reactivated && Date.now() - launchedAt >= REACTIVATE_AFTER_MS) {
              // 退出竞态：首个 open 的目标随旧实例一起离场了。补发一次；
              // 对已在跑的 App 再 open 只是无害的后台激活。
              reactivated = true;
              await execFileAsync('open', ['-g', '-b', LAUNCH_BUNDLE_ID]).catch(() => {});
            }
          }
          mark({ launchedNeo: true });
        }
      }
    } else {
      mark({ launchedNeo: false });
    }
    await remount(url, probed.state === 'ready');
    if (launched && probed.state !== 'ready') {
      mark({
        lastError: `已后台拉起 BrowserOS neo${reactivated ? '（含一次退出竞态补发）' : ''}，但 ${LAUNCH_WAIT_MS / 1000} 秒内端点未就绪。` +
          '桥会在 ~2.5 分钟预算内自行重试；等 App 完全打开后再点一次连接即可确认。',
      });
    }
    return { ...snapshot(), endpointUp: probed.state === 'ready', endpointStarting: probed.state === 'starting' };
  }

  /** Single-flight: concurrent clicks share the same run. */
  function connect() {
    if (!inFlight) inFlight = doConnect().finally(() => { inFlight = undefined; });
    return inFlight;
  }

  /** Deduped live probe of the CURRENT runtime.json endpoint (panel poll). */
  function probeShared() {
    if (!probeFlight) {
      probeTarget = resolveEndpoint();
      probeFlight = endpointUp(probeTarget).finally(() => { probeFlight = undefined; });
    }
    return probeFlight;
  }

  function writeJson(res, code, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) throw new Error('body too large');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  async function handleRequest(req, res) {
    const path = new URL(req.url ?? '/', 'http://local').pathname;
    if (req.method === 'GET' && (path === '/api/dsh-browseros-neo/status' || path === '/api/dsh-browseros-neo')) {
      state.neoInstalled = existsSync(join(homedir(), '.browserclaw'));
      const probed = await probeShared();
      return writeJson(res, 200, {
        ...snapshot(),
        endpointUp: probed.state === 'ready',
        endpointStarting: probed.state === 'starting',
        probedEndpoint: probeTarget,
      });
    }
    if (req.method === 'POST' && path === '/api/dsh-browseros-neo/action') {
      try {
        const body = await readJsonBody(req);
        if (body?.action === 'connect') return writeJson(res, 200, await connect());
        return writeJson(res, 400, { ok: false, error: 'unknown action' });
      } catch (error) {
        return writeJson(res, 400, { ok: false, error: messageOf(error) });
      }
    }
    return writeJson(res, 404, { ok: false, error: 'not found' });
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/dsh-browseros-neo',
    handler: (req, res) => handleRequest(req, res).catch((error) => {
      try {
        writeJson(res, 500, { ok: false, error: messageOf(error) });
      } catch {
        /* already sent */
      }
    }),
  }), `${name}: settings route`);

  // Startup: pure-config behavior — resolve endpoint, probe once (so the panel
  // tells the truth before any click), mount. Never launches on startup.
  const url = resolveEndpoint();
  const probed = await endpointUp(url);
  await remount(url, probed.state === 'ready');
  if (state.connected) {
    ctx.logger.info(`${name}: official MCP bridge mounted → ${url} (tools: mcp__${SERVER_NAME}__*)`);
  } else {
    ctx.logger.warn(`${name}: bridge mounted but endpoint ${probed.state} → ${url} (${probed.detail ?? 'no detail'}); click 「连接」 in settings after starting neo`);
  }
}

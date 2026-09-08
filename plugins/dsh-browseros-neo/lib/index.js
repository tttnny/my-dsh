import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';

/**
 * @lynn123411/dsh-browseros-neo — zero-config BrowserOS neo integration.
 *
 * Rides the official @deepseek-ai/dsh-mcp-client unchanged (no timeout or
 * transport tweaks): mounts one streamable-http instance with serverName
 * `browseros-neo`, so tools appear as `mcp__browseros-neo__*` exactly like in
 * Claude Code / Codex. The wrapper only adds what the bare config line cannot:
 *
 *  - resolves the real endpoint from ~/.browserclaw/runtime.json (the port is
 *    NOT the documented 9200 whenever it was already taken), falling back to
 *    http://127.0.0.1:9200/mcp;
 *  - a 30s supervisor tick that (re)mounts the bridge when neo starts late or
 *    changes port — covering the bridge's own ~10-retry (~2.5 min) give-up;
 *  - ONE lifecycle state machine on the `tools/execute` around-dispatch
 *    waterfall (the seam the scheduler documents for retry middleware):
 *    readiness pre-check → dispatch → classify failure signature →
 *    repair (rebuild session / reopen window / cold-start) → replay the same
 *    call once → annotate only if the replay still failed. The synthesized
 *    not-ready result is structurally identical to a pre-execute deny
 *    (normalizeDispatchResult passes error results through untouched), and
 *    replay is safe because zombie/window failures never reached the browser;
 *  - `browseros_neo_launch` as a thin formatter over the same state machine
 *    for agents that want to wake neo proactively and block until ready;
 *  - /api/dsh-browseros-neo for the settings section (status + toggle +
 *    manual reconnect).
 *
 * Nothing about BrowserOS neo's official design is altered: no fork, no patch,
 * no config tweaks. Its auto-installed skill keeps the upstream text except a
 * Failure-section rewrite pointing at browseros_neo_launch (file then locked
 * with `chflags uchg` so neo's re-materialization cannot clobber it).
 *
 * Probe never starts neo: only an actual model call (pre-check/classify) or a
 * human click (launch/settings) may launch it — closing neo stays respected.
 */

/** Cordis loader entry name (matches the patch row id). */
export const name = 'dsh-browseros-neo';

/** Hard dependencies: tools for the launch tool + nested mount, settings for the
 *  user layer, timer for the supervisor interval, webServer for the status API. */
export const inject = ['tools', 'settings', 'timer', 'webServer'];

const SETTINGS_NAMESPACE = 'dsh-browseros-neo';
const SERVER_NAME = 'browseros-neo';
const TOOL_PREFIX = `mcp__${SERVER_NAME}__`;
const FALLBACK_URL = 'http://127.0.0.1:9200/mcp';
const TICK_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;
const REPAIR_BUDGET_MS = 40_000;
const REPAIR_COOLDOWN_MS = 10_000;
const DISPOSE_TIMEOUT_MS = 5_000;
const LAUNCH_BUNDLE_ID = 'com.browseros.BrowserClaw';

const execFileAsync = promisify(execFile);

const CONFIG_SCHEMA = z.object({
  enabled: z.boolean().default(true),
});

function neoProfileDir() {
  return join(homedir(), '.browserclaw');
}

/** Real endpoint per BrowserOS neo's own runtime file, else the documented default. */
function resolveEndpoint() {
  try {
    const raw = JSON.parse(readFileSync(join(neoProfileDir(), 'runtime.json'), 'utf8'));
    if (typeof raw?.url === 'string' && /^https?:\/\//i.test(raw.url)) {
      const base = raw.url.replace(/\/+$/, '');
      return /\/mcp$/i.test(base) ? base : `${base}/mcp`;
    }
  } catch {
    /* runtime.json missing/unparsable → documented fallback */
  }
  return FALLBACK_URL;
}

/** Cheap liveness probe: one MCP initialize handshake against the endpoint. */
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'dsh-browseros-neo-probe', version: '0' },
        },
      }),
      signal: controller.signal,
    });
    // The SSE stream stays open forever; release the socket either way.
    const sid = res.headers.get('mcp-session-id');
    await Promise.resolve(res.body?.cancel?.()).catch(() => {});
    if (sid) {
      // Don't leak a server-side session per probe tick.
      fetch(url, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', 'mcp-session-id': sid },
        signal: AbortSignal.timeout(2_000),
      }).catch(() => {});
    }
    return { alive: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.cause?.message;
    return { alive: false, error: String(cause ?? error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/** One-shot MCP tool call over a throwaway session; returns concatenated text content. */
async function mcpToolCall(url, tool, args) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const init = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dsh-browseros-neo-diag', version: '0' } },
      }),
      signal: controller.signal,
    });
    const sid = init.headers.get('mcp-session-id');
    await Promise.resolve(init.body?.cancel?.()).catch(() => {});
    if (!init.ok || !sid) return { ok: false, error: `initialize failed: HTTP ${init.status}${sid ? '' : ' (no session id)'}` };
    await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': sid },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal: controller.signal,
    }).catch(() => {});
    const call = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': sid },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }),
      signal: controller.signal,
    });
    const sse = await call.text();
    fetch(url, {
      method: 'DELETE',
      headers: { ...headers, 'mcp-session-id': sid },
      signal: controller.signal,
    }).catch(() => {});
    let text = '';
    let isError = false;
    for (const line of sse.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let msg;
      try {
        msg = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      const result = msg?.result;
      if (!result) continue;
      isError = result.isError === true;
      for (const block of result.content ?? []) if (block?.type === 'text') text += `${block.text}\n`;
    }
    if (!text && !isError) return { ok: false, error: `no response frame for ${tool}` };
    return { ok: !isError, text, error: isError ? text.trim().slice(0, 200) : undefined };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.cause?.message;
    return { ok: false, error: String(cause ?? error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True liveness is "endpoint answers AND at least one browser window exists":
 * a running-but-windowless neo answers MCP just fine yet fails every page tool
 * with `CDP error: No browser window available` / `No profile available`.
 * (In that state even this diagnostic can fail with "No profile available" —
 * callers treat an errored count as "no window yet" and keep polling.)
 */
async function neoWindowCount(url) {
  const call = await mcpToolCall(url, 'windows', { action: 'list' });
  if (!call.ok) return { ok: false, error: call.error };
  const found = /Found (\d+) window/i.exec(call.text);
  if (found) return { ok: true, count: Number(found[1]) };
  if (/no windows found/i.test(call.text)) return { ok: true, count: 0 };
  return { ok: false, error: `unexpected windows reply: ${call.text.slice(0, 160)}` };
}

/** Mount the official bridge under this plugin's scope and wait for activation. */
async function mountBridge(ctx) {
  const url = resolveEndpoint();
  const fiber = ctx.plugin(mcpClient, {
    serverName: SERVER_NAME,
    transport: 'streamable-http',
    url,
    failOnStartupError: false,
  });
  try {
    await fiber;
    return { fiber, url };
  } catch (error) {
    try {
      await fiber?.dispose?.();
    } catch {
      /* already settling down */
    }
    throw error;
  }
}

// Failure signatures. Error text may be localized by the harness, so both
// English and Chinese variants are covered; a missed signature degrades to an
// ordinary model-visible failure (the model's own retry via launch still works).
const ZOMBIE_RE = /session not found|会话不存在|bad session|invalid session/i;
const WINDOW_RE = /no browser window available|没有可用的浏览器窗口|no profile available|没有可用的配置文件|no windows found/i;
const DOWN_RE = /fetch failed|econnrefused|econnreset|not connected|会话未连接|connection (?:lost|closed|refused)/i;

function classify(text) {
  if (ZOMBIE_RE.test(text)) return 'zombie';
  if (WINDOW_RE.test(text)) return 'window';
  if (DOWN_RE.test(text)) return 'down';
  return null;
}

function resultText(result) {
  let text = '';
  for (const block of result?.content ?? []) if (block?.type === 'text' && typeof block.text === 'string') text += `${block.text}\n`;
  if (typeof result?.error?.message === 'string') text += result.error.message;
  return text;
}

/**
 * @param ctx - Cordis host context.
 */
export function apply(ctx) {
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, CONFIG_SCHEMA);

  /** Supervisor state (all values are plain JSON-safe scalars). */
  let fiber = null;
  let mountedUrl = null;
  let up = false;
  let ticking = false;
  let lastError;
  let checkedAt = 0;
  let lastAlive = false;
  let lastOpenAt = 0;
  /** In-flight repair; concurrent gated calls join it instead of racing. */
  let inFlightRepair = null;

  const status = () => ({
    enabled: scope.get().enabled === true,
    endpoint: mountedUrl ?? resolveEndpoint(),
    neoProfile: existsSync(neoProfileDir()),
    alive: lastAlive,
    connected: up && fiber !== null,
    lastError,
    checkedAt,
  });

  async function disposeBridge(f) {
    if (!f) return;
    try {
      await Promise.race([f.dispose(), new Promise((resolve) => setTimeout(resolve, DISPOSE_TIMEOUT_MS))]);
    } catch {
      /* ignore */
    }
  }

  /** Rebuild the bridge fiber against the current endpoint. */
  async function remount() {
    const old = fiber;
    fiber = null;
    mountedUrl = null;
    up = false;
    await disposeBridge(old);
    try {
      const mounted = await mountBridge(ctx);
      fiber = mounted.fiber;
      mountedUrl = mounted.url;
      up = true;
      lastError = undefined;
      return { ok: true };
    } catch (error) {
      lastError = `bridge activation failed: ${String(error?.message ?? error)}`;
      return { ok: false, error: lastError };
    }
  }

  /**
   * Supervisor tick — existence only: probe the endpoint and (re)mount on a
   * down→up edge, a port change, or a previous activation failure. This is the
   * only mechanism that can mount the bridge when neo starts late with no tool
   * calls to hook into. Zombie/window repair lives in the state machine below.
   */
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      if (!scope.get().enabled) {
        await disposeBridge(fiber);
        fiber = null;
        mountedUrl = null;
        up = false;
        lastError = undefined;
        return;
      }
      const url = resolveEndpoint();
      const result = await probe(url);
      checkedAt = Date.now();
      lastAlive = result.alive;
      if (!result.alive) {
        // Keep any existing fiber: the bridge retries within its own budget;
        // the later down→up edge remounts with a fresh budget.
        up = false;
        lastError = result.error ?? 'endpoint unreachable';
        return;
      }
      if (fiber && up && mountedUrl === url) {
        lastError = undefined;
        return;
      }
      await remount();
    } finally {
      ticking = false;
    }
  }

  /** Poll until neo answers MCP AND exposes at least one browser window. */
  async function waitForWindow(url, budgetMs) {
    const deadline = Date.now() + budgetMs;
    for (;;) {
      const p = await probe(url);
      checkedAt = Date.now();
      lastAlive = p.alive;
      if (p.alive) {
        const w = await neoWindowCount(url);
        if (w.ok && w.count > 0) return { ready: true, windows: w.count, alive: true };
      }
      if (Date.now() >= deadline) return { ready: false, windows: 0, alive: p.alive };
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  /** macOS reopen: equivalent to clicking the Dock icon — Chromium creates a
   *  fresh window when the running app has none, and merely activates otherwise. */
  async function reopenNeo() {
    await execFileAsync('open', ['-b', LAUNCH_BUNDLE_ID]);
  }

  /**
   * THE single lifecycle state machine. `kind`:
   *  - 'auto'   readiness pre-check for an upcoming call (trusts fresh healthy
   *             state; otherwise probe → mount, or wake when down);
   *  - 'zombie' rebuild the bridge session against the live process (the SDK
   *             ignores the spec's "404 → re-initialize" MUST, so a neo restart
   *             leaves the bridge permanently dead otherwise);
   *  - 'window' reopen a window for a running-but-windowless neo, then ensure mount;
   *  - 'down'   cold-start neo, wait for endpoint+window, ensure mount.
   * Concurrent repairs share one in-flight promise; `open` commands honor a
   * cooldown so a failing model loop cannot storm the launcher.
   */
  async function repair(kind, budgetMs = REPAIR_BUDGET_MS) {
    if (inFlightRepair) return inFlightRepair;
    inFlightRepair = doRepair(kind, budgetMs).finally(() => {
      inFlightRepair = null;
    });
    return inFlightRepair;
  }

  async function doRepair(kind, budgetMs) {
    if (kind === 'zombie') {
      const r = await remount();
      return { ready: r.ok, action: 'remounted', reason: r.ok ? undefined : `桥会话重建失败：${r.error}` };
    }
    const url = resolveEndpoint();
    if (kind === 'window') {
      if (platform() !== 'darwin') {
        return { ready: false, action: 'failed', reason: 'BrowserOS neo 在运行但没有可用窗口，且非 macOS 无法自动补开，请提示用户手动打开一个窗口。' };
      }
      if (Date.now() - lastOpenAt >= REPAIR_COOLDOWN_MS) {
        lastOpenAt = Date.now();
        try {
          await reopenNeo();
        } catch (error) {
          return { ready: false, action: 'failed', reason: `补开窗口失败（open -b ${LAUNCH_BUNDLE_ID}）：${String(error?.message ?? error)}` };
        }
      }
      const w = await waitForWindow(url, budgetMs);
      await tick();
      return {
        ready: w.ready && up,
        action: 'reopened',
        windows: w.windows,
        reason: w.ready ? (up ? undefined : `窗口已就绪但桥挂载失败：${lastError ?? 'unknown'}`) : `${Math.round(budgetMs / 1000)} 秒内未见可用窗口（可能被更新/账号弹窗挡住）。`,
      };
    }
    // 'auto' | 'down'
    if (kind === 'auto' && up && fiber !== null && lastAlive && Date.now() - checkedAt < TICK_MS) {
      return { ready: true, action: 'none' };
    }
    const p = await probe(url);
    checkedAt = Date.now();
    lastAlive = p.alive;
    if (p.alive) {
      if (!up || fiber === null) await tick();
      return {
        ready: up && fiber !== null,
        action: up ? 'mounted' : 'failed',
        reason: up ? undefined : `桥挂载失败：${lastError ?? 'unknown'}`,
      };
    }
    if (platform() !== 'darwin') {
      return { ready: false, action: 'failed', reason: 'BrowserOS neo 未运行；自动拉起仅支持 macOS，请提示用户手动打开 BrowserOS neo。' };
    }
    if (Date.now() - lastOpenAt >= REPAIR_COOLDOWN_MS) {
      lastOpenAt = Date.now();
      try {
        await execFileAsync('open', ['-g', '-b', LAUNCH_BUNDLE_ID]);
      } catch (error) {
        return { ready: false, action: 'failed', reason: `后台启动 BrowserOS neo 失败（open -b ${LAUNCH_BUNDLE_ID}）：${String(error?.message ?? error)}` };
      }
    }
    let w = await waitForWindow(url, budgetMs);
    if (!w.ready && w.alive) {
      // Cold start answered MCP but created no window — reopen once, keep waiting.
      try {
        await reopenNeo();
      } catch {
        /* best effort; the reason below still asks the human */
      }
      w = await waitForWindow(url, budgetMs);
    }
    await tick();
    return {
      ready: w.ready && up,
      action: 'cold-start',
      windows: w.windows,
      reason: w.ready ? (up ? undefined : `窗口已就绪但桥挂载失败：${lastError ?? 'unknown'}`) : '已发出启动命令，但窗口/端点未在预算内就绪（可能在等首次运行或更新弹窗）。',
    };
  }

  const HINTS = {
    zombie: '[dsh-browseros-neo] 桥会话已对当前 Neo 进程重建，但重试仍失败。请再次原样重试本次调用，或调用 browseros_neo_launch 查看状态。',
    window: '[dsh-browseros-neo] BrowserOS neo 缺可用窗口，已尝试补开但未确认就绪。请调用 browseros_neo_launch 等待就绪，或提示用户检查 Neo 窗口。',
    down: '[dsh-browseros-neo] BrowserOS neo 未运行，已尝试后台拉起但未确认就绪。请调用 browseros_neo_launch 等待就绪，或提示用户打开 BrowserOS neo。',
  };

  const CONTINUE_NOTE = '若 mcp__browseros-neo__* 工具不在你的列表里，它们会在后续 step（最迟下一轮）自动出现——请继续原任务，不要改用其它浏览器面兜底。';

  /**
   * The one lifecycle listener: readiness pre-check (wakes neo inline so the
   * first call of a cold stretch is slow, not failed) → dispatch → classify →
   * repair → replay once → annotate only on a failed replay. A not-ready
   * pre-check returns a synthesized error result (structurally identical to a
   * pre-execute deny; normalizeDispatchResult passes it through untouched).
   */
  ctx.on('tools/execute', async (exec, next) => {
    if (typeof exec?.name !== 'string' || !exec.name.startsWith(TOOL_PREFIX) || scope.get().enabled !== true) {
      return next();
    }
    let dispatched;
    try {
      const pre = await repair('auto');
      if (!pre.ready) {
        const text = `Error: BrowserOS neo 暂不可用：${pre.reason ?? '未知原因'} 可调用 browseros_neo_launch 等待就绪后重试。${CONTINUE_NOTE}`;
        return { isError: true, content: [{ type: 'text', text }], error: { message: text } };
      }
      dispatched = await next();
      if (dispatched?.isError !== true) return dispatched;
      const kind = classify(resultText(dispatched));
      if (kind === null) return dispatched;
      await repair(kind);
      const replay = await next();
      if (replay?.isError === true) {
        return { ...replay, content: [...(replay.content ?? []), { type: 'text', text: HINTS[kind] }] };
      }
      return replay;
    } catch (error) {
      ctx.logger?.warn?.(`${name}: lifecycle state machine error: ${String(error?.message ?? error)}`);
      // Never swallow a settled result; if we failed before dispatch, let the raw call through.
      if (dispatched !== undefined) return dispatched;
      return next();
    }
  });

  function writeJson(res, code, body) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
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
      return writeJson(res, 200, status());
    }
    if (req.method === 'POST' && path === '/api/dsh-browseros-neo/action') {
      try {
        const body = await readJsonBody(req);
        if (body?.action === 'reconnect') {
          void repair('zombie');
          return writeJson(res, 202, { ok: true });
        }
        if (body?.action === 'setEnabled' && typeof body.enabled === 'boolean') {
          await scope.update({ enabled: body.enabled });
          void tick();
          return writeJson(res, 200, { ok: true, enabled: body.enabled });
        }
        return writeJson(res, 400, { ok: false, error: 'unknown action' });
      } catch (error) {
        return writeJson(res, 400, { ok: false, error: String(error?.message ?? error) });
      }
    }
    return writeJson(res, 404, { ok: false, error: 'not found' });
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/dsh-browseros-neo',
    handler: (req, res) => handleRequest(req, res).catch((error) => {
      try {
        writeJson(res, 500, { ok: false, error: String(error?.message ?? error) });
      } catch {
        /* already sent */
      }
    }),
  }), `${name}: status route`);

  ctx.effect(() => scope.watch(() => {
    void tick();
  }), `${name}: settings watch`);

  ctx.tools.register(defineTool({
    name: 'browseros_neo_launch',
    description: 'Wake BrowserOS neo (the agent browser) and block until it is actually usable: endpoint answering AND at least one browser window AND a fresh bridge session against the running process. Handles three "looks alive but unusable" states: neo down → background cold start (no focus steal, macOS); running with zero windows (page tools fail with `CDP error: No browser window available` / `No profile available`) → macOS reopen creates a window; neo restarted since the bridge connected (calls fail with `Session not found`) → bridge session rebuilt. Day-to-day lifecycle failures are already auto-healed by this plugin inside the call itself, so reaching for this tool is mostly about WAITING for a wake to finish or double-checking state — not a required recovery ritual. If the mcp__browseros-neo__* tools are missing from your list (session started while neo was down), call this, then continue the task: the tools appear at the next step (at latest your next turn). Do not fall back to other browser surfaces.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', description: 'False only when nothing could be attempted or the fix failed.' },
          alreadyRunning: { type: 'boolean', description: 'True when the neo endpoint was answering at call time.' },
          launched: { type: 'boolean', description: 'True when a background cold start was performed.' },
          reopened: { type: 'boolean', description: 'True when a window reopen was performed for a windowless neo.' },
          ready: { type: 'boolean', description: 'True when endpoint AND window AND bridge session are all live — retry the original call now.' },
          windows: { type: 'number', description: 'Browser window count observed when ready.' },
          endpoint: { type: 'string', description: 'The resolved neo MCP endpoint URL.' },
          error: { type: 'string', description: 'Human-readable failure reason when ok is false.' },
          note: { type: 'string', description: 'What to do next.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    timeoutMs: 3 * REPAIR_BUDGET_MS + 30_000,
    async execute() {
      const url = resolveEndpoint();
      const p = await probe(url);
      checkedAt = Date.now();
      lastAlive = p.alive;
      if (p.alive) {
        const w = await neoWindowCount(url);
        if (w.ok && w.count > 0) {
          const r = await repair('zombie');
          return {
            ok: r.ready,
            alreadyRunning: true,
            ready: r.ready,
            windows: w.count,
            endpoint: url,
            error: r.reason,
            note: r.ready ? `BrowserOS neo 已在运行且有窗口，桥会话已刷新，直接重试刚才的浏览器操作即可。${CONTINUE_NOTE}` : r.reason,
          };
        }
        const r = await repair('window');
        return {
          ok: r.ready,
          alreadyRunning: true,
          reopened: true,
          ready: r.ready,
          windows: r.windows ?? 0,
          endpoint: url,
          error: r.ready ? undefined : r.reason,
          note: r.ready ? `BrowserOS neo 之前在运行但没有窗口，已补开窗口并就绪，请重试刚才失败的浏览器操作。${CONTINUE_NOTE}` : `${r.reason ?? '补开窗口未确认就绪。'} 可提示用户检查 BrowserOS neo。`,
        };
      }
      const r = await repair('down');
      return {
        ok: r.ready,
        launched: true,
        ready: r.ready,
        windows: r.windows ?? 0,
        endpoint: url,
        error: r.ready ? undefined : r.reason,
        note: r.ready ? `BrowserOS neo 已后台启动并就绪（端点+窗口），桥会话已对当前进程建立，请重试刚才失败的浏览器操作。${CONTINUE_NOTE}` : `${r.reason ?? '启动未确认就绪。'} 请稍后重试本工具或提示用户检查 BrowserOS neo。`,
      };
    },
  }));

  // Timer mixins own their fiber cleanup; no extra effect wrapper needed.
  ctx.interval(() => {
    void tick();
  }, TICK_MS);

  // First pass shortly after activation; the interval covers the rest.
  ctx.timeout(() => {
    void tick();
  }, 1_500);
}

/**
 * @lynn123411/dsh-qr-access — 宿主半区（node）。
 *
 * 在 connection 的 /api 载体上注册**一条经鉴权的只读路由**：
 *   GET /api/qr-access/urls?protocol=<location.protocol>
 * 返回当前实例的访问地址（已带本进程 launch token）：本机回环、局域网
 * （仅绑定 0.0.0.0 时）、`--trusted-host` 受信主机、当前页面地址。
 *
 * 为什么必须有宿主半区：token 只在启动时换 cookie，浏览器 JS 读不到；地址与
 * 网卡事实也只有宿主知道。地址解析与白名单决策见 ./host/urls.ts。
 *
 * 安全边界：路由挂在 DSH 自带的 `/api` 前缀下，因此自动继承 connection 的
 * Host/Origin 栅栏与浏览器会话鉴权（未认证请求在其之前就被拦下）；本插件
 * 不新增端口、不新增凭据、不缓存任何数据。响应含 token，故一律 no-store。
 */

import { networkInterfaces } from 'node:os';
import { buildQrAccessUrls, type QrAccessFacts, type QrAccessUrlsPayload } from './host/urls.ts';

/** Cordis 插件名（patch 行 id）。 */
export const name = 'dsh-qr-access';

/** 本插件唯一路由：位于 /api 之下（connection 的鉴权载体）。 */
const ROUTE_PATH = '/api/qr-access/urls';

/** 局域网地址只有在确实绑定全网卡时才有意义（与 dsh-web-app 同口径）。 */
const ALL_INTERFACES_HOST = '0.0.0.0';

/** 本机回环主机名。 */
const LOOPBACK_HOST = '127.0.0.1';

/** connection 服务中本插件用到的最小契约面。 */
interface ConnectionLike {
  /** 精确 Fetch 路由注册表（作用域跟随注册时的 fiber）。 */
  fetch?: {
    register(route: {
      path: string;
      methods: readonly string[];
      requestBody: 'buffered' | 'streaming';
      fetch: (request: Request) => Promise<Response>;
    }): unknown;
  };
  /** 把本进程 launch token 注入给定 origin。 */
  authenticatedUrl?(baseUrl: string): string;
}

/** webServer 服务中本插件用到的最小契约面。 */
interface WebServerLike {
  host?: string;
  port?: number;
}

/** dsh-web-app 提供的 webRuntime 服务中本插件用到的最小契约面。 */
interface WebRuntimeLike {
  lanAddresses?: string[];
}

/** 宿主上下文的最小契约面（避免对 cordis 类型产生编译期依赖）。 */
interface HostContext {
  inject?(deps: string[], callback: (ctx: HostContext) => void): unknown;
  get?(serviceName: string): unknown;
  effect?(factory: () => void | (() => void), label: string): unknown;
}

/** 宽松读服务：缺失或抛错都返回 undefined（宿主换代不拖垮插件加载）。 */
function lookup(ctx: HostContext, name: string): unknown {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined;
  } catch {
    return undefined;
  }
}

/** 绑定 0.0.0.0 且宿主未提供 webRuntime 时自算局域网 IPv4 地址（失败返回空）。 */
function ownLanAddresses(): string[] {
  try {
    return Object.values(networkInterfaces())
      .flat()
      .filter((iface) => iface.family === 'IPv4' && !iface.internal)
      .map((iface) => iface.address);
  } catch {
    return [];
  }
}

/** 组装一次响应所需的宿主事实。 */
function collectFacts(ctx: HostContext, connection: ConnectionLike, request: Request): QrAccessFacts {
  const webServer = lookup(ctx, 'webServer') as WebServerLike | undefined;
  const webRuntime = lookup(ctx, 'webRuntime') as WebRuntimeLike | undefined;
  const boundHost = typeof webServer?.host === 'string' ? webServer.host : null;
  const port = typeof webServer?.port === 'number' ? webServer.port : null;
  const runtimeLan = Array.isArray(webRuntime?.lanAddresses) ? webRuntime.lanAddresses.filter((ip) => typeof ip === 'string') : [];
  const trustedHosts = Array.isArray((webRuntime as { trustedHosts?: unknown } | undefined)?.trustedHosts)
    ? ((webRuntime as { trustedHosts: unknown[] }).trustedHosts.filter((entry) => typeof entry === 'string') as string[])
    : [];
  const protocol = new URL(request.url).searchParams.get('protocol');
  const headers = request.headers;
  return {
    boundHost,
    port,
    lanAddresses: runtimeLan.length > 0 ? runtimeLan : boundHost === ALL_INTERFACES_HOST ? ownLanAddresses() : [],
    trustedHosts,
    pageAuthority: typeof headers?.get === 'function' ? headers.get('host') : null,
    pageScheme: protocol === 'https:' ? 'https:' : 'http:',
    authenticate: (origin: string): string | null => {
      try {
        const url = connection.authenticatedUrl?.(origin);
        return typeof url === 'string' && url.length > 0 ? url : null;
      } catch {
        return null;
      }
    },
  };
}

/** 把 payload 序列化为 no-store JSON 响应。 */
function jsonResponse(payload: QrAccessUrlsPayload | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 注册 /api/qr-access/urls（一次；失败只留痕，不拖垮插件加载）。 */
function registerRoutes(ctx: HostContext, connection: ConnectionLike): boolean {
  if (typeof connection.fetch?.register !== 'function') {
    console.warn('[dsh-qr-access] connection.fetch 不可用：通用模式路由 /api/qr-access/urls 未注册，面板将回落到 DSH Desktop 数据源或显示不可用');
    return false;
  }
  try {
    connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request): Promise<Response> => {
        try {
          return jsonResponse(buildQrAccessUrls(collectFacts(ctx, connection, request)));
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn('[dsh-qr-access] 组装访问地址失败：', reason);
          return jsonResponse({ error: reason }, 500);
        }
      },
    });
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn('[dsh-qr-access] /api/qr-access/urls 注册失败：', reason);
    return false;
  }
}

/**
 * 挂载宿主半区：等 connection 就绪后注册唯一路由。
 * @param ctx - DSH 宿主插件上下文。
 */
export function apply(ctx: HostContext): void {
  const start = (ready: HostContext): void => {
    const connection = lookup(ready, 'connection') as ConnectionLike | undefined;
    if (connection === undefined) {
      console.warn('[dsh-qr-access] connection 服务不可用：通用模式路由未注册（非 web 载体实例属正常情况）');
      return;
    }
    registerRoutes(ready, connection);
  };
  // connection 由兄弟插件行提供，加载顺序不保证：走动态 inject 等服务出现再注册；
  // 宿主没有 inject（老版本 cordis）时退回一次性直读。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['connection'], (ready) => start(ready));
    return;
  }
  start(ctx);
}

// 说明：本插件不使用 `export const inject` 静态声明 —— 静态声明会把整个插件
// （含浏览器半区的设置分区）拦在「无 web 载体」的实例之外，而分区本身应当照常挂载。

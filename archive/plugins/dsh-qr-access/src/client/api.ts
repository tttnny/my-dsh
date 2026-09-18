/**
 * 访问地址读取层（浏览器端）：两个数据源，Desktop 优先、通用兜底。
 *
 * 1. `desktop`：DSH Desktop 的同源桌面接口 `GET /api/desktop/settings`
 *    （HTTPS 局域网 + 本地 CA 证书）；接口缺失时 404。
 * 2. `generic`：本插件宿主半区的 `GET /api/qr-access/urls`（任意 dsh 实例；
 *    经 /api 栅栏 + 浏览器会话鉴权，带 token 的成品地址）。
 *
 * 两个来源都**不做任何缓存**：token 随每次宿主换代（重启）轮换，二维码必须
 * 每次现取，重启后扫到的永远是当前代的最新地址。
 */

/** 数据来源标识。 */
export type AccessMode = 'desktop' | 'generic';

/** 局域网四态（Desktop 数据源专有；通用数据源只会给出 ready / inactive）。 */
export type DesktopLanState = 'inactive' | 'starting' | 'ready' | 'failed';

/** 面板渲染所需的统一视图。 */
export interface AccessView {
  /** 本次数据来自哪个来源。 */
  mode: AccessMode;
  /** Desktop profile 名（通用模式为空串，仅用于展示）。 */
  profileName: string;
  /** webserver 绑定主机（通用模式可用，Desktop 为 null）。 */
  boundHost: string | null;
  /** 监听端口（通用模式可用，Desktop 为 null）。 */
  port: number | null;
  /** 本机回环访问地址（带 token）。 */
  localUrl: string | null;
  /** 局域网地址列表（带 token）。 */
  lanUrls: string[];
  /** `--trusted-host` 受信 authority 拼出的地址（带 token）。 */
  trustedUrls: string[];
  /** 浏览器当前页面地址（带 token；Desktop 数据源不提供）。 */
  pageUrl: string | null;
  /** 局域网状态徽标取值。 */
  lanState: DesktopLanState;
  /** lanState === 'failed' 时的短错误码（如 EADDRINUSE）。 */
  lanError: string | null;
  /** 本地 CA SHA-256 指纹（Desktop 专有，64 位十六进制）。 */
  lanCaFingerprint: string | null;
  /** 本地 CA 下载地址（Desktop 专有，每个局域网主机一条）。 */
  lanCaUrls: string[];
}

const LAN_STATES: readonly DesktopLanState[] = ['inactive', 'starting', 'ready', 'failed'];

/** Desktop 桌面接口路径。 */
const DESKTOP_PATH = '/api/desktop/settings';

/** 本插件宿主半区路由路径。 */
const GENERIC_PATH = '/api/qr-access/urls';

/** 已确定的数据源：Desktop 接口一次 404 之后不再每轮重试。 */
let source: AccessMode | null = null;

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isUrlWithToken(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.searchParams.has('token');
  } catch {
    return false;
  }
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function stringList(value: unknown, accept: (item: unknown) => item is string): string[] {
  return Array.isArray(value) ? value.filter(accept) : [];
}

/** 同源取 JSON（no-store；失败抛带 HTTP 码的错误）。 */
async function getJson(path: string, query = ''): Promise<unknown> {
  const res = await fetch(`${path}${query}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 轻量规整 Desktop 投影：只摘二维码需要的叶子字段，形状不符即抛错。 */
export function normalizeDesktopSettings(value: unknown): AccessView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('响应不是对象');
  const root = value as Record<string, unknown>;
  const web = root.web;
  if (typeof web !== 'object' || web === null || Array.isArray(web)) throw new Error('响应缺少 web 投影');
  const w = web as Record<string, unknown>;
  if (!isUrlWithToken(w.localUrl)) throw new Error('localUrl 无效');
  if (!LAN_STATES.includes(w.lanState as DesktopLanState)) throw new Error('lanState 无效');
  return {
    mode: 'desktop',
    profileName: typeof root.current === 'string' ? root.current : '',
    boundHost: null,
    port: null,
    localUrl: w.localUrl,
    lanUrls: stringList(w.lanUrls, isUrlWithToken),
    trustedUrls: [],
    pageUrl: null,
    lanState: w.lanState as DesktopLanState,
    lanError: typeof w.lanError === 'string' ? w.lanError : null,
    lanCaFingerprint: typeof w.lanCaFingerprint === 'string' ? w.lanCaFingerprint : null,
    lanCaUrls: stringList(w.lanCaUrls, isHttpsUrl),
  };
}

/** 轻量规整宿主半区响应：token 缺失的地址一律丢弃（宁缺勿错）。 */
export function normalizeQrAccessUrls(value: unknown): AccessView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('响应不是对象');
  const root = value as Record<string, unknown>;
  if (root.mode !== 'generic') throw new Error('mode 无效');
  if (typeof root.error === 'string') throw new Error(root.error);
  const lanUrls = stringList(root.lanUrls, isUrlWithToken);
  return {
    mode: 'generic',
    profileName: '',
    boundHost: typeof root.boundHost === 'string' ? root.boundHost : null,
    port: typeof root.port === 'number' && Number.isInteger(root.port) && root.port > 0 ? root.port : null,
    localUrl: isUrlWithToken(root.localUrl) ? root.localUrl : null,
    lanUrls,
    trustedUrls: stringList(root.trustedUrls, isUrlWithToken),
    pageUrl: isUrlWithToken(root.pageUrl) ? root.pageUrl : null,
    lanState: lanUrls.length > 0 ? 'ready' : 'inactive',
    lanError: null,
    lanCaFingerprint: null,
    lanCaUrls: [],
  };
}

/**
 * 现取当前宿主代的访问视图：Desktop 桌面接口优先，缺失则改用本插件宿主路由。
 * @returns 统一视图；两个来源都失败时抛错（消息含各自原因）。
 */
export async function fetchAccessView(): Promise<AccessView> {
  const failures: string[] = [];
  if (source !== 'generic') {
    try {
      const view = normalizeDesktopSettings(await getJson(DESKTOP_PATH));
      source = 'desktop';
      return view;
    } catch (error) {
      const reason = asError(error).message;
      // 已确认过 Desktop 来源：这只是一次失败，交给调用方按「首载 / 静默轮询」处理。
      if (source === 'desktop') throw asError(error);
      failures.push(`DSH Desktop 桌面接口 ${DESKTOP_PATH}：${reason}`);
    }
  }
  try {
    const protocol = typeof location === 'object' && typeof location.protocol === 'string' ? location.protocol : 'http:';
    const view = normalizeQrAccessUrls(await getJson(GENERIC_PATH, `?protocol=${encodeURIComponent(protocol)}`));
    source = 'generic';
    return view;
  } catch (error) {
    failures.push(`插件宿主路由 ${GENERIC_PATH}：${asError(error).message}`);
  }
  throw new Error(
    `${failures.join('；')}。桌面接口仅 DSH Desktop 提供；宿主路由由本插件宿主半区注册，刚更新插件时需重启 DSH 才会生效。`,
  );
}

/**
 * 通用（任意 dsh 实例）访问地址解析 —— 宿主半区唯一的事实来源。
 *
 * 为什么要宿主半区：DSH 的访问 token 只在启动时经 `GET /?token=...` 换成
 * HttpOnly cookie，浏览器 JS 读不到，`window.__DSH_BOOT__` 里也没有。因此
 * 「带 token 的可用地址」只能在宿主侧用 `connection.authenticatedUrl()` 现铸，
 * 由本文件组装成纯数据响应交给浏览器半区。
 *
 * 安全边界：本文件**不做鉴权**（鉴权由 connection 的 /api 栅栏 + 浏览器会话
 * cookie 统一施加），只做「为哪些 authority 铸 token」的白名单决策：
 *   - 回环地址：本机，恒定允许；
 *   - 局域网 IP 字面量：只有 webserver 真的绑定 0.0.0.0 时才有（当前 DSH 版本
 *     的 CLI 拒绝 `--host 0.0.0.0`，故通常为空）；
 *   - `--trusted-host` 声明的 authority：部署自己声明的受信来源；
 *   - 当前页面自身的 authority（请求的 Host 头，已通过 /api 栅栏）。
 * 除以上四类外不为任何 authority 铸 token。
 */

/** 通用模式响应体：字段均为「已带 token 的成品 URL」，或不可用时的 null。 */
export interface QrAccessUrlsPayload {
  /** 数据来源标识，浏览器半区据此选择面板形态。 */
  mode: 'generic';
  /** 当前 webserver 绑定主机（127.0.0.1 / 0.0.0.0 / 其他）。 */
  boundHost: string | null;
  /** 当前监听端口。 */
  port: number | null;
  /** 本机回环访问地址（带 token）。 */
  localUrl: string | null;
  /** 局域网访问地址（绑定 0.0.0.0 时非空，带 token）。 */
  lanUrls: string[];
  /** `--trusted-host` 声明的受信 authority 拼出的地址（带 token）。 */
  trustedUrls: string[];
  /** 浏览器当前页面地址（取请求 Host，带 token）。 */
  pageUrl: string | null;
}

/** 组装一次响应所需的外部事实（全部由宿主半区注入，本文件不读全局状态）。 */
export interface QrAccessFacts {
  /** webserver 绑定主机；服务缺失为 null。 */
  boundHost: string | null;
  /** webserver 监听端口；服务缺失或未绑定为 null。 */
  port: number | null;
  /** 局域网 IP 字面量（`webRuntime.lanAddresses`，或绑定 0.0.0.0 时自算）。 */
  lanAddresses: readonly string[];
  /** `--trusted-host` 声明的 authority，原样（`host` 或 `host:port`）。 */
  trustedHosts: readonly string[];
  /** 当前请求的 Host 头（浏览器所在 authority）；缺失为 null。 */
  pageAuthority: string | null;
  /** 当前页面协议（浏览器半区上报的 `location.protocol`），非法时按 http 处理。 */
  pageScheme: string;
  /** 注入本进程 launch token（`connection.authenticatedUrl`）；失败须返回 null。 */
  authenticate: (origin: string) => string | null;
}

/** IPv4 字面量判定：只接受点分四段十进制，避免把 IPv6 / 主机名当局域网地址拼错。 */
function isIpv4Literal(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 回环主机名判定（与 DSH 的 /api 栅栏同口径：localhost、[::1]、127.0.0.0/8）。 */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** 规范 authority 解析：只接受 WHATWG 解析后原样保留的 `host` / `host:port`。 */
function parseAuthority(value: string): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) return null;
  try {
    const url = new URL(`http://${value}`);
    if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
    const canonical = url.port === '' ? url.hostname : `${url.hostname}:${url.port}`;
    return canonical === value.toLowerCase() ? url : null;
  } catch {
    return null;
  }
}

/** 去重：按 URL 原样比较，保留首次出现的顺序。 */
function dedupe(urls: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * 组装通用模式的地址清单。任何单行失败都只丢该行，不影响其余地址。
 * @param facts - 宿主侧现取的事实。
 * @returns 浏览器半区直接渲染的数据。
 */
export function buildQrAccessUrls(facts: QrAccessFacts): QrAccessUrlsPayload {
  const scheme = facts.pageScheme === 'https:' ? 'https:' : 'http:';
  const mint = (origin: string): string | null => {
    try {
      const url = facts.authenticate(origin);
      return typeof url === 'string' && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  };

  const { port } = facts;
  const localUrl = port === null ? null : mint(`http://127.0.0.1:${String(port)}`);
  const lanUrls = port === null
    ? []
    : facts.lanAddresses
        .filter((address) => isIpv4Literal(address) && !isLoopbackHostname(address))
        .map((address) => mint(`http://${address}:${String(port)}`))
        .filter((url): url is string => url !== null);

  // 受信主机：跳过回环与已在局域网行出现的 authority，避免重复行。
  const lanAuthorities = new Set(facts.lanAddresses.map((address) => address.toLowerCase()));
  const trustedUrls = facts.trustedHosts
    .filter((entry) => {
      const parsed = parseAuthority(entry);
      if (parsed === null) return false;
      if (isLoopbackHostname(parsed.hostname)) return false;
      return !lanAuthorities.has(parsed.hostname.toLowerCase());
    })
    .map((entry) => mint(`${scheme}//${entry}`))
    .filter((url): url is string => url !== null);

  // 当前页面：Host 头已通过 /api 栅栏，恒为本部署自己的 authority。
  const pageUrl = facts.pageAuthority === null ? null : mint(`${scheme}//${facts.pageAuthority}`);

  return {
    mode: 'generic',
    boundHost: facts.boundHost,
    port: facts.port,
    localUrl,
    lanUrls: dedupe(lanUrls),
    trustedUrls: dedupe(trustedUrls),
    pageUrl,
  };
}

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
/**
 * 组装通用模式的地址清单。任何单行失败都只丢该行，不影响其余地址。
 * @param facts - 宿主侧现取的事实。
 * @returns 浏览器半区直接渲染的数据。
 */
export declare function buildQrAccessUrls(facts: QrAccessFacts): QrAccessUrlsPayload;

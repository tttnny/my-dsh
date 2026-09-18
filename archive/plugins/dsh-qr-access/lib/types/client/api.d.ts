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
/** 轻量规整 Desktop 投影：只摘二维码需要的叶子字段，形状不符即抛错。 */
export declare function normalizeDesktopSettings(value: unknown): AccessView;
/** 轻量规整宿主半区响应：token 缺失的地址一律丢弃（宁缺勿错）。 */
export declare function normalizeQrAccessUrls(value: unknown): AccessView;
/**
 * 现取当前宿主代的访问视图：Desktop 桌面接口优先，缺失则改用本插件宿主路由。
 * @returns 统一视图；两个来源都失败时抛错（消息含各自原因）。
 */
export declare function fetchAccessView(): Promise<AccessView>;

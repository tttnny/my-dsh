/**
 * DSH Desktop 同源设置投影的浏览器端读取层。
 *
 * 接口与「桌面设置」分区同款：GET /api/desktop/settings（same-origin，
 * no-store）。地址/证书/状态每次调用都取自当前 Desktop 宿主代 —— token
 * 随 DSH 重启（换代）轮换，因此二维码必须每次现取，绝不持久化缓存。
 */
/** 局域网 HTTPS 边缘状态（与桌面设置页一致的四态）。 */
export type DesktopLanState = 'inactive' | 'starting' | 'ready' | 'failed';
/** 二维码所需的浏览器访问投影（裁剪自 DesktopSettingsView，未用字段不落地）。 */
export interface DesktopWebView {
    /** 本机回环访问地址（http://127.0.0.1:<port>/?token=...），仅本机可达。 */
    localUrl: string;
    /** 局域网 HTTPS 地址列表（lanState === 'ready' 时非空）。 */
    lanUrls: string[];
    lanState: DesktopLanState;
    /** lanState === 'failed' 时的短错误码（如 EADDRINUSE）。 */
    lanError: string | null;
    /** 本地 CA SHA-256 指纹（64 位十六进制）。 */
    lanCaFingerprint: string | null;
    /** 本地 CA 下载地址（每个局域网主机一条）。 */
    lanCaUrls: string[];
}
/** 桌面设置投影中本插件需要的部分。 */
export interface DesktopSettingsView {
    /** 当前 Desktop profile 名（仅用于展示，不参与二维码）。 */
    current: string;
    web: DesktopWebView;
}
/** 轻量规整：只摘二维码需要的叶子字段；形状不符即抛错（fail loud，不渲染脏数据）。 */
export declare function normalizeDesktopSettings(value: unknown): DesktopSettingsView;
/** 读取当前宿主代的浏览器访问投影（same-origin，无缓存）。 */
export declare function fetchDesktopSettings(): Promise<DesktopSettingsView>;

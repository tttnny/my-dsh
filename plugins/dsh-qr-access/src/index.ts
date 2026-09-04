/**
 * @lynn123411/dsh-qr-access — node half（纯客户端插件，宿主半区零副作用）。
 *
 * 数据源是 DSH Desktop 自带的同源接口 GET /api/desktop/settings（仅 Desktop
 * 兼容模式宿主代提供，带 token 鉴权），浏览器半区直接读取其中的
 * localUrl / lanUrls / lanCaUrls 实时生成二维码；node 半区无需注册任何
 * 路由、服务或凭据 —— 保持零依赖、零副作用，避免多余的攻击面与启动开销。
 */

/** Cordis 插件名（patch 行 id）。 */
export const name = 'dsh-qr-access';

/** 零副作用：浏览器半区经 slots 挂载「扫码访问」设置分区，宿主半区无事可做。 */
export function apply(_ctx: unknown): void {
  /* no-op */
}

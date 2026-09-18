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
/** Cordis 插件名（patch 行 id）。 */
export declare const name = "dsh-qr-access";
/** 宿主上下文的最小契约面（避免对 cordis 类型产生编译期依赖）。 */
interface HostContext {
    inject?(deps: string[], callback: (ctx: HostContext) => void): unknown;
    get?(serviceName: string): unknown;
    effect?(factory: () => void | (() => void), label: string): unknown;
}
/**
 * 挂载宿主半区：等 connection 就绪后注册唯一路由。
 * @param ctx - DSH 宿主插件上下文。
 */
export declare function apply(ctx: HostContext): void;
export {};

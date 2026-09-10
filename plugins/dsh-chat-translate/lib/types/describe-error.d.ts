/**
 * 把 fetch / 网络失败的可读原因展开成单行文本（宿主与客户端共用）。
 *
 * 背景：Node 18+ 与浏览器的 fetch 在网络层失败时只给一句 `TypeError: fetch failed`
 * （浏览器是 `Failed to fetch`），真实原因藏在 `err.cause` 里——例如
 * `connect ENETUNREACH 172.24.52.126:8081`、`other side closed [UND_ERR_SOCKET]`、
 * `getaddrinfo ENOTFOUND`。只上报 `err.message` 会让「端点不可达 / 被代理断开」和
 * 「插件自身出错」长得一模一样：用户只看到无信息量的 fetch failed，无从判断该改什么。
 *
 * 这里把 message 与 cause 链（含 AggregateError 的多地址失败）拼成 `A ← B ← C`。
 */
export declare function describeError(err: unknown): string;

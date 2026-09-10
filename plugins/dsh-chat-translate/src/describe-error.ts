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
export function describeError(err: unknown): string {
  if (err === null || err === undefined) return String(err);
  const parts: string[] = [];
  const push = (s: string): void => {
    const t = String(s || '').trim();
    if (t && !parts.includes(t)) parts.push(t);
  };
  const head = (err as { message?: string }).message || String(err);
  push(head);
  const headCode = (err as { code?: string }).code;
  if (headCode && !head.includes(headCode)) push('[' + headCode + ']');
  let cause = (err as { cause?: unknown }).cause as
    | { message?: string; code?: string; cause?: unknown; errors?: unknown }
    | undefined;
  for (let depth = 0; cause && depth < 4; depth++) {
    const label = cause.message || String(cause);
    push(cause.code && !label.includes(cause.code) ? label + ' [' + cause.code + ']' : label);
    // AggregateError：多地址全部失败（happy-eyeballs 双栈常见），展开前几条
    if (Array.isArray(cause.errors)) {
      for (const sub of (cause.errors as { message?: string; code?: string }[]).slice(0, 3)) {
        if (sub) push(sub.code || sub.message || String(sub));
      }
    }
    cause = cause.cause as typeof cause;
  }
  return parts.join(' ← ');
}
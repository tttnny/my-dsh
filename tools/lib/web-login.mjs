import { readFileSync } from 'node:fs';
import { runningInstances } from './repo.mjs';

function webUrl(value) {
  try {
    const url = new URL(value);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !url.hash) return url;
  } catch {}
  return undefined;
}

function matchesRoot(url, root) {
  return url?.origin === root.origin && url.pathname === root.pathname;
}

function readLoginFile(path) {
  let value;
  try {
    value = readFileSync(path, 'utf8').trim();
  } catch {
    throw new Error('读不到 --login-file 指定的文件');
  }
  if (/[\r\n]/.test(value)) return undefined;
  return webUrl(value.replace(/^dsh web: /, ''));
}

/** 分别验证干净的应用根与启动入口，让凭据只进入一次节点进程内的交换请求。 */
export function resolveWebLogin(target, loginFile) {
  const root = webUrl(target);
  if (!root || root.search || !root.pathname.endsWith('/')) {
    throw new Error('请通过 --url 或 DSH_WEB_URL 提供不带查询参数、以 / 结尾的 Web GUI 根地址');
  }
  if (loginFile !== undefined && typeof loginFile !== 'string') {
    throw new Error('--login-file 需要一个文件路径');
  }

  let login;
  if (loginFile !== undefined) {
    login = readLoginFile(loginFile);
    if (!matchesRoot(login, root)) throw new Error('--login-file 中的入口与 Web GUI 根地址不匹配');
  } else {
    let instances;
    try {
      instances = runningInstances();
    } catch {
      throw new Error('读不到启动器实例记录，请用 --login-file 指定启动入口');
    }
    const matches = instances.map(({ url }) => webUrl(url)).filter((url) => matchesRoot(url, root));
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? '启动器还没有登记该 Web GUI 实例。等实例就绪，或用 --login-file 指向该实例的启动入口文件'
        : '启动器登记了多个相同根地址的实例。请用 --login-file 指定要验证的实例');
    }
    [login] = matches;
  }

  const params = [...login.searchParams];
  if (params.length !== 1 || params[0][0] !== 'token' || params[0][1] === '') {
    throw new Error('当前登录入口没有可用于验证的 Token 登录地址');
  }
  return { root, login };
}

/** 目标版 Token Provider 对根入口返回 303，并设置一个按 authority 签发的浏览器 Cookie。 */
export async function exchangeWebLogin(login) {
  let response;
  try {
    response = await fetch(login, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('连接不到 Web GUI。请确认监听器已经就绪');
  }
  await response.body?.cancel().catch(() => {});
  if (response.status === 503) throw new Error('Web GUI 已监听，鉴权尚未就绪');
  if (response.status === 401) throw new Error('登录入口已失效或实例已重启，请使用当前实例的入口');
  if (response.status !== 303) throw new Error(`实例未完成 Token 登录交换（HTTP ${response.status}）`);

  const cookies = response.headers.getSetCookie();
  const match = cookies.map((cookie) => /^(dsh-auth-[A-Za-z0-9_-]{43})=(v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+);(.*)$/i.exec(cookie)).find(Boolean);
  if (!match) throw new Error('登录交换未设置 DSH 会话 Cookie');
  const [, name, value, attributes] = match;
  const secure = /(?:^|;)\s*Secure\s*(?:;|$)/i.test(attributes);
  if (secure && login.protocol !== 'https:') throw new Error('该实例要求通过 HTTPS 使用会话 Cookie');
  return { name, value, secure };
}

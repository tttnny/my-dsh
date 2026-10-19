/**
 * @lynn123411/dsh-web-auth-url — 宿主半区（node）。
 *
 * connection 的浏览器会话鉴权只有一个入口：带本进程 launch token 的根地址；
 * `dsh-web-app` 有意只把干净地址交给模型与 shell，带 token 的地址仅打印到
 * stdout。于是模型自测这个 GUI 时第一枪必然 401。
 *
 * 本插件把登录收进一个工具：`web_gui_login` 自己取带 token 的地址、换 cookie、
 * 落一个 curl 能直接用的 jar，只回 jar 路径。token 既不进提示词，也不进工具
 * 结果与会话记录——工具描述承载全部用法，值只活在进程内存与磁盘上的 cookie 里。
 *
 * 同时托管 `DSH_WEB_AUTH_URL`，每次 shell 调用即时解析，跟随重启后的 token
 * 轮换。
 *
 * 没有 web 部署的宿主不是错误路径：{@link inject} 让整条插件不激活，工具与
 * 变量都不出现。
 *
 * @module dsh-web-auth-url
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名（= patch 行 id）。 */
export const name = 'dsh-web-auth-url'

/** npm 包名：{@link selfDir} 靠它从本模块 URL 解析自身安装位置。 */
const PKG_NAME = '@lynn123411/dsh-web-auth-url'

/**
 * 硬依赖：工具要注册进工具表，登录地址来自已装载的 connection 与 webServer。
 * 三者缺一（CLI、TUI 或无 web 部署）整条插件不激活，见模块头。
 */
export const inject = ['tools', 'connection', 'webServer']

/** 本插件唯一登记的托管环境变量。 */
const AUTH_URL_KEY = 'DSH_WEB_AUTH_URL'

/** shellEnv 贡献者名。 */
const CONTRIBUTOR_NAME = 'dsh-web-auth-url'

/** 模型看到的工具名。 */
const TOOL_NAME = 'web_gui_login'

/** 一次换 cookie 的等待上限：短于任何网络默认超时，失败得早而清楚。 */
const LOGIN_TIMEOUT_MS = 15_000

/** jar 落在 `$DSH_HOME/cache` 下的哪个子目录。 */
const JAR_DIR = 'web-gui-auth'

/** 监听器未 bind 时错误文本的前缀：稳定、可 grep，模型也读得懂。 */
const NOT_READY_CODE = 'WEB_GUI_LOGIN_NOT_READY'

/**
 * 解析本进程当前的登录地址：对外公布的那个根交给 connection 加 token。
 * 与 `dsh-web-app` 打印启动地址、注册 `DSH_WEB_URL` 用的是同一个根——配了
 * `publicUrl` 时是它，否则是监听器自己报的 origin——这样 jar 里的 cookie 域
 * 与模型被要求访问的地址一致。
 * url 里带这一进程的 launch token，只许在本次调用内使用，绝不回传给模型。
 * @param ctx - 能读到 webApp / webServer / connection 的上下文。
 * @returns 公布的根与带 token 的地址；监听器未 bind 时 undefined。
 */
function resolveAuthenticatedUrl(ctx) {
  const server = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (typeof server?.getOrigin !== 'function' || typeof connection?.authenticatedUrl !== 'function') return undefined
  try {
    const webApp = ctx.get('webApp')
    const origin = typeof webApp?.getAdvertisedUrl === 'function' ? webApp.getAdvertisedUrl() : server.getOrigin()
    return { origin, url: connection.authenticatedUrl(origin) }
  } catch {
    // 监听器还没 bind（`getOrigin()` 会抛）：交给调用方决定是降级还是报错。
    return undefined
  }
}

/**
 * 一个监听器根对应的 jar 路径。同一 authority 恒定同一个文件，重复登录覆盖它。
 * @param origin - 监听器自己报的根。
 * @returns jar 的绝对路径。
 */
function jarPathFor(origin) {
  const { hostname, port } = new URL(origin)
  return join(
    dshHome(),
    'cache',
    JAR_DIR,
    `${hostname.replaceAll(/[^A-Za-z0-9.-]/gu, '_')}-${port === '' ? 'default' : port}.jar`,
  )
}

/**
 * 解析 DSH home：与内核 `resolveDshHome` 同一个优先级与同一种展开——`$DSH_HOME`
 * （空白视为未设），否则 `~/.dsh`；两者都展开开头的 `~`。
 * @returns 绝对路径。
 */
function dshHome() {
  const configured = process.env.DSH_HOME?.trim()
  const selected = configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
  const expanded = selected === '~'
    ? homedir()
    : selected.startsWith('~/') || selected.startsWith('~\\')
      ? join(homedir(), selected.slice(2))
      : selected
  return isAbsolute(expanded) ? expanded : resolve(expanded)
}

/**
 * 拆一条 `Set-Cookie`。
 * @param header - 单条响应头值。
 * @returns 名字、值、路径、过期秒数与两个布尔属性；形状不认识时 undefined。
 */
function parseSetCookie(header) {
  const [pair, ...attributes] = header.split(';')
  const at = pair.indexOf('=')
  if (at <= 0) return undefined
  const cookie = {
    name: pair.slice(0, at).trim(),
    value: pair.slice(at + 1).trim(),
    path: '/',
    expires: undefined,
    secure: false,
    httpOnly: false,
  }
  let maxAge
  for (const attribute of attributes) {
    const equals = attribute.indexOf('=')
    const key = (equals === -1 ? attribute : attribute.slice(0, equals)).trim().toLowerCase()
    const value = equals === -1 ? '' : attribute.slice(equals + 1).trim()
    if (key === 'path' && value !== '') cookie.path = value
    else if (key === 'expires') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) cookie.expires = Math.floor(parsed / 1000)
    } else if (key === 'max-age') {
      const seconds = Number(value)
      if (Number.isFinite(seconds)) maxAge = Math.floor(Date.now() / 1000) + seconds
    } else if (key === 'secure') cookie.secure = true
    else if (key === 'httponly') cookie.httpOnly = true
  }
  // Max-Age 优先于 Expires（RFC 6265 §5.3），与两者在头里的先后无关。
  if (maxAge !== undefined) cookie.expires = maxAge
  return cookie
}

/**
 * 写一个 curl 直接能读的 Netscape cookie jar。
 * @param jarPath - 目标绝对路径。
 * @param hostname - cookie 的域：监听器自己报的那个 host。
 * @param cookies - 已解析的 cookie。
 * @returns 最早过期时间的 ISO 字符串；都是会话 cookie 时 undefined。
 */
function writeCookieJar(jarPath, hostname, cookies) {
  const lines = ['# Netscape HTTP Cookie File', '# Written by dsh-web-auth-url; do not edit by hand.', '']
  for (const cookie of cookies) {
    // curl 认 `#HttpOnly_` 前缀：带它的行照常当 cookie 读出，注释语义被前缀规则覆盖。
    const domain = cookie.httpOnly ? `#HttpOnly_${hostname}` : hostname
    lines.push([
      domain,
      'FALSE',
      cookie.path,
      cookie.secure ? 'TRUE' : 'FALSE',
      String(cookie.expires ?? 0),
      cookie.name,
      cookie.value,
    ].join('\t'))
  }
  mkdirSync(dirname(jarPath), { recursive: true, mode: 0o700 })
  // 先写同目录临时文件再 rename：中途失败不会留下半个 jar。
  // 临时名带随机段：同一进程里的并发调用各写各的，谁也不会截断别人正在写的那份。
  // 权限在 rename 之后设：`writeFileSync` 的 mode 只在新建时生效，上一轮崩溃留下的
  // 临时文件会带着旧权限被改名过去。
  const temporary = `${jarPath}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${lines.join('\n')}\n`)
  renameSync(temporary, jarPath)
  chmodSync(jarPath, 0o600)
  const expiries = cookies.map(cookie => cookie.expires).filter(expiry => expiry !== undefined)
  return expiries.length === 0 ? undefined : new Date(Math.min(...expiries) * 1000).toISOString()
}

/**
 * 本插件自身安装目录的真实路径（预留工具，当前没有调用方）。
 *
 * 用它，不要用 `ctx.pluginPackages.packageOf(...)`：`packageOf` 只把 specifier
 * 解析成包名并读 `<node_modules>/<包名>/package.json`，返回的可能是**软链接
 * 路径**——开发副本里 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-*` 正是
 * `link:` 到仓库，跨卷时 Node 的 realpath 不穿透，dirname 出来的是仓库外的
 * 路径。这里走 Node 自己的解析器再 realpath：正常发布安装下两者相同。
 *
 * 宿主半边运行时**不能**用 `import.meta.resolve`（Cordis 装载的模块拿不到该
 * 能力），所以按包名从自己的 URL 解析，再退回自身目录。
 *
 * @returns 本包目录的绝对路径；解析失败时退回本模块所在目录。
 */
export function selfDir() {
  const fallback = dirname(fileURLToPath(import.meta.url))
  try {
    const entry = fileURLToPath(import.meta.resolve(`${PKG_NAME}`, import.meta.url))
    let dir = dirname(entry)
    if (basename(dir) === 'lib') dir = dirname(dir)
    return realpathSync(dir)
  } catch {
    return fallback
  }
}

/**
 * 登录工具：换一次 cookie 并落成 jar，只回 jar 路径。
 * @param ctx - 提供 webServer 与 connection 的上下文。
 * @returns 交给 `ctx.tools.register` 的工具定义。
 */
function loginTool(ctx) {
  return defineTool({
    name: TOOL_NAME,
    description: 'Log in to the DeepSeek Harness Web GUI this session is driving: exchange the process launch token'
      + ' for a browser session cookie and store it as a curl cookie jar. Call it before any HTTP request to'
      + ' `$DSH_WEB_URL`, then pass the returned jar path to every request with `curl -b`. The token is never'
      + ' returned and must not be copied from `$DSH_WEB_AUTH_URL` into a command. The jar stays valid across'
      + ' restarts; call again if a request answers 401.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jar: { type: 'string', required: true, description: 'Absolute path of the curl cookie jar holding the session cookie.' },
          expiresAt: {
            required: true,
            description: 'ISO-8601 expiry of the session cookie, or null when the cookie has no expiry of its own.',
            oneOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Logged in. Cookie jar: ${value.jar}\n`
          + `Use it on every request instead of the token: curl -s -b "${value.jar}" "$DSH_WEB_URL/api/..."`,
      }],
    },
    timeoutMs: LOGIN_TIMEOUT_MS,
    async execute(_args, exec) {
      const authenticated = resolveAuthenticatedUrl(ctx)
      if (authenticated === undefined) {
        throw new Error(`${NOT_READY_CODE}: this Web GUI has not bound its listener yet, so there is no login address`
          + ' to exchange. Call again once the instance is serving')
      }
      const response = await fetch(authenticated.url, { redirect: 'manual', signal: exec.signal })
      const headers = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
      const cookies = headers.map(parseSetCookie).filter(cookie => cookie !== undefined)
      // 成功只可能是 303：其余状态在这里就抛错，状态码因此只出现在错误文本里。
      if (response.status !== 303 || cookies.length === 0) {
        // 错误文本不带 url：它含这次进程的 token，而错误会落进会话记录。
        throw new Error(`web_gui_login: the token exchange answered HTTP ${String(response.status)} with ${String(cookies.length)}`
          + ' session cookie(s); expected 303 and one Set-Cookie. The launch token may have rotated — call again;'
          + ' if it keeps failing, this Web GUI is not serving the browser session the process announced.')
      }
      const jar = jarPathFor(authenticated.origin)
      const expiresAt = writeCookieJar(jar, new URL(authenticated.origin).hostname, cookies)
      return { jar, expiresAt: expiresAt ?? null }
    },
  })
}

/**
 * 装载插件：注册登录工具并托管环境变量。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  ctx.tools.register(loginTool(ctx))

  ctx.inject(['shellEnv'], (envCtx) => {
    envCtx.shellEnv.register({
      name: CONTRIBUTOR_NAME,
      variables: {
        [AUTH_URL_KEY]: {
          description: 'One-shot tokenized URL of this Web GUI; exchange it with web_gui_login and use the jar instead.',
        },
      },
      resolve: () => {
        const authenticated = resolveAuthenticatedUrl(envCtx)
        return authenticated === undefined ? {} : { [AUTH_URL_KEY]: authenticated.url }
      },
    })
  })
}

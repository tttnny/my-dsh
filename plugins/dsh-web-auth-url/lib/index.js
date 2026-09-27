/**
 * @lynn123411/dsh-web-auth-url — 宿主半区（node）。
 *
 * connection 的浏览器会话鉴权只有一个入口：带本进程 launch token 的根地址；
 * `dsh-web-app` 有意只把干净地址交给模型与 shell，带 token 的地址仅打印到
 * stdout。于是模型自测这个 GUI 时第一枪必然 401。本插件补上这个缺口而不把
 * secret 放进提示词或 transcript：托管 `DSH_WEB_AUTH_URL`（每次 shell 调用
 * 即时解析，跟随重启后的 token 轮换），并紧随 `app:web-surface` 说明它的
 * 用法——只报变量名，`prompt: 'inline'` 才把地址写进段落。
 *
 * 没有 web 部署的宿主不是错误路径：注册照常完成，值解析为空、段落渲染成空
 * 串，而空段落会被 renderPrompt 过滤掉。
 *
 * @module dsh-web-auth-url
 */

import z from '@deepseek-ai/schemastery'

import { realpathSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名（= patch 行 id）。 */
export const name = 'dsh-web-auth-url'

/** npm 包名：{@link selfDir} 靠它从本模块 URL 解析自身安装位置。 */
const PKG_NAME = '@lynn123411/dsh-web-auth-url'

/** 本插件不硬依赖任何服务：web 服务缺失时静默降级，见模块头。 */
export const inject = []

/** 回环主机名，与 dsh-web-app 同口径（模型在宿主机上，回环即本实例）。 */
const LOOPBACK_HOST = '127.0.0.1'

/** 本插件唯一登记的托管环境变量。 */
const AUTH_URL_KEY = 'DSH_WEB_AUTH_URL'

/** shellEnv 贡献者名。 */
const CONTRIBUTOR_NAME = 'dsh-web-auth-url'

/** 提示词段落名。 */
const SECTION_NAME = 'app:web-auth-url'

/** 段落排在 `app:web-surface` 之后，紧挨着它所补充的那段话。 */
const SECTION_OFFSET = 10

/** 段落里出现 token 地址的位置（`env` 档保留字面量，`inline` 档换成实址）。 */
const URL_PLACEHOLDER = `$${AUTH_URL_KEY}`

/**
 * 段落模板：两档共用一份句式，只替换地址，文案不会各自漂移。
 *
 * 首句借 `$DSH_WEB_URL` 把这段挂到 `app:web-surface` 刚报的那台 GUI 上（那
 * 段不提 token / 401 / cookie，两段不重复）；末句点明「token 只用于第一次
 * 换 cookie」——connection 的 token 分支要求 `GET /` 且 pathname 恰为 `/`，
 * 其余路径带 token 一律 401，不点破模型会继续在 `/api` 上挂 `?token=`。
 *
 * 地址一律加引号：token 是 base64url，理论上无外壳元字符，但两条分支用同
 * 一种写法才不会有后加字符时的分叉。
 */
const SECTION_TEMPLATE = [
  'The Web GUI at `$DSH_WEB_URL` needs auth: its URL and every request carry `$DSH_WEB_AUTH_URL`.',
  'First `curl -s -c "$JAR" -b "$JAR" -o /dev/null -w \'%{http_code}\' "$DSH_WEB_AUTH_URL"` answers 303',
  'and sets the session cookie; reuse that jar, not the token, afterwards.',
].join(' ')

/** 插件配置。 */
export const Config = z.object({
  /**
   * 提示词段落如何交代这个地址。
   *
   * - `env`：只报 `$DSH_WEB_AUTH_URL`（默认；token 不进提示词与 transcript）
   * - `inline`：把带 token 的地址直接写进段落（地址每次装配即时解析，重启后
   *   不会过期，但 token 会随每次请求发给模型服务商并落盘进 session）
   * - `off`：不注册段落，只保留环境变量
   */
  prompt: z
    .union([z.const('env'), z.const('inline'), z.const('off')])
    .default('env')
    .description('how the prompt section names the authenticated URL: env (point at $DSH_WEB_AUTH_URL), inline (print the tokenized URL), off (no section)'),
})

/**
 * 解析本进程当前的带 token 地址。
 * @param ctx - 任意能读到 webServer / connection 的上下文。
 * @returns 带 token 的回环地址；没有 web 部署时 undefined。
 */
function resolveAuthenticatedUrl(ctx) {
  const port = ctx.get('webServer')?.port
  const connection = ctx.get('connection')
  if (port === undefined || typeof connection?.authenticatedUrl !== 'function') return undefined
  return connection.authenticatedUrl(`http://${LOOPBACK_HOST}:${String(port)}`)
}

/**
 * 渲染提示词段落：一份模板，只换地址那处。
 * @param ctx - 装配用的上下文。
 * @param mode - 已解析的 `prompt` 配置。
 * @returns 段落文本；地址不可解析时返回空串（等于不贡献段落）。
 */
function promptText(ctx, mode) {
  const url = resolveAuthenticatedUrl(ctx)
  if (url === undefined) return ''
  return mode === 'inline'
    ? SECTION_TEMPLATE.replaceAll(URL_PLACEHOLDER, url)
    : SECTION_TEMPLATE
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
 * 装载插件：登记托管环境变量，并按配置贡献提示词段落。
 * @param ctx - 宿主插件上下文。
 * @param config - 已解析的 {@link Config}。
 */
export function apply(ctx, config) {
  const mode = config?.prompt ?? 'env'

  ctx.inject(['shellEnv'], (envCtx) => {
    envCtx.shellEnv.register({
      name: CONTRIBUTOR_NAME,
      variables: {
        [AUTH_URL_KEY]: {
          description: 'Authenticated URL of this Web GUI; GET it once with a cookie jar to log in, then reuse the jar.',
        },
      },
      resolve: () => {
        const url = resolveAuthenticatedUrl(envCtx)
        return url === undefined ? {} : { [AUTH_URL_KEY]: url }
      },
    })
  })

  if (mode === 'off') return
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: SECTION_NAME,
      order: promptCtx.systemPrompt.getSectionOrder('WEB_SURFACE') + SECTION_OFFSET,
      text: () => promptText(promptCtx, mode),
    })
  })
}

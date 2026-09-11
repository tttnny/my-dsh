/**
 * @lynn123411/dsh-web-auth-url — 宿主半区（node）。
 *
 * Web GUI 的每个请求都要过 connection 的浏览器会话鉴权，而鉴权的入口只有
 * 一个：带本进程 launch token 的根地址。干净地址 `http://127.0.0.1:<port>`
 * 一律 401，而且这是 `dsh-web-app` 有意为之——它把干净地址交给模型
 * （`app:web-surface` 段落）和 shell（`DSH_WEB_URL`），带 token 的地址只
 * 打印到 stdout、交给默认浏览器。
 *
 * 代价是模型想自测这个 GUI（抓页面、探路由、确认客户端插件有没有生效）时
 * 第一枪必然 401，只能翻启动器日志找 token。本插件补上这个缺口，同时不把
 * secret 放进提示词或 transcript：
 *
 * 1. `DSH_WEB_AUTH_URL` —— 每次 shell 调用**即时解析**的带 token 地址，
 *    因此 DSH 重启换 token 后自动跟随（静态字符串做不到这一点）。
 * 2. 紧随 `app:web-surface`（order + 10）的一段提示词，说明该地址存在，
 *    以及「第一次请求 303 换 cookie、之后复用同一个 jar」这个必需用法——
 *    只报变量名，不报值；`prompt: 'inline'` 才把地址直接写进段落。
 *
 * 没有 web 部署的宿主（CLI / TUI / 缺 connection 的组合）不是错误路径：注册
 * 照常完成，`resolve` 返回空、段落渲染成空串，而空段落会被 renderPrompt
 * 过滤掉，系统提示词里不留痕迹。
 *
 * @module dsh-web-auth-url
 */

import z from '@deepseek-ai/schemastery'

/** Cordis 插件名（= patch 行 id）。 */
export const name = 'dsh-web-auth-url'

/** 本插件不硬依赖任何服务：web 服务缺失时静默降级，见模块头。 */
export const inject = []

/** 回环主机名，与 dsh-web-app 同口径（模型在宿主机上，回环即本实例）。 */
const LOOPBACK_HOST = '127.0.0.1'

/** 本插件唯一登记的托管环境变量。 */
const AUTH_URL_KEY = 'DSH_WEB_AUTH_URL'

/** web-app 交给 shell 的干净地址，只在提示词里做对照。 */
const CLEAN_URL_KEY = 'DSH_WEB_URL'

/** shellEnv 贡献者名。 */
const CONTRIBUTOR_NAME = 'dsh-web-auth-url'

/** 提示词段落名。 */
const SECTION_NAME = 'app:web-auth-url'

/** 段落排在 `app:web-surface` 之后，紧挨着它所补充的那段话。 */
const SECTION_OFFSET = 10

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
 * 渲染提示词段落。
 * @param ctx - 装配用的上下文。
 * @param mode - 已解析的 `prompt` 配置。
 * @returns 段落文本；地址不可解析时返回空串（等于不贡献段落）。
 */
function promptText(ctx, mode) {
  const url = resolveAuthenticatedUrl(ctx)
  if (url === undefined) return ''
  const inline = mode === 'inline'
  const address = inline
    ? url
    : `\`$${AUTH_URL_KEY}\` (\`$${CLEAN_URL_KEY}\` is the same origin without the token)`
  const target = inline ? url : `"$${AUTH_URL_KEY}"`
  return [
    'Shell access to this Web GUI is authenticated: an unauthenticated request to the clean URL answers 401,',
    "because the browser session is a signed cookie minted from this process's launch token.",
    `The authenticated address is ${address}.`,
    `Exchange the token once and keep the jar — \`curl -s -c "$JAR" -b "$JAR" -o /dev/null -w '%{http_code}' ${target}\` answers 303 and sets the cookie;`,
    'every later request through that jar is authorized.',
  ].join(' ')
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
          description: 'Canonical local URL of the DeepSeek Harness Web GUI serving this session, carrying this process launch token for the browser-session exchange.',
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

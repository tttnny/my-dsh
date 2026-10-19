/**
 * @lynn123411/dsh-web-auth-url — 宿主半区（node）。
 *
 * connection 的浏览器会话鉴权只有一个入口：带本进程 launch token 的根地址。
 * `dsh-web-app` 有意只把干净地址交给模型与 shell，带 token 的地址仅打印到
 * stdout。于是模型自测这个 GUI 时第一枪必然 401。
 *
 * 本插件补上这一半：工具 `web_gui_login` 每次调用即时解析出带 token 的地址并
 * 原样交给模型；同时托管 `DSH_WEB_AUTH_URL`，每次 shell 调用即时解析，跟随
 * 重启后的 token 轮换。用法全部写在工具描述里，插件不注册任何提示词段落。
 *
 * 没有 web 部署的宿主不是错误路径：{@link inject} 让整条插件不激活，工具与
 * 变量都不出现。
 *
 * @module dsh-web-auth-url
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis 插件名（= patch 行 id）。 */
export const name = 'dsh-web-auth-url'

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

/** 监听器未 bind 时错误文本的前缀：稳定、可 grep，模型也读得懂。 */
const NOT_READY_CODE = 'WEB_GUI_LOGIN_NOT_READY'

/**
 * 解析本进程当前的登录地址：对外公布的那个根交给 connection 加 token。
 * 与 `dsh-web-app` 打印启动地址、注册 `DSH_WEB_URL` 用的是同一个根——配了
 * `publicUrl` 时是它，否则是监听器自己报的 origin。每次调用都重新解析，
 * 重启后 token 轮换会跟着变。
 * @param ctx - 能读到 webApp / webServer / connection 的上下文。
 * @returns 带 token 的地址；监听器未 bind 时 undefined。
 */
function resolveAuthenticatedUrl(ctx) {
  const server = ctx.get('webServer')
  const connection = ctx.get('connection')
  if (typeof server?.getOrigin !== 'function' || typeof connection?.authenticatedUrl !== 'function') return undefined
  try {
    const webApp = ctx.get('webApp')
    const origin = typeof webApp?.getAdvertisedUrl === 'function' ? webApp.getAdvertisedUrl() : server.getOrigin()
    return connection.authenticatedUrl(origin)
  } catch {
    // 监听器还没 bind（`getOrigin()` 会抛）：交给调用方决定是降级还是报错。
    return undefined
  }
}

/**
 * 登录地址工具：每次调用即时解析，直接把带 token 的地址交给模型。
 * @param ctx - 提供 webServer 与 connection 的上下文。
 * @returns 交给 `ctx.tools.register` 的工具定义。
 */
function loginTool(ctx) {
  return defineTool({
    name: TOOL_NAME,
    description: 'Return the launch-token URL of the DeepSeek Harness Web GUI this session is driving. The GUI'
      + ' exchanges that token for a browser session cookie on `GET /` and 401s every other path, so request this'
      + ' URL once to obtain the cookie, then send later requests to `$DSH_WEB_URL` with that cookie. The token'
      + ' belongs to this process: call again after a restart.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true, description: 'Root URL of this Web GUI carrying the launch token.' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Tokenized URL: ${value.url}\n`
          + `Exchange it once for the session cookie: curl -s -c "$JAR" -o /dev/null "${value.url}"\n`
          + 'Then use the jar instead of the token: curl -s -b "$JAR" "$DSH_WEB_URL/"',
      }],
    },
    async execute() {
      const url = resolveAuthenticatedUrl(ctx)
      if (url === undefined) {
        throw new Error(`${NOT_READY_CODE}: this Web GUI has not bound its listener yet, so there is no login address.`
          + ' Call again once the instance is serving')
      }
      return { url }
    },
  })
}

/**
 * 装载插件：注册登录地址工具并托管环境变量。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  ctx.tools.register(loginTool(ctx))

  ctx.inject(['shellEnv'], (envCtx) => {
    envCtx.shellEnv.register({
      name: CONTRIBUTOR_NAME,
      variables: {
        [AUTH_URL_KEY]: {
          description: 'Root URL of this Web GUI carrying its launch token; `web_gui_login` returns the same address.',
        },
      },
      resolve: () => {
        const url = resolveAuthenticatedUrl(envCtx)
        return url === undefined ? {} : { [AUTH_URL_KEY]: url }
      },
    })
  })
}

// src/host/rpcChannel.js —— B3 rpc 通道注册（0.1.5-rc.1 从 host/index.js 搬出，逻辑原样）。
// 以后谁改它：改 RPC 通道挂载方式 / 线上请求响应协议的人。预估约 60 行，超 350 打回。
// 接线：由 index.js 动态 import 加载（D7 禁止静态 import）；依赖全部显式传入；本文件不引用其他新文件。

/**
 * 注册精确 Fetch 路由 /api/dsws → dispatch 表。
 *
 * 为什么不用 connection.rpc.handle('/dsws', ...)：
 *   HostConnectionService.register() 内部是 owner.effect(() => owner.webServer.register(route))，而 owner 由
 *   cordis tracker 解析为「读取方 ctx 的 shadow」，服务解析沿**提供方 fiber 的祖先链**上溯（cordis 的
 *   fiber.store 按服务名索引，provide 时写 this.ctx.fiber.store[name]）；webServer 由兄弟插件
 *   dsh-host-webserver 提供、永不在该链上 → 抛 cannot get property "webServer" without inject（补 inject 亦无效）。
 *   旧实现把整段包在 catch {} 里 → 通道从未挂载，客户端每个 /dsws/* 落到静态兜底处理器拿 HTTP 405
 *   （与「路径不存在」同码），静默失效整个版本。
 *
 * connection.fetch.register 只走 owner.effect，不触碰 webServer；且 /api 载体由 connection 统一施加
 *   Host/Origin 栅栏 + 浏览器鉴权（createSharedFetchHandler → requestRejection），
 *   鉴权语义与原来的 { authority: 'loopback' } 等价。
 *   契约见 dsh-client-connection/lib/types/rpc.d.ts 的 ConnectionFetchRoute（path 必须位于 /api 之下）。
 *
 * @param deps.ctx 当前 apply 的 ctx；@param deps.handlers endpoint → handler 的 Map；
 * @param deps.fireLog 宿主侧日志埋点；@param deps.dispatchMeta 异常行散列/归类（懒加载函数）。
 * @returns {boolean} 通道是否注册成功（失败只 console.warn，不抛——不拖垮插件加载）。
 */
export function registerRpcChannel(deps) {
    const ctx = deps.ctx
    const handlers = deps.handlers
    const fireLog = deps.fireLog
    const dispatchMeta = deps.dispatchMeta
    const fail = function (code, message) { return Response.json({ ok: false, error: { code: code, message: message, details: {} } }) }
    try {
      const connection = ctx.get('connection')
      if (connection === undefined || connection.fetch === undefined || typeof connection.fetch.register !== 'function') {
        // 静默失败正是上一版把问题藏了整整一个版本的根因：注册不上必须留痕（仍不抛，不拖垮插件加载）。
        try { console.warn('[dsh-mattpocock-skills-deck] connection.fetch 不可用，RPC 通道 /api/dsws 未注册 —— 面板数据功能将全部不可用（DSH 版本不匹配？）') } catch (eW) {}
        return false
      }
      connection.fetch.register({
        path: '/api/dsws',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async function (request) {
          let body = null
          try { body = await request.json() } catch (eJson) { body = null }
          const endpoint = (body && typeof body.endpoint === 'string') ? body.endpoint : ''
          if (!endpoint) return fail('bad-request', 'invalid request body: missing endpoint')
          const args = body.args
          const fn = handlers.get(endpoint)
          if (!fn) return fail('not-found', 'unknown endpoint: ' + endpoint)
          try {
            return Response.json({ ok: true, value: await fn(args) })
          } catch (e) {
            try { dispatchMeta().then(function(dm){ try { fireLog('error', 'host.dispatch.error', { method: 'wf.' + endpoint, argsHash: dm.shortArgHash(args), errorKind: dm.dispatchErrorKind(e) }) } catch (eInner) {} }).catch(function(){}) } catch (eLog) {}
            return fail('internal', String((e && e.message) || e))
          }
        },
      })
      return true
    } catch (eReg) {
      try { console.warn('[dsh-mattpocock-skills-deck] RPC 通道 /api/dsws 注册失败：', (eReg && eReg.message) || eReg) } catch (eW2) {}
      return false
    }
}
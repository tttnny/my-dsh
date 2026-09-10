/**
 * seam/rpc.js · B3 rpc 绑定（客户端调用 → 宿主端点）
 *
 * R1 接口：rpc.call(endpoint, args): Promise<value> 统一解包
 *   dev：host.call('wf.' + endpoint, args)（动态 runner 注入，调用方自判 res.ok）
 *   pkg：rpcCall(endpoint, args)（conn.rpc.call('/dsws', endpoint, args) → RpcResult 解包 → res.value）
 *
 * 关键约束（实测）：两种方言的调用方看到同一形状 —— 宿主 handler 的原始返回值
 * （{ok, ...} 载荷）。动态 host.call 直返 handler 结果；pkg rpcCall 解包 RpcResult 信封
 * 后返回 res.value（= handler 结果）。因此 pkg 侧 host shim 的 call 只需去掉 'wf.' 前缀
 * 并转发给 rpcCall，行为即等价。
 */

/**
 * pkg 方言的 host shim 工厂：把动态方言的 host.call('wf.x', args) 映射到同源 POST /api/dsws。
 *
 * 0.1.5-rc.1 适配：原实现走 conn.rpc.call('/dsws', ...)，但 Host 侧 connection.rpc.handle() 在本版
 * 对兄弟插件不可用——register() 内部访问 owner.webServer，而 owner 经 cordis tracker 解析为读取方
 * ctx 的 shadow，服务解析沿提供方 fiber 的祖先链上溯，webServer（兄弟插件提供）永不在该链上，
 * 抛 `cannot get property "webServer" without inject` 后通道从未挂载（详见 src/host/rpcChannel.js 头部注释）。
 * /api/dsws 是 connection 暴露的精确 Fetch 路由，鉴权与 Host/Origin 栅栏由 /api 载体统一施加，
 * 因此这里不再需要 connection 服务，只用同源 fetch。
 * @param {() => object} getCtx 返回当前 apply 的 ctx（保留形参：调用方签名不变）
 */
export function createPkgHost(getCtx) {
  const rpcCall = async function (endpoint, args) {
    const resp = await fetch('/api/dsws', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: endpoint, args: args }),
    })
    if (!resp.ok) throw new Error('RPC 传输失败：' + endpoint + '（HTTP ' + resp.status + '）')
    const res = await resp.json()
    if (res && res.ok) return res.value
    throw new Error((res && res.error && res.error.message) || ('RPC 失败：' + endpoint))
  }
  return {
    call: (method, args) => rpcCall(method.replace(/^wf\./, ''), args),
    _rpcCall: rpcCall,
  }
}

/** dev 实现说明：host 是 runner 注入的自由变量，直接调用 host.call('wf.'+ep, args)。 */
export const describe = () => ({
  b: 'B3',
  name: 'rpc',
  covers: ['D5 host.call vs rpcCall / RpcResult 解包'],
  dev: 'host.call("wf."+endpoint, args)（runner 注入，自判 res.ok）',
  pkg: 'conn.rpc.call("/dsws", endpoint, args) → res.value（统一解包 + 抛错）',
})

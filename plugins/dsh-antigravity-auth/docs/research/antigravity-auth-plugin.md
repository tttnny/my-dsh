# DSH Antigravity OAuth 模拟登录插件：实现前研究（单账号、非官方）

> 修订日期：**2026-09-02**
> 目标包名：**`dsh-antigravity-auth`**
> 用户确认的主路径：在 DSH Host 内模拟 Antigravity OAuth，并调用社区逆向得到的 Antigravity 私有 Cloud Code contract；**不是**官方 `agy` 子进程桥，也不是 AI Studio API key / Vertex ADC。
> 账号范围：只支持用户自己的**单个账号**；不提供多账号、轮换、quota pool、header-style fallback 或跨账号重试。
> `dsh-codex-auth` 基线：`0.2.2`，commit [`e9b6cb6ba3da927da0d2f10458008aec1be58bfc`](https://github.com/suntianc/dsh-codex-auth/tree/e9b6cb6ba3da927da0d2f10458008aec1be58bfc)。
> 社区逆向基线：`@cortexkit/antigravity-auth-core@2.2.0` / `@cortexkit/pi-antigravity-auth@2.1.0`，commit [`351c2bf09f007792e7bc183ba73d11e2c57146fe`](https://github.com/cortexkit/antigravity-auth/tree/351c2bf09f007792e7bc183ba73d11e2c57146fe)。
> 当前 DSH 开发基线：[`dsh-v0.1.2-alpha.5`](https://github.com/deepseek-ai/deepseek-harness/tree/db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5)，commit `db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5`；原始 research 与 rc.2 影响报告保留为历史证据。
> 升级影响依据本项目报告 [`dsh-v0.1.2-alpha.5-cross-plugin-impact.md`](dsh-v0.1.2-alpha.5-cross-plugin-impact.md)：本插件需要 coherent dependency/peer graph、公开 API owner 迁移和新的 plugin-owned account RPC activation guard。
> 本次仍是**研究与设计**：未读取用户 token/keychain/cookie，未启动真实 OAuth，未调用任何私有 endpoint，也未消耗 Antigravity 额度。

## A. 用户已确认的不可变约束

1. 要做的就是 **Antigravity OAuth 模拟实现**：复用社区观察到的 OAuth application metadata、PKCE、固定 loopback callback、token exchange/refresh，以及私有 Cloud Code 请求格式。
2. 只允许用户自己的一个账号；存储模型必须是单个 object，而不是 accounts array。
3. 不实现账号添加列表、账号切换、轮换、proactive rotation、quota fallback、Gemini CLI quota fallback 或 fingerprint regeneration。
4. 官方 `agy` CLI bridge 被否决为主方案；只在对照表中保留。
5. AI Studio API key / Vertex ADC 不消费 Antigravity 权益，也被否决为主方案。
6. 仍以 `dsh-codex-auth` 的登录、LLM、Search、Image、Usage、设置 UI、安全和包形状为能力基线，并额外研究视频理解。
7. private Cloud Code 请求直接模拟固定版本的 `agy` wire identity（User-Agent/framing），不先尝试 DSH 默认 User-Agent，也不做 identity fallback 或 fingerprint regeneration；这是 transport compatibility 约束，OAuth 凭据安全仍由 PKCE/loopback/token-store 设计提供。
8. 保留现有 `@deepseek-ai/dsh-llm` runtime，不新建一个替代整个 `ctx.llm` 的插件，也不修改 DSH core；“provider-required User-Agent + 独立 DSH attribution carrier”由 `dsh-antigravity-auth` 自有 Wire Identity module 实现。
9. 任何 live OAuth/private endpoint probe 仍需用户另行明确授权；本次架构确认不等于授权访问真实账号。

## 0. 结论先行

### 0.0 DSH `0.1.2-alpha.5` 升级策略

- 直接 DSH peer range 升到 `^0.1.2-alpha.5`；dev dependencies 与 lockfile 使用 exact alpha.5 coherent graph，并同步 Cordis `4.0.2` 与 Schemastery `3.18.2`，禁止混合其它 DSH prerelease family。
- 将升级作为独立 compatibility prefactor；不追改已经实现的 capability shell/bootstrap ticket。
- 升级 gate 是 clean install → `pnpm peers check` → OAuth/RPC/UI/Wire Identity regression → 完整 `pnpm run check`。
- 迁移到 `ToolCallId`、`ctx.settings.installSection()`、Session snapshot accessor、Connection 的 `ConnectionRpcResult` 以及 Cordis/UI Settings/UI Renderer 对应的 Client type owners；移除 alpha.5 未发布的 runtime/apiproxy 旧包。
- alpha.5 不再提供逐 method 或 Host 侧 carrier authority。插件只有在 WebServer 明确绑定 `127.0.0.1` 时使用真实 account dispatcher；缺失或其它 bind 只注册 value-free denial stub。Client UI 再按 `ConnectionHandle.isLoopback` 收敛可见面，但该 hint 不承担授权；owner-contained 自定义 carrier 在上游提供 Host 侧事实前保持 fail closed。
- 本插件继续使用 plugin-owned private transport 与 Wire Identity，不自动采用 DeepSeek Files API，也不为未使用的 request-image seam 增加 shallow adapter。
- 后续 DSH prerelease family 升级必须先产出新的 impact assessment，再整体升级 dependency graph。

### 0.1 产品定位

推荐包名恢复为 **`dsh-antigravity-auth`**，provider route 使用 `google-antigravity`。

它必须被描述为：

> Single-account, unofficial, reverse-engineered Antigravity OAuth adapter for experimental self-use.

不能使用 `official`、`supported`、`stable`、`production-ready` 或“合规登录”字样；第一版仓库/package 应保持私有，且不执行 npm public publish。

### 0.2 Go / No-Go

| 范围 | 判定 |
|---|---|
| 离线 mock、fixture、Auth/transport 设计 | **GO** |
| 单账号本地实验实现 | **Conditional GO**：风险确认 + Gate 0/A/L/S/I/V 逐项通过 |
| 真实 OAuth 或私有 endpoint smoke | **HOLD**：需用户单独明确授权 |
| 多账号、轮换、quota/header pool fallback | **NO-GO** |
| 公开 npm 发布或宣传为官方支持 | **NO-GO** |

Google FAQ 明确写明，第三方软件、工具或服务使用 Antigravity 登录违反条款，可能导致账号暂停或终止。[Antigravity FAQ](https://antigravity.google/docs/faq/)；[Antigravity Additional Terms](https://antigravity.google/terms)

社区项目自身也给出同样警告，并提到 suspension、ban 与 shadow-ban 风险。[CortexKit README — Risk warning](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/README.md#risk-and-terms-of-service-warning)

用户只用自己的单个账号，可以移除账号池与额度规避设计，但**不会改变 OAuth client/private endpoint 仍未获 Google 支持这一事实**。

### 0.3 目标能力摘要

| 能力 | 当前证据 | 实施判定 |
|---|---|---|
| OAuth + PKCE + loopback | 社区源码完整可见；Google OAuth endpoint 是公开标准 | **可实现，需 Gate A** |
| Token refresh | 社区源码可见 | **可实现，需单账号 refresh coordinator** |
| Project discovery | 私有 `loadCodeAssist` 社区可见 | **POC gated；不自动 onboarding** |
| LLM text/reasoning/tool call | 社区 Pi/OpenCode transport 已实现 | **可实现，需自有 DSH adapter 与 Gate L** |
| Web Search | 社区已有 dedicated grounded request | **可实现，需 Gate S** |
| 图片输入/生成/编辑 | 社区 registry/transform/inlineData output 有证据 | **可实现，需 Gate I** |
| `list_images` | DSH provider-independent 能力 | **Gate I 后可实现** |
| 单账号 quota | 私有 quota endpoint 社区可见 | **可实现，未获官方保证** |
| Workspace 视频理解 | 社区 modality 未声明 video | **仅 Gate V POC，不能预先承诺** |
| Web composer 原生视频附件 | DSH `0.1.2-alpha.5` impact assessment 仍无 video lifecycle | **当前不可做，需独立 DSH 上游任务** |

## 1. 政策与证据分层

本文把事实分为三层：

1. **官方已证实**：Google OAuth 标准行为、Antigravity FAQ/Terms、DSH 公共类型。
2. **社区实现可见但未获官方支持**：OAuth application metadata、私有 endpoint、request envelope、HTTP framing、quota/image/search schema。
3. **待 live POC**：目标账号实际授权、endpoint 对“固定 `agy` identity + 独立 DSH attribution carrier”的接受度、模型目录、图片参数、视频 input。

不得把“社区代码里存在”写成“Google 官方 contract”。

固定社区源码中与本方案直接相关的证据：

- OAuth metadata、scopes、redirect、私有 endpoints：[`constants.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/constants.ts)
- authorize/exchange/refresh/project lookup：[`antigravity/oauth.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/antigravity/oauth.ts)
- project load/onboarding：[`project.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/project.ts)
- raw HTTP/1.1 transport：[`agy-transport.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/agy-transport.ts)
- request/session metadata：[`agy-request-metadata.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/agy-request-metadata.ts)
- model registry：[`model-registry.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/model-registry.ts)
- Pi request/stream mapping：[`packages/pi/src/convert.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/pi/src/convert.ts)；[`stream.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/pi/src/stream.ts)
- grounded search：[`packages/opencode/src/plugin/search.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/opencode/src/plugin/search.ts)
- image inlineData admission：[`request-helpers.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/opencode/src/plugin/request-helpers.ts)；[`image-saver.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/opencode/src/plugin/image-saver.ts)
- quota/model probes：[`quota-manager.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/quota-manager.ts)

## 2. Gate 0：DSH attribution 与私有 transport 身份

### 2.1 已证实的 DSH 合同

DSH `LlmAdapter` 公共类型明确要求每个 provider HTTP request 包含 `attributionHeaders()`。该函数默认返回 `User-Agent: deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)`；即使白标部署传入自定义 `AppIdentity`，也必须如实反映产品事实，且不能省略 attribution header 或用于冒充别的产品。

本机依据：

- `@deepseek-ai/dsh-llm/lib/types/index.d.ts` 的 `LlmAdapter` 注释；
- `@deepseek-ai/dsh-llm/lib/types/attribution.d.ts`；
- 固定 DSH commit：[`packages/llm`](https://github.com/deepseek-ai/deepseek-harness/tree/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca/packages/llm)。

### 2.2 社区 transport 的行为

社区 raw transport 复现了抓取到的 `agy` HTTP/1.1 framing、header 顺序、chunked body 与 AGY CLI 1.1.24 User-Agent；content request capture 只含该 provider User-Agent，不含 obsolete desktop `X-Goog-Api-Client` / `Client-Metadata` headers。`fingerprint.ts` 也明确说明这些值来自抓包观察。[`fingerprint.ts`](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/core/src/fingerprint.ts)

但没有官方文档证明私有 endpoint **一定拒绝**其它 User-Agent。不能把社区为兼容而做的模拟，升级成已证实的服务端校验规则。

### 2.3 用户已确认的 wire identity 方案

用户选择 private Cloud Code 请求直接模拟固定版本的 `agy` wire identity，而不是先发送 DSH 默认 User-Agent。实现约束为：

1. `User-Agent`、HTTP/1.1 framing、header order 与 envelope identity 取自固定、已审计的 community core snapshot；
2. 不随机 fingerprint、不轮换版本、不在 4xx 后切 identity，也不声称这是 OAuth/凭据安全机制；
3. 不调用 `attributionHeaders({ product: 'antigravity' ... })` 冒充白标部署；
4. fixture 只保留状态码、结构化 error code 与 request id，不保留 token/body；
5. Search/Image/Video/Quota 等所有 secret-bearing private request 使用同一 identity policy，不能各自散落 header 逻辑。

### 2.4 Plugin-owned Wire Identity seam

`@deepseek-ai/dsh-llm` 虽然以 Cordis plugin 挂载为 `ctx.llm`，但没有必要替换或修改它。`dsh-antigravity-auth` 继续使用公开 `ctx.llm.registerAdapter()` 和 `attributionHeaders()`，只在自己的 Host-only Wire Identity module 内适配 private transport 所需的两个 carrier：

```text
provider-required User-Agent: antigravity/cli/...
DSH attribution carrier:      X-DeepSeek-Harness-Attribution: deepseek-harness/...
```

核心语义是：

- provider 保留固定、已审计的 `agy` User-Agent/framing；
- module 调用公开 `attributionHeaders()` 获取真实 DSH identity value，不复制 formatter、不伪造 AppIdentity；
- DSH identity 通过固定 secondary header 在 wire 上可审计，private caller 不能省略、重命名或覆盖；
- LLM/Search/Image/Video/Quota/project discovery 共用同一 module；
- 不替换 `ctx.llm`、不修改 DSH core、不 patch `node_modules`、不修改用户 profile。

该 carrier adaptation 被明确标记为 private experimental plugin policy。若目标 DSH 版本或 private endpoint 不接受它，则 Gate 0 失败；不能自动降级成“只发 agy UA”，也不能把 scope 扩展到 DSH core。

## 3. OAuth 模拟实现

### 3.1 OAuth metadata

社区固定源码可见：

- Google authorization endpoint；
- Google token endpoint；
- 固定 localhost callback port/path；
- OAuth client id、静态 client metadata 与 scopes；
- offline access + consent；
- authorization-code exchange 与 refresh-token exchange。

报告不重复 client id/client metadata 的具体字符串；实现优先从**固定版本** `@cortexkit/antigravity-auth-core@2.2.0` 导入。Authorization URL 按 OAuth 协议必然把 client id、redirect、scopes 与 PKCE challenge 交给浏览器；除此之外，不把这些值拆成 settings/status 字段或写进日志，token-exchange metadata 只留在 Host。

静态 OAuth client metadata 对 distributed desktop application 无法构成真正机密，但它仍是 Antigravity application 的绑定信息，不应被误标成用户 secret，也不应成为可编辑 settings。

Google 对标准 OAuth 的公开说明：

- loopback redirect 仍支持 desktop application，但存在本地 code interception 风险；[Loopback migration guide](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration)
- `state` 用于 CSRF 防护，offline access 返回 refresh token，refresh 通过 token endpoint；[OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)

这些官方材料只证明 OAuth 原语，不代表 Google 授权第三方复用 Antigravity client。

### 3.2 不直接复用社区 `authorizeAntigravity()` / `exchangeAntigravity()`

社区 helper 把 PKCE verifier 与 project id 编码进 `state`。该值只是 base64url，不提供保密性；callback interception 者同时拿到 code/state 时也会拿到 verifier。

本插件自行实现更严格的 flow coordinator：

```text
PendingOAuthFlow {
  state: random 256-bit handle
  verifier: PKCE verifier
  challenge: S256(verifier)
  createdAt / expiresAt
  consumed: false
}
```

规则：

- `state` 只是一段随机 handle，不携带 verifier/project/account 信息；
- pending flow **只在 Host memory** 保存；进程重启即失效，不把 verifier 写盘；
- 同时只允许一个 pending flow；新 flow 显式取消旧 flow；
- 默认 TTL 5 分钟；
- callback 验证成功后先同步删除 pending entry，再做 token exchange，防止并发重放；
- 失败、取消或超时立即清除 verifier。

### 3.3 Loopback callback

固定 redirect 使端口不能任意变化。listener 只在用户点击 Login 后启动，并在成功、失败、取消或超时后关闭；不在插件整个生命周期永久占用端口。

必须满足：

- 只绑定 `127.0.0.1`，绝不绑定 `0.0.0.0`；
- 精确接受 `GET /oauth-callback`；
- Host 只接受 `localhost:<fixed-port>` / `127.0.0.1:<fixed-port>`；
- 必须有一个且只有一个 `state` 与 `code`，或处理 OAuth `error`；
- 错误 path/method/Host 不消费 pending state；
- `EADDRINUSE` 立即让本次登录失败，不换端口；
- callback response 使用 `Cache-Control: no-store`、严格 CSP、无远程资源、无 analytics；
- 只有 token exchange 和持久化完成后才显示 success。

`localhost` 在 IPv4/IPv6 上的解析差异需做 macOS/Linux/Windows fixture。不能为“兼容远程”改绑公网地址。安全复核后，callback completion 被收窄为 Host loopback listener only；browser RPC 不接收完整 callback URL、code 或 state。远程 Host 需要另行设计不跨越 browser/RPC secret boundary 的公开 seam，当前插件不提供该 fallback。

### 3.4 Authorization 与 token exchange

Host 构造 authorization URL：

- `response_type=code`；
- 固定 redirect；
- community-observed scopes；
- `code_challenge_method=S256`；
- `access_type=offline`；
- `prompt=consent`；
- 随机 state handle。

DSH client 只收到 authorization URL、flow id 与 expiry；浏览器打开该 URL。URL 不包含 token/verifier。

Token exchange/refresh 都只在 Host：

- code exchange 使用 Host memory 中的 verifier；
- refresh response 若不返回新 refresh token，保留旧 token；
- token/error response body 不进入日志；
- 不把 access token 写入 settings/RPC/browser；
- 不解析未验证的 access token/JWT 来推断 account id、plan 或权限。

userinfo 请求是可选增强，只用于显示经过掩码的邮箱；失败不影响凭据。第一版也可以完全不请求 userinfo，只显示“单账号已登录”。

### 3.5 Project discovery

OAuth 成功不等于私有模型可用。社区通过私有 `v1internal:loadCodeAssist` 解析 `cloudaicompanionProject`，并在后续 `ensureProjectContext()` 中可能调用 `onboardUser` 或使用 hard-coded fallback。

本插件第一版：

- 只做 `loadCodeAssist` read probe；
- 不使用 hard-coded fallback project；
- 不自动调用 `onboardUser`；
- 没有属于该账号的 project id 就标记 `project-unavailable`，LLM/Search/Image/Quota 不可用；
- 若未来需要 onboarding，必须作为独立、用户显式确认的写操作另行设计和授权，不与 Login 或首个 prompt 绑定。

### 3.6 单账号 token store

不用 community `AccountManager`、accounts array 或 packed `refreshToken|projectId|managedProjectId` 字符串。使用版本化结构：

```json
{
  "version": 1,
  "refreshToken": "<host-only>",
  "projectId": "<optional>",
  "managedProjectId": "<optional>",
  "email": "<optional>",
  "revision": 1,
  "updatedAt": "<ISO-8601>"
}
```

约束：

- POSIX parent directory `0700`、file `0600`；Windows 使用用户数据目录 ACL，不把合成的 POSIX group/other mode bits 作为访问判据，但所有平台仍校验 symlink、文件类型、大小与 schema；
- 使用 plugin-owned path，例如 `${XDG_DATA_HOME:-~/.local/share}/dsh-antigravity-auth/auth.json`，Windows 使用等价 user data path；路径可配置但不能进入 workspace；
- 用 DSH 公共 atomic-write/file-lock seam 或同等级的 plugin-local fenced lock；
- 不写 `.bak` 明文副本；corrupt file fail-loud，不静默从不受控备份恢复；
- access token 只在 Host memory 缓存；重启后用 refresh token 获取；
- 不把 cookie、authorization code、PKCE verifier、raw userinfo 或 private response 写盘。

### 3.7 Refresh 协调

参考 `dsh-codex-auth` 的两阶段 refresh，而不是 community 多账号 manager：

1. 锁内读取 auth revision，判断是否需要 refresh；
2. 锁外执行 OAuth round trip；
3. 再入锁，重读 revision/refresh-token lineage；
4. 若期间发生 Login/Logout/另一个 refresh，则丢弃旧结果；
5. 否则原子更新可能旋转的新 refresh token。

进程内同一时间只有一个 refresh Promise；跨进程由短锁与 revision 协调。`invalid_grant` 标记 re-login required；429/5xx 只做有界退避，不删除有效 refresh token。

### 3.8 Logout / revoke / RPC

- **Local logout**：清除 memory、原子删除 auth file；
- **Revoke grant**：用户显式选择后，以 form POST 调 Google revoke endpoint，随后清除本地状态；token 不放 query string；
- 登录失败时保留旧的可用单账号凭据，只有新 exchange + project validation 完成后才替换；
- loopback-only RPC 只返回 `configured/status/expiresAt/maskedEmail/projectAvailable/lastRefreshAt/errorCode`；
- 绝不返回 access/refresh/code/verifier/raw callback URL/project exact value。

## 4. 社区 package 的复用边界

### 4.1 可以复用的 `@cortexkit/antigravity-auth-core@2.2.0` 公共面

固定 exact version 与 lockfile integrity，审计后只导入：

- endpoint/client/scopes 常量；
- `fetchWithAgyCliTransport` 与 framing parser；
- request/session metadata helper；
- Gemini/Claude transform 与 schema sanitizer；
- model registry/resolver；
- `fetchQuotaSummary` / `fetchAvailableModels` 等单次 probe helper（必须注入统一的固定 `agy` identity + DSH attribution carrier policy）；
- 类型与纯函数。

### 4.2 不复用的部分

- `AccountManager`、account storage、rotation、killswitch、selection strategy；
- quota-style fallback、Gemini CLI fallback、proactive rotation；
- community OAuth authorize/exchange state encoding；
- `ensureProjectContext()` 的 automatic onboarding/hard-coded project 路径；
- fingerprint regeneration；
- `SKIP_THOUGHT_SIGNATURE` sentinel；缺签名时应降级/重启上下文，而不是绕过校验。

### 4.3 为什么不能直接使用 `@cortexkit/pi-antigravity-auth`

该 package 的唯一入口是一个 Pi Coding Agent `ExtensionAPI` 注册器，不是 `@earendil-works/pi-ai` `Provider` factory，也没有公开 `./stream` / `./convert` subpath。[Pi package manifest](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/pi/package.json)；[Pi entry](https://github.com/cortexkit/antigravity-auth/blob/351c2bf09f007792e7bc183ba73d11e2c57146fe/packages/pi/src/index.ts)

因此不能把默认 export 塞进 DSH `PiAiAdapter`。标准 pi-ai Google provider 又调用公开 `generativelanguage.googleapis.com` + API key，不等于 private Cloud Code Bearer transport。

第一版应实现 `AntigravityAdapter extends LlmAdapter`，使用 core 公共 transport/transform；若 CortexKit 后续提供带 attribution hook 的 public Provider factory，再评估迁移。

## 5. LLM Adapter 设计

### 5.1 route 与模型

- DSH provider route：`google-antigravity`；
- 模型初始 catalog 只取 audited core `2.2.0` community registry 中 `antigravity-*` entries；不暴露 Gemini CLI fallback entries；
- Gemini 3.8 Flash 使用 core 捕获的 `gemini-3.8-flash-medium` 基础 wire route、`MODEL_PLACEHOLDER_M319` metadata 与原生 Medium 默认 reasoning effort；显式 Low/High effort 分别解析到 captured tier route 与对应 model enum；
- 登录后用私有 `fetchAvailableModels` 做 advisory intersection；服务端的 `gemini-3.8-flash-tiered` 目录别名规范化到 3.8 tier family，成功结果会过滤账号目录中不存在的旧路由；
- catalog 缓存有版本/时间；失败时保留“社区 snapshot，未验证”标记，而不是冒充 live 可用，因此降级期间可能继续显示 core 仍收录的 Gemini 3.5 Flash；
- image-output-only route 不进入普通 chat catalog，交给 Image tool。

### 5.2 DSH request → private request

`GenerateOptions` 映射：

- `system` → `systemInstruction`；
- `messages` → Gemini-shaped `contents`；
- user `ImageBlock` → `ctx.attachments.readImage()` → bounded base64 `inlineData`；
- tool schemas → sanitizer 后的 `functionDeclarations`；
- reasoning effort → model resolver 的 thinking budget/level；Gemini 3.8 Low/Medium/High 使用 AGY 1.1.24 capture 的 numeric budgets `1000/4000/-1`，而不是 `thinkingLevel`；
- max tokens/temperature/stop 仅在私有 schema 已验证时发送；不支持的 option 明确报错；
- `sessionId` 只用于产生 adapter-private request metadata，不直接泄露 DSH durable id；
- outer envelope 包含 community-observed project/request/model/`userAgent: "antigravity"`/requestType fields，并按 captured 顺序序列化。

### 5.3 private stream → DSH `StreamChunk`

- SSE `candidates[].content.parts[].text` → text/reasoning delta；
- `functionCall` → `tool-call-delta`，arguments 保持 raw JSON string；
- usageMetadata → `TokenUsage`，先发 usage 再发 terminal finish；
- finish reason → `stop/tool-calls/max-tokens/error/aborted`；成功 terminal event 后继续排空 SSE framing/EOF，再完成 DSH stream，禁止中途取消 Node raw-to-Web reader；
- embedded error/promptFeedback → structured `LlmError`；
- unknown part 只记录类型名/大小，不记录内容，并按 protocol-drift 失败。

### 5.4 Thinking/tool signatures 与 replay

DSH block 本身没有 signature 字段，但 `ReplayEnvelope.blocks[]` 正是 adapter-private、按 first-seen block 对齐的持久化 seam。

存储：

```text
response: { kind, version, wireModel, requestId, nativeFinishReason }
blocks[i]:
  text      -> { textSignature? }
  reasoning -> { thinkingSignature?, redacted? }
  tool-call -> { thoughtSignature? }
```

重放时：

- 只接受 version/schema 校验通过、block 数量/类型对齐的 metadata；
- 只在同 adapter、兼容 model family 上恢复签名；
- cross-model/fork/metadata mismatch 时剥离签名并降级为 provider-neutral history，必要时重新开始上下文；
- 不注入社区的 signature-validation bypass sentinel。

### 5.5 Cancel、timeout、retry

- `options.signal` 同时取消 request body、socket reader、SSE iterator 与 response body；
- response-header、stream-idle、total timeout 分开；
- stdout/body/单 SSE frame/JSON depth/base64 image 都有上限；
- generation dispatch 后不自动 endpoint failover，避免重复计量；
- adapter 的 `providerRetryPolicy()` 必须与内部规则一致，防止 DSH runtime 在 adapter 外层再次重放；
- 401 允许一次 coordinated refresh 后重放，但仅在尚未产出任何 model delta 时；
- 429 不切账号、不切 quota style；默认交给用户重试；
- 5xx/network 只在可证明请求未被服务端接受时重试；否则 fail-loud。

### 5.6 与 `dsh-codex-auth` 的差异

`dsh-codex-auth` 能继承 `PiAiAdapter`，因为 pi-ai 内置 `openai-codex` provider；本方案没有内置 private Cloud Code provider，因此必须拥有 request/stream mapper。它仍只使用公开 `ctx.llm.registerAdapter()`，不修改 DSH core。

## 6. Search（Gate S）

社区 OpenCode 实现已经证明可以发送一条**独立** private `v1internal:generateContent` 请求，只带 `googleSearch`（可选 `urlContext`），并从 `groundingMetadata` 解析：

- response text；
- `webSearchQueries`；
- `groundingChunks[].web.{uri,title}`；
- `groundingSupports`；
- URL context status。

原因是 `googleSearch` 与普通 `functionDeclarations` 不能安全混在同一 request；因此 Search 必须是 dedicated call，而不是在普通 DSH tool schema 中硬塞一个 native tool。

DSH 实现：

1. 注册 `WebSearchProvider` id `antigravity`；
2. `search({query,maxResults}, signal)` 调 dedicated private request；
3. 只带 search grounding，不带任意 DSH functions；
4. 只从真实 `groundingMetadata.groundingChunks` 产生 sources；
5. URL 必须是 HTTP(S)，去重、限长；
6. 没有真实 source metadata 时返回 provider error，不让模型补写引用；
7. `maxResults` 由 request 与 `ctx.web` seam 双重约束；
8. 不注册 WebFetchProvider，因为 `urlContext` 不是一个返回 HTTP status/body 的安全 fetch contract。

Gate S live fixture 必须证明目标账号/model 返回稳定 grounding metadata；失败则不注册该 provider。

## 7. Image（Gate I）

### 7.1 社区证据

- registry 有 `antigravity-*-flash-image`，input/output 包含 image；
- transform 为 image model 添加 `generationConfig.imageConfig`；
- response mapper 处理 `part.inlineData`；
- OpenCode 实现把 base64 图片写磁盘，只是因为它没有 DSH AttachmentStore。

这证明 private generation path 在社区实现中存在，但不是官方稳定 contract；目标账号仍需 POC。

### 7.2 DSH 实现

`generate_image` 与 `list_images` 复用 `dsh-codex-auth` 的工具/UI contract，但 provider transport 改为 Antigravity private request：

- prompt → image model request；
- edit/reference image 先做 session/workspace authorization，再通过 `ctx.attachments.readImage` 输入 `inlineData`；
- output `inlineData` 先做 base64 length bound，再 decode；
- `ctx.attachments.validateImage()` / `saveImage()` 是唯一 admission/persistence seam；
- 不写 `~/.opencode/generated-images`，不返回 data URL/file URI，不记录 base64；
- 生成结果作为 durable `ImageBlock`/tool result；独立 CLI 的 Gate I 使用 owner-only content-addressed store，并在写入前验证 PNG chunk CRC、IDAT/IEND、有界 zlib decode、row filter 与 pixel dimension；
- `list_images` 使用 DSH session authorization、pagination/cursor/origin filter。

### 7.3 参数语义

社区证据只明确支持一组 aspect ratios，并说明 resolution 暂不支持。第一版：

- aspect ratio 可映射时发送；
- size/quality/background/transparent 等没有证据的 option 返回 `UNSUPPORTED_IMAGE_OPTION`，不能静默忽略；
- `n > 1` 只能做多个独立 request，默认不自动重试，部分成功返回 warning；
- edit 是否保真、支持的 input MIME、最大 bytes 全部由 Gate I fixture 固定。

Gate I 未通过时，不注册 Image tools/gallery。

## 8. Video Understanding（Gate V）

### 8.1 当前事实

社区 `ModelModality` 只有 `text | image | pdf`，没有 video；core/Pi/OpenCode 也没有 MP4/WebM/MOV/AVI request mapping。

Google Gemini 的公开 API 支持视频，只能作为对照，不能证明 Antigravity private endpoint 接受相同 payload。[Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)

DSH `0.1.2-alpha.5` attachment seam 仍只接受 PNG/JPEG/WebP/GIF，没有 durable video ref、browser prompt part 或 ACP video projection。[DSH attachment README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.5/packages/attachment/attachment/README.md)

### 8.2 Workspace Tool POC

可研究一个 `antigravity_analyze_video` DSH Tool：

1. 输入 workspace 相对路径与问题；
2. 通过 `ctx.fs.resolve/lstat/readBytes(maxBytes)` 验证 containment、regular file、大小；
3. 检查 magic MIME，只允许 POC 清单；
4. 把 bounded bytes 作为候选 `inlineData { mimeType: video/*, data }` 发送给一个已验证 model；
5. 结果只返回 text/usage，不持久化视频，不把 path/base64 放入 session；
6. `AbortSignal` 必须覆盖读文件、编码、request、stream。

首个 fixture 使用无隐私的短 MP4，并询问一个无法从文件名/metadata猜出的视觉事实。通过标准：答案正确，且 request/response fixture 能证明媒体 part 被接受。

### 8.3 停止条件

- private endpoint 返回 400/415/unsupported modality；
- 只有公开 Gemini Files API 才能上传；
- 需要读取 `agy` keychain/transcript/private upload cache；
- 需要把文件放到 DSH policy 外；
- 只能通过抽帧猜测，却对外称为完整视频理解。

失败后可以另做明确命名的“frame sampling”降级，但它不是完整视频/音频/时间轴理解，不能满足原视频能力声明。

### 8.4 原生会话视频

完整 composer/attachment 支持仍需独立 DSH core 工作：video ref、admission/store/read、browser/ACP/MCP upload、player、compaction、fork/resume、retention 与 policy-aware binary streaming。当前插件不能暗中扩展这些 closed/core-owned seams。

## 9. Usage / Quota

社区 private contract：

- `v1internal:retrieveUserQuotaSummary` 返回 group、5h/weekly windows、remaining fraction 与 reset time；
- `v1internal:fetchAvailableModels` 可辅助 catalog/quota；
- 这些都是社区实现可见，不是 Google public quota API。

单账号实现：

- 只查询当前 credential/project；
- UI 显示规范化后的 group/window/remaining/reset/checkedAt；
- 不返回 raw response/project id；
- 手动刷新为主，后台最小间隔；
- 429/403 显示错误，不切账号、endpoint identity 或 quota style；
- quota 为 0 不自动转 Gemini CLI/API key；
- private schema drift 时禁用卡片，不根据模型错误猜余额。

## 10. 包与模块设计

```text
dsh-antigravity-auth/
├── package.json
├── README.md / README.zh.md
├── CHANGELOG.md
├── cordis.patch.yml
├── src/
│   ├── index.ts
│   ├── auth-service.ts
│   ├── auth-store.ts
│   ├── oauth-flow.ts
│   ├── loopback-server.ts
│   ├── private-client.ts
│   ├── request-transform.ts
│   ├── stream-parser.ts
│   ├── llm-adapter.ts
│   ├── replay.ts
│   ├── models.ts
│   ├── search.ts
│   ├── image.ts
│   ├── video.ts
│   ├── usage.ts
│   ├── rpc-contract.ts
│   ├── invariant.ts
│   └── client/
│       ├── index.ts
│       ├── AntigravityAuthSettings.tsx
│       ├── AntigravitySearchSettings.tsx
│       ├── AntigravityImageSettings.tsx
│       ├── AntigravityVideoSettings.tsx
│       ├── AntigravityUsageView.tsx
│       └── locales.ts
└── tests/
```

建议 exports：`.`、`./client`、`./search`、`./image`、`./video`、`./invariant`、`./cordis.patch.yml`。

Host rows 独立挂载：Auth/LLM、Search、Image、Video。未通过 Gate 的 row 不注册对应 capability；状态页仍显示明确原因。

不修改 `dsh-codex-auth`，也不修改/patch DSH 或 `node_modules`。

## 11. Settings 与 UI

### Auth 卡

- 标题必须含 `Unofficial / Experimental`；
- 首次 Login 前展示 FAQ/Terms 风险并要求一次明确确认；
- Login、Cancel pending login、Local logout、Revoke grant；
- masked email（可选）、token expiry、project availability、last refresh；
- 不显示 token、OAuth client metadata、exact project id、raw provider error；
- 不提供 Add/Switch/Rotate account。

### Search / Image / Video / Usage

- 每卡展示 `Available / POC not passed / Disabled / Protocol drift`；
- 未通过 Gate 时不能只隐藏设置或伪装成 supported；
- Video 卡明确区分 workspace POC 与原生 session video；
- Usage 卡明确标注 private reverse-engineered data；
- 中英文；secret 不进入 settings snapshot。

### RPC

- 使用 typed loopback-only RPC；
- login URL 可返回 browser，因为不含 verifier/token；
- manual callback URL 是一次性敏感值，只接受 request body，不记录、不回显；
- status/usage payload 做字段白名单和大小上限；
- client unmount/cancel 必须释放 pending flow/listener。

## 12. 安全不变量

1. 单账号 store，不允许 array/index/selection strategy。
2. endpoints 固定 allowlist；settings 不允许自定义 token-bearing base URL，避免 credential exfiltration/SSRF。
3. token/code/verifier/callback URL/cookie/raw error body 永不日志；连 token prefix 也不记录。
4. refresh token 只在 POSIX `0600` / Windows ACL-managed auth file；access token 只在 Host memory。
5. OAuth pending verifier 只在 memory，短 TTL、单次消费。
6. callback 只绑定 loopback；不因 SSH/WSL 自动改成 `0.0.0.0`。
7. 不自动 `onboardUser`、不使用 hard-coded fallback project。
8. 不运行 account manager、rotation、quota fallback、fingerprint regeneration。
9. 不用 signature bypass sentinel。
10. 每个 private request 使用固定 `agy` identity，并通过 plugin-owned Wire Identity module 携带独立、不可省略的 DSH attribution；Gate 0 失败就停止。
11. identity policy 集中在一个 Host-only deep module；Search/Image/Video/Quota 不自行拼 header。
12. workspace media 必须走 `ctx.fs`；图片必须走 `ctx.attachments`。
13. 所有 response/frame/base64/图片/视频/次数/时长均有上限。
14. 不在 install/postinstall/runtime 中修改用户 `agy`、`~/.gemini` 或其它插件配置。
15. 任何实际 OAuth/private request 都必须是用户显式触发或已明确授权的阶段。

## 13. 测试矩阵

### OAuth / Auth Store

- PKCE S256 fixture；
- state entropy、TTL、one-shot、并发 replay；
- wrong Host/path/method/missing code/error response；
- port occupied、listener timeout/cancel/close；
- browser RPC 明确拒绝 callback URL/code/state；callback completion 只走 Host loopback listener；
- code/token/error body leak scan；
- file permission、corruption、atomic failure；
- refresh coalescing、cross-process revision race、rotated refresh token；
- Login replacement preserves old credential until commit；
- logout/revoke；
- no `onboardUser` / no fallback project assertion。

### Attribution / Transport

- every private request preserves the fixed audited `agy` User-Agent/framing；
- every private request also carries the DSH upstream attribution carrier；
- default DSH adapters remain byte-for-byte unchanged when the opt-in seam is unused；
- duplicate/missing/provider-overridden attribution fails invariant tests；
- no automatic identity fallback after 4xx；
- HTTP framing, header/body timeout, idle timeout, cancellation；
- fixed endpoint allowlist；
- malformed/gzip/chunked/SSE/body-limit fixtures；
- embedded provider error and protocol drift。

### LLM

- text/reasoning/tool call interleaving；
- raw JSON argument assembly；
- usage before finish；
- replay block count/type/signature；
- cross-model/fork/compaction degradation；
- image input through attachment read；
- 401 refresh once；429 no rotation；ambiguous dispatch no retry；adapter/runtime retry policy 不叠加；
- per-family mock fixture：Gemini、Claude、GPT-OSS；
- advisory model catalog/update。

### Search

- dedicated request has grounding tools but no function declarations；
- grounding sources extraction、URL validation、dedupe、maxResults；
- no source metadata → explicit failure；
- cancel/429/403/protocol drift。

### Image

- text-to-image/edit/reference image；
- inlineData length/base64/MIME/magic/decode bounds；
- `validateImage/saveImage`，无 filesystem output；
- session handle authorization；
- unsupported options；
- n/partial success/no automatic retry；
- `list_images` pagination/origin/session authorization。

### Video

- workspace escape/symlink/TOCTOU/regular file/maxBytes；
- MP4 magic MIME；
- request contains bounded video inlineData；
- visual-fact fixture；
- cancel/timeout/unsupported modality；
- session log/browser/RPC 不含 video bytes/path/base64。

### Client / Package

- risk acknowledgement；
- loading/error/disabled/POC states；
- no account switching UI；
- RPC leak scan；
- lifecycle mount/unmount；
- `pnpm run check`；
- `pnpm pack` file list、package smoke、publint；
- package remains private；不执行 publish。

常规 CI 全部使用 mock/fixture。Live tests 必须单独 opt-in，且每个阶段只执行已批准的最小 request。

## 14. 分阶段计划

### Phase -1：Plugin-owned Wire Identity prefactor

该阶段只在 `dsh-antigravity-auth` repository 内建立后续 private operations 共用的 identity seam：

- 固定已审计的 provider-required `agy` User-Agent/framing；
- 调用公开 `attributionHeaders()` 获取 DSH identity value，并映射到固定 secondary carrier；
- 加入 header safety、不可省略/覆盖、operation consistency 与 wire fixture tests；
- 证明 DSH core、现有 adapters、用户 profile 与本机 `node_modules` 均无 diff。

**Exit**：plugin-owned module 可证明固定 provider UA 与 DSH attribution 同时存在于 wire，且没有 DSH core 变更。

### Phase 0：离线骨架

- 新独立 private repository；
- Auth store、PKCE coordinator、loopback server 的 mock；
- fixed core 2.2.0 dependency audit；
- private client/SSE/adapter fixtures；
- UI risk/status；
- 全部 no-network tests。

**Exit**：OAuth/security/attribution mock 全绿；无真实账号调用。

### Gate A：一次 live OAuth

需用户明确授权后：

- 一次 Login；
- 一次 refresh；
- 可选 userinfo；
- 一次 read-only `loadCodeAssist`；
- 不调用 model/quota/search/image/video，不调用 `onboardUser`。

**Exit**：token store/refresh/project 可用且无泄漏。失败即停止。

### Gate 0/L：固定 `agy` identity + 独立 attribution carrier + 最小文本

前置：plugin-owned Wire Identity module 已通过 offline wire fixtures；DSH core 与本机 `node_modules` 保持无 diff。

- 使用固定、已审计的 `agy` User-Agent/framing；
- 同一 request 通过 plugin-owned secondary carrier 携带公开 `attributionHeaders()` 产生的 DSH identity value；
- 验证 private envelope/SSE/usage；
- 不带 tools/search/media；
- endpoint 若拒绝额外 attribution header，立即停止，不降级成无 attribution 请求。

**Exit**：双重 identity wire contract 被 DSH 与 endpoint 同时接受，text stream 可稳定映射。

### Phase 2：完整 LLM parity

- reasoning/tool call/replay/cancel/model discovery；
- Gemini → Claude → GPT-OSS 分 family gate；每个 outcome 单次原子持久化，Auth/LLM 直接从三者派生，不另存 aggregate pass；
- settings 与 error classification。

### Phase 3：Usage + Search

- 一次 quota summary；
- dedicated grounded search；
- Gate S sources fixture。

### Phase 4：Image

- generation/edit live probe；
- attachment admission/persistence；
- options/list_images/gallery。

### Phase 5：Video

- 只执行 §8.2 的短 MP4 POC；
- 通过才注册 workspace tool；
- 不实现原生会话视频。

### Release Gate

- 重新读取 Google Terms/FAQ；
- 保持 private/self-use；
- 不 npm publish；
- 若用户以后要求公开发布，必须作为新的明确任务重新评估。

## 15. 与 `dsh-codex-auth` 的最终 parity 表

| 能力 | `dsh-codex-auth` | `dsh-antigravity-auth` 目标 |
|---|---|---|
| 账号 | 官方 Codex CLI login | 单账号模拟 Antigravity OAuth；非官方、高风险 |
| secret owner | Codex auth file | plugin-owned POSIX `0600` / Windows ACL-managed refresh-token file |
| 多账号 | 无 | 无，结构上禁止 |
| token refresh | 官方 OAuth | copied Antigravity OAuth metadata；single-flight/lineage |
| LLM route | `openai-codex` + PiAiAdapter | `google-antigravity` + custom LlmAdapter，Gate 0/L |
| text/reasoning/tools | 支持 | 社区证据支持，逐 family fixture |
| replay/signatures | PiAiAdapter | DSH ReplayEnvelope 自有 mapping |
| Search | DSH WebSearchProvider | dedicated private grounded request，Gate S |
| 图片输入 | 支持 | attachment → inlineData |
| 图片生成/编辑 | 支持 | private image model → inlineData → attachment，Gate I |
| list_images | 支持 | Gate I 后复用 |
| Usage | Codex window | private 5h/weekly quota summary；单账号、无 fallback |
| Video | 不支持 | workspace short-video POC；原生 session video 不支持 |
| UI/RPC | Host-only + loopback | 同，额外 risk/POC states |
| Workspace export | binary policy seam 未完成 | 同，不绕过 |
| 官方支持 | 否；项目 README 自我披露为 unofficial、unsupported/revocable channel | 否；Google Terms 明确禁止第三方 Antigravity OAuth |
| 公开发布 | 已作为 npm package 发布 | 当前 NO-GO |

## 16. 证据台账

### 16.1 已证实

- Google FAQ/Terms 明确禁止第三方软件使用 Antigravity 登录并说明 suspension/termination 风险。[FAQ](https://antigravity.google/docs/faq/)；[Terms](https://antigravity.google/terms)
- Google OAuth authorization/token/state/offline refresh 与 desktop loopback 原语是公开标准。[OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)；[Loopback guide](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration)
- DSH `LlmAdapter` 强制 provider attribution；ReplayEnvelope 可存 block-aligned adapter state；ContentBlock 支持 text/reasoning/image/tool-call/tool-result，但 attachment service 没有 video。
- `dsh-codex-auth` 的 package、Host/client、Search/Image、RPC、安全与 refresh 协调可作为结构基线。
- 社区固定 commit/package 为 MIT、明确自称逆向并警告违反 Google Terms。

### 16.2 社区实现可见但未获官方支持

- Antigravity OAuth client metadata/scopes/fixed callback；
- token refresh 与 userinfo；
- `loadCodeAssist` / `streamGenerateContent` / `generateContent`；
- raw HTTP/1.1 framing 与 captured User-Agent；
- model request envelope、thinking/tool signatures、usage；
- grounded search metadata；
- image-output model与 inlineData；
- `retrieveUserQuotaSummary` / `fetchAvailableModels`；
- `onboardUser` 与 fallback project（本方案默认禁用）；
- multi-account/rotation/fingerprint behavior（本方案不采用）。

### 16.3 待 POC

- copied OAuth application metadata 对目标用户账号当前是否仍有效；
- fixed loopback 在目标 OS/browser 的 IPv4/IPv6 行为；
- read-only project discovery 是否返回当前账号 project；
- private endpoint 是否接受固定 `agy` identity 之外的独立 DSH attribution carrier；
- Gemini/Claude/GPT-OSS 模型目录和 wire schema；
- reasoning/tool signature replay；
- grounded search source schema；
- image generation/edit options 与 artifact limits；
- quota schema/reset windows；
- video inlineData 是否被任何 Antigravity model 接受；
- Google Terms/endpoint 在实现周期内是否变化。

---

**修订后的最终结论**：按用户最新说明，主方案是 **`dsh-antigravity-auth` 单账号 Antigravity OAuth + 私有 Cloud Code 模拟实现**；官方 `agy` bridge 与 AI Studio/Vertex 都只保留为对照。private request 直接使用固定、已审计的 `agy` User-Agent/framing，不先尝试 DSH 默认 User-Agent；同时保留现有 `@deepseek-ai/dsh-llm` runtime 且不修改 DSH core。provider-required User-Agent 与独立 DSH attribution carrier 由插件自有 Wire Identity module 实现：调用公开 `attributionHeaders()` 获取真实 DSH identity value，再通过固定 secondary header 发送。Google 已明确禁止这种第三方接入，因此本方案只判定为 private experimental Conditional GO，公开发布 NO-GO；任何 live OAuth/private request 仍须用户另行授权。

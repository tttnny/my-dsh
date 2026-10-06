# 插件从页面消失、宿主日志无异常

两种原因都会长成这个症状，判别与做法分两节。

## 客户端半边读了未声明的服务

整条 loader entry 变 failed（宿主半边照常加载）。

这类失败没有本地信号。随手搭个假 context 让它跑起来，读未声明服务不报错，本地全绿，只在 profile 里炸。判别力全在守卫上：假 context 读到未声明服务就抛内核那条 `cannot get property "x" without inject`，守卫自身还要有反例断言（如 `guard rejects an undeclared service read`）证明它仍会抛——守卫失效时那份绿灯是假的。惯例名 `scripts/smoke-client.mjs`，并进所在包的 `check`（见 [plugins.md](./plugins.md)「验证」）；存量样本 `plugins/dsh-chat-translate/scripts/test-client-wiring.mjs`、`plugins/dsh-model-submenu/scripts/smoke-client.mjs`。

## 工具行没落成 root entry：光有工具行拿不到浏览器半边

客户端 bundle 只对 **root loader 的 enabled entry** 服务：`client-modules` 的 `processOne` 遍历 `ctx.loader.entries()`，跳过 `disabled` 与无 fiber 的行；而 preset 工具行是 `ctx.plugin` 直接挂的子树、不链到 `Entry`（`dsh-agent-preset-registry` 的 mount 注释），所以它的 `dsh.client` 永远不会被服务。profile patch 顶层的 `- insert:` 不一样：它落进 root entry 列表、本身就是 entry，工具挂在那里时浏览器半边由它自己那条行服务。症状与上面那条一样安静：宿主正常、工具可用，只是浏览器里没有这个插件画的界面，宿主日志无异常。

要让它有：包**同时**列进 profile `package.json` 的 `dsh.profile.bundles`，并在包内 `cordis.patch.yml` 插一条 bundle 行，给该行一个 config 让宿主半边在那条行下**不注册**任何东西（否则工具会以 root layer 的身份对每一个 preset 的 agent 可见；同名工具跨 layer 是 shadow，不报错）。那条 bundle 行自己就是一条 root entry——顶层 `- insert:` 会落进 root entry 列表——浏览器半边靠它被服务；工具由别处的行注册（preset 行、或 profile patch 里那条顶层 `- insert:` 行；后者本身也是 entry）。样本：`plugins/dsh-grilling-form`（`cordis.patch.yml` 的 `config.carrier` + 宿主半边的 config 门禁 + `scripts/smoke-host.mjs` 里那条「载体行什么都不注册」的断言；它的工具行挂在 profile patch 的根层 `- insert:` 里）。

插件配置页的静默失败（注册项 key 写歪、卡片没有入口、标题退回包名）在 [plugin-config-page.md](./plugin-config-page.md)「静默失败」。

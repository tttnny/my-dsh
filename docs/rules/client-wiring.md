# 插件从页面消失、宿主日志无异常

同一个症状（插件不在页面上、宿主日志无异常）有几种成因，分节给判别与做法；其中「工具行没落成 root entry」与「多源判据」两节决定浏览器半边挂在哪一行。

## 客户端半边读了未声明的服务

整条 loader entry 变 failed（宿主半边照常加载）。

这类失败没有本地信号：随手搭个假 context 让它跑起来，读未声明服务不报错，本地全绿，只在 profile 里炸。判别力全在守卫上——假 context 读到未声明服务就抛内核那条 `cannot get property "x" without inject`，守卫自身还要有反例断言（如 `guard rejects an undeclared service read`）证明它仍会抛，守卫失效时那份绿灯是假的。守卫惯例名 `scripts/smoke-client.mjs`，并进所在包的 `check`（见 [plugins.md](./plugins.md)「验证」）；存量样本 `plugins/dsh-chat-translate/scripts/test-client-wiring.mjs`、`plugins/dsh-model-submenu/scripts/smoke-client.mjs`。

## 工具行没落成 root entry

客户端 bundle 只对 **Loader 服务那棵树里的 enabled 行**服务：`dsh-client-modules` 的 `processOne` 遍历 `ctx.loader.entries()`（含挂在行上的子树），跳过 `disabled` 与没有 fiber 的行。preset 的工具行挂在独立的 `EntryTree` 里（`PresetTree extends EntryTree`，宿主 `packages/preset/agent-preset-registry/src/mount.ts`），不在这棵树中，所以它的 `dsh.client` 永远不会被服务。症状与上面那条一样安静：宿主正常、工具可用，浏览器里没有这个插件画的界面。

要让它有：包**同时**列进 profile `package.json` 的 `dsh.profile.bundles`，并在包内 `cordis.patch.yml` 有一条**根层 insert 行**——浏览器半边就是靠这一行被服务的。这一行可以顺带在宿主半边注册插件本体：`plugins/dsh-chat-translate` 是单行两用的样本，客户端 bundle 与工具注册同挂一行。

**一个包只保留一条承载浏览器半边的根层行。** 第二条同包的行不会多出一个浏览器半边，只会让宿主半边再挂一份：Loader 按 entry id 记账，id 不同的两条行是两个 entry、两次 `apply`（id 相同的塌成一条，后写的生效）；而 client-modules 按 `baseUrl + specifier` 认源，把第二条当成同一个 source 静默折叠，不报错（见「多源判据是 baseUrl 加 specifier」）。症状是宿主半边跑了两遍，注册、监听、定时器各两套。

## 裸包名那一行才带浏览器半边

`dsh-client-modules` 按「该 Loader 行解析到的最近 `package.json` 是否声明 `dsh.client`」逐行判定，`exactPackageSpecifier` 判据**拒掉子路径说明符**（`@scope/pkg/sub`）：子路径行拿不到浏览器半边，只有**裸包名那一行**承载它。路径行（`.`、`file:`、绝对路径）没有包名可判，改为向上找最近一个 `package.json`，它声明了 `dsh.client` 也承载。

### 声明了 `dsh.client` 就要有 `./client` 导出与产物

这三条都是**启动期报错**，与「页面里没有界面」不是同一个症状，别把方向找错：

- `package.json` 声明了 `dsh.client`，但 `exports` 里没有 `./client` → `client-modules: <包名> declares dsh.client but exports no "./client" bundle`。
- `exports["./client"]` 存在但不是字符串、也不是 `{ default: <字符串> }` → `client-modules: <包名> exports["./client"] must be a string or an object with a string default`。
- 导出指向的产物文件不在磁盘上 → ``client-modules: client bundle not found; run `pnpm run build` before launch``，其后另起两行给出包名与路径；多个包一起缺时聚合成一条 `client-modules: <N> client package failed to compose:`（复数时是 `packages`）。

### 多源判据是 baseUrl 加 specifier

「同一个包多源」判的是 `baseUrl + specifier`（宿主 `packages/client/modules/src/index.ts` 的 `sourceKey`），不是行数：

- **同一棵解析树里的同 specifier**：两条行算同一个 source，**静默折叠**，不报错。折叠的是浏览器半边的来源登记，两条行各自的宿主半边照常各挂一份（见「工具行没落成 root entry」末尾那条硬约束）。
- **同一 packageName、两个不同 baseUrl**：才抛 `client-modules: package <包名> resolves from multiple active Loader sources: <行与 baseUrl 列表>; remove one entry`。启动时它让整条 client-modules 激活失败；运行中到达的同一种冲突只记一条 warning，页面继续服务上一次的图，这个包的浏览器半边停在旧内容。

本仓最常见的翻车点是后一种：开发副本的 `link:` 与已装的一份同时出现在两棵解析树里（包名相同、目录不同）。判别办法是先看报错里列出的两个 `baseUrl`，再用 `node tools/dev-link.mjs` 确认开发副本只有一份、指向本仓库。

## 浏览器半边能 require 什么

浏览器半边的 `require` 只有三条来路，第四条没有：**平台种子表**（Web shell 播种的那几个单例句柄：react 家族、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives` 等，全表见宿主 `packages/client/web/src/seed.ts` 的 `getStaticModules`）、**boot graph 里的一行**（即那个包也声明了 `dsh.client`）、**已经注册好的 factory**（已物化则直接取导出）。三者都不命中就抛：

```
client-modules: require("<说明符>") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)
```

它发生在**物化时**（页面第一次加载这个插件），宿主日志里没有对应条目，症状就是「插件不在页面上」。`dsh.client.inject` 只规定 factory 的**到达顺序**，不提供模块：要用的包不在种子表里，就得让那个包也有一条 `dsh.client` 行，并把说明符写进本包的 `dsh.client.external`。宿主把这条报错写成构建期纯净度门禁在运行时的镜像（`packages/client/modules/src/client/manifest.ts` 顶部那段模型说明）：构建期挡的是没进 external 的导入，运行时挡的是真的 `require` 到了。

## 接管座位与子座位

插件可以用更低的 `priority` 顶掉座位的内置占用者（`dsh-model-submenu` 以 `priority: -100` 接管 `conversation.input.model`）。座位后来长出的**子座位**（`conversation.input.model.label`，由 `ui-model-selection` 在自己的注册项里声明）的声明归**声明它的那条注册项**，不归座位名：

- 接管方不声明 children 时，子座位仍由内置占用者的注册项声明；第三方照样能往子座位注册。
- 接管方自己再声明同一个子座位会抛「已被声明」——要接管子座位，得先让内置那条注册项退出。
- 内置占用者一卸载（插件重载），它的子座位连同别人的贡献被递归收掉。第三方依赖这个子座位时，要让**自己的注册项**声明它，或者接受重载后重新注册。

`plugins/dsh-model-submenu/scripts/smoke-client.mjs` 用真 `SlotCore` 钉住这三条：接管后第三方仍能注册，接管方重声明会抛，内置项卸载后子座位与贡献一起消失、接管项留下。

插件配置页的静默失败（注册项 key 写歪、卡片没有入口、标题退回包名）在 [plugin-config-page.md](./plugin-config-page.md)「静默失败」。

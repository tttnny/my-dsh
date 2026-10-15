# Agent preset（`presets/<preset-id>/`）

preset 范围的前门。

## 目录与包名

一个 preset 一个目录：**目录名 = preset id**（= `@deepseek-ai/dsh-agent-preset` 行的 `config.id`），npm 包名 `@lynn123411/dsh-preset-<id>`，目录内含 `README.md`（文档，不是运行内容）。随包资源（`skills/`、`plugins/` 等）留在本目录，靠包的 `exports` 或 `createRequire(baseUrl).resolve()` 解析（见「行名解析」）。

## 声明形态

preset 由**插件组合包（bundle）**声明：`package.json` 的 `dsh.bundle.patch`（string 或有序数组）指向本目录的 `<id>.patch.yml`。

- 该 patch 往 profile 树里 `- insert` 一条 `@deepseek-ai/dsh-agent-preset` 行，`config` 字段：`id`（preset id）、`name` / `description`（会话选择器上的显示名与说明）、`order`（排序，台账见下）、`plugins`（必需——preset 的全部组合行）。
- `config.plugins` 里引用的**仓库外插件**必须在本包 `dependencies` 里声明：preset 行按 `name` 从声明它的那棵树解析，包不在 profile 里那一行就 `never started`、整份 preset 带上诊断且不可选。

## 版本与依赖

- `engines.dsh` 是 preset **唯一**的版本声明位，取值规则见 [plugins.md](./plugins.md)「版本与依赖」——写大于等于当前版本的 SemVer 范围，不写精确版本。
- preset bundle 不编译、不 import 内核包，**不声明 `peerDependencies` / `peerDependenciesMeta`**：纯元数据没有用处，而 `auto-install-peers` 会把 registry 包物化下来、可能顶掉开发副本。

## 行名解析

- preset 行按**声明它那棵树**的 `baseUrl` 导入；bundle patch 的行合入 profile 的根 include，所以这个 `baseUrl` 是 **profile 目录**，不是本 preset 目录（实测 `file:///<DSH_HOME>/profiles/web/`）。相对写法（`./plugins/<file>.js`）因此必然 `never started`。
- 随包代码 / 资源要写成能解析的名字：本包的 `exports` 子路径（`name: '@lynn123411/dsh-preset-<id>/<export>'`），或在 `config` 里用 `!!js` 算绝对路径（`createRequire(baseUrl).resolve('<本包>/package.json')` + `join(dir, 'skills')`）。`!!js` 的求值作用域里 `baseUrl`、`ctx` 与 `process` 都可用。
- `createRequire(baseUrl)` 只在**本包已经装进该 profile** 时成立：裸 `node` 里从 profile 目录 `createRequire('<本包>/package.json')` 是 `MODULE_NOT_FOUND`。
- 裸包名（`@deepseek-ai/…`）走 profile 树自己的解析基准，照常用。

## 安装与启用

- `dsh plugin --profile <name> add <包名 | 本仓库目录路径>`：写进该 profile 的 `dependencies`（本地目录记 `link:`），识别到 `dsh.bundle` 就把包名追加进 `dsh.profile.bundles`。目录路径按**调用目录**解析，所以从仓库根写 `./presets/<id>` 即装本目录。
- 行消费的仓库外插件要在同一条命令里**一并点名**：`dsh.profile.bundles` 只按 profile 的**直接依赖**登记，preset 的传递依赖装得下、行也解析得到，但进不了 bundle 层——插件自带客户端半边时，缺了它卡片退回原始 JSON。`link:` 开发副本连 `dependencies` 也不物化，开发副本命令同样要点名（`dsh plugin --profile web add ./presets/<id> <它消费的仓库内插件目录>`）。
- preset 的挂载在进程内只装载一次：改 patch 或随包文件后**重启 DSH**，不会热更已挂载的那一份。
- 给人敲的逐步指令由根 `README.md` 的 preset 表与各 preset 的 `README.md` 给。

## 验证

每个 preset 都有自己的 `check`（提交闸门认得它们），三条判据：

- **组合解析**：`node tools/preset-compose.mjs <id>`（`--all` 跑全部）——在临时 DSH_HOME 上跑一次 `--dump-config`，判 exit 0、组合树里有 `preset-<id>` 行、`config.id` 与目录名一致、`order` 与 patch 一致、`config.plugins` 非空。只组合、不装载、不求值 `!!js`；临时 home 里不放 `node_modules`，不动正在服务的 profile。
- **真装载**：`node tools/host-smoke.mjs` 起一个第二实例，判本仓 bundle 全部解析到、首页 200、客户端 bundle 取得到、启动日志无装载异常。装进 profile 的命令见「安装与启用」。
- **工具目录**：以会话日志里真正发给模型的数组为准——日志是 `session.v4.jsonl.zstd`，读 `request/header` 事件的 `data.header.tools`。UI 的「工具」面板只反映装配期的定义解析，不等于该数组。

随包带**第三方内容**（vendored `skills/` 等）的 preset 另配一份 `upstream-lock.json`（钉住的 commit ＋ 逐目录树哈希）与检查脚本：离线查形态与完整性、在线查上游漂移，同步后 `--write` 重钉。范例与哈希配方见 `presets/plugin-upgrade-cordis/`，它的 `check` 就是离线那一条。

## order 台账

`config.order` 决定 preset 在会话选择器里的次序。取值只登记在这里：

| preset | order |
| --- | --- |
| （官方）standard | 1 |
| （官方）ptc | 2 |
| （官方）minimal | 3 |
| （官方）cordis | 4 |
| minimal-fs | 5 |
| plugin-upgrade-cordis | 6 |

官方四条随 `@deepseek-ai/dsh-web-app` 的 `presets/*.patch.yml` 发布；自有 preset 排在它们之后，新取值取本表已占用最大值 +1。取值以各 preset 的 `<id>.patch.yml` 为准，增删 preset 或改 `config.order` 后同步本表。

## 按分支取细则

| 这一步在做什么 | 细则 |
| --- | --- |
| 建 / 校验开发副本、问「改完多久生效」、撞 `Cannot find package` | [dev-copy.md](./dev-copy.md) |
| 工具行是 preset 子树、组件要进浏览器 | [client-wiring.md](./client-wiring.md)「工具行没落成 root entry」 |
| 用户反馈「刚发的包装不上」 | [release.md](./release.md)「用户反馈『刚发的包装不上』」 |
| `npm publish`、产物与 `files` 门禁 | [release.md](./release.md) |

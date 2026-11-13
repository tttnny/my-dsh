# `tools/`（仓库级工具）

写给 agent。仓库级工具的放置与依赖约定见根 [AGENTS.md](../AGENTS.md) 第 7 条。各脚本用 `node tools/<name>.mjs` 调用；具体环境前提见脚本头部，例如 `ui-preview.mjs` 借用插件包安装的 esbuild 与 React。

| 这一步在做什么 | 命令 |
| --- | --- |
| 找 `dsh` 二进制、在用的内核与已装清单、内核包仓、内核自带的官方 preset、DSH 源码 checkout、profile、正在跑那个实例的日志 | `node tools/dsh-env.mjs [--json] [--dsh <版本>]` |
| 改完包 / 根 README / 规则文档后查台账一致性 | `node tools/assert-ledger.mjs [--dsh <版本>] [--quiet]` |
| 仓库级检查，验证顺序见 [plugins.md](../docs/rules/plugins.md)「验证」；`--ledger-only` 跳过包级 `check`，仍查台账与产物新鲜度 | `node tools/check.mjs [--ledger-only] [--json]` |
| 铺一个新插件的骨架（宿主 + 浏览器两半边，生成即 `pnpm check` 绿；默认还会跑 `pnpm install`） | `node tools/new-plugin.mjs dsh-<name> [--title 中文名] [--tool 工具名] [--host-only] [--no-install] [--link] [--out 目录]` |
| 内核升版后把全部包的版本声明改齐；`--check` 比较在用内核与全部包声明，提交闸门的分工见 [.githooks/pre-commit](../.githooks/pre-commit) 头部 | `node tools/dsh-baseline.mjs [--write] [--bump patch] [--check] [--dsh <版本>] [--only <包名>]` |
| 两版之间改了什么：默认比已装内核的安装产物；`--from-source` 比源码 tag（旧内核没装也能用），不给新版本就比当前已装内核；`--declared` 只看本仓声明过的包，`--presets` 在包差异之后附加一节官方 preset，`--all` 连 `package.json` 的版本号变动一起列，`--all-paths` 列出 `packages/` 之外的变动，`--list` 只列这台机器装了哪些内核 | `node tools/kernel-diff.mjs <旧版本> [<新版本>] [--from-source] [--declared] [--presets] [--all] [--only <包名>]`、`node tools/kernel-diff.mjs --list` |
| 抄本与官方 preset：差异 / 两版官方差异 / 重抄 / 提示词变量 | `node tools/preset-copy.mjs <id> [--diff \| --official-diff \| --recopy \| --variables]` |
| preset 随包技能的真装载（只装载内核的 skill provider，不起第二实例） | `node tools/probes/preset-skills.mjs --preset <id>`（另有 `--skills <目录>`、`--kernel <内核树>`、`--dsh <版本>`，见脚本头部） |
| 按 CI 的方式重跑安装与 check（要联网）；适用条件见 [plugins.md](../docs/rules/plugins.md)「仓库级 check 与 CI」 | `node tools/ci-check.mjs [--keep]` |
| 发布前挑包：列出本地版本 registry 上还没有的包，并说明哪些包发不了（版本没改、缺 `publishConfig.access`）；Actions 的 `publish` 工作流第一步就是它 | `node tools/publish-plan.mjs [--packages <包名或目录>] [--json]` |
| 生成插件索引（DSH「发现」页的索引源）：从 npm registry 取本仓各包已发布的版本，连同图标写到输出目录 | `node tools/market-index.mjs [--out <目录>] [--url <索引 URL>] [--registry <registry>] [--json]` |
| 变异测试：改一处、跑一条命令、默认还原（未提交的文件也能用） | `node tools/mutate.mjs --file <f> --from <旧> --to <新> -- <命令>`（另有 `--dry-run` 只数命中、`--keep` 留下变异） |
| 宿主半边能不能装载（不重启正在服务的实例） | `node tools/host-smoke.mjs [--compose-only]` |
| preset 的组合解析（`--dump-config`） | `node tools/preset-compose.mjs <id \| --all>` |
| 「页面真的换上新产物了吗」 | `node tools/verify-client.mjs <包> --needle '<新写的类名或文案>' [--build]` |
| 看一眼界面：点一下、量几何、拍图（会改会话状态，默认拦下并报警；等不到、点不到、页面报错一律退出码 1） | `node tools/gui-shot.mjs --click '<选择器>' --shot tmp/ui.png [--allow-mutation]` |
| 直接拍某个会话的页面（会话页没有 URL 路由，它替你展开侧栏组再点进去） | `node tools/gui-shot.mjs --session session-<id> --shot tmp/session.png` |
| 不碰正在服务的实例，把**真的**插件组件单独渲染出来拍图（ui-primitives 用薄壳替身、样式取宿主真表） | `node tools/ui-preview.mjs --pkg <plugins/dsh-xxx> --entry src/client/X.jsx --mount Xxx --props tmp/p.json --shot tmp/x.png`（`--props` 收 JSON，也收 `.mjs` 模块） |
| 要在用户自己那个浏览器引擎下、或按用户已登录的站点验界面（`gui-shot` 起的是 Playwright 缓存里的 Chrome for Testing，每趟清掉临时用户目录） | 换 `ego-browser`，用法先跑 `ego-browser skill`；条件与要守的硬要求见 [plugin-ui.md](../docs/rules/plugin-ui.md)「换用 ego-browser 的条件」 |
| 查开发软链、bundle 登记与孤儿软链；默认只查开发 profile `web`（本仓库只管它），`--all-profiles` 看全部，修复范围见 [dev-copy.md](../docs/rules/dev-copy.md)「建立与校验」 | `node tools/dev-link.mjs [--all-profiles \| --profile <name>] [--write] [--package <包名或目录名>]` |
| 一个会话（连同它派出去的子会话）改过哪些文件、提交过什么 | `node tools/session-changes.mjs [<会话 id>] [--json] [--since <毫秒>]` |

## 约定

- 参数写成 `--k v`；`--json` 给机器读；退出码 `0` 通过、`1` 不通过、`2` 跑不起来。看到 `2` 先查是不是缺 `node_modules`（`check.mjs` 对缺依赖的包报 2）或参数写错，别当成「检查不通过」去改代码。
- 找引用先用 `grep -l` 取文件清单再逐文件读：`grep -rn '<包名>' --exclude-dir={node_modules,lib,tmp,archive}` 会把匹配行所在的整行打出来，而 `lib/` 的声明文件里一行注释可能就有几千字，一次输出几十 KB 只为了几条结果。
- 本地断言类检查只读本仓库与本机 DSH 的状态（`package.json`、`docs/rules/`、`$DSH_HOME`、在用内核与它自带的官方 preset、`DSH_SOURCE` 指向的源码 checkout），不联网。
  会联网的是：`publish-plan.mjs`（调用 `npm view`）、`market-index.mjs`（读 npm registry）、`pnpm install` 及其两个内置调用者（`new-plugin.mjs` 默认会在生成的包里跑它、`dsh-baseline.mjs --write` 会在改动的包里跑它）、`tools/ci-check.mjs`、`presets/plugin-upgrade-cordis/check-upstream.mjs`（在线模式）。`dev-link.mjs --write`（`pnpm add --offline`）与 `mutate.mjs` 不联网。
- 中间产物一律落仓库根的 `tmp/`（已 gitignore）：`tmp/host-smoke/`、`tmp/preset-compose/`、`tmp/preset-copy/`、`tmp/ci-check/`、`tmp/ui-preview/`、`tmp/ui.png` 这类图。`gui-shot.mjs` 的浏览器用户目录 `tmp/chrome-profile/` 每趟自己重建、跑完删掉，不留登录态。各包自检的临时家目录（`chtest-*`、`suite-*`、`reply-*`、`judge-*`）也落在这里，包目录里不新建 `tmp/`。
- **判据必须有出处**：`assert-ledger.mjs` 的每条判据都要对应规则或硬声明，改约定时同步对应的检查；判据与编号只在脚本头部列举。
- **判据必须能证明覆盖范围**：拿有上限的接口做全量判断时，上限之外的变化会被静默漏掉。compare 接口的文件清单上限是 300 个，用它判断「上游有没有变」时，`skills/` 的改动会被截在外面，报成「无需同步」。改成能证明覆盖的判据（目录 tree sha），或在上限命中时失败关闭。
- 新增或翻转断言后的验证，见 [plugins.md](../docs/rules/plugins.md)「证明断言有牙齿」；变异工具的参数与还原策略见 [mutate.mjs](./mutate.mjs) 头部。

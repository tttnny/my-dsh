# `tools/`（仓库级工具）

写给 agent。仓库根不放 `package.json`、不放依赖安装（根 `AGENTS.md` 第 7 条）：这里的每个脚本都是零依赖的 Node 程序，`node tools/<name>.mjs` 直接跑，换台机器不需要任何准备步骤。

| 这一步在做什么 | 命令 |
| --- | --- |
| 找 `dsh` 二进制、内核版本与包仓、内核自带的官方 preset、DSH 源码 checkout、profile、正在跑那个实例的日志 | `node tools/dsh-env.mjs [--json]` |
| 改完包 / 根 README / 规则文档后查台账一致性 | `node tools/assert-ledger.mjs [--dsh <版本>]` |
| 仓库级 check：台账 + 每个包自己的 `check`（CI 跑的就是它） | `node tools/check.mjs [--ledger-only] [--json]` |
| 铺一个新插件的骨架（宿主 + 浏览器两半边，生成即 `pnpm check` 绿） | `node tools/new-plugin.mjs dsh-<name> [--host-only] [--link]` |
| 内核升版后把全部包的版本声明改齐 | `node tools/dsh-baseline.mjs [--write] [--bump patch] [--check]` |
| 两版之间改了什么：默认比已装内核的安装产物，`--from-source` 比源码 tag（旧内核没装也能用），`--declared` 只看本仓声明过的包，`--presets` 只看官方 preset | `node tools/kernel-diff.mjs <旧版本> [新版本] [--from-source] [--declared] [--presets] [--only <包名>]` |
| 抄本与官方 preset：差异 / 两版官方差异 / 重抄 / 提示词变量 | `node tools/preset-copy.mjs <id> [--diff \| --official-diff \| --recopy \| --variables]` |
| preset 随包技能的真装载（只装载内核的 skill provider，不起第二实例） | `node tools/probes/preset-skills.mjs --preset <id>` |
| 按 CI 的方式重跑安装与 check（干净 HOME、钉住的 pnpm；要联网） | `node tools/ci-check.mjs [--keep]` |
| 变异测试：改一处、跑一条命令、一定还原（未提交的文件也能用） | `node tools/mutate.mjs --file <f> --from <旧> --to <新> -- <命令>` |
| 宿主半边能不能装载（不重启正在服务的实例） | `node tools/host-smoke.mjs [--compose-only]` |
| preset 的组合解析（`--dump-config`） | `node tools/preset-compose.mjs <id \| --all>` |
| 「页面真的换上新产物了吗」 | `node tools/verify-client.mjs <包> --needle '<新写的类名或文案>' [--build]` |
| 看一眼界面：点一下、量几何、拍图（会改会话状态，默认拦下并报警） | `node tools/gui-shot.mjs --click '<选择器>' --shot tmp/ui.png [--allow-mutation]` |
| 不碰正在服务的实例，把**真的**插件组件单独渲染出来拍图（ui-primitives 用薄壳替身、样式取宿主真表） | `node tools/ui-preview.mjs --pkg <plugins/dsh-xxx> --entry src/client/X.jsx --mount Xxx --props tmp/p.mjs --shot tmp/x.png` |
| 开发副本还是不是软链、客户端半边有没有登记进 bundles、有没有指向归档目录的孤儿软链（`--write` 删掉孤儿） | `node tools/dev-link.mjs [--write]` |
| 一个会话（连同它派出去的子会话）改过哪些文件、提交过什么 | `node tools/session-changes.mjs [<会话 id>] [--json] [--since <毫秒>]` |

## 约定

- 参数写成 `--k v`；`--json` 给机器读；退出码 `0` 通过、`1` 不通过、`2` 跑不起来。
- 找引用先用 `grep -l` 取文件清单再逐文件读：`grep -rn '<包名>' --exclude-dir={node_modules,lib,tmp,archive}` 会把匹配行所在的整行打出来，而 `lib/` 的声明文件里一行注释可能就有几千字，一次输出几十 KB 只为了几条结果。
- 判据只读本仓库与本机 DSH 的状态（`package.json`、`docs/rules/`、`$DSH_HOME`、已装内核与它自带的官方 preset、`DSH_SOURCE` 指向的源码 checkout），不联网。
  唯一联网的是 `presets/plugin-upgrade-cordis/check-upstream.mjs`（在线模式）、`pnpm install` 与 `tools/ci-check.mjs`。
- 中间产物一律落 `tmp/`（已 gitignore）：`tmp/host-smoke/`、`tmp/preset-compose/`、`tmp/preset-copy/`、`tmp/ci-check/`、`tmp/ui-preview/`。
- **工具与规则是一件事的两处**：`assert-ledger.mjs` 里的每条判据都在 `docs/rules/` 里有出处；改了那些约定就同步改它，不允许只改一边。
- 判据要能变红：新增或翻转断言后，把被测行为改回旧写法跑一次，确认它真的 FAIL（见 `docs/rules/plugins.md`「证明断言有牙齿」）。这条机械动作交给 `tools/mutate.mjs`：它要求 `--from` 恰好命中一处，命令跑完无论成败都还原（干净文件走 `git checkout`，未提交的文件按原文写回）。

# `tools/`（仓库级工具）

写给 agent。仓库根不放 `package.json`、不放依赖安装（根 `AGENTS.md` 第 7 条）：这里的每个脚本都是零依赖的 Node 程序，`node tools/<name>.mjs` 直接跑，换台机器不需要任何准备步骤。

| 这一步在做什么 | 命令 |
| --- | --- |
| 找 `dsh` 二进制、内核版本与包仓、内核自带的官方 preset、profile、正在跑那个实例的日志 | `node tools/dsh-env.mjs [--json]` |
| 改完包 / 根 README / 规则文档后查台账一致性 | `node tools/assert-ledger.mjs [--dsh <版本>]` |
| 仓库级 check：台账 + 每个包自己的 `check`（CI 跑的就是它） | `node tools/check.mjs [--ledger-only] [--json]` |
| 铺一个新插件的骨架（宿主 + 浏览器两半边，生成即 `pnpm check` 绿） | `node tools/new-plugin.mjs dsh-<name> [--host-only] [--link]` |
| 内核升版后把全部包的版本声明改齐 | `node tools/dsh-baseline.mjs [--write] [--bump patch] [--check]` |
| 两个已装内核之间到底改了什么（只比 `@deepseek-ai/*`） | `node tools/kernel-diff.mjs <旧版本> [新版本] [--only <包名>]` |
| minimal-fs 的真装载探针（真 cordis / ToolRuntime / SystemPrompt / dsh-tool-fs） | `node tools/probes/minimal-fs.mjs [--kernel <内核树>]` |
| 宿主半边能不能装载（不重启正在服务的实例） | `node tools/host-smoke.mjs [--compose-only]` |
| preset 的组合解析（`--dump-config`） | `node tools/preset-compose.mjs <id \| --all>` |
| 「页面真的换上新产物了吗」 | `node tools/verify-client.mjs <包> --needle '<新写的类名或文案>' [--build]` |
| 看一眼界面：点一下、量几何、拍图 | `node tools/gui-shot.mjs --click '<选择器>' --shot tmp/ui.png` |
| 开发副本还是不是软链、客户端半边有没有登记进 bundles | `node tools/dev-link.mjs [--write]` |

## 约定

- 参数写成 `--k v`；`--json` 给机器读；退出码 `0` 通过、`1` 不通过、`2` 跑不起来。
- 判据只读本仓库与本机 DSH 的状态（`package.json`、`docs/rules/`、`$DSH_HOME`、已装内核与它自带的官方 preset），不联网。
  唯一联网的是 `presets/plugin-upgrade-cordis/check-upstream.mjs`（在线模式）与 `pnpm install`。
- 中间产物一律落 `tmp/`（已 gitignore）：`tmp/host-smoke/`、`tmp/preset-compose/`。
- `tools/probes/` 放按包定形、要真实现才能跑的探针；它们被对应包的 `check` 调起，也可以单独跑。
- **工具与规则是一件事的两处**：`assert-ledger.mjs` 里的每条判据都在 `docs/rules/` 里有出处；改了那些约定就同步改它，不允许只改一边。
- 判据要能变红：新增或翻转断言后，把被测行为改回旧写法跑一次，确认它真的 FAIL（见 `docs/rules/plugins.md`「证明断言有牙齿」）。

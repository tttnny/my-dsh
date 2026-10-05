# AGENTS.md

`my-dsh` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)的插件/补丁/preset合集。

本文件是**索引**：硬约束 + 按范围的文档地图。

## 硬约束（任何时候都适用）

1. **发布听令，发完即止**：`npm publish` / `git push` 只在用户下令后执行。细则见 `docs/rules/release.md`。
2. **开发副本是仓库的软链接**：`~/.dsh/profiles/web/node_modules/@lynn123411/dsh-*` 一律 `link:` 到本仓库对应目录，仓库根不放 `node_modules`；已 link 的插件在市场 / 管理器里一律不点「安装 / 更新」。建链与校验见 `docs/rules/dev-copy.md`。
3. **客户端半边只读已声明的服务**：漏声明不会当场报错，症状是插件从页面消失、宿主日志无异常，见 `docs/rules/client-wiring.md`。
4. **状态只登记一处**：版本号归各包 `package.json`、order 台账归 `docs/rules/settings-order.md`、功能域清单归根 `README.md` 表格，或按硬约束 5 留在原地；其他文件只写规则 + 指针。
5. **文档只写现状**：只留现在这套做法与它现在为什么成立；旧路径、旧命令、旧结论在改动当场清掉，宁可删干净。
6. **读者是 agent**：给人看的只有两份 README——仓库根 `README.md`（骨架见 `docs/rules/to-readme.md`）与各包 `README.md`（形态见 `docs/rules/plugins.md`「插件 README」）；`patches/`、`presets/` 与技能同为 agent 文档。其余一切——本文件、`docs/rules/`——写给 agent：规则、判据、命令。
7. **插件验证按本仓库的脚本跑**：仓库根没有 `package.json`，脚本都在各自包目录里（入口见 `docs/rules/plugins.md`「验证」）；`dsh-plugin-authoring` 的仓库级门禁只对 DSH 官方 checkout 成立，改哪个包、跑到哪一步由改动本身决定。

## 按范围找文档

| 范围 | 文档 |
| --- | --- |
| `plugins/` 下的插件（发版、排障都从这里进） | `docs/rules/plugins.md`（前门，按分支指向同目录细则） |
| 插件配置界面放哪、key 怎么来、静默失败 | `docs/rules/plugin-config-page.md` |
| 设置页侧栏 order 取值 | `docs/rules/settings-order.md` |
| `patches/` | `docs/rules/patches.md` |
| `presets/` | `docs/rules/presets.md` |
| 根 `README.md` 的骨架与插件表 | `docs/rules/to-readme.md` |
| issue 与 wayfinder 票务 | `docs/agents/issue-tracker.md` |
| triage 角色对应的 label 字符串 | `docs/agents/triage-labels.md` |
| 探索代码库前读哪些领域文档、给概念命名 | `docs/agents/domain.md` |

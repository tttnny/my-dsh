# matt-cordis — Matt 创造模式

官方 `cordis` 组合（persona 逐字取官方，含 `tool-cordis` 动态插件工具集与官方随附 3 个 cordis 技能）＋ Matt Pocock 的 26 个技能（`skills/`）＋ grilling 投递插件。行为要点与 matt-standard 相同：grilling 轮次先以散文预告、再以 `ask_user_grilling` 表单投递作答。同进程与官方 `cordis` 混用不需要任何补丁：0.1.7-rc.2 起 Host inspect provider 由**宿主组合单点注册**（`dsh-web-app/cordis.patch.yml` 的 `cordis-inspect-providers` 行，`@deepseek-ai/dsh-tool-cordis/host`），per-preset 的 `tool-cordis` 行（本 preset 的那条）不再注册任何 provider，重复注册无从产生。

本目录是一个可安装的 **bundle 包**：`package.json` 的 `dsh.bundle.patch` 指向 `matt-cordis.patch.yml`，后者插入一条 `@deepseek-ai/dsh-agent-preset` 行，宣告 preset `matt-cordis`（`order: 13`）。该行的 `config.plugins` 取 0.1.7-rc.2 官方 `cordis` 组合逐字，只多两处 MATT 改动——工具行原位换成 grilling；`skill-filesystem.customSkillDirs` 指向本包 `skills/`。`skills/` 里的 26 个技能由那条 `!!js` 表达式在装载时从本包解析出来（`createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-cordis/package.json')`，`baseUrl` 是 profile 目录）。

## 安装与启用

1. 用 Plugin Manager 安装本目录：`action: install_bundle`，`target` 填本目录的绝对路径。它自己完成包安装与 bundle 选择，不要用 shell 手工复刻这两步。
2. 装完后 `list_bundles` 应列出本包，`list_plugins` 应看到 `preset-matt-cordis` 行已激活（激活失败会留在名册上并带诊断）。
3. 重启 DSH，在新建会话界面选择「Matt 创造模式」。

前置：grilling 适配插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md) 必须已按注册方式装进同一 profile。patch 里那条工具行消费它，缺了它该行不可解析，preset 会整体从模式选择里消失。

## 详细说明

相对官方基线的逐处改动清单、`skills/grilling/SKILL.md` 的四处本地适配、验证命令与重打流程，一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

# matt-cordis — Matt 创造模式

官方 `cordis` 组合（persona 逐字取官方，含 `tool-cordis` 动态插件工具集与官方随附 3 个 cordis 技能）＋ Matt Pocock 的 26 个技能（`skills/`）＋ grilling 投递插件。行为要点与 matt-standard 相同：grilling 轮次先以散文预告、再以 `ask_user_grilling` 表单投递作答。同进程与官方 `cordis` 混用不需要任何补丁：0.1.7-rc.2 起 Host inspect provider 由**宿主组合单点注册**（`dsh-web-app/cordis.patch.yml` 的 `cordis-inspect-providers` 行，`@deepseek-ai/dsh-tool-cordis/host`），per-preset 的 `tool-cordis` 行（本 preset 的那条）不再注册任何 provider，重复注册无从产生。

本目录是一个可安装的 **bundle 包**：`package.json` 的 `dsh.bundle.patch` 指向 `matt-cordis.patch.yml`，后者插入一条 `@deepseek-ai/dsh-agent-preset` 行，宣告 preset `matt-cordis`（`order: 13`）。该行的 `config.plugins` 取 0.1.7-rc.2 官方 `cordis` 组合逐字，只多两处 MATT 改动——工具行原位换成 grilling；`skill-filesystem.customSkillDirs` 指向本包 `skills/`。`skills/` 里的 26 个技能由那条 `!!js` 表达式在装载时从本包解析出来（`createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-cordis/package.json')`，`baseUrl` 是 profile 目录）。

## 安装与启用

```bash
# 装进 profile（npm 包名）：本包 + 它消费的 grilling 插件
dsh plugin --profile web add @lynn123411/dsh-preset-matt-cordis @lynn123411/dsh-ask-user-grilling

# 本仓库开发副本：在仓库根执行，命令把目录 link 进 profile 并登记包名
dsh plugin --profile web add ./presets/matt-cordis ./plugins/dsh-ask-user-grilling
```

装完后 `list_bundles` 应列出两个包、`list_plugins` 应看到 `preset-matt-cordis` 行已激活（激活失败会留在名册上并带诊断）。重启 DSH 后，在新建会话界面选择「Matt 创造模式」。

前置：grilling 适配插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md) 已声明为本包 `dependencies`，行因此总是可解析；但它同时是带客户端半边的 bundle，`dsh.profile.bundles` 只按 profile 的**直接依赖**登记（传递依赖进不了 bundle 层），所以安装命令要点名它——只装本包时工具照常可用，transcript 那一行退回原始 JSON。

## 详细说明

相对官方基线的逐处改动清单、`skills/grilling/SKILL.md` 的四处本地适配、验证命令与重打流程，一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

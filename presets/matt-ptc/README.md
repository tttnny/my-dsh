# matt-ptc — Matt PTC 模式（实验性）

官方 `ptc` 组合（persona 逐字取官方，模型只见 `run_code`）＋ Matt Pocock 的 26 个技能（`skills/`）＋ grilling 投递插件。行为要点：grilling 轮次经 `run_code` 程序内的 `tools.ask_user_grilling` 投递，没有原生表单交互体验；需要原生交互请改用 [matt-standard](../matt-standard/README.md)。

本目录是一个可安装的 **bundle 包**：`package.json` 的 `dsh.bundle.patch` 指向 `matt-ptc.patch.yml`，后者插入一条 `@deepseek-ai/dsh-agent-preset` 行，宣告 preset `matt-ptc`（`order: 12`）。该行的 `config.plugins` 取 0.1.7-rc.2 官方 `ptc` 组合逐字，只多两处 MATT 改动——工具行原位换成 grilling；`skill-filesystem.customSkillDirs` 指向本包 `skills/`。`skills/` 里的 26 个技能由那条 `!!js` 表达式在装载时从本包解析出来（`createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-ptc/package.json')`，`baseUrl` 是 profile 目录）。

## 安装与启用

```bash
# 装进 profile（npm 包名）：本包 + 它消费的 grilling 插件
dsh plugin --profile web add @lynn123411/dsh-preset-matt-ptc @lynn123411/dsh-ask-user-grilling

# 本仓库开发副本：在仓库根执行，命令把目录 link 进 profile 并登记包名
dsh plugin --profile web add ./presets/matt-ptc ./plugins/dsh-ask-user-grilling
```

装完后 `list_bundles` 应列出两个包、`list_plugins` 应看到 `preset-matt-ptc` 行已激活（激活失败会留在名册上并带诊断）。重启 DSH 后，在新建会话界面选择「Matt PTC 模式（实验性）」。

前置：grilling 适配插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md) 已声明为本包 `dependencies`，行因此总是可解析；但它同时是带客户端半边的 bundle，`dsh.profile.bundles` 只按 profile 的**直接依赖**登记（传递依赖进不了 bundle 层），所以安装命令要点名它——只装本包时工具照常可用，transcript 那一行退回原始 JSON。

## 详细说明

相对官方基线的逐处改动清单、`skills/grilling/SKILL.md` 的四处本地适配、验证命令与重打流程，一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

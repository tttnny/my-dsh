# matt-standard — Matt 标准工程模式

官方 `standard` 组合（persona 逐字取官方）＋ Matt Pocock 的 26 个技能（`skills/`）＋ grilling 投递插件。行为要点：grilling 轮次先以散文预告本轮问题、再以 `ask_user_grilling` 表单投递作答；达成共识后不自动进入 plan mode。

本目录是一个可安装的 **bundle 包**：`package.json` 的 `dsh.bundle.patch` 指向 `matt-standard.patch.yml`，后者插入一条 `@deepseek-ai/dsh-agent-preset` 行，宣告 preset `matt-standard`（`order: 11`）。该行的 `config.plugins` 取 0.1.7-rc.2 官方 `standard` 组合逐字，只多两处 MATT 改动——工具行原位换成 grilling；`skill-filesystem.customSkillDirs` 指向本包 `skills/`。`skills/` 里的 26 个技能由那条 `!!js` 表达式在装载时从本包解析出来（`createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-standard/package.json')`，`baseUrl` 是 profile 目录）。

## 安装与启用

```bash
# 装进 profile（npm 包名）
dsh plugin --profile web add @lynn123411/dsh-preset-matt-standard

# 本仓库开发副本：在仓库根执行，命令把目录 link 进 profile 并登记包名
dsh plugin --profile web add ./presets/matt-standard
```

装完后 `list_bundles` 应列出本包、`list_plugins` 应看到 `preset-matt-standard` 行已激活（激活失败会留在名册上并带诊断）。重启 DSH 后，在新建会话界面选择「Matt 标准工程模式」。

前置：grilling 适配插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md) 必须已按注册方式装进同一 profile。patch 里那条工具行消费它，缺了它该行不可解析，preset 会整体从模式选择里消失。

## 详细说明

相对官方基线的逐处改动清单、`skills/grilling/SKILL.md` 的四处本地适配、验证命令与重打流程，一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

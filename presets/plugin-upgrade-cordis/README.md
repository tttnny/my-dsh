# plugin-upgrade-cordis — 插件升级创造模式

> 官方**创造模式**（preset id `cordis`）逐字保留——同样的 persona、同样的工具矩阵、同样的计划 / 压缩 / 子代理编排与动态插件工具 `tool-cordis`——另并入 [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill) 的 **11 个插件工程技能**（随包 `skills/`）。会话选择器里的显示名是**插件升级创造模式**。

## 功能

- **插件升级与版本迁移**：`plugin-upgrade` 做只读检查、已装插件升级与宿主版本兼容迁移；`dsh-upgrade-audit` 审计两个 DSH 版本之间的外部兼容与回滚，产出 UPGRADE-ADAPTATION 报告。
- **写插件**：`plugin-write` 讲仓库模式与扩展形态的选择、命名校验与版本适配。
- **给插件补测试**：`plugin-test` 为插件变更选最小充分测试层级，含版本迁移的七触点测试流程。
- **打包发布**：`plugin-release` 覆盖发布轨选择、未发布 cohort 安装、CI 门禁与回滚。
- **排查运行时故障**：`plugin-runtime-debug` 依宿主源码契约排查 Web 插件运行时故障（粘贴、附件、输入机、版本 chip）。
- **整队巡检**：`plugin-fleet-sweep` 在宿主升级后逐插件判定与修复，跑发布循环。
- **接重依赖**：`plugin-heavy-dep` 给轻量 Web 插件接重依赖，含懒加载 chunk、宿主路由包含防护与 SVG 白名单。
- **跨阶段编排**：`plugin-workflow` 用能力菜单与阶段账本编排插件生命周期，一次授权贯穿。
- **把经验做成考题**：`dsh-benchmark-case` 把真实升级经验提取成可自动判分的 Harbor 考题；`generic-migration` 给 benchmark 侧做框架无关的迁移方法论对照。
- **官方技能照旧在列**：官方随附的 4 个技能（`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）与这 11 个同时在列。

## 特性

- **官方创造模式逐字保留**：persona、工具矩阵、计划 / 压缩 / 子代理编排与动态插件工具 `tool-cordis` 与官方 `cordis` 一致。
- **技能目录只多一个根**：`skill-filesystem` 那一行只改 `customSkillDirs`，在官方那条之前插入本包的技能根，其余字段一字未动；数组顺序即优先级。
- **技能正文逐字复制、不做本地改写**：要改内容就改上游，再按 [UPSTREAM.md](./UPSTREAM.md) 重新同步，否则下次同步会把本地改动冲掉。
- **随包完整性有锁**：`upstream-lock.json` 钉住上游 commit 与 11 个技能的目录树哈希，`check-upstream.mjs` 离线查完整性与形态、在线查上游漂移。
- **抄本基线随 DSH 走**：patch 抄自运行中的 DSH 版本，官方每版都可能改它；升级 DSH 后要按新版官方文件重抄一遍（见 [DETAILS.md](./DETAILS.md)「已知边界」）。
- **形态与声明**：bundle 型 preset 包，`config.order` 为 6；声明形态、技能清单、版本卡覆盖、安装与验证见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-preset-plugin-upgrade-cordis
```

装完直接在新建会话界面选择「插件升级创造模式」，不必重启。开发副本把包名换成仓库内路径（在仓库根执行）：`dsh plugin --profile web add ./presets/plugin-upgrade-cordis`。

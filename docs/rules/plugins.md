# 插件（`plugins/dsh-<name>/`）

这一份是插件范围的前门：形态约定每条分支都要用，细则按分支往下指。

## 目录与包名

一个插件一个目录：目录名 `dsh-<name>`，npm 包名 `@lynn123411/dsh-<name>`，目录内含 `README.md`。发布形态两种：**bundle 型**带 `cordis.patch.yml`（进 profile `dsh.profile.bundles` 的自装行），纯预设条目、无需自己列进 bundles 的是**非 bundle**——两者在根 `README.md` 的「说明」列各有标注。

## 许可

许可只由各包 `package.json` 的 `license` 字段声明，仓库各层目录与发布清单都不附带许可文书。根 `README.md`「许可证」段的措辞随本条（版式见 [to-readme.md](./to-readme.md)）。

## 插件 README

三段式（现行范例 `plugins/dsh-model-submenu/README.md`；`archive/plugins/dsh-workspace-tree/README.md` 是归档前留下的同一形态）：一级标题 `# @lynn123411/dsh-<name>` 下接一段功能简介；`## 特性` 用 `- **特性名**：特性说明` 列表；`## 安装` 给一键指令代码块 `dsh plugin --profile web add @lynn123411/dsh-<name>`。

全篇只写**现状**：每条特性都是当前行为，不写版本号与变更叙事；上游来源归结根 `README.md` 表格（见 [to-readme.md](./to-readme.md)）。

## 版本与依赖

- `engines.dsh` 写**大于等于当前版本**的 SemVer 范围（`>=` + 当前 DSH 版本），不写精确版本；当前版本以运行中的 DSH 为准，本文件不复述具体号。
- 所有 `@deepseek-ai/dsh-*` 的 `peerDependencies` / `devDependencies` 与 `engines.dsh` 写**同一个**范围字符串（自检脚本比对的是字符串，不同步即失败）；lock 里 importers 段的 specifier 随 `pnpm install --lockfile-only` 同步。
- `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 是独立基线，照各自现值声明，不参与上面这条。
- 兄弟 preset 的同一规则见 [presets.md](./presets.md)「版本与依赖」。

## 配置界面

插件的配置界面住在宿主「插件」页，**不占设置页**：注册进 `plugins.bundle.config`，key 就是包名，配置直接铺在该 bundle 详情页上，页面自己画标题与图标。形态、key 约定、注册写法与静默失败改读 [plugin-config-page.md](./plugin-config-page.md)。设置页侧栏 order 台账（`settings.section`）仍留在 [settings-order.md](./settings-order.md)，本仓自有插件已不占任何一行。

## 验证

改完在**所在包目录**跑 `pnpm check`：各包自己拼的构建 / 类型 / 测试 / 产物门禁链。仓库根没有 `package.json`，也没有仓库级脚本；漏了 `check` 的包以它自己 `scripts` 里的那几条为准。

## 按分支取细则

| 这一步在做什么 | 细则 |
| --- | --- |
| 建 / 校验开发副本、问「改完多久生效」、撞 `Cannot find package` | [dev-copy.md](./dev-copy.md) |
| `npm publish`、产物与 `files` 门禁、插件退役归档 | [release.md](./release.md) |
| 查已发布版本、`npm view` 像卡住 | [release.md](./release.md)「查已发布版本」 |
| 插件从页面消失、宿主日志无异常 | [client-wiring.md](./client-wiring.md) |
| 插件配置页放哪、key 怎么拼、卡片没有入口 / 标题退回包名 | [plugin-config-page.md](./plugin-config-page.md) |
| 工具由 preset 行注册、组件要进浏览器 | [client-wiring.md](./client-wiring.md)「preset 行消费的插件」 |
| 用户反馈「刚发的包装不上」 | [release.md](./release.md)「用户反馈『刚发的包装不上』」 |
| 自建 LLM 适配器的 usage 映射 | [llm-adapter.md](./llm-adapter.md) |

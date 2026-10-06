# 插件（`plugins/dsh-<name>/`）

插件范围的前门。

## 目录与包名

一个插件一个目录：目录名 `dsh-<name>`，npm 包名 `@lynn123411/dsh-<name>`，目录内含 `README.md`。发布形态是 **bundle 包**：`package.json` 声明 `dsh.bundle.patch`，安装时包名自动登记进 profile 的 `dsh.profile.bundles`；形态标在根 `README.md` 的「说明」列。

## 许可

许可只由各包 `package.json` 的 `license` 字段声明，仓库各层目录与发布清单都不附带许可文书。根 `README.md`「许可证」段的措辞随本条（版式见 [to-readme.md](./to-readme.md)）。

## 插件 README

固定三段（范例 `plugins/dsh-model-submenu/README.md`）：一级标题 `# @lynn123411/dsh-<name>` + 一段功能简介；`## 特性` 用 `- **特性名**：特性说明` 列表；`## 安装` 给 `dsh plugin --profile web add @lynn123411/dsh-<name>` 代码块。需要时可在其间加节（如 `dsh-grilling-form` 的 `## 自检`）。

只写现状：每条特性都是当前行为，不写版本号、变更叙事、上游来源（形态标在根 `README.md` 表格）。

## 版本与依赖

- `engines.dsh` 写**大于等于当前版本**的 SemVer 范围（`>=` + 当前 DSH 版本），不写精确版本；当前版本以运行中的 DSH 为准，本文件不复述具体号。
- 所有 `@deepseek-ai/dsh-*` 的 `peerDependencies` / `devDependencies` 与 `engines.dsh` 写**同一个**范围字符串；改完跑 `pnpm install --lockfile-only` 同步 lock 的 importers 段。
- `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 是独立基线，照各自现值声明，不参与上面这条。
- 兄弟 preset 的同一规则见 [presets.md](./presets.md)「版本与依赖」。

## 配置界面

插件的配置界面住在宿主「插件」页，**不占设置页**：注册进 `plugins.bundle.config`。形态、key 约定、注册写法与静默失败见 [plugin-config-page.md](./plugin-config-page.md)。

## 验证

改完在**所在包目录**跑 `pnpm check`：各包自己拼的构建 / 类型 / 测试 / 产物门禁链。仓库根没有 `package.json`，也没有仓库级脚本；漏了 `check` 的包以它自己 `scripts` 里的那几条为准。

## 按分支取细则

| 这一步在做什么 | 细则 |
| --- | --- |
| 建 / 校验开发副本、问「改完多久生效」、撞 `Cannot find package` | [dev-copy.md](./dev-copy.md) |
| `npm publish`、产物与 `files` 门禁、插件退役归档 | [release.md](./release.md) |
| 查已发布版本、`npm view` 像卡住 | [release.md](./release.md)「查已发布版本」 |
| 用户反馈「刚发的包装不上」 | [release.md](./release.md)「用户反馈『刚发的包装不上』」 |
| 插件从页面消失、宿主日志无异常、组件要进浏览器 | [client-wiring.md](./client-wiring.md) |
| 配置页放哪、key 怎么拼、卡片没有入口 / 标题退回包名 | [plugin-config-page.md](./plugin-config-page.md) |
| 自建 LLM 适配器的 usage 映射 | [llm-adapter.md](./llm-adapter.md) |

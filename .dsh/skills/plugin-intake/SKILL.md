---
name: plugin-intake
description: 吸收第三方 DSH 插件：只拿源码与看守行为的测试，上游文档、营销素材、CI 与许可文书一律不要，交付文件与 README 自己重写一份。
disable-model-invocation: true
---

# Plugin intake

**拿**：`src/`、看守行为的 `tests/`。

**不拿**：`docs/`、`research/`、`CHANGELOG` 等沿革、`.github/` 与编辑器配置、社区模板、营销素材及其生成脚本、多语言 README、一切 `LICENSE`（本库不放任何许可文书，许可只由各包 `package.json` 的 `license` 字段声明）。

**自己写**：交付文件（`package.json`、`cordis.patch.yml`、`tsconfig*`、构建脚本）不继承上游那份，按 [`docs/rules/plugins.md`](../../../docs/rules/plugins.md) 的规范从零写；README 重写一份，只写当下行为，不出现上游仓库名、owner、来源版本与分叉叙事。

每个顶层条目都要能回答「谁在用 / 为什么留」，答不上来就删。

## 三条不可跳

1. **删之前按 basename 锚定引用**：`grep -rlF "<basename>" .`。代码常把路径拆段拼（`path.join(ROOT, 'research', 'x.md')`），只查带斜杠的整路径必漏。删完反向重跑同一条 grep，并清掉注释与提示文字里指向已删文件的旧路径。
2. **上游 tests 进门就分两类**：看守**行为**的留（暂时红就修那半条断言，别整条删）；看守**原仓库流程**的整条删——断言 `CHANGELOG` / `.github` 模板 / `docs/releases/` 的发布门禁，连同配套向导、向导库与独占它们的测试。
3. **动手之前先测基线**：跑一次该插件自检、把失败数记进提交说明；删完重跑，**失败数不变才算没删坏**。基线在真实工作树测，别在 `git worktree` 里测——未跟踪的产物与环境不齐会造出假红。

收尾按 `docs/rules/plugins.md`：身份重写、`link:` 开发副本、内核 peer `--check`、README 与 order 台账、`files` 与产物门禁。存量插件不专门回头扫，改到哪个按同一标准处理哪个。

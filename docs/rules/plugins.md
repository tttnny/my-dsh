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

### 证明断言有牙齿（变异测试）

新增或翻转断言后，把被测行为**改回旧写法**再跑一次，确认那条断言真的 FAIL。默认写的断言很容易恒为真，绿灯不等于守着东西。

两条会让变异测试骗到自己的坑，都是本仓库实测过的：

- **先确认断言脚本打的是 `src/` 还是构建产物**：`dsh-a6api` 的 `scripts/test-*.mjs` 一律 `import('../lib/index.js')`（`smoke-client.mjs` 读 `lib/client.js`），改完 `src/` 必须先 `pnpm build` 再跑，否则测的还是旧产物——变异后忘了重建，会得到一条假的「断言没抓住」。`dsh-grilling-form` 用 `pnpm test` 自己先构建一次来消除这个前提；`dsh-chat-translate` 有一半脚本直接打 `src/`。照抄邻居前先看它 `import` 的是哪一边。
- **还原用 `git checkout -- <file>`，别手工备份**：`cp src/x.ts /tmp/x.bak` 这类备份失败是静默的（`||` 兜底只在前一条命令失败时才生效，而它常常成功了），变异会留在源码里而你以为已经还原。要么在改动前 `git stash`，要么直接 `git checkout -- <file>`——后者失败会报错，不会静默。
- **探针的锚点要唯一**：往源码里塞临时探针时，别拿 `str.replace(x, y, 1)` 打在「文件里第一个 `  return (`」这类到处都有的形状上——它会插进另一个函数，报出来的还是 `Invalid hook call` 这种看不懂的错。锚点带上上下文，或改用 `git apply` 的补丁。
- **收尾核对 `git status --short`**：除你本来要改的文件外不该有别的。变异留下的痕迹、顺手做的别的改动、被打乱的工作区（比如多余的 `git stash`），只有在这里才看得见——变异测试的完成判据就是这一行干净。

### 提交闸门（`.githooks/pre-commit`）

「改完跑 check」有闸门兜着，不靠自觉：仓库根的 `.githooks/pre-commit` **只看本次改动的包**，逐个在包目录跑它自己的 `check`。装法与跳法写在该文件头部（`git config core.hooksPath .githooks`；`SKIP_CHECK=1 git commit` 跳过一次）。没有 `check` 脚本、或没装 `node_modules` 的包会明说并跳过——不让提交在静默里少跑一道闸门。

**成功只打一行、失败才回放输出**（`pre-commit: $pkg -> pnpm check` 之后直接是 `pre-commit: 通过（<包名>）`）：那段两百多行的 `ok` 清单对调用方（尤其 agent）是纯噪声，而钩子的输出压在调用方那一侧。要看全量转录就自己 `cd <包>` 跑一次。

闸门是这仓库唯一的自动门禁（没有 CI），所以它自己坏了代价最大，改完必须验收一次：走一次**真实提交**，成功路径打出 `pre-commit: 通过（<包名>）`；再确认它真的装着——`git config --get core.hooksPath` 应回 `.githooks`（这条配置不进版本库，新克隆默认没有闸门）。`SKIP_CHECK=1` 只在确实跑不了时用；「检查全过的提交反而被钩子拦住」是钩子自己的 bug，去修钩子。

### 类型检查

包带不带 `typecheck` 由它自己决定，带上就进 `check`。**带 `build` + `src/` 的包默认带上**：源码在那里被构建，类型信息可查；`tsc` 在包的 `devDependencies` 里。**判断依据是源码形态，不是包的新旧**——拿新旧当判据是错的（`dsh-model-submenu` 就是后补上的老包）。脚本具体怎么写由各包自己定：单份源码是一句 `tsc -p tsconfig.json --noEmit`，两半边各一份配置就分两条 `tsc`，差别只在 `--pretty false` 这类开关。

两类例外，各自成立的理由不同：

- **手写源码形态**（`lib/` 直接发、没有 `build`、没有 `src/`，如 `dsh-web-auth-url`）：不补。为一件百来行的事拉进 `typescript` 与其类型依赖不划算，类型闸门该由它的 `smoke-host.mjs` 这类自检承担。
- **纯 JS 不等于不需要闸门**：`allowJs: true` + `checkJs: true` 后 `tsc` 照样看实现（只读 `.d.ts` 不看 `.js` 是没开这两项的结果）。纯 JS 包接进来时冒的错基本是**类型信息缺口**（JSDoc 没铺满、`isRecord` 这类判定函数没写成类型谓词），不是代码的错；`plugins/dsh-grilling-form` 是这类样本。

首次接入的债要**先量清再消**：跑出完整清单、按错因分类贴回该包的票，再决定消哪些、哪些用写明理由的 `@ts-expect-error` 收口；不要在没看过清单的情况下直接接进 `check`，那会让 `check` 立刻变红。范围默认只放 `src`（含 `allowJs` 下的 `.js`/`.jsx`）；`scripts/*.mjs` 纳不纳入是各自包的单独立项。

## 按分支取细则

| 这一步在做什么 | 细则 |
| --- | --- |
| 建 / 校验开发副本、问「改完多久生效」、撞 `Cannot find package` | [dev-copy.md](./dev-copy.md) |
| `npm publish`、产物与 `files` 门禁、插件退役归档 | [release.md](./release.md) |
| 查已发布版本、`npm view` 像卡住 | [release.md](./release.md)「查已发布版本」 |
| 用户反馈「刚发的包装不上」 | [release.md](./release.md)「用户反馈『刚发的包装不上』」 |
| 插件从页面消失、宿主日志无异常、组件要进浏览器 | [client-wiring.md](./client-wiring.md) |
| 配置页放哪、key 怎么拼、卡片没有入口 / 标题退回包名 | [plugin-config-page.md](./plugin-config-page.md) |
| 改插件的界面、挑宿主现成控件、要肉眼确认 | [plugin-ui.md](./plugin-ui.md) |
| 自建 LLM 适配器的 usage 映射 | [llm-adapter.md](./llm-adapter.md) |

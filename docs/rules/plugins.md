# 插件（`plugins/dsh-<name>/`）

插件范围的前门。

## 目录与包名

一个插件一个目录：目录名 `dsh-<name>`，npm 包名 `@lynn123411/dsh-<name>`，目录内含 `README.md`。发布形态是 **bundle 包**：`package.json` 声明 `dsh.bundle.patch`，安装时包名自动登记进 profile 的 `dsh.profile.bundles`；形态标在根 `README.md` 的「说明」列。

新建插件用 `node tools/new-plugin.mjs dsh-<name>`（`--host-only` 只铺宿主半边）：它按当前内核基线生成 package.json、tsconfig、build.mjs、`cordis.patch.yml`、两半边的自检骨架、README（三节：`## 功能` / `## 特性` / `## 安装`）、locale 与图标，生成即 `pnpm check` 绿；收尾只有两步（根 README 加一行、改 `src/` 里的 TODO），它会把这两步打出来。

## 许可

各包自己的许可由 `package.json` 的 `license` 字段声明，仓库根与各包目录顶层不另附许可文书；vendored 内容保留其随附许可。根 `README.md`「许可证」段的措辞随本条（版式见 [to-readme.md](./to-readme.md)）。

## 插件 README

正文固定三节（范例 `plugins/dsh-model-submenu/README.md`），顺序与名称都不改：一级标题 `# @lynn123411/dsh-<name>` 下面先用一段话概括这个插件是什么，然后依次是 `## 功能`——用 `- **功能名**：说明` 列表，只写用户能做什么；`## 特性`——用同一种列表，写实现形态、分工边界与硬保证；`## 安装`——给 `dsh plugin --profile web add @lynn123411/dsh-<name>` 代码块。这三节之外**不再加节**：装配形态、配置说明、开发副本、验证清单这类长篇内容放同目录的 `DETAILS.md`，README 里留一句指针（npm 的 `files` 要带上它）。

只写现状：每条都是当前行为，不写版本号、变更叙事、上游来源（形态标在根 `README.md` 表格）。要写验证记录（实测日期、对照实验）就写进 `DETAILS.md`，README 只留验证怎么做、结果在哪。

## 版本与依赖

- `engines.dsh` 写**大于等于当前版本**的 SemVer 范围（`>=` + 当前 DSH 版本），不写精确版本；当前版本以运行中的 DSH 为准，本文件不复述具体号。
- 所有 `@deepseek-ai/dsh-*` 的 `peerDependencies` / `devDependencies` 与 `engines.dsh` 写**同一个**范围字符串；改完跑 `pnpm install --lockfile-only` 同步 lock 的 importers 段。
- `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 是独立基线，照各自现值声明，不参与上面这条。
- **内核升版后的批量跟随**：`node tools/dsh-baseline.mjs --write` 一次改齐全部包的上面三处（目标值从运行中内核读，没有运行实例时取最近启动的实例；有依赖声明的包改完跑 `pnpm install`，没有依赖的包跳过安装并删掉空 lock）；`--bump patch` 顺带升版本号。哪一处漂了由 `node tools/assert-ledger.mjs` 抓，落盘前可以先跑一次 `dsh-baseline.mjs --check` 看齐没齐。
- **手工写死的内核版本也要跟**：包内自检脚本的断言与注释、`README.md` 等文档、patch 中写到的内核版本，必须与本包 `engines.dsh` 中 `>=` 后的版本号一致。历史实测记录写进 `DETAILS.md`，`skills/`、`upstream/` 的 vendored 内容保留原文。
- **字面量检查范围**：`assert-ledger.mjs` 判据 10 扫描包目录内的 `.md`、`.yml` / `.yaml` 与 `.mjs` / `.js` / `.ts` / `.tsx` / `.jsx`。脚本只查同一行含「内核 / dsh / engines」语境词的版本号，文档与 YAML 直接扫描；以 `DETAILS` 开头的文件及 `skills/`、`upstream/`、`lib/`、`dist/`、`tmp/` 等目录跳过。完整范围与匹配规则见[判据实现](../../tools/assert-ledger.mjs)。
- 兄弟 preset 的同一规则见 [presets.md](./presets.md)「版本与依赖」。
- **一次完整跟随**（先看宿主变动、再 preset、再 plugins、最后按 CI 重跑）见 [kernel-upgrade.md](./kernel-upgrade.md)；这一节只写声明怎么改。

## 配置界面

插件的配置界面住在宿主「插件」页，**不占设置页**：注册进 `plugins.bundle.config`。形态、key 约定、注册写法与静默失败见 [plugin-config-page.md](./plugin-config-page.md)。

## 验证

改完在**所在包目录**跑 `pnpm check`：各包自己拼的构建 / 类型 / 测试 / 产物门禁链。漏了 `check` 的包以它自己 `scripts` 里的那几条为准。新克隆的仓库先在该包目录 `pnpm install`（仓库根从不装依赖）：缺 `node_modules` 时 `check.mjs` 回退出码 2，那是「没跑起来」，不是「检查不通过」。发布时是否重建产物，见 [release.md](./release.md)「产物与清单」的 `prepack` 规则。

**内核基线**由 `node tools/dsh-baseline.mjs --check` 比较在用内核与全部包声明，是提交闸门的第 0 道检查；它与台账的分工、读不到内核时的处理见 [.githooks/pre-commit](../../.githooks/pre-commit) 头部。

跨文件一致性由 `node tools/assert-ledger.mjs` 检查，判据与编号见[脚本头部](../../tools/assert-ledger.mjs)。改工具 schema 时，同步 `README.md` / `DETAILS.md` 中写死的字段数与描述条数；数字以实际注册的工具定义为准。

**仓库级一次跑齐**：`node tools/check.mjs` 跑「台账 + 每个包自己的 `check` + 产物新鲜度（`assert-artifacts`，放在最后）」，CI（[.github/workflows/check.yml](../../.github/workflows/check.yml)）跑的就是它。它不替你在包的目录里 `pnpm install`——缺依赖会明说并回退出码 2，别把「没跑」当成「通过」。

### 证明断言有牙齿（变异测试）

新增或翻转断言后，把被测行为**改回旧写法**再跑一次，确认那条断言真的 FAIL。默认写的断言很容易恒为真，绿灯不等于守着东西。

几条会让变异测试骗到自己的坑，都是本仓库实测过的：

- **先确认断言脚本打的是 `src/` 还是构建产物**：`dsh-chat-translate` 的 `scripts/test-client-wiring.mjs` 与 `scripts/test-render.mjs`（后者经 `tools/lib/dom-harness.mjs`）读 `lib/client.js`，改完 `src/` 必须先 `pnpm build` 再跑，否则测的还是旧产物——变异后忘了重建，会得到一条假的「断言没抓住」。`dsh-grilling-form` 用 `pnpm test` 自己先构建一次来消除这个前提；`dsh-chat-translate` 的其余脚本与 `dsh-subagent-judge-dispatch` 的决策测试直接打 `src/`。照抄邻居前先看它 `import` 的是哪一边。
  `node tools/assert-artifacts.mjs` 比较 `src/` 与 `lib/` 各自最新文件的修改时间，源码较新或 `lib/` 为空时以退出码 1 报错；任一目录不存在，或 `lib/` 含被 git 跟踪的文件时跳过。这是时间粗检，不能替代 `build`、逐文件镜像核对与发布清单检查（见 [release.md](./release.md)「产物与清单」）。它在提交闸门与仓库级 `check` 中放在包检查之后。**只跑单个读产物的脚本**时不经过这道检查，改完 `src/` 后先在包目录 `pnpm build`。
- **使用变异工具**：`node tools/mutate.mjs` 要求 `--from` 恰好命中一处，默认还原并核对内容；未提交与未跟踪的文件也能使用。参数与还原策略见[脚本头部](../../tools/mutate.mjs)。
- **探针的锚点要唯一**：往源码里塞临时探针时，别拿 `str.replace(x, y, 1)` 打在「文件里第一个 `  return (`」这类到处都有的形状上——它会插进另一个函数，报出来的还是 `Invalid hook call` 这种看不懂的错。锚点带上上下文，或改用 `git apply` 的补丁。
- **收尾核对 `git status --short`**：与变异前的工作区状态比较，确认没有留下变异或引入任务外改动，原有未提交内容仍在。多数包的 `pnpm check` 会重写已被 `.gitignore` 忽略的 `lib/`，这些构建产物不进 `git status`。

### 提交闸门（`.githooks/pre-commit`）

提交闸门的检查顺序、触发路径、缺 `check` 脚本时的处理、安装与跳过方法，以 [.githooks/pre-commit](../../.githooks/pre-commit) 头部为准。

闸门自己坏了代价最大，改完必须验收一次：走一次**真实提交**，成功路径打出 `pre-commit: 通过（<包名>）`；再确认它真的装着——`git config --get core.hooksPath` 应回 `.githooks`（这条配置不进版本库，新克隆默认没有闸门）。`SKIP_CHECK=1` 只在确实跑不了时用；「检查全过的提交反而被钩子拦住」是钩子自己的 bug，去修钩子。

### 仓库级 check 与 CI（`tools/check.mjs`、`.github/workflows/check.yml`、`.github/workflows/ledger.yml`）

CI 的 `check` 工作流在每个有依赖的包目录 `pnpm install --frozen-lockfile` 之后，跑上面的仓库级检查。它只在改动落到 `plugins/`、`presets/`、`tools/`、`.githooks/` 或工作流本身时跑；纯文档改动由 `ledger.yml` 跑 `node tools/check.mjs --ledger-only`：跳过包级 `check`，仍执行台账与产物新鲜度检查，不装依赖。

三件事它做不到，别把它读成「全绿就没问题」：它不装依赖（缺 node_modules 报退出码 2）；`tools/host-smoke.mjs` 这类要真内核的检查只在装了 DSH 的机器上有意义，CI 上跑不了——真装载仍要本机验收；`assert-ledger.mjs` 的判据 9（开发副本是不是软链）与判据 11（preset 抄本与运行中内核比对）都读本机的 `$DSH_HOME` 与内核，没装就跳过且退出码仍为 0，这两条不能靠 CI 兜底。

**每个包的 `pnpm-workspace.yaml` 是安装契约的一部分，别当本机偏好**。pnpm 11 起有两条默认安全策略，干净环境（CI 就是这样）一定生效：拒绝安装发布不满 24 小时的包，并拒绝执行未登记的依赖构建脚本。本仓库刻意跟随内核的 alpha 版本线——升版当天就要装——所以这两条一定撞上，表现是 CI 的 `install` 一步红、而本机全绿。两处各治一半，缺一不可：

```yaml
minimumReleaseAgeExclude:
  - "@deepseek-ai/*"
allowBuilds:
  esbuild: true
```

前半条按包名放行内核版本线（写成别的 scope 不生效）；后半条给构建链（`esbuild`，有 `lightningcss` / `tsdown` 的包照加）放行构建脚本。`packageManager` 一并写进 `package.json` 钉住 pnpm 版本，否则 corepack 会在没钉的包里解析到另一个版本，同一份策略又要重踩一遍。`tools/new-plugin.mjs` 生成的骨架已带这两处。适用范围按包的依赖声明判定：有依赖的包必须有这份文件；没有声明 `esbuild` 的包不写 `allowBuilds`（`dsh-web-auth-url` 就只有前一条）；零依赖的包不建这份文件（`dsh-baseline.mjs` 对它们连 `pnpm install` 都跳过）。

**本机绿不等于 CI 绿**：pnpm 的用户级配置（macOS 上是 `~/Library/Preferences/pnpm/config.yaml`）若把 `minimumReleaseAge` 设成 0、或开了 `dangerouslyAllowAllBuilds`，本机就绕过了这两条策略，复现 CI 必须换一份干净 home：

```bash
HOME=./tmp/ci-home COREPACK_HOME=./tmp/ci-home/corepack corepack pnpm install --frozen-lockfile
```

整段流程（干净 HOME、corepack 钉版本、逐包 install、仓库级 check）由 `node tools/ci-check.mjs` 一次跑完，它要联网。日常不用跑——`check` 与 `publish` 两个工作流在干净 runner 上跑的就是这一套；只在 CI 红了要本机复现、或改动动了安装契约（依赖声明、lock、`pnpm-workspace.yaml` 的放行项、`packageManager`）时才用它。这条安装约定由 `assert-ledger.mjs` 判据 12 守着：任何包缺 `packageManager`，或有依赖的包缺 `pnpm-workspace.yaml` 的放行项，提交时就会红。

### 类型检查

包带不带 `typecheck` 由它自己决定，带上就进 `check`。**带 `build` + `src/` 的包默认带上**：源码在那里被构建，类型信息可查；`tsc` 在包的 `devDependencies` 里。脚本具体怎么写由各包自己定：单份源码是一句 `tsc -p tsconfig.json --noEmit`，两半边各一份配置就分两条 `tsc`，差别只在 `--pretty false` 这类开关。

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
| 建新插件骨架、内核基线跟进、宿主半边冒烟、台账、找 `dsh` 二进制 | `tools/README.md` |

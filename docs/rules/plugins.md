# 插件（`plugins/dsh-<name>/`）

插件范围的前门。

## 目录与包名

一个插件一个目录：目录名 `dsh-<name>`，npm 包名 `@lynn123411/dsh-<name>`，目录内含 `README.md`。发布形态是 **bundle 包**：`package.json` 声明 `dsh.bundle.patch`，安装时包名自动登记进 profile 的 `dsh.profile.bundles`；形态标在根 `README.md` 的「说明」列。

新建插件用 `node tools/new-plugin.mjs dsh-<name>`（`--host-only` 只铺宿主半边）：它按当前内核基线生成 package.json、tsconfig、build.mjs、`cordis.patch.yml`、两半边的自检骨架、README 四段、locale 与图标，生成即 `pnpm check` 绿；收尾只有两步（根 README 加一行、改 `src/` 里的 TODO），它会把这两步打出来。

## 许可

许可只由各包 `package.json` 的 `license` 字段声明，仓库各层目录与发布清单都不附带许可文书。根 `README.md`「许可证」段的措辞随本条（版式见 [to-readme.md](./to-readme.md)）。

## 插件 README

固定四段（范例 `plugins/dsh-model-submenu/README.md`）：一级标题 `# @lynn123411/dsh-<name>` + 一段话概括这个插件是什么；`## 功能` 用 `- **功能名**：说明` 列表，只写用户能做什么；`## 特性` 用同一种列表，写实现形态、分工边界与硬保证；`## 安装` 给 `dsh plugin --profile web add @lynn123411/dsh-<name>` 代码块。四段之外**不加节**：装配形态、配置说明、开发副本、验证清单这类长篇内容放同目录的 `DETAILS.md`，README 里留一句指针（npm 的 `files` 要带上它）。

只写现状：每条都是当前行为，不写版本号、变更叙事、上游来源（形态标在根 `README.md` 表格）。要写验证记录（实测日期、对照实验）就写进 `DETAILS.md`，README 只留验证怎么做、结果在哪。

## 版本与依赖

- `engines.dsh` 写**大于等于当前版本**的 SemVer 范围（`>=` + 当前 DSH 版本），不写精确版本；当前版本以运行中的 DSH 为准，本文件不复述具体号。
- 所有 `@deepseek-ai/dsh-*` 的 `peerDependencies` / `devDependencies` 与 `engines.dsh` 写**同一个**范围字符串；改完跑 `pnpm install --lockfile-only` 同步 lock 的 importers 段。
- `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 是独立基线，照各自现值声明，不参与上面这条。
- **内核升版后的批量跟随**：`node tools/dsh-baseline.mjs --write` 一次改齐全部包的上面三处（目标值从已装内核读；有依赖声明的包改完跑 `pnpm install`，没有依赖的包跳过安装并删掉空 lock）；`--bump patch` 顺带升版本号。哪一处漂了由 `node tools/assert-ledger.mjs` 抓，落盘前可以先跑一次 `dsh-baseline.mjs --check` 看齐没齐。
- **手工写死的内核版本也要跟**：自检脚本的断言与注释、`README.md` 与其他非 `DETAILS.md` 的文档、`<id>.patch.yml` 里写到的内核版本，必须与本包 `engines.dsh` 同串。只查这几个「规则面」——`DETAILS.md` 的历史实测记录与 `skills/`、`upstream/` 的 vendored 内容不查，它们记的是当时的版本，改它们等于篡改证据。
- 兄弟 preset 的同一规则见 [presets.md](./presets.md)「版本与依赖」。
- **一次完整跟随**（先看宿主变动、再 preset、再 plugins、最后按 CI 重跑）见 [kernel-upgrade.md](./kernel-upgrade.md)；这一节只写声明怎么改。

## 配置界面

插件的配置界面住在宿主「插件」页，**不占设置页**：注册进 `plugins.bundle.config`。形态、key 约定、注册写法与静默失败见 [plugin-config-page.md](./plugin-config-page.md)。

## 验证

改完在**所在包目录**跑 `pnpm check`：各包自己拼的构建 / 类型 / 测试 / 产物门禁链。漏了 `check` 的包以它自己 `scripts` 里的那几条为准。

跨文件的台账（包名与目录名、`engines.dsh` 与全部 `dsh-*` 同串、cordis / schemastery 基线、手工写死的内核版本字面量、许可声明位、`files` 与 bundle patch 指得到、插件 README 三段、根 README 与目录互相覆盖、preset order 台账、开发副本还是不是软链、preset 抄本与内核同版本）由 `node tools/assert-ledger.mjs` 一次查完——`check` 只管包内，看不见这些。

**仓库级一次跑齐**：`node tools/check.mjs` 跑「台账 + 每个包自己的 `check`」，CI（[.github/workflows/check.yml](../../.github/workflows/check.yml)）跑的就是它。它不替你在包的目录里 `pnpm install`——缺依赖会明说并回退出码 2，别把「没跑」当成「通过」。

### 证明断言有牙齿（变异测试）

新增或翻转断言后，把被测行为**改回旧写法**再跑一次，确认那条断言真的 FAIL。默认写的断言很容易恒为真，绿灯不等于守着东西。

两条会让变异测试骗到自己的坑，都是本仓库实测过的：

- **先确认断言脚本打的是 `src/` 还是构建产物**：`dsh-chat-translate` 的 `scripts/test-client-wiring.mjs` 读 `lib/client.js`，改完 `src/` 必须先 `pnpm build` 再跑，否则测的还是旧产物——变异后忘了重建，会得到一条假的「断言没抓住」。`dsh-grilling-form` 用 `pnpm test` 自己先构建一次来消除这个前提；`dsh-chat-translate` 的其余脚本与 `dsh-subagent-judge-dispatch` 的决策测试直接打 `src/`。照抄邻居前先看它 `import` 的是哪一边。
- **未提交的文件也能变异**：`node tools/mutate.mjs` 对干净文件用 `git checkout --` 还原，对未提交、甚至未被 git 跟踪的文件改用内存里的那份原文写回并逐字节核对。所以改完直接跑变异，不必先做一次 `wip` 提交再 `git reset`。
- **还原用 `git checkout -- <file>`，别手工备份**：`cp src/x.ts /tmp/x.bak` 这类备份失败是静默的（`||` 兜底只在前一条命令失败时才生效，而它常常成功了），变异会留在源码里而你以为已经还原。要么在改动前 `git stash`，要么直接 `git checkout -- <file>`——后者失败会报错，不会静默。机械动作交给 `node tools/mutate.mjs`：它要求文件干净、`--from` 恰好命中一处，命令跑完（无论成败）在收尾还原并核对 `git status --short`。
- **探针的锚点要唯一**：往源码里塞临时探针时，别拿 `str.replace(x, y, 1)` 打在「文件里第一个 `  return (`」这类到处都有的形状上——它会插进另一个函数，报出来的还是 `Invalid hook call` 这种看不懂的错。锚点带上上下文，或改用 `git apply` 的补丁。
- **收尾核对 `git status --short`**：除你本来要改的文件外不该有别的。变异留下的痕迹、顺手做的别的改动、被打乱的工作区（比如多余的 `git stash`），只有在这里才看得见——变异测试的完成判据就是这一行干净。

### 提交闸门（`.githooks/pre-commit`）

改完就跑有闸门兜着：`.githooks/pre-commit` 只看本次改动的包，逐个在包目录跑它自己的 `check`（没有 `check` 脚本的包会明说并跳过），另外只要改到 `plugins/`、`presets/`、根 `README.md`、`docs/rules/` 或 `tools/` 就跑一遍 `tools/assert-ledger.mjs`。装法（`git config core.hooksPath .githooks`）、跳法（`SKIP_CHECK=1 git commit`）与成功 / 失败各打什么，都写在该文件头部。

闸门自己坏了代价最大，改完必须验收一次：走一次**真实提交**，成功路径打出 `pre-commit: 通过（<包名>）`；再确认它真的装着——`git config --get core.hooksPath` 应回 `.githooks`（这条配置不进版本库，新克隆默认没有闸门）。`SKIP_CHECK=1` 只在确实跑不了时用；「检查全过的提交反而被钩子拦住」是钩子自己的 bug，去修钩子。

### 仓库级 check 与 CI（`tools/check.mjs`、`.github/workflows/check.yml`）

本机钩子的两道短板它都补上：钩子只看本次改动的包，且只有装了钩子的机器才有。`node tools/check.mjs` 在仓库根一次跑「台账 + 全部包的 `check`」；CI 在每个有依赖的包目录 `pnpm install --frozen-lockfile` 之后跑同一个脚本，所以「换台机器能不能过」有一份可复现的答案。

两件事它做不到，别把它读成「全绿就没问题」：它不装依赖（缺 node_modules 报退出码 2）；`tools/host-smoke.mjs` 这类要真内核的检查只在装了 DSH 的机器上有意义，CI 上跑不了——真装载仍要本机验收。

**每个包的 `pnpm-workspace.yaml` 是安装契约的一部分，别当本机偏好**。pnpm 11 起有两条默认安全策略，干净环境（CI 就是这样）一定生效：拒绝安装发布不满 24 小时的包，并拒绝执行未登记的依赖构建脚本。本仓库刻意跟随内核的 alpha 版本线——升版当天就要装——所以这两条一定撞上，表现是 CI 的 `install` 一步红、而本机全绿。两处各治一半，缺一不可：

```yaml
minimumReleaseAgeExclude:
  - "@deepseek-ai/*"
allowBuilds:
  esbuild: true
```

前半条按包名放行内核版本线（写成别的 scope 不生效）；后半条给构建链（`esbuild`，有 `lightningcss` / `tsdown` 的包照加）放行构建脚本。`packageManager` 一并写进 `package.json` 钉住 pnpm 版本，否则 corepack 会在没钉的包里解析到另一个版本，同一份策略又要重踩一遍。`tools/new-plugin.mjs` 生成的骨架已带这两处。

**本机绿不等于 CI 绿**：pnpm 的用户级配置（macOS 上是 `~/Library/Preferences/pnpm/config.yaml`）若把 `minimumReleaseAge` 设成 0、或开了 `dangerouslyAllowAllBuilds`，本机就绕过了这两条策略，复现 CI 必须换一份干净 home：

```bash
HOME=./tmp/ci-home COREPACK_HOME=./tmp/ci-home/corepack corepack pnpm install --frozen-lockfile
```

整段流程（干净 HOME、corepack 钉版本、逐包 install、仓库级 check）由 `node tools/ci-check.mjs` 一次跑完；发布或推送前跑它，它要联网。这条安装约定由 `assert-ledger.mjs` 判据 12 守着：有依赖的包缺 `packageManager`，或 `pnpm-workspace.yaml` 缺放行项，提交时就会红。

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
| 建新插件骨架、内核基线跟进、宿主半边冒烟、台账、找 `dsh` 二进制 | `tools/README.md` |

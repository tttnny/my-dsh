# 内核升版（一次跟完）

运行中的 DSH 升了一版，本仓库按固定顺序跟一遍：**先看宿主变了什么，再改 preset，再改 plugins，最后按 CI 重跑**。命令的参数细节在 [tools/README.md](../../tools/README.md)，这里写顺序、判断点与完成判据。

## 1. 认目标版本与上一版

```bash
node tools/dsh-env.mjs --json
```

`kernelVersion` 是运行目标，`sourceDir` 是源码 checkout。旧运行版本从已装清单、启动记录或提交历史核实；各包 `engines.dsh` 只是兼容范围，preset 抄本基线读 patch 顶部的 `# from dsh`。两者可能先后更新。旧运行版本不明时，按各包声明与锁文件选取待核查区间。

有 `cordis_inspect` 时，先列 provider，再查运行版本与当前服务、事件或 slot。离线复核用上面定位的安装目录和目标 tag。

启动自建 npm 或源码实例前，核对目标 CLI `package.json` 的 `engines.node`，用实际启动二进制的 `--version` 验证。打包运行时也以实际随包二进制为准。

**完成判据**：记录目标版本、已核实的旧运行版本或候选区间、各包兼容基线及 preset 抄本基线。

## 2. 看宿主这一版改了什么

```bash
node tools/kernel-diff.mjs <上一版> --from-source --declared
node tools/kernel-diff.mjs <上一版> --from-source --declared --presets
```

`--from-source` 按 `dsh-v<版本>` tag 比源码，旧内核无需安装。去掉它可以比较两版安装产物。`--declared` 仅覆盖依赖声明，另按插件实际使用的工具、服务、事件、slot、配置与存储契约核查。`--presets` 在包清单后附上官方 preset 文件差异。

先读目标安装的 `docs/upgrade-guide/README.md`。按发布顺序从旧版目录查到目标版前一版，目录名对应离开的版本。目标为预发布版时，用目标 tag 或已装实现核对目标版目录中的变更是否已包含。迁移笔记列出命中的接口和验证方式。

**完成判据**：每个实用契约都有核查结论，并判定本仓的官方抄本是否需要合并。第 3 步以抄本与目标版的归一比对为准。

另有一条只在复核源码时才会踩：本机 checkout 的 HEAD **不保证**等于目标 `dsh-v<版本>` tag——它可能领先若干提交，也可能尚未合入该发布线。凡是从**工作树**读宿主源码的自检（`plugins/*/scripts/test-host-parity.mjs`、`plugins/*/scripts/test-anchors.mjs`）默认验的是 HEAD 而不是目标版本，绿灯不代表契约在目标版本上成立。复核时先把 tag 抽成目录再指过去：

```bash
# 在仓库根创建导出目录，再读取目标 tag
mkdir -p tmp/host-source
git -C <源码目录> archive dsh-v<版本> packages | tar -x -C tmp/host-source
# 在目标包目录执行；两个变量都填上面导出目录的绝对路径
DSH_SOURCE=<仓库绝对路径>/tmp/host-source DSH_SOURCE_DIR=<仓库绝对路径>/tmp/host-source pnpm test
```

## 3. 跟 preset

```bash
cd presets/plugin-upgrade-cordis
node ../../tools/preset-copy.mjs plugin-upgrade-cordis --diff
```

归一比对有差异时，用 `--official-diff` 查上游改动，再用 `--recopy` 合并。之后在 preset 目录跑 `pnpm check`。

`engines.dsh` 与版本号**不在这里手改**：第 4 步的 `dsh-baseline --write --bump patch` 一次覆盖 `plugins/` 与 `presets/` 下的全部包，而它按「声明真的变了」决定加不加版本号——先手改过一遍的包在它眼里已经没有改动，反而不会加位。

`--official-diff` 打印两版官方的逐行差异；`--recopy` 把官方这一版的改动三方合并进抄本（base 是抄本顶部 `# from dsh <版本>` 记的那一版），三处自定义行保留：顶部注释、行 id / 显示名 / order、`skill-filesystem` 的 custom root。合并后核对这三处，再跑 `--diff` 应无差异。

**完成判据**：`pnpm check` 通过（上游离线核对、组合解析、提示词变量、随包技能真装载）；`node ../../tools/preset-copy.mjs plugin-upgrade-cordis --diff` 无差异。

## 4. 跟 plugins，并一次改齐版本号与 `engines.dsh`

```bash
node tools/dsh-baseline.mjs --write --bump patch
node tools/assert-ledger.mjs
```

第一条把 `plugins/` 与 `presets/` 下全部包的 `engines.dsh`、peer / dev 里的内核串改到新版本，并给有改动的包各加一位版本号、重写各自的 lock——第 3 步不再手改这两处。第二步会列出所有还没跟齐的手写字面量（自检断言、注释、README、patch 头部），逐个改到新版本。然后各包在自己目录跑 `pnpm check`。

**完成判据**：整仓升版用 `node tools/dsh-baseline.mjs --check` 核对。分阶段升版时，给 `--write` 和 `--check` 都加 `--only <包列表>`，记录尚未升版的包。提交钩子按实际改动的包检查基线。两种情形都跑 `node tools/assert-ledger.mjs` 和已改动包的 `pnpm check`。

## 5. 宿主与浏览器

```bash
node tools/check.mjs
node tools/host-smoke.mjs
```

`check.mjs` 跑一致性检查与全部包的 `check`；`host-smoke.mjs` 起第二个实例判装载。界面要在真浏览器里点一遍：逐插件的判据在 `plugin-fleet-sweep` 技能里，取图与量几何用 `tools/gui-shot.mjs`。

逐包 `pnpm check` 绿**不等于页面没坏**：宿主删除 props / 事件 / slot 造成的漂移，在纯 JS 包里不会被 `tsc` 挡住；keyed slot 的接管项抛错又会**静默整格退位**（见 [client-wiring.md](./client-wiring.md)「接管座位的崩溃是整格永久退位」）。所以这一步的真浏览器验证是必做项，不是可选。

**完成判据**：`host-smoke` PASS；已装插件的入口、样式标签与交互面在页面上都在，页面零报错。

## 6. 提交前按 CI 重跑一次

```bash
node tools/ci-check.mjs
```

内核升版会改各包的 `engines.dsh` 与依赖声明，属于安装契约改动，因此这一步是必做项。安装契约、干净环境重跑的流程与适用条件见 [plugins.md](./plugins.md)「仓库级 check 与 CI」；此命令要联网。

**完成判据**：`ci-check: ok`。然后提交，走 `.githooks/pre-commit`。

## 什么时候用哪条命令

| 想知道 | 命令 |
| --- | --- |
| 两版之间宿主包改了什么 | `node tools/kernel-diff.mjs <旧> --from-source [--declared]` |
| 官方 preset 动没动 | `node tools/kernel-diff.mjs <旧> --from-source --declared --presets` |
| 官方 preset 动在哪几行 | `node tools/preset-copy.mjs <id> --official-diff` |
| 抄本与在用内核的官方是否一致 | `node tools/preset-copy.mjs <id> --diff` |
| 把官方改动合并回抄本 | `node tools/preset-copy.mjs <id> --recopy` |
| 提示词变量是否还都注册着 | `node tools/preset-copy.mjs <id> --variables` |
| 随包技能能不能被真装载 | `node tools/probes/preset-skills.mjs --preset <id>` |
| 换台机器（CI）能不能过 | `node tools/ci-check.mjs` |

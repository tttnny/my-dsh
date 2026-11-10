# 内核升版（一次跟完）

运行中的 DSH 升了一版，本仓库按固定顺序跟一遍：**先看宿主变了什么，再改 preset，再改 plugins，最后按 CI 重跑**。命令的参数细节在 [tools/README.md](../../tools/README.md)，这里写顺序、判断点与完成判据。

上一版号就是仓库里现在的 `engines.dsh`（每个包的 `package.json` 都写着，也是上一次跟到的版本）；新版本号看下一步的 `dsh-env`。

## 1. 认目标版本与上一版

```bash
node tools/dsh-env.mjs
```

看 `内核` 与 `官方 preset` 两行；`DSH 源码` 一行给出源码 checkout。后面按 `dsh-v<版本>` tag 比差异。

**完成判据**：知道新版本号与上一版号。

## 2. 看宿主这一版改了什么

```bash
node tools/kernel-diff.mjs <上一版> --from-source --declared
node tools/kernel-diff.mjs <上一版> --from-source --declared --presets
```

第一条只看本仓包声明过的宿主包；`--presets` 是在包差异之后**附加一节**判四份官方 preset 动没动，它不参与包过滤——只想看那一节就配上 `--declared` 把上半截缩到本仓声明过的包。`--from-source` 用源码 tag，**不需要旧内核还装着**；两版都装着时去掉它，比安装产物。

**完成判据**：能说出「我们依赖的包里哪几个动了、动了哪些文件」与「官方 preset 动没动」。官方 preset 动了就进第 3 步重抄；一字未动就只跟版本号。

另有一条只在复核源码时才会踩：本机 checkout 的 HEAD **不保证**等于目标 `dsh-v<版本>` tag——它可能领先若干提交，也可能尚未合入该发布线。凡是从**工作树**读宿主源码的自检（`plugins/*/scripts/test-host-parity.mjs`、`plugins/*/scripts/test-anchors.mjs`）默认验的是 HEAD 而不是目标版本，绿灯不代表契约在目标版本上成立。复核时先把 tag 抽成目录再指过去：

```bash
git -C <源码目录> archive dsh-v<版本> packages | tar -x -C tmp/<目录>
DSH_SOURCE_DIR=tmp/<目录> pnpm test    # 在包目录里跑
```

## 3. 跟 preset

```bash
cd presets/plugin-upgrade-cordis
node ../../tools/preset-copy.mjs plugin-upgrade-cordis --official-diff
# 官方动了：
node ../../tools/preset-copy.mjs plugin-upgrade-cordis --recopy
pnpm check
```

`engines.dsh` 与版本号**不在这里手改**：第 4 步的 `dsh-baseline --write --bump patch` 一次覆盖 `plugins/` 与 `presets/` 下的全部包，而它按「声明真的变了」决定加不加版本号——先手改过一遍的包在它眼里已经没有改动，反而不会加位。

`--official-diff` 打印两版官方的逐行差异；`--recopy` 把官方这一版的改动三方合并进抄本（base 是抄本顶部 `# from dsh <版本>` 记的那一版），三处自定义行保留：顶部注释、行 id / 显示名 / order、`skill-filesystem` 的 custom root。合并后核对这三处，再跑 `--diff` 应无差异。

**完成判据**：`pnpm check` 通过（上游离线核对、组合解析、提示词变量、随包技能真装载）；`node ../../tools/preset-copy.mjs plugin-upgrade-cordis --diff` 无差异。

## 4. 跟 plugins，并一次改齐版本号与 `engines.dsh`

```bash
node tools/dsh-baseline.mjs --write --bump patch
node tools/assert-ledger.mjs
```

第一条把 `plugins/` 与 `presets/` 下全部包的 `engines.dsh`、peer / dev 里的内核串改到新版本，并给有改动的包各加一位版本号、重写各自的 lock——第 3 步不再手改这两处。第二步会列出所有还没跟齐的手写字面量（自检断言、注释、README、patch 头部），逐个改到新版本。然后各包在自己目录跑 `pnpm check`。

**完成判据**：`tools/assert-ledger.mjs` 通过；每个包的 `pnpm check` 通过。

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

它把工作区复制到 `tmp/ci-check/repo`，用干净 HOME 与钉住的 pnpm 逐包 `pnpm install --frozen-lockfile`，再跑 `node tools/check.mjs`。本机的 pnpm 用户配置可能把安全策略关掉，所以**本机绿不等于 CI 绿**；这一步要联网。内核升版会改每个包的 `engines.dsh` 与依赖声明，正好落在本地环境能骗过自己的那一类改动上，所以这一步在内核升版里是必做项；日常发版不必跑它（见 [release.md](./release.md)「发完即止」）。

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

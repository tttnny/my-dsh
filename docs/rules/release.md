# 发版与退役

## 发完即止

用户下令发布到 npm 后（本机 `npm publish`，或在 Actions 里手动触发 `publish` 工作流），把该发的包（插件、preset 一视同仁）发完就结束：**不跑发布后验证**——不装一遍、不解包 tarball、不 boot 加载、不查 registry 传播；也不回头确认、不追问别的包要不要一起发。答复里报包名、版本、`dist-tags.latest` 就够；发布成功的凭据是 `npm publish` 打出的 `+ pkg@ver`。

发布前的门禁照跑，按顺序：

1. **先把版本号加上去**：`npm publish` 同版本第二次必被 registry 拒绝，白跑一遍。改该包 `package.json` 的 `version`（`dsh-baseline --write --bump patch` 只在声明真改了时才加位——内核升版那一轮已顺带加过，日常发版要自己改）。完成判据：该包的 `version` 与 `npm view @lynn123411/dsh-<name> version` 答的不一样。
2. **scoped 包带 `publishConfig.access: "public"`**：不带就发不出去或发成受限包。`node tools/new-plugin.mjs` 生成的骨架默认写这一项，手写新包时要自己带上；`node tools/assert-ledger.mjs` **不查这一项**，新包或手改 `package.json` 时要自己看一眼。
3. 各包自己的 `check`（见 [plugins.md](./plugins.md)「验证」）、`node tools/assert-ledger.mjs`（清单与目录的一致性）与 `npm pack --dry-run` 清单。

发布前不必在本机重跑一遍 CI：`publish` 工作流在干净 runner 上跑的就是同一套 `pnpm install --frozen-lockfile` 与 `node tools/check.mjs`，而且它排在 `npm publish` 之前——红了就一个包都不发，代价只是一次红 run。`node tools/ci-check.mjs` 留给两种情况：CI 红了要本机复现；或这次改动动了安装契约（依赖声明、lock、`pnpm-workspace.yaml` 的放行项、`packageManager`），因为本机的 pnpm 用户配置可能把安全策略关掉。`git push` 同样只在用户下令后执行。

## 在 GitHub Actions 里发

Actions 页面手动触发 `publish` 工作流（[.github/workflows/publish.yml](../../.github/workflows/publish.yml)），把上面那串门禁一次跑完。用户自己点 Run workflow，或让 agent 用 `gh workflow run` 触发（agent 触发同样只在用户下令后）：

```bash
gh workflow run publish.yml --repo tttnny/my-dsh -f packages=<包名> [-f dry_run=true]
gh run watch
```

- `packages` 留空时自动挑「本地版本 registry 上还没有」的包；也可以写包名、目录名或 `plugins/<目录>`，逗号或空格分隔。
- 第一步是 `node tools/publish-plan.mjs` 挑包：版本号没改（registry 上已有同版本）时在这里就红，不会白跑后面的安装与 check。
- 然后按 `check.yml` 的装法装依赖、跑 `node tools/check.mjs`，再逐个包 `npm pack --dry-run` 与 `npm publish --access public --tag <dist-tag>`。
- `dry_run` 勾上时只跑门禁与 `npm pack`，不执行 `npm publish`。
- 一次性准备：仓库 Settings → Secrets and variables → Actions 加 `NPM_TOKEN`（npm 发布令牌）；缺它时发布那一步报错退出。
- 推送事件要几分钟才进 Actions 队列：`gh run list` 立刻看不到运行不等于没触发，过几分钟再查；要立刻跑就用 `gh workflow run <工作流>` 手动触发。

版本号不在工作流里改：发布前先改要发的包 `package.json` 的 `version` 并提交，触发时选的分支就是发出去的那份代码。

## 发布后索引重建

`plugins/` 与 `presets/` 同时发布成一份 DSH 插件索引（`https://tttnny.github.io/my-dsh/index.json`，见根 [README](../../README.md)「插件索引」）。索引是生成物、不入库：`publish` 工作流发完包后调用 `market` 工作流重建并部署，推进 `main` 也会重建一次。索引读的是 npm registry，所以刚发完的版本要等 registry 的完整 packument 更新后才进索引。

## 发布不回装

`npm publish` 只把包推上 registry，profile 里的自有包全程保持 `link:` 指向仓库目录——「这家代码对不对」一律在仓库里验。确需固定版本时按 [dev-copy.md](./dev-copy.md) 的例外显式装。

## 产物与清单

- **产物不入库**：`build` 生成的镜像目录（`lib/` 这类与 `src/` 对应的副本）由包的 `.gitignore` 挡住、留在 `files` 里、并由 `check` 的产物门禁断言未被 git 跟踪——`files` 不含产物目录时 npm 会漏打运行入口。手写源码形式的 `lib/` 属源码，不受这条约束。
- **镜像与 `src/` 一一对应**：`build` 必须在 emit 前清掉上一轮的声明产物（`rmSync('lib/types')`，见 `dsh-chat-translate` 的 `build.mjs`），因为 `tsc` 从不清理 `outDir`：删掉或改名的模块会把它旧的 `.d.ts` 一直留在 `lib/types` 里，而 `files` 含 `lib`，旧声明会随发布包发出去。这条只能由「清镜像」保证——`lib` 是 gitignore 的、`git status` 不显示，「产物未被跟踪」那道门禁也看不见陈旧文件。目前只有 `dsh-chat-translate` 发声明产物，它靠 `build.mjs` 的两处保证一致：先 `rmSync('lib/types')`，再让 `tsc` 重新 emit，emit 失败置 `process.exitCode = 1`（只 `warn` 会让整个声明镜像静默消失）。要再加一道逐文件对账的闸门（陈旧与缺失两个方向都查），`archive/` 下某个已归档插件的 `scripts/assert-lib-mirror.mjs` 就是现成实现，抄一份进该包的 `check` 即可。
- 发布产物由包自己的 `build` 出：`dsh-grilling-form`、`dsh-subagent-judge-dispatch`、`dsh-native-plus`、`dsh-notify-user` 与 `dsh-kimi-cu` 另有 `prepack`（发布时现打一次），其余包靠发布前跑过的 `check`。新增 `prepack` 的包要把这一行同步到这里。
- 内核升版后各包声明的批量跟随与版本号，一次做完：`node tools/dsh-baseline.mjs --write --bump patch`（见 [plugins.md](./plugins.md)「版本与依赖」）。
- 删掉任何文件时当场同步 `files`、`scripts` 与镜像断言，清单只写还存在的条目。许可声明见 [plugins.md](./plugins.md)「许可」。

## 查已发布版本

```
npm view @lynn123411/dsh-<name> version --fetch-retries=0 --fetch-timeout=10000
```

- **本包现在什么版本读 `package.json`，不需要联网**；只有「registry 上发布到哪一版」才查。`npm install` / `dsh plugin add` 装的是 `dist-tags.latest`。
- `--fetch-retries=0`：治请求快速失败后的退避重试（默认最坏一分多钟）。
- `--fetch-timeout=10000`：治单次请求挂住等满超时（默认 5 分钟）。两个 flag 各治一种，互相替代不了。

## 用户反馈『刚发的包装不上』

发布后约 1–3 分钟内，registry 上的缩写元数据（`Accept: application/vnd.npm.install-v1+json`，pnpm 拉的那份）可能还是 404，比完整 packument 恢复得晚。所以刚发完 `dsh plugin --profile <name> add <包名>` 会 `ERR_PNPM_FETCH_404`——**这不是发布失败**，等它转 200 再装：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/vnd.npm.install-v1+json' \
  "https://registry.npmjs.org/@lynn123411%2F<name>?cb=$RANDOM"
```

仍 404 时先 `pnpm cache delete '@lynn123411/*'` 再试（本机缓存也可能压着那次失败）。

## 退役（归档）

不再维护的插件移到仓库根 `archive/plugins/dsh-<name>/`，不再维护的 preset 移到 `archive/presets/<id>/`；目录名与包名不变、历史链接不失效。归档内容只作历史参考：不再发布、不再适配新内核；目录与包自带 `README.md` 原样保留，包内指向本仓库 `tools/` 的命令随它的退役一起作废。

按顺序做，每一步都有可以判定的完成状态：

1. **搬目录**：`git mv plugins/dsh-<name> archive/plugins/dsh-<name>`。完成判据：`git status --short` 里全是 `R`（重命名），没有一个文件显示成删除加新增。
2. **删根 README 的行**：插件表删该行并修正该功能域的 `rowspan` 合并数（该域只剩一行时连 `rowspan` 一起去掉）；preset 表删该行。完成判据：`node tools/assert-ledger.mjs` 判据 7 通过（它查根 README 与包目录互相覆盖）。
3. **清引用**：`docs/rules/`、`tools/*.mjs` 头部示例、`tools/README.md`、根 `.gitignore`（该包的遗留配置文件名），以及邻居包的注释与断言里点到它的地方，全部改指仍在维护的包或改成不指名的写法。完成判据：`node tools/assert-ledger.mjs` 判据 13 通过——它扫全仓活文件，残留一处就报。preset 另有 [presets.md](./presets.md)「order 台账」删行、[tools/lib/preset-copies.json](./../../tools/lib/preset-copies.json) 删登记、`tools/probes/` 删该 preset 专用的探针与配套 `check`。
4. **在每个装过它的 profile 里卸载**：`dsh plugin --profile <name> remove <包名>`（`--profile` 必填，就是那个装过它的 profile）。归档只搬仓库目录，profile 的 `dependencies` 与 `dsh.profile.bundles` 里仍留着这个包名，而 `dev-link` 只删软链、删不掉清单；清单留着，registry 装的那份下次同步还会被物化回来。完成判据：`grep -n '<包名>' ~/.dsh/profiles/<name>/package.json` 没有输出（`dependencies` 与 `dsh.profile.bundles` 两处都搜不到），且 `ls ~/.dsh/profiles/<name>/node_modules/<包名>` 不存在。
5. **清开发副本**：`node tools/dev-link.mjs --write` 删掉各 profile 里指向归档目录的孤儿软链。完成判据：`node tools/dev-link.mjs` 报 `孤儿软链 0 个` 且退出码 0。
6. **跑门禁**：`node tools/check.mjs`（台账 + 全部包的 `check`）。完成判据：`check: n/n 通过`，且 `git grep -n '<包名>'` 只回 `archive/` 下的结果。

已发布过的包，用户下令后在同一轮把 registry 上**全部版本**标弃用——不传版本范围就是全量，消息指回归档路径与最后可用版本：

```bash
npm deprecate @lynn123411/dsh-<name> "已归档，不再维护：本包已移入仓库 archive/plugins/dsh-<name>，不再发布新版本，也不再随 DSH 内核适配。最后一个可用版本为 <ver>。"
```

弃用只影响新安装（`npm install` / `dsh plugin add` 打警告），已装副本不受影响，也不下架任何版本；与 `npm publish`、`git push` 同属 registry 写入，一样只听令。

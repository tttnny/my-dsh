# 发版与退役

## 发完即止

用户下令发布到 npm 后，把该发的包（插件、preset 一视同仁）`npm publish` 发完就结束：**不跑发布后验证**——不装一遍、不解包 tarball、不 boot 加载、不查 registry 传播；也不回头确认、不追问别的包要不要一起发。答复里报包名、版本、`dist-tags.latest` 就够；发布成功的凭据是 `npm publish` 打出的 `+ pkg@ver`。

发布前的门禁照跑：各包自己的 `check`（见 [plugins.md](./plugins.md)「验证」）、`node tools/assert-ledger.mjs`（清单与目录的一致性）与 `npm pack --dry-run` 清单。`git push` 同样只在用户下令后执行。

## 发布不回装

`npm publish` 只把包推上 registry，profile 里的自有包全程保持 `link:` 指向仓库目录——「这家代码对不对」一律在仓库里验。确需固定版本时按 [dev-copy.md](./dev-copy.md) 的例外显式装。

## 产物与清单

- **产物不入库**：`build` 生成的镜像目录（`lib/` 这类与 `src/` 对应的副本）由包的 `.gitignore` 挡住、留在 `files` 里、并由 `check` 的产物门禁断言未被 git 跟踪——`files` 不含产物目录时 npm 会漏打运行入口。手写源码形式的 `lib/` 属源码，不受这条约束。
- **镜像与 `src/` 一一对应**：`build` 必须在 emit 前清掉上一轮的声明产物（`rmSync('lib/types')`，见 `dsh-a6api`/`dsh-chat-translate` 的 `build.mjs`），因为 `tsc` 从不清理 `outDir`：删掉或改名的模块会把它旧的 `.d.ts` 一直留在 `lib/types` 里。这条只能由「清镜像」保证，`.gitignore` 与「产物未被跟踪」都看不见陈旧文件（`lib` 是 gitignore 的，`git status` 不显示）。带声明产物的包用 `assert:lib-mirror` 这类闸门把这份一致性钉住：它同时查陈旧（`lib/types` 有 `src/` 已不存在的声明，会随 `files` 进发布包）与缺失（`src/` 的模块没发出声明，即 `build` 没跑完）。构建脚本里的声明 emit 失败必须是**非零退出**，只 `warn` 会让整个声明镜像静默消失。
- 发布产物由包自己的 `build` 出：`dsh-grilling-form` 另有 `prepack`，发布时现打一次；其余包靠发布前已跑过的 `check`。
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

移走之后登记当场同步：

- 根 `README.md`——插件表删该行并修正该功能域的 `rowspan` 合并数，preset 表删该行（版式见 [to-readme.md](./to-readme.md)）。
- [presets.md](./presets.md)「order 台账」——删该 preset 的行；`config.order` 取值以本表已占用最大值 +1 为准。
- [presets.md](./presets.md) 的范例、[tools/lib/preset-copies.json](./../../tools/lib/preset-copies.json) 的抄本登记、`tools/probes/` 下该 preset 专用的探针，以及与它配套的 `check` 一起删掉；`plugins/`、`docs/rules/`、`tools/README.md` 里指向它的示例改指仍在维护的 preset。

已发布过的包，用户下令后在同一轮把 registry 上**全部版本**标弃用——不传版本范围就是全量，消息指回归档路径与最后可用版本：

```bash
npm deprecate @lynn123411/dsh-<name> "已归档，不再维护：本包已移入仓库 archive/plugins/dsh-<name>，不再发布新版本，也不再随 DSH 内核适配。最后一个可用版本为 <ver>。"
```

弃用只影响新安装（`npm install` / `dsh plugin add` 打警告），已装副本不受影响，也不下架任何版本；与 `npm publish`、`git push` 同属 registry 写入，一样只听令。

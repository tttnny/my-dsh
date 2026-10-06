# 发版与退役

## 发完即止

用户下令发布到 npm 后，把该发的包（插件、preset 一视同仁）`npm publish` 发完就结束：**不跑发布后验证**——不装一遍、不解包 tarball、不 boot 加载、不查 registry 传播；也不回头确认、不追问别的包要不要一起发。答复里报包名、版本、`dist-tags.latest` 就够；发布成功的凭据是 `npm publish` 打出的 `+ pkg@ver`。

发布前的门禁照跑：各包自己的 `check`（见 [plugins.md](./plugins.md)「验证」）与 `npm pack --dry-run` 清单。`git push` 同样只在用户下令后执行。

## 发布不回装

`npm publish` 只把包推上 registry，profile 里的自有包全程保持 `link:` 指向仓库目录——「这家代码对不对」一律在仓库里验。确需固定版本时按 [dev-copy.md](./dev-copy.md) 的例外显式装。

## 产物与清单

- **产物不入库**：`build` 生成的镜像目录（`lib/` 这类与 `src/` 对应的副本）由包的 `.gitignore` 挡住、留在 `files` 里、并由 `check` 的产物门禁断言未被 git 跟踪——`files` 不含产物目录时 npm 会漏打运行入口。手写源码形式的 `lib/` 属源码，不受这条约束。
- 发布产物由包自己的 `build` 出：`dsh-antigravity-auth`、`dsh-grilling-form` 另有 `prepack`，发布时现打一次；其余包靠发布前已跑过的 `check`。
- 删掉任何文件时当场同步 `files` 与 `scripts`，清单只写还存在的条目。许可声明见 [plugins.md](./plugins.md)「许可」。

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

不再维护的插件移到仓库根 `archive/plugins/dsh-<name>/`，目录名与包名不变、历史链接不失效。归档内容只作历史参考：不再发布、不再适配新内核；目录与插件自带 `README.md` 原样保留。

移走之后登记当场同步：根 `README.md` 插件表——删该行并修正该功能域的 `rowspan` 合并数（版式见 [to-readme.md](./to-readme.md)）。

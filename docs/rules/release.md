# 发版与退役

## 发完即止

用户下令发布到 npm 后，把该发的包（插件、preset 一视同仁）`npm publish` 发完就结束：**不跑发布后验证**——不装一遍、不解包 tarball、不 boot 加载、不查 registry 传播；也不回头确认、不追问别的包要不要一起发。答复里报包名、版本、`dist-tags.latest`，说「发完了」就够；发布成功的凭据就是 `npm publish` 打出的 `+ pkg@ver`。

发布前的门禁照跑：各包自己的 `check`（见 [plugins.md](./plugins.md)「验证」）与 `npm pack --dry-run` 清单。`git push` 同样只在用户下令后执行。

## 发布不回装

`npm publish` 只把包推上 registry，profile 里的自有包全程保持 `link:` 指向仓库目录——「这家代码对不对」一律在仓库里验（改完就验，不靠发布后再装回来）。确需固定版本时按 [dev-copy.md](./dev-copy.md)「不点市场、不手工拷」的例外显式装。

## 产物与清单

- 发布产物由 `prepack` 的 `pnpm run build` 现打；发布范围的门禁是 `package:smoke` 与 `publint`。
- **产物不入库**：`build` 生成的镜像目录（`package/lib/`、`package/shared/` 这类与 `src/` 逐字节相同的副本）由 `.gitignore` 挡住、留在 `files` 里、并由产物门禁断言未被 git 跟踪——`files` 不含产物目录时 npm 会漏打运行入口。手写源码形式的 `lib/` 属源码，不受这条约束。
- 删掉任何文件时当场同步 `files` 与 `scripts`，清单只写还存在的条目。许可声明见 [plugins.md](./plugins.md)「许可」。

## 查已发布版本

`npm view @lynn123411/dsh-<name> version --fetch-retries=0 --fetch-timeout=10000`

两个 flag 各治一种挂很久的形态，默认各治不了对方；两者都只管失败路径，正常网络下单次 1.4–2.7s：

| 形态 | 默认最坏 | 治它 |
| --- | --- | --- |
| 请求快速失败 → 退避重试 | 一分多钟（实测 74–78s 浮动） | `--fetch-retries=0` |
| 单次请求挂住 → 等满超时 | 5 分钟（`fetch-timeout` 默认 300000） | `--fetch-timeout=<ms>` |

查之前先问本地够不够：**「本包现在什么版本」读 `package.json` 的 `version`，不需要联网**；只有「registry 上发布到哪一版」才要查。`npm install` / `dsh plugin add` 装的是 `dist-tags.latest`。

## 用户反馈「刚发的包装不上」

发布后约 1–3 分钟内，registry 上的 packument 可能还是 404：**缩写元数据（`Accept: application/vnd.npm.install-v1+json`，pnpm 拉的那份）比完整 packument 恢复得更晚**，而 tarball 那条 URL 一开始就是 200。所以刚发完 `dsh plugin --profile <name> add <包名>` 会 `ERR_PNPM_FETCH_404`——**这不是发布失败**，等缩写元数据转 200 再装：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/vnd.npm.install-v1+json' \
  "https://registry.npmjs.org/@lynn123411%2F<name>?cb=$RANDOM"
```

仍 404 时先 `pnpm cache delete '@lynn123411/*'` 再试（本机缓存也可能压着那次失败）。

## 退役（归档）

不再维护的插件移到仓库根 `archive/plugins/dsh-<name>/`，目录名与包名不变、历史链接不失效。归档内容只作历史参考：不再发布、不再适配新内核；目录与插件自带 `README.md` 原样保留。

移走之后两处登记当场同步：

1. 根 `README.md` 插件表——删该行并修正该功能域的 `rowspan` 合并数（版式见 [to-readme.md](./to-readme.md)）。
2. [settings-order.md](./settings-order.md) 台账——该插件若占过 `settings.section`，释放其 order 并把「下一个自有插件使用」回退到刚让出的值。改挂插件页的插件本就不占这个台账。

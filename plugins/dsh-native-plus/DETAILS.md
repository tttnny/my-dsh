# @lynn123411/dsh-native-plus 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置模型、颜色从哪里来、开发副本与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-native-plus
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry。这一条行同时承载两个半边：

- **宿主半边**（`lib/index.js`）：只声明 `Config` 的形状，并登记 `settings.configure({ auto: false })`——本插件的配置界面在「插件」页上，不让内核按 schema 再生成一份同字段的设置页。
- **浏览器半边**（`lib/client.js`）：注入三张样式表（tokens / markdown / card）、把配置投影到 `<html>` 上、在「插件」页上挂配置卡片。

声明的服务：宿主半边只要 `settings`；浏览器半边要 `configForms`（读本插件那一行的配置）、`slots` 与 `locale`（画卡片）。本插件**不声明 `theme`**：它不碰宿主的主题通道。`package.json` 的 `dsh.client.inject` 另列了它依赖的插件契约包，两层都要声明，漏一层整条 loader entry 会静默变成 failed。

## 配置模型

全部 2 个字段写在 [src/client/schema.ts](./src/client/schema.ts) 的一张字段表里。每条声明自己的标题、说明、上下界与默认值；宿主半边的 schema、投影、卡片与自检都从这张表生成。

| 字段 | 范围与默认值 |
| --- | --- |
| 行高 | 1.4–2，默认 1.75 |
| 段落间距 | 4–24px，默认 10px |

投影只写一个根属性与两个变量：

| 名字 | 作用 |
| --- | --- |
| `data-native-plus` | 根属性，三张样式表全部挂在它下面；关掉整层就整段不匹配 |
| `--np-line-height` | 正文行高倍数 |
| `--np-p-gap` | 段落间距 |

## 颜色从哪里来

本插件不拥有任何颜色。它只给宿主的令牌起名字，然后再用一次：

| 用途 | 取值 |
| --- | --- |
| 标题 h1 | `--dsw-static-blue-800`（深色下 `-300`） |
| 标题 h6 | `--dsw-static-blue-600`（深色下 `-500`） |
| 标题 h2–h5 | 上面两端之间按 80% / 60% / 40% / 20% 插值 |
| 链接、引用竖线、列表标记、语言标签 | `--dsw-alias-link` |
| 引用底、表头底 | 由 `--dsw-alias-link` 与 `--dsw-alias-bg-base` 混出 |
| 代码块底与标题条 | `--dsw-alias-markdown-code-block` / `-banner` |
| 语法高亮 | 宿主的 `--shiki-token-*`，插件一个字都不写 |

深色模式不需要第二份表：`color-mix` 里的令牌自己会翻，蓝阶的端点只在 `body[data-ds-dark-theme]` 下换一组。

浅色两端分别是 8.72:1 与 5.17:1，深色两端是 10.11:1 与 4.96:1，都在 WCAG AA 之上；中间的档按等距插值，明度落在两端之间。

蓝阶取饱和的 `--dsw-static-blue-*`，不取 `--dsw-static-deepseek-*`：后者最深的一档停在藏青（#283142），饱和度过低，浅色下看上去接近黑色。

## 开发副本与验证

开发副本 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-native-plus` 是 `link:` 软链，指向本目录（见 `docs/rules/dev-copy.md`）。

在本包目录跑 `pnpm check`：类型检查、构建、五个自检脚本、产物门禁。

| 脚本 | 查什么 |
| --- | --- |
| `smoke-host.mjs` | 宿主半边的 Config 形状与 `settings.configure` 登记 |
| `test-projection.mjs` | 脏输入的收拢、投影写了什么、卸载后不留痕迹、投影不产生颜色 |
| `smoke-client.mjs` | 按 Web shell 的方式装载 bundle，验样式表归属键、投影落点、卡片注册、主题通道一次都没被碰 |
| `test-tokens.mjs` | 样式表里没有写死的色值、标题六档都取变量、蓝阶两端过 AA |
| `test-anchors.mjs` | 宿主锚点仍存在、没有哈希类名、文档里的数字与实际一致 |

锚点自检要能找到宿主源码（`DSH_SOURCE` 或仓库同级的 `../other/deepseek-harness`），找不到时这一条跳过而不是失败。

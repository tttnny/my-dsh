# @lynn123411/dsh-native-plus 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置模型、颜色从哪里来、开发副本与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-native-plus
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry。这一条行同时承载两个半边：

- **宿主半边**（`lib/index.js`）：只声明 `Config` 的形状，并登记 `settings.configure({ auto: false })`——本插件的配置界面在「插件」页上，不让内核按 schema 再生成一份同字段的设置页。
- **浏览器半边**（`lib/client.js`）：注入四张样式表（tokens / markdown / card / sidebar）、把配置投影到 `<html>` 上、在「插件」页上挂配置卡片、给侧边栏工作区行打运行标记。

声明的服务：宿主半边只要 `settings`；浏览器半边要 `configForms`（读本插件那一行的配置）、`slots` 与 `locale`（画卡片）。侧边栏标记另要 `workspaces` 与 `sessions`，经 `ctx.inject` 声明为可选依赖：服务缺席时只少这一个功能，其余照常。本插件**不声明 `theme`**：它不碰宿主的主题通道。`package.json` 的 `dsh.client.inject` 另列了它依赖的插件契约包，两层都要声明，漏一层整条 loader entry 会静默变成 failed。

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

## 侧边栏运行标记

某个工作区里有会话在跑时，该工作区行右端出现一个 6px 的灰点，缓慢明暗呼吸；鼠标悬停到这一行、或打开这一行的菜单时让位给同一位置的操作条（更多 / 新建会话）。

判据与宿主侧边栏会话行的「进行中」完全一致（宿主 `ui-workspace` 的 `tree.ts`）：

| 事实 | 来源 |
| --- | --- |
| 回合在跑 | 会话列表快照的 `running`（宿主 `api-session/status` 事件实时更新，与 `uiSession.sessionStatus` 同源） |
| 子代理在跑 | 会话列表快照里 `projectionsBySession[父会话].values.subagentCatalog` 各项是否 running |
| 会话属于哪个工作区 | `workspaces.list` 的 `items[].sessionIds`；不在任何工作区的归未分组桶 |

为什么要写属性而不是纯 CSS：宿主折叠工作区时不渲染里面的会话行（`sessions: expanded ? … : []`），`:has()` 拿不到任何信号。所以判据在 `src/client/workspace-activity.ts` 里算，行上只留本插件自己的 `data-np-running`，样式表认这个属性。行被重建（分组方式切换、工作区增删）时由 `MutationObserver` 补回，观察器只认增删节点里带 `data-row-key` 的，对话流的高频变更不会触发重放。

行键的形状（`workspace:<工作区 id>`，未分组桶是 `workspace:`）归宿主，`scripts/test-anchors.mjs` 会去宿主源码里确认 `data-row-key` 还在。

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
| `smoke-client.mjs` | 按 Web shell 的方式装载 bundle，验样式表归属键、投影落点、卡片注册、主题通道一次都没被碰、运行标记按会话状态落到正确的行上 |
| `test-tokens.mjs` | 样式表里没有写死的色值、标题六档都取变量、蓝阶两端过 AA |
| `test-anchors.mjs` | 宿主锚点仍存在、没有哈希类名、文档里的数字与实际一致 |

锚点自检要能找到宿主源码（`DSH_SOURCE` 或仓库同级的 `../other/deepseek-harness`），找不到时这一条跳过而不是失败。

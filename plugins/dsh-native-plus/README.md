# @lynn123411/dsh-native-plus

在 DSH 自带的蓝白黑之上，把对话正文的排版整理得更像一本正经的书，并让侧边栏的工作区行显示「里面有会话在跑」。配色一个字不改。

## 概述

插件做三件事，都不碰颜色：

- **正文排版**：助手正文的行高与段落间距各有一个数字可调，改一下当前页面立刻跟着变。
- **正文装饰**：六级标题按宿主蓝阶从深到浅排；引用是一条蓝竖线加一层浅蓝底；表格表头填浅蓝、四角圆角；代码块一圈发丝边框、圆角比宿主小一档；分隔线两端淡出；列表标记换成等宽字体取链接蓝。
- **侧边栏运行标记**：某个工作区里有会话在跑（含子代理）时，该工作区行右端亮起一个 6px 的圆点，缓慢明暗呼吸；工作区折叠着也看得到，鼠标悬停到这一行、或打开这一行的菜单时让位给同一位置的操作条。

蓝阶、纸面、语法色全部读宿主自己的令牌，深浅两套主题自动跟随，没有第二份深色表要维护。

## 安装与开关

```sh
dsh plugin --profile web add @lynn123411/dsh-native-plus
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry（`id: dsh-native-plus`）。

开关就是这条 loader entry：在插件页或 `plugin_manager` 里把它关掉，样式表按 `data-plugin` 归属键整批删掉，`<html>` 上的属性与变量一并撤掉，页面回到宿主原本的样子；重新打开时重新注入。行 id 同时是配置命名空间：宿主 `Config` 与浏览器 `ctx.configForms.get('dsh-native-plus')` 读写的是同一份值。

## 配置

配置界面在宿主「插件」页本插件的详情页上。

全部 2 个字段写在 [src/client/schema.ts](./src/client/schema.ts) 的一张字段表里。每条声明自己的标题、说明、上下界与默认值；宿主半边的 schema、浏览器的投影、配置卡片与自检都从这张表生成，不会出现「卡片上有、投影里没有」。

| 字段 | 范围 | 默认 | 说明 |
| --- | --- | --- | --- |
| 行高 | 1.4–2 | 1.75 | 正文行高倍数，按字号乘出来，宿主调字号时跟着走。 |
| 段落间距 | 4–24px | 10px | 段落之间、段落与列表、表格、代码块之间的空隙。 |

本插件的两个可调项就是这两个字段：行高与段落间距。

投影只写一个根属性与两个变量：

| 名字 | 作用 |
| --- | --- |
| `data-native-plus` | 根属性，四张样式表全部挂在它下面；关掉整层就整段不匹配 |
| `--np-line-height` | 正文行高倍数 |
| `--np-p-gap` | 段落间距 |

字段都标了 `.volatile()`：改它们不重挂这条 loader entry。投影订阅本插件那一行的配置表单，值变了只改 `<html>` 上的属性与变量，样式表不重建。宿主没服务这份配置时卡片整块不出现。插件同时用 `ctx.settings.configure({ auto: false })` 关掉内核按 schema 自动生成的那份设置页，避免同一批字段在设置页上出现第二次。

## 实现

### 装配

这一行同时承载两个半边：

- **宿主半边**（`lib/index.js`）：由字段表生成 `Config` 的形状，并登记 `settings.configure({ auto: false })`——配置界面在「插件」页上，不让内核按 schema 再生成一份同字段的设置页。
- **浏览器半边**（`lib/client.js`）：注入四张样式表（tokens / markdown / card / sidebar）、把配置投影到 `<html>` 上、在「插件」页上挂配置卡片、给侧边栏工作区行打运行标记。

声明的服务：宿主半边只要 `settings`；浏览器半边要 `configForms`（读本插件那一行的配置）、`slots` 与 `locale`（画卡片）。侧边栏标记另要 `workspaces` 与 `sessions`，经 `ctx.inject` 声明为可选依赖：服务缺席时只少这一个功能，其余照常。本插件**不声明 `theme`**：它不碰宿主的主题通道。`package.json` 的 `dsh.client.inject` 另列了它依赖的插件契约包，两层都要声明，漏一层整条 loader entry 会静默变成 failed。

样式表按「包名/文件名」拼归属键写在 `data-plugin` 与 `data-plugin-css` 上：热更时新内容覆盖旧标签，卸载时整批删。

### 正文排版

正文层只作用于助手回答的正文（`[data-chat-flow-kind='assistant-step']`）：推理块用同一个 flow kind，但它带 `data-chat-group-part='reasoning'`，被排除在外——推理行要保持宿主的小字号与紧凑行距；工具行的 flow kind 是 `tool-call`，宿主本来就不在里面放 markdown 元素。

行高走宿主的 `--dsw-font-markdown-*` 复合令牌：宿主把它们写成「字号 / 行高 / 字族」一次取，本插件改成「字号 × 配置的行高倍数」，所以用户调大字号时行高跟着长。段距落在 `p` 的 margin 上——宿主给正文段落写的就是 `margin: 16px 0`，中间那层容器是 block 不是 flex，给它 gap 不产生任何间距。

装饰全部用「宿主的数据属性 + 元素名」两层选择器：宿主正文的类名是 CSS Modules 的哈希串，换一次构建就变，不能当锚点。用到的锚点只有 `data-chat-flow-kind`、`data-chat-group-part`、`data-code-block-banner`、`data-line-numbers`、`data-row-key` 这类语义属性。

### 颜色从哪里来

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

深色模式不需要第二份表：`color-mix` 里的令牌自己会翻，蓝阶的端点只在 `body[data-ds-dark-theme]` 下换一组。浅色两端分别是 8.72:1 与 5.17:1，深色两端是 10.11:1 与 4.96:1，都在 WCAG AA 之上；中间的档按等距插值，明度落在两端之间。

蓝阶取饱和的 `--dsw-static-blue-*`，不取 `--dsw-static-deepseek-*`：后者最深的一档停在藏青（#283142），饱和度过低，浅色下看上去接近黑色。

### 侧边栏运行标记

某个工作区里有会话在跑时，该工作区行右端出现一个 6px 的灰点，缓慢明暗呼吸；鼠标悬停到这一行、或打开这一行的菜单时让位给同一位置的操作条（更多 / 新建会话）。系统设了「减少动态效果」时留一个静止的点。

判据与宿主侧边栏会话行的「进行中」完全一致（宿主 `ui-workspace` 的 `tree.ts`）：

| 事实 | 来源 |
| --- | --- |
| 回合在跑 | 会话列表快照的 `running`（宿主 `api-session/status` 事件实时更新，与 `uiSession.sessionStatus` 同源） |
| 子代理在跑 | 会话列表快照里 `projectionsBySession[父会话].values.subagentCatalog` 各项是否 running |
| 会话属于哪个工作区 | `workspaces.list` 的 `items[].sessionIds`；不在任何工作区的归未分组桶 |

为什么要写属性而不是纯 CSS：宿主折叠工作区时不渲染里面的会话行（`sessions: expanded ? … : []`），`:has()` 拿不到任何信号。所以判据在 [src/client/workspace-activity.ts](./src/client/workspace-activity.ts) 里算，行上只留本插件自己的 `data-np-running`，样式表认这个属性。行被重建（分组方式切换、工作区增删）时由 `MutationObserver` 补回，观察器只认增删节点里带 `data-row-key` 的，对话流的高频变更不会触发重放。

## 模型体验

不注册工具、不改系统提示、不往模型上下文里加任何东西：模型看到的一切与不装这个插件时相同，装与不装只差页面上的排版。

## 限制

- 只改助手正文的排版：推理块、工具行、侧边栏会话行与设置页都不受影响。
- 装饰依赖宿主那几个不带哈希的语义属性。宿主改名时样式不会报错，只会静默不生效——`scripts/test-anchors.mjs` 去宿主源码里逐个确认它们还在。
- 侧边栏运行标记要 `workspaces` 与 `sessions` 两个服务；服务缺席时只少这一个功能，正文排版与配置卡片照常。
- 不提供配色开关：颜色全部来自宿主令牌，插件没有自己的色板可以调。
- 行高与段距只作用于正文，不改变其它区域的字号与行距。

## 验证

```sh
cd plugins/dsh-native-plus && pnpm check
```

`check` = `typecheck` + `build` + 五个自检 + `assert:lib-untracked`：

- `smoke-host.mjs`：真 cordis `Context` + 真 settings 服务的登记面，断言宿主半边只声明配置形状并登记 `auto: false`，且字段集与 `src/client/schema.ts` 的 `FIELDS` 一一对上。
- `test-projection.mjs`：脏输入的收拢（越界夹回、脏类型丢掉、缺字段补默认）、投影写了什么、卸载后不留痕迹、投影不产生颜色。
- `smoke-client.mjs`：按 Web shell 的方式装载 `lib/client.js`，验样式表归属键、投影落点、卡片注册进 `plugins.bundle.config` 且 key 是包名、主题通道一次都没被碰、运行标记按会话状态落到正确的行上（回合在跑、子代理在跑、未分组桶、行重建、卸载），并带一条「未声明服务读取必须抛」的反例断言。
- `test-tokens.mjs`：样式表里没有写死的色值、标题六档都取变量、蓝阶两端在两套纸面上都过 WCAG AA。
- `test-anchors.mjs`：宿主锚点仍存在、没有哈希类名、文档里写死的数字与实际一致。
- `assert-lib-untracked.mjs`：`lib/` 是构建镜像，不入 git。

锚点自检要能找到宿主源码（`DSH_SOURCE` 或仓库同级的 `../other/deepseek-harness`），找不到时这一条跳过而不是失败。

浏览器里验收：打开任意会话，正文的标题应是蓝色、引用带蓝竖线、表格表头浅蓝、代码块有发丝边框；切到插件页改行高或段距，当前页面立刻跟着变。侧边栏找一个有会话在跑的工作区，行右端应有一个呼吸的圆点；把鼠标移到那一行，圆点让位给操作条。

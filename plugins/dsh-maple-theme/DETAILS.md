# @lynn123411/dsh-maple-theme 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配色落点、与 Maple 原版的偏差、开发副本与验证。

## 装配形态

```sh
dsh plugin --profile web add @lynn123411/dsh-maple-theme
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry。这一条行同时承载两个半边：

- **宿主半边**（`lib/index.js`）：只声明 `Config` 的形状，并登记 `settings.configure({ auto: false })`——本插件的配置界面在「插件」页上，不让内核按 schema 再生成一份同字段的设置页。
- **浏览器半边**（`lib/client.js`）：注入四张样式表（tokens / markdown / shell / card）、把配置投影到 `<html>` 上、在「插件」页上挂配置卡片。

声明的服务：宿主半边只要 `settings`；浏览器半边要 `configForms`（读本插件那一行的配置）、`slots` 与 `locale`（画卡片）。`package.json` 的 `dsh.client.inject` 另列了它依赖的插件契约包，两层都要声明，漏一层整条 loader entry 会静默变成 failed。

## 配色怎么落到页面上

宿主的语义令牌声明在 `body` 与 `body[data-ds-dark-theme]` 上，插件的样式表后注入，同优先级下后者赢。所以 `tokens.css` 的前两段**照抄宿主的选择器**，值换成 Maple 的推导式：

```css
body { --dsw-alias-bg-base: hsl(var(--maple-hue-light, 35) 12% 97%); }
body[data-ds-dark-theme] { --dsw-alias-bg-base: hsl(var(--maple-hue-dark, 207) 6% 11%); }
```

两个色相写在 `<html>` 的行内变量上（`--maple-hue-light` / `--maple-hue-dark`），由浏览器半边按配置写入。所以配置页拨一下数字，整套色板跟着转，样式表不用重建。

开关（标题配色方式、等级标记、代码配色、外壳装饰）走 `<html>` 上的数据属性，前缀同一个 `data-maple-`。关掉时那些规则整段不匹配，不必跟宿主争优先级。

## 正文装饰的锚点

宿主的正文由 `MarkdownText` 渲染，根节点的类名是 CSS Modules 的哈希串，换一次构建就变。可用的稳定锚点只有两样：

- 宿主自己的 `[data-chat-flow-kind='assistant-step']`，以及它上面的 `data-chat-group-part`（`response` 是回答，`reasoning` 是推理）；
- `MarkdownText` 发出来的真元素名（`h2`、`blockquote`、`table`、`hr`……），外加两个稳定类名 `md-code-block` 与 `md-table-wide`。

`markdown.css` 于是写成「属性两层 + 元素一个」，优先级 (0,2,1)，正好压过宿主模块样式表里的 `.markdown h2` (0,1,1)，不需要 `!important`。推理块被别的渲染器接管时也不受影响：属性挂在更外层的 flow item 上。

这套锚点是宿主的内部属性，不是公开契约。它改名时装饰会静默消失，文字与配色照常——所以装饰层只负责观感，不承担任何布局职责。

## 外壳层的锚点

外壳（侧栏、会话头部、输入区、标签条）连元素名都靠不住，能用的只有宿主的座位名：

| 要选的东西 | 写法 |
| --- | --- |
| 装某个座位的壳 | `:has(> [data-slot='main'])`、`:has(> [data-slot='sidebar'])` —— 壳没有名字，孩子有 |
| 会话头部 | `[data-slot='conversation.header']` |
| 输入卡 | `[data-composer-card]` |
| 会话标签 | `[data-conversation-tabs] [aria-selected='true']` |
| 侧栏的行 | `[data-row-key^='session:']`、`[data-row-key^='workspace:']` |

外壳层只改观感——底色、分隔线、圆角、指示条。不动 `grid-template-columns`（拖宽由宿主实时写行内样式，抢过来就会跟指针打架），不动滚动归属，不动任何尺寸计算。

## 锚点是由自检守着的

上面这些名字宿主随时可能改，而改了之后**样式不报错，只是不生效**。`scripts/test-anchors.mjs` 因此做四件事：

1. 去宿主源码里逐个确认用到的 `data-*` 属性名还在；
2. 逐个确认用到的**座位名**还在（座位名分散在 ui-layout、ui-sidebar、ui-conversation 各自的声明处，写错一个字符同样静默失效）；
3. 禁止样式表出现 CSS Modules 的哈希类名——出现了就说明抄的是宿主内部实现；
4. 检查圆角是否有字面 px、药丸圆角是否配了 `corner-shape: round`。

找不到宿主源码（比如在没装 DSH 的机器上）时，第 1、2 条跳过并打出 skip，第 3、4 条照跑。

## 与 Maple 原版的偏差

只有两处，都是为了让对话流读得清：

- **链接与强调色压深**。Maple 的浅色强调色 `hsl(35 22% 56%)` 在 `#F8F8F6` 上只有 2.79:1，外链黄更低（2.98:1）。这里把链接换成青绿 `hsl(162 76% 29%)`（4.50:1），强调色换成 `hsl(35 26% 38%)`（5.22:1）。
- **深色正文不叠透明度**。Maple 用 `--color-opacity: 0.85` 给所有颜色打折，长文会整体发灰。这里保留它的色相与明度关系，正文按原色输出。

标题六色按 4.5:1 调过浅色明度（h5 / h6 的字号降到正文量级，所以六级统一按正文阈值守）。所有这些由 `scripts/test-tokens.mjs` 读样式表自己算，改一个色值就会当场报数。

## 开发副本

运行副本用 `link:` 连到本仓库目录（细则见仓库 `docs/rules/dev-copy.md`）：

```sh
cd ~/.dsh/profiles/web && pnpm add "link:/Users/tny/Desktop/work/my-dsh/plugins/dsh-maple-theme" --offline
```

改 `src/` 之后要 `pnpm build`——链接过去的是 `lib/` 里的产物。浏览器半边刷新页面即生效；宿主半边（`src/index.ts`）要触发一次 profile 重新组合（在插件页开关任一插件，或改存 profile 的 `cordis.patch.yml`）。

## 验证

```sh
cd plugins/dsh-maple-theme && pnpm check
```

`check` 依次跑六步：

| 步骤 | 断言什么 |
| --- | --- |
| `tsc -p tsconfig.json --noEmit` | 类型闸门，覆盖两半边连同配置投影模块 |
| `scripts/smoke-host.mjs` | 真 cordis `Context`：`Config` 七个字段的默认值、越界值被 schema 拒绝、每个字段都是 `volatile`、`apply` 按 `{ auto: false }` 登记、包内 `cordis.patch.yml` 只有一条装配行且 id 与包名各自对上 |
| `scripts/test-projection.mjs` | 脏输入收拢（越界、字符串、`null`、缺字段）、投影只写四个属性与四个变量、关掉的开关写成「删属性」、写到真 DOM 再撤掉不留痕迹、重复投影幂等 |
| `scripts/smoke-client.mjs` | 按 Web shell 的方式装载 `lib/client.js`：四张样式表都带 `data-plugin` 归属键、投影真的写到 `<html>`、配置变化后属性跟着换、卡片注册进 `plugins.bundle.config` 且 key 是包名、词典中英键集一致、卸载后属性与变量都撤干净；另带一条反例断言证明「读未声明服务会抛」的守卫还在响 |
| `scripts/test-tokens.mjs` | 读 `tokens.css` 算 WCAG 对比度：两套模式的正文、次要、三级文字、链接、主按钮、代码块、侧栏、提示框、气泡都过阈值；标题六色两套都过 4.5:1；两套令牌集一一对应 |
| `scripts/test-anchors.mjs` | 宿主锚点契约：属性名与座位名仍在宿主源码里、样式表不含哈希类名、圆角无字面值、药丸圆角配了 `corner-shape: round` |

`node scripts/assert-lib-untracked.mjs` 最后确认 `lib/` 没被 git 跟踪。

改动配色或断言之后做一次变异测试（`docs/rules/plugins.md`「证明断言有牙齿」）：把 `--dsw-alias-label-primary` 改成浅色，`test-tokens.mjs` 会当场报 1.23:1；把投影里关闭开关的分支改成恒 `'on'`，`smoke-client.mjs` 会报「关掉的开关把属性删掉了」。

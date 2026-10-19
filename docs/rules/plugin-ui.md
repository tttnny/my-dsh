# 插件界面（宿主的控件与样式）

插件界面这一支的细则；前门是 [plugins.md](./plugins.md)。自检能守住渲染树与 bundle，守不住布局与观感——这一页说的都是自检说不出口的事。

## 先挑宿主的现成控件，别自绘

宿主 checkout（路径见根 `AGENTS.md`）里有两份清单，动手前先读：

- `packages/client/ui-primitives/README.md` 的组件目录：**弹窗用 `Modal`**（居中、遮罩、Esc、点遮罩关闭、关闭按钮、`useModalLayer` 的顶层 Tab/Esc 归属与焦点回收都在它里面；打开后焦点落在关闭按钮上，想换成别的控件就给它 `data-modal-autofocus`，别用 React 的 `autoFocus`——那会让焦点回收失效），下拉用 `Menu` / `MenuSurface`，气泡用 `Tooltip`。本地化文案一律由调用方传：该包没有语言兜底，缺 label 直接类型报错。
- `docs/web-styling.md`：样式归属与组件规则（下面两条就是它的原文）。

自绘一个浮层，等于把上面那一串自己实现一遍、再逐个踩它们的坑：位置与高度上限自己算，resize / scroll 各自重算，Esc 与外部点击各自挂一遍，还要处理和宿主其它浮层的遮挡与焦点。仓库里还留着的自绘件是判断题，不是可以照抄的样板。

## 两条样式规则

- **浮起来的面（弹窗、菜单、卡片、浮层按钮）写 `border: 0` + `box-shadow: var(--dsw-elevation-prominent | panel | soft)`**。中性描边那根 0.5px 发丝线是阴影的第一层替你画的，再自己写一根 `border: 1px solid var(--dsw-alias-border-*)` 就成了两条边叠着（宿主 `docs/web-styling.md`「Component rules」明写这对搭配不允许）。
- **颜色只从 `var(--dsw-alias-*)` 取，不写死色值**：`#ffffff`、`rgba(0, 0, 0, 0.16)` 这类在换深浅主题时会露馅。`var(--dsw-alias-bg-layer-2, #ffffff)` 这种「兜底」同样不必写——宿主的主题层永远在，取不到的那天不会来，写了只让人以为它有用。

## 覆盖宿主控件的样式

插件 CSS 由 `injectStyles()` 在 `apply()` 时追加进 `<head>`，而宿主的样式表是页面加载时的 `<link>`——**同优先级下插件后写的规则生效**。所以放宽 `Modal` 的卡片宽度，只要给它一个自己的类：

```css
.dsh-picker-dialog { width: min(680px, 100%); height: min(640px, 80vh); }
```

两条注意：

- 只赢「同优先级」：宿主用元素选择器或更高优先级的地方，单类选择器赢不了。
- 宿主的内部类名是 CSS Modules 的哈希串（`_body_o6lrb_115`），别照抄。用它给的钩子（`className` / `contentClassName` / 组件自己的语义类）或结构选择器（如 `.dsh-picker-content > :last-child`——`Modal` 的正文行是 `.content` 的最后一个子元素，让它自己滚，标题栏就钉住了）。

## 看一眼界面

自检管不了布局：居中、高度上限、滚动归属、遮挡、`sticky` 都只有真浏览器能证明。改完界面真跑一次：量居中误差、量高度上限、滚一段再看标题栏有没有跟着走、收页面报错。

## 只想看一个组件的长相

`gui-shot` 要有一个真的轮次把那块界面渲染出来，代价是一次模型调用。做界面时更常用的是
`node tools/ui-preview.mjs`：它把**插件自己的真组件**打进一个独立页面去拍图，不连正在服务的
实例，也不改任何会话状态。

```bash
node tools/ui-preview.mjs --pkg plugins/dsh-grilling-form \
  --entry src/client/GrillingForm.jsx --mount GrillingFormTail \
  --props tmp/ui-preview-props.mjs --shot tmp/form.png
```

props 走一个 `.mjs` 模块（default 导出那个对象）：组件的 props 常常带函数（取词、订阅、动作），
JSON 表达不了。产物落 `tmp/ui-preview/`，HTML 留着，想看交互就自己开。

两件它会替你做、但要知道为什么的事：

- **ui-primitives 用薄壳替身**（`tools/ui-preview/primitives.jsx`）。真包在自己 bundle 里塞了
  shiki、simple-icons、katex，本仓装不下来。替身只顶掉组件本身；样式取它安装副本里的真实 CSS，
  所以 markdown 段落间距、Tag、Button 的长相都是宿主那一份。**插件新引一个 ui-primitives 名字，
  就要在那个替身里补一个**，否则那一处是 `undefined`，React 只打一行 warning、预览页上静默少一块。
- **主题变量取宿主 checkout 里的真表**（`design-platform.css` 与 `gradient-shadow-text.css`，
  路径随 `DSH_SOURCE`）。所以深浅色、字号档位都跟着宿主走，不在这里另抄一份。

它验的是「这块界面长什么样」；布局在真实对话流里会不会被挤、滚动归属、遮挡，仍然要
`gui-shot` 在真实例上看。

**它会改真东西**：这个浏览器连的是正在服务的那个实例，`--click` 与 `--eval` 里的一次点击就是一次真实操作——点模型会换掉这个会话正在用的模型，点收藏会写进 localStorage。工具自己在进入交互前后各记一份会话状态（模型选择、两个存储键），两边不同就逐条打出「改动前 → 改动后」并以退出码 1 结束；确认这次就是要改状态才加 `--allow-mutation`。看到报警就照「改动前」那列改回去。

本机工具：`node tools/gui-shot.mjs --click 'button[aria-haspopup="menu"]' --shot tmp/ui.png`（已入库，索引见 `tools/README.md`）。它把跑着的 GUI 拉进无头浏览器：`--wait '<选择器>'` 轮询到插件挂上为止（插件是启动后台预热的，别用固定 sleep 赌）、`--eval` 带一段 JS 直接读 `getBoundingClientRect()` 回传（比截图更硬）、`--shot` 落一张图、页面报错用 `window.addEventListener('error', …)` 收（浏览器 console 在这一侧看不见）。想验「内容变高时会不会被裁」，往滚动容器里塞一个 `height: 2000px; flex: none` 的方块再看——`flex: none` 不能省，否则它自己会被压扁，量出来的是假的。其余非显然的常量与坑写在 `tools/gui-shot.mjs` 头部。

**等不到、点不到都是失败**：`--wait` 没等到选择器、`--click` 找不到元素、`--eval` 抛异常、页面报了错，都以退出码 1 结束并照样落图——图留着看清当时页面上有什么，但别把这一趟当成验过的证据。同一个参数写两次直接以退出码 2 结束。

**要拍某个会话的页面，用 `--session session-<id>`**：会话页没有 URL 路由，首页是「新会话草稿」，侧栏里那个会话还要先展开它所在的工作区组。这个参数把展开、点行、等 `aria-selected` 转 true 与输入框挂上一起做了。会话状态的前后快照也因此取自同一个会话的页面：草稿与各个会话各带自己的模型选择，在首页与会话之间比较会把模型标签的变化读成改动。

改完 `lib/` 想确认页面真的换上了新 bundle（「刷新即生效」的查法）见 [dev-copy.md](./dev-copy.md)「生效时机」。

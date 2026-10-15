# 插件界面（宿主的控件与样式）

插件界面这一支的细则；前门是 [plugins.md](./plugins.md)。自检能守住渲染树与 bundle，守不住布局与观感——这一页说的都是自检说不出口的事。

## 先挑宿主的现成控件，别自绘

宿主 checkout（路径见根 `AGENTS.md`）里有两份清单，动手前先读：

- `packages/client/ui-primitives/README.md` 的组件目录：**弹窗用 `Modal`**（居中、遮罩、Esc、点遮罩关闭、关闭按钮、`useModalLayer` 的顶层 Tab/Esc 归属与焦点回收都在它里面；打开后焦点落在关闭按钮上，想换成别的控件就给它 `data-modal-autofocus`，别用 React 的 `autoFocus`——那会让焦点回收失效），下拉用 `Menu` / `MenuSurface`，气泡用 `Tooltip`。本地化文案一律由调用方传：该包没有语言兜底，缺 label 直接类型报错。
- `docs/web-styling.md`：样式归属与组件规则（下面两条就是它的原文）。

自绘一个浮层，等于把上面那一串自己实现一遍、再逐个踩它们的坑。`plugins/dsh-a6api` 的侧边栏入口曾经就是自绘：自己算 `left / bottom / maxHeight`、自己监听 resize/scroll 重算、自己挂 Esc 与外部点击；换成 `Modal` 之后这些整套删掉（净减 160 行），插件只留下两个样式钩子。仓库里还留着的自绘件是判断题，不是可以照抄的样板。

## 两条样式规则

- **浮起来的面（弹窗、菜单、卡片、浮层按钮）写 `border: 0` + `box-shadow: var(--dsw-elevation-prominent | panel | soft)`**。中性描边那根 0.5px 发丝线是阴影的第一层替你画的，再自己写一根 `border: 1px solid var(--dsw-alias-border-*)` 就成了两条边叠着——`plugins/dsh-a6api` 删掉的那个自绘浮层正是这么写的（宿主 `docs/web-styling.md`「Component rules」明写这对搭配不允许）。
- **颜色只从 `var(--dsw-alias-*)` 取，不写死色值**：`#ffffff`、`rgba(0, 0, 0, 0.16)` 这类在换深浅主题时会露馅。`var(--dsw-alias-bg-layer-2, #ffffff)` 这种「兜底」同样不必写——宿主的主题层永远在，取不到的那天不会来，写了只让人以为它有用。

## 覆盖宿主控件的样式

插件 CSS 由 `injectStyles()` 在 `apply()` 时追加进 `<head>`，而宿主的样式表是页面加载时的 `<link>`——**同优先级下插件后写的规则生效**。所以放宽 `Modal` 的卡片宽度，只要给它一个自己的类：

```css
.dsh-a6-sidebar-modal { width: min(500px, 100%); max-height: min(85vh, 100%); }
```

两条注意：

- 只赢「同优先级」：宿主用元素选择器或更高优先级的地方，单类选择器赢不了。
- 宿主的内部类名是 CSS Modules 的哈希串（`_body_o6lrb_115`），别照抄。用它给的钩子（`className` / `contentClassName` / 组件自己的语义类）或结构选择器（如 `.dsh-a6-sidebar-modal-content > :last-child`——`Modal` 的正文行是 `.content` 的最后一个子元素，让它自己滚，标题栏就钉住了）。

## 看一眼界面

自检管不了布局：居中、高度上限、滚动归属、遮挡、`sticky` 都只有真浏览器能证明。改完界面真跑一次——`plugins/dsh-a6api` 的弹窗就是这么验的：居中误差 0px、高度正好视口 85%、正文滚 400px 后标题栏与胶囊行不动、页面零报错。

本机工具：`node tools/gui-shot.mjs --click 'button[aria-label="A6api"]' --shot tmp/ui.png`（已入库，索引见 `tools/README.md`）。它把跑着的 GUI 拉进无头浏览器：`--wait '<选择器>'` 轮询到插件挂上为止（插件是启动后台预热的，别用固定 sleep 赌）、`--eval` 带一段 JS 直接读 `getBoundingClientRect()` 回传（比截图更硬）、`--shot` 落一张图、页面报错用 `window.addEventListener('error', …)` 收（浏览器 console 在这一侧看不见）。想验「内容变高时会不会被裁」，往滚动容器里塞一个 `height: 2000px; flex: none` 的方块再看——`flex: none` 不能省，否则它自己会被压扁，量出来的是假的。其余非显然的常量与坑写在 `tools/gui-shot.mjs` 头部。

改完 `lib/` 想确认页面真的换上了新 bundle（「刷新即生效」的查法）见 [dev-copy.md](./dev-copy.md)「生效时机」。

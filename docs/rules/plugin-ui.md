# 插件界面（宿主的控件与样式）

插件界面这一支的细则；前门是 [plugins.md](./plugins.md)。自检能守住渲染树与 bundle，守不住布局与观感——这一页说的都是自检说不出口的事。

## 先挑宿主的现成控件，别自绘

宿主 checkout（路径见根 `AGENTS.md`）里有两份清单，动手前先读：

- `packages/client/ui-primitives/README.md` 的组件目录：**弹窗用 `Modal`**（居中、遮罩、Esc、点遮罩关闭、关闭按钮、`useModalLayer` 的顶层 Tab/Esc 归属与焦点回收都在它里面；打开后焦点落在关闭按钮上，想换成别的控件就给它 `data-modal-autofocus`，别用 React 的 `autoFocus`——那会让焦点回收失效），下拉用 `Menu` / `MenuSurface`，气泡用 `Tooltip`。本地化文案一律由调用方传：该包没有语言兜底，缺 label 直接类型报错。
- `docs/web-styling.md`：样式归属与组件规则（下面三条是它的原文加上本仓的取用口径）。

自绘一个浮层，等于把上面那一串自己实现一遍、再逐个踩它们的坑：位置与高度上限自己算，resize / scroll 各自重算，Esc 与外部点击各自挂一遍，还要处理和宿主其它浮层的遮挡与焦点。仓库里还留着的自绘件是判断题，不是可以照抄的样板。

## 三条样式规则

- **浮起来的面（弹窗、菜单、浮层、面板、浮层按钮、输入区）写 `border: 0` + `box-shadow: var(--dsw-elevation-prominent | panel | soft)`**。中性描边那根 0.5px 发丝线是阴影的第一层替你画的，再自己写一根 `border: 1px solid var(--dsw-alias-border-*)` 就成了两条边叠着（宿主 `docs/web-styling.md`「Component rules」明写这对搭配不允许）。卡片不在浮起面之列：它用 `--dsw-alias-settings-card-fill` 填充加 0.5px `--dsw-alias-settings-card-stroke` 描边分层，也不要给它加阴影来跟标签页区分（宿主 `docs/ui-radius.md`「Settings card materials」）。
- **颜色只从 `var(--dsw-alias-*)` 取，不写死色值**：`#ffffff`、`rgba(0, 0, 0, 0.16)` 这类在换深浅主题时会露馅。`var(--dsw-alias-bg-layer-2, #ffffff)` 这种「兜底」同样不必写——宿主的主题层永远在，取不到的那天不会来，写了只让人以为它有用。
- **圆角只取 `--dsw-radius-*` token；整圆与药丸必须同一条规则里配 `corner-shape: round`**。token 是 `--dsw-radius-xs/sm/md/lg/xl/panel`，值 4/8/12/16/20/28（宿主 `packages/client/ui-theme/src/styles/base.css`），按控件角色选，角色表见 `docs/ui-radius.md`；`10px`、`24px` 这类字面值换主题时不跟着走。`50%`、`100%`、`999px` 要配 `corner-shape: round`：主题的 superellipse 曲线伸到每个元素，不配就把圈与药丸揉成方圆形，而且只在支持 superellipse 的引擎上才看得见。宿主的两道 spec（`packages/client/ui-theme/tests/radius-styles.client.spec.ts`、`corner-shape-styles.client.spec.ts`）只扫 `packages/` 下的样式表，插件目录与插件里手写的 CSS 字符串不在扫描范围——违反不会变红，是静默的一类。

## 覆盖宿主控件的样式

宿主的样式表是页面加载时的 `<link>`，插件之后追加进 `<head>` 的 `<style>` **在同优先级下后者赢**。所以放宽 `Modal` 的卡片宽度，只要给它一个自己的类：

```css
.dsh-picker-dialog { width: min(680px, 100%); height: min(640px, 80vh); }
```

三条注意：

- 只赢「同优先级」：宿主用元素选择器或更高优先级的地方，单类选择器赢不了。
- 宿主的内部类名是 CSS Modules 的哈希串（`_body_o6lrb_115`），别照抄。用它给的钩子（`className` / `contentClassName` / 组件自己的语义类）或结构选择器（如 `.dsh-picker-content > :last-child`——`Modal` 的正文行是 `.content` 的最后一个子元素，让它自己滚，标题栏就钉住了）。
- **样式在 `apply()`（或模块工厂）里注入，标签写全两个归属键**：卸载与换代码时，client-modules 按 `style[data-plugin=<包名>]` 把标签全部删掉（宿主 `packages/client/modules/src/client/entry-lifecycle.ts` 的 `removeOwnedStyles`），归属键就是那条清除的唯一依据。所以标签写成 `<style data-plugin="<包名>" data-plugin-css="<包名>/<文件名>">`，用 `data-plugin-css` 查重做幂等。没打 `data-plugin` 的标签还有一次被认领的机会：物化这个包的工厂期间新冒出来的，会被自动打上包名（`system.ts` 的 `claimStyles`）；**渲染期**注入的标签已经错过这个窗口，没打键就永远归不了档，插件重载后旧表还叠在页面上。宿主自己的构建期注入器就按这个形状生成（宿主 `packages/client/tsdown.client.ts` 的 `styleInjectionModule`），本仓照做的是 `plugins/dsh-grilling-form/src/client/index.js` 的 `injectStyles()`。

反例是 `plugins/dsh-chat-translate/src/client/settings/ui.tsx`：`ensureSettingsStyles()` 在卡片组件体内（渲染期）才调用，标签只打了一个自定义属性 `data-tidy-settings`、没有 `data-plugin`，所以那份设置卡片样式不参与卸载清理。

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
  现有薄壳：`Button`、`Tag`、`Input`、`Switch`、`SegmentedTabs`、`Modal`、`CodeBlock`、`Menu`、
  `Tooltip`、`writeClipboard`、`MarkdownText` 与几个图标；新加一个时照它真组件的类名与 DOM 层数写
  （`Input` 的类名落在外面那层 `.wrap` 上，`Switch` 的外观键在 `aria-checked` 上），并在
  `ui-preview.mjs` 的 `hostSheets` 里补上那份 `.module.css`——替身只有类名，样式不会自己跟过来。
- **主题变量取宿主 checkout 里的真表**（`design-platform.css`、`gradient-shadow-text.css`、
  `base.css`、`corner-shape.css`、`focus.css`、`scrollbar.css`，路径随 `DSH_SOURCE`）。色板在
  `design-platform.css`，而圆角、字号与卡片材料那几组 `--dsw-*` 在 `base.css` 里——只取前者，
  预览图上所有圆角都会消失，看着像样式写坏了。所以深浅色、字号档位、圆角都跟着宿主走，
  不在这里另抄一份。
- **预览只画组件，不跑 `apply()`**：插件在 `apply()` 里注入的那份 `<style>`（见上文「样式在
  `apply()` 里注入」）不会出现在预览页上。预览图据此刻读结构，布局与观感仍要回真实例上看。

它验的是「这块界面长什么样」；布局在真实对话流里会不会被挤、滚动归属、遮挡，仍然要
`gui-shot` 在真实例上看。

**它会改真东西**：这个浏览器连的是正在服务的那个实例，`--click` 与 `--eval` 里的一次点击就是一次真实操作——点模型会换掉这个会话正在用的模型，点收藏会写进 localStorage。工具自己在进入交互前后各记一份会话状态（模型选择、两个存储键），两边不同就逐条打出「改动前 → 改动后」并以退出码 1 结束；确认这次就是要改状态才加 `--allow-mutation`。看到报警就照「改动前」那列改回去。

本机工具：`node tools/gui-shot.mjs --click 'button[aria-haspopup="menu"]' --shot tmp/ui.png`（已入库，索引见 `tools/README.md`）。它把跑着的 GUI 拉进无头浏览器：`--wait '<选择器>'` 轮询到插件挂上为止（插件是启动后台预热的，别用固定 sleep 赌）、`--eval` 带一段 JS 直接读 `getBoundingClientRect()` 回传（比截图更硬）、`--shot` 落一张图、页面报错用 `window.addEventListener('error', …)` 收（浏览器 console 在这一侧看不见）。想验「内容变高时会不会被裁」，往滚动容器里塞一个 `height: 2000px; flex: none` 的方块再看——`flex: none` 不能省，否则它自己会被压扁，量出来的是假的。其余非显然的常量与坑写在 `tools/gui-shot.mjs` 头部。

**等不到、点不到都是失败**：`--wait` 没等到选择器、`--click` 找不到元素、`--eval` 抛异常、页面报了错，都以退出码 1 结束并照样落图——图留着看清当时页面上有什么，但别把这一趟当成验过的证据。同一个参数写两次直接以退出码 2 结束。

**要拍某个会话的页面，用 `--session session-<id>`**：会话页没有 URL 路由，首页是「新会话草稿」，侧栏里那个会话还要先展开它所在的工作区组。这个参数把展开、点行、等 `aria-selected` 转 true 与输入框挂上一起做了。会话状态的前后快照也因此取自同一个会话的页面：草稿与各个会话各带自己的模型选择，在首页与会话之间比较会把模型标签的变化读成改动。

改完 `lib/` 想确认页面真的换上了新 bundle（「刷新即生效」的查法）见 [dev-copy.md](./dev-copy.md)「生效时机」。

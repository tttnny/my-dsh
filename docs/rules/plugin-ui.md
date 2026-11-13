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

验 DSH 的界面一律走浏览器这一侧（`tools/gui-shot.mjs`，或用 `ego-browser`），不要用 kimi-cu 的桌面点击与截图代劳：cu 驱动的是本机窗口像素，读不到 DOM 与几何，界面状态也容易和页面里的实际渲染对不上。

### 用 gui-shot 验真实例

**gui-shot 的交互会修改真实会话**：它连接正在服务的实例，`--click` 与 `--eval` 里的一次点击就是一次真实操作——点模型会换掉会话使用的模型，点收藏会写入 localStorage。工具在交互前后各记一份会话状态（模型选择、两个存储键），不同就逐条打出「改动前 → 改动后」并以退出码 1 结束；确认这次要改状态才加 `--allow-mutation`。看到报警就按「改动前」恢复。

调用示例与参数索引见 [tools/README.md](../../tools/README.md)。`--wait '<选择器>'` 轮询到插件挂载，`--eval` 可读取 `getBoundingClientRect()`，`--shot` 保存截图；页面报错由 `window.addEventListener('error', …)` 收集。验证内容增高后是否被裁时，在滚动容器里加入 `height: 2000px; flex: none` 的方块；保留 `flex: none` 才不会让方块被压缩。其余参数与常量见 [gui-shot.mjs](../../tools/gui-shot.mjs) 头部。

**等待、点击或求值失败都不算通过**：`--wait` 超时、`--click` 找不到元素、`--eval` 抛错或页面报错，工具以退出码 1 结束并保存截图；同一个参数重复传入时以 2 退出。

**拍指定会话用 `--session session-<id>`**：会话页没有 URL 路由，参数会展开工作区组、点击会话、等待 `aria-selected` 为 true 和输入框挂载。交互前后的状态快照必须取自同一个会话；草稿页与会话各自保存模型选择，跨页面比较会误判为状态改动。

## 换用 ego-browser 的条件

上面这些量几何、拍图的活，默认走 `tools/gui-shot.mjs`。换 `ego-browser` 只有三条：用户明确要求用它；要复现的现象只在**用户日常在用的那个浏览器**上出现（`gui-shot` 起的是 Playwright 缓存里的 Chrome for Testing，查不到 Safari 与旧版 Chromium 的差异）；要按**用户已登录的站点**走一遍真实流程（`gui-shot` 每趟清掉自己那个临时用户目录，没有可复用的登录态）。

换过去之后，这一页的硬要求一条不减：进交互面之前先记一份会话状态、退出时再记一份，两边不同就照「改动前」那列改回去——会话页的模型选择、收藏这类存储键不归 ego 管，`gui-shot` 的那个护栏在这里只能靠人看着。量出来的数、拍下来的图照样要回答这一页要求的那几件事，截图不是证据。

判断标准与原理不在这里另抄一份：逐插件的浏览器判据在 `plugin-fleet-sweep` 技能，驱动浏览器取证的完整做法（会话 cookie、收敛的插桩日志、三条断言同时成立、引擎版本对照）在 `plugin-runtime-debug/references/browser-forensics.md`。`ego-browser` 的用法指南由它自己给出：先跑 `ego-browser skill` 读安装版本对应的那一份，升级之后再跑一次。

## 只想看一个组件的长相

`node tools/ui-preview.mjs` 把插件自己的组件打进独立页面拍图，不连接正在服务的实例，不改会话状态：

```bash
node tools/ui-preview.mjs --pkg plugins/dsh-grilling-form \
  --entry src/client/GrillingForm.jsx --mount GrillingFormTail \
  --props tmp/ui-preview-props.mjs --shot tmp/form.png
```

`--props` 收 JSON 或 default 导出 props 对象的 `.mjs`；对象含取词、订阅、动作等函数时用后者。产物落 `tmp/ui-preview/`，保留的 HTML 可单独打开交互。

预览有三条边界：

- **ui-primitives 使用替身组件**，样式取安装副本的真实 CSS。替身导出面见 [primitives.jsx](../../tools/ui-preview/primitives.jsx)。插件新引一个控件时，在替身中补齐导出，按真组件的类名、DOM 层级与状态属性实现，并在 [ui-preview.mjs](../../tools/ui-preview.mjs) 的 `hostSheets` 中补对应样式表。
- **主题变量取宿主 checkout**，路径随 `DSH_SOURCE`；实际样式清单以 `hostSheets` 为准。维护清单时同时保留色板、圆角、字号、卡片材料等变量，不能只取色板。
- **预览只渲染组件，不运行 `apply()`**，其中注入的样式不会出现。布局在真实对话流中是否受挤压、滚动归属与遮挡，仍按「看一眼界面」用真实例验证。

改完 `lib/` 想确认页面真的换上了新 bundle，见 [dev-copy.md](./dev-copy.md)「生效时机」。

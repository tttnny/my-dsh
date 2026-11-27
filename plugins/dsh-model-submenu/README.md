# @lynn123411/dsh-model-submenu

输入框模型菜单的两处增强：第一行「模型」直接打开列出所有供应商模型的弹窗，第二行「推理等级」变成一条可拖动的滑块。

## 概述

- **第一行就是入口**：菜单里的「模型」点下去直接打开弹窗。当前模型还未选定或已不在目录中时，输入框工具栏会显示「浏览模型」，也能打开同一个弹窗。顶部搜索框同时搜模型名与供应商名，每个有模型的供应商一个标签页。
- **第二行是滑块**：推理等级不再下钻到档位列表，拖动时旋钮跟着指针走、松手吸附到最近一档并切换，键盘左右键逐档调整；轨道上的刻度点数就是该模型可选的档位数，旋钮比轨道大一圈。
- **档位有颜色**：Off 是灰色，往上从蓝走到紫，只有最高档的填充是渐变；输入框触发器上的档位文字跟着同一套颜色走。
- **默认档位是一个状态**：点最左边的「推理等级」四个字切回 provider default——轨道空着、旋钮是空心环，不会被误认成最低档；再拖一下滑块就回到明确档位。
- **收藏靠前**：每行右侧一个星标，点它只切换收藏、不切换模型；收藏表存在浏览器本地，整台浏览器共用一张，收藏的模型排在列表前面。
- **记住每个模型的思考等级**：在弹窗里选中某个模型时，恢复这台浏览器上次为它选的思考等级；该模型不提供那一档时退回它的默认档。
- **元信息一行说清**：模型名下面一行写供应商、上下文窗口、是否支持思考、是否支持图片输入。
- **失败与加载都有交代**：加载中一行文字、加载失败一行文字带「重新加载」、提交被拒弹出提示气泡并留在弹窗里，好让用户换一个。

## 安装与开关

```bash
dsh plugin --profile web add @lynn123411/dsh-model-submenu
```

这条命令把包名写进 profile 的 `dependencies`，并登记进 `dsh.profile.bundles`；包内 `cordis.patch.yml` 随之插入一条根层行（`id: lynn-model-submenu`），这一行同时承载两个半边。行不写 `config`——写了当场抛，免得拼错的行静默什么都不注册。

开关在插件页「已安装插件」里本插件那一行。关掉之后会移除插件样式和「浏览模型」按钮，恢复宿主原有的模型菜单和推理档位列表。

## 配置

本插件没有可调字段，插件页上没有配置卡。它自己的状态存在浏览器本地，整台浏览器共用：

| 键 | 内容 |
| --- | --- |
| `dsh-model-submenu.favorites` | 收藏的模型（供应商 id + 模型 id 的列表），收藏的排在列表前面 |
| `dsh-model-submenu.efforts` | 每个模型上次选的思考等级，按供应商 id + 模型 id 记 |

两个键都按「读不出来就当空表」处理：隐私模式下属性读取会抛、手改坏的值解析不了，都退回空表而不是让菜单坏掉。

## 实现

### 装配

宿主渲染模型菜单是 `{open && createPortal(...)}`：菜单一关，整棵子树卸载。模型菜单、工具栏入口和弹窗共用一个 store，传递要为哪个会话打开弹窗。

| 贡献 | 槽位 | 职责 |
| --- | --- | --- |
| `ModelMenuBridge` | `conversation.input.model.options`（list，`id: model-menu-bridge`） | 渲染一个隐藏标记；在根菜单打开期间于菜单面板上装捕获阶段的点击监听：命中第一格就拦下、调宿主的 `dismiss()`、写 store；命中第二格就拦下下钻——点标签切回 provider default，点别处把焦点交给滑块；同时把 `EffortSlider` 挂进第二格 |
| `ModelPickerHost` | `conversation.input.overlay`（list，`id: model-picker`） | 常驻；store 指向本会话时渲染弹窗、收藏、思考等级记忆与提交 |
| `ModelPickerFallback` | `conversation.input.right`（list，`id: model-picker-fallback`） | 当前模型未选定或不在目录时显示「浏览模型」。此时宿主触发按钮会直接进入原生模型列表，跳过根菜单与 options 槽。 |
| `EffortTint` | `conversation.input.overlay`（list，`id: model-effort-tint`） | 常驻；把输入框触发器上的档位文字染成当前档位的颜色。它必须常驻，因为那处文字在菜单之外 |

`picker-state.ts` 的 store 只有 `open` / `close` / `getSnapshot` / `subscribe` 四个动作，重复 open 同一会话不重复通知。这一形态与宿主自己的 `ui-commands`（`PopupSelectController` + `PopupSelectView`）一致。CSS Modules 构建时导出类名和样式文本，客户端启用时插入样式表。停用时由 Cordis effect 清理这次启用创建的样式节点。

客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-model-selection`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-slots`。少声明一个不会报错，只会让插件在页面里消失。

客户端半边读的 cordis 服务（源码 `src/client/index.ts` 的 `inject`）与上面是两层声明，缺一层整条 loader entry 静默变 failed：`configForms` 提供设置页那份共享缓存，`remote` 与 `remote.llm` 回答每个供应商的设置在哪个命名空间，`remote.session` 与 `modelDirectories` 供模型目录，`sessions` 判断子代理会话，`slots` 与 `locale` 各自是本插件的贡献与文案。

### 为什么是改道，不是接管座位

根菜单的前两格（模型、推理等级）由宿主 `ui-model-selection` 的 `ModelSelect` 自己画，点击写死在组件里，槽位没有给这两格留注入点。要改这两格，只有两条路，而其中一条走不通：

- **接管 `conversation.input.model`**：`renderSlot` 的授权按注册项发放（`entry.children`），而 `conversation.input.model.options` 这个子槽已经被宿主的注册声明，再声明一次当场抛 `already declared`。所以一旦以 `priority: -100` 盖住宿主座位，本插件拿不到 `renderSlot`，`ui-agent-team` 的团队协作开关整行消失。
- **改道这两格**：不动座位，只在根菜单打开期间（这条贡献的挂载期）于菜单面板 `[data-model-menu][role="menu"]` 上装捕获阶段的监听，认面板的直接 `role="menuitem"` 子元素为宿主的两格。捕获阶段拦在面板上，事件到不了 React 根容器的冒泡监听，宿主写死的下钻不会执行。

这条路的代价是依赖宿主根菜单的 DOM 形状，所以认不出来时**什么都不做**：点击退回宿主原来的下钻，插件其余部分照常工作。

### 推理等级那一行的 DOM 契约

滑块要嵌进宿主自己画的那一行，所以这一行有这几处约定：

| 认什么 | 怎么认 |
| --- | --- |
| 菜单面板 | 标记 span 的 `closest('[data-model-menu][role="menu"]')` |
| 两格 | `panel.querySelectorAll(':scope > button[role="menuitem"]')`：`[0]` 模型格、`[1]` 推理等级格。只处理同时具有标签、数值和箭头的按钮。槽位输出在各自的 `[data-slot]` 包裹层里，别的插件往 options 槽加行不会混进这个列表 |
| 标签 | `span[class*='cellLabel']`（哈希前缀随构建变，局部名不变） |
| 档位文字 | `span[class*='cellValue']` |
| 箭头 | `svg[class*='cellChevron']` |
| 触发器上的档位文字 | 从 `closest('[data-composer-card]')` 往下找 `[data-slot="conversation.input.model"] button[aria-haspopup="menu"] span[class*="triggerEffort"]` |

挂上滑块时对宿主那一行做三处内联样式改动，改前存原值、卸载时写回：

| 节点 | 改动 | 效果 |
| --- | --- | --- |
| `cellValue` | `display: none` | 档位文字在输入框下面已经有一份，这一行不再重复 |
| `cellChevron` | `display: none` | 去掉已经不存在下钻的箭头 |
| 滑块根节点 | `flex: 1 1 auto`、`min-width: 96px` | 落在标签右边，铺满整条空档 |

模型只声明一档（或没有档位）时整条链不启用，宿主那一行原样保留。滑块本身是 `role="slider"` 的独立焦点节点，键盘左右/上下/Home/End 逐档调整；它与宿主那一行同排，因此技术上属于 `<button role="menuitem">` 里的交互子元素——宿主没给这一行留注入点，同线插件 `Microqian2th/dsh-codex-effort-slider` 也采用同一形态。

### 滑块的三种状态

| 状态 | 轨道 | 旋钮 |
| --- | --- | --- |
| Off | 空——填充只有旋钮那么大，完全藏在旋钮底下 | 实心白 |
| 中间档 | 该档的纯色，右端圆弧落在旋钮底下 | 实心白 |
| 最高档 | 整条蓝→紫渐变，铺到轨道尽头 | 实心白 |
| provider default | 空 | 空心环，停在模型声明的默认档（没声明就停最左） |
| 拖动中 | 跟着指针连续移动 | 实心白，松手吸附到最近一档并提交 |

轨道高 16px、旋钮直径 20px：旋钮比轨道大一圈，两端因此露出轨道自己的圆角，旋钮不会被误读成轨道的端帽。填充是「轨道形状裁到旋钮」——右端圆弧取轨道的半径、圆心落在旋钮底下，所以色块是钻进旋钮而不是在它旁边直切一刀；最高档的填充宽度正好铺满整条轨道。

拖动时旋钮跟的是指针的连续位置（`fractionAt`），不是一档一格：档位取离指针最近的那个刻度（`detentAt`），所以旋钮在两档之间也能停在任意位置，只有跨过中点才换档。松手时旋钮用 160ms 的缓出滑到那个刻度上再提交；拖动期间这条过渡关掉（`data-dragging`），否则旋钮会落后于指针。`prefers-reduced-motion` 下过渡一律关掉。

provider default 不是档位：`effortChoices` 只返回模型声明的真实等级，默认态由 `state.current.reasoningEffort === undefined` 判定，点标签提交 `reasoningEffort: undefined` 切回去。颜色由 `level-color.ts` 的 `levelColor(index, count)` 给出：`0` 是中性灰，其余档位把「Off 以上」均匀铺在蓝→紫的斜坡上，最高档固定取紫端并用整条渐变填充。

### 元信息只写有把握的

上下文窗口与图片输入读宿主设置页那份共享缓存（`ctx.configForms.describe()`）：上下文窗口只认模型自己声明的值，图片输入在模型没写时按该供应商的默认模态判断；判不出来的与明确不支持的都整段略去，既不写「未知」也不写「不支持」。工具调用在宿主里没有对应字段，一律不写。

## 模型体验

本插件不改工具面、不注入提示：模型看到的工具清单与会话上下文与不装它时一样，变的只是会话当前用的模型与推理等级。

用户选中的东西经宿主 `select` 提交：点模型立即提交并关闭弹窗；点当前正在用的模型不提交；滑块松手或键盘换档时提交一次，被拒时通过菜单宿主的 `reportFailure` 报一次并留在原处。

## 限制

- **依赖宿主根菜单的 DOM 形状**：认不出面板或两格时什么都不做，菜单退回宿主原来的下钻。
- **模型只声明一档时不挂滑块**：那一行原样保留，没有可拖的东西。
- **滑块是 `<button role="menuitem">` 里的交互子元素**：宿主没给这一行留注入点，形态与同线插件一致。
- **收藏与思考等级只存在这台浏览器**：换浏览器或清掉站点数据就没了。
- **元信息判不出来的整段略去**：上下文窗口、图片输入、工具调用都可能不出现。
- **子代理会话不可选时整块不渲染**：弹窗只对可选会话出现。

## 验证

```sh
cd plugins/dsh-model-submenu && pnpm check
```

`check` = `typecheck` + `build`（tsdown）+ `smoke` + `test` + `assert:lib-untracked`。

- `smoke-client.mjs`：按 Web shell 的方式装载构建产物 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务，断言导出身份、`inject` 表逐字相等、四处贡献的 list `id`、三个弹窗相关贡献共用同一个 store、着色读同一个目录、产物里走的是共享的 `Modal`、产物里带着认宿主菜单面板与两格的四段选择器、滑块以 `role="slider"` 暴露给辅助技术、字典键集中英对齐，以及 store 自身的契约（起始关闭、open 发布目标、重复 open 不通知、close 清空、退订后静默）。
- `test-favorites.mjs`：收藏表的键名、读写、坏值降级、跨供应商靠前排序。
- `test-facts.mjs`：设置值到上下文窗口与图片输入的映射、两类适配器的字段差异、缺字段整段略去。
- `test-commit.mjs`：点模型立即提交、已选中的模型不重复提交、记住的档位不在可选档里时不强塞。
- `test-rows.mjs`：目录拍平、标签页派生、搜索的两把钥匙。
- `test-effort-memory.mjs`：按模型记档位，切走再切回来恢复的是这个模型自己的那一档。
- `test-slider.mjs`：滑块几何与配色——档位到轨道比例、拖动位置是连续比例而不是逐档跳、比例换回最近一档且跨过中点才变、指针到最近档、两端夹取、单档与零宽轨道的退路、填充圆弧始终藏在旋钮底下且末档铺满轨道、Off 的中性灰、蓝到紫的两端、只有最高档用渐变。
- `test-render.mjs`：用真 react 把菜单桥、触发器着色与弹窗画进 jsdom，锁住「点宿主第一格 → 关菜单 → store → 弹窗」这条链、宿主那两格的下钻确实没执行、点标签切回默认、刻度数与旋钮位置、数值与箭头隐藏、三种配色、触发器档位文字跟着变色、默认态空轨道与空心旋钮、拖动松手才提交一次、被拒走宿主提示、单档与无档位不挂滑块、卸载后样式写回，以及弹窗侧的收藏置顶、星标独立、提交与拒绝、思考等级记忆、加载与失败、会话不可选时整块不渲染。另验证当前模型缺失时工具栏能打开同一个弹窗，客户端停用时仅清理该次启用插入的样式。
- `assert:lib-untracked`：`lib/` 是构建产物镜像，不入 git。

在浏览器打开输入框的模型菜单。第一行点下去应直接弹出跨供应商弹窗（顶部搜索框、供应商标签页、每行右侧星标）；第二行应是滑块，轨道上的刻度点数等于该模型的档位数，拖到最右应变成蓝→紫渐变、触发器上的档位文字同步变色；点「推理等级」四个字应切回 provider default（空轨道、空心旋钮）。当前模型缺失时，点输入框工具栏的「浏览模型」应打开同一个弹窗。

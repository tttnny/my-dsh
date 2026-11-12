# @lynn123411/dsh-model-submenu 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、开发副本与验证。

## 装配形态

装进 profile 一条命令即可，profile 侧不用手写任何补丁：

```bash
dsh plugin --profile web add @lynn123411/dsh-model-submenu
```

这条命令把包名写进 profile 的 `dependencies`，并登记进 `dsh.profile.bundles`；包内 `cordis.patch.yml` 随之插入一条根层行：

```yaml
- insert:
    - id: lynn-model-submenu
      name: '@lynn123411/dsh-model-submenu'
```

这条行同时承载两个半边：宿主半边在那条行下注册插件本体，浏览器半边由 Web shell 按 root loader 的 enabled entry 依据 `dsh.client` 声明服务 `lib/client.js`。行不写 `config`——写了当场抛，免得拼错的行静默什么都不注册。

客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-model-selection`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-slots`。少声明一个不会报错，只会让插件在页面里消失。

客户端半边读的 cordis 服务（源码 `src/client/index.ts` 的 `inject`）与上表是两层声明，缺一层整条 loader entry 静默变 failed：`configForms` 提供设置页那份共享缓存，`remote` 与 `remote.llm` 回答每个供应商的设置在哪个命名空间，`remote.session` 与 `modelDirectories` 供模型目录，`sessions` 判断子代理会话，`slots` 与 `locale` 各自是本插件的贡献与文案。

## 两处贡献与一个 store

宿主渲染模型菜单是 `{open && createPortal(...)}`：菜单一关，整棵子树卸载。所以本插件拆成两处贡献，中间用一个插件自己的 store 传递「哪个会话要开弹窗」：

| 贡献 | 槽位 | 职责 |
| --- | --- | --- |
| `ModelCellRedirect` | `conversation.input.model.options`（list，`id: model-cell-redirect`） | 渲染一个隐藏标记，并在根菜单打开期间于菜单面板上装捕获阶段的点击监听：命中第一格就拦下、调宿主的 `dismiss()`、写 store |
| `ModelPickerHost` | `conversation.input.overlay`（list，`id: model-picker`） | 常驻；store 指向本会话时渲染弹窗、收藏、思考等级记忆与提交 |

`picker-state.ts` 的 store 只有 `open` / `close` / `getSnapshot` / `subscribe` 四个动作，重复 open 同一会话不重复通知。这一形态与宿主自己的 `ui-commands`（`PopupSelectController` + `PopupSelectView`）一致。

## 为什么是改道，不是接管座位

根菜单的前两格（模型、推理等级）由宿主 `ui-model-selection` 的 `ModelSelect` 自己画，点击写死在组件里，槽位没有给这两格留注入点。要让第一格开弹窗，只有两条路，而其中一条走不通：

- **接管 `conversation.input.model`**：`renderSlot` 的授权按注册项发放（`entry.children`），而 `conversation.input.model.options` 这个子槽已经被宿主的注册声明，再声明一次当场抛 `already declared`。所以一旦以 `priority: -100` 盖住宿主座位，本插件拿不到 `renderSlot`，`ui-agent-team` 的团队协作开关整行消失。
- **改道第一格的点击**：不动座位，只在根菜单打开期间（这条贡献的挂载期）于菜单面板 `[data-menu-material]` 上装捕获阶段的监听，认面板的第一个 `role="menuitem"` 子元素为宿主的第一格。捕获阶段拦在面板上，事件到不了 React 根容器的冒泡监听，宿主写死的下钻不会执行。

这条路的代价是依赖宿主根菜单的 DOM 形状，所以认不出来时**什么都不做**：点击退回宿主原来的下钻，插件其余部分照常工作。宿主升版后按 `docs/rules/kernel-upgrade.md` 的顺序复核这一条契约。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-model-submenu" --offline
cd <my-dsh 绝对路径>/plugins/dsh-model-submenu && pnpm install && pnpm build
```

客户端半边改完刷新页面即生效，必要时硬刷新一次；宿主半边改完要触发一次 profile 重新组合——在插件页或 `plugin_manager` 里把本插件关一次再开一次，不必重启进程。

## 验证

在包目录跑一条链：

```bash
cd plugins/dsh-model-submenu && pnpm check
```

`check` = `typecheck` + `build`（tsdown）+ `smoke` + `test` + `assert:lib-untracked`。

- `scripts/smoke-client.mjs` 按 Web shell 的方式装载构建产物 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务，断言导出身份、`inject` 表逐字相等、两处贡献各自的 list `id`（`model-cell-redirect` 与 `model-picker`）、改道那条不带自己的文案、两处共用同一个 store、产物里走的是共享的 `Modal`、产物里带着认宿主菜单面板（`data-menu-material`）与第一格（`:scope > button[role=`）的两段选择器、字典键集中英对齐且不再有菜单行文案、元信息取数确实问过设置镜像与供应商目录，以及「设置没答案时答未知而不猜」。末尾 7 条是 store 自身的契约：起始关闭、open 发布目标、重复 open 不通知、第二次 open 替换目标、close 清空、退订后静默。
- `scripts/test-favorites.mjs`：收藏表的键名、读写、坏值降级、跨供应商靠前排序。`scripts/test-facts.mjs`：设置值到上下文窗口与图片输入的映射、两类适配器的字段差异、缺字段整段略去。`scripts/test-commit.mjs`：点模型立即提交、已选中的模型不重复提交、记住的档位不在可选档里时不强塞。`scripts/test-rows.mjs`：目录拍平、标签页派生、搜索的两把钥匙。`scripts/test-render.mjs`：用真 react 把改道与弹窗画进 jsdom，22 条用例锁住「点宿主第一格 → 关菜单 → store → 弹窗」这条链、宿主自己那格的下钻确实没执行、第二格与非菜单项一概不动、收藏置顶、星标独立、提交与拒绝、思考等级记忆、加载与失败、会话不可选时整块不渲染。
- `lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-model-submenu --needle '<你新写的类名或文案>'`。

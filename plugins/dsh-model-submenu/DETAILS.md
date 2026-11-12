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
| `ModelOptionsRow` | `conversation.input.model.options`（list，`id: all-providers`） | 画菜单底部那一行；点击先调宿主的 `dismiss()`，再写 store |
| `ModelPickerHost` | `conversation.input.overlay`（list，`id: model-picker`） | 常驻；store 指向本会话时渲染弹窗、收藏、思考等级记忆与提交 |

`picker-state.ts` 的 store 只有 `open` / `close` / `getSnapshot` / `subscribe` 四个动作，重复 open 同一会话不重复通知。这一形态与宿主自己的 `ui-commands`（`PopupSelectController` + `PopupSelectView`）一致。

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

- `scripts/smoke-client.mjs` 按 Web shell 的方式装载构建产物 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务，断言导出身份、`inject` 表逐字相等、两处贡献各自的 list `id`、两处共用同一个 store、产物里走的是共享的 `Modal` 且不再出现已删除的 `useAnchoredPosition`、字典键集中英对齐、元信息取数确实问过设置镜像与供应商目录，以及「设置没答案时答未知而不猜」。末尾 7 条是 store 自身的契约：起始关闭、open 发布目标、重复 open 不通知、第二次 open 替换目标、close 清空、退订后静默。
- `scripts/test-favorites.mjs`：收藏表的键名、读写、坏值降级、跨供应商靠前排序。`scripts/test-facts.mjs`：设置值到上下文窗口与图片输入的映射、两类适配器的字段差异、缺字段整段略去。`scripts/test-commit.mjs`：点模型立即提交、已选中的模型不重复提交、记住的档位不在可选档里时不强塞。`scripts/test-rows.mjs`：目录拍平、标签页派生、搜索的两把钥匙。`scripts/test-render.mjs`：用真 react 把那一行与弹窗画进 jsdom，19 条用例锁住行→store→弹窗这条链、收藏置顶、星标独立、提交与拒绝、思考等级记忆、加载与失败、会话不可选时整块不渲染。
- `lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-model-submenu --needle '<你新写的类名或文案>'`。

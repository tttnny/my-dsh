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

客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-model-selection`、`@deepseek-ai/dsh-client-ui-settings`。少声明一个不会报错，只会让插件在页面里消失。

客户端半边读的 cordis 服务（源码 `src/client/index.ts` 的 `inject`）与上表是两层声明，缺一层整条 loader entry 静默变 failed：`configForms` 提供设置页那份共享缓存，`remote.llm` 回答每个供应商的设置在哪个命名空间，`remote.session` 与 `modelDirectories` 供模型目录，`sessions` 判断子代理会话，`slots` 与 `locale` 各自是本插件的座位与文案。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-model-submenu" --offline
cd <my-dsh 绝对路径>/plugins/dsh-model-submenu && pnpm install && pnpm build
```

客户端半边改完刷新页面即生效，必要时硬刷新一次；宿主半边要重启 DSH 实例（loader 只在启动时装载）。

## 验证

在包目录跑一条链：

```bash
cd plugins/dsh-model-submenu && pnpm check
```

`check` = `typecheck` + `build`（tsdown）+ `smoke` + `test` + `assert:lib-untracked`。

- `scripts/smoke-client.mjs` 按 Web shell 的方式装载构建产物 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务，断言导出身份、`inject` 表逐字相等、产物里走的是共享的 `MenuSurface` 与 `Modal`、以 `priority: -100` 接管 `conversation.input.model` 座位、字典键集中英对齐、元信息取数确实问过设置镜像与供应商目录，以及「设置没答案时答未知而不猜」。末尾那段用真 `SlotCore` 钉住宿主的子座位契约，测的是宿主行为。
- `scripts/test-favorites.mjs`：收藏表的键名、读写、坏值降级、跨供应商靠前排序。`scripts/test-facts.mjs`：设置值到上下文窗口与图片输入的映射、两类适配器的字段差异、缺字段整段略去。`scripts/test-commit.mjs`：点模型立即提交、思考等级关菜单才提交、已选中的模型不重复提交。`scripts/test-rows.mjs`：目录拍平、标签页派生、搜索的两把钥匙。`scripts/test-render.mjs`：用真 react 把菜单与弹窗画进 jsdom，锁住点模型立即提交、思考等级关菜单才提交、收藏靠前、星标不可点只做标记、加载与失败各占一行、写入失败留在菜单或弹窗。
- `lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-model-submenu --needle '<你新写的类名或文案>'`。

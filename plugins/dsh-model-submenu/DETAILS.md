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

客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-model-selection`。少声明一个不会报错，只会让插件在页面里消失。

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

`check` = `typecheck` + `build`（tsdown）+ `smoke` + `assert:lib-untracked`。`scripts/smoke-client.mjs` 按 Web shell 的方式装载构建产物 `lib/client.js`（`window.__ModuleLoader__.load` 桩件），喂假 cordis 服务，断言导出身份、`inject` 表、以 `priority: -100` 接管 `conversation.input.model` 座位，以及各供应商与模型的注册项齐全；`lib/` 是构建镜像，`assert:lib-untracked` 判它没被 git 跟踪。

要肉眼确认页面上的形态，用仓库的 `node tools/verify-client.mjs dsh-model-submenu --needle '<你新写的类名或文案>'`。

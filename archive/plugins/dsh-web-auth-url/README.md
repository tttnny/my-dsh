# @lynn123411/dsh-web-auth-url

DSH Web GUI 的登录补位：给模型一个 `web_gui_login` 工具，一次调用就拿到本进程带 launch token 的 GUI 地址。`dsh-web-app` 有意只把干净地址交给模型（`app:web-surface` 段落）和 shell（`DSH_WEB_URL`），带 token 的地址只打印到 stdout——没有已有有效 cookie、且只使用干净 URL 的新客户端（模型自测这个 GUI：抓页面、探路由、确认客户端插件有没有生效）会收到 401。本插件把这半补上。

## 概述

- **一次调用拿到登录地址**：`web_gui_login` 即时解析本进程的带 token 地址（`http://127.0.0.1:<端口>/?token=…`），原样交给模型。
- **地址拿来就能登录**：`render` 先给出由调用者在项目 `./tmp` 下选定的 cookie jar 路径，再给出两条命令——第一条用这个地址把会话 cookie 换进 jar，第二条用 jar 访问 `$DSH_WEB_URL`。
- **跟随 token 轮换**：每次调用都重新向 `connection` 取一次，不缓存；DSH 重启换了 token，重调一次就是新地址。
- **同时托管 `DSH_WEB_AUTH_URL`**：每次 shell 调用即时解析的同一条地址，与工具结果逐字相同，供仓库里的 `tools/gui-shot.mjs` 与 `tools/verify-client.mjs` 驱动浏览器与校验产物。
- **只在 Web 部署里出现**：CLI、TUI 或缺少 `connection` 的组合里，工具与变量都不出现。

## 安装与开关

```bash
dsh plugin --profile web add @lynn123411/dsh-web-auth-url
```

命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条宿主半边行：

```yaml
- insert:
    - id: dsh-web-auth-url
      name: '@lynn123411/dsh-web-auth-url'
```

本插件没有客户端半边，也没有要覆盖的内核行，所以这一条行只注册宿主本体。

宿主半边的硬依赖是 `tools`、`connection`、`webServer`：三者缺一整条插件不激活。这也是为什么「非 Web 部署」不是一个要处理的错误路径——它根本不会装载。

没有按会话或按功能的开关：Web 部署装载了这一行，工具与变量就在；要停用它从 profile 移除这个包。

## 配置

插件不导出 `Config`：用法全部写在工具描述里，没有可调的档位。这与内核「工具语义归工具描述、段落只放跨调用习惯」的归属规则一致——本插件没有描述之外的习惯要交代，于是不占段落。

工具的参数面为空（取地址不需要模型给任何东西），输出面只有一个字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | 字符串 | 本进程的带 token 根地址，与 `DSH_WEB_AUTH_URL` 逐字相同。 |

登录地址靠工具被发现：模型看到 `web_gui_login` 才知道该登录，而不是被系统提示词提前告知。

## 实现

### 装配

`cordis.patch.yml` 只 insert 一条宿主半边行，`inject` 声明 `tools`、`connection`、`webServer`。导出面只有 `apply` / `inject` / `name`，没有配置面，也没有预留工具函数。

`apply` 做两件事：把登录工具注册进 `ctx.tools`；在 `shellEnv` 就绪时注册一个环境变量贡献者。

### 登录流程

工具只做一件事：解析地址并把地址交出去。

1. 取对外公布的那个根（`webApp.getAdvertisedUrl()`，没有该服务时用 `webServer.getOrigin()`），交 `connection.authenticatedUrl()` 加本进程的 launch token。
2. 返回 `{ url }`，`render` 先给出由调用者在项目 `./tmp` 下选定的 cookie jar 路径，再给出两条命令：`curl -s -c "$JAR" -o /dev/null "<url>"` 换 cookie，`curl -s -b "$JAR" "$DSH_WEB_URL/"` 之后走干净地址。

token 只对 `GET /` 有效：`connection` 的 `authorizeIndex` 只在这一个请求上换 cookie 并回 303，其余路径带 token 一律 401。所以模型必须先用这条地址换一次 cookie，之后的请求带 cookie、不带 token。

发布根与监听根可能不同（配了 `--public-url` 时），工具给出的地址与 `DSH_WEB_URL` 是同一个根。cookie 由发请求的那个 authority 铸出，模型照 `render` 里的命令在同一个根上换 cookie、发后续请求，两者才落进同一份 cookie。

### `DSH_WEB_AUTH_URL`

托管给 shell 的同一条带 token 地址，每次 shell 调用即时解析，与工具结果逐字相同。它的消费方是仓库里的 [`tools/gui-shot.mjs`](../../tools/gui-shot.mjs) 与 [`tools/verify-client.mjs`](../../tools/verify-client.mjs)：两条工具拿它换 cookie 再驱动浏览器。变量描述把模型指向 `web_gui_login`。

### 失败模式

| 情况 | 行为 |
| --- | --- |
| 监听器未 bind | 抛 `WEB_GUI_LOGIN_NOT_READY`，说明等实例服务后重调 |
| DSH 重启 | token 换了一把，重调 `web_gui_login` 拿新地址；旧 cookie 仍在有效期内时继续可用 |
| HTTPS 监听器 + 自签证书 | 换 cookie 的是模型自己的 `curl`，证书不受信时由 `curl` 报错；用受信证书或受信代理 |

### 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-web-auth-url" --offline
```

本插件是手写源码形态（`lib/` 直接发布，没有 `src/` 与 `build`）。改 `lib/` 之后触发一次 profile 重新组合即生效——在插件页或 `plugin_manager` 里把本插件关一次再开一次，不必重启进程（带 `hmr` 行的 profile 如此，细则见仓库 `docs/rules/dev-copy.md`「生效时机」）。

## 模型体验

工具在 Web 部署里始终可见，描述是：

> Return the launch-token URL of the DeepSeek Harness Web GUI this session is driving. The GUI exchanges that token for a browser session cookie on `GET /` and 401s every other path, so request this URL once to obtain the cookie, then send later requests to `$DSH_WEB_URL` with that cookie. The token belongs to this process: call again after a restart.

参数为空。调用结果里模型看到的是这段文本：

```
Tokenized URL: <带 token 的地址>
Pick a cookie jar path under the project's ./tmp (create the directory if it is missing), e.g.:
  JAR=./tmp/dsh-web-cookie.jar
Exchange the token once for the session cookie:
  curl -s -c "$JAR" -o /dev/null "<带 token 的地址>"
Then use the jar instead of the token:
  curl -s -b "$JAR" "$DSH_WEB_URL/"
```

`DSH_WEB_AUTH_URL` 的描述把模型指向 `web_gui_login`，两条来路给出同一个地址。插件不注册任何提示词段落：模型是看到工具才学到怎么登录的。

## 限制

- 只在 Web 部署里装载；CLI、TUI 或缺少 `connection` / `webServer` 时工具与变量都不出现。
- token 只对 `GET /` 有效，其余路径必须带 cookie；不带 cookie 直接访问别的路径仍是 401。
- 地址是进程级的：DSH 重启后 token 轮换，旧地址失效；已换到的 cookie 在有效期内继续可用。
- HTTPS 监听器配自签证书时，换 cookie 的 `curl` 会因证书不受信失败，需要受信证书或受信代理。
- 没有配置面，也没有按会话的开关。

## 验证

```bash
cd plugins/dsh-web-auth-url && pnpm check
```

`check` 就是 `scripts/smoke-host.mjs`，承重点在**真实的内核服务**上：

- **真工具表**：工具注册进真 `ctx.tools`（`@deepseek-ai/dsh-tools` 的 `ToolRuntime`），参数面为空、输出面只有一个 `url` 字段。
- **地址口径**：返回值就是公布根加进程 token；公布根与监听根不同时跟公布根走；token 轮换后重调一次就拿到新地址。
- **文案**：`render` 里有地址、项目 `./tmp` 下的 jar 路径定义与两条 `curl` 命令，后续请求挂到 `$DSH_WEB_URL` 上。
- **未 bind**：抛的是 `WEB_GUI_LOGIN_NOT_READY`，不是内核原话。
- **托管环境变量**：真 `ctx.shellEnv` 的 `collect()` 每次调用都重新执行 `resolve`，且与工具结果逐字相同。
- **不碰提示词**：插件没有 `Config`，导出面只有 `apply` / `inject` / `name`。
- **不激活**：没有 `connection` / `webServer` 时工具与变量都不出现。

文案断言只钉承重的那几件事（给出地址、jar 路径定义在换 cookie 之前、两条命令、指向 `$DSH_WEB_URL`），不钉整句原文。内核包是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑，不指向任何 DSH 安装副本。文件末尾另有一段守卫反例，证明 cordis 对未声明服务的属性读取真的抛错。

浏览器里验收：在 Web 实例里让模型调一次 `web_gui_login`，工具行展开后应看到带 token 的地址与两条 `curl`；同一实例的 shell 里 `echo "$DSH_WEB_AUTH_URL"` 应与工具结果逐字相同，用这条地址访问一次 `GET /` 之后，带 cookie 访问 `$DSH_WEB_URL` 不再 401。

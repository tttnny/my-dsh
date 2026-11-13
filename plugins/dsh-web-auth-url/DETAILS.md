# @lynn123411/dsh-web-auth-url 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、登录流程与验证。

## 装配形态

装进 profile 一条命令即可，profile 侧不用手写任何补丁：

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

## 没有配置面

插件不导出 `Config`：用法全部写在工具描述里，没有可调的档位。这与内核「工具语义归工具描述、段落只放跨调用习惯」的归属规则一致——本插件没有描述之外的习惯要交代，于是不占段落。

登录地址靠工具被发现：模型看到 `web_gui_login` 才知道该登录，而不是被系统提示词提前告知。

## 登录流程

工具只做一件事：解析地址并把地址交出去。

1. 取对外公布的那个根（`webApp.getAdvertisedUrl()`，没有该服务时用 `webServer.getOrigin()`），交 `connection.authenticatedUrl()` 加本进程的 launch token。
2. 返回 `{ url }`，`render` 先给出由调用者在项目 `./tmp` 下选定的 cookie jar 路径，再给出两条命令：`curl -s -c "$JAR" -o /dev/null "<url>"` 换 cookie，`curl -s -b "$JAR" "$DSH_WEB_URL/"` 之后走干净地址。

token 只对 `GET /` 有效：`connection` 的 `authorizeIndex` 只在这一个请求上换 cookie 并回 303，其余路径带 token 一律 401。所以模型必须先用这条地址换一次 cookie，之后的请求带 cookie、不带 token。

发布根与监听根可能不同（配了 `--public-url` 时），工具给出的地址与 `DSH_WEB_URL` 是同一个根。cookie 由发请求的那个 authority 铸出，模型照 `render` 里的命令在同一个根上换 cookie、发后续请求，两者才落进同一份 cookie。

## `DSH_WEB_AUTH_URL`

托管给 shell 的同一条带 token 地址，每次 shell 调用即时解析，与工具结果逐字相同。它的消费方是仓库里的 [`tools/gui-shot.mjs`](../../tools/gui-shot.mjs) 与 [`tools/verify-client.mjs`](../../tools/verify-client.mjs)：两条工具拿它换 cookie 再驱动浏览器。变量描述把模型指向 `web_gui_login`。

## 失败模式

| 情况 | 行为 |
| --- | --- |
| 监听器未 bind | 抛 `WEB_GUI_LOGIN_NOT_READY`，说明等实例服务后重调 |
| DSH 重启 | token 换了一把，重调 `web_gui_login` 拿新地址；旧 cookie 仍在有效期内时继续可用 |
| HTTPS 监听器 + 自签证书 | 换 cookie 的是模型自己的 `curl`，证书不受信时由 `curl` 报错；用受信证书或受信代理 |

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-web-auth-url" --offline
```

本插件是手写源码形态（`lib/` 直接发布，没有 `src/` 与 `build`）。改 `lib/` 之后触发一次 profile 重新组合即生效——在插件页或 `plugin_manager` 里把本插件关一次再开一次，不必重启进程（带 `hmr` 行的 profile 如此，细则见仓库 `docs/rules/dev-copy.md`「生效时机」）。

## 验证

```bash
cd plugins/dsh-web-auth-url && pnpm check
```

`check` 就是 `scripts/smoke-host.mjs`，承重点在**真实的 0.2.1-rc.2 内核服务**上：

- **真工具表**：工具注册进真 `ctx.tools`（`@deepseek-ai/dsh-tools` 的 `ToolRuntime`），参数面为空、输出面只有一个 `url` 字段。
- **地址口径**：返回值就是公布根加进程 token；公布根与监听根不同时跟公布根走；token 轮换后重调一次就拿到新地址。
- **文案**：`render` 里有地址、项目 `./tmp` 下的 jar 路径定义与两条 `curl` 命令，后续请求挂到 `$DSH_WEB_URL` 上。
- **未 bind**：抛的是 `WEB_GUI_LOGIN_NOT_READY`，不是内核原话。
- **托管环境变量**：真 `ctx.shellEnv` 的 `collect()` 每次调用都重新执行 `resolve`，且与工具结果逐字相同。
- **不碰提示词**：插件没有 `Config`，导出面只有 `apply` / `inject` / `name`。
- **不激活**：没有 `connection` / `webServer` 时工具与变量都不出现。

文案断言只钉承重的那几件事（给出地址、jar 路径定义在换 cookie 之前、两条命令、指向 `$DSH_WEB_URL`），不钉整句原文。内核包是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑，不指向任何 DSH 安装副本。文件末尾另有一段守卫反例，证明 cordis 对未声明服务的属性读取真的抛错。

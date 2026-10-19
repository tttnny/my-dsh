# @lynn123411/dsh-web-auth-url 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置项与验证。

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

登录信息靠工具被发现：模型看到 `web_gui_login` 才知道该登录，而不是被系统提示词提前告知。

## 登录流程

工具一次调用做四件事，每一步都不把 token 交出去：

1. 取对外公布的那个根（`webApp.getAdvertisedUrl()`，没有该服务时用 `webServer.getOrigin()`），交 `connection.authenticatedUrl()` 加一次性 token。
2. `fetch(url, { redirect: 'manual' })`：只认这次响应，不跟随重定向、不把 cookie 发到别处；`exec.signal` 直接转给 `fetch`，取消会中断请求。
3. 解析 `Set-Cookie`，写成 Netscape 格式的 jar（`$DSH_HOME/cache/web-gui-auth/<host>-<port>.jar`，`0600`）。
4. 返回 `{ jar, expiresAt }`。地址与 token 出了这次调用就不存在了；成功只可能是 303，所以结果里不带状态码，状态码只出现在失败时的错误文本里。

发布根与监听根可能不同（配了 `--public-url` 时），jar 的文件名、cookie 域、`DSH_WEB_URL` 三者都跟发布根走，模型照示例命令发请求时会命中同一份 cookie。

写 jar 全程同步，先写同目录临时文件再改名：中途失败不会留下半个文件。临时名每次调用唯一，崩溃留下的残片不会被下一次调用复用。同一 authority 的重复登录覆盖同一个 jar。

## `DSH_WEB_AUTH_URL`

托管给 shell 的带 token 地址，每次 shell 调用即时解析。它的消费方是仓库里的 [`tools/gui-shot.mjs`](../../tools/gui-shot.mjs) 与 [`tools/verify-client.mjs`](../../tools/verify-client.mjs)：两条工具拿它换 cookie 再驱动浏览器。模型侧的正路是 `web_gui_login`，变量描述也这么写。

## 失败模式

| 情况 | 行为 |
| --- | --- |
| 监听器未 bind | 抛 `WEB_GUI_LOGIN_NOT_READY`，说明等实例服务后重调 |
| 换 cookie 非 303，或没有 `Set-Cookie` | 抛错并带上状态码与 cookie 条数；文本里不含带 token 的地址 |
| HTTPS 监听器 + 自签证书 | Node 的 `fetch` 拒绝不受信证书，证书错误原样抛出；用受信证书或受信代理 |
| 会话 cookie（没有过期时间） | `expiresAt` 为 `null`，jar 里该行的过期写 `0` |

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-web-auth-url" --offline
```

本插件是手写源码形态（`lib/` 直接发布，没有 `src/` 与 `build`），所以改 `lib/` 之后要重启 DSH 实例：loader 只在启动时装载。

## 验证

```bash
cd plugins/dsh-web-auth-url && pnpm check
```

`check` 就是 `scripts/smoke-host.mjs`，承重点在**真实的 0.2.1-rc.2 内核服务**上，另起一个本地 `node:http` 假服扮演 Web GUI：

- **真工具表**：工具注册进真 `ctx.tools`（`@deepseek-ai/dsh-tools` 的 `ToolRuntime`），参数面为空、输出面封闭。
- **真 HTTP 往返**：假服回 303 与 `Set-Cookie`，断言 jar 的内容、`0600` 权限、过期时间换算与 `null` 分支。
- **不泄漏**：规范值、`render` 文本、以及两条失败分支的错误文本里都不能出现 token。
- **取消**：`exec.signal` abort 后调用以 `AbortError` 结束。
- **未 bind**：抛的是 `WEB_GUI_LOGIN_NOT_READY`，不是内核原话。
- **发布根**：`webApp.getAdvertisedUrl()` 与监听根不同时，jar 名与 cookie 域跟发布根走。
- **`~` 展开**：`DSH_HOME=~/…` 落到用户主目录，不在当前目录下造 `~` 目录。
- **托管环境变量**：真 `ctx.shellEnv` 的 `collect()` 每次调用都重新执行 `resolve`，token 轮换后下一次 shell 调用拿到新地址。
- **不碰提示词**：插件没有 `Config`，导出面只有 `apply` / `inject` / `name` / `selfDir`。
- **不激活**：没有 `connection` / `webServer` 时工具与变量都不出现。

文案断言只钉承重的那几件事（指向工具、用 jar、不出现 token、不引用别的变量），不钉整句原文。内核包是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑，不指向任何 DSH 安装副本。文件末尾另有一段守卫反例，证明 cordis 对未声明服务的属性读取真的抛错。

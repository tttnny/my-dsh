# @lynn123411/dsh-web-auth-url

DSH Web GUI 的登录补位：给模型一个 `web_gui_login` 工具，一次调用就把本进程的 launch token 换成浏览器会话 cookie，写成 curl 能直接读的 cookie jar。`dsh-web-app` 只把干净地址交给模型（`app:web-surface` 段落）和 shell（`DSH_WEB_URL`），带 token 的地址只打印到 stdout——于是模型自测这个 GUI（抓页面、探路由、确认客户端插件有没有生效）时第一枪必然 401，只能翻启动器日志找 token。本插件把这半补上，secret 既不进提示词，也不进工具结果与会话记录。

## 功能

- **一次调用完成登录**：`web_gui_login` 自己取带 token 的地址、换 cookie、落 jar，模型只拿到 jar 路径。
- **jar 拿来就能用**：写的是 Netscape 格式，`curl -b "<jar>" "$DSH_WEB_URL/api/…"` 直接通，不用模型自己拼 `-c` 管道。
- **token 不外泄**：工具的规范值、`render` 文本与错误文本里都没有 token；token 只活在这次调用里。
- **jar 跨重启有效**：cookie 的签名密钥落盘、绝对寿命 30 天，DSH 重启后同一个 jar 继续能用；请求回 401 时重调一次即可。
- **非 Web 部署整条不激活**：CLI、TUI 或缺少 `connection` 的组合里，工具与变量都不出现。

## 特性

- **工具 `web_gui_login`**：`parameters` 为空（登录不需要模型给任何东西），输出 `{ jar, expiresAt }`，没有过期时间的会话 cookie 写作 `null`；`timeoutMs` 15 秒并转发执行信号，取消真的会中断请求。
- **jar 落在 `$DSH_HOME/cache/web-gui-auth/<host>-<port>.jar`**：文件权限 `0600`、目录 `0700`；写入全程同步、经临时文件改名，中途失败不会留下半个 jar，重复登录覆盖同一个文件。
- **地址与 cookie 域都取对外公布的那个根**：有 `webApp.publicUrl` 时用它，否则用监听器自己报的 origin，与 `DSH_WEB_URL` 和启动时打印的地址同源。
- **`$DSH_HOME` 按内核规则解析**：`DSH_HOME` 优先、否则 `~/.dsh`，开头的 `~` 会展开，不新增依赖。
- **同时托管 `DSH_WEB_AUTH_URL`**：每次 shell 调用即时解析的带 token 地址，供仓库里的 `tools/gui-shot.mjs` 与 `tools/verify-client.mjs` 驱动浏览器与校验产物；变量描述把模型指向 `web_gui_login`。
- **不碰系统提示词**：用法全部写在工具描述里，插件不注册任何段落，也没有配置面——模型是看到工具才学到怎么登录的，而不是被提示词提前告知。
- **监听器未 bind 时给出 `WEB_GUI_LOGIN_NOT_READY`**：可 grep 的错误码，而不是把内核的原始异常抛给模型。
- **`selfDir()`**：本插件自身安装目录的真实路径（预留工具，当前无调用方）。开发副本是 `link:` 软链接且 `~/.dsh` 与仓库常在不同卷，`ctx.pluginPackages.packageOf(...)` 会返回链接路径；`selfDir()` 走 Node 解析器 + `realpath`，正常发布安装下两者相同。
- **形态与装配**：bundle 型插件、无客户端半边，装法与验证见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-web-auth-url
```

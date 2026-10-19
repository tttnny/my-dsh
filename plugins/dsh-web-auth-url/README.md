# @lynn123411/dsh-web-auth-url

DSH Web GUI 的登录补位：给模型一个 `web_gui_login` 工具，一次调用就拿到本进程带 launch token 的 GUI 地址。`dsh-web-app` 有意只把干净地址交给模型（`app:web-surface` 段落）和 shell（`DSH_WEB_URL`），带 token 的地址只打印到 stdout——于是模型自测这个 GUI（抓页面、探路由、确认客户端插件有没有生效）时第一枪必然 401。本插件把这半补上。

## 功能

- **一次调用拿到登录地址**：`web_gui_login` 即时解析本进程的带 token 地址（`http://127.0.0.1:<端口>/?token=…`），原样交给模型。
- **地址拿来就能登录**：`render` 里给出两条命令——第一条用这个地址换会话 cookie 到 jar，第二条用 jar 访问 `$DSH_WEB_URL`。
- **跟随 token 轮换**：每次调用都重新向 `connection` 取一次，不缓存；DSH 重启换了 token，重调一次就是新地址。
- **同时托管 `DSH_WEB_AUTH_URL`**：每次 shell 调用即时解析的同一条地址，与工具结果逐字相同，供仓库里的 `tools/gui-shot.mjs` 与 `tools/verify-client.mjs` 驱动浏览器与校验产物。

## 特性

- **只在 Web 部署里出现**：CLI、TUI 或缺少 `connection` 的组合里，工具与变量都不出现。
- **工具 `web_gui_login`**：`parameters` 为空（取地址不需要模型给任何东西），输出一个字段 `{ url }`；错误文本不带 `url`，只给 `WEB_GUI_LOGIN_NOT_READY` 说明监听器还没 bind。
- **地址取对外公布的那个根**：有 `webApp.getAdvertisedUrl()` 时用它，否则用监听器自己报的 origin，与 `DSH_WEB_URL` 及启动时打印的地址同源，所以拿它换来的 cookie 对 `$DSH_WEB_URL` 有效。
- **不碰系统提示词**：用法全部写在工具描述里，插件不注册任何段落，也没有配置面——模型是看到工具才学到怎么登录的，而不是被提示词提前告知。
- **导出面只有 `apply` / `inject` / `name`**：没有配置面，也没有预留工具函数；形态与装配见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-web-auth-url
```

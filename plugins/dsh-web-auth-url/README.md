# @lynn123411/dsh-web-auth-url

DSH Web GUI 的访问鉴权补位：把当前实例**带 token 的访问地址**交给模型与 shell。`dsh-web-app` 有意只把干净地址交给模型（`app:web-surface` 段落）和 shell（`DSH_WEB_URL`），带 token 的地址只打印到 stdout 并交给默认浏览器——于是模型自测这个 GUI（抓页面、探路由、确认客户端插件有没有生效）时第一枪必然 401，只能翻启动器日志找 token。本插件把这半补上，且不把 secret 写进提示词或 session。

## 特性

- **`DSH_WEB_AUTH_URL` 托管环境变量**：每次 shell 调用即时解析的带 token 回环地址（`http://127.0.0.1:<port>/?token=…`），DSH 重启换 token 后自动跟随；不缓存、不落盘。
- **提示词段落 `app:web-auth-url`**：紧随 `app:web-surface`（order + 10）贡献一段说明——只报变量名、不报值，并交代必需用法：第一次请求 `curl -c "$JAR" -b "$JAR" "$DSH_WEB_AUTH_URL"` 拿到 303 并种下 cookie，之后复用同一个 jar 即已授权。
- **`prompt` 三档**：`env`（默认）只报变量名，token 不进提示词与 transcript；`inline` 把带 token 的地址直接写进段落（地址每次装配即时解析，重启后不过期，但 token 会随请求发给模型服务商并落盘进 session）；`off` 只保留环境变量。
- **无 web 部署静默降级**：CLI / TUI / 缺 `connection` 的组合下注册照常完成，但 `resolve` 返回空、段落渲染成空串，而空段落由内核 `renderPrompt` 过滤，系统提示词里不留痕迹。
- **不新增端口、不新增凭据**：token 取自已装载的 `connection` 服务，与启动时打印到 stdout 的是同一个。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-web-auth-url
```

本地开发按仓库规则用 `link:`——`cd ~/.dsh/profiles/web && pnpm add "link:/Users/tny/Desktop/work/my-dsh/plugins/dsh-web-auth-url" --offline`，并在 profile `package.json` 的 `dsh.profile.bundles` 里登记本包（`dsh plugin add` 会自动登记，手工 link 不会）。宿主半边只在 DSH 启动时装载，改完须重启实例；自检 `npm test` 跑 `scripts/smoke-host.mjs`。

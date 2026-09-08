# @lynn123411/dsh-browseros-neo

「只做 MCP 配置」的 [BrowserOS neo](https://docs.browseros.com/neo)（agent 专用浏览器）一键接入插件。DSH 原生自带 MCP 客户端桥 [@deepseek-ai/dsh-mcp-client](https://github.com/deepseek-ai/deepseek-harness)，但要接上 neo 你得自己写配置行、还得知道它的真实端口——本插件只办这两件事：从 neo 自己的 `~/.browserclaw/runtime.json` 解析实际端点，然后在宿主内挂载官方桥。再加一个给人用的按钮：设置 › Browser Neo 的「连接 BrowserOS neo」，Neo 没在跑就后台拉起、顺手重建桥会话。装完 Neo 的 20 个浏览器工具以 `mcp__browseros-neo__*` 出现，与 Claude Code / Codex 等官方一键接入的 harness 完全同名同形。除此之外的一切（自动监督、错误处理、skill）归官方，插件不干预。

## 特性

- **零配置桥接**：装完即挂官方 `dsh-mcp-client`（streamable-http，`serverName: browseros-neo`），工具名 `mcp__browseros-neo__snapshot / act / read / run …`；官方设计保持原样，超时等参数一概用官方默认值。
- **真实端口自动解析**：BrowserOS neo 的 MCP 端口不一定是文档写的 9200（被占用时会另挑，本机实测 9010）——插件读 neo 自己的 `~/.browserclaw/runtime.json` 拿实际端点，文件缺失才回退 `http://127.0.0.1:9200/mcp`；每次挂载都重新解析。
- **生命周期交给官方桥**：官方桥自带监督器——连接失败（含「DSH 先开、Neo 后开」）按指数退避自动重试约 10 次 / ~2.5 分钟，连上即自动注册工具；稳定连接超过窗口期后预算重置，所以 Neo 秒级重启可自愈。本插件不加任何额外机制。
- **设置 › Browser Neo 一键连接**：状态行（端点 / 连接结果 / 最近错误，4s 轮询且每次读都现场探测端点，Neo 自行恢复时面板自己变色）+「连接 BrowserOS neo」按钮——端点完全无应答时先 `open -g` 后台拉起（macOS，不抢焦点；人的这次点击就是启动授权，模型依旧无权启动）、等待期间持续重读 runtime.json 跟住端口变化、随后重建桥会话（dispose + 重挂）。两类实测竞态已处理（v1.2.0）：冷启动头几秒端点回 503，只有 200 算就绪（面板显示「正在启动」而非假绿）；刚退出 App 时发出的 `open` 会被 LaunchServices 吞掉（返回 0 但进程从未起来），等待循环 5 秒后自动补发一次。侧栏 `order: 140`。没有启用开关——关插件直接注释 patch 行。
- **诚实的恢复边界**：官方桥重连预算（~2.5 分钟）烧光后注销工具，以及上游已知缺口——官方 SDK 未实现 spec 的「会话 404 → 重新初始化」，Neo 换进程后若持续 `Session not found` 桥会无感——这两类不自愈场景都交给上面的按钮；不想开设置页也可以改存一次 profile 的 `cordis.patch.yml` 触发插件重载（官方文档出路）。新挂载/重挂的工具会在会话**下一个 step** 出现（工具清单按 step 装配），最迟下一轮对话。
- **不碰 skill**：Browser Neo 自动安装的 `browseros-neo` skill 保持官方原版逐字节在场，本插件不改写、不锁定。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-browseros-neo
```

（DSH Desktop 桌面应用用 `--profile desktop`；profile 装错不生效，多个入口需分别安装。装完重启 DSH 生效，需要机器上已安装 [BrowserOS neo](https://www.browseros.com/neo)。）

从本仓库源码本地安装 / 联调：

```bash
# 1) 落位到 web profile（无构建链，直接拷贝）
mkdir -p ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-browseros-neo
cd plugins/dsh-browseros-neo
rsync -a --delete lib cordis.patch.yml package.json README.md LICENSE \
  ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-browseros-neo/
# 2) 在 ~/.dsh/profiles/web/package.json 的 dependencies 与 dsh.profile.bundles
#    中登记 "@lynn123411/dsh-browseros-neo"（版本 1.2.0）后重启 dsh web
```

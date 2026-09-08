# @lynn123411/dsh-browseros-neo

「只做 MCP 配置」的 [BrowserOS neo](https://docs.browseros.com/neo)（agent 专用浏览器）一键接入插件。DSH 原生自带 MCP 客户端桥 [@deepseek-ai/dsh-mcp-client](https://github.com/deepseek-ai/deepseek-harness)，但要接上 neo 你得自己写配置行、还得知道它的真实端口——本插件只办这两件事：从 neo 自己的 `~/.browserclaw/runtime.json` 解析实际端点，然后在宿主内挂载官方桥。装完 Neo 的 20 个浏览器工具以 `mcp__browseros-neo__*` 出现，与 Claude Code / Codex 等官方一键接入的 harness 完全同名同形。生命周期、错误处理、skill 全部归官方，插件一概不干预。

## 特性

- **零配置桥接**：装完即挂官方 `dsh-mcp-client`（streamable-http，`serverName: browseros-neo`），工具名 `mcp__browseros-neo__snapshot / act / read / run …`；官方设计保持原样，超时等参数一概用官方默认值。
- **真实端口自动解析**：BrowserOS neo 的 MCP 端口不一定是文档写的 9200（被占用时会另挑，本机实测 9010）——插件读 neo 自己的 `~/.browserclaw/runtime.json` 拿实际端点，文件缺失才回退 `http://127.0.0.1:9200/mcp`；每次挂载都重新解析。
- **生命周期交给官方桥**：官方桥自带监督器——连接失败（含「DSH 先开、Neo 后开」）按指数退避自动重试约 10 次 / ~2.5 分钟，连上即自动注册工具；稳定连接超过窗口期后预算重置，所以 Neo 秒级重启可自愈。本插件不加任何额外机制。
- **诚实的恢复边界**：官方桥重连预算烧光后注销工具，唯一出路是其文档写明的「重新加载插件或重启 Host」——改存一次 profile 的 `cordis.patch.yml` 即可触发重载。另有一个上游已知缺口：官方 SDK 未实现 spec 的「会话 404 → 重新初始化」，Neo 换进程后若持续 `Session not found` 桥会无感，恢复方式同上。
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
#    中登记 "@lynn123411/dsh-browseros-neo"（版本 1.0.0）后重启 dsh web
```

# @lynn123411/dsh-llm-agentrouter

AgentRouter 中转聚合插件：把同一家中转的多个模型收拢为一条 pi-ai 路由（模型选择器只出现一个 AgentRouter 分组），国内 / 国际端点在「设置 - API中转 - AgentRouter 中转站」一键切换、下一请求即生效，外加出站请求的 User-Agent 改写与 402 配额耗尽提示围栏。分叉自 `aqiu817/dsh-llm-agentrouter`，适配 DSH `0.1.2-alpha.5` 起的新 settings/slots API，已在 `0.1.5-rc.1` 逐项实证兼容。

## 特性

- **单路由多模型**：Claude Opus 5、GPT-5.6-sol 等走同一 `agentrouter` 路由，`reasoningEffort` 档位与兼容开关按实测探针手写声明，模型列表不翻倍。
- **端点一键切换**：设置卡片两个大选项（国内端点 / 国际端点，附带真实 host 展示），点击即写即生效，无需重启；API Key 只存 `$DSH_HOME/.credentials.yaml` 的 `AGENTROUTER_API_KEY` 引用。
- **共享「API中转」设置页**：本插件的端点卡片与 `dsh-a6api` 的面板挂在同一个设置页里（`settings.section` id `relay` 的页内两个 tab，参与者可增删）。内核不允许一页被多个插件共同声明，因此每个参与者各持一份运行时逻辑一致的页壳，**先加载者当选页面宿主**、其余只注册卡片；当选者被卸载后下次启动自动改选。做法与约束见仓库 `docs/rules/shared-settings-page.md`。
- **请求围栏**：重写 relay 要求的 `User-Agent`（适配器强制署名下沉到 `fetch` 层替换），哨兵 host（`.internal` 不可解析）兜底防裸奔，402 配额耗尽的 JSON 错误体改写为可读提示。
- **alpha.5 兼容**：宿主沿用 `ctx.settings.installSection` + `ctx.inject(['settings'])`，客户端卡片改挂共享设置页的子 slot；沿用 `llm-agentrouter` 设置命名空间，老配置无缝继承。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-llm-agentrouter
```

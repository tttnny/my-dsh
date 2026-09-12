# @lynn123411/dsh-antigravity-auth

Google Antigravity OAuth 权益接入能力包：单账号集成 Gemini、Claude 与 GPT-OSS 私有模型推理，支持联网搜索（Google Search Grounding）、多模态图片生成与本地视频分析，打破 127.0.0.1 严格回环限制，完美适配全网卡绑定（0.0.0.0）与远程手动授权回调。

## 特性

- **全模型聚合接入**：提供 `google-antigravity` LLM 供应商，支持 Gemini 2.5/3.1/3.7、Claude 3.5/3.7 以及 GPT-OSS 等系列模型的原生流式推理与思考块保留（Thinking signature）。
- **解除回环限制与远程支持**：去除严格限定 `127.0.0.1` 的门禁，临时 OAuth 回调服务绑定 `0.0.0.0:51121`，支持 Docker 端口映射与局域网访问；针对跨机远程访问场景，提供手动粘贴授权回调链接输入通道，无缝完成凭据换发与登录闭环。
- **联网搜索增强（开关即接管）**：注册 `antigravity` 搜索服务，依托 Google Search Grounding 提供带真实证据引用的联网搜索能力。设置页「网页搜索」开关开启且账号就绪时，插件会把宿主 `web` 服务的搜索提供方指向自己并注册提供方，内置 `web_search` 工具随即使改用 Antigravity；关闭开关、未登录或门禁未通过时自动还原宿主原有提供方（如 DeepSeek 官方搜索），不会让搜索能力失效。
- **正文与来源同 DeepSeek 官方搜索对齐**：搜索请求按已审计的社区抓包补齐外层封套（`requestId` / `userAgent` / `requestType` / 请求 `sessionId`）与 `generationConfig`，端点因此除 `groundingChunks` 外还会返回 `candidates[].content.parts[].text`，工具输出即呈现一段带出处的正文再加来源列表——与 DeepSeek 官方搜索的「正文 + 来源」形态一致。
- **多模态工具支持**：向 Agent 注入 `generate_image`（文本生图与参考图修改，生成图像自动存入 DSH 附件系统）与 `analyze_video`（本地 MP4 视频多模态分析）工具。
- **可读的引用来源**：grounding 只返回 `vertexaisearch.cloud.google.com` 的跳转令牌，直接引用既不可读也无法抓取。插件对每条令牌发一次免鉴权 `HEAD`（`redirect: 'manual'`），**只读 `Location` 头、不访问发布者站点**，把来源还原为真实地址（如 `https://www.sge.com.cn/`）；单次搜索最多解析 10 条、并发执行、2.5 秒预算，任何失败都保留原令牌——解析不到只损失一条引用的可读性，绝不会让搜索失败。
- **用量与配额监控**：实时展示当前 Antigravity 账号的项目 ID、各模型用量配额占比与重置倒计时。
- **API中转页无缝集成**：作为「API中转」共享设置页（order 120）的参与者挂载于 `relay.settings.item`，遵循先到先得选举机制，在页内提供独立的 Antigravity 配置卡片。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-antigravity-auth
```

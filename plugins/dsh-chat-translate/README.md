# @lynn123411/dsh-chat-translate

DeepSeek Harness Web 界面的工具调用与思考摘要智能翻译插件。自动将当前会话中工具调用标题与思考折叠摘要翻译为中文，采用非侵入式双语对照渲染（点击译文可切换原文），不污染会话上下文。内置 OpenAI 兼容 AI 翻译与免 Key Bing 兜底双通道。

## 特性

- **工具调用与思考摘要自动翻译**：仅在渲染层将工具调用动作描述（如 `Locate DSH home directory structure`）与思考折叠摘要自动翻译为中文，对话正文永不翻译，保持思考正文原生不干扰。思考折叠摘要只在思考**完全结束**后才翻译，绝不翻译思考过程中的流式中间态。
- **AI 翻译通道（OpenAI 兼容协议）**：对接任意 OpenAI 兼容的 `chat/completions` 服务（OpenAI、DeepSeek、通义、Ollama 等），Base URL 与模型可在设置面板配置；API Key 经 DSH 凭据服务读写 `~/.dsh/.credentials.yaml` 的 `TRANSLATE_API_KEY`，填写后立即生效。
- **Bing 免 Key 兜底通道**：内置微软 Bing 网页翻译（免 Key、国内直连），AI 未配置或请求失败时自动兜底；双通道均有独立开关，同时关闭则不翻译。
- **非侵入式 DOM 挂载与双语对照**：非侵入式包装保留原始 DOM 节点与 React Fiber 事件系统；点击译文可原地在原文与中文之间切换。
- **智能内容脱敏与占位符保护**：翻译前对多行代码块、内联代码、URL 链接、文件路径及 CLI 命令行参数进行占位符脱敏与鲁棒还原，杜绝代码与路径被误翻译。
- **当前会话作用域**：仅翻译当前查看的会话，切换会话自动跟随新内容；视口懒加载（150px 缓冲）与文档顺序排队，译文按阅读顺序出现。
- **智能调度与熔断保护**：1–100 动态并发限流队列、AI 30s / Bing 2s 超时、连续失败熔断自愈、在途请求合并去重、7 天 LRU 磁盘持久化缓存（`~/.dsh/dsh-chat-translate/cache.json`）。
- **DSH 原生配置接入**：配置走 DSH `settings` 服务（用户层写入 `~/.dsh/settings.yaml` 的 `dsh-chat-translate` 段）、密钥走 DSH `credentials` 服务、设置面板经 `settingsScope` 与 `credentials` Remote API 读写——无任何自研配置文件。
- **设置面板集成**：在「设置 - 聊天翻译」中提供总开关、AI/Bing 通道开关、Base URL 与模型配置、通道测试与并发数调节。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-chat-translate
```

## 配置

1. **API Key**：打开「设置 - 聊天翻译」，在 AI 翻译卡片中直接填写 API Key 并保存（经 DSH 凭据服务写入 `~/.dsh/.credentials.yaml` 的 `TRANSLATE_API_KEY`，权限 0600，保存后立即生效；留空保存 = 清除该键）。也可以手动编辑该文件：

   ```yaml
   refs:
     TRANSLATE_API_KEY: sk-xxx
   ```

   > ⚠️ **注意**：DSH 的凭据加载器要求 refs 键值非空。手动编辑时要么填写真实 Key，要么**直接删除该行**——不要写成 `TRANSLATE_API_KEY: ""` 这类空值，否则 DSH 启动会失败。未配置时插件自动由 Bing 通道兜底，不会报错。

2. **Base URL 与模型等设置**：在「设置 - 聊天翻译」中填写 Base URL（如 `https://api.openai.com/v1` 或 `https://api.deepseek.com/v1`）与模型名（如 `gpt-4o-mini`、`deepseek-chat`），点击「测试 AI 通道」验证。所有设置（开关、并发数、超时等）由 DSH 持久化到 `~/.dsh/settings.yaml` 的 `dsh-chat-translate` 段，可直接编辑该文件（DSH 会热同步）：

   ```yaml
   dsh-chat-translate:
     enabled: true
     concurrency: 3
     aiEnabled: true
     bingEnabled: true
     baseUrl: http://172.24.52.126:8081/v1
     model: hy-mt2-1.8b
     targetLang: zh-Hans
   ```

   > 从 1.2 起，插件不再读写独立的 `~/.dsh/dsh-chat-translate-config.json`：升级后首次加载会自动把旧文件的值迁移进上面的 settings 段并删除旧文件（若你已在 UI 中改过设置，则以你的设置为准）。

3. **通道行为**：AI 开启且已配置 → AI 优先、失败降级 Bing；AI 开启但未配置 + Bing 开启 → Bing 翻译；AI 未配置 + Bing 关闭 → 不翻译；AI 关闭 + Bing 开启 → 直接 Bing；双关 → 不翻译。

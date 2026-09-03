# my-dsh

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 插件 / 补丁 / preset 合集 · Collection of DSH plugins, patches & presets

---

## 🧩 插件（plugins/）

| 插件 | 类型 | 说明 | 安装 |
| --- | --- | --- | --- |
| [@lynn123411/dsh-ui-deepseek-bg](./plugins/dsh-ui-deepseek-bg) | `dsh.bundle` + `dsh.client/web` | **背景引擎**：仿 DSH 官网风格的极光（WebGL2 流体）/ 粒子鲸鱼 / 星座网格 + 鼠标跟随交互，内置「背景特效」面板（性能档位 / 特效开关 / GPU 调优） | `dsh plugin --profile web add @lynn123411/dsh-ui-deepseek-bg` |
| [@lynn123411/dsh-ui-beam-orbs](./plugins/dsh-ui-beam-orbs) | `dsh.bundle` + `dsh.client/web` | **界面皮肤层**：玻璃拟态 + Border Beam 五态边框流光 + Thinking Orbs 几何光球 + Pulse 任务框 + 发送按钮微动效，内置「界面特效」面板，与背景引擎叠加还原完整官网沉浸感 | `dsh plugin --profile web add @lynn123411/dsh-ui-beam-orbs` |
| [@lynn123411/dsh-workspace-tree](./plugins/dsh-workspace-tree) | `dsh.bundle` + `dsh.client/web` | **工作区树**：文件系统推导的多级树（文件夹/工作区双模式，环境严格隔离）+ 一键在外部 IDE（VS Code / Cursor / CodeBuddy / Windsurf / Trae / JetBrains 等）打开 + 全局重命名与归档/物理删除管理 | `dsh plugin --profile web add @lynn123411/dsh-workspace-tree` |
| [@lynn123411/dsh-oil-sticky-prompt](./plugins/dsh-oil-sticky-prompt) | `dsh.bundle` + `dsh.client/web` | **对话吸顶提示**：将最近的用户 Prompt 悬浮固定在对话流顶部，点击平滑回滚至对应消息，告别长对话迷路 | `dsh plugin --profile web add @lynn123411/dsh-oil-sticky-prompt` |
| [@lynn123411/dsh-chat-translate](./plugins/dsh-chat-translate) | `dsh.bundle` + `dsh.client/web` | **聊天翻译**：工具调用与思考摘要自动译中（仅当前会话、正文不翻）：OpenAI 兼容 AI 通道（可配 Base URL/模型，Key 存 `~/.dsh/.credentials.yaml`）+ 免 Key Bing 兜底双通道，内置「聊天翻译」面板 | `dsh plugin --profile web add @lynn123411/dsh-chat-translate` |
| [@lynn123411/dsh-a6api](./plugins/dsh-a6api) | `dsh.bundle` + `dsh.client/web` | **A6API 接入**：将 A6API 聚合网关注册为 DSH 原生 LLM 提供商，提供多标签页视图、余额（$ / ¥）与调用明细、模型白名单同步、商户线路实时探测与全景指标卡片（含官方 vs 商户价格对比）、侧边栏快捷模型卡片与账户余额/价格波动/模型市场胶囊行 | `dsh plugin --profile web add @lynn123411/dsh-a6api` |
| [@lynn123411/dsh-ask-user-grilling](./plugins/dsh-ask-user-grilling) | 普通 Cordis 插件（preset 工具行消费，非 bundle） | **grilling 投递工具**：`ask_user_grilling`（后台子代理闸门 / 强制多选 / 轮末补充 / 题干引导不硬校验 / 描述内置纪律）。配合 `matt-*` 预设使用：grilling 轮次先散文预告、再以一次工具投递表单作答；达成共识后不自动进入 plan mode | `dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling` |
| [@lynn123411/dsh-mattpocock-skills-deck](./plugins/dsh-mattpocock-skills-deck) | `dsh.bundle` + `dsh.client/web`（上游分叉） | **Matt 技能控制面板（Deck）**：wayfinder 地图/票务/进度、triage / grilling / handoff 动作注入侧栏（GitHub / GitLab / Markdown 后端）。分叉改点：技能判装识别 `~/.dsh/.agent-presets/<id>/skills/` 根并**按当前会话生效 preset 门控**（没选 Matt preset 不虚报「环境 10/10」；选了不误报缺失）；移除上游随包全局技能 provider | `dsh plugin --profile web add @lynn123411/dsh-mattpocock-skills-deck` |
| [@lynn123411/dsh-llm-agentrouter](./plugins/dsh-llm-agentrouter) | `dsh.bundle` + `dsh.client/web`（上游分叉） | **AgentRouter 中转聚合**：单 pi-ai 路由承载多模型 + 国内/国际端点设置卡一键切换 + 出站 User-Agent/402 配额围栏。分叉改点：适配 alpha.5 新 settings（`ctx.settings.installSection`）与 slots（`settings.plugins.tab`）API，沿用 `llm-agentrouter` 命名空间 | `dsh plugin --profile web add @lynn123411/dsh-llm-agentrouter` |

---

## 🎨 Agent Presets（presets/）

| preset | 说明 |
| --- | --- |
| [ptc-cordis](./presets/ptc-cordis) | **PTC-Cordis 混合模式**：融合 PTC（`mode: ptc`：模型只见 `run_code`，全部工具经 SDK 以脚本调用）与 Cordis 动态插件编辑（`cordis_define`/`run`），含 `cordis-plugin-development` / `editing-cordis-compositions` 随附技能，开箱与官方 `standard` / `ptc` / `cordis` 并列可选 |
| [matt-standard](./presets/matt-standard) | **Matt 标准工程模式**：官方 `standard` 组合（persona 零改动）+ Matt Pocock 25 个工程/生产力技能（[mattpocock/skills](https://github.com/mattpocock/skills)）+ grilling 投递插件。grilling 轮次先散文预告、再以表单工具投递作答；达成共识后不自动进入 plan mode |
| [matt-ptc](./presets/matt-ptc) | **Matt PTC 模式（实验性）**：官方 `ptc` 组合（persona 零改动，`mode: ptc` 下模型只见 `run_code`）+ 25 个 Matt 技能 + grilling 投递插件（grilling 轮次经 `run_code` 内的 `tools.ask_user_grilling` 投递） |
| [matt-cordis](./presets/matt-cordis) | **Matt 创造模式**：官方 `cordis` 组合（persona 零改动，含 `tool-cordis` 动态插件工具集、两个随附技能、双平面引导）+ 25 个 Matt 技能并入 skills/ + grilling 投递插件。grilling 轮次先散文预告、再以表单工具投递作答 |

---

## 🛠️ 本地补丁脚本（patches/）

| 目录 | 说明 |
| --- | --- |
| [patch-dsh-finish-reason](./patches/patch-dsh-finish-reason/) | 修复「流结束不带 `finish_reason`」导致的 `Stream ended without finish_reason` 报错、内容丢弃与整轮重试（`openai-completions` 通用检查，覆盖 opencode.ai zen/go 等中转网关）。详见 [README](./patches/patch-dsh-finish-reason/README.md) |
| [patch-dsh-escalation-noop](./patches/patch-dsh-escalation-noop/) | 修复 `dsh-sandbox` 同模式 `sandbox_permissions` 升级报错（`danger→danger` no-op 放行，真实升级仍审批）。详见 [README](./patches/patch-dsh-escalation-noop/README.md) |
| [dsh-message-edit-log-compat](./patches/dsh-message-edit-log-compat/) | 修复第三方插件 `dsh-message-edit` 写入自定义事件 `message-edit/version` 导致的历史会话加载失败。详见 [README](./patches/dsh-message-edit-log-compat/README.md) |
| [patch-dsh-cordis-inspect-idempotent](./patches/patch-dsh-cordis-inspect-idempotent/) | 修复 `dsh-tool-cordis` Host inspect provider 注册非幂等导致的「含 tool-cordis 的预设（官方 `cordis` / `ptc-cordis` / `matt-cordis`）同进程互斥」。详见 [README](./patches/patch-dsh-cordis-inspect-idempotent/README.md) |
| [ptc-preset-fusion-checklist](./patches/ptc-preset-fusion-checklist/) | **PTC 融合预设防错清单（经验文档）**：写新融合 preset 前逐项核对——persona 融合、技能注释、mode 与措辞一致、同步与验证；附标准 persona 契约文案（ptc/both 两版）与排查命令。详见 [README](./patches/ptc-preset-fusion-checklist/README.md) |
| [matt-presets-bootstrap](./patches/matt-presets-bootstrap/) | **三个 matt preset 的手工改动点说明与维护脚本**：相对官方材料的改动点清单（agent 组合与 grilling 技能）、一键 setup（插件同步 + preset 同步 + 自检）、grilling 会话 check 验收（散文预告必须伴随表单投递）。详见 [README](./patches/matt-presets-bootstrap/README.md) |

---

## 📄 许可证

[MIT](./plugins/dsh-workspace-tree/LICENSE) 

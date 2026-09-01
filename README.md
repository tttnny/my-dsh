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
| [@lynn123411/dsh-a6api](./plugins/dsh-a6api) | `dsh.bundle` + `dsh.client/web` | **A6API 接入**：将 A6API 聚合网关注册为 DSH 原生 LLM 提供商，提供多标签页视图、余额（$ / ¥）与调用明细、模型白名单同步、商户线路实时探测与全景指标卡片（含官方 vs 商户价格对比） | `dsh plugin --profile web add @lynn123411/dsh-a6api` |
| [@lynn123411/dsh-ask-user-grilling](./plugins/dsh-ask-user-grilling) | 普通 Cordis 插件（preset 工具行消费，非 bundle） | **grilling 适配工具**：`ask_user_grilling`（后台子代理闸门 / 强制多选 / 输入框补充（无每问补充选项）/ 轮末补充问题 / 题干引导不硬校验）+ `enter_plan_mode`（grilling 共识后自动进入计划模式）。配合 `matt-standard` 预设使用，不改动任何技能文件 | `dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling` |

---

## 🎨 Agent Presets（presets/）

| preset | 说明 |
| --- | --- |
| [ptc-cordis](./presets/ptc-cordis) | **PTC-Cordis 混合模式**：融合 PTC（`mode: ptc`：模型只见 `run_code`，全部工具经 SDK 以脚本调用）与 Cordis 动态插件编辑（`cordis_define`/`run`），含 `cordis-plugin-development` / `editing-cordis-compositions` 随附技能，开箱与官方 `standard` / `ptc` / `cordis` 并列可选 |
| [matt-standard](./presets/matt-standard) | **Matt 标准工程模式**：基于官方 `standard` 的全功能编码 Agent，随附 Matt Pocock 25 个工程/生产力技能（[mattpocock/skills](https://github.com/mattpocock/skills)，字节级原样）与 grilling 适配插件（`ask_user_grilling`：子代理闸门/强制多选/输入框补充/轮末补充/题干硬校验；`enter_plan_mode`）。只适配不改本意，不影响 implement 等其他会话 |
| [matt-ptc](./presets/matt-ptc) | **Matt PTC 模式（实验性）**：matt-standard 全量 + 官方 `ptc` 呈现（`mode: ptc`：模型只见 `run_code`，一次程序组合多步工具，grilling 交互也折叠进 SDK） |
| [matt-cordis](./presets/matt-cordis) | **Matt 创造模式**：matt-standard 全量 + 官方 `cordis` 创造能力（`tool-cordis` 动态插件工具集、两个随附技能并入 skills/、双平面 persona 追加） |

---

## 🛠️ 本地补丁脚本（patches/）

| 目录 | 说明 |
| --- | --- |
| [patch-dsh-finish-reason](./patches/patch-dsh-finish-reason/) | 修复「流结束不带 `finish_reason`」导致的 `Stream ended without finish_reason` 报错、内容丢弃与整轮重试（`openai-completions` 通用检查，覆盖 opencode.ai zen/go 等中转网关）。详见 [README](./patches/patch-dsh-finish-reason/README.md) |
| [patch-dsh-escalation-noop](./patches/patch-dsh-escalation-noop/) | 修复 `dsh-sandbox` 同模式 `sandbox_permissions` 升级报错（`danger→danger` no-op 放行，真实升级仍审批）。详见 [README](./patches/patch-dsh-escalation-noop/README.md) |
| [dsh-message-edit-log-compat](./patches/dsh-message-edit-log-compat/) | 修复第三方插件 `dsh-message-edit` 写入自定义事件 `message-edit/version` 导致的历史会话加载失败。详见 [README](./patches/dsh-message-edit-log-compat/README.md) |
| [patch-dsh-cordis-inspect-idempotent](./patches/patch-dsh-cordis-inspect-idempotent/) | 修复 `dsh-tool-cordis` Host inspect provider 注册非幂等导致的「含 tool-cordis 的预设（官方 `cordis` / `ptc-cordis` / `matt-cordis`）同进程互斥」。详见 [README](./patches/patch-dsh-cordis-inspect-idempotent/README.md) |
| [dsh-mattpocock-skills-deck](./patches/dsh-mattpocock-skills-deck/) | 修复第三方插件 `dsh-mattpocock-skills-deck` 无法检测 agent-preset 技能套件（红条「未检测到核心技能套件」）；候选根追加 `~/.dsh/.agent-presets/<id>/skills/`。详见 [README](./patches/dsh-mattpocock-skills-deck/README.md) |
| [ptc-preset-fusion-checklist](./patches/ptc-preset-fusion-checklist/) | **PTC 融合预设防错清单（经验文档）**：写新融合 preset 前逐项核对——persona 融合、技能注释、mode 与措辞一致、同步与验证；附标准 persona 契约文案（ptc/both 两版）与排查命令。详见 [README](./patches/ptc-preset-fusion-checklist/README.md) |

---

## 📄 许可证

[MIT](./plugins/dsh-workspace-tree/LICENSE) 
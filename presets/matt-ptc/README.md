# matt-ptc — Matt PTC 模式（实验性）

> **matt-standard 全量 ＋ 官方 `ptc` 呈现（`mode: ptc`）**：25 个 Matt Pocock 工程/生产力技能与 grilling 适配工具（`ask_user_grilling` / `enter_plan_mode`）原样保留，但模型只见 `run_code`，一切工具（含 grilling 交互）都通过生成的 SDK 以脚本形式调用。

> ⚠️ **实验性 preset**：早期版本用 `mode: both`（原生工具与 run_code SDK 并存），实测模型倾向直接调用原生工具、不会主动写脚本，PTC 呈现形同虚设；现改为官方 `ptc` 模式强制脚本化。副作用是 grilling 的多轮交互也必须写成代码通过 SDK 调用，不再有原生交互体验。若你更需要原生 grilling 交互，请改用 [matt-standard](./matt-standard/README.md)；若只想保留 PTC 脚本化能力，这是本 preset 的定位。

## 与 matt-standard 的关系

| 项 | matt-standard | matt-ptc |
| --- | --- | --- |
| 25 个 Matt 技能 | ✅ 字节级原样 | ✅ 字节级原样 |
| grilling 适配（ask_user_grilling / enter_plan_mode） | ✅ 原生工具 | ✅ 折叠进 SDK（脚本调用） |
| 禁止双层子代理（maxDepth: 1） | ✅ | ✅ |
| PTC 呈现 | ❌（纯原生工具） | ✅ `mode: ptc`（强制 run_code 脚本） |

`mode: ptc` 与官方 `ptc` 预设一致：模型只见 `run_code`，所有工具通过 SDK 调用；grilling 交互也因此被折叠进脚本。宿主未组装 TypeScript 代码运行时时本 preset 会在挂载时报错点名 `tool-presentation` 行。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-ptc）
mkdir -p ~/.dsh/.agent-presets/matt-ptc

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-ptc/agent.cordis.yml matt-ptc/preset.yml ~/.dsh/.agent-presets/matt-ptc/
cp -R matt-ptc/skills ~/.dsh/.agent-presets/matt-ptc/

# 3. 安装 grilling 适配插件（matt-standard 已装则跳过）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt PTC 模式」即可。

## 目录结构

```
matt-ptc/
├── agent.cordis.yml       # Preset 主配置（matt-standard 全量 + tool-presentation mode: ptc）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个技能（字节级原样，勿改）
```

## 验证

- `agentPresets.standingKeyFor('matt-ptc')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode` 与 `run_code`；技能目录 25 个。

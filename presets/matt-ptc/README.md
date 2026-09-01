# matt-ptc — Matt PTC 模式

> **matt-standard 全量 ＋ 官方 `ptc` 呈现（`mode: both`）**：25 个 Matt Pocock 工程/生产力技能与 grilling 适配工具（`ask_user_grilling` / `enter_plan_mode`）原样保留，同时模型额外获得 `run_code` ＋ 生成的 SDK——多步工具序列可写成一个 TypeScript 程序一次执行，grilling 交互仍走原生工具。

## 与 matt-standard 的关系

| 项 | matt-standard | matt-ptc |
| --- | --- | --- |
| 25 个 Matt 技能 | ✅ 字节级原样 | ✅ 字节级原样 |
| grilling 适配（ask_user_grilling / enter_plan_mode） | ✅ | ✅ |
| 禁止双层子代理（maxDepth: 1） | ✅ | ✅ |
| PTC 呈现 | ❌（纯原生工具） | ✅ `mode: both`（原生 + run_code SDK 并存） |

`mode: both` 而非官方 `ptc` 的 `mode: ptc`：纯 PTC 下模型只见 `run_code`，grilling 的多轮交互也会被迫写成代码；`both` 保留原生交互，同时获得批量编排能力。宿主未组装 TypeScript 代码运行时时本 preset 会在挂载时报错点名 `tool-presentation` 行。

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
├── agent.cordis.yml       # Preset 主配置（matt-standard 全量 + tool-presentation mode: both）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个技能（字节级原样，勿改）
```

## 验证

- `agentPresets.standingKeyFor('matt-ptc')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode` 与 `run_code`；技能目录 25 个。

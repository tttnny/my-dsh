# matt-cordis — Matt 创造模式

> **matt-standard 全量 ＋ 官方 `cordis` 预设的创造能力**：25 个 Matt Pocock 工程/生产力技能与 grilling 适配工具（`ask_user_grilling` / `enter_plan_mode`）原样保留，同时模型获得 `tool-cordis` 工具集（`cordis_define` / `cordis_run` / `cordis_inspect_*` 等）——可以定义、修改、运行并卸载动态 Cordis 插件，即读写自己正在运行的 Harness。

## 与 matt-standard 的关系

| 项 | matt-standard | matt-cordis |
| --- | --- | --- |
| 25 个 Matt 技能 | ✅ 字节级原样 | ✅ 字节级原样 |
| grilling 适配（ask_user_grilling / enter_plan_mode） | ✅ | ✅ |
| 禁止双层子代理（maxDepth: 1） | ✅ | ✅ |
| Cordis 工具集（tool-cordis） | ❌ | ✅ |
| 随附技能（editing-cordis-compositions / cordis-plugin-development） | ❌ | ✅（并入 skills/，共 27 个） |
| 双平面 persona 引导 | ❌ | ✅（追加在 grilling 纪律之后） |

persona 融合方式：matt-standard 的 grilling 纪律全文在前，官方 `cordis` 的「你运行在 DeepSeek Harness 上、可读写自身构成、预设作者路径、加载 editing-cordis-compositions 技能」引导追加在后——缺了后者 agent 不知道自己能改 harness。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-cordis）
mkdir -p ~/.dsh/.agent-presets/matt-cordis

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-cordis/agent.cordis.yml matt-cordis/preset.yml ~/.dsh/.agent-presets/matt-cordis/
cp -R matt-cordis/skills ~/.dsh/.agent-presets/matt-cordis/

# 3. 安装 grilling 适配插件（matt-standard 已装则跳过）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 创造模式」即可。

## 目录结构

```
matt-cordis/
├── agent.cordis.yml       # Preset 主配置（matt-standard 全量 + tool-cordis + persona 追加）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个（字节级原样）+ cordis 2 个随附技能
    ├── cordis-plugin-development/
    └── editing-cordis-compositions/
```

## 与官方 cordis 预设的共存注意事项

`@deepseek-ai/dsh-tool-cordis` 向全局单例 `ctx.cordisInspect` 注册 Host inspect provider 时**没有幂等处理**。同一 DSH 进程内先后挂载两个含 `tool-cordis` 的预设（官方 `cordis`、`ptc-cordis`、本预设任意两个）会触发 `already registered` 异常。若你确实需要同进程混用，运行仓库里的幂等补丁脚本（详见 [patch-dsh-cordis-inspect-idempotent](../patches/patch-dsh-cordis-inspect-idempotent/README.md)）。仅使用本预设则无需任何补丁。

## 验证

- `agentPresets.standingKeyFor('matt-cordis')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode` / `cordis_define`；技能目录 27 个。

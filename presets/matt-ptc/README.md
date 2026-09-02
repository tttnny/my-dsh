# matt-ptc — Matt PTC 模式（实验性）

> 官方 `ptc` 组合**逐字保留**（persona 零改动，`mode: ptc` 模型只见 `run_code`）＋ **Matt Pocock 的 25 个技能**（vendor 于 `skills/`）＋ **grilling 适配插件**（[`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)，工具折叠进 SDK 脚本调用）。

> **注意：实验性 preset**。PTC 模式下 grilling 的多轮交互也必须写成 `run_code` 程序（`await tools.ask_user_grilling({...})`），不再有原生交互体验。若你更需要原生 grilling 交互，请改用 [matt-standard](../matt-standard/README.md)。

设计原则与 matt-standard 相同：**不改原厂 preset 的任何行为**。全部 DSH 适配下沉到：

1. **技能层**：`skills/grilling/SKILL.md` 本地适配（三段旁注 + 格式块纯文本化 + 删除上游一句冲突指引，共 5 处；三个 matt preset 的三份逐字节相同——DSH delivery 旁注里的 `tools.<name>`-inside-`run_code` 段落是写给 PTC preset 的条件指引，在原生 preset 下无害）；
2. **插件层**：`ask_user_grilling` 闸门与表单硬约束 + `enter_plan_mode`。

`agent.cordis.yml` 相对官方 `ptc` 只有两处 `MATT-ADD` 附加改动（`customSkillDirs` + planning 组内插件行），升级原厂组合时重新复制官方文件并重打。

## 与 matt-standard 的关系

| 项 | matt-standard | matt-ptc |
| --- | --- | --- |
| 基底组合 | 官方 `standard` 逐字 | 官方 `ptc` 逐字 |
| 25 个 Matt 技能 | 有 | 有（仅 grilling/SKILL.md 带本地旁注） |
| grilling 适配（ask_user_grilling / enter_plan_mode） | 有（原生工具） | 有（折叠进 SDK，脚本调用） |
| PTC 呈现 | 无（纯原生工具） | 有（`mode: ptc`，强制 run_code 脚本） |

宿主未组装 TypeScript 代码运行时时本 preset 会在挂载时报错点名 `tool-presentation` 行。PTC 会话的 `run_code` 参数错误排查见 [ptc-preset-fusion-checklist](../../patches/ptc-preset-fusion-checklist/README.md)。

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
├── agent.cordis.yml       # 官方 ptc 逐字 + 两处 MATT-ADD 附加改动
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个技能（仅 grilling/SKILL.md 带本地旁注）
```

## 验证

- `agentPresets.standingKeyFor('matt-ptc')` → mounted OK；
- 真会话检查：工具清单含 `run_code`（原生工具仅它可见）；技能目录 25 个；grilling 轮通过 `run_code` 里的 `tools.ask_user_grilling` 走表单。

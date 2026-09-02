# matt-cordis — Matt 创造模式

> 官方 `cordis` 组合**逐字保留**（persona 零改动，含 `tool-cordis` 动态插件工具集与双平面引导）＋ **Matt Pocock 的 25 个技能**并入 `skills/`（与 cordis 随附 2 技能共 27 个）＋ **grilling 适配插件**（[`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)）。

设计原则与 matt-standard 相同：**不改原厂 preset 的任何行为**。全部 DSH 适配下沉到技能层（`skills/grilling/SKILL.md` 本地适配——三段旁注 + 格式块纯文本化 + 删除上游一句冲突指引，与另两 preset 逐字节相同）与插件层（`ask_user_grilling` 闸门/表单硬约束 + `enter_plan_mode`），persona 保持官方 cordis 原文。

`agent.cordis.yml` 相对官方 `cordis` 只有一处 `MATT-ADD` 附加改动：planning 组内加 `tool-ask-user-grilling` 行（`customSkillDirs` 官方 cordis 自带）。升级原厂组合时重新复制官方文件并重打。

## 与 matt-standard 的关系

| 项 | matt-standard | matt-cordis |
| --- | --- | --- |
| 基底组合 | 官方 `standard` 逐字 | 官方 `cordis` 逐字 |
| 25 个 Matt 技能 | 有 | 有（仅 grilling/SKILL.md 带本地旁注） |
| grilling 适配（ask_user_grilling / enter_plan_mode） | 有 | 有 |
| Cordis 工具集（tool-cordis） | 无 | 有 |
| 随附技能（editing-cordis-compositions / cordis-plugin-development） | 无 | 有（官方自带，并入 skills/ 共 27 个） |
| 双平面 persona 引导 | 无 | 有（官方 cordis 原文） |

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
├── agent.cordis.yml       # 官方 cordis 逐字 + 一处 MATT-ADD 附加改动（planning 组插件行）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个 + cordis 2 个随附技能（官方自带 customSkillDirs）
    ├── cordis-plugin-development/
    └── editing-cordis-compositions/
```

## 与官方 cordis 预设的共存注意事项

`@deepseek-ai/dsh-tool-cordis` 向全局单例 `ctx.cordisInspect` 注册 Host inspect provider 时**没有幂等处理**。同一 DSH 进程内先后挂载两个含 `tool-cordis` 的预设（官方 `cordis`、`ptc-cordis`、本预设任意两个）会触发 `already registered` 异常。若你确实需要同进程混用，运行仓库里的幂等补丁脚本（详见 [patch-dsh-cordis-inspect-idempotent](../../patches/patch-dsh-cordis-inspect-idempotent/README.md)）。仅使用本预设则无需任何补丁。

## 验证

- `agentPresets.standingKeyFor('matt-cordis')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode` / `cordis_define`；技能目录 27 个；grilling 轮走表单工具而非散文。

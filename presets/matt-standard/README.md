# matt-standard — Matt 标准工程模式

> 官方 `standard` 组合**逐字保留**（persona 零改动）＋ **Matt Pocock 的 25 个工程/生产力技能**（[mattpocock/skills](https://github.com/mattpocock/skills)，vendor 于 `skills/`）＋ **grilling 适配插件**（[`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)）。

设计原则：**不改原厂 preset 的任何行为**——原厂组合写得很标准，工具调用报错就一定是模型问题而非组合问题。全部 DSH 适配都下沉到两处：

1. **技能层**：仅 `skills/grilling/SKILL.md` 带本地适配（三个 matt preset 的三份逐字节相同；重同步上游时必须全部保留——共 5 处：格式块 emoji→纯文本改写、DSH delivery / Sub-agent rounds / Consensus→plan mode 三段旁注、删除上游 "don't block, ask the rest of the frontier now" 一句）：
   - **DSH delivery**：轮次的 Qn./Recommended: 格式只是逻辑结构，必须整轮一次 `ask_user_grilling` 调用（含元素映射表与散文轮恢复指令）；
   - **子代理停轮**：派遣子代理即输出任务列表、停止一切工具调用并结束回合，全部结算后才提问（插件闸门硬约束配合）；
   - **共识直入 plan mode**：用户确认共识后直接调 `enter_plan_mode`，不再先问「写方案还是直接执行」（用户明确不要方案除外）。
2. **插件层**（`dsh-ask-user-grilling`）：`ask_user_grilling`（子代理闸门 / 强制多选 / 补充机制 / 题干引导 / 描述即纪律）+ `enter_plan_mode`。

`agent.cordis.yml` 相对官方 `standard` 只有两处 `MATT-ADD` 附加改动：`skill-filesystem.customSkillDirs` 指向 `./skills/`；planning 组内加 `tool-ask-user-grilling` 行（其 `enter_plan_mode` 消费 realm 隔离的 `planMode` 服务，必须留在组内）。升级原厂组合时：重新复制官方文件，重打两处 MATT-ADD。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-standard）
mkdir -p ~/.dsh/.agent-presets/matt-standard

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-standard/agent.cordis.yml matt-standard/preset.yml ~/.dsh/.agent-presets/matt-standard/
cp -R matt-standard/skills ~/.dsh/.agent-presets/matt-standard/

# 3. 安装 grilling 适配插件（发布后）或本地同步（见 plugins/dsh-ask-user-grilling/README.md）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 标准」即可。

## 目录结构

```
matt-standard/
├── agent.cordis.yml       # 官方 standard 逐字 + 两处 MATT-ADD 附加改动
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个技能（仅 grilling/SKILL.md 带本地旁注）
```

## 验证

- `agentPresets.standingKeyFor('matt-standard')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode`；技能目录 25 个；grilling 轮走表单工具而非散文；implement 会话不受影响。

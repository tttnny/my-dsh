# matt-standard — Matt 标准工程模式

> 功能完整的编码 Agent（基于官方 `standard`），随附 **Matt Pocock 的 25 个工程/生产力技能**（[mattpocock/skills](https://github.com/mattpocock/skills)）与 **grilling 适配工具**（`@lynn123411/dsh-ask-user-grilling`）。

设计原则：**只适配不改本意**——25 个技能文件一个字节不改，预设只提供 DSH 侧的输送机制：

- `ask_user_grilling`：grilling 轮次专用提问工具——后台子代理闸门、强制多选、每问「补充」选项、轮末补充问题、题干只含问题本身的引导（不硬校验）；
- `enter_plan_mode`：grilling 共识确认后自动进入 plan mode 写方案，防止 agent 自行开始执行；
- persona 仅含 grilling 限定的 DSH 执行纪律，不影响 implement / to-spec / wayfinder / triage 等其他会话类型；
- **派遣即结束**：主 agent 派遣子代理后立即结束回合（状态行 = 名单 + 分工 + 自动继续说明），子代理结算通知自动唤醒；子代理逐个完成仅输出进度，全部完成后统一汇总进入下一轮；
- **禁止双层子代理**：`delegation` 两个委派工具行 `maxDepth: 1`，子代理再派遣直接报错。

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
├── agent.cordis.yml       # Preset 主配置（基于 standard，四处改动：persona / skill-filesystem / planning 组工具行）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # mattpocock/skills 25 个技能（字节级原样，勿改）
```

## 验证

- `agentPresets.standingKeyFor('matt-standard')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `enter_plan_mode`；技能目录 25 个；implement 会话不受影响。

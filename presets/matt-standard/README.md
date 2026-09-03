# matt-standard — Matt 标准工程模式

> 基底为官方 `standard` 组合（persona 保持官方原样）＋ **Matt Pocock 的 25 个技能**（`skills/`）＋ **grilling 投递插件** [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)。

行为特点：grilling 轮次**先以散文预告本轮问题、再以 `ask_user_grilling` 表单投递**作答；达成共识后不自动进入 plan mode，由你决定下一步。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-standard）
mkdir -p ~/.dsh/.agent-presets/matt-standard

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-standard/agent.cordis.yml matt-standard/preset.yml ~/.dsh/.agent-presets/matt-standard/
cp -R matt-standard/skills ~/.dsh/.agent-presets/matt-standard/

# 3. 安装 grilling 投递插件（或本地同步，见 plugins/dsh-ask-user-grilling/README.md）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 标准」即可。

## 目录结构

```
matt-standard/
├── agent.cordis.yml       # 组合配置（preset 挂载用）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 本说明文档（同步到 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # Matt 25 个技能（grilling/SKILL.md 含投递纪律）
```

## 验证

- `agentPresets.standingKeyFor('matt-standard')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling`；技能目录 25 个；grilling 轮次「散文预告 + 一次表单投递」成对出现（只预告不投递即为失守）；implement 会话不受影响。

> 插件功能与投递协议详见 [plugins/dsh-ask-user-grilling/README.md](../../plugins/dsh-ask-user-grilling/README.md)；维护与改动点说明见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

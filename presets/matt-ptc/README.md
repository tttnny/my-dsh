# matt-ptc — Matt PTC 模式（实验性）

> 基底为官方 `ptc` 组合（persona 保持官方原样；`mode: ptc` 下模型只见 `run_code`）＋ **Matt Pocock 的 25 个技能**（`skills/`）＋ **grilling 投递插件** [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)（经 SDK 折叠为脚本调用）。

> **注意：实验性 preset**。PTC 模式下 grilling 的每一轮也写成 `run_code` 程序（`await tools.ask_user_grilling({...})`），没有原生表单交互体验；若你需要原生交互，请改用 [matt-standard](../matt-standard/README.md)。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-ptc）
mkdir -p ~/.dsh/.agent-presets/matt-ptc

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-ptc/agent.cordis.yml matt-ptc/preset.yml ~/.dsh/.agent-presets/matt-ptc/
cp -R matt-ptc/skills ~/.dsh/.agent-presets/matt-ptc/

# 3. 安装 grilling 投递插件（matt-standard 已装则跳过）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt PTC 模式」即可。

## 与 matt-standard 的区别

| 项 | matt-standard | matt-ptc |
| --- | --- | --- |
| 基底组合 | 官方 `standard` | 官方 `ptc` |
| 模型可见工具 | 原生工具 | 仅 `run_code`（其他全部折叠进 SDK） |
| grilling 投递 | 原生 `ask_user_grilling` | `run_code` 内 `tools.ask_user_grilling` |

宿主未组装 TypeScript 代码运行时时本 preset 会在挂载时报错点名 `tool-presentation` 行。PTC 会话的 `run_code` 参数错误排查见 [patches/ptc-preset-fusion-checklist](../../patches/ptc-preset-fusion-checklist/README.md)。

## 验证

- `agentPresets.standingKeyFor('matt-ptc')` → mounted OK；
- 真会话检查：工具清单含 `run_code`（原生工具仅它可见）；技能目录 25 个；grilling 轮次经 `run_code` 内的 `tools.ask_user_grilling` 投递。

> 插件功能与投递协议详见 [plugins/dsh-ask-user-grilling/README.md](../../plugins/dsh-ask-user-grilling/README.md)；维护与改动点说明见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

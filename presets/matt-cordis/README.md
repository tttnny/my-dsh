# matt-cordis — Matt 创造模式

> 基底为官方 `cordis` 组合（persona 保持官方原样，含 `tool-cordis` 动态插件工具集与双平面引导）＋ **Matt Pocock 的 25 个技能**并入 `skills/`（与 cordis 随附 2 技能共 27 个）＋ **grilling 投递插件** [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/)。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-cordis）
mkdir -p ~/.dsh/.agent-presets/matt-cordis

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp matt-cordis/agent.cordis.yml matt-cordis/preset.yml ~/.dsh/.agent-presets/matt-cordis/
cp -R matt-cordis/skills ~/.dsh/.agent-presets/matt-cordis/

# 3. 安装 grilling 投递插件（matt-standard 已装则跳过）
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 创造模式」即可。

## 与官方 cordis preset 的共存注意事项

`@deepseek-ai/dsh-tool-cordis` 向全局单例 `ctx.cordisInspect` 注册 Host inspect provider 时**没有幂等处理**。同一 DSH 进程内先后挂载两个含 `tool-cordis` 的 preset（官方 `cordis`、`ptc-cordis`、本预设任意两个）会触发 `already registered` 异常。若你确实需要同进程混用，运行仓库里的幂等补丁脚本（详见 [patch-dsh-cordis-inspect-idempotent](../../patches/patch-dsh-cordis-inspect-idempotent/README.md)）。仅使用本预设则无需任何补丁。

## 验证

- `agentPresets.standingKeyFor('matt-cordis')` → mounted OK；
- 真会话检查：工具清单含 `ask_user_grilling` / `cordis_define`；技能目录 27 个；grilling 轮次「散文预告 + 一次表单投递」成对出现（只预告不投递即为失守）。

> 插件功能与投递协议详见 [plugins/dsh-ask-user-grilling/README.md](../../plugins/dsh-ask-user-grilling/README.md)；维护与改动点说明见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)。

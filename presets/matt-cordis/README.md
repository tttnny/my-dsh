# matt-cordis — Matt 创造模式

官方 `cordis` 组合（persona 保持官方原样，含 `tool-cordis` 动态插件工具集与双平面引导）＋ Matt Pocock 的 26 个技能并入 `skills/`（与 cordis 随附 2 个技能共 28 个）＋ grilling 投递插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md)。行为要点与 matt-standard 相同：grilling 轮次先以散文预告、再以 `ask_user_grilling` 表单投递作答。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-cordis）
mkdir -p ~/.dsh/.agent-presets/matt-cordis

# 2. 复制 preset 配置文件与技能目录
cp matt-cordis/agent.cordis.yml matt-cordis/preset.yml ~/.dsh/.agent-presets/matt-cordis/
cp -R matt-cordis/skills ~/.dsh/.agent-presets/matt-cordis/

# 3. 安装 grilling 投递插件
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 创造模式」即可。单独使用本 preset 无需任何额外补丁；同进程与官方 `cordis` / `ptc-cordis` 混用时的共存要求见 [patch-dsh-cordis-inspect-idempotent](../../patches/patch-dsh-cordis-inspect-idempotent/README.md)。

## 详细说明

配置细节、实现原理与使用说明一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)：官方基线与逐处改动清单、`agent.cordis.yml` 两处改动块（本 preset 官方自带 `customSkillDirs`，只余工具行替换）、`skills/grilling/SKILL.md` 成品全文、cordis 随附技能的来源、插件的注册安装要求、同步与校验步骤、DSH 或技能上游升级后的重打流程。本目录不含 README.md 之外的自有配置：`agent.cordis.yml` / `preset.yml` / `skills/` 就是成品，直接同步即用。

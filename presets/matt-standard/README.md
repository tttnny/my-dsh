# matt-standard — Matt 标准工程模式

官方 `standard` 组合（persona 保持官方原样）＋ Matt Pocock 的 26 个技能（`skills/`）＋ grilling 投递插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md)。行为要点：grilling 轮次先以散文预告本轮问题、再以 `ask_user_grilling` 表单投递作答；达成共识后不自动进入 plan mode。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-standard）
mkdir -p ~/.dsh/.agent-presets/matt-standard

# 2. 复制 preset 配置文件与技能目录
cp matt-standard/agent.cordis.yml matt-standard/preset.yml ~/.dsh/.agent-presets/matt-standard/
cp -R matt-standard/skills ~/.dsh/.agent-presets/matt-standard/

# 3. 安装 grilling 投递插件
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt 标准」即可。

## 详细说明

配置细节、实现原理与使用说明一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)：官方基线与逐处改动清单、`agent.cordis.yml` 两处改动块、`skills/grilling/SKILL.md` 四处本地改动的成品块、插件的注册安装要求、同步与校验步骤、DSH 或技能上游升级后的重打流程。本目录不含 README.md 之外的自有配置：`agent.cordis.yml` / `preset.yml` / `skills/` 就是成品，直接同步即用。

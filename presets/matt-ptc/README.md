# matt-ptc — Matt PTC 模式（实验性）

官方 `ptc` 组合（persona 保持官方原样，`mode: ptc` 下模型只见 `run_code`）＋ Matt Pocock 的 25 个技能（`skills/`）＋ grilling 投递插件 [`@lynn123411/dsh-ask-user-grilling`](../../plugins/dsh-ask-user-grilling/README.md)（经 SDK 折叠为脚本调用）。行为要点：grilling 轮次经 `run_code` 内的 `tools.ask_user_grilling` 投递，没有原生表单交互体验；需要原生交互请改用 [matt-standard](../matt-standard/README.md)。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 matt-ptc）
mkdir -p ~/.dsh/.agent-presets/matt-ptc

# 2. 复制 preset 配置文件与技能目录
cp matt-ptc/agent.cordis.yml matt-ptc/preset.yml ~/.dsh/.agent-presets/matt-ptc/
cp -R matt-ptc/skills ~/.dsh/.agent-presets/matt-ptc/

# 3. 安装 grilling 投递插件
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

重启 DSH 后，在新建会话界面选择「Matt PTC 模式」即可。

## 详细说明

配置细节、实现原理与使用说明一律见 [patches/matt-presets-bootstrap/README.md](../../patches/matt-presets-bootstrap/README.md)：官方基线与逐处改动清单、`agent.cordis.yml` 两处改动块、PTC 形态的 `skills/grilling/SKILL.md` 成品全文（`run_code` 程序内 `tools.ask_user_grilling`）、本 preset 与 matt-standard 的形态差异、插件的注册安装要求、同步与校验步骤、DSH 或技能上游升级后的重打流程。本目录不含 README.md 之外的自有配置：`agent.cordis.yml` / `preset.yml` / `skills/` 就是成品，直接同步即用。

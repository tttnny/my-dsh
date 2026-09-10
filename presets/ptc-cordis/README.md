# ptc-cordis — PTC-Cordis 混合模式

> 融合 **PTC** 与 **Cordis 创造能力**（`mode: ptc`）：模型只见 `run_code`，所有工具（含 `cordis_define` / `cordis_run`）都通过生成的 SDK 以脚本形式调用，既能用 SDK 一次组合多步工具，又能动态定义 / 修改 Cordis 插件。

安装后与官方 `standard` / `ptc` / `cordis` 预设并列，可在新建会话时直接选用。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 ptc-cordis）
mkdir -p ~/.dsh/.agent-presets/ptc-cordis

# 2. 复制 preset 配置文件与技能目录（无需复制 README.md）
cp ptc-cordis/agent.cordis.yml ptc-cordis/preset.yml ~/.dsh/.agent-presets/ptc-cordis/
cp -R ptc-cordis/skills ~/.dsh/.agent-presets/ptc-cordis/
```

重启 DSH 后，在新建会话界面选择「PTC-Cordis 混合模式」（或在 Settings -> General 设为默认）。

## 目录结构

```
ptc-cordis/
├── agent.cordis.yml       # Preset 主配置（基于 standard，叠加 PTC(ptc) 呈现与 cordis 创造能力）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # 随附 Agent 技能
    ├── cordis-plugin-development/
    └── editing-cordis-compositions/
```

## 与官方 cordis 预设共存补丁

> **仅在同一 DSH 进程中先后使用官方 `cordis` 预设与本预设时需要**（若仅使用本预设则无需打补丁）。

### 冲突根因
`@deepseek-ai/dsh-tool-cordis` 会向全局单例 `ctx.cordisInspect` 注册 Host inspect provider。由于该注册表未做幂等处理，同一进程先后加载两个包含 `dsh-tool-cordis` 的预设时会触发 `already registered` 异常。

### 修复
按 [patch-dsh-cordis-inspect-idempotent](../../patches/patch-dsh-cordis-inspect-idempotent/README.md) 执行（**纯文档补丁，无脚本**，由 AI 按文操作）：从**运行中的 DSH 进程**反推它实际加载的 `dsh-tool-cordis/lib/index.js`，改动其中一处注册循环，改完重启 DSH 生效。

> 不要按固定路径（DSH Desktop 应用包 / npm 全局根 / `~/.dsh/profiles/*`）去扫——同机可并存多套互不相干的 DSH 安装，扫到的那份未必是正在跑的那份。

# ptc-cordis — PTC-Cordis 混合模式

> 融合 **PTC** 与 **Cordis 创造能力**：原生工具与 `run_code` SDK 并存（`mode: both`），既能用 SDK 一次组合多步工具，又能动态定义 / 修改 Cordis 插件（`cordis_define` / `cordis_run`）。

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
├── agent.cordis.yml       # Preset 主配置（基于 standard，叠加 PTC(both) 呈现与 cordis 创造能力）
├── preset.yml             # Preset 元数据（显示名称与描述）
├── README.md              # 仓库说明文档（导入 ~/.dsh/.agent-presets/ 时不带入）
└── skills/                # 随附 Agent 技能
    ├── cordis-plugin-development/
    └── editing-cordis-compositions/
```

## 与官方 cordis 预设共存补丁

> 💡 **仅在同一 DSH 进程中先后使用官方 `cordis` 预设与本预设时需要**（若仅使用本预设则无需打补丁）。

### 冲突根因
`@deepseek-ai/dsh-tool-cordis` 会向全局单例 `ctx.cordisInspect` 注册 Host inspect provider。由于该注册表未做幂等处理，同一进程先后加载两个包含 `dsh-tool-cordis` 的预设时会触发 `already registered` 异常。

### 一键修复
对 `dsh-tool-cordis` 的 `lib/index.js` 添加幂等判断（同 ID provider 跳过重复注册）。脚本会同时搜索 npm 全局根与 DSH Desktop 应用包内的运行时副本：

```bash
node -e '
const fs = require("fs"), cp = require("child_process");
const candidates = [];
try { candidates.push(cp.execSync("npm root -g 2>/dev/null || pnpm root -g 2>/dev/null").toString().trim()); } catch {}
const app = "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules";
if (fs.existsSync(app)) candidates.push(app);
if (!candidates.length) { console.error("未找到候选搜索路径"); process.exit(1); }
const target = cp.execSync(`find ${candidates.map(c => `"${c}"`).join(" ")} -type f -path "*dsh-tool-cordis/lib/index.js" 2>/dev/null | head -n 1`).toString().trim();
if (!target) { console.error("未找到 dsh-tool-cordis"); process.exit(1); }
let s = fs.readFileSync(target, "utf8");
const old = "\tfor (const provider of hostInspectProviders(ctx)) ctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);";
const neu = "\tconst existingHostInspect = new Set(ctx.cordisInspect.list().filter(p => p.platform === \"host\").map(p => p.id));\n\tfor (const provider of hostInspectProviders(ctx)) {\n\t\tif (existingHostInspect.has(provider.manifest.id)) continue;\n\t\tctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);\n\t}";
if (s.includes("existingHostInspect")) { console.log("补丁已存在，无需重复应用"); }
else if (s.includes(old)) { fs.writeFileSync(target, s.replace(old, neu)); console.log("补丁已成功应用：", target); }
else { console.error("未匹配到待替换代码"); process.exit(2); }
'
```

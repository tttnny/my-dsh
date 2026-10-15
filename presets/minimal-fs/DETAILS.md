# minimal-fs 详情

> 本文档是 [README.md](./README.md) 的补充：与官方极简模式的异同、组成、声明形态、目录收窄与验证。

## 与官方极简模式的异同

| | 官方 `minimal`（极简模式） | 本 preset（极简-文件） |
| --- | --- | --- |
| persona | `prefix` 即完整系统提示词（`complete: true`）、关闭运行时快照 | **逐字相同** |
| shell | 持久 shell（`bash`，Windows 下 `pwsh`） | **整组不含**（PTY 服务、终端后端与工具行都没有） |
| 文件工具 | 只有 `read_image`（`read` / `write` / `edit` 关掉） | `read` / `write` / `edit`（`readImage: false`，`read_image` 不注册） |
| 上下文压缩 | 无 | 无 |
| 指令文件（`AGENTS.md`） | 不加载 | 不加载 |

身份与官方极简模式逐字一致：固定提示词、无运行时快照、无工具指引段落。差别在于官方极简模式把文件访问完全交给 shell（`cat` / `sed` / heredoc），这里把 shell 整个拿掉，只留三个结构化文件工具——模型没有别的执行通道，读、写、改都只能走这三个工具。

## 组成

```
minimal-fs/
├── package.json                  # bundle 声明：exports["./tool-filter"] + dsh.bundle.patch
├── minimal-fs.patch.yml          # preset 声明（@deepseek-ai/dsh-agent-preset 行）与其组合行
├── README.md
├── DETAILS.md
└── plugins/tool-filter/index.js  # 目录过滤行（本包的 ./tool-filter 导出）
```

顶层三行：`persona`（身份）、`tool-fs`、`tool-filter`（文件工具与其目录过滤）。没有 agent 自有服务，所以也没有 `isolate` realm；sandbox、审批、`fs` 服务与观察策略（写前必须读）都留在宿主组合里。

## 声明形态

一个 preset 由**插件组合包（bundle）**声明：`package.json` 的 `dsh.bundle.patch` 指向本目录的 `minimal-fs.patch.yml`，该 patch 往 profile 树里插一条 `@deepseek-ai/dsh-agent-preset` 行；preset 的组合行整体进这一行的 `config.plugins`，显示名与描述是 `config.name` / `config.description`，preset id 是 `config.id`。

`order: 5`：官方四条 preset 占用 1–4（`standard` 1、`ptc` 2、`minimal` 3、`cordis` 4），本 preset 排在它们之后。

**过滤行为什么写成包内子路径 `@lynn123411/dsh-preset-minimal-fs/tool-filter`**：preset 行由声明它那棵树按该树的 `baseUrl` 导入。bundle patch 的行整体合入 profile 的根 include，所以这个 `baseUrl` 是 **profile 目录**，不是本 preset 目录——实测一条探针 preset 行看到的 `baseUrl` 是 `file:///<DSH_HOME>/profiles/web/`。因此 `./plugins/tool-filter/index.js` 这种相对写法会落到 profile 下、永远够不到本目录；改用本包的 `exports` 子路径后，Node 从 profile 的 `node_modules`（即装进去的这份 bundle）解析到同一个文件。

## 目录收窄

`read_image` 不需要过滤：`@deepseek-ai/dsh-tool-fs` 按每个工具自己的开关装配，本 preset 的 `tool-fs` 行写 `readImage: false`，这个工具**根本不注册**。

要过滤的是 `grilling_form`。它由 `@lynn123411/dsh-grilling-form` 包内 `cordis.patch.yml` 的**根层行**注册（随该包进 `dsh.profile.bundles` 生效），注册进**全局层**、被每个 scope 继承——本 preset 靠「不声明就没有」是拿不到的，所以在名单里写下它，模型可见目录才回到这三件套。

过滤点是 `system-prompt/assemble` 这个 waterfall：它的 `assembly.tools` **就是模型最终收到的工具 schema 数组**（见 `PromptAssembly` 类型），返回的 assembly 是权威值。`plugins/tool-filter/index.js` 在那里按名单收窄——per-assembly、在本 preset 的 scope 内、不依赖行顺序、不碰上游包、不需要解析裸包名。

过滤只改模型目录：`grilling_form` 仍然注册在工具表里，直接点名调用它不会被拦下，而这个 preset 的场景里没有别的调用方。

## 安装与启用

```bash
# 装进 profile（npm 包名）
dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs

# 本仓库开发副本：在仓库根执行，命令把目录 link 进 profile 并登记包名
dsh plugin --profile web add ./presets/minimal-fs
```

重启 DSH 后，在新建会话界面选择「极简-文件」即可。preset 的挂载在进程内只装载一次，改 `minimal-fs.patch.yml` 或 `plugins/` 后要**重启 DSH**，不会热更已挂载的那一份。

## 验证

**组合解析（必跑）**——把本目录的 patch 叠到 web profile 上，看它能否进组合树：

```bash
node "<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  --profile web --patch presets/minimal-fs/minimal-fs.patch.yml --dump-config
# exit=0；输出里出现 preset-minimal-fs 行与其 config.plugins（persona / tool-fs / tool-filter）
```

`--dump-config` 只做组合、不装载，也不求值 `!!js`；它证明 patch 能解析，不证明工具目录。

**工具目录（唯一可信的那条）**——开一个本 preset 的真会话发一句话，然后读该会话日志里 `request/header` 记录的 `data.header.tools`（会话日志是 `session.v4.jsonl.zstd`）：

```bash
D=~/.dsh/sessions/--Users-tny-Desktop-work-my-dsh--/session-<id>
zstd -dc "$D/session.v4.jsonl.zstd" | python3 -c "
import sys, json
for raw in sys.stdin:
    raw = raw.strip()
    if raw.startswith('{'):
        try: obj = json.loads(raw)
        except Exception: continue
        if obj.get('type') == 'request/header':
            print([t['name'] for t in obj['data']['header'].get('tools', [])])
"
```

期望输出 `['edit', 'read', 'write']`——`bash` / `pwsh` 不出现，`read_image` 也不出现。UI 的「工具」面板只反映装配期的定义解析，不等于模型实际收到的目录——**以会话日志为准**。

**适配实测记录（0.2.1-alpha.4，2026-10-15）**

- **组合解析**：`node "<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile web --patch presets/minimal-fs/minimal-fs.patch.yml --dump-config` exit 0，组合树里 `preset-minimal-fs` 行带着 `persona` / `tool-fs` / `tool-filter` 三行，`tool-fs` 的 config 是 `read: true` / `readImage: false` / `write: true` / `edit: true`。
- **导出解析**：在 profile 目录里 `import('@lynn123411/dsh-preset-minimal-fs/tool-filter')` 成功，`inject` 为 `['systemPrompt']`。
- **真装载**（真 0.2.1-alpha.4 的 cordis `Context` + `ToolRuntime` + `SystemPrompt` + `dsh-tool-fs`，`attachments` 已挂载；带三组对照）：
  - 本 preset 那份 config 注册出 `read` / `write` / `edit`，`read_image` 取不到；
  - 对照一（同 config 只把 `readImage` 改回 true）：`read_image` 注册得上——上面的负例不是「这个上下文根本注册不了」；
  - 对照二（`read: false` / `write: false` / `edit: false`，`readImage: true`）：三个文件工具都取不到、`read_image` 在——四个开关各管各的；
  - 过滤行进这个组合后，`systemPrompt.assemble({}).tools` 的名字是 `["edit","read","write"]`；装进去之前是 `["edit","grilling_form","read","write"]`，且过滤后 `grilling_form` 仍注册在工具表里（`ctx.tools.get` 取得到）。

本轮没有重跑真会话日志那条路：上面的模型可见目录来自真内核装配，不是在会话日志的 `request/header` 里读回来的。`read_image` 与 `grilling_form` 的那两条对照已经分别钉住各自的负例（缺了对照，「取不到」也可能只是这个上下文根本装配不了它）。

**提示词形状（凭 0.2.1-alpha.4 与 0.2.0-rc.2 的实现对比）**：`dsh-system-prompt` 与 `dsh-persona` 的实现逐字未变，唯一的差别是 `CONTEXT_ORDERS` 多了 `TEAM_IDENTITY`（125）、`HARNESS_SOURCE`（200）、`WEB_SURFACE`（210）三条。`@deepseek-ai/dsh-harness-dev-context` 把「实现 checkout」与「Web GUI 地址」放在**根层**，同时注册 `harness:source` 与 `app:web-surface` 两个**段落**和两条**运行时上下文**。这两样都被本 preset 的身份行挡在外面：`complete: true` 让 `assemble` 只留那一个段落，`includeRuntimeContext: false` 让上下文只剩 `required` 的条目——两者都不带 `required`。因此模型仍只收到 `You are a helpful software engineer assistant.` 一句，`AGENTS.md`、技能目录、运行时快照都不出现。这一段是读宿主实现得出的结论，本轮没有在真会话的提示词里复测。

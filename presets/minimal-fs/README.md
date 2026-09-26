# minimal-fs — 极简文件测试模式

> 官方 `minimal`（极简模式）的**身份**，并入文件工具三件套（`read` / `write` / `edit`）——**没有 shell**。工具目录就是这三行：没有 `bash` / `pwsh`、没有 `glob` / `grep`、没有 `read_image`、没有 skills / 计划 / 目标 / 子代理 / 网页。专门用来做**模型能力对照测试**——排除一切命令执行与工具编排的便利，只看模型靠「读文件 + 写文件」能走多远。

## 与官方极简模式的异同

| | 官方 `minimal`（极简模式） | 本 preset（极简-文件） |
| --- | --- | --- |
| persona | `prefix` 即完整系统提示词（`complete: true`）、关闭运行时快照 | **逐字相同** |
| shell | 持久 shell（`bash`，Windows 下 `pwsh`） | **整组不含**（PTY 服务、终端后端与工具行都没有） |
| 文件工具 | 无（宿主那条 `tool-fs` 行被 web 层禁用） | `read` / `write` / `edit`（`read_image` 已移出模型可见目录） |
| 上下文压缩 | 无 | 无 |
| 指令文件（`AGENTS.md`） | 不加载 | 不加载 |

身份与官方极简模式逐字一致：固定提示词、无运行时快照、无工具指引段落。差别在于官方极简模式把文件访问完全交给 shell（`cat` / `sed` / heredoc），这里把 shell 整个拿掉，只留三个结构化文件工具——模型没有别的执行通道，读、写、改都只能走这三个工具。

## 组成

```
minimal-fs/
├── package.json                  # bundle 声明：exports["./tool-filter"] + dsh.bundle.patch
├── minimal-fs.patch.yml          # preset 声明（@deepseek-ai/dsh-agent-preset 行）与其组合行
├── README.md
└── plugins/tool-filter/index.js  # 目录过滤行（本包的 ./tool-filter 导出）
```

顶层三行：`persona`（身份）、`tool-fs`、`tool-filter`（文件工具与其目录过滤）。没有 agent 自有服务，所以也没有 `isolate` realm；sandbox、审批、`fs` 服务与观察策略（写前必须读）都留在宿主组合里。

## 声明形态

一个 preset 由**插件组合包（bundle）**声明：`package.json` 的 `dsh.bundle.patch` 指向本目录的 `minimal-fs.patch.yml`，该 patch 往 profile 树里插一条 `@deepseek-ai/dsh-agent-preset` 行；preset 的组合行整体进这一行的 `config.plugins`，显示名与描述是 `config.name` / `config.description`，preset id 是 `config.id`。

`order: 5`：官方四条 preset 占用 1–4（`standard` 1、`ptc` 2、`minimal` 3、`cordis` 4），本 preset 排在它们之后。

**过滤行为什么写成包内子路径 `@lynn123411/dsh-preset-minimal-fs/tool-filter`**：preset 行由声明它那棵树按该树的 `baseUrl` 导入。bundle patch 的行整体合入 profile 的根 include，所以这个 `baseUrl` 是 **profile 目录**，不是本 preset 目录——实测一条探针 preset 行看到的 `baseUrl` 是 `file:///<DSH_HOME>/profiles/web/`。因此 `./plugins/tool-filter/index.js` 这种相对写法会落到 profile 下、永远够不到本目录；改用本包的 `exports` 子路径后，Node 从 profile 的 `node_modules`（即装进去的这份 bundle）解析到同一个文件。

## 为什么过滤点在 `system-prompt/assemble`

`@deepseek-ai/dsh-tool-fs` 一个包同时注册 `read` / `write` / `edit` / `read_image`，**没有逐工具开关**。下面几条路都试过、都不成立：

- **`ctx.tools.restrict({ allow })`**：它筛的是**本 scope 继承来的**工具（全局层与祖先层），源码明确写了「never what its OWN layer registers」。preset 的模型可见行注册进的正是 preset 自己这一层，没有「继承来的工具」给它减 → `read_image` 原样留下。
- **兄弟行包 `ctx.tools.register`**：loader 用 `Promise.allSettled(config.map(...))` **并发**启动同一组合的所有行，所以「谁先 apply」是竞态；`dsh-tool-fs` 的 `read`/`write`/`edit` 在它 `apply` 里同步注册，过滤器落地时它已经注册完了 → 仍然留下。
- **旧的相对路径行**：preset 目录形态下成立（挂载把 baseUrl 改到组合目录），新形态下 `baseUrl` 是 profile 目录，相对行必挂（见上节）。

可用的落点是 `system-prompt/assemble` 这个 waterfall：它的 `assembly.tools` **就是模型最终收到的工具 schema 数组**（见 `PromptAssembly` 类型），返回的 assembly 是权威值。`plugins/tool-filter/index.js` 在那里按名单过滤——per-assembly、在本 preset 的 scope 内、不依赖行顺序、不碰上游包、不需要解析裸包名。这也正是官方自己隐藏 `read_image` 的机制（路由模型不支持图片输入时它就从该数组里被拿掉），属于设计内的缝。

过滤后 `read_image` 仍然注册在工具表里，只是**不出现在模型目录中**；直接点名调用它不会被过滤拦下，而这个 preset 的场景里没有别的调用方。

## 安装与启用

```bash
# 1. 把这份 bundle 装进 profile（发布后可直接用包名）
dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs

# 本地开发副本：直接装仓库里的目录，命令会 link 进 profile 并在 dsh.profile.bundles 登记包名
dsh plugin --profile web add "$PWD/presets/minimal-fs"
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

**工具目录（唯一可信的那条）**——开一个本 preset 的真会话发一句话，然后读该会话日志里 `request/header` 记录的 `data.header.tools`（0.1.7-rc.2 的会话日志是 `session.v4.jsonl.zstd`）：

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

**适配实测记录（0.1.7-rc.2，2026-09-26）**——隔离 `DSH_HOME` 建一个 web profile，用上面的 `dsh plugin add` 装本目录，再叠一条探针宿主行：等 preset 挂载后对它的 scope 调 `systemPrompt.assemble({ scope })`，打印行状态与模型可见目录。实测结果：

```
PROBE_ROWS     ["persona=up","tool-fs=up","tool-filter=up"]
PROBE_TOOLS    ["edit","read","write"]
PROBE_SECTIONS [{"name":"deployment:persona-prefix","text":"You are a helpful software engineer assistant."}]
PROBE_CONTEXTS []
```

反向对照（同组合、只去掉 `tool-filter` 行）：模型可见目录变成 `["edit","read","read_image","write"]`——`read_image` 确实是这一行移除的，不是它根本没注册。三条行全 `up` 说明过滤行是作为本包 `./tool-filter` 导出被解析并激活的。

其它同样值得确认的点：系统提示词只有 `You are a helpful software engineer assistant.` 一句，`AGENTS.md`、技能目录、运行时快照都不出现（`PROBE_CONTEXTS` 为空）。

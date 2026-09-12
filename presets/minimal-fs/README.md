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
├── agent.cordis.yml                    # 组合配置（preset 挂载用）
├── preset.yml                          # Preset 元数据（显示名称与描述）
├── README.md                           # 本说明文档（同步到 ~/.dsh/.agent-presets/ 时不带入）
└── plugins/tool-filter/index.js        # 目录过滤行（随 preset 目录走）
```

顶层三行：`persona`（身份）、`tool-fs`、`tool-filter`（文件工具与其目录过滤）。没有 agent 自有服务，所以也没有 `isolate` realm；sandbox、审批、`fs` 服务与观察策略（写前必须读）都留在宿主组合里。

### 为什么过滤点在 `system-prompt/assemble`

`@deepseek-ai/dsh-tool-fs` 一个包同时注册 `read` / `write` / `edit` / `read_image`，**没有逐工具开关**。下面两条路都试过、都在真会话里量过，都不成立：

- **`ctx.tools.restrict({ allow })`**：它筛的是**本 scope 继承来的**工具（全局层与祖先层），源码明确写了「never what its OWN layer registers」。preset 的模型可见行注册进的正是 preset 自己这一层，没有「继承来的工具」给它减 → `read_image` 原样留下。
- **兄弟行包 `ctx.tools.register`**：loader 用 `Promise.allSettled(config.map(...))` **并发**启动同一组合的所有行，所以「谁先 apply」是竞态；`dsh-tool-fs` 的 `read`/`write`/`edit` 在它 `apply` 里同步注册，过滤器落地时它已经注册完了 → 仍然留下。
- （第三条弯路：在 preset 插件里 `import '@deepseek-ai/dsh-tool-fs'`。用户 preset 目录里**裸包名不可解析**，装载直接失败——preset 只解析得到自己目录内的相对文件，内核包要走组合行的 `name:`。）

可用的落点是 `system-prompt/assemble` 这个 waterfall：它的 `assembly.tools` **就是模型最终收到的工具 schema 数组**（见 `PromptAssembly` 类型）。`plugins/tool-filter/index.js` 在那里按名单过滤——per-assembly、在本 preset 的 scope 内、不依赖行顺序、不碰上游包、不需要解析裸包名。这也正是官方自己隐藏 `read_image` 的机制（路由模型不支持图片输入时它就从该数组里被拿掉），属于设计内的缝。

过滤后 `read_image` 仍然注册在工具表里，只是**不出现在模型目录中**；直接点名调用它不会被过滤拦下，而这个 preset 的场景里没有别的调用方。

## 安装与启用

```bash
# 1. 创建 preset 目录（preset id 必须为 minimal-fs）
mkdir -p ~/.dsh/.agent-presets/minimal-fs

# 2. 复制组合文件、元数据与随附插件（无需复制 README.md）
cd presets   # 本仓库的 presets/ 目录
cp minimal-fs/agent.cordis.yml minimal-fs/preset.yml ~/.dsh/.agent-presets/minimal-fs/
cp -R minimal-fs/plugins ~/.dsh/.agent-presets/minimal-fs/
```

重启 DSH 后，在新建会话界面选择「极简-文件」即可。

## 验证

- **挂载验证**：`agentPresets.standingKeyFor('minimal-fs')` → mounted OK，且各行 `fiberState` 均已激活（没有行被静默跳过）。注意这只证明组合能装载，**不证明工具目录就是那三个**。
- **工具目录验证（唯一可信的那条）**：开一个本 preset 的真会话发一句话，然后读该会话日志里 `request/header` 记录的 `header.tools`——那是**真正发给模型**的工具清单：

  ```bash
  D=~/.dsh/sessions/--Users-tny-Desktop-work-my-dsh--/session-<id>
  zstd -dc "$D/session.v3.jsonl.zstd" | python3 -c "
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

  期望输出 `['edit', 'read', 'write']`——`bash` / `pwsh` 不出现，模型没有任何命令执行通道。UI 的「工具」面板只反映装配期的定义解析，不等于模型实际收到的目录——**以会话日志为准**。
- 其它同样值得确认的点：系统提示词只有 `You are a helpful software engineer assistant.` 一句，`AGENTS.md`、技能目录、运行时快照都不出现。
- 改完 `agent.cordis.yml` 或 `plugins/` 后要**重启 DSH**：preset 的挂载在进程内只装载一次，改文件不会热更已挂载的那一份（实测：同进程里开新会话跑到的仍是旧组合）。

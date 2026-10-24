# @lynn123411/dsh-kimi-cu 装配与验证

写给维护者。用户面向的说明在 [README.md](./README.md)。

## 两行落在哪

`cordis.patch.yml` 只有一层 `insert`，两行都在根层：

| 行 id | 挂的包 | 作用 |
| --- | --- | --- |
| `mcp-kimi-cu` | `@deepseek-ai/dsh-mcp-client` | stdio 连 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu mcp -s user`，工具以 `mcp__kimi-cu__*` 出现在模型面前 |
| `skill-kimi-cu` | `@deepseek-ai/dsh-skill-filesystem` | 第二份技能 provider，只扫本包 `skills/` |

根层的意思是「进全局层」：profile 里每个 preset 的 agent 都能看到这批工具与这个技能。`dsh plugin --profile web add` 之后，本包名同时进 profile 的 `dependencies` 与 `dsh.profile.bundles`，`dsh.bundle.patch` 声明的这份 patch 随即并入层栈。

两行都带 `disabled: !!js process.platform !== 'darwin'`。守卫写在行上而不是包上：别的平台上插件照常可装可列，只是不启动任何一行。

## 为什么 MCP 那行要 `failOnStartupError: true`

KimiCU 的二进制在 app 包内，不是 PATH 上的命令。不设 `failOnStartupError` 时，初次连不上只写一行日志，模型看不到任何工具——用户侧的表现是「插件装了但没用」。设成 `true` 让那一行的 fiber 在激活时回滚并报错，故障当场看得见。

代价要讲清楚：激活失败会连带销毁这条连接的重连监督器，所以开机时 KimiCU 没在跑，它不会自己回来——把 KimiCU 打开之后，要在插件页里把这个插件关一次再开一次（或重启），那一行才会重新连。宿主本身照常启动：`mcp-kimi-cu` 不在内核的必需启动行清单里（`agent-loop`、`webserver` 那一组），所以表现是一行启动警告加一行激活错误，不是宿主起不来。

MCP 与技能是两行，MCP 失败不影响技能那一行。

环境变量按内核默认处理：ambient 环境里名字命中 `KEY` / `PASSWORD` / `SECRET` / `TOKEN` 的、以及 `DSH_*` 的会被丢掉，再叠 `config.env`。本插件不写 `env`，KimiCU 也不需要 DSH 注入任何凭据。

## 为什么技能行要另起一条

内核的 base bundle 已经挂了一条 `skill-filesystem`（`id: skill-filesystem`），负责项目目录（`<project>/.dsh/skills`、`<project>/.agents/skills`）与用户目录（`~/.dsh/skills`、`~/.agents/skills`）。本插件另起一条同包的行，`providerName: kimi-cu`、`includeDefaultRoots: false`、`customSkillDirs: [<本包>/skills]`：两个 provider 并存，各扫各的根，默认那条一行都不用动。

同名技能在各自 provider 内先到先得，跨 provider 由 `ctx.skills` 按层与 rank 合并。

## 技能目录为什么不能写相对路径

bundle patch 里的 `!!js` 表达式以**声明这份 patch 的那棵树**的 `baseUrl` 求值；对 bundle 层来说那是 profile 目录。所以技能目录写成先按包名解析出包目录、再拼 `skills`：

```yaml
- !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@lynn123411/dsh-kimi-cu/package.json')), 'skills')
```

表达式里用 `process.getBuiltinModule` 取内置模块：它在 ESM 求值作用域里直接可用，是 Node 22 起的正式入口。兄弟 preset `plugin-upgrade-cordis` 的 patch 用的是同一个形状。

## 随包技能从哪来

`skills/kimi-cu/SKILL.md` 是 KimiCU 自带技能的一份拷贝，装 KimiCU 时它在 `/Users/tny/.kimi-code/plugins/managed/kimi-cu/skills/kimi-cu/SKILL.md`。上游改了要人工再拷一次；拷贝进包，技能内容就不受 KimiCU 的安装布局影响。

技能只有这一份 `SKILL.md`，没有附带脚本或参考文件，所以包内也不需要额外转发资源。

## 验证

包目录里跑 `pnpm check`，它由两段组成：

1. `node scripts/check-bundle.mjs`——三层断言：
   - 清单面：`files`、`exports`、`icon` 点得到，locale 两种语言的标题与说明齐备，`SKILL.md` 的 frontmatter 合规。
   - 文本面：patch 只插两行、id 与内核包名对、两行都有 macOS 守卫、MCP 那行指向 app 内二进制且 `failOnStartupError: true`、技能那行另取 providerName 且关掉默认目录。
   - 契约面（本机装了内核才跑，缺内核时明说跳过）：用内核自带 `cordis-plugin-include` 的 `entryListSchema` 读这份 patch（与装载时同一份 YAML 方言），把两行 config 交给内核 `dsh-mcp-client` 与 `dsh-skill-filesystem` 的真 `Config` schema，再照 Loader 的方式求值技能目录那条表达式，确认结果就是本包 `skills/`。
2. `node ../../tools/probes/preset-skills.mjs --skills skills`——用内核真正的 skill provider 做一次发现与装载：候选名对得上、`source` 是 `custom`、零条警告、正文取得回来、`resourceBase` 指回技能目录。没装内核的机器上它明说跳过。

仓库级一次跑齐用 `node tools/check.mjs`（台账 + 每个包的 check + 产物新鲜度）。

机器上没有 KimiCU 时，前两段照跑，「KimiCU 真的连上了吗」不在 `check` 的范围内：那句要起真实例，用 `node tools/host-smoke.mjs` 或启用插件后看 MCP 工具是否出现。

## 实测记录

- 2026-10-25，内核 0.2.1-rc.2，macOS：`pnpm check` 两段全通过（`check-bundle` 11/11，`preset-skills` 报 1 个候选、装载通过）；技能候选名与目录名一致。
- 同日装进 web profile 后就地验证：`cordis_inspect_query` 的 `Config.listConfigs` 看到 `include:mcp-kimi-cu` 与 `include:skill-kimi-cu` 两行；工具表里出现 `mcp__kimi-cu__*`，调 `list_apps` 返回 11 个在跑的应用；技能目录里出现 `kimi-cu`；插件页卡片显示本包的标题与说明。

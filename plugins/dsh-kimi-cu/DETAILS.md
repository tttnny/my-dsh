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

KimiCU 的二进制在 app 包内，不是 PATH 上的命令。缺装、被移走、`mcp` 子命令没有响应时，默认行为是「宿主照常起，日志里一行错，模型看不到任何工具」——用户侧的表现是「插件装了但没用」。设成 `true` 让那一行启动即红，故障当场看见。MCP 与技能是两行，MCP 失败不影响技能那一行。

环境变量按内核默认处理：ambient 环境先脱敏，再叠 `config.env`。本插件不写 `env`，KimiCU 也不需要 DSH 注入任何凭据。

## 为什么技能行要另起一条，而不是改写默认那条

内核的 base bundle 已经挂了一条 `skill-filesystem`（`id: skill-filesystem`），它负责项目目录（`<project>/.dsh/skills`、`<project>/.agents/skills`）与用户目录（`~/.dsh/skills`、`~/.agents/skills`）。本插件要加第五个根，有两条路：

- 按 id 覆盖那条行的 `config.customSkillDirs`——配置文件少一行，但从今往后用户每加一个技能目录都要改这个插件的 patch，而且覆盖是整份替换，内核改默认值时本插件也跟着过期。
- 另起一条行，`providerName: kimi-cu`、`includeDefaultRoots: false`、`customSkillDirs: [<本包>/skills]`——两个 provider 并存，各扫各的根，同名技能在各自 provider 内先到先得，跨 provider 由 `ctx.skills` 的层与 rank 合并。默认那条一行都不用动。

选的是后者。

## 技能目录为什么不能写相对路径

bundle patch 里的 `!!js` 表达式以**声明这份 patch 的那棵树**的 `baseUrl` 求值；对 bundle 层来说那是 profile 目录。所以：

- `./skills` 会解析成 `<profile>/skills`——一个不存在的目录，技能发现拿到空表，页面上什么也不报。
- 正确写法是先按包名解析出包目录，再拼 `skills`：

```yaml
- !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@lynn123411/dsh-kimi-cu/package.json')), 'skills')
```

`process.getBuiltinModule` 而不是 `require`：后者在 ESM 求值作用域里不一定在，前者是 Node 22 起的正式入口。兄弟 preset `plugin-upgrade-cordis` 的 patch 用的是同一个形状。

## 随包技能从哪来

`skills/kimi-cu/SKILL.md` 是 KimiCU 自带技能的一份拷贝，装 KimiCU 时它在 `/Users/tny/.kimi-code/plugins/managed/kimi-cu/skills/kimi-cu/SKILL.md`。插件不追上游：上游改了要人工再拷一次。拷贝而不是指向上游目录，理由是上游路径属于 KimiCU 的安装布局，KimiCU 卸载或改布局之后，指向它的技能会静默消失。

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

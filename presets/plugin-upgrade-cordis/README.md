# plugin-upgrade-cordis — 插件升级创造模式

> 官方**创造模式**（preset id `cordis`）**逐字保留**：同样的 persona、同样的工具矩阵、同样的计划 / 压缩 / 子代理编排与动态插件工具 `tool-cordis`。在此之上并入 [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill) 的 **11 个插件工程技能**（随包 `skills/`）。会话选择器里的显示名是**插件升级创造模式**。

## 与官方创造模式的异同

| | 官方 `cordis`（创造模式） | 本 preset（插件升级创造模式） |
| --- | --- | --- |
| persona / 工具矩阵 / 计划 / 压缩 / 子代理 | — | **逐字相同**（`plugin-upgrade-cordis.patch.yml` 是官方 `presets/cordis.patch.yml` 抄一份，只改行 id、`config.id`、显示名与说明、`config.order`，再在 `skill-filesystem` 行加一个 custom root） |
| 技能目录 | 官方随附 4 个（`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`） | **同一行再加一个 custom root**，多出本包的 11 个插件工程技能（官方那 4 个照旧在列） |
| 显示名 / order | 创造模式 / 4 | 插件升级创造模式 / 6 |

`skill-filesystem` 那一行只改了 `customSkillDirs`：在官方那条之前插入本包的根，其余字段一字未动。

## 组成

```
plugin-upgrade-cordis/
├── package.json                       # bundle 声明：dsh.bundle.patch + exports["./package.json"]
├── plugin-upgrade-cordis.patch.yml    # preset 声明与全部组合行（= 官方 cordis 行 + 本包技能根）
├── README.md                          # 本文件
├── UPSTREAM.md                        # 上游来源、钉住的 commit、再同步步骤与哈希配方
├── check-upstream.mjs                 # 上游同步检查：在线看漂移，--verify 查完整性，--write 重建锁
├── upstream-lock.json                 # 钉住的 commit ＋ 11 个技能的树哈希（v1）
├── skills/                            # 11 个技能目录（上游逐字，各带自己的 references/ scripts/ examples/）
│   ├── plugin-upgrade/  plugin-workflow/  plugin-write/  plugin-test/
│   ├── plugin-release/  plugin-runtime-debug/  plugin-fleet-sweep/
│   ├── plugin-heavy-dep/  dsh-upgrade-audit/  dsh-benchmark-case/
│   ├── generic-migration/
│   └── LICENSE                        # 上游 MIT 许可原文
└── upstream/                          # 上游 skills/README.md、README.en.md（原文，不参与技能发现）
```

`skills/` 根下**只有 11 个技能目录与一个非 `.md` 文件**（`LICENSE`）。技能发现对根下的每个目录找 `<dir>/SKILL.md`、对根下的每个 `.md` 文件当扁平技能解析——上游那两份 `skills/README*.md` 因此挪到 `upstream/`，否则每次装载都会各报一条 `missing YAML frontmatter` 警告。

## 随包技能

| 技能 | 做什么 |
| --- | --- |
| `plugin-upgrade` | 只读检查、已装插件升级、宿主版本兼容迁移；七类触点 + 版本卡 + 安全回滚 |
| `plugin-workflow` | 跨阶段编排插件生命周期：能力菜单、阶段账本、一次授权贯穿 |
| `plugin-write` | 写 DSH 插件：仓库模式与扩展形态选择、命名校验、版本适配 |
| `plugin-test` | 为插件变更选最小充分测试层级；含版本迁移的七触点测试流程 |
| `plugin-release` | 打包、发布与分发：发布轨选择、未发布 cohort 安装、CI 门禁与回滚 |
| `plugin-runtime-debug` | 依宿主源码契约排查 Web 插件运行时故障（粘贴 / 附件 / 输入机、版本 chip） |
| `plugin-fleet-sweep` | 宿主升级后整队巡检已装插件：逐插件判定与修复发布循环 |
| `plugin-heavy-dep` | 给轻量 Web 插件接重依赖：懒加载 chunk、宿主路由包含防护、SVG 白名单 |
| `dsh-upgrade-audit` | 审计两个 DSH 版本间的外部兼容与回滚，产出 UPGRADE-ADAPTATION 报告 |
| `dsh-benchmark-case` | 把真实升级经验提取成可自动判分的 Harbor 考题 |
| `generic-migration` | 框架无关的迁移方法论（benchmark 侧的 generic 对照组） |

### 版本卡覆盖

`plugin-upgrade` 的正文只留决策流程，版本事实全在 `skills/plugin-upgrade/references/v*.md`——**卡覆盖到哪，技能就能可靠用到哪**。随包（上游 `ef07576`，查于 2026-10-06）的现状：

| 走廊（`from → to`） | 覆盖 |
| --- | --- |
| `dsh-v0.1.7-rc.2 → dsh-v0.2.0-rc.1` | ✅ 6 张卡（[v0.2.0-rc.1.md](skills/plugin-upgrade/references/v0.2.0-rc.1.md)） |
| `dsh-v0.1.7-rc.1 → dsh-v0.1.7-rc.2` | ❌ 未成卡（卡文件内自带声明） |
| `dsh-v0.2.0-rc.1 → dsh-v0.2.0-rc.2` | ⚠️ 只有同文件末尾两条 field notes，未成卡 |
| `dsh-v0.2.0-rc.2 → dsh-v0.2.1-alpha.1` | ❌ 上游尚无（DSH 已发布 0.2.1-alpha.1） |

完整索引在 [references/README.md](skills/plugin-upgrade/references/README.md)，**按 `from → to` 走廊读，不按文件名顺序**。目标版本没有卡时，**同步上游解决不了**——那正是随包 `dsh-upgrade-audit`（对比两个版本、产证据）与 `plugin-workflow`（编排）的用武之地；产出的证据可以回馈成上游的一张新卡。

## 声明形态

一个 preset 由**插件组合包（bundle）**声明：`package.json` 的 `dsh.bundle.patch` 指向本目录的 `plugin-upgrade-cordis.patch.yml`，该 patch 往 profile 树里插一条 `@deepseek-ai/dsh-agent-preset` 行；preset 的组合行整体进这一行的 `config.plugins`，显示名与描述是 `config.name` / `config.description`，preset id 是 `config.id`。

`order: 6`：官方四条占 1–4（`standard` 1、`ptc` 2、`minimal` 3、`cordis` 4），`minimal-fs` 占 5，本 preset 取已占用最大值 +1。台账在 [docs/rules/presets.md](../../docs/rules/presets.md)「order 台账」。

### 技能根为什么写成包名而不是相对路径

preset 行按**声明它那棵树**的 `baseUrl` 导入；bundle patch 的行整体合入 profile 的根 include，所以这个 `baseUrl` 是 **profile 目录**（`file:///<DSH_HOME>/profiles/web/`），不是本 preset 目录。`./skills` 这种相对写法会落到 profile 下、永远够不到本目录，结果是 `skill-filesystem` 拿不到任何自定义技能。

所以两个根都用 `!!js` 算绝对路径：

```yaml
- !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@lynn123411/dsh-preset-plugin-upgrade-cordis/package.json')), 'skills')
```

`createRequire(baseUrl).resolve(本包名)` 成立的**前提是本包已装进该 profile**——这正是 bundle 安装做的事。数组第一条（上面这条）是本包新增的，第二条是官方 `cordis` 行原有的写法（`@deepseek-ai/dsh-agent-preset/package.json`），一字未改；**顺序即优先级**。

## 安装与启用

```bash
# 装进 profile（npm 包名）
dsh plugin --profile web add @lynn123411/dsh-preset-plugin-upgrade-cordis

# 本仓库开发副本：在仓库根执行，命令把目录 link 进 profile 并登记包名
dsh plugin --profile web add ./presets/plugin-upgrade-cordis
```

装完**重启 DSH**，在新建会话界面选择「插件升级创造模式」。preset 的挂载在进程内只装载一次：改 `plugin-upgrade-cordis.patch.yml` 或 `skills/` 后要重启，不会热更已挂载的那一份。

## 验证

**组合解析（必跑）**——把本目录的 patch 叠到 web profile 上：

```bash
node "<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  --profile web --patch presets/plugin-upgrade-cordis/plugin-upgrade-cordis.patch.yml --dump-config
# exit=0；输出里出现 preset-plugin-upgrade-cordis 行与其 config.plugins
```

`--dump-config` 只组合、不装载、**不求值 `!!js`**，所以它证明 patch 能解析，不证明技能根算得对。

**随包完整性与形态（离线，必跑）**——`check-upstream.mjs --verify` 一次查三件事：`skills/` 根下只有 11 个技能目录与 `LICENSE`（没有会被当成扁平技能的散 `.md`）、每个目录的 `SKILL.md` frontmatter `name` 等于目录名且带 `description`、11 个技能的树哈希与 `upstream-lock.json` 逐一对上：

```bash
node presets/plugin-upgrade-cordis/check-upstream.mjs --verify
# 期望：PASS 11 skills match the lock (oh-my-dsh/dsh-plugin-upgrade-skill@ef075767)
# exit 0=一致；1=本地内容/形态漂了；2=锁缺失或读不到
```

**该不该同步上游（在线）**——比对钉住的 commit 与上游当前 `skills/`，只认收录范围内的变更：

```bash
node presets/plugin-upgrade-cordis/check-upstream.mjs
# identical 或只列出 skills/ 下的变更；exit 1=该同步，exit 2=问不到（网络 / 限流，可设 GITHUB_TOKEN）
```

`--verify` 只查形态与完整性，**不查技能发现**。要查发现，用真实的 `@deepseek-ai/dsh-skill-filesystem`：`FileSystemSkillProvider` 以 `customSkillDirs=[<本目录>/skills]`、`includeDefaultRoots: false`、`watch: false` 构造，`list({ cwd })` 应给 11 个 `source=custom` 候选、0 条 `logger.warn`，逐个 `get()` 都能取到正文——这正是 preset 那一行在宿主里跑的同一条代码路径。

**真装载**——隔离 `DSH_HOME` 的 profile 里 `dsh plugin add` 本目录后 boot（`--port 0 --no-open`），在新会话里选中本 preset，打开 `/` 菜单的「技能」段：应与官方 4 个技能同时在列。实测记录见下。

### 适配实测记录（0.2.0-rc.2，2026-10-06）

隔离 `DSH_HOME`（复制 web profile 后 `pnpm install` 重建 `link:`）装本目录并 boot，无任何启动诊断；选择器按 order 列出：

```
标准模式  PTC 模式  极简模式  创造模式  极简-文件  插件升级创造模式(第 6 位)
```

选中「插件升级创造模式」后，`/` 菜单「技能」段列出官方 4 个 + 本包 11 个（`dsh-benchmark-case`、`dsh-upgrade-audit`、`generic-migration`、`plugin-fleet-sweep`、`plugin-heavy-dep`、`plugin-release`、`plugin-runtime-debug`、`plugin-test`、`plugin-upgrade`、`plugin-workflow`、`plugin-write` 全部在列）。同一次跑的裸探针（真实 `FileSystemSkillProvider` + `customSkillDirs=[skills/]`）给：11 个候选、`source=custom`、0 条警告、每个 `SKILL.md` 正文可加载，`resourceBase` 指向各自的技能目录。

## 已知边界

- **上游技能正文按上游仓库根写**：`dsh-benchmark-case` 提到 `benchmark/tasks/`、`scripts/validate.mjs`，`plugin-release` / `plugin-test` 提到上游的 cohort 与快照目录。这些**不是本包内容**，本包只随 `skills/`——用到那些技能时按上游仓库（或用户自己的插件仓库）的实际布局走。上游的 `scripts/`、`benchmark/`、`paper/` 一律未收录。
- **技能正文逐字复制、不做本地改写**：要改内容就改上游，再按 [UPSTREAM.md](./UPSTREAM.md) 重新同步，否则下次同步会把本地改动冲掉。`check-upstream.mjs --verify` 就是用来抓这种「本地被改过」的。
- **上游更新了要不要跟**：只看 `skills/` 下的变更——`node check-upstream.mjs` 说了算；上游的 `benchmark/` / `paper/` / CI 再热闹也与此无关。**卡缺口（见上「版本卡覆盖」）不是同步能解决的**，那种目标版本要用 `dsh-upgrade-audit` 自己产证据。
- 上游 `skills/README.md` 的收录清单与作者表保留在 `upstream/`，便于对照。

## 许可证

包自身 `license: MIT`（见 `package.json`）。`skills/` 下的技能内容来自 [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill)（MIT），许可证原文随包放在 `skills/LICENSE`。

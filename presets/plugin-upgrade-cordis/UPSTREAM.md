# 上游来源与再同步

本 preset 的 `skills/` 是**上游仓库的逐字复制**，不是依赖。这份文件记来源、钉住的提交、哈希配方、同步步骤与判据；机器可读的那一份是 [upstream-lock.json](./upstream-lock.json)，检查工具是 [check-upstream.mjs](./check-upstream.mjs)。

## 来源

| | |
| --- | --- |
| 仓库 | [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill) |
| 钉住的提交 | `ef075767b476e8000c716a18f848028eebcd5aef`（2026-10-05，`main`）——以 `upstream-lock.json` 的 `commit` 为准，本表只是人读的副本 |
| 许可证 | MIT（`Copyright (c) 2026 dsh-plugin-upgrade-skill contributors`），原文随包在 `skills/LICENSE` |

**为什么是复制而不是 `dependencies`**：上游 `package.json` 是 `"private": true`，未发布到 registry，preset 行按包名 `createRequire(baseUrl).resolve(...)` 解析时够不到它；复制成随包目录后 preset 自带全部技能，`files` 里带上 `skills` 即可发布。

## 什么时候需要同步

只看**收录范围内**的变更：`skills/**`（含版本卡 `skills/plugin-upgrade/references/v*.md`）与 `skills/README*.md`。上游的 `benchmark/`、`paper/`、`output/`、`scripts/`、CI 与本包无关。

```bash
node presets/plugin-upgrade-cordis/check-upstream.mjs          # 在线：钉住提交 → 上游 main，只列 skills/ 下的变更
node presets/plugin-upgrade-cordis/check-upstream.mjs --verify # 离线：本地树是否仍与锁一致（抓本地被改过）
```

exit 0 = 无需动作，1 = 该同步 / 本地漂了，2 = 问不到（网络、限流可设 `GITHUB_TOKEN`、提交被改写）。

**版本卡缺口不属于同步问题**：目标 DSH 版本在上游没有对应卡时，同步也变不出卡来——那要用随包的 `dsh-upgrade-audit` 自己产证据（见 README.md「版本卡覆盖」）。

## 收录范围

| 上游路径 | 本包去处 |
| --- | --- |
| `skills/<11 个技能目录>/**` | `skills/<同名目录>/**`（逐字） |
| `skills/LICENSE`（仓库根 `LICENSE` 同文） | `skills/LICENSE` |
| `skills/README.md`、`skills/README.en.md` | `upstream/README.md`、`upstream/README.en.md`（原文；不能留在 `skills/` 根，否则被当成扁平技能解析并报 `missing YAML frontmatter`） |
| `scripts/`、`benchmark/`、`paper/`、`output/`、`.agents/`、`.claude-plugin/`、`.codex-plugin/`、`CONTRIBUTING*.md` | **不收录** |

11 个技能目录：`dsh-benchmark-case`、`dsh-upgrade-audit`、`generic-migration`、`plugin-fleet-sweep`、`plugin-heavy-dep`、`plugin-release`、`plugin-runtime-debug`、`plugin-test`、`plugin-upgrade`、`plugin-workflow`、`plugin-write`。

## 再同步步骤

```bash
# 1) 取上游（只取 skills/，浅克隆 + sparse，避免拉 benchmark/ 与 paper/）
cd tmp && rm -rf dsh-plugin-upgrade-skill
git clone --depth 1 --filter=blob:none --sparse https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
cd dsh-plugin-upgrade-skill && git sparse-checkout set skills
NEW=$(git rev-parse HEAD)    # 新提交号

# 2) 复制。注意 macOS 的 `cp -R src/ dest/` 会把 src 的「内容」摊进 dest，
#    必须显式给出目标目录名，否则 11 个技能会被合并成一层共享的根
ID=plugin-upgrade-cordis
SRC=$PWD/skills
cd /Users/tny/Desktop/work/my-dsh
rm -rf presets/$ID/skills && mkdir -p presets/$ID/skills
for d in "$SRC"/*/; do cp -R "$d" "presets/$ID/skills/$(basename "$d")"; done
cp "$SRC/README.md" "$SRC/README.en.md" presets/$ID/upstream/
curl -sS "https://raw.githubusercontent.com/oh-my-dsh/dsh-plugin-upgrade-skill/$NEW/LICENSE" -o presets/$ID/skills/LICENSE

# 3) 重新钉锁（会先查形态，树不正则拒绝写入），然后验
node presets/$ID/check-upstream.mjs --write --commit "$NEW"
node presets/$ID/check-upstream.mjs --verify
```

因为 web profile 里是 `link:` 开发副本，**不需要重新安装**；改完重启 DSH 即可。

## 同步判据

1. `check-upstream.mjs --verify` PASS（= 11 个技能的树哈希与锁逐一对上，`skills/` 根无散 `.md`，每个 `SKILL.md` 的 `name` 等于目录名）；
2. `diff -rq <上游>/skills/<n> presets/<id>/skills/<n>`（外加 `LICENSE`）逐目录全绿——第 1 条只证明「和锁一致」，这一条才证明「和上游一致」；
3. `check-upstream.mjs` 在线模式报 `identical`（钉的提交就是当前上游该路径的状态）；
4. **真实发现**：按 README.md「验证」第二条（真实 `FileSystemSkillProvider` + `customSkillDirs=[skills/]`）跑一遍，报 11 个候选、0 条警告；
5. **组合仍能解析**：`--dump-config` exit 0 且出现 `preset-plugin-upgrade-cordis` 行；
6. **真装载**：隔离 `DSH_HOME` boot 后在 `/` 菜单「技能」段看到 11 个技能（步骤见 README.md「验证」）。

上游 `skills/README.md` 的表若增删了技能，本 preset 的 `README.md`「随包技能」表、`package.json` 的 `description`、`upstream-lock.json`（`--write` 自动）一起改；内容变了就把 `package.json` 的 `version` 加一位。

## 哈希配方

`upstream-lock.json` 里 `skills[name]` 是该技能目录的树哈希，`hash` 是整份收录集的集合哈希。规则固定、可复算：

1. 目录内文件按目录相对 POSIX 路径排序，跳过 `.git` 与 `.DS_Store`；
2. 逐个文件喂 `sha256`：`<相对路径>\0<文件字节>\0`；符号链接喂 `link:<目标文本>`；
3. 技能树哈希 = 上述 `sha256` 的十六进制，前缀 `sha256-`；
4. 集合哈希 = 对每个技能按名字排序后喂 `<技能名>\0<该技能树哈希>\n` 的 `sha256`。

要改配方就得同时改 `check-upstream.mjs` 与本节，并重跑 `--write`。

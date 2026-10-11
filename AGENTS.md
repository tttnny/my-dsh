# AGENTS.md

`my-dsh` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(DSH)的插件/preset合集。

DSH 源码已拉取到本地 `/Users/tny/Desktop/work/other/deepseek-harness`；查宿主实现、契约类型与官方门禁时直接读它。

## 硬约束

1. **发布听令，发完即止**：`npm publish` / `git push` 只在用户下令后执行；发完不装、不查、不追问。
2. **开发副本是 `link:`**：`~/.dsh/profiles/web/node_modules/@lynn123411/dsh-*` 保持软链到本仓库目录；仓库根不放 `node_modules`。
3. **客户端半边只读已声明的服务**：漏声明不报错，只在页面里消失。
4. **状态只登记一处**：版本号归各包 `package.json`，功能域清单归根 `README.md`，preset order 归 `docs/rules/presets.md`；其他文件只写规则 + 指针。
5. **文档只写现状**：旧路径、旧命令、旧结论在改动当场删掉。
6. **读者是 agent**：给人看的只有根 `README.md` 与各包 `README.md`；本文件、`docs/rules/`、`presets/`、技能都写给 agent。
7. **验证按本仓库的脚本跑**：改哪个包就在哪个包目录按它 `scripts` 跑验证（多数包是 `pnpm check`）；仓库根没有 `package.json`，也没有仓库级脚本。`.githooks/pre-commit` 是同一件事的闸门（只跑本次改动的包），装法与跳法见 `docs/rules/plugins.md`「验证」。`dsh-plugin-authoring` 的仓库级门禁只对 DSH 官方 checkout 成立。

## 文档地图

| 这一步在做什么 | 文档 |
| --- | --- |
| 改 / 发 / 排障 `plugins/` 下的插件 | `docs/rules/plugins.md`（前门） |
| `npm publish`、产物与 `files` 门禁、镜像陈旧、退役归档 | `docs/rules/release.md` |
| 建 / 校验开发副本，或撞 `Cannot find package` | `docs/rules/dev-copy.md` |
| 插件从页面消失、宿主日志无异常 | `docs/rules/client-wiring.md` |
| 插件配置界面放哪、key 怎么来、静默失败 | `docs/rules/plugin-config-page.md` |
| `presets/` | `docs/rules/presets.md` |
| 根 `README.md` 的骨架与插件表 | `docs/rules/to-readme.md` |
| issue 与 wayfinder 票务、triage label、领域文档消费规则 | 见下方 `## Agent skills` |

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues (`tttnny/my-dsh`), read and written with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five triage state roles map to Chinese label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.

---
name: plugin-intake
description: 吸收第三方 DSH 插件：只保留源码，上游产物与许可文书一律清掉，并审计存量插件的残留。
disable-model-invocation: true
---

# Plugin intake

目标：`plugins/dsh-<name>` 只剩源码、测试、构建与运行必需的交付文件。

命名、README 三段式、order 台账、`link:` 开发副本、自检门禁归 [`docs/rules/plugins.md`](../../../docs/rules/plugins.md)，本技能不复述。

## 步骤

1. **逐条定性顶层条目**：只有「保留」「删除」。判据：无「先留着」的条目。
2. **先锚定引用，再删。** 整路径与**逐个 basename** 都要查——`path.join(ROOT, 'research', 'x.md')` 这类分段拼接，只查带斜杠的整路径必漏。裸词不算证据：`research`、`wizard` 常是功能名或面板名。判据：每个待删条目的 basename 查过，有引用的指出谁在用。
3. **按两张表搬与删。** 判据：`git ls-files plugins/<name>` 的顶层条目全部落在保留集内。
4. **重写身份。** 包名 `@lynn123411/dsh-<name>`；`repository` / `homepage` / `bugs` 指向 `tttnny/my-dsh`；README 按三段式重写。**分叉插件的 README 首段必须有一句上游署名，写明 `owner/repo` 与来源版本**——本库不放任何许可文书，这一行是全仓库唯一的分叉归属载体。判据：`package.json` 无上游 owner；该插件的 README 能被「审计存量插件」里的 owner 提取命令捞到。
5. **清悬挂引用。** 清单、脚本、注释、给人看的提示文字、`.gitignore` 全算。**指向运行期目标仓库或外部 URL 的是活引用，一个都不许碰**（`docs/agents/issue-tracker.md` 是插件与用户仓库之间的契约）。判据：源码里出现的每个相对路径都查存在性，不存在者为 0。
6. **打包自检。** 读该插件**发布清单**的 `files`：清单在根 `package.json`，或根是 private 开发壳、清单在 `package/package.json`（后者进该目录跑 `npm pack --dry-run`）。判据：`files` 与 pack 输出都不含删除表里的条目，也不含指向已删文件的条目。
7. **动手之前先测基线**，把失败数写进提交说明；删完重跑，**失败数不变才算没删坏**；全新导入要求全绿。别在 `git worktree` 里测——未跟踪的产物与环境不齐会造出假红。判据：基线数与删后数都在提交说明里。
8. **按 [`docs/rules/plugins.md`](../../../docs/rules/plugins.md) 收尾。** 判据：`link:` 生效、`node scripts/link-kernel-peers.mjs --check` 通过、该插件自检绿、README 与 order 台账已登记。

## 保留集

- `src/`、`tests/` — 上游测试是行为契约，整体带走，编译不过再逐条判定
- `tsconfig*.json`、`tsdown.config.ts` / `build.mjs`、`vitest.config.ts`、`build/`
- `package.json`（重写身份）、`cordis.patch.yml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`
- 第 2 步证明**被真实引用**的 `assets/`、`scripts/`、`examples/`、`wizard/`
- `README.md` — 按三段式重写，分叉署名行见步骤 4

## 上游产物（删）

| 类 | 条目 |
| --- | --- |
| 沿革 | `CHANGELOG.md`、`HISTORY.md` |
| 文档 | `docs/`（research、specs、adr、reviews、源码验证报告）、`AGENTS.md`、`CLAUDE.md` |
| 社区模板 | `CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md`、issue / PR 模板 |
| 工具与 CI | `.github/`、`.vscode/`、`.husky/`、`.changeset/`、`.editorconfig`、`.gitattributes`、`.npmignore`、release 配置 |
| 许可文书 | 一切 `LICENSE` / `LICENSE.*` / `COPYING`——**本库任何层级都不放**（仓库根也不放），许可只由各包 `package.json` 的 `license` 字段声明 |
| 只服务原仓库的发布流程 | 断言 `CHANGELOG` / `.github` 模板 / `docs/releases/` 的门禁与向导：在分叉里恒红，整条链（向导、向导库、独占它的测试）一起删 |
| 多语言 README | `README.zh.md`、`README.<locale>.md` |
| 营销素材 | README 配图、截图、作者联系二维码、聊天记录截图 |
| 营销素材的工具链 | 只为生成上述图而存在的脚本与测试；图删完它们就是读写不存在路径的死代码（`star-history` 那类） |
| 构建产物 | `build` 生成、被 `files` 收录的镜像目录（`package/shared/*` 与 `src/shared/*` 逐字节相同这类）——取消跟踪、补 `.gitignore`、接进产物门禁。同一产物目录只忽略了它的一半（`package/lib/`）而另一半入库，是漏网不是设计 |
| 悬挂条目 | 指向以上一切的 `files` / `scripts` / `.gitignore` / 注释 / 提示文字里的路径 |

## 审计存量插件

三条正向扫描。宁可多捞，不许用一条大正则把可疑目录设成「已知良好」而永久放过：

```bash
git ls-files plugins | grep -iE '\.(png|jpe?g|gif|webp|ico|mp4)$'                       # 图片与营销素材
git ls-files plugins | grep -iE '(^|/)(CHANGELOG|HISTORY|CONTRIBUTING|SECURITY|SUPPORT|CODE_OF_CONDUCT|AGENTS|CLAUDE|LICENSE|COPYING)(\.[-.\w]*)?$|/(docs|research|specs|reviews|adr|examples|wizard)/|\.github/'
git ls-files plugins | grep -E '/(package|dist|_pkg|out)/(lib|shared)/|^(client|host)\.js$'   # 被跟踪的构建产物镜像
```

owner 有两个来源，README 署名行缺了就用导入提交兜底（补完署名后不应再缺）：

```bash
git grep -hoE 'github\.com/[A-Za-z0-9_.-]+' -- 'plugins/*/README.md' | cut -d/ -f2 | sort -u
git log --oneline --diff-filter=A -- 'plugins/<name>'      # 导入提交的说明里写着上游 owner/repo 与来源版本
git grep -cI "<owner>" -- plugins | sort -t: -k2 -rn       # 按文件列命中数，再逐文件判下表
```

命中数按文件列出来再判：一个 owner 在 40 个文件里出现，往往同时含下表三类。

| 命中形态 | 处置 |
| --- | --- |
| 仓库装饰物：沿革、调研文档、CI/编辑器配置、营销配图、联系二维码 | 删 |
| **功能内容**：界面里渲染的上游仓库链接（尤其「去上游提 issue」这类把用户导向别人仓库的入口）、默认值、示例列表 | **交给人定**——改它等于改行为，别顺手换成我们的地址 |
| 溯源与真实数据：README 的分叉署名行、注释里的实测来源、抓取自真实 API 的 fixture | 留——改了 fixture 就成了假数据 |

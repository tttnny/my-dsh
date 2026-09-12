---
name: plugin-intake
description: 吸收第三方 DSH 插件：只保留源码，随包/随仓库的上游产物一律清掉，并审计存量插件是否还有上游残留。
disable-model-invocation: true
user-invocable: true
---

# Plugin intake

吸收的目标是 `plugins/dsh-<name>` 里只剩我们会维护的东西：**源码、测试、构建与运行必需的交付文件**。上游仓库的装饰物——沿革、调研与协议文档、CI/编辑器配置、营销素材与其工具链、构建产物——既不进仓库，也不进 npm 包。

命名、README 三段式、设置项 order 台账、`link:` 开发副本这些规则不在本技能里重复：[`docs/rules/plugins.md`](../../../docs/rules/plugins.md) 是它们的唯一归属。

## 步骤

1. **给每个顶层条目定性。** 通读上游目录，每个条目落到「保留」或「删除」。完成判据：没有「先留着」的条目。
2. **锚定引用，再决定删。** 两种写法都要查：整路径 `grep -rlF "examples/demo-mini" .`，以及**逐个 basename** `grep -rlF "489-appendix.md" .`——代码常把路径拆成段拼（`path.join(ROOT, 'research', '489-appendix.md')`），只查带斜杠的整路径会漏，删完才在测试里炸。裸词同样会骗人：`research`、`wizard` 常常同时是功能名或面板名，命中一堆源码却与那个目录无关。完成判据：每个待删文件的 basename 都查过，有引用的指出「谁在用」。
3. **搬保留集、删上游产物**（两张表见下）。构建产物单列一条：与 `build` 脚本和 `.gitignore` 对拍——**同一内容既在 `src/` 又被跟踪的产物副本**（`package/shared/*` 与 `src/shared/*` 逐字节相同这类）一律取消跟踪。同一产物目录被忽略了它的一半（`package/lib/`）而另一半入库，就是漏网而非设计。
4. **重写身份。** 包名 `@lynn123411/dsh-<name>`；`repository` / `homepage` / `bugs` 指向 `tttnny/my-dsh`；README 按三段式写。完成判据：`package.json` 里不再出现上游 owner。
5. **清悬挂引用。** 三处最容易漏：`package.json` 的 `files` 与 `scripts`；构建、冒烟、打包与 verify 脚本里对已删文件的读取或断言（上游自检常断言 `CHANGELOG.md` 含本版号，测试也常把某份 `research/` 文档当契约 fixture 读）；`.gitignore` 里指向已删产物的规则，以及**注释与给人看的提示文字里指向已删文档的路径**。第 3 处先把命中分成两类再动：**指向本仓库已删文档**的是死指针，改写掉；**指向运行期目标仓库或外部 URL** 的（`docs/agents/issue-tracker.md` 这类插件与用户仓库之间的契约、`https://…/docs/…` 这类外链）是活引用，一个都不许碰。完成判据：枚举源码里的 `docs/…` 命中并逐个查存在性，死指针为 0。
6. **打包自检。** 交付集不由本技能规定：读该插件**发布清单**的 `files`——本库有两种形态，清单在根 `package.json`，或根是 private 开发壳、清单在 `package/package.json`（后者要进清单所在目录跑 `npm pack --dry-run`）。完成判据：`files` 里没有上游产物，且 pack 输出不含 `docs/`、`research/`、`CHANGELOG`、`src/`、`tests/`，也不含构建产物的入库副本。
7. **跑目标插件自己的测试，并与删除前的基线比数字。** 基线**在真实工作树里测**：`git stash push -- <插件目录>` 回到改动前跑一次、`git stash pop` 恢复再跑一次；别在 `git worktree` 里测——未跟踪的产物与环境不齐会造出假红。存量插件**失败数不变才算没删坏**，全新导入则要求一次全绿。别把先前就存在的失败算到自己头上，也别用它掩盖新引入的失败。若本轮让 `.gitignore` 覆盖到原本已跟踪的目录，stash/pop 会在「既改注释又取消跟踪」的那个文件上撞冲突：`git rm -f <该文件>` 解掉，再用 `git stash show --name-only` 与 `git diff --name-only HEAD` 对差集确认全部落地，最后 `git stash drop`。
8. **按 [`docs/rules/plugins.md`](../../../docs/rules/plugins.md) 收尾**：`link:` 开发副本、内核 peer 链接与其 `--check`、README 与 order 台账、该插件自己定义的自检（`test` / `verify` / `check` 有哪个跑哪个）。细节归那份文档，本技能不复述。

## 保留集

- `src/`、`tests/` — 上游测试是行为契约，先整体带走，编译不过再逐条判定
- `tsconfig*.json`、`tsdown.config.ts` / `build.mjs`、`vitest.config.ts`、`build/`
- `package.json`（重写身份）、`cordis.patch.yml`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`
- `LICENSE` — 上游带的版权声明是分叉的授权依据，必须留；**缺 `LICENSE` 的分叉是待补项**，不等于「本来就可以不要」
- 第 2 步证明**被真实引用**的 `assets/`、`scripts/`、`examples/`、`wizard/`
- `README.md` — 按我们三段式重写，可留一句上游分叉署名

## 上游产物（删）

| 类 | 条目 |
| --- | --- |
| 沿革 | `CHANGELOG.md`、`HISTORY.md` |
| 文档 | `docs/`（research、specs、agents、源码验证报告）、`AGENTS.md`、`CLAUDE.md` |
| 社区模板 | `CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`SUPPORT.md`、issue / PR 模板 |
| 工具与 CI | `.github/`、`.vscode/`、`.husky/`、`.changeset/`、`.editorconfig`、`.gitattributes`、`.npmignore`、release 配置 |
| 只服务原仓库的发布流程 | 断言 `CHANGELOG` / `.github` 模板 / `docs/releases/` 的发布门禁与配套向导：在分叉里恒红，整条链（向导、向导库、独占它的测试）一起删，别留半条 |
| 多语言 README | `README.zh.md`、`README.<locale>.md` — 本仓库只留 `README.md` |
| 营销素材及其工具链 | README 配图、截图、作者联系二维码、聊天记录截图，以及只为生成这些图而存在的脚本与测试（`star-history` 那类） |
| 构建产物 | `build` 脚本生成、被 `files` 收录的镜像目录（`package/shared/` 这类）——取消跟踪、补 `.gitignore`，并把这条接进产物门禁 |
| 悬挂条目 | 指向以上一切的 `files` / `scripts` / `.gitignore` / 注释与提示文字里的路径 |

营销素材有两步容易漏：README 换成我们的之后配图成孤儿，但文件还躺在 `assets/` 里随仓库走；图删了，**生成图的脚本**还留着并读写已不存在的 `docs/*.json`。第 2 步的引用检查管前者，第 5 步管后者。

## 审计存量插件

新插件的判定同样适用于已吸收的插件。三条正向扫描——宁可多捞，不要用一条大正则把可疑目录设成「已知良好」而永久放过：

```bash
# 1) 图片与营销素材
git ls-files plugins | grep -iE '\.(png|jpe?g|gif|webp|ico|mp4)$'
# 2) 上游过程文档与治理件
git ls-files plugins | grep -iE '(^|/)(CHANGELOG|HISTORY|CONTRIBUTING|SECURITY|SUPPORT|CODE_OF_CONDUCT|AGENTS|CLAUDE)(\.md)?$|/(docs|research|specs|reviews|adr)/|\.github/'
# 3) 被跟踪的构建产物镜像
git ls-files plugins | grep -E '/(package|dist|_pkg|out)/(lib|shared)/|^(client|host)\.js$'
```

再查功能内容里的上游地址。owner 从各插件 README 的分叉署名行与 `LICENSE` 版权行现取，别凭记忆列：

```bash
git grep -hoE 'github\.com/[A-Za-z0-9_.-]+' -- 'plugins/*/README.md' 'plugins/*/LICENSE' | cut -d/ -f3 | sort -u
git grep -cI "<owner>" -- plugins | sort -t: -k2 -rn    # 按文件列命中数，再逐文件判下表的三类
```

命中数按文件列出来再判，别只看总数：一个 owner 字符串在 40 个文件里出现，往往同时含这三类。

| 命中形态 | 处置 |
| --- | --- |
| 仓库装饰物：沿革、调研文档、CI/编辑器配置、营销配图、作者联系二维码 | 删 |
| **功能内容**：设置页或界面里渲染的上游仓库链接（尤其「去上游提 issue」这类把用户导向别人仓库的入口）、默认值、示例列表 | **交给人定**——这是产品内容，改它等于改行为，别顺手替换成我们的地址 |
| 溯源与真实数据：`LICENSE` 版权、README 分叉署名、代码注释里的实测来源、抓取自真实 API 的 fixture | 留——改了 fixture 就成了假数据，注释与署名是依据 |

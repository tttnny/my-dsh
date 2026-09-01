# ptc-preset-fusion-checklist — PTC 融合预设防错清单（经验总结）

> 写新的「PTC × 其他能力」融合 preset（如 `ptc-cordis`、`matt-ptc`）时，先读这份清单。
> 它来自一次真实事故的完整复盘：模型在 PTC 模式会话里**持续**报
> `Error: invalid arguments: missing required property "description"`，
> 根因不是 composition 行级遗漏，而是**提示词（persona / 技能）没有跟着融合**。

---

## 1. 症状

PTC 模式会话中，`run_code` 调用约一半被拒绝：

```
Error: invalid arguments: missing required property "description"
```

模型会反复用**同样的形状**重试（把 `description` 写进程序内 `tools.bash({...})`，
外层仍缺），因为错误信息不区分「内层工具的 description」和「外层 run_code 的
description」，模型以为它已经传了。

## 2. 根因（三层）

1. **直接机制**：PTC 模式下 `run_code` 是唯一可直接调用的工具，其参数校验
   （`dsh-tools`，`INVALID_ARGS`）要求**顶层**必填 `code` + `description`，
   缺 `description` 即抛上述错误。
2. **模型认知陷阱**：SDK 示例里 `description` 出现两次——
   `run_code({ code: "return await tools.bash({ command: 'pwd', description: 'Show current directory' })", description: "Show current directory" })`
   ——模型复制内层那个、丢掉外层那个。
3. **融合放大因素**（这才是「融合遗漏」的实质）：
   - **persona 照搬**：直接把 cordis / matt 的长 persona 搬进 PTC 预设，通篇没提
     PTC 模式、没提 run_code 契约；而官方 `ptc` 预设刻意只用一句话 persona，
     让 SDK 区段主导注意力。系统提示顺序 persona(0) → 工具引导 → PTC_ONLY(800)
     → tools:sdk(5000)，长 persona 把注意力从契约上引开。
   - **技能按原生调用编写**：技能里写「Call `cordis_inspect_list`」「调用
     `cordis_define`」，好像能直接调；PTC 模式下只能 `await tools.x(args)` 在
     程序里调，直接调报
     `unknown tool "<name>": only \`run_code\` is callable directly — call \`<name>\` from inside a \`run_code\` program instead`。
   - **SDK 变长**：工具越多 SDK 声明越长，「two required arguments」越容易被稀释。

## 3. 实证（当时的会话日志）

16 次 `run_code` 调用，8 败 8 成，分界线极其干净：

| 外层 `run_code` 参数 | 结果 |
| --- | --- |
| 只有 `{code}` | `invalid arguments: missing required property "description"` |
| `{code, description}` | 正常执行 |

## 4. 融合检查清单（新融合 preset 逐项过）

- [ ] **① 先定呈现模式**：`mode: ptc`（只见 run_code）/ `both`（原生 + run_code 并存）/
      `native`（不融合 PTC）。定了就写进 `agent.cordis.yml` 注释、`preset.yml`、
      `README.md`、根 `README.md` 四处；**改 mode 必须同步改全套文档**
      （本仓库曾发生 HEAD 是 `both`、工作区改成 `ptc` 且未提交，导致「装的版本
      ≠ 仓库版本」的隐患）。
- [ ] **② persona 融合，不是照搬**：开篇（身份句之后）声明 PTC 契约，见 §5 标准
      文案；**点名本预设专属工具**（如 grilling 的 `ask_user_grilling` /
      `ask_user_question` / `enter_plan_mode`，cordis 的 `cordis_define` /
      `cordis_inspect_*`），告诉模型它们同样只能经 `tools.x()` 到达。
- [ ] **③ 技能注释策略**：核心工具集技能（如 cordis 的两个）在文件头部加一段
      「PTC 模式适配」说明；通用技能（如 matt 25 件套）不加，靠 persona 里的
      统一换算规则覆盖，避免侵入性改动。
- [ ] **④ mode 与 persona 措辞一致**：`both` 模式下原生调用**照常执行**，persona
      绝不能写「唯一可直接调用的是 run_code」（那是 ptc 模式的表述）。
- [ ] **⑤ 同步本地安装**：`~/.dsh/.agent-presets/<id>/` 只复制 `agent.cordis.yml` +
      `preset.yml` + `skills/`（**排除 README.md**），并保持仓库与本地一致。
- [ ] **⑥ 新会话验证**：persona 只对**新建**会话生效（挂载时读取），旧会话不变；
      验证时看是否还会出现 `missing required property` / `unknown tool`。

## 5. 标准 persona 契约文案（可直接粘贴）

插在 persona `text:` 的身份句之后、原有内容之前。**ptc 版**：

```text
This session presents every tool in PTC mode: the ONLY tool you may call directly is `run_code`, and it takes two REQUIRED top-level arguments — `code` (the body of an async program) and `description` (a short summary of the program). These are top-level arguments of `run_code` itself: the `description` you pass inside the program to another tool, like `tools.bash({ description, ... })`, is a DIFFERENT argument and does not satisfy the requirement. Omitting either top-level argument is rejected with exactly `Error: invalid arguments: missing required property "code"` / `"description"` — if you see that error, add the missing TOP-LEVEL argument to `run_code`, not to a tool call inside the program. The first argument is named `code` (the program body), NOT `command` — `command` is `tools.bash`'s parameter name, and calling `run_code({ command, description })` fails with `missing required property "code"`.

Every other tool (bash, fs, skill, subagent, <本预设专属工具>, ...) is reached ONLY from inside a `run_code` program as `await tools.<name>(args)`. A direct call to any other tool fails with `unknown tool`. Skill documents below are written in native-tool wording ("call <工具名>"): interpret every such instruction as a `tools.<name>(...)` call inside a `run_code` program, and include that program's own top-level `code` AND `description`. When a bash command itself contains single quotes, wrap the whole command in a template literal (backticks) or double quotes — nesting single quotes inside a JS single-quoted string (e.g. `command: '... require('$D/...') ...'`) ends the string early and the program fails to parse (`code run failed (exception): …`, e.g. `Expression expected` or `Expected ',', got 'ident'`).
```

**both 版**（原生调用照常，所以措辞不同）：

```text
This session presents tools in PTC mode: `run_code` executes a program against the generated SDK and takes two REQUIRED top-level arguments — `code` (the body of an async program) and `description` (a short summary of the program). The top-level `description` of `run_code` is a DIFFERENT argument from any `description` you pass to a tool inside the program, like `tools.bash({ description, ... })` — both must be present. Omitting the top-level `description` is rejected with exactly `Error: invalid arguments: missing required property "description"` — if you see that error, add the missing TOP-LEVEL argument to `run_code`, not to a tool call inside the program.

Every tool you do NOT call natively can also be reached from inside a `run_code` program as `await tools.<name>(args)`. Skill documents are written in native-tool wording; interpret them as either a native call or a `tools.<name>(...)` call inside `run_code`.
```

建议在 persona 末尾再补一句总提醒（ptc 版）：

```text
— and remember: in this session you reach every tool through `tools.<name>(...)` inside `run_code({ code, description })`.
```

## 6. 排查方法（下次再遇到时）

```bash
# 1. 解压目标会话日志，数一下错误
unzstd -c ~/.dsh/sessions/<workspace-dir>/<session-id>/session.jsonl.zstd \
  | grep -o 'invalid arguments[^"]*' | sort | uniq -c

# 2. 核对 run_code 外层参数：失败调用外层只有 code
#    （每一条 tool/call name=run_code 的 arguments 顶层 keys）
python3 - <<'EOF'
import json
for line in open('/tmp/s.jsonl'):
    r = json.loads(line)
    if r.get('type') == 'tool/call' and r['data'].get('name') == 'run_code':
        print(list(json.loads(r['data']['arguments']).keys()))
EOF
```

- 外层只有 `['code']` → 就是「顶层 description 漏传」，修 persona（§4 ② / §5）。
- 外层是 `['command','description']` → 模型把 run_code 的第一个参数名 `code`
  写成了 bash 的 `command`，属同源混淆，§5 文案已内置纠正。
- 错误是
  `unknown tool "<name>": only \`run_code\` is callable directly — call \`<name>\` from inside a \`run_code\` program instead`
  → 模型尝试原生调用，同样是 persona/技能没融合到位。
- 错误是 `code run failed (exception): Expression expected` /
  `code run failed (exception): Expected ',', got 'ident'`
  → 程序体 JS 语法错，最常见是 bash 命令串里单引号嵌套（`'... require('$D/...') ...'`
  提前结束字符串），属模型写作能力问题，§5 文案可减少但无法根除。

## 7. 背景与边界

- 官方 `ptc` 预设存在同样的机制性风险（`mode: ptc` 一样折叠），但它属于部署内置
  预设、不可修改——这正是**融合版预设要自带 persona 契约**的原因。
- 本次修复已落地：`presets/ptc-cordis/`（persona + 两个 Cordis 技能头部注释）、
  `presets/matt-ptc/`（persona，含 grilling 工具点名），均已同步本地安装。
- 实测效果：修复后新建的 ptc-cordis 会话，`missing required property` 从约 50%
  调用失败降到个位数（一次会话 22 步仅 5 次报错）；其中「外层漏 description」已
  归零，剩余为 `code↔command` 混淆与程序体引号嵌套（§5 第二轮文案针对性覆盖）。
  persona 只对新会话生效，旧会话仍挂旧 persona，对比时用新建会话。
- 相关补丁：[patch-dsh-cordis-inspect-idempotent](../patch-dsh-cordis-inspect-idempotent/README.md)
  解决的是另一个问题（含 `tool-cordis` 的预设同进程互斥），与本清单不冲突。

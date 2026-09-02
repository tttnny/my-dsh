#!/usr/bin/env bash
# =============================================================================
# ptc-preset-fusion-checklist.sh — PTC 会话 run_code 参数错误诊断
#
# 背景
# ----
# PTC 融合 preset（ptc-cordis / matt-ptc 等）的两类高频事故都体现在
# run_code 的【外层 arguments 顶层 keys】上：
#   {code}        → 内外层 description 混淆（description 写进了程序里）
#   {description} → 叙述即调用（把意图描述当成调用，程序体没发）
#   {command,…}   → 把 run_code 的 code 写成 bash 的 command
#   直接调其它工具 → unknown tool（原生调用尝试）
# 详细根因与对策见同目录 README.md。
#
# 本脚本读取一个会话的 session.jsonl.zstd，输出：
#   1) preset / 模型 / 调用总量
#   2) 按失败形态分类的参数错误统计（自动剔除 _truncated 上下文截断噪声）
#   3) 运行时错误（程序体语法错等）与直接原生调用统计
#   4) 完全相同的失败重发（防循环提示的触发源）
#   5) 按 README §6 分支给出定位提示
#
# 用法
# ----
#   bash ptc-preset-fusion-checklist.sh <session-id>        # 支持不带 session- 前缀
#   bash ptc-preset-fusion-checklist.sh <session.jsonl.zstd | .jsonl 路径>
#
# 依赖：zstd（brew install zstd）、python3。
# =============================================================================
set -euo pipefail

usage() {
  sed -n '2,30p' "$0"
  exit "${1:-0}"
}

[[ $# -ge 1 ]] || usage 1
INPUT="$1"

# ---------- 1) 定位会话文件 ----------
SESSION_FILE=""
if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  # 会话目录有两种命名：session-<id> 与裸 <id>
  ID="$INPUT"
  [[ "$ID" == session-* ]] || ID="session-$ID"
  BARE="$INPUT"
  [[ "$BARE" == session-* ]] && BARE="${BARE#session-}"
  for f in "$HOME"/.dsh/sessions/*/"$ID"/session.jsonl.zstd "$HOME"/.dsh/sessions/*/"$BARE"/session.jsonl.zstd; do
    [[ -f "$f" ]] && SESSION_FILE="$f" && break
  done
fi
[[ -n "$SESSION_FILE" ]] || { echo "找不到会话文件: $INPUT" >&2; exit 1; }

# ---------- 2) 解压到临时文件 ----------
TMP="$(mktemp -t ptc-check)"
trap 'rm -f "$TMP"' EXIT
case "$SESSION_FILE" in
  *.zstd)
    command -v zstd >/dev/null 2>&1 || { echo "需要 zstd: brew install zstd" >&2; exit 1; }
    zstd -dc "$SESSION_FILE" > "$TMP"
    ;;
  *) cp "$SESSION_FILE" "$TMP" ;;
esac

# ---------- 3) 分析 ----------
SESSION_FILE="$SESSION_FILE" python3 - "$TMP" <<'PYEOF'
import json, os, sys
from collections import Counter

path = sys.argv[1]
events = []
with open(path) as f:
    for line in f:
        try:
            events.append(json.loads(line))
        except Exception:
            pass

preset = None
models = set()
calls = {}          # callId -> {step, args_raw, keys}
results = {}        # callId -> (is_error, err_text)
direct_calls = []   # (step, name) 非 run_code 的直接调用（unknown tool 候选）

for ev in events:
    t = ev.get('type')
    d = ev.get('data') or {}
    if t == 'session':
        preset = ev.get('agentPreset') or preset
    elif t == 'agent-preset/selected':
        preset = d.get('agentPreset') or preset
    elif t == 'assistant/message':
        src = (d.get('message') or {}).get('source') or {}
        if src.get('model'):
            models.add(f"{src.get('provider')}/{src.get('model')}")
    elif t == 'tool/call':
        name = d.get('name')
        if name == 'run_code':
            raw = d.get('arguments', '')
            try:
                args = json.loads(raw) if isinstance(raw, str) else raw
                keys = sorted(args.keys()) if isinstance(args, dict) else ['<non-dict>']
            except Exception:
                keys = ['<unparseable>']
            calls[d.get('callId')] = {'step': d.get('step'), 'raw': raw, 'keys': keys}
        elif name:
            direct_calls.append((d.get('step'), name))
    elif t == 'tool/result':
        try:
            cid = d['message']['content'][0]['toolCallId']
            err_text = d['message']['content'][0]['content'][0].get('text', '')
        except Exception:
            continue
        results[cid] = (bool(d.get('error')), err_text)

def classify(keys):
    if '_truncated' in keys: return 'truncated'
    if '<unparseable>' in keys or '<non-dict>' in keys: return 'unparseable'
    if 'code' in keys and 'description' in keys: return 'complete'
    if keys == ['description']: return 'description-only'
    if keys == ['code']: return 'code-only'
    if 'command' in keys and 'code' not in keys: return 'command-confusion'
    return 'other:' + ','.join(keys)

shape = {}
order = []
for cid, c in calls.items():
    s = classify(c['keys'])
    c['shape'] = s
    is_err, err_text = results.get(cid, (None, ''))
    c['err'] = is_err
    c['err_text'] = err_text
    shape.setdefault(s, []).append(c)
    order.append(c)

total = len(calls)
truncated = len(shape.get('truncated', []))
param_err_shapes = ['description-only', 'code-only', 'command-confusion', 'unparseable', 'other']
param_errs = sum(len(v) for k, v in shape.items() if k in param_err_shapes or k.startswith('other:'))
runtime_errs = sum(1 for c in order if c['shape'] == 'complete' and c['err'])
ok = sum(1 for c in order if c['shape'] == 'complete' and not c['err'])

print(f"会话文件 : {os.environ.get('SESSION_FILE', path)}")
print(f"preset   : {preset or '?'}")
print(f"模型     : {', '.join(sorted(models)) or '?'}")
print(f"run_code 调用总数: {total}  (成功 {ok} / 参数错误 {param_errs} / 运行时错误 {runtime_errs} / 截断噪声 {truncated})")
if total:
    eff = total - truncated
    print(f"参数错误率: {param_errs}/{eff} = {param_errs * 100 // eff if eff else 0}%  (已剔除截断噪声)")
print()

LABELS = {
    'description-only': '叙述即调用（只发 description，程序体没发）→ README §2.0 模型纪律 / §2.2 报错三缺口',
    'code-only':        '内外层混淆（description 写进程序内）→ README §2.2 / §5 persona 契约',
    'command-confusion':'code↔command 混淆 → §5 文案已内置纠正',
    'unparseable':      'arguments 不是合法 JSON',
    'truncated':        '上下文截断 artifact（宿主噪声，非模型错误）',
}
print("== 按形态分布 ==")
for s, lst in sorted(shape.items(), key=lambda kv: -len(kv[1])):
    label = LABELS.get(s, LABELS['unparseable'] if s.startswith('other:') else '')
    steps = [str(c['step']) for c in lst]
    print(f"  {s:18} x{len(lst):3}  steps: {' '.join(steps[:12])}{' …' if len(steps) > 12 else ''}")
    if label:
        print(f"  {'':18}  ↳ {label}")

# 完全相同的失败重发
dups = Counter()
for c in order:
    if c['err'] and c['shape'] not in ('complete', 'truncated'):
        try:
            d = json.loads(c['raw']).get('description', c['raw'][:80])
        except Exception:
            d = c['raw'][:80]
        dups[d] += 1
dups = {k: v for k, v in dups.items() if v > 1}
if dups:
    print()
    print("== 相同载荷的失败重发（防循环提示触发源）==")
    for desc, cnt in sorted(dups.items(), key=lambda kv: -kv[1]):
        print(f"  x{cnt}  {desc[:100]}")

if direct_calls:
    print()
    print("== 直接原生调用（应为 0；PTC 下会报 unknown tool）==")
    for step, name in direct_calls[:10]:
        print(f"  step {step}: {name}")

print()
print("== 定位提示 ==")
if shape.get('description-only'):
    print("  · 存在 description-only：先确认 persona 是否含 v2 文案（WRONG/RIGHT 对照 + 恢复指令）；")
    print("    仍高发则是模型 PTC 纪律问题——按 README §4⑤ 换路由模型。")
if shape.get('code-only'):
    print("  · 存在 code-only：内外层 description 混淆，检查 persona 契约（README §5）。")
if shape.get('command-confusion'):
    print("  · 存在 command 混用：§5 文案已覆盖，确认 preset persona 为最新版。")
if runtime_errs:
    print(f"  · 有 {runtime_errs} 次运行时错误（程序体语法/工具内 ToolCallError）：属模型写作能力，")
    print("    单引号嵌套见 §5 第三段文案；其余看具体报错。")
if direct_calls:
    print("  · 存在直接原生调用：persona/技能原生措辞残留（README §4②③）。")
if param_errs == 0 and not direct_calls:
    print("  · 无参数错误：该会话 PTC 契约执行良好。")
PYEOF

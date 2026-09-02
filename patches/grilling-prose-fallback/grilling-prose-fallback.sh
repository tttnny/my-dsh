#!/usr/bin/env bash
# =============================================================================
# grilling-prose-fallback.sh — grilling 会话「散文轮」失守诊断
#
# 背景
# ----
# matt-standard / matt-cordis / matt-ptc 三个 preset 的 persona 都要求
# 「grilling 轮次一律走 ask_user_grilling 工具，禁止散文提问」，但
# grilling 技能原文（SKILL.md）自带一个具体的 ❓/➡️ 散文模板
# （"Format a round like so"），模型倾向照抄模板、跳过工具——
# 具体样例对行为的牵引力 > 抽象禁令（与 PTC run_code 事故同构，
# 见 patches/ptc-preset-fusion-checklist/）。
#
# 本脚本读取一个会话的 session.jsonl.zstd，输出：
#   1) preset / 模型 / grilling 技能是否加载
#   2) ask_user_grilling / ask_user_question 调用次数
#   3) 散文轮检测：assistant 消息出现 ❓ **Q… 模式而本轮无 ask_user_grilling 调用
#   4) 按结果给出定位提示（persona 版本 / 模型路由）
#
# 用法
# ----
#   bash grilling-prose-fallback.sh <session-id>        # 支持不带 session- 前缀
#   bash grilling-prose-fallback.sh <session.jsonl.zstd | .jsonl 路径>
#
# 依赖：zstd（brew install zstd）、python3。
# =============================================================================
set -euo pipefail

usage() {
  sed -n '2,28p' "$0"
  exit "${1:-0}"
}

[[ $# -ge 1 ]] || usage 1
INPUT="$1"

# ---------- 1) 定位会话文件 ----------
SESSION_FILE=""
if [[ -f "$INPUT" ]]; then
  SESSION_FILE="$INPUT"
else
  ID="$INPUT"
  [[ "$ID" == session-* ]] || ID="session-$ID"
  for f in "$HOME"/.dsh/sessions/*/"$ID"/session.jsonl.zstd; do
    [[ -f "$f" ]] && SESSION_FILE="$f" && break
  done
fi
[[ -n "$SESSION_FILE" ]] || { echo "找不到会话文件: $INPUT" >&2; exit 1; }

# ---------- 2) 解压到临时文件 ----------
TMP="$(mktemp /tmp/grill-check.XXXXXX.jsonl)"
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
import json, os, re, sys

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
grilling_loaded = False
grill_calls = 0          # ask_user_grilling 工具调用
plain_q_calls = 0        # ask_user_question 工具调用
prose_rounds = []        # (seq, turn) assistant 文本含 ❓ **Q 模式
turns_with_grill = set() # 发起过 ask_user_grilling 的 turn
msg_meta = {}            # turn -> 该 turn 是否有工具调用块

PROSE_RE = re.compile(r'❓\s*\*\*Q\d', re.S)

for ev in events:
    t = ev.get('type')
    d = ev.get('data') or {}
    if t == 'session':
        preset = ev.get('agentPreset') or preset
    elif t == 'agent-preset/selected':
        preset = d.get('agentPreset') or preset
    elif t == 'user/message':
        for c in d.get('content') or []:
            txt = c.get('text') or ''
            if '<skill_content name="grilling"' in txt or '<skill_content name="grill-me"' in txt:
                grilling_loaded = True
    elif t == 'assistant/message':
        msg = d.get('message') or {}
        src = msg.get('source') or {}
        if src.get('model'):
            models.add(f"{src.get('provider')}/{src.get('model')}")
        turn = d.get('turn')
        content = msg.get('content') or []
        text = ''.join(c.get('text', '') for c in content if c.get('type') == 'text')
        tool_names = [c.get('name') for c in content if c.get('type') == 'tool-call']
        if 'ask_user_grilling' in tool_names:
            grill_calls += tool_names.count('ask_user_grilling')
            turns_with_grill.add(turn)
        plain_q_calls += tool_names.count('ask_user_question')
        if PROSE_RE.search(text):
            prose_rounds.append((ev.get('seq'), turn, turn in turns_with_grill))

print(f"会话文件 : {os.environ.get('SESSION_FILE', path)}")
print(f"preset   : {preset or '?'}  (会话记录值；以 system 是否含 grilling 纪律为准)")
print(f"模型     : {', '.join(sorted(models)) or '?'}")
print(f"grilling 技能已加载: {'是' if grilling_loaded else '否/未见'}")
print(f"ask_user_grilling 调用: {grill_calls}   ask_user_question 调用: {plain_q_calls}")
print()

if not prose_rounds:
    print("== 散文轮检测 == 未发现 ❓ **Q… 散文模式")
    if grill_calls:
        print("结论: 该会话 grilling 交付纪律执行良好（工具交付）。")
    else:
        print("结论: 无 grilling 轮次记录（可能非 grilling 会话或轮次未开始）。")
else:
    leaked = [(s, tn) for s, tn, ok in prose_rounds if not ok]
    print(f"== 散文轮检测 == 命中 {len(prose_rounds)} 条 ❓ **Q… 消息，其中 {len(leaked)} 条所在 turn 未调用 ask_user_grilling ==")
    for s, tn, ok in prose_rounds:
        mark = '同轮有工具调用（散文仅为前言，OK）' if ok else '散文轮失守（整轮未走工具）'
        print(f"  seq{s} turn{tn}: {mark}")
    print()
    print("== 定位提示 ==")
    if leaked:
        print("  · 失守根因（按经验排序）：")
        print("    0) 技能原文的 ❓/➡️ 散文模板是具体样例，模型照抄优先于 persona 抽象禁令")
        print("       → 确认 skills/grilling/SKILL.md 是否含 v2「DSH delivery」旁注（模仿点纠偏）")
        print("    1) persona 缺少 WRONG/RIGHT 对照与元素映射 → 确认 persona 是否含 v2 文案")
        print("       （❓→header / 正文→question / ABCD→options / ➡️→首项+\"(Recommended)\" + 恢复指令）")
        print("    2) 仍高发则是模型纪律问题 → 换路由模型复测（参考 PTC 事故：同 persona 下")
        print("       不同模型失守率差异巨大）")
    print("  · 注意：事实前言（'先把事实摆一下'）以散文出现是允许的；只有【问题】必须进工具。")
PYEOF

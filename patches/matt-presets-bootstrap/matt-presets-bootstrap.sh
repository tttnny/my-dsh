#!/usr/bin/env bash
# =============================================================================
# matt-presets-bootstrap.sh — 新机器一键构建/验收三个 matt preset
#
# 子命令
# ----
#   setup（默认）  安装 dsh-ask-user-grilling 插件 + 同步三个 preset 到
#                  ~/.dsh/.agent-presets/（排除 README.md）+ 自检。幂等。
#   check <id|路径>  grilling 会话验收：统计 ask_user_grilling 调用与散文轮
#                  失守（Qn. **… 轮次格式出现在消息文本而当轮未调工具）。
#
# 用法
# ----
#   bash matt-presets-bootstrap.sh                 # = setup
#   bash matt-presets-bootstrap.sh setup
#   bash matt-presets-bootstrap.sh check 5ed25954-7a67-4504-a40b-c715194c2903
#   bash matt-presets-bootstrap.sh check <session.jsonl.zstd 路径>
#
# 依赖：rsync、python3；setup 可选 dsh CLI；check 需要 zstd（brew install zstd）。
# 详细背景与手工推导步骤见同目录 README.md。
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_ROOT="$DSH_HOME/.agent-presets"
PRESETS="matt-standard matt-ptc matt-cordis"
PLUGIN_PKG="@lynn123411/dsh-ask-user-grilling"
PLUGIN_DIR_NAME="dsh-ask-user-grilling"

usage() { sed -n '2,24p' "$0"; exit "${1:-0}"; }

# =============================================================================
# setup
# =============================================================================
cmd_setup() {
  echo "== 1/5 依赖与材料检查 =="
  command -v rsync >/dev/null 2>&1 || { echo "需要 rsync" >&2; exit 1; }
  command -v python3 >/dev/null 2>&1 || { echo "需要 python3" >&2; exit 1; }
  for p in $PRESETS; do
    [[ -f "$REPO_ROOT/presets/$p/agent.cordis.yml" ]] || { echo "缺 $REPO_ROOT/presets/$p/agent.cordis.yml —— 在本仓库根目录外运行？" >&2; exit 1; }
  done
  echo "  OK（仓库根: ${REPO_ROOT}）"

  echo "== 2/5 安装 grilling 适配插件 =="
  # 本仓库是这套合集的事实源（可能含未发布的本地改点），优先从仓库同步；
  # npm 安装（dsh plugin --profile web add）仅在没有仓库克隆时使用。
  sync_plugin_local

  echo "== 3/5 同步三个 preset 到 $PRESET_ROOT =="
  for p in $PRESETS; do
    mkdir -p "$PRESET_ROOT/$p"
    rsync -a --delete --exclude README.md "$REPO_ROOT/presets/$p/" "$PRESET_ROOT/$p/"
    echo "  $p synced"
  done

  echo "== 4/5 自检 =="
  local fail=0
  for p in $PRESETS; do
    local dir="$PRESET_ROOT/$p"
    local n_mattadd n_skills n_note
    n_mattadd=$(grep -c "MATT-ADD" "$dir/agent.cordis.yml" || true)
    n_skills=$(find "$dir/skills" -name SKILL.md -maxdepth 2 2>/dev/null | wc -l | tr -d ' ')
    n_note=$(grep -c "DSH delivery" "$dir/skills/grilling/SKILL.md" 2>/dev/null || true)
    local expect=25; [[ "$p" == "matt-cordis" ]] && expect=27
    local line="  $p: MATT-ADD=${n_mattadd} 技能=${n_skills}/${expect} grilling旁注=${n_note}"
    if [[ "$n_mattadd" -ge 1 && "$n_skills" -eq "$expect" && "$n_note" -ge 1 ]]; then
      echo "$line  OK"
    else
      echo "$line  FAIL 异常" >&2; fail=1
    fi
  done
  # persona 应为原厂逐字：不含 grilling 纪律残留
  for p in $PRESETS; do
    if grep -q "Ask every question through the ask_user_grilling" "$PRESET_ROOT/$p/agent.cordis.yml"; then
      echo "  $p: FAIL persona 仍含 v2 grilling 纪律（应已下沉到技能旁注）" >&2; fail=1
    fi
  done
  [[ "$fail" -eq 0 ]] || { echo "自检未通过" >&2; exit 1; }

  echo "== 5/5 后续步骤 =="
  cat <<'EOF'
  1. 重启 DSH（standing 挂载与新插件描述才会生效）
  2. 新建会话选择「Matt 标准 / Matt PTC 模式 / Matt 创造模式」
  3. 跑一个 grilling 会话（如 /grill-me <任意话题>）
  4. 验收：bash patches/matt-presets-bootstrap/matt-presets-bootstrap.sh check <session-id>
     健康标准：ask_user_grilling 调用 ≥ 1 且散文轮检测未命中
EOF
}

sync_plugin_local() {
  local src="$REPO_ROOT/plugins/$PLUGIN_DIR_NAME"
  local dst="$DSH_HOME/profiles/web/node_modules/$PLUGIN_PKG"
  [[ -d "$src" ]] || { echo "缺插件源目录 $src" >&2; exit 1; }
  mkdir -p "$dst"
  rsync -a --delete "$src/" "$dst/"
  echo "  已本地同步到 $dst"
  echo "  注意：pnpm install / dsh plugin add|remove 重装后本地副本会被清掉，需重跑本脚本"
}

# =============================================================================
# check —— grilling 会话验收（前 grilling-prose-fallback.sh）
# =============================================================================
cmd_check() {
  [[ $# -ge 1 ]] || usage 1
  local INPUT="$1" SESSION_FILE=""
  if [[ -f "$INPUT" ]]; then
    SESSION_FILE="$INPUT"
  else
    local ID="$INPUT"
    [[ "$ID" == session-* ]] || ID="session-$ID"
    for f in "$DSH_HOME"/sessions/*/"$ID"/session.jsonl.zstd; do
      [[ -f "$f" ]] && SESSION_FILE="$f" && break
    done
  fi
  [[ -n "$SESSION_FILE" ]] || { echo "找不到会话文件: $INPUT" >&2; exit 1; }

  TMP=""
  trap '[ -n "${TMP:-}" ] && rm -f "$TMP"' EXIT
  TMP="$(mktemp -t grill-check)"
  case "$SESSION_FILE" in
    *.zstd)
      command -v zstd >/dev/null 2>&1 || { echo "需要 zstd: brew install zstd" >&2; exit 1; }
      zstd -dc "$SESSION_FILE" > "$TMP"
      ;;
    *) cp "$SESSION_FILE" "$TMP" ;;
  esac

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
grill_calls = 0
plain_q_calls = 0
enter_plan_calls = 0
prose_rounds = []
turns_with_grill = set()

# 兼容检测：旧格式 ❓ **Qn（emoji 标记，上游原版）与新格式 Qn. **（本仓库纯文本版）
PROSE_RE = re.compile(r'(❓\s*\*\*Q\d)|(^Q\d+\.\s+\*\*)', re.M)

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
        enter_plan_calls += tool_names.count('enter_plan_mode')
        if PROSE_RE.search(text):
            prose_rounds.append((ev.get('seq'), turn, turn in turns_with_grill))

print(f"会话文件 : {os.environ.get('SESSION_FILE', path)}")
print(f"preset   : {preset or '?'}")
print(f"模型     : {', '.join(sorted(models)) or '?'}")
print(f"grilling 技能已加载: {'是' if grilling_loaded else '否/未见'}")
print(f"ask_user_grilling 调用: {grill_calls}   ask_user_question 调用: {plain_q_calls}   enter_plan_mode 调用: {enter_plan_calls}")
print()

healthy = True
if not prose_rounds:
    print("== 散文轮检测 == 未发现 Qn. **… 散文模式")
    if grill_calls:
        print("结论: grilling 交付纪律执行良好（工具投递）。")
    else:
        print("结论: 无 grilling 轮次记录（可能非 grilling 会话或轮次未开始）。")
        healthy = False
else:
    leaked = [(s, tn) for s, tn, ok in prose_rounds if not ok]
    print(f"== 散文轮检测 == 命中 {len(prose_rounds)} 条 Qn. **… 消息，其中 {len(leaked)} 条所在 turn 未调用 ask_user_grilling ==")
    for s, tn, ok in prose_rounds:
        mark = '同轮有工具调用（散文仅为事实前言，OK）' if ok else '散文轮失守（整轮未走工具）'
        print(f"  seq{s} turn{tn}: {mark}")
    healthy = not leaked
    if leaked:
        print()
        print("== 定位提示（README §5）==")
        print("  0) 检查 grilling 旁注是否在技能文件里（具体样例 > 抽象禁令）：")
        print("     grep -c 'DSH delivery' ~/.dsh/.agent-presets/matt-*/skills/grilling/SKILL.md 应为 1/1/1")
        print("  1) 检查插件版本：ask_user_grilling 工具描述应含「NEVER as message text」")
        print("  2) 仍高发则换路由模型复测（纪律执行度随模型差异巨大）")
        print("  · 事实前言以散文出现是允许的；只有【问题】必须进工具")

sys.exit(0 if healthy else 2)
PYEOF
}

# =============================================================================
case "${1:-setup}" in
  setup) cmd_setup ;;
  check) shift; cmd_check "$@" ;;
  -h|--help|help) usage 0 ;;
  *) usage 1 ;;
esac

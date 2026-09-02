#!/usr/bin/env bash
# =============================================================================
# matt-presets-bootstrap.sh — 新机器一键构建/验收三个 matt preset
#
# 子命令
# ----
#   setup（默认）  安装 dsh-ask-user-grilling 插件 + 同步三个 preset 到
#                  ~/.dsh/.agent-presets/（排除 README.md）+ 自检。幂等。
#   check <id|路径>  grilling 会话验收：统计 ask_user_grilling 调用（原生与
#                  PTC code-dispatch 两种形态）与散文轮失守（Qn./Recommended:
#                  轮次格式出现在消息文本而当回合未调工具）。
#
# 用法
# ----
#   bash matt-presets-bootstrap.sh                 # = setup
#   bash matt-presets-bootstrap.sh setup
#   bash matt-presets-bootstrap.sh check 5ed25954-7a67-4504-a40b-c715194c2903
#   bash matt-presets-bootstrap.sh check <session.jsonl.zstd 路径>
#
# check 退出码：0=健康（有 grilling 调用且无失守） 1=用法/文件错误
#               2=散文轮失守  3=无法判定（会话无 grilling 活动）
#
# 依赖：rsync、python3；check 需要 zstd（brew install zstd）。
# 详细背景与手工推导步骤见同目录 README.md。
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PRESET_ROOT="$DSH_HOME/.agent-presets"
PRESETS="matt-standard matt-ptc matt-cordis"
PLUGIN_PKG="@lynn123411/dsh-ask-user-grilling"
PLUGIN_DIR_NAME="dsh-ask-user-grilling"

usage() { sed -n '2,25p' "$0"; exit "${1:-0}"; }

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
    # 行级检查（不看注释标记）：插件工具行必须存在；matt-standard/matt-ptc
    # 还必须有 customSkillDirs（matt-cordis 官方自带）。
    local has_row has_dirs n_skills n_note
    has_row=$(grep -c "^    - id: tool-ask-user-grilling$" "$dir/agent.cordis.yml" || true)
    has_dirs=$(grep -c "customSkillDirs" "$dir/agent.cordis.yml" || true)
    n_skills=$(find "$dir/skills" -maxdepth 2 -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')
    n_note=$(grep -c "DSH delivery" "$dir/skills/grilling/SKILL.md" 2>/dev/null || true)
    local expect=25; [[ "$p" == "matt-cordis" ]] && expect=27
    local line="  $p: 插件行=${has_row} customSkillDirs=${has_dirs} 技能=${n_skills}/${expect} grilling旁注=${n_note}"
    if [[ "$has_row" -eq 1 && "$has_dirs" -ge 1 && "$n_skills" -eq "$expect" && "$n_note" -ge 1 ]]; then
      echo "$line  OK"
    else
      echo "$line  FAIL 异常" >&2; fail=1
    fi
    # persona 应为原厂逐字：不含 v2 grilling 纪律残留
    if grep -q "Ask every question through the ask_user_grilling" "$dir/agent.cordis.yml" 2>/dev/null; then
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
     健康标准：exit 0（有 ask_user_grilling 调用且散文轮检测未命中；
     matt-ptc 会话经 run_code 内的 tools.ask_user_grilling 计数）
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
# check —— grilling 会话验收
# =============================================================================
cmd_check() {
  [[ $# -ge 1 ]] || usage 1
  local INPUT="$1" SESSION_FILE=""
  if [[ -f "$INPUT" ]]; then
    SESSION_FILE="$INPUT"
  else
    # 会话目录有两种命名：session-<id> 与裸 <id>
    local ID="$INPUT"
    [[ "$ID" == session-* ]] || ID="session-$ID"
    local BARE="$INPUT"
    [[ "$BARE" == session-* ]] && BARE="${BARE#session-}"
    local f
    for f in "$DSH_HOME"/sessions/*/"$ID"/session.jsonl.zstd "$DSH_HOME"/sessions/*/"$BARE"/session.jsonl.zstd; do
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
grill_calls = 0        # ask_user_grilling（原生 tool-call + PTC code-dispatch 合计）
plain_q_calls = 0
enter_plan_calls = 0
prose_msgs = []        # (seq, turn) assistant 文本含轮次格式
turns_with_grill = set()

# 散文轮兼容检测（均为模型把轮次写成消息文本的形态）：
#   旧 emoji 格式  ❓ **Q1
#   新纯文本格式  Q1. **…（允许 - Q1. / > Q1. / **Q1** - / Q1、 等漂移）
PROSE_RE = re.compile(
    r'(❓\s*\*\*Q\d)'
    r'|^[>\s\-]*(?:\*\*)?Q\d+(?:\*\*)?\s*[.、．\-:]\s*(?:\*\*)',
    re.M,
)

for ev in events:
    t = ev.get('type')
    d = ev.get('data') or {}
    if t == 'session':
        preset = ev.get('agentPreset') or preset
    elif t == 'agent-preset/selected':
        preset = d.get('agentPreset') or preset
    elif t in ('user/message', 'tool/result'):
        # grilling 技能正文可能出现在 user/message（原生 skill 工具结果回放）
        # 或 tool/result（PTC 下经 run_code 调用 skill 的结果）
        blob = json.dumps(d, ensure_ascii=False)
        if '<skill_content name="grilling"' in blob or '<skill_content name="grill-me"' in blob:
            grilling_loaded = True
    elif t == 'tool/code-dispatch':
        # PTC：run_code 程序内的每个 SDK 调用各产生一条 code-dispatch
        name = d.get('name')
        if name == 'ask_user_grilling':
            grill_calls += 1
        elif name == 'ask_user_question':
            plain_q_calls += 1
        elif name == 'enter_plan_mode':
            enter_plan_calls += 1
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
        # PTC：ask_user_grilling 在 run_code 程序内，把该 run_code 所属
        # 回合记为「有 grilling 调用」（调用数由 code-dispatch 精确计数）
        for c in content:
            if c.get('type') == 'tool-call' and c.get('name') == 'run_code' and 'ask_user_grilling' in (c.get('arguments') or ''):
                turns_with_grill.add(turn)
        plain_q_calls += tool_names.count('ask_user_question')
        enter_plan_calls += tool_names.count('enter_plan_mode')
        if PROSE_RE.search(text):
            prose_msgs.append((ev.get('seq'), turn))

# 两趟判定：先收齐所有「有 grilling 调用的回合」，再逐条判散文消息，
# 避免同一回合内消息顺序导致的误判（turn 覆盖整个用户回合）。
leaked = [(s, tn) for s, tn in prose_msgs if tn not in turns_with_grill]

print(f"会话文件 : {os.environ.get('SESSION_FILE', path)}")
print(f"preset   : {preset or '?'}")
print(f"模型     : {', '.join(sorted(models)) or '?'}")
print(f"grilling 技能已加载: {'是' if grilling_loaded else '否/未见'}")
print(f"ask_user_grilling 调用: {grill_calls}   ask_user_question 调用: {plain_q_calls}   enter_plan_mode 调用: {enter_plan_calls}")
print()

if not prose_msgs:
    print("== 散文轮检测 == 未发现轮次格式散文（Qn. **… / ❓ **Qn）")
    if grill_calls:
        print("结论: grilling 交付纪律执行良好（工具投递）。")
        sys.exit(0)
    print("结论: 会话无 grilling 活动记录（非 grilling 会话、轮次未开始，或 PTC 会话无 code-dispatch 事件）。")
    sys.exit(3)

print(f"== 散文轮检测 == 命中 {len(prose_msgs)} 条轮次格式消息，其中 {len(leaked)} 条所在回合未调用 ask_user_grilling ==")
for s, tn in prose_msgs:
    mark = '同回合有工具调用（散文仅为事实前言，OK）' if tn in turns_with_grill else '散文轮失守（该回合未走工具）'
    print(f"  seq{s} turn{tn}: {mark}")
if leaked:
    print()
    print("== 定位提示（README §5）==")
    print("  0) 检查 grilling 旁注是否在技能文件里（具体样例 > 抽象禁令）：")
    print("     grep -c 'DSH delivery' ~/.dsh/.agent-presets/matt-*/skills/grilling/SKILL.md 应为 1/1/1")
    print("  1) 检查插件版本：ask_user_grilling 工具描述应含「NEVER as message text」")
    print("  2) 仍高发则换路由模型复测（纪律执行度随模型差异巨大）")
    print("  · 事实前言以散文出现是允许的；只有【问题】必须进工具")
    sys.exit(2)
print("结论: 散文仅为工具调用回合的事实前言，纪律执行良好。")
sys.exit(0)
PYEOF
}

# =============================================================================
case "${1:-setup}" in
  setup) cmd_setup ;;
  check) shift; cmd_check "$@" ;;
  -h|--help|help) usage 0 ;;
  *) usage 1 ;;
esac

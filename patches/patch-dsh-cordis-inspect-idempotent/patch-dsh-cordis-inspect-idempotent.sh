#!/usr/bin/env bash
# =============================================================================
# patch-dsh-cordis-inspect-idempotent.sh — 让 dsh-tool-cordis 的 Host inspect
# provider 注册幂等，多个含 tool-cordis 的预设可同进程共存
#
# 背景
# ----
# @deepseek-ai/dsh-tool-cordis 挂载时会向全局单例 ctx.cordisInspect 注册 Host
# inspect provider（Service / Event / Builtin / Tool）。该注册表不做幂等：
# 同一进程内先后挂载两个含 tool-cordis 的预设（官方 cordis、ptc-cordis、
# matt-cordis 任意两个）时，第二个会抛
#   Host Cordis inspect provider "Service" is already registered
# 导致该预设挂载失败。单开其中一个预设不受影响。
#
# 本脚本把 dsh-tool-cordis 编译产物 lib/index.js 中的注册循环改为：
#   先收集已注册的 host provider id，同 id 直接跳过，其余照常注册。
# 不改任何行为语义（首次注册照旧）。脚本幂等（含 marker 检测，可重复执行），
# 每个被打补丁的文件旁留 .bak-cordis-inspect 备份。
#
# DSH 每次升级/重装后需要重新执行本脚本。
#
# 用法
# ----
#   bash patch-dsh-cordis-inspect-idempotent.sh            # 自动定位
#   DSH_ROOT=/path/to/dsh bash patch-dsh-cordis-inspect-idempotent.sh
#
# 执行完成后请重启 DSH（退出 DSH Desktop / 杀掉 dsh web 进程后重启），
# 使新代码加载。
# =============================================================================
set -euo pipefail

MARKER="local patch (user): idempotent cordisInspect host registration"

# ---------- 1) 定位所有 dsh-tool-cordis 编译产物 ----------
CANDIDATES=()
if [[ -n "${DSH_ROOT:-}" ]]; then
  CANDIDATES+=("$DSH_ROOT")
fi
if [[ -d "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules" ]]; then
  CANDIDATES+=("/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules")
fi
for cmd in "npm root -g" "pnpm root -g"; do
  ROOT="$($cmd 2>/dev/null || true)"
  [[ -n "$ROOT" && -d "$ROOT" ]] && CANDIDATES+=("$ROOT")
done
for m in "$HOME"/.dsh/profiles/*/node_modules; do
  [[ -d "$m" ]] && CANDIDATES+=("$m")
done

TARGETS=()
add_target() {
  local real="$1" i
  for ((i = 0; i < ${#TARGETS[@]}; i++)); do
    [[ "${TARGETS[$i]}" == "$real" ]] && return
  done
  TARGETS+=("$real")
}
for root in "${CANDIDATES[@]}"; do
  [[ -d "$root" ]] || continue
  direct="$root/@deepseek-ai/dsh-tool-cordis/lib/index.js"
  files=()
  if [[ -f "$direct" ]]; then
    files+=("$direct")
  else
    while IFS= read -r f; do files+=("$f"); done < <(find "$root" -maxdepth 6 -type f -path "*dsh-tool-cordis/lib/index.js" 2>/dev/null || true)
  fi
  if [[ ${#files[@]} -gt 0 ]]; then
    for f in "${files[@]}"; do
      real="$(realpath "$f" 2>/dev/null || echo "$f")"
      add_target "$real"
    done
  fi
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "✗ 未找到 dsh-tool-cordis/lib/index.js（已搜索 DSH_ROOT、DSH Desktop 应用包、npm/pnpm 全局根、~/.dsh/profiles/*）"
  echo "  可显式指定: DSH_ROOT=/path/to/dsh bash $0"
  exit 1
fi

echo "找到 ${#TARGETS[@]} 个 dsh-tool-cordis 编译产物："
for t in "${TARGETS[@]}"; do echo "  - $t"; done

# ---------- 2) 逐个打补丁 ----------
PATCHED=0
for target in "${TARGETS[@]}"; do
  echo "── $target"
  if grep -qF "$MARKER" "$target"; then
    echo "  ✓ 已包含幂等补丁，跳过"
    continue
  fi
  if [[ ! -f "$target.bak-cordis-inspect" ]]; then
    cp "$target" "$target.bak-cordis-inspect"
    echo "  → 已备份: $target.bak-cordis-inspect"
  fi
  python3 - "$target" "$MARKER" <<'PY'
import sys

path, marker = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()

anchor = "\tfor (const provider of hostInspectProviders(ctx)) ctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);"
inject = (
    "\t// " + marker + " — presets that also carry tool-cordis (cordis, ptc-cordis,\n"
    "\t// matt-cordis) may coexist in one process; same-id host providers are\n"
    "\t// skipped instead of throwing `already registered`.\n"
    '\tconst existingHostInspect = new Set(ctx.cordisInspect.list().filter(p => p.platform === "host").map(p => p.id));\n'
    "\tfor (const provider of hostInspectProviders(ctx)) {\n"
    '\t\tif (existingHostInspect.has(provider.manifest.id)) continue;\n'
    "\t\tctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);\n"
    "\t}"
)

count = src.count(anchor)
if count != 1:
    sys.exit(f"✗ 锚点出现 {count} 次（期望 1 次）——vendor 文件可能已被 DSH 升级改动，请人工核对 {path} 后再打补丁")

open(path, "w", encoding="utf-8").write(src.replace(anchor, inject))
PY
  if ! grep -qF "$MARKER" "$target"; then
    echo "✗ 补丁未生效（marker 缺失），请人工核对 $target"
    exit 1
  fi
  if command -v node >/dev/null 2>&1; then
    node --check "$target" || { echo "✗ 语法检查失败，可回滚: cp $target.bak-cordis-inspect $target"; exit 1; }
  fi
  echo "  ✓ 幂等补丁完成"
  PATCHED=$((PATCHED + 1))
done

cat <<EOF

✅ 全部完成（$PATCHED 个文件新打补丁）。请重启 DSH（退出 DSH Desktop / 杀掉
   dsh web 进程后重启），使新代码加载。

   说明：
   - 现在同一进程内可同时挂载官方 cordis、ptc-cordis、matt-cordis 中任意多个
     含 tool-cordis 的预设，不再互相冲突。
   - 每个被打补丁的文件旁留有 .bak-cordis-inspect 备份；回滚：
         cp <文件>.bak-cordis-inspect <文件>
   - DSH 每次升级/重装后需要重跑本脚本。
EOF

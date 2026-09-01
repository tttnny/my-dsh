#!/usr/bin/env bash
# =============================================================================
# patch-dsh-mattpocock-skills-deck.sh — 让 skills-deck 检测到 agent-preset 技能
#
# 背景
# ----
# dsh-mattpocock-skills-deck 的技能检测（skillProbe / lightProbeReason）只查
# 四个根：~/.agents/skills、~/.dsh/skills、项目 .dsh/skills、项目 .agents/skills
# （DSH 的 dsh-skill-filesystem 也只扫这四个根）。但本合集把 Matt Pocock 技能
# 套件随 agent-preset 分发（~/.dsh/.agent-presets/<id>/skills/，如 matt-standard
# 的 25 个技能）——不在任何探测根内，于是 deck 永远显示
# 「未检测到核心技能套件（wayfinder / triage / …）」红条。
#
# 本脚本对已安装的插件做四处幂等修补（兼容 LF / CRLF 行尾，写完按原格式还原）：
#   1. lib/index.js 新增 directListDirNames（node:fs/promises 只读枚举目录名，
#      与插件既有的 directSkillCardRead 直读纪律一致）；
#   2. lib/index.js lightProbeReason 候选根追加 ~/.dsh/.agent-presets/<id>/skills/<skill>
#      （FS 通道与 DIRECT 通道共用候选数组，自动生效）；
#   3. lib/index.js 直读通道注释同步（仅技能标准根 + agent-preset 技能根）；
#   4. lib/tracker/predicateRegistry.js SKILL_PROBE 回退探测（ctx.skillProbe
#      未注入时）同样追加 .dsh/skills 与 .agent-presets 候选。
#
# 插件每次升级/重装后需要重新执行本脚本。
#
# 用法
# ----
#   bash patch-dsh-mattpocock-skills-deck.sh                 # 默认 web profile
#   PLUGIN_DIR=/path/to/node_modules/dsh-mattpocock-skills-deck bash patch-dsh-mattpocock-skills-deck.sh
#
# 执行完成后重启 dsh web 服务（或刷新页面并触发重探测）即可看到红条消失。
# =============================================================================
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-$HOME/.dsh/profiles/web/node_modules/dsh-mattpocock-skills-deck}"
LIB="$PLUGIN_DIR/lib/index.js"
PRED="$PLUGIN_DIR/lib/tracker/predicateRegistry.js"

[[ -f "$LIB" ]] || { echo "✗ 找不到 $LIB"; echo "  可用 PLUGIN_DIR=... 指定插件安装目录（默认 $HOME/.dsh/profiles/web/node_modules/dsh-mattpocock-skills-deck）"; exit 1; }
[[ -f "$PRED" ]] || { echo "✗ 找不到 $PRED"; exit 1; }

echo "插件目录: $PLUGIN_DIR"

# ---------- 1) lib/index.js：#fix-preset-skills 候选根（含 helper）----------
if grep -q 'directListDirNames' "$LIB"; then
  echo "✓ index.js 已含 agent-preset 技能根补丁，跳过"
else
  python3 - "$LIB" <<'PY'
import sys

path = sys.argv[1]
# 行尾兼容：读入后统一去 \r（覆盖 LF / CRLF / CR / 双 CRLF），锚点全按 LF 匹配；
# 写完按原格式还原（npm 直装包内 index.js 为 CRLF、predicateRegistry.js 为 LF，混合存在）
raw = open(path, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
src = raw.replace("\r", "")

def replace_once(src, anchor, inject, tag):
    count = src.count(anchor)
    if count != 1:
        sys.exit(f"✗ [{tag}] 锚点出现 {count} 次（期望 1 次）——插件可能已被升级改动，"
                 f"请人工核对 {path} 后再打补丁")
    return src.replace(anchor, inject)

# 1a. 纪律注释同步（含标记，兼作幂等锚）
src = replace_once(
    src,
    "    // 纪律：轻探只读；直读仅在技能标准根使用，绝不写、绝不读其他路径；绿牌需名片合法（frontmatter name 匹配）。",
    "    // 纪律：轻探只读；直读仅在技能标准根与 DSH agent-preset 技能根使用（#fix-preset-skills），绝不写、绝不读其他路径；绿牌需名片合法（frontmatter name 匹配）。",
    "1a 纪律注释",
)

# 1b. directSkillCardRead 之后插入 directListDirNames helper
src = replace_once(
    src,
    """    async function directSkillCardRead(absPath) {
      try {
        const mod = await import('node:fs/promises')
        const fsp = mod.default || mod
        return await fsp.readFile(absPath, 'utf8')
      } catch { return null }
    }""",
    """    async function directSkillCardRead(absPath) {
      try {
        const mod = await import('node:fs/promises')
        const fsp = mod.default || mod
        return await fsp.readFile(absPath, 'utf8')
      } catch { return null }
    }
    // #fix-preset-skills：直读枚举目录名（只读；与 directSkillCardRead 同纪律）——用于 .dsh/.agent-presets 技能根的发现
    async function directListDirNames(absPath) {
      try {
        const mod = await import('node:fs/promises')
        const fsp = mod.default || mod
        const entries = await fsp.readdir(absPath, { withFileTypes: true })
        return entries.filter(e => e.isDirectory()).map(e => e.name)
      } catch { return [] }
    }""",
    "1b directListDirNames",
)

# 1c. lightProbeReason 候选根追加 agent-presets
src = replace_once(
    src,
    """      // 候选根：用户标准根（.agents/skills 优先，.dsh/skills 次之）+ 项目根（.dsh/skills + .agents/skills）
      const candidates = [
        { label: 'user', root: 'user-agents', dir: platform.path.join(home, '.agents', 'skills', skillName) },
        { label: 'user', root: 'user-dsh', dir: platform.path.join(home, '.dsh', 'skills', skillName) },
      ]
      try {
        const projRoot = cwd ? await findProjectRootDir(cwd, platform) : null""",
    """      // 候选根：用户标准根（.agents/skills 优先，.dsh/skills 次之）+ 项目根（.dsh/skills + .agents/skills）
      //   #fix-preset-skills：追加 DSH agent-preset 技能根（.dsh/.agent-presets/<id>/skills）——
      //   DSH 以 agent-preset 分发技能套件（如 matt-standard 的 25 技能），skills 服务与标准根均不覆盖；
      //   枚举 preset id 并入候选（DIRECT 通道只读），任一通道命中合法名片即已安装。
      const candidates = [
        { label: 'user', root: 'user-agents', dir: platform.path.join(home, '.agents', 'skills', skillName) },
        { label: 'user', root: 'user-dsh', dir: platform.path.join(home, '.dsh', 'skills', skillName) },
      ]
      try {
        const presetHome = platform.path.join(home, '.dsh', '.agent-presets')
        const presetIds = await directListDirNames(presetHome)
        for (const pid of presetIds) {
          candidates.push({ label: 'preset', root: 'preset:' + pid, dir: platform.path.join(presetHome, pid, 'skills', skillName) })
        }
      } catch {}
      try {
        const projRoot = cwd ? await findProjectRootDir(cwd, platform) : null""",
    "1c 候选根",
)

# 1d. 直读通道注释同步
src = replace_once(
    src,
    "      // ② 直读通道（插件只读直读——不经过 DSH fs 服务，绕开工作区作用域限制；仅技能标准根）",
    "      // ② 直读通道（插件只读直读——不经过 DSH fs 服务，绕开工作区作用域限制；仅技能标准根 + DSH agent-preset 技能根 #fix-preset-skills）",
    "1d 直读通道注释",
)

open(path, "w", encoding="utf-8", newline="").write(src.replace("\n", "\r\n") if crlf else src)
PY
  grep -q 'directListDirNames' "$LIB" || { echo "✗ index.js 补丁未生效"; exit 1; }
  echo "✓ index.js 补丁完成"
fi

# ---------- 2) lib/tracker/predicateRegistry.js：SKILL_PROBE 回退探测 ----------
if grep -q '#fix-preset-skills' "$PRED"; then
  echo "✓ predicateRegistry.js 已含补丁，跳过"
else
  python3 - "$PRED" <<'PY'
import sys

path = sys.argv[1]
# 行尾兼容：读入后统一去 \r（覆盖 LF / CRLF / CR / 双 CRLF），锚点全按 LF 匹配；
# 写完按原格式还原（npm 直装包内 index.js 为 CRLF、predicateRegistry.js 为 LF，混合存在）
raw = open(path, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
src = raw.replace("\r", "")

def replace_once(src, anchor, inject, tag):
    count = src.count(anchor)
    if count != 1:
        sys.exit(f"✗ [{tag}] 锚点出现 {count} 次（期望 1 次）——插件可能已被升级改动，"
                 f"请人工核对 {path} 后再打补丁")
    return src.replace(anchor, inject)

# 2a. 回退探测注释同步（含标记，兼作幂等锚）
src = replace_once(
    src,
    "      //   仅未注入时回退标准根 fs 探测（#280 单一尺度：仅标准根 .agents/skills；#281 轻探永不绿的纪律由 host probeSkill 承载）",
    "      //   仅未注入时回退标准根 fs 探测（#280 单一尺度：标准根 .agents/skills / .dsh/skills + DSH agent-preset 技能根 #fix-preset-skills；#281 轻探永不绿的纪律由 host probeSkill 承载）",
    "2a 回退注释",
)

anchor = """        const candidates = [
          home ? (p.path.join(home, '.agents', 'skills', skill)) : null,
        ].filter(Boolean)"""
inject = """        const candidates = [
          home ? (p.path.join(home, '.agents', 'skills', skill)) : null,
          home ? (p.path.join(home, '.dsh', 'skills', skill)) : null,
        ].filter(Boolean)
        // #fix-preset-skills：DSH agent-preset 技能根（.dsh/.agent-presets/<id>/skills）——只读枚举并入候选
        if (home) {
          try {
            const mod = await import('node:fs/promises')
            const fsp = mod.default || mod
            const presetHome = p.path.join(home, '.dsh', '.agent-presets')
            const entries = await fsp.readdir(presetHome, { withFileTypes: true })
            for (const e of entries) {
              if (e.isDirectory()) candidates.push(p.path.join(presetHome, e.name, 'skills', skill))
            }
          } catch {}
        }"""

count = src.count(anchor)
if count != 1:
    sys.exit(f"✗ 锚点出现 {count} 次（期望 1 次）——插件可能已被升级改动，"
             f"请人工核对 {path} 后再打补丁")
out = src.replace(anchor, inject)
open(path, "w", encoding="utf-8", newline="").write(out.replace("\n", "\r\n") if crlf else out)
PY
  grep -q '#fix-preset-skills' "$PRED" || { echo "✗ predicateRegistry.js 补丁未生效"; exit 1; }
  echo "✓ predicateRegistry.js 补丁完成"
fi

node --check "$LIB" || { echo "✗ 语法检查失败（index.js），请回滚"; exit 1; }
node --check "$PRED" || { echo "✗ 语法检查失败（predicateRegistry.js），请回滚"; exit 1; }

cat <<'EOF'

✅ 全部完成。接下来重启 dsh web 服务（或刷新页面后触发 deck 重探测/刷新），
   「未检测到核心技能套件」红条应消失，25 项技能全部变绿。

   说明：
   - 补丁只做只读探测扩展：候选根追加 ~/.dsh/.agent-presets/<id>/skills/<skill>，
     名片（SKILL.md frontmatter name）合法才算已安装，与插件原判装口径一致。
   - 插件升级/重装后需重新执行本脚本（幂等，可重复执行）。
EOF

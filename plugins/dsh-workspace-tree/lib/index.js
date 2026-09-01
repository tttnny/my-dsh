/**
 * dsh-workspace-tree — node half (v3.6 projcache 元数据强一致清理版)。
 *
 * 核心功能：
 *  - GET  /debug               工作区注册表投影（诊断用）
 *  - POST /mkdir               安全创建子目录 { parent, name } → { path }
 *  - POST /open-ide            在外部 IDE 中打开指定目录 { path, ide, customCommand? }
 *  - POST /session/deleteDirect 直接永久删除会话及其实体文件、关联子孙 Subagents 与 projcache 缓存 { sessionId }
 *  - POST /archive/unarchive   恢复单条会话 { sessionId }
 *  - POST /archive/unarchiveAll 批量恢复 { workspaceId? } (null=未分组, omit=全部)
 *  - POST /archive/delete      永久删除单条归档会话及其实体文件、关联子孙 Subagents 与 projcache 缓存 { sessionId }
 *  - POST /archive/deleteAll   永久删除批量归档会话及其实体文件、关联子孙 Subagents 与 projcache 缓存 { workspaceId? }
 *  - POST /archive/cleanOrphans 一键扫描并清理孤儿 Subagents 与孤儿 projcache 缓存
 *  - POST /archive/cleanProjcache 一键扫描并清理孤儿 projcache 投影元数据缓存
 *  - POST /archive/pruneStale   清理 host 会话列表中已不存在的「幽灵归档」ID 及孤儿 projcache 缓存
 */
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";

/** Cordis 插件名（patch 行 id）。 */
const name = "@lynn123411/dsh-workspace-tree";
/** 依赖的服务。 */
const inject = ["webServer", "storageDomain"];

/** Host 路由前缀（避开 /plugins/ 的 client bundle 保留空间）。 */
const PREFIX = "/api/dsh-workspace-tree";

/** DSH 配置根目录。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolveBody(data.trim()));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("请求体 JSON 格式无效");
  }
}

/** DSH 标准安全路径编码（与 @deepseek-ai/dsh-session-persistence-jsonl 保持完全一致）。 */
function encodeSegment(raw) {
  if (!raw || typeof raw !== "string") return "";
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch;
    else out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
  }
  return out;
}

/** 调试：输出工作区注册表（path/title/id），用于诊断文件系统树。 */
async function handleDebug(ctx, req, res) {
  const registry = ctx.get("workspaceRegistry");
  if (!registry || typeof registry.list !== "function") {
    return sendJson(res, 200, { ok: false, error: "workspaceRegistry 不可用" });
  }
  const records = registry.list();
  const domain = getWorkspaceDomain(ctx);
  const archived = domain ? (domain.global.get().archivedSessionIds || []) : (registry.archivedSessionIds || []);
  sendJson(res, 200, {
    ok: true,
    archivedSessionIds: (archived || []).map(String),
    archivedCount: (archived || []).length,
    workspaces: records.map((r) => ({
      workspaceId: String(r.id),
      title: r.title,
      path: r.path,
      sessionCount: Array.isArray(r.sessionIds) ? r.sessionIds.length : 0,
      sessionIds: (r.sessionIds || []).map(String),
      archivedIds: (r.sessionIds || []).filter((id) => (archived || []).map(String).includes(String(id)))
    }))
  });
}

/** 新建子目录：增强安全校验的真实 fs.mkdir。 */
async function handleMkdir(req, res) {
  const raw = await parseJsonBody(req);
  const parentRaw = typeof raw.parent === "string" ? raw.parent.trim() : "";
  const nameRaw = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!parentRaw || !nameRaw) return sendJson(res, 200, { ok: false, error: "parent 与 name 必填" });
  
  if (nameRaw === "." || nameRaw === ".." || /[\\\\/:*?"<>|\x00-\x1F]/.test(nameRaw)) {
    return sendJson(res, 200, { ok: false, error: "文件夹名包含非法字符或路径遍历片段" });
  }

  // 必须对原始输入校验绝对路径：resolve() 总是返回绝对路径（相对输入会被静默解析到
  // 服务器进程 cwd 下），resolve 之后再检查是无效的死代码。
  if (!isAbsolute(parentRaw)) {
    return sendJson(res, 200, { ok: false, error: "parent 必须为绝对路径" });
  }

  const parent = resolve(parentRaw);

  try {
    const parentStat = await stat(parent);
    if (!parentStat.isDirectory()) {
      return sendJson(res, 200, { ok: false, error: "parent 不是有效目录" });
    }
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: `parent 目录不存在: ${String(err.message || err)}` });
  }

  // nameRaw 已排除 "/"、"\\"、"."、".."，resolve 结果必为 parent 的直接子目录
  const target = resolve(parent, nameRaw);
  await mkdir(target, { recursive: true });
  sendJson(res, 200, { ok: true, path: target });
}

/** 解析 IDE 执行路径（跨平台多路径智能探测）。 */
function resolveExecutable(ideKey, customCommand) {
  if (ideKey === "custom") {
    return (customCommand || "").trim() || "code";
  }

  const osPlatform = process.platform;
  const home = homedir();
  const env = process.env;

  const map = {
    vscode: {
      cmd: "code",
      darwin: [
        "/usr/local/bin/code",
        "/opt/homebrew/bin/code",
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        join(home, "Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "bin", "code.cmd"),
        join(env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
        join(env.ProgramFiles || "C:\\Program Files", "Microsoft VS Code", "bin", "code.cmd"),
        join(env.ProgramFiles || "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
        join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft VS Code", "bin", "code.cmd"),
        join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft VS Code", "Code.exe")
      ]
    },
    codebuddy: {
      cmd: "buddycn",
      darwin: [
        "/Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code",
        "/Applications/CodeBuddy.app/Contents/Resources/app/bin/code",
        join(home, "Applications/CodeBuddy CN.app/Contents/Resources/app/bin/code"),
        "/usr/local/bin/buddycn",
        "/opt/homebrew/bin/buddycn",
        "/usr/local/bin/codebuddy",
        "/opt/homebrew/bin/codebuddy"
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "CodeBuddy CN", "bin", "code.cmd"),
        join(env.LOCALAPPDATA || "", "Programs", "CodeBuddy CN", "CodeBuddy.exe"),
        join(env.ProgramFiles || "C:\\Program Files", "CodeBuddy CN", "bin", "code.cmd"),
        join(env.ProgramFiles || "C:\\Program Files", "CodeBuddy CN", "CodeBuddy.exe")
      ]
    },
    cursor: {
      cmd: "cursor",
      darwin: [
        "/usr/local/bin/cursor",
        "/opt/homebrew/bin/cursor",
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
        join(home, "Applications/Cursor.app/Contents/Resources/app/bin/cursor")
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "cursor", "Cursor.exe"),
        join(env.LOCALAPPDATA || "", "Programs", "cursor", "resources", "app", "bin", "cursor.cmd")
      ]
    },
    windsurf: {
      cmd: "windsurf",
      darwin: [
        "/usr/local/bin/windsurf",
        "/opt/homebrew/bin/windsurf",
        "/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf",
        join(home, "Applications/Windsurf.app/Contents/Resources/app/bin/windsurf")
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "Windsurf", "Windsurf.exe"),
        join(env.LOCALAPPDATA || "", "Programs", "Windsurf", "resources", "app", "bin", "windsurf.cmd")
      ]
    },
    trae: {
      cmd: "trae",
      darwin: [
        "/usr/local/bin/trae",
        "/opt/homebrew/bin/trae",
        "/Applications/Trae.app/Contents/Resources/app/bin/trae",
        join(home, "Applications/Trae.app/Contents/Resources/app/bin/trae")
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "Trae", "Trae.exe"),
        join(env.LOCALAPPDATA || "", "Programs", "Trae", "resources", "app", "bin", "trae.cmd")
      ]
    },
    webstorm: {
      cmd: "webstorm",
      darwin: [
        "/usr/local/bin/webstorm",
        "/opt/homebrew/bin/webstorm",
        "/Applications/WebStorm.app/Contents/MacOS/webstorm"
      ],
      win32: [
        join(env.ProgramFiles || "C:\\Program Files", "JetBrains", "WebStorm", "bin", "webstorm64.exe")
      ]
    },
    idea: {
      cmd: "idea",
      darwin: [
        "/usr/local/bin/idea",
        "/opt/homebrew/bin/idea",
        "/Applications/IntelliJ IDEA.app/Contents/MacOS/idea",
        "/Applications/IntelliJ IDEA Ultimate.app/Contents/MacOS/idea",
        "/Applications/IntelliJ IDEA Community Edition.app/Contents/MacOS/idea"
      ],
      win32: [
        join(env.ProgramFiles || "C:\\Program Files", "JetBrains", "IntelliJ IDEA", "bin", "idea64.exe"),
        join(env.ProgramFiles || "C:\\Program Files", "JetBrains", "IntelliJ IDEA Community Edition", "bin", "idea64.exe")
      ]
    },
    pycharm: {
      cmd: "pycharm",
      darwin: [
        "/usr/local/bin/pycharm",
        "/opt/homebrew/bin/pycharm",
        "/Applications/PyCharm.app/Contents/MacOS/pycharm",
        "/Applications/PyCharm CE.app/Contents/MacOS/pycharm"
      ],
      win32: [
        join(env.ProgramFiles || "C:\\Program Files", "JetBrains", "PyCharm", "bin", "pycharm64.exe"),
        join(env.ProgramFiles || "C:\\Program Files", "JetBrains", "PyCharm Community Edition", "bin", "pycharm64.exe")
      ]
    },
    zed: {
      cmd: "zed",
      darwin: [
        "/usr/local/bin/zed",
        "/opt/homebrew/bin/zed",
        "/Applications/Zed.app/Contents/MacOS/cli",
        join(home, "Applications/Zed.app/Contents/MacOS/cli")
      ],
      win32: [
        join(env.LOCALAPPDATA || "", "Programs", "Zed", "zed.exe")
      ]
    },
    sublime: {
      cmd: "subl",
      darwin: [
        "/usr/local/bin/subl",
        "/opt/homebrew/bin/subl",
        "/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl"
      ],
      win32: [
        join(env.ProgramFiles || "C:\\Program Files", "Sublime Text", "subl.exe"),
        join(env.ProgramFiles || "C:\\Program Files", "Sublime Text 3", "subl.exe")
      ]
    }
  };

  const def = map[ideKey] || { cmd: ideKey || "code" };
  const candidates = (osPlatform === "darwin" ? def.darwin : osPlatform === "win32" ? def.win32 : []) || [];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return def.cmd;
}

/** 启动外部 IDE 打开指定目录。 */
function launchEditor(executable, targetPath) {
  return new Promise((resolveLaunch, rejectLaunch) => {
    let settled = false;
    const isWinCmd = process.platform === "win32" && (executable.toLowerCase().endsWith(".cmd") || executable.toLowerCase().endsWith(".bat"));
    const child = spawn(executable, [targetPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: isWinCmd
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      const hint = error.code === "ENOENT"
        ? `未找到命令「${executable}」，请确保已安装相应 IDE 的命令行工具，或在设置中指定可执行文件的完整绝对路径。`
        : error.message;
      rejectLaunch(new Error(hint));
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolveLaunch();
    });
  });
}

/** 在 IDE 中打开目录。 */
async function handleOpenIde(req, res) {
  const raw = await parseJsonBody(req);
  const targetPathRaw = typeof raw.path === "string" ? raw.path.trim() : "";
  if (!targetPathRaw) {
    return sendJson(res, 200, { ok: false, error: "path 必填" });
  }
  // 对原始输入校验绝对路径（resolve 后再检查恒为 true，是死代码）
  if (!isAbsolute(targetPathRaw)) {
    return sendJson(res, 200, { ok: false, error: "path 必须为绝对路径" });
  }
  const targetPath = resolve(targetPathRaw);
  try {
    const s = await stat(targetPath);
    if (!s.isDirectory() && !s.isFile()) {
      return sendJson(res, 200, { ok: false, error: "目标路径不是有效文件或目录" });
    }
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: `路径不存在: ${String(err.message || err)}` });
  }

  const ide = typeof raw.ide === "string" ? raw.ide.trim() : "vscode";
  const customCommand = typeof raw.customCommand === "string" ? raw.customCommand.trim() : "";
  const executable = resolveExecutable(ide, customCommand);

  try {
    await launchEditor(executable, targetPath);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

// ───── 归档域 helpers ─────
function getWorkspaceDomain(ctx) {
  try {
    const d = ctx.storageDomain.get("workspace");
    if (d) return d;
  } catch {}
  return null;
}

/**
 * 封装工作区状态事务：
 * 优先在 workspaceRegistry.enqueueOperation 队列中执行，并同步刷新内存缓存与实体；
 * 避免直接裸改 storageDomain 导致官方内存权威状态未更新而被后续操作回滚。
 */
async function mutateWorkspaceState(ctx, mutator) {
  const domain = getWorkspaceDomain(ctx);
  if (!domain) throw new Error("workspace domain 未就绪");
  const registry = ctx.get("workspaceRegistry");

  if (registry && typeof registry.enqueueOperation === "function") {
    return await registry.enqueueOperation(async () => {
      const g = registry.global || domain.global;
      const table = registry.table || domain.table("workspaces");
      const currentState = typeof registry.requireState === "function" ? registry.requireState() : g.get();
      const result = await mutator(currentState, table, g);
      if (registry.state) registry.state = g.get();
      if (typeof registry.rebuildEntities === "function") registry.rebuildEntities();
      return result;
    });
  } else {
    const g = domain.global;
    const table = domain.table("workspaces");
    const currentState = g.get();
    return await mutator(currentState, table, g);
  }
}

/**
 * 极速读取 session.jsonl / session.jsonl.zstd 文件的 Header 首行。
 * 利用 DSH 底层首行 Header 单独作为独立 Frame-0 压缩的物理特性，仅读取头部 4KB。
 */
async function readSessionHeaderFast(logFilePath) {
  let fd = null;
  try {
    fd = await open(logFilePath, "r");
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buf, 0, 4096, 0);
    if (bytesRead <= 0) return null;

    let text = "";
    if (logFilePath.endsWith(".zstd")) {
      try {
        const decompressed = zstdDecompressSync(buf.subarray(0, bytesRead));
        text = decompressed.toString("utf8");
      } catch {
        return null;
      }
    } else {
      text = buf.toString("utf8", 0, bytesRead);
    }

    const firstLine = text.split("\n")[0]?.trim();
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine);
    if (parsed && typeof parsed === "object" && parsed.type === "session") {
      return parsed;
    }
  } catch {
    // 读取或解析失败时静默忽略
  } finally {
    if (fd) {
      try { await fd.close(); } catch {}
    }
  }
  return null;
}

/**
 * 扫描 ~/.dsh/sessions/ 目录下的所有会话元数据并构建拓扑关系图。
 */
async function scanSessionTopology() {
  const sessionsRoot = join(dshHome(), "sessions");
  const sessionMap = new Map(); // id -> { id, projectDir, sessionDir, encodedId, header, sizeBytes }
  const childrenMap = new Map(); // parentSessionId -> [childSessionId, ...]

  try {
    const scopes = await readdir(sessionsRoot, { withFileTypes: true });
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const projectPath = join(sessionsRoot, scope.name);
      let sDirs = [];
      try {
        sDirs = await readdir(projectPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const sDir of sDirs) {
        if (!sDir.isDirectory()) continue;
        const targetSessionDir = join(projectPath, sDir.name);
        const zstdFile = join(targetSessionDir, "session.jsonl.zstd");
        const jsonlFile = join(targetSessionDir, "session.jsonl");

        let logFile = null;
        let sizeBytes = 0;
        try {
          if (existsSync(zstdFile)) {
            logFile = zstdFile;
            const st = await stat(zstdFile);
            sizeBytes = st.size;
          } else if (existsSync(jsonlFile)) {
            logFile = jsonlFile;
            const st = await stat(jsonlFile);
            sizeBytes = st.size;
          }
        } catch {
          continue;
        }

        if (!logFile) continue;
        const header = await readSessionHeaderFast(logFile);
        const sid = (header && typeof header.id === "string" && header.id) ? header.id : sDir.name;

        const info = {
          id: sid,
          projectDir: scope.name,
          sessionDir: sDir.name,
          encodedId: sDir.name,
          logFile,
          header: header || { id: sid, origin: "unknown", delegationDepth: 0 },
          sizeBytes
        };
        sessionMap.set(sid, info);

        if (header && typeof header.parentSession === "string" && header.parentSession) {
          const pid = header.parentSession;
          const list = childrenMap.get(pid) || [];
          list.push(sid);
          childrenMap.set(pid, list);
        }
      }
    }
  } catch {}

  // 识别孤儿 Subagents：origin === 'subagent' 且其直接 parent 不在 sessionMap 中，或其祖先链路断裂
  const orphanList = [];
  const validParentSet = new Set(sessionMap.keys());

  // 辅助函数：判断会话的祖先是否完整存活
  function isOrphan(item) {
    if (item.header.origin !== "subagent") return false;
    const pid = item.header.parentSession;
    // validParentSet 即 sessionMap 的键集，父会话缺失 ⇔ 父会话不存在
    return !pid || !validParentSet.has(pid);
  }

  for (const item of sessionMap.values()) {
    if (isOrphan(item)) {
      orphanList.push(item);
    }
  }

  return { childrenMap, orphanList };
}

/**
 * 递归/BFS 收集目标会话及其所有派生出的子孙 Subagent 会话 ID。
 */
function collectDescendantSessionIds(targetSessionId, childrenMap) {
  const result = [targetSessionId];
  const visited = new Set([targetSessionId]);
  const queue = [targetSessionId];

  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        result.push(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

/**
 * 安全物理删除单条会话目录（带严密路径越界与层级防护）及关联 projcache 元数据缓存。
 */
async function removeSessionPhysicalDir(sessionId) {
  if (!sessionId || typeof sessionId !== "string") return false;
  const sid = sessionId.trim();
  const encodedId = encodeSegment(sid);
  // encodeSegment 已将 "." / ".." 编码为 ~002E / ~002E~002E，只需判空
  if (!encodedId) return false;

  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  let removedAny = false;

  try {
    const scopes = await readdir(sessionsRoot, { withFileTypes: true });
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const targetSessionDir = resolve(sessionsRoot, scope.name, encodedId);

      // 安全校验：必须严格位于 sessionsRoot 之下，且路径层级至少比 sessionsRoot 深 2 级
      if (!targetSessionDir.startsWith(sessionsRoot + sep)) continue;
      const rel = targetSessionDir.slice(sessionsRoot.length + 1).split(sep);
      if (rel.length < 2) continue; // 必须是 <scope>/<encodedId>

      try {
        const s = await stat(targetSessionDir);
        if (s.isDirectory()) {
          await rm(targetSessionDir, { recursive: true, force: true });
          removedAny = true;
        }
      } catch {}
    }
  } catch {}

  // 同步物理清理 ~/.dsh/storages/session_projcache/sessions/<id>.json 独立缓存文件
  try {
    const projcacheSessionsDir = resolve(join(dshHome(), "storages", "session_projcache", "sessions"));
    const candidateFiles = [
      resolve(projcacheSessionsDir, `${sid}.json`),
      resolve(projcacheSessionsDir, `${encodedId}.json`)
    ];
    for (const cf of candidateFiles) {
      if (cf.startsWith(projcacheSessionsDir + sep)) {
        try {
          await rm(cf, { force: true });
        } catch {}
      }
    }
  } catch {}

  return removedAny;
}

/**
 * 从工作区注册表、全局归档列表以及 session_projcache 存储域中单事务剔除指定会话 ID（各删除引擎共用）。
 */
async function stripSessionIdsFromRegistry(ctx, sessionIds) {
  const stripSet = new Set(sessionIds.map(String));
  await mutateWorkspaceState(ctx, async (state, table, g) => {
    for (const [wid, rec] of table.entries()) {
      const curIds = rec.sessionIds || [];
      const nextIds = curIds.filter((id) => !stripSet.has(String(id)));
      if (nextIds.length !== curIds.length) {
        await table.update(wid, (cur) => ({
          ...cur,
          sessionIds: nextIds,
          updatedAt: new Date().toISOString()
        }));
      }
    }
    const archived = (state.archivedSessionIds || []).map(String);
    const nextArchived = archived.filter((id) => !stripSet.has(id));
    if (nextArchived.length !== archived.length) {
      try { await g.set({ ...state, archivedSessionIds: nextArchived }); } catch {}
    }
  });

  // 同步从 session_projcache 存储域的 sessions 内存表与写链中删除
  try {
    const projDomain = ctx.storageDomain?.get?.("session_projcache");
    if (projDomain) {
      const table = projDomain.table("sessions");
      if (table && typeof table.delete === "function") {
        for (const sid of sessionIds) {
          try {
            await table.delete(String(sid).trim());
          } catch {}
        }
      }
    }
  } catch {}
}

/**
 * 批量物理删除会话目录，并联动清理内存中的会话实例。
 */
async function removeSessionsPhysically(ctx, sessionIds) {
  for (const sid of sessionIds) {
    await removeSessionPhysicalDir(sid);
  }
  try {
    const sessions = ctx.get("sessions");
    if (sessions && typeof sessions.delete === "function") {
      for (const sid of sessionIds) sessions.delete(sid);
    }
  } catch {}
}

/**
 * 级联物理删除核心引擎：
 * 1. 扫描拓扑，收集 targetSessionId 及其所有的派生子孙 Subagent ID；
 * 2. 活跃会话防护：若包含当前进程会话则强阻断；
 * 3. 单事务剔除注册表/归档 + 物理删除 + 内存清理。
 */
async function deleteSessionCascade(ctx, targetSessionId) {
  if (!targetSessionId || typeof targetSessionId !== "string") {
    throw new Error("sessionId 必填且必须为字符串");
  }
  const sid = targetSessionId.trim();

  const { childrenMap } = await scanSessionTopology();
  const allToDelete = collectDescendantSessionIds(sid, childrenMap);

  const activeSessionId = process.env.DSH_SESSION_ID;
  if (activeSessionId && allToDelete.includes(activeSessionId)) {
    throw new Error("无法删除当前正在运行的活跃会话");
  }

  await stripSessionIdsFromRegistry(ctx, allToDelete);
  await removeSessionsPhysically(ctx, allToDelete);

  return allToDelete;
}

/**
 * 批量级联物理删除一组会话：只扫描一次拓扑，逐目标收集子孙闭包
 * （含活跃会话的目标整组跳过，与单删语义一致），随后单事务统一剔除并批量落盘删除。
 */
async function deleteSessionListCascade(ctx, sessionIds) {
  const targets = [...new Set((sessionIds || []).map((s) => String(s).trim()).filter(Boolean))];
  if (targets.length === 0) return [];

  const { childrenMap } = await scanSessionTopology();
  const activeSessionId = process.env.DSH_SESSION_ID;
  const allToDelete = new Set();
  for (const target of targets) {
    const cascade = collectDescendantSessionIds(target, childrenMap);
    if (activeSessionId && cascade.includes(activeSessionId)) continue;
    for (const id of cascade) allToDelete.add(id);
  }
  if (allToDelete.size === 0) return [];

  const ids = [...allToDelete];
  await stripSessionIdsFromRegistry(ctx, ids);
  await removeSessionsPhysically(ctx, ids);
  return ids;
}

/**
 * 孤儿 Subagents 清理引擎。
 */
async function cleanOrphanSubagents(ctx) {
  const { orphanList } = await scanSessionTopology();
  if (orphanList.length === 0) {
    return { cleanedCount: 0, cleanedIds: [], freedBytes: 0 };
  }

  const activeSessionId = process.env.DSH_SESSION_ID;
  const validOrphans = orphanList.filter((o) => o.id !== activeSessionId);
  const orphanIds = validOrphans.map((o) => o.id);
  const freedBytes = validOrphans.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);

  await stripSessionIdsFromRegistry(ctx, orphanIds);
  await removeSessionsPhysically(ctx, orphanIds);

  return { cleanedCount: orphanIds.length, cleanedIds: orphanIds, freedBytes };
}

/**
 * 孤儿 projcache 投影元数据清理引擎：
 * 扫描 ~/.dsh/storages/session_projcache/sessions/ 目录，
 * 清理底层 sessions 物理目录已不存在（且非当前活跃会话）的残留 .json 文件与存储域记录。
 */
async function cleanOrphanProjcache(ctx) {
  const projcacheSessionsDir = resolve(join(dshHome(), "storages", "session_projcache", "sessions"));
  let entries = [];
  try {
    entries = await readdir(projcacheSessionsDir, { withFileTypes: true });
  } catch {
    return { cleanedCount: 0, cleanedIds: [], freedBytes: 0 };
  }

  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  const activeSessionId = process.env.DSH_SESSION_ID;

  // 收集磁盘上真实存在的物理会话目录集合（同时包含原始名称与 URL 安全编码名称）
  const existingSessionDirs = new Set();
  try {
    const scopes = await readdir(sessionsRoot, { withFileTypes: true });
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const projectPath = join(sessionsRoot, scope.name);
      try {
        const sDirs = await readdir(projectPath, { withFileTypes: true });
        for (const s of sDirs) {
          if (s.isDirectory()) {
            existingSessionDirs.add(s.name);
          }
        }
      } catch {}
    }
  } catch {}

  const orphanIds = [];
  let freedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const sid = entry.name.slice(0, -5);
    const encodedId = encodeSegment(sid);

    // 当前活跃会话严格保护
    if (activeSessionId && (sid === activeSessionId || encodedId === activeSessionId)) continue;

    // 检查磁盘上是否存在对应的物理会话目录
    const existsPhysically = existingSessionDirs.has(sid) || existingSessionDirs.has(encodedId);
    if (!existsPhysically) {
      const filePath = join(projcacheSessionsDir, entry.name);
      try {
        const st = await stat(filePath);
        freedBytes += st.size || 0;
        await rm(filePath, { force: true });
        orphanIds.push(sid);
      } catch {}
    }
  }

  if (orphanIds.length > 0) {
    await stripSessionIdsFromRegistry(ctx, orphanIds);
  }

  return { cleanedCount: orphanIds.length, cleanedIds: orphanIds, freedBytes };
}

// 从 archivedSet 计算待操作集合
function archivedForWorkspace(archivedIds, workspaceRecord) {
  const set = new Set(archivedIds);
  return (workspaceRecord.sessionIds || []).filter((id) => set.has(String(id)));
}

function ungroupedArchived(archivedIds, table) {
  const accounted = new Set();
  for (const [, rec] of table.entries()) {
    for (const sid of rec.sessionIds || []) accounted.add(String(sid));
  }
  return archivedIds.filter((id) => !accounted.has(String(id)));
}

async function handleUnarchive(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  if (!sessionId) return sendJson(res, 200, { ok: false, error: "sessionId 必填" });

  await mutateWorkspaceState(ctx, async (state, table, g) => {
    const archived = (state.archivedSessionIds || []).map(String);
    if (!archived.includes(sessionId)) return;
    const nextArchived = archived.filter((id) => id !== sessionId);
    const next = { ...state, archivedSessionIds: nextArchived };
    await g.set(next);
  });

  sendJson(res, 200, { ok: true });
}

async function handleUnarchiveAll(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const workspaceId = raw.workspaceId === undefined ? undefined : raw.workspaceId;

  let restored = [];
  await mutateWorkspaceState(ctx, async (state, table, g) => {
    const archived = (state.archivedSessionIds || []).map(String);
    let toRemove;
    if (workspaceId === undefined) {
      toRemove = new Set(archived);
    } else if (workspaceId === null) {
      toRemove = new Set(ungroupedArchived(archived, table));
    } else {
      const rec = table.get(String(workspaceId));
      if (!rec) throw new Error("workspace 不存在: " + workspaceId);
      toRemove = new Set(archivedForWorkspace(archived, rec));
    }
    if (toRemove.size === 0) return;
    restored = [...toRemove];
    const next = { ...state, archivedSessionIds: archived.filter((id) => !toRemove.has(id)) };
    await g.set(next);
  });

  sendJson(res, 200, { ok: true, restored });
}

/**
 * 单条会话级联物理删除（关联所有 Subagents）。
 * /archive/delete（归档会话删除）与 /session/deleteDirect（普通会话直达删除）共用。
 */
async function handleDeleteSession(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  if (!sessionId) return sendJson(res, 200, { ok: false, error: "sessionId 必填" });

  try {
    const deleted = await deleteSessionCascade(ctx, sessionId);
    sendJson(res, 200, { ok: true, deleted });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/** 批量永久删除归档会话（级联物理删除关联所有 Subagents）。 */
async function handleDeleteAll(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const workspaceId = raw.workspaceId === undefined ? undefined : raw.workspaceId;

  let toRemove = [];
  const domain = getWorkspaceDomain(ctx);
  const state = domain ? domain.global.get() : {};
  const table = domain ? domain.table("workspaces") : new Map();
  const archived = (state.archivedSessionIds || []).map(String);

  if (workspaceId === undefined) {
    toRemove = [...archived];
  } else if (workspaceId === null) {
    toRemove = ungroupedArchived(archived, table);
  } else {
    const rec = table.get(String(workspaceId));
    if (!rec) return sendJson(res, 200, { ok: false, error: "workspace 不存在: " + workspaceId });
    toRemove = archivedForWorkspace(archived, rec);
  }

  if (toRemove.length === 0) {
    return sendJson(res, 200, { ok: true, deleted: [] });
  }

  try {
    const deleted = await deleteSessionListCascade(ctx, toRemove);
    sendJson(res, 200, { ok: true, deleted });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/** 一键扫描并清理孤儿 Subagents 及孤儿 projcache 缓存。 */
async function handleCleanOrphans(ctx, req, res) {
  try {
    const orphanSubagents = await cleanOrphanSubagents(ctx);
    const orphanProjcache = await cleanOrphanProjcache(ctx);
    sendJson(res, 200, {
      ok: true,
      cleanedCount: orphanSubagents.cleanedCount + orphanProjcache.cleanedCount,
      cleanedIds: [...orphanSubagents.cleanedIds, ...orphanProjcache.cleanedIds],
      freedBytes: orphanSubagents.freedBytes + orphanProjcache.freedBytes,
      orphanSubagents,
      orphanProjcache
    });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/** 一键扫描并清理孤儿 projcache 投影元数据缓存。 */
async function handleCleanProjcache(ctx, req, res) {
  try {
    const result = await cleanOrphanProjcache(ctx);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/**
 * 清理失效归档（幽灵归档）：
 * 会话日志已被物理删除（如历史级联删除、DSH 升级）后，其 ID 仍残留在全局归档列表里，
 * 但 host 会话列表已不再返回它们，任何 UI 都无法再展示/打开。
 * 从权威 host 会话列表（sessionController.list）取存活 ID 集，剔除归档列表中的失效项，
 * 并同步清理残留的孤儿 projcache 缓存。
 * body.aliveIds 仅作 fallback（sessionController 不可用时）。
 */
async function handlePruneStaleArchives(ctx, req, res) {
  // 无条件消费请求体（未读取的 body 会阻碍连接复用），aliveIds 仅作 fallback 用
  const raw = await parseJsonBody(req);
  let alive = null;
  try {
    const sc = ctx.get("sessionController");
    if (sc && typeof sc.list === "function") {
      const items = await sc.list();
      alive = new Set((items || []).map((it) => String((it && (it.sessionId || it.id)) || "")));
      if (alive.size === 0) alive = null;
    }
  } catch { /* fallback below */ }
  if (!alive) {
    if (Array.isArray(raw.aliveIds)) {
      alive = new Set(raw.aliveIds.map(String).filter(Boolean));
    }
  }
  if (!alive || alive.size === 0) {
    return sendJson(res, 200, { ok: false, error: "无法读取 host 会话列表" });
  }
  let pruned = [];
  await mutateWorkspaceState(ctx, async (state, table, g) => {
    const archived = (state.archivedSessionIds || []).map(String);
    const stale = archived.filter((id) => !alive.has(id));
    if (stale.length === 0) return;
    pruned = stale;
    const next = archived.filter((id) => alive.has(id));
    await g.set({ ...state, archivedSessionIds: next });
  });
  const orphanProjcache = await cleanOrphanProjcache(ctx);
  sendJson(res, 200, { ok: true, pruned, orphanProjcache });
}

/**
 * 跨客户端空白草稿占用声明注册表（host 内存态，全客户端共享）。
 * 背景：localStorage 心跳只在同一浏览器档案内互通——桌面端与浏览器、两个不同
 * Chrome Profile 之间互不可见，导致另一客户端的空白草稿回收把本端正在使用的
 * 草稿物理删除。占用声明改走 host，天然跨进程/跨浏览器档案全局可见。
 * tabId -> { sid, t }；读取/写入时顺带按 TTL 清扫死亡声明。
 */
const claims = new Map();
const CLAIM_TTL_MS = 5 * 60 * 1000;

function sweepClaims() {
  const cutoff = Date.now() - CLAIM_TTL_MS;
  for (const [k, v] of claims) {
    if (!v || typeof v.t !== "number" || v.t < cutoff) claims.delete(k);
  }
}

/** POST /claims/heartbeat { tabId, sid|null } —— 声明本客户端当前打开的会话。 */
async function handleClaimHeartbeat(req, res) {
  const raw = await parseJsonBody(req);
  const tabId = typeof raw.tabId === "string" ? raw.tabId.trim().slice(0, 128) : "";
  if (!tabId) return sendJson(res, 200, { ok: false, error: "tabId 必填" });
  sweepClaims();
  claims.set(tabId, { sid: raw.sid ? String(raw.sid) : null, t: Date.now() });
  sendJson(res, 200, { ok: true });
}

/** POST /claims/list {} —— 返回全部存活声明占用的会话 ID 列表。 */
async function handleClaimList(req, res) {
  await parseJsonBody(req); // 无条件消费请求体（保持连接复用）
  sweepClaims();
  const sids = [];
  for (const v of claims.values()) {
    if (v && v.sid) sids.push(v.sid);
  }
  sendJson(res, 200, { ok: true, sids });
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://x");
      const rest = url.pathname.split("/").filter(Boolean).slice(2);
      const head = rest[0];
      try {
        if (head === "debug" && (req.method === "GET" || req.method === "HEAD")) return await handleDebug(ctx, req, res);
        if (head === "claims" && req.method === "POST") {
          const sub = rest[1];
          if (sub === "heartbeat") return await handleClaimHeartbeat(req, res);
          if (sub === "list") return await handleClaimList(req, res);
        }
        if (head === "mkdir" && req.method === "POST") return await handleMkdir(req, res);
        if (head === "open-ide" && req.method === "POST") return await handleOpenIde(req, res);
        if (head === "session" && req.method === "POST") {
          const sub = rest[1];
          if (sub === "deleteDirect") return await handleDeleteSession(ctx, req, res);
        }
        if (head === "archive" && req.method === "POST") {
          const sub = rest[1];
          if (sub === "unarchive") return await handleUnarchive(ctx, req, res);
          if (sub === "unarchiveAll") return await handleUnarchiveAll(ctx, req, res);
          if (sub === "delete") return await handleDeleteSession(ctx, req, res);
          if (sub === "deleteAll") return await handleDeleteAll(ctx, req, res);
          if (sub === "cleanOrphans") return await handleCleanOrphans(ctx, req, res);
          if (sub === "cleanProjcache") return await handleCleanProjcache(ctx, req, res);
          if (sub === "pruneStale") return await handlePruneStaleArchives(ctx, req, res);
        }
        sendJson(res, 404, { ok: false, error: "not found" });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
      }
    }
  }), "dsh-workspace-tree: routes");
}

export { apply, inject, name };

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
 *  - POST /workspace/pruneGhosts 清理各工作区 sessionIds 中 host 会话列表已不再返回的
 *    「幽灵会话」ID（日志/缓存均已不存在、但注册表文件仍残留引用的历史残留）及孤儿 projcache 缓存
 */
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";
import z from "@deepseek-ai/schemastery";

/** Cordis 插件名（patch 行 id）。 */
const name = "@lynn123411/dsh-workspace-tree";
/** 依赖的服务。settings 为 DSH 官方用户设置服务：本插件的用户偏好
 * （默认 IDE 等）注册为命名空间后持久化到 ~/.dsh/settings.yaml，
 * 跨重启/跨端口/跨浏览器一致（localStorage 仅按源隔离，不可用）。 */
const inject = ["webServer", "storageDomain", "settings"];

/** 本插件在 settings 服务中的命名空间（小写连字符文法）。 */
const SETTINGS_NS = "dsh-workspace-tree";

/** settings scope 句柄（apply 注册成功后持有，供 handleOpenIde 读取服务端 custom 命令）。 */
let settingsScope = null;

/** IDE 白名单：未知 ideKey 直接拒绝，不透传给 spawn（见 handleOpenIde）。 */
const KNOWN_IDE_KEYS = new Set([
  "vscode", "codebuddy", "cursor", "windsurf", "trae",
  "webstorm", "idea", "pycharm", "zed", "sublime", "custom"
]);

/** Windows cmd 元字符：targetPath/可执行名含这些字符时拒绝执行（shell:true 下会被解释）。 */
const WIN_CMD_METACHARS = /[&|<>\^;%!`$"'\r\n]/;

/** 用户偏好 schema：默认值与浏览器半区 DEFAULT_CONFIG 保持一致。
 * UI 瞬态（展开/隐藏/墓碑/当前模式）仍留 localStorage，不进设置。 */
const CONFIG_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  indent: z.number().min(8).max(32).default(16),
  defaultMode: z.string().default("workspace"),
  showAgg: z.boolean().default(true),
  showCount: z.boolean().default(true),
  defaultIde: z.string().default("vscode"),
  customIdeCommand: z.string().default("")
});

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

/** encodeSegment 的逆操作（严格版）：整串必须能逐段解析（普通字符或 ~XXXX），
 * 否则返回 null。注意含 ~002E 字面量的普通名会被误解为 '.'，因此结果仅用于
 * header 缺失时的展示/统计，绝不单独作为删除匹配依据。 */
function tryDecodeSegment(encoded) {
  if (!encoded || typeof encoded !== "string") return null;
  if (!encoded.includes("~")) return encoded;
  if (!/^(?:[^~]|~[0-9A-Fa-f]{4})*$/.test(encoded)) return null;
  try {
    return encoded.replace(/~([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return null;
  }
}

/** 调试：输出工作区注册表（path/title/id），用于诊断文件系统树。
 * 注意：本端点无鉴权，仅假定 webServer 监听回环地址；不要在公网暴露 DSH 端口。 */
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

  // Windows 语义下 shell 元字符与尾随空格/点会导致 open-ide 侧注入或建出不可管理目录
  // （与 open-ide 的 WIN_CMD_METACHARS 对齐，另加单引号）
  if (process.platform === "win32" && (/[&;`$()^!%~']/.test(nameRaw) || /[ .]$/.test(nameRaw))) {
    return sendJson(res, 200, { ok: false, error: "文件夹名包含 Windows 下的非法字符" });
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
  if (!KNOWN_IDE_KEYS.has(ide)) {
    // 逃生舱：白名单之外的绝对路径且文件存在时放行（如手写 settings 配的 nvim 等），
    // 其余一律拒绝（ previously 任意字符串直达 spawn）。注意本接口假定调用方
    // 为本机可信页面（回环），白名单主防误配与混淆而非权限边界。
    if (!(isAbsolute(ide) && existsSync(ide))) {
      return sendJson(res, 200, { ok: false, error: `未知的 IDE 类型: ${ide}（可用列表见设置页，或改用绝对路径）` });
    }
  }
  // custom 命令只信任服务端 settings（用户在设置页配置的值），忽略请求体，
  // 防止任意调用方借本接口让 host spawn 任意命令。
  let customCommand = "";
  if (ide === "custom") {
    try {
      const cfg = settingsScope && typeof settingsScope.get === "function" ? settingsScope.get() : null;
      customCommand = cfg && typeof cfg.customIdeCommand === "string" ? cfg.customIdeCommand.trim() : "";
    } catch { customCommand = ""; }
    if (!customCommand) {
      return sendJson(res, 200, { ok: false, error: "未配置自定义 IDE 命令，请先在设置中填写" });
    }
  }
  const executable = resolveExecutable(ide, customCommand);

  // Windows 下 .cmd/.bat 必须走 shell:true（见 launchEditor），此时路径中的
  // cmd 元字符会被解释执行；含元字符直接拒绝（POSIX 下 shell:false，不受影响）。
  if (process.platform === "win32" && (WIN_CMD_METACHARS.test(executable) || WIN_CMD_METACHARS.test(targetPath))) {
    return sendJson(res, 200, { ok: false, error: "路径含 Windows shell 元字符，拒绝执行（请重命名目录或更换 IDE 命令）" });
  }

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
      const syncMemory = () => {
        try {
          if (registry.state) registry.state = g.get();
        } catch (err) {
          console.warn("[dsh-workspace-tree] 工作区内存状态同步失败:", err?.message || err);
        }
        try {
          if (typeof registry.rebuildEntities === "function") registry.rebuildEntities();
        } catch (err) {
          console.warn("[dsh-workspace-tree] 工作区实体重建失败:", err?.message || err);
        }
      };
      try {
        const currentState = typeof registry.requireState === "function" ? registry.requireState() : g.get();
        return await mutator(currentState, table, g);
      } finally {
        // 无论 mutator 成功与否都把内存权威状态对齐到落盘值：
        // 异常导致半写时，内存若停留在旧快照，下一次读-改-写会把已落盘的剔除写回（回滚）。
        syncMemory();
      }
    });
  } else {
    const g = domain.global;
    const table = domain.table("workspaces");
    const syncMemory = () => {
      try {
        const registry2 = ctx.get("workspaceRegistry");
        if (registry2 && registry2.state) registry2.state = g.get();
        if (registry2 && typeof registry2.rebuildEntities === "function") registry2.rebuildEntities();
      } catch { /* ignore */ }
    };
    try {
      const currentState = g.get();
      return await mutator(currentState, table, g);
    } finally {
      syncMemory();
    }
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
      } catch (err) {
        console.warn(`[dsh-workspace-tree] 会话头解压失败（跳过该会话的拓扑分析）: ${logFilePath}: ${err?.message || err}`);
        return null;
      }
    } else {
      text = buf.toString("utf8", 0, bytesRead);
    }

    const firstLine = text.split("\n")[0]?.trim();
    if (!firstLine) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(firstLine);
    } catch (err) {
      console.warn(`[dsh-workspace-tree] 会话头解析失败（跳过该会话的拓扑分析）: ${logFilePath}: ${err?.message || err}`);
      return null;
    }
    if (parsed && typeof parsed === "object" && parsed.type === "session") {
      return parsed;
    }
  } catch (err) {
    console.warn(`[dsh-workspace-tree] 会话头读取失败（跳过该会话的拓扑分析）: ${logFilePath}: ${err?.message || err}`);
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
        // header 缺失时回退：目录名是 encodeSegment 后的编码形，先逆解码，
        // 解不出才用目录名原文（此时仅用于展示/统计，不用于精确删除匹配）。
        const sid = (header && typeof header.id === "string" && header.id)
          ? header.id
          : (tryDecodeSegment(sDir.name) || sDir.name);

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
      try {
        await g.set({ ...state, archivedSessionIds: nextArchived });
      } catch (err) {
        console.warn("[dsh-workspace-tree] 归档列表剔除落盘失败:", err?.message || err);
        throw err; // 向上传递进 mutate 的 finally 保底同步，避免内存/落盘分叉后被旧快照回滚
      }
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

  // 服务端权威活跃保护（运行中 ∪ 占用声明 ∪ env 补充）：目标闭包内含受保护
  // 会话则整单阻断。注意 process.env.DSH_SESSION_ID 在 host 进程通常取不到，
  // 不可做唯一依据，见 protectedSessionIds。
  const safe = await protectedSessionIds(ctx);
  const hit = allToDelete.find((id) => safe.has(String(id)));
  if (hit !== undefined) {
    throw new Error(`无法删除当前正在运行/被占用的活跃会话: ${hit}`);
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
  const safe = await protectedSessionIds(ctx);
  const allToDelete = new Set();
  const skippedActive = [];
  for (const target of targets) {
    const cascade = collectDescendantSessionIds(target, childrenMap);
    const hit = cascade.find((id) => safe.has(String(id)));
    if (hit !== undefined) { skippedActive.push(target); continue; }
    for (const id of cascade) allToDelete.add(id);
  }
  if (skippedActive.length > 0) {
    console.warn(`[dsh-workspace-tree] 批量删除跳过含活跃会话的目标: ${skippedActive.join(", ")}`);
  }
  if (allToDelete.size === 0) return [];

  const ids = [...allToDelete];
  await stripSessionIdsFromRegistry(ctx, ids);
  await removeSessionsPhysically(ctx, ids);
  return ids;
}

/**
 * 孤儿 Subagents 清理引擎（循环到不动点：父被删后子在下一轮变孤儿，最多 5 轮）。
 * 无进展即停：删不掉的孤儿不再重复计入 cleanedIds/freedBytes（避免响应撒谎）。
 */
async function cleanOrphanSubagents(ctx) {
  const cleanedIds = [];
  const seen = new Set();
  let freedBytes = 0;
  const MAX_ROUNDS = 5;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { orphanList } = await scanSessionTopology();
    if (orphanList.length === 0) break;
    const safe = await protectedSessionIds(ctx);
    const validOrphans = orphanList.filter((o) => !safe.has(String(o.id)) && !seen.has(String(o.id)));
    if (validOrphans.length === 0) break;
    const orphanIds = validOrphans.map((o) => o.id);
    freedBytes += validOrphans.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);
    await stripSessionIdsFromRegistry(ctx, orphanIds);
    await removeSessionsPhysically(ctx, orphanIds);
    for (const id of orphanIds) seen.add(String(id));
    cleanedIds.push(...orphanIds);
  }
  return { cleanedCount: cleanedIds.length, cleanedIds, freedBytes };
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
  const safe = await protectedSessionIds(ctx);

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

    // 当前活跃/被占用会话严格保护：原始 ID 查一次，编码形再查一次做兜底
    // （标准会话 ID 编码前后恒等，第二查主要覆盖非标准 ID 的目录形态）
    if (safe.has(sid) || safe.has(encodedId)) continue;

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

  // 先在单事务内按最新归档快照认领待删集合并移出归档：并发的 unarchiveAll
  // 在其事务内看到的是认领后的集合，不会把刚恢复的会话纳入删除；反向交错
  // （先恢复后认领）认领时也会看到最新归档而排除已恢复者。两方向都安全。
  // 注意：认领排除受保护会话（运行中/被占用），它们留在归档里不动；
  // 认领后若物理删除失败，已认领者会回到可见态（fail-visible），可重试。
  let toRemove = [];
  let skipped = [];
  try {
    const safe = await protectedSessionIds(ctx);
    const res = await mutateWorkspaceState(ctx, async (state, table, g) => {
      const archived = (state.archivedSessionIds || []).map(String);
      let claimed;
      if (workspaceId === undefined) {
        claimed = [...archived];
      } else if (workspaceId === null) {
        claimed = ungroupedArchived(archived, table);
      } else {
        const rec = table.get(String(workspaceId));
        if (!rec) throw new Error("workspace 不存在: " + workspaceId);
        claimed = archivedForWorkspace(archived, rec);
      }
      const skippedHere = claimed.filter((id) => safe.has(String(id)));
      claimed = claimed.filter((id) => !safe.has(String(id)));
      if (claimed.length === 0) return { claimed, skipped: skippedHere };
      const next = archived.filter((id) => !claimed.includes(id));
      await g.set({ ...state, archivedSessionIds: next });
      return { claimed, skipped: skippedHere };
    });
    toRemove = res.claimed;
    skipped = res.skipped;
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }

  if (toRemove.length === 0) {
    return sendJson(res, 200, { ok: true, deleted: [], skipped });
  }

  try {
    const deleted = await deleteSessionListCascade(ctx, toRemove);
    sendJson(res, 200, { ok: true, deleted, skipped });
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
 * 从 sessionController.list() 结果提取可信存活 ID 集。
 * 注意信封形状：host 的 list() 返回 { items: [...] }（见 dsh-api-session-controller），
 * 不是裸数组；两种形状都兼容，缺 id 的项直接丢弃。
 * 形状校验：空数组/全缺 id 视为不可信，返回 null（调用方必须拒绝执行，
 * 不能把“未知”当成“全死了”——否则一次畸形返回会清空全工作区归属）。
 */
function aliveIdsFromList(r) {
  const items = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : null);
  if (!items || items.length === 0) return null;
  const out = new Set();
  for (const it of items) {
    const id = it && (it.sessionId || it.id);
    if (typeof id === "string" && id) out.add(id);
  }
  return out.size > 0 ? out : null;
}

/** 取 host 会话列表（自动解 { items } 信封；失败返回 null）。 */
async function listSessionItems(ctx) {
  try {
    const sc = ctx.get("sessionController");
    if (!sc || typeof sc.list !== "function") return null;
    const r = await sc.list();
    const items = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : null);
    return items;
  } catch {
    return null;
  }
}

/** 读取服务端权威的“正运行中”会话 ID 集（删除引擎的 fail-closed 依据之一）。 */
async function runningSessionIds(ctx) {
  const items = await listSessionItems(ctx);
  const out = new Set();
  // items 为 null 表示读不到列表：返回空集，但删除引擎另有 claims/env 交叉，
  // 且 deleteCascade 对受保护目标采取抛错/整组跳过而非强行删除（见各调用处）。
  for (const it of items || []) {
    if (it && it.running) {
      const id = it.sessionId || it.id;
      if (typeof id === "string" && id) out.add(id);
    }
  }
  return out;
}

/**
 * 服务端删除保护集 = 运行中 ∪ 跨客户端占用声明 ∪ 进程 env（补充信号）。
 * 说明：process.env.DSH_SESSION_ID 只在模型 shell 子进程中有值，host 服务进程
 * 通常取不到，只能做补充，不能做唯一依据——权威依据永远是前两者。
 */
async function protectedSessionIds(ctx) {
  const out = await runningSessionIds(ctx);
  try {
    sweepClaims();
    for (const v of claims.values()) {
      if (v && typeof v.sid === "string" && v.sid) out.add(v.sid);
    }
  } catch { /* ignore */ }
  if (process.env.DSH_SESSION_ID) out.add(String(process.env.DSH_SESSION_ID));
  return out;
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
      alive = aliveIdsFromList(await sc.list());
    }
  } catch { alive = null; /* fallback below */ }
  if (!alive) {
    if (Array.isArray(raw.aliveIds)) {
      const fb = new Set(raw.aliveIds.map(String).filter(Boolean));
      alive = fb.size > 0 ? fb : null;
    }
  }
  if (!alive) {
    return sendJson(res, 200, { ok: false, error: "无法读取 host 会话列表（存活集不可信，拒绝执行）" });
  }
  // 运行中/被占用的会话不视为失效（与 pruneGhosts 对齐）
  for (const id of await protectedSessionIds(ctx)) alive.add(id);
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
 * 清理工作区幽灵会话：
 * 各工作区 sessionIds 中 host 会话列表已不再返回的 ID——其会话日志与投影缓存均已
 * 不存在（如经 DSH 原生入口删除、历史级联删除、DSH 升级），仅注册表文件残留引用。
 * 与归档幽灵（handlePruneStaleArchives）对仗：同样以权威 host 会话列表
 * （sessionController.list）为存活基准，body.aliveIds 仅作 fallback。
 * 安全规则：存活集为空时拒绝执行；当前活跃会话永远豁免；只从注册表剔除 ID，
 * 不碰物理目录（幽灵本就没有物理目录；若某 ID 尚有物理目录残留，仅解除归属，
 * 后续自动收编会按需重新挂载，绝不误删）。
 * body.aliveIds 仅作 fallback（sessionController 不可用时）。
 */
async function handlePruneWorkspaceGhosts(ctx, req, res) {
  // 无条件消费请求体（未读取的 body 会阻碍连接复用），aliveIds 仅作 fallback 用
  const raw = await parseJsonBody(req);
  let alive = null;
  try {
    const sc = ctx.get("sessionController");
    if (sc && typeof sc.list === "function") {
      alive = aliveIdsFromList(await sc.list());
    }
  } catch { alive = null; /* fallback below */ }
  if (!alive) {
    if (Array.isArray(raw.aliveIds)) {
      const fb = new Set(raw.aliveIds.map(String).filter(Boolean));
      alive = fb.size > 0 ? fb : null;
    }
  }
  if (!alive) {
    return sendJson(res, 200, { ok: false, error: "无法读取 host 会话列表（存活集不可信，拒绝执行）" });
  }
  // 运行中/被占用的会话严格保护：即使 host 列表瞬时缺席也不剔除
  // （注意：process.env.DSH_SESSION_ID 只在 shell 子进程中有值，host 内通常取不到，
  // 权威依据是运行中集合与跨客户端占用声明，见 protectedSessionIds）
  for (const id of await protectedSessionIds(ctx)) alive.add(id);
  const pruned = {};
  let prunedCount = 0;
  await mutateWorkspaceState(ctx, async (state, table, g) => {
    for (const [wid, rec] of table.entries()) {
      const curIds = (rec.sessionIds || []).map(String);
      const ghosts = curIds.filter((id) => !alive.has(id));
      if (ghosts.length === 0) continue;
      pruned[String(wid)] = ghosts;
      prunedCount += ghosts.length;
      const kept = (rec.sessionIds || []).filter((id) => alive.has(String(id)));
      await table.update(wid, (cur) => ({
        ...cur,
        sessionIds: kept,
        updatedAt: new Date().toISOString()
      }));
    }
  });
  const orphanProjcache = await cleanOrphanProjcache(ctx);
  sendJson(res, 200, { ok: true, pruned, prunedCount, orphanProjcache });
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
  if (!raw.sid) {
    // sid 为空 = 该标签页当前没打开会话：直接删键释放占用，不占位
    // （空占位会被计入上限且无任何保护作用）
    claims.delete(tabId);
  } else {
    // delete 后 set：刷新插入序，逐出时最旧者先走（近似 LRU，避免活跃声明被挤掉）
    claims.delete(tabId);
    claims.set(tabId, { sid: String(raw.sid), t: Date.now() });
  }
  // 无界增长防护：tabId 可任意枚举，超限逐出最旧（Map 保持插入序）
  while (claims.size > 5000) {
    const oldest = claims.keys().next();
    if (oldest.done) break;
    claims.delete(oldest.value);
  }
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
  // 注册用户偏好命名空间：解析值 = schema 默认 ← 组合 base ← settings.yaml 用户层。
  // 旧版 localStorage 配置由浏览器半区一次性迁移上来，Host 不读浏览器存储。
  // 注册失败（存量分节被 schema 拒绝）也不应拖垮路由挂载，故隔离 try。
  try {
    settingsScope = ctx.settings.register(SETTINGS_NS, CONFIG_SCHEMA);
  } catch (err) {
    settingsScope = null;
    console.warn("[dsh-workspace-tree] settings 注册失败，配置回退为浏览器本地模式:", err?.message || err);
  }
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
        if (head === "workspace" && req.method === "POST") {
          const sub = rest[1];
          if (sub === "pruneGhosts") return await handlePruneWorkspaceGhosts(ctx, req, res);
        }
        sendJson(res, 404, { ok: false, error: "not found" });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
      }
    }
  }), "dsh-workspace-tree: routes");
}

export { apply, inject, name };

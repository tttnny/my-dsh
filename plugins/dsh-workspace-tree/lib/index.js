/**
 * dsh-workspace-tree — node half (v1.9.2 墓碑物理自愈版；归档删除零守卫契约不变)。
 *
 * 核心功能：
 *  - GET  /debug               工作区注册表投影（诊断用）
 *  - POST /mkdir               安全创建子目录 { parent, name } → { path }
 *  - POST /open-ide            在外部 IDE 中打开指定目录 { path, ide, customCommand? }
 *  - POST /archive/unarchive   恢复单条会话 { sessionId }
 *  - POST /archive/unarchiveAll 批量恢复 { workspaceId? } (null=未分组, omit=全部)
 *  - POST /archive/delete      永久删除单条归档会话及其实体文件、关联子孙 Subagents
 *                              与 projcache 缓存 { sessionId } —— 零守卫：进了归档区
 *                              的会话一定删得掉（见 deleteSessionCascade 的 fail-loud 契约）
 *  - POST /archive/deleteAll   批量永久删除归档会话 { workspaceId? } → { deleted, failed }：
 *                              逐条执行，能删的删掉，删不掉的留在归档区并逐条列原因
 *  - POST /archive/pruneStale  清理归档列表中 host 会话已不再返回的「失效归档」ID
 *  - POST /archive/tombstoneCheck 查询一组 sessionId 的会话目录是否仍物理存在
 *                              { ids } → { alive }：浏览器半区墓碑自愈的权威判据——
 *                              永久删除成功 = 目录必已消失；目录仍在 = 会话存活，
 *                              该墓碑必为误写（历史版本残留），应作废而非继续隐藏。
 *
 * 设计契约（v1.9.2）：
 *  - 归档门槛在浏览器半区（运行中/等待回复的会话不允许归档，沿用官方
 *    workspace/archiveSession RPC）；凡进入归档区的会话，删除一律零守卫无条件执行。
 *  - 删除 fail-loud：物理删除必须全部成功才剔除注册表/归档；
 *    出现真实失败（文件被锁/权限等）则报错并把会话留在归档区，可幂等重试。
 *  - 不再有 claims/heartbeat 占用注册表、运行守卫、幽灵/孤儿清理等历史补丁机制；
 *    空白草稿回收跟随官方（不做自动清理）。
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
 * 极速读取会话日志文件（session.v<N>.jsonl[.zstd]，见 pickSessionLogFile）的 Header 首行。
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
 * 该 header 是否是「真正的 Subagent 子会话」（有父 + Subagent 身份）。
 *
 * 判据必须是 origin（或 delegationDepth），**不能只看 parentSession**：宿主 fork
 * 也会把 meta.parentSession 写到源会话上（见 @deepseek-ai/dsh-api-session-controller
 * 的 fork 命令：parentSession: source.header.id），但 fork 出来的仍是普通用户会话
 * ——header 不变式里 origin 合法值只有 "subagent"，delegationDepth 也只在
 * dsh-subagent 里递增。按 parentSession 无差别建边会把用户的 fork 会话算进
 * 「级联待删闭包」：fork 活跃时整单删除被误报成"目标会话正在运行"（其实目标空闲），
 * fork 空闲时更会被连带物理删除（数据丢失）。与浏览器半区 isSubagentRow 同源判据，
 * 但服务端更宽一档：客户端只认 origin === "subagent"，此处另以 delegationDepth > 0
 * 兜底（正常不变式下二者同真，属纵深防御，不改变任何真实 Subagent 的归类）。
 * 边角：若存在 origin 与 delegationDepth 双缺的历史 Subagent header，它将不再进入
 * 级联闭包（父删后子文件残留、且不满足孤儿判据）——依赖 header 不变式成立，接受。
 */
function isSubagentChildHeader(header) {
  if (!header || typeof header.parentSession !== "string" || !header.parentSession) return false;
  return header.origin === "subagent"
    || (typeof header.delegationDepth === "number" && header.delegationDepth > 0);
}

/**
 * 规范化会话日志文件名（与 DSH 的 sessionFormatLogFilename 同构）。
 *
 * 0.1.5-rc.1 起 DSH 把日志名从固定的 `session.jsonl[.zstd]` 改为带格式版本号的
 * `session.v<N>.jsonl[.zstd]`（`SESSION_FORMAT_VERSION = 3`；v0 即无版本号的旧名）。
 * 同一会话目录内可并存多个版本（迁移期实测 v2 与 v3 同时存在），因此**不能**再用
 * 单一 existsSync 探测固定名称——必须枚举目录、取版本最高者。此前用固定名探测导致
 * 拓扑扫描恒空，级联删除 Subagent 静默失效。
 */
const SESSION_LOG_BASENAME = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/;

/**
 * 在会话目录内枚举规范日志文件，返回版本最高者。
 * 同版本同时存在压缩与未压缩时优先压缩（与 DSH 落盘顺序一致）。
 *
 * @returns {{name: string, version: number, compressed: boolean} | null}
 */
async function pickSessionLogFile(sessionDirPath) {
  let entries;
  try {
    entries = await readdir(sessionDirPath);
  } catch {
    return null;
  }
  let best = null;
  for (const name of entries) {
    const match = SESSION_LOG_BASENAME.exec(name);
    if (!match) continue;
    const version = match[1] === undefined ? 0 : Number(match[1]);
    if (!Number.isSafeInteger(version)) continue;
    const compressed = match[2] === ".zstd";
    if (best === null
      || version > best.version
      || (version === best.version && compressed && !best.compressed)) {
      best = { name, version, compressed };
    }
  }
  return best;
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

        // 枚举目录取规范日志文件（版本最高者），不能再用固定名 existsSync 探测：
        // 0.1.5-rc.1 起实际文件名是 session.v<N>.jsonl[.zstd]，且同目录可并存多个版本。
        const picked = await pickSessionLogFile(targetSessionDir);
        if (!picked) continue;

        const logFile = join(targetSessionDir, picked.name);
        let sizeBytes = 0;
        try {
          const st = await stat(logFile);
          sizeBytes = st.size;
        } catch {
          continue;
        }
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

        if (isSubagentChildHeader(header)) {
          const pid = header.parentSession;
          const list = childrenMap.get(pid) || [];
          list.push(sid);
          childrenMap.set(pid, list);
        }
      }
    }
  } catch {}

  return { childrenMap };
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
 * 安全物理删除单条会话目录（带严密路径越界与层级防护）及关联 projcache 缓存文件。
 *
 * fail-loud 契约：会话目录**不存在时视为幂等成功**（目标已不存在 = 已删）；
 * 目录**存在但删除失败**时返回错误信息（如文件被锁/权限不足），由调用方决定
 * 不剔除注册表并让会话保留在归档区；projcache 物理缓存清理尽力而为（缓存可重建，
 * 官方查询索引自会收敛，不视为删除失败）。
 *
 * @returns {string[]} 错误信息列表（空数组 = 成功）
 */
async function removeSessionDirStrict(sessionId) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return ["sessionId 无效"];
  }
  const sid = sessionId.trim();
  const encodedId = encodeSegment(sid);
  // encodeSegment 已将 "." / ".." 编码为 ~002E / ~002E~002E，只需判空
  if (!encodedId) return ["sessionId 无法编码为安全路径"];

  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  const errors = [];

  try {
    const scopes = await readdir(sessionsRoot, { withFileTypes: true });
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const targetSessionDir = resolve(sessionsRoot, scope.name, encodedId);

      // 安全校验：必须严格位于 sessionsRoot 之下，且路径层级至少比 sessionsRoot 深 2 级
      if (!targetSessionDir.startsWith(sessionsRoot + sep)) continue;
      const rel = targetSessionDir.slice(sessionsRoot.length + 1).split(sep);
      if (rel.length < 2) continue; // 必须是 <scope>/<encodedId>

      let exists = false;
      try {
        exists = (await stat(targetSessionDir)).isDirectory();
      } catch (err) {
        if (err && err.code === "ENOENT") {
          exists = false; // 确实不存在 = 幂等成功
        } else {
          errors.push(`会话 ${sid} 目录状态读取失败: ${targetSessionDir}（${err?.message || err}）`);
          continue;
        }
      }
      if (!exists) continue;

      try {
        await rm(targetSessionDir, { recursive: true, force: true });
      } catch (err) {
        errors.push(`会话 ${sid} 目录删除失败: ${targetSessionDir}（${err?.message || err}）`);
      }
    }
  } catch (err) {
    errors.push(`扫描会话目录失败: ${sessionsRoot}（${err?.message || err}）`);
  }

  // 同步物理清理 ~/.dsh/storages/session_projcache/sessions/<id>.json 独立缓存文件
  // （尽力而为，非致命）
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

  return errors;
}

/**
 * 从工作区注册表、全局归档列表以及 session_projcache 存储域中单事务剔除指定会话 ID。
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

  // 同步从 session_projcache 存储域的 sessions 内存表与写链中删除（缓存，尽力而为）
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
 * 归档会话永久删除核心引擎（零守卫）：
 * 1. 依据已扫描的拓扑图，收集 targetSessionId 及其所有的派生子孙 Subagent ID
 *    （仅 Subagent，fork 出的独立会话不在其列，见 isSubagentChildHeader）；
 * 2. 逐条物理删除 —— fail-loud：目标目录存在但删不掉即为真实失败，此时**不**剔除
 *    注册表/归档，会话留在归档区、前端报错、可幂等重试（已删掉的部分重试时按
 *    「目录不存在 = 幂等成功」继续）；目录本不存在视为成功；
 * 3. 物理删净后单事务剔除注册表/归档 + 内存与缓存联动。
 *
 * @param childrenMap 由 scanSessionTopology() 得到的父子拓扑（批量删除只扫一次）
 * @returns {string[]} 实际删除的会话 ID 列表（含 Subagent 子孙闭包）
 */
async function deleteSessionCascade(ctx, targetSessionId, childrenMap) {
  if (!targetSessionId || typeof targetSessionId !== "string" || !targetSessionId.trim()) {
    throw new Error("sessionId 必填且必须为字符串");
  }
  const sid = targetSessionId.trim();

  const allToDelete = collectDescendantSessionIds(sid, childrenMap || (await scanSessionTopology()).childrenMap);

  // 零守卫：不再有「运行中 / 被占用」检查——进了归档区就必须删得掉（浏览器半区
  // 已在归档门槛上把关运行态，见 SessionRow 的归档按钮置灰）。
  const errors = [];
  for (const id of allToDelete) {
    errors.push(...await removeSessionDirStrict(id));
  }
  if (errors.length > 0) {
    throw new Error("部分会话数据删除失败（会话保留在归档区，可重试）：" + errors.join("；"));
  }

  await stripSessionIdsFromRegistry(ctx, allToDelete);
  return allToDelete;
}

/**
 * 批量永久删除归档会话（零守卫）：只扫描一次拓扑，逐条执行 deleteSessionCascade，
 * 能删的删掉（含其 Subagent 闭包），删不掉的留在归档区并逐条返回原因。
 *
 * @returns {{ deleted: string[], failed: Array<{sessionId: string, error: string}> }}
 */
async function deleteSessionList(ctx, sessionIds) {
  const targets = [...new Set((sessionIds || []).map((s) => String(s).trim()).filter(Boolean))];
  const { childrenMap } = await scanSessionTopology();
  const deleted = [];
  const failed = [];
  for (const sid of targets) {
    if (deleted.includes(sid)) continue; // 已随前一条的级联闭包删掉
    try {
      const casc = await deleteSessionCascade(ctx, sid, childrenMap);
      deleted.push(...casc);
    } catch (err) {
      failed.push({ sessionId: sid, error: (err && err.message) || String(err) });
    }
  }
  return { deleted, failed };
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

/**
 * 按 workspaceId 从归档快照计算待操作目标 ID 集合：
 * undefined = 全部归档；null = 未分组归档（不在任何工作区 sessionIds 内）；
 * 具体 id = 该工作区名下已归档的会话（未知工作区抛错）。
 * 删除与恢复（handleDeleteAll / handleUnarchiveAll）共用同一口径。
 */
function archivedTargets(state, table, workspaceId) {
  const archived = (state.archivedSessionIds || []).map(String);
  if (workspaceId === undefined) return [...archived];
  if (workspaceId === null) return ungroupedArchived(archived, table);
  const rec = table.get(String(workspaceId));
  if (!rec) throw new Error("workspace 不存在: " + workspaceId);
  return archivedForWorkspace(archived, rec);
}

/**
 * 服务端归档门槛（纵深防御）：
 * 永久删除的「必须先归档」契约此前只在浏览器半区成立（归档按钮置灰），
 * 但本插件的 host 路由**不受 DSH 会话认证保护**（自注册的 webServer 前缀路由），
 * 本机任意进程或同源页面都可直接 POST。因此 host 侧必须自证目标确在归档列表中，
 * 不能只信调用方。
 *
 * @returns {Promise<boolean>} 目标会话当前是否在权威归档列表内
 */
async function isSessionArchived(ctx, sessionId) {
  const domain = getWorkspaceDomain(ctx);
  if (!domain) return false;
  const registry = ctx.get("workspaceRegistry");
  const state = (registry && typeof registry.requireState === "function")
    ? registry.requireState()
    : domain.global.get();
  return (state.archivedSessionIds || []).map(String).includes(String(sessionId));
}

/** 读取当前归档列表并按 workspaceId 过滤出待操作目标（只读快照，不写状态）。 */
async function readArchivedTargeting(ctx, workspaceId) {
  const domain = getWorkspaceDomain(ctx);
  if (!domain) throw new Error("workspace domain 未就绪");
  const registry = ctx.get("workspaceRegistry");
  const state = (registry && typeof registry.requireState === "function") ? registry.requireState() : domain.global.get();
  const table = (registry && registry.table) || domain.table("workspaces");
  return archivedTargets(state, table, workspaceId);
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
    const toRemove = new Set(archivedTargets(state, table, workspaceId));
    if (toRemove.size === 0) return;
    restored = [...toRemove];
    const next = { ...state, archivedSessionIds: (state.archivedSessionIds || []).filter((id) => !toRemove.has(String(id))) };
    await g.set(next);
  });

  sendJson(res, 200, { ok: true, restored });
}

/** 单条归档会话永久删除（级联物理删除关联所有 Subagents）。 */
async function handleDeleteSession(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  if (!sessionId) return sendJson(res, 200, { ok: false, error: "sessionId 必填" });

  // 服务端归档门槛：路由无鉴权，不能依赖浏览器半区的按钮置灰。
  if (!(await isSessionArchived(ctx, sessionId))) {
    return sendJson(res, 200, { ok: false, error: "拒绝删除：会话不在归档区（永久删除必须先归档）" });
  }

  try {
    const deleted = await deleteSessionCascade(ctx, sessionId);
    sendJson(res, 200, { ok: true, deleted });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/**
 * 批量永久删除归档会话（零守卫）：
 * 先按最新归档快照认领目标集合，再逐条执行；能删的删掉，删不掉的留在归档区
 * 并逐条返回原因（fail-visible，前端列出）。不再有任何两阶段认领/回写逻辑。
 */
async function handleDeleteAll(ctx, req, res) {
  const raw = await parseJsonBody(req);
  const workspaceId = raw.workspaceId === undefined ? undefined : raw.workspaceId;

  // 防误触 / 防 CSRF：不指定 workspaceId 的「删除全部归档」必须显式声明 all: true。
  // 此前空对象 {} 即等于清空全部归档会话，配合无鉴权的 host 路由构成一条
  // 「一个跨站表单就能抹掉所有归档会话」的路径。
  if (workspaceId === undefined && raw.all !== true) {
    return sendJson(res, 200, {
      ok: false,
      error: "拒绝执行：删除全部归档必须显式传 all: true（或指定 workspaceId）"
    });
  }

  let targeting = [];
  try {
    targeting = await readArchivedTargeting(ctx, workspaceId);
  } catch (err) {
    return sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }

  if (targeting.length === 0) {
    return sendJson(res, 200, { ok: true, deleted: [], failed: [] });
  }

  try {
    const { deleted, failed } = await deleteSessionList(ctx, targeting);
    sendJson(res, 200, { ok: true, deleted, failed });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message || String(err) });
  }
}

/**
 * 清理失效归档（最小兜底版）：
 * 归档列表中 host 会话列表（sessionController.list）已不再返回的 ID —— 会话日志
 * 已被物理删除（如经插件删除、DSH 升级）后的历史残留，任何 UI 都无法再展示/打开。
 * 从权威 host 会话列表取存活 ID 集，剔除归档列表中的失效项。
 * body.aliveIds 仅作 fallback（sessionController 不可用时）。
 * 安全规则：存活集为空/不可信时拒绝执行；运行中的会话必然在列表中，不会被误判失效。
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
  let pruned = [];
  await mutateWorkspaceState(ctx, async (state, table, g) => {
    const archived = (state.archivedSessionIds || []).map(String);
    const stale = archived.filter((id) => !alive.has(id));
    if (stale.length === 0) return;
    pruned = stale;
    const next = archived.filter((id) => alive.has(id));
    await g.set({ ...state, archivedSessionIds: next });
  });
  sendJson(res, 200, { ok: true, pruned });
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

/**
 * 墓碑物理存在性查询（浏览器半区自愈用，v1.9.2）：
 * 对每个 sessionId，按 DSH 标准编码在所有 scope 目录下探测 `<scope>/<encodedId>/`
 * 是否为存在目录。永久删除成功必然使目录消失（removeSessionDirStrict 的 fail-loud
 * 契约），因此「目录仍在」即权威证明该会话存活、浏览器里的墓碑是误写（历史版本
 * 残留或错误级联），前端据此作废墓碑并恢复显示。只读探测，不做任何删除/写盘。
 */
async function handleTombstoneCheck(req, res) {
  const raw = await parseJsonBody(req);
  const ids = Array.isArray(raw.ids)
    ? [...new Set(raw.ids.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 500)
    : [];
  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  let scopes = [];
  try {
    scopes = await readdir(sessionsRoot, { withFileTypes: true });
  } catch { /* 根目录不可读：alive 返回空，保守维持现状 */ }
  const alive = [];
  for (const sid of ids) {
    const encodedId = encodeSegment(sid);
    if (!encodedId) continue;
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const candidate = resolve(sessionsRoot, scope.name, encodedId);
      if (!candidate.startsWith(sessionsRoot + sep)) continue;
      try {
        if ((await stat(candidate)).isDirectory()) {
          alive.push(sid);
          break;
        }
      } catch { /* ENOENT 等：该 scope 下不存在，继续探测下一个 */ }
    }
  }
  sendJson(res, 200, { ok: true, alive });
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
        if (head === "mkdir" && req.method === "POST") return await handleMkdir(req, res);
        if (head === "open-ide" && req.method === "POST") return await handleOpenIde(req, res);
        if (head === "archive" && req.method === "POST") {
          const sub = rest[1];
          if (sub === "unarchive") return await handleUnarchive(ctx, req, res);
          if (sub === "unarchiveAll") return await handleUnarchiveAll(ctx, req, res);
          if (sub === "delete") return await handleDeleteSession(ctx, req, res);
          if (sub === "deleteAll") return await handleDeleteAll(ctx, req, res);
          if (sub === "pruneStale") return await handlePruneStaleArchives(ctx, req, res);
          if (sub === "tombstoneCheck") return await handleTombstoneCheck(req, res);
        }
        sendJson(res, 404, { ok: false, error: "not found" });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
      }
    }
  }), "dsh-workspace-tree: routes");
}

export { apply, inject, name };

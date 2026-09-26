/**
 * dsh-workspace-tree — node half (v3.0.2)。
 *
 * 本插件只做一件事：在官方工作区浏览器之上提供一个**归档区**。官方
 * `sidebar.workspaces` 是 single 槽且已被官方 ui-workspace 独占，插件不接管它；
 * 归档区以官方允许的增量入口 `sidebar.panellist`（侧栏图标）+ `main`（keyed
 * 主面板）注册，官方工作区/会话/搜索/拖拽/设置全部保持原样。
 *
 * 核心功能（全部围绕归档区）：
 *  - POST /archive/unarchiveAll 批量恢复 { workspaceId? }（null=未分组, omit=全部）
 *  - POST /archive/delete       永久删除单条归档会话及其实体文件、关联子孙 Subagents
 *                               与 projcache 缓存 { sessionId }（见 deleteSessionCascade
 *                               的 fail-loud 契约）
 *  - POST /archive/deleteAll    批量永久删除归档会话 { workspaceId?, all? }
 *                               → { deleted, failed }：逐条执行，能删的删掉，
 *                               删不掉的留在归档区并逐条列原因
 *  - POST /archive/pruneStale   清理归档列表中 host 会话已不再返回的「失效归档」ID
 *  - POST /archive/tombstoneCheck 查询一组 sessionId 的会话目录是否仍物理存在
 *                               { ids } → { alive }：浏览器半区墓碑自愈的权威判据
 *
 * 设计契约：
 *  - 归档动作与归档门槛都归官方：归档走官方行菜单的 workspace/archiveSession（含
 *    「停止并归档」），本插件不参与归档写入、也不自行判定运行态。
 *  - 删除 fail-loud，且**以宿主会话列表为终局判据**：归档条目是官方侧栏隐藏一条
 *    会话的唯一机制（官方 sessionVisible 在默认筛选下只看 archivedSessionIds），
 *    一旦在宿主仍返回该会话时剔除条目，它就会立刻作为普通会话掉进「未分组」。
 *    因此只有「物理目录已清 **且** 宿主不再返回」才剔除；进程内 live SessionStore
 *    仍持有该会话时如实报错并把条目留在归档区（重启 DSH 后 sessionController.list()
 *    不再返回它，残留归档条目由 /archive/pruneStale 自动清理）。
 *  - 目录定位按 header.id（拓扑图建键）而非目录名：会话被改名、或目录名与
 *    encodeSegment(id) 不一致时，同样能定位并删除真实目录。
 *  - 出现真实失败（文件被锁/权限等）则报错并把会话留在归档区，可幂等重试。
 *  - 级联范围只认真正的 Subagent（origin === "subagent" / delegationDepth > 0），
 *    从某条会话 fork 出来的独立会话绝不会被连带删除。
 *  - 本插件的 webServer 路由**不受 DSH 会话认证保护**（自注册前缀路由），因此
 *    破坏性路由必须自带服务端校验（归档门槛 / 显式 all: true），不能只信前端。
 */
import { open, readdir, rm, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";

/** Cordis 插件名（patch 行 id）。 */
const name = "@lynn123411/dsh-workspace-tree";
/** 依赖的宿主服务：webServer 挂路由，storageDomain 读写工作区注册表。 */
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
 * DSH 的会话日志名带格式版本号：`session.v<N>.jsonl[.zstd]`（`SESSION_FORMAT_VERSION = 3`；
 * v0 即无版本号的名字）。同一会话目录内可并存多个版本，因此**不能**用单一 existsSync
 * 探测固定名称——必须枚举目录、取版本最高者。
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
 *
 * @returns {{ childrenMap: Map<string, string[]>, sessionMap: Map<string, object> }}
 *   childrenMap：parentSessionId -> [childSessionId, ...]（仅真正的 Subagent）；
 *   sessionMap：header.id -> { projectDir, sessionDir, logFile, ... }——按**会话真实
 *   id** 建键、与目录名解耦，供删除时定位被改名 / 目录名与 id 不一致的真实目录。
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

        // 枚举目录取规范日志文件（版本最高者）：实际文件名是 session.v<N>.jsonl[.zstd]，
        // 同目录可并存多个版本，固定名探测不可靠。
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

  return { childrenMap, sessionMap };
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
 * 目录定位按**会话真实 id**而非目录名：拓扑图（scanSessionTopology）以 header.id
 * 建键，可能命中一个目录名与 encodeSegment(id) 不一致的目录（被改名 / 历史目录）。
 * 旧实现只按 encodeSegment(id) 拼路径，一旦不一致就 stat 到 ENOENT，被误判成
 * 「目标不存在 = 幂等成功」，于是注册表与归档条目被剔除、日志却还在原地——会话
 * 随即作为普通会话掉进官方侧栏的「未分组」。因此这里：
 *   1. 优先用调用方传入的 topology 精确定位真实目录；
 *   2. 未命中时回退到 encodeSegment(id) 同构路径（旧口径）；
 *   3. 二者都未命中才算「目录确实不存在」（幂等成功，由调用方用宿主列表复核）。
 *
 * fail-loud：目录**存在但删除失败**时返回错误信息（如文件被锁/权限不足），由调用方
 * 决定不剔除注册表并让会话保留在归档区；projcache 物理缓存清理尽力而为（缓存可重建，
 * 官方查询索引自会收敛，不视为删除失败）。
 *
 * @param {string} sessionId 会话真实 id（header.id）
 * @param {Map<string, object>} [topology] scanSessionTopology() 的 sessionMap
 * @returns {Promise<{errors: string[], removed: boolean}>} removed = 是否真的删掉了目录
 */
async function removeSessionDirStrict(sessionId, topology) {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return { errors: ["sessionId 无效"], removed: false };
  }
  const sid = sessionId.trim();
  const encodedId = encodeSegment(sid);
  // encodeSegment 已将 "." / ".." 编码为 ~002E / ~002E~002E，只需判空
  if (!encodedId) return { errors: ["sessionId 无法编码为安全路径"], removed: false };

  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  const errors = [];
  let removed = false;
  const targets = new Set();

  // 1) 拓扑图命中：目录名可以是任意值，直接用已扫描到的真实目录
  const info = topology && typeof topology.get === "function" ? topology.get(sid) : undefined;
  if (info && typeof info.projectDir === "string" && typeof info.sessionDir === "string") {
    const candidate = resolve(sessionsRoot, info.projectDir, info.sessionDir);
    if (candidate.startsWith(sessionsRoot + sep)
      && candidate.slice(sessionsRoot.length + 1).split(sep).length >= 2) {
      targets.add(candidate);
    }
  }

  // 2) 回退：encodeSegment 同构路径（遍历各 scope，与旧口径一致）
  try {
    const scopes = await readdir(sessionsRoot, { withFileTypes: true });
    for (const scope of scopes) {
      if (!scope.isDirectory()) continue;
      const targetSessionDir = resolve(sessionsRoot, scope.name, encodedId);
      if (!targetSessionDir.startsWith(sessionsRoot + sep)) continue;
      if (targetSessionDir.slice(sessionsRoot.length + 1).split(sep).length < 2) continue;
      targets.add(targetSessionDir);
    }
  } catch (err) {
    // 根目录本来就不可读：拓扑未命中时这是真实失败，命中时按已定位目录继续
    if (targets.size === 0) {
      errors.push(`扫描会话目录失败: ${sessionsRoot}（${err?.message || err}）`);
    }
  }

  for (const targetSessionDir of targets) {
    let exists = false;
    try {
      exists = (await stat(targetSessionDir)).isDirectory();
    } catch (err) {
      if (err && err.code === "ENOENT") {
        exists = false; // 该候选不存在（可能被 1) 或 2) 的真实目录覆盖）
      } else {
        errors.push(`会话 ${sid} 目录状态读取失败: ${targetSessionDir}（${err?.message || err}）`);
        continue;
      }
    }
    if (!exists) continue;

    try {
      await rm(targetSessionDir, { recursive: true, force: true });
      removed = true;
    } catch (err) {
      errors.push(`会话 ${sid} 目录删除失败: ${targetSessionDir}（${err?.message || err}）`);
    }
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

  return { errors, removed };
}

/**
 * 读取宿主「仍存在」的会话 id 快照（删除的终局判据）。
 * sessionController.list() 合并「进程内 live SessionStore」与「持久化日志」两条来源：
 * 只有二者都拿不到某 id 才算真正消失。
 *
 * 返回值语义：Set = 可信快照（不在集合内即已消失）；null = 无法判定，调用方必须
 * 保守处理（不剔除归档条目），否则把未知当「已消失」会制造「未分组」残影。
 * 读不到 sessionController 时退路是进程内 live store，但该退路**只增不减**——空 store
 * 不能证明“什么都没了”，故返回 null 而不返回空集。
 *
 * @returns {Promise<Set<string>|null>}
 */
async function readHostAliveSet(ctx) {
  try {
    const sc = ctx.get("sessionController");
    if (sc && typeof sc.list === "function") {
      const alive = aliveIdsFromList(await sc.list());
      if (alive) return alive;
    }
  } catch { /* fall through to the store probe */ }
  try {
    const store = ctx.get("sessions");
    if (store && typeof store.list === "function") {
      const ids = new Set();
      for (const s of store.list()) {
        if (s && typeof s.id === "string" && s.id) ids.add(s.id);
      }
      if (ids.size > 0) return ids;
    }
  } catch { /* unknown */ }
  return null;
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
 * 归档会话永久删除核心引擎：
 * 1. 依据已扫描的拓扑图，收集 targetSessionId 及其所有的派生子孙 Subagent ID
 *    （仅 Subagent，fork 出的独立会话不在其列，见 isSubagentChildHeader）；
 * 2. 逐条物理删除 —— 目录存在但删不掉即为真实失败，此时**不**剔除注册表/归档，
 *    会话留在归档区、前端报错、可幂等重试（已删掉的部分重试时按「目录不存在 =
 *    幂等成功」继续）；
 * 3. **终局复核**：物理删除后查宿主会话列表（sessionController.list()，合并 live
 *    SessionStore 与持久化日志）是否仍返回目标会话。
 *    关键事实：归档**不会**把会话从 live SessionStore 里移除（官方 archiveSession
 *    只写归档状态 + 停活动），所以刚删完的会话常常仍留在内存里、日志却已被 unlink。
 *    此时若剔除归档条目，它就会立刻以普通会话身份掉进官方侧栏的「未分组」。
 *    因此**只对真正已从宿主列表消失的 id** 剔除条目；仍在列表里的 id 保留条目
 *    （官方侧栏据此继续隐藏它，前端另以墓碑隐藏归档面板行），待 DSH 重启后该会话
 *    自然从列表消失，残留条目由 /archive/pruneStale 清理。
 * 4. 删除本身一律照常完成并如实上报，不因内存残留而失败——那条会让整个删除功能
 *    在“会话仍 live”时完全不可用。
 *
 * @param {{childrenMap: Map<string,string[]>, sessionMap: Map<string,object>}} [topo]
 *   由 scanSessionTopology() 得到（批量删除只扫一次）
 * @returns {Promise<{deleted: string[], retained: string[]}>}
 *   deleted：物理日志已删除的会话（含 Subagent 子孙闭包）；
 *   retained：日志已删除但宿主仍持有、故归档条目予以保留的会话 id。
 */
/**
 * 物理删除一条会话（含其 Subagent 闭包）的日志目录，不触碰任何注册表/归档状态。
 * 与状态剔除分离，使批量删除能「先删完所有物理文件、再一次性复核宿主列表」。
 *
 * @returns {Promise<{allToDelete: string[], errors: string[]}>}
 */
async function purgeSessionDirs(targetSessionId, topo) {
  if (!targetSessionId || typeof targetSessionId !== "string" || !targetSessionId.trim()) {
    throw new Error("sessionId 必填且必须为字符串");
  }
  const sid = targetSessionId.trim();
  const scanned = topo || await scanSessionTopology();
  const allToDelete = collectDescendantSessionIds(sid, scanned.childrenMap);
  const errors = [];
  for (const id of allToDelete) {
    const res = await removeSessionDirStrict(id, scanned.sessionMap);
    errors.push(...res.errors);
  }
  return { allToDelete, errors };
}

/**
 * 物理删除完成后剔除注册表/归档条目。**只剔除宿主已不再返回的 id**：
 * 宿主仍返回的 id 保留条目（官方侧栏据此继续隐藏它），读不到列表（null）时一律
 * 保守保留——一次畸形/不可用的列表读取绝不能变成「全都没了」而把一批会话暴露到
 * 普通列表里。
 *
 * @returns {Promise<{retained: string[]}>} retained = 日志已删但条目予以保留的 id
 */
async function stripPurgedFromRegistry(ctx, purgedIds) {
  const alive = await readHostAliveSet(ctx);
  const retained = purgedIds.filter((id) => (alive === null ? true : alive.has(id)));
  const strippable = purgedIds.filter((id) => !retained.includes(id));
  if (strippable.length > 0) await stripSessionIdsFromRegistry(ctx, strippable);
  return { retained };
}

/** 单条永久删除：物理删除 + 终局复核剔除。 */
async function deleteSessionCascade(ctx, targetSessionId, topo) {
  const { allToDelete, errors } = await purgeSessionDirs(targetSessionId, topo);
  if (errors.length > 0) {
    throw new Error("部分会话数据删除失败（会话保留在归档区，可重试）：" + errors.join("；"));
  }
  const { retained } = await stripPurgedFromRegistry(ctx, allToDelete);
  return { deleted: allToDelete, retained };
}

/**
 * 批量永久删除归档会话（零守卫）：只扫描一次拓扑，逐条执行 deleteSessionCascade，
 * 能删的删掉（含其 Subagent 闭包），删不掉的留在归档区并逐条返回原因。
 *
 * @returns {{ deleted: string[], retained: string[], failed: Array<{sessionId: string, error: string}> }}
 *   retained：日志已删除但宿主仍持有、归档条目予以保留的 id（见 deleteSessionCascade）。
 */
async function deleteSessionList(ctx, sessionIds) {
  const targets = [...new Set((sessionIds || []).map((s) => String(s).trim()).filter(Boolean))];
  const topo = await scanSessionTopology();
  const deleted = [];
  const failed = [];
  // 阶段一：逐条物理删除（只扫一次拓扑）。
  for (const sid of targets) {
    if (deleted.includes(sid)) continue; // 已随前一条的级联闭包删掉
    try {
      const { allToDelete, errors } = await purgeSessionDirs(sid, topo);
      if (errors.length > 0) throw new Error("部分会话数据删除失败：" + errors.join("；"));
      deleted.push(...allToDelete);
    } catch (err) {
      failed.push({ sessionId: sid, error: (err && err.message) || String(err) });
    }
  }
  // 阶段二：物理删完后只读一次宿主列表，再统一剔除（O(1) 次列表读取，而非逐条）。
  const { retained } = await stripPurgedFromRegistry(ctx, deleted);
  return { deleted, retained, failed };
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
    const { deleted, retained } = await deleteSessionCascade(ctx, sessionId);
    sendJson(res, 200, { ok: true, deleted, retained });
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
    return sendJson(res, 200, { ok: true, deleted: [], retained: [], failed: [] });
  }

  try {
    const { deleted, retained, failed } = await deleteSessionList(ctx, targeting);
    sendJson(res, 200, { ok: true, deleted, retained, failed });
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
 * 注意信封形状：host 的 list() 返回裸数组（见 dsh-api-session-controller 的 list()），
 * 每项带 sessionId；同时兼容 { items } 形状，缺 id 的项直接丢弃。
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

async function handleTombstoneCheck(req, res) {
  const raw = await parseJsonBody(req);
  const ids = Array.isArray(raw.ids)
    ? [...new Set(raw.ids.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 500)
    : [];
  const sessionsRoot = resolve(join(dshHome(), "sessions"));
  let scopes;
  try {
    scopes = await readdir(sessionsRoot, { withFileTypes: true });
  } catch (error) {
    // 根目录不可枚举时**不能**把全部 id 判成「目录已消失」：调用方会据此写删除
    // 墓碑并跳过自动收编，误判会把存活会话永久隐藏。如实回 ok:false，由调用方
    // fail-open（墓碑自愈维持现状、收编照常执行）。
    return sendJson(res, 200, { ok: false, error: "会话根目录不可读: " + String((error && error.message) || error) });
  }
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
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://x");
      const rest = url.pathname.split("/").filter(Boolean).slice(2);
      const head = rest[0];
      try {
        if (head === "archive" && req.method === "POST") {
          const sub = rest[1];
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

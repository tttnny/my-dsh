/**
 * 更新链路：读清单、比版本、跑 upgrade、按输出报阶段与失败分类。
 *
 * 纯函数（清单解析、版本比较、阶段映射、失败分类）单独导出给测试；执行部分收在
 * createUpdater 里，依赖全部从外面传进来，测试用替身、宿主用真进程。
 *
 * 单飞锁在更新器实例里：同一时刻只允许一次更新，第二次直接报 busy。
 */

import type { KimiCuPlatform } from '../shared/status.ts';
import {
  MACOS_UPDATE_MANIFEST,
  WINDOWS_UPDATE_MANIFEST,
  type UpdateCheck,
  type UpdateEvent,
  type UpdateFailureKind,
  type UpdateStage,
} from '../shared/update.ts';

/** 一次 upgrade 调用的输入。 */
export interface UpgradeInput {
  platform: KimiCuPlatform;
  /** 要执行的 KimiCU 二进制。 */
  binaryPath: string;
  /** 要升级到的版本；null 表示让 KimiCU 自己判断（macOS）。 */
  version: string | null;
  /** 每读到一行输出回调一次。 */
  onLine: (line: string) => void;
}

/** 一次 upgrade 调用的结果。 */
export interface UpgradeRun {
  /** 退出码；超时或起不来是 null。 */
  code: number | null;
  /** stdout 与 stderr 拼起来的完整输出。 */
  raw: string;
  /** 是否等到超时都没结束。 */
  timedOut: boolean;
  /** 子进程真正退出时 resolve；超时后锁要等它。 */
  whenExited: Promise<void>;
}

/** 更新器依赖，测试里可以全部替身。 */
export interface UpdateDeps {
  platform: KimiCuPlatform;
  /** 读本机当前安装的路径与版本；refresh 为 true 时绕过探测缓存。 */
  current: (refresh: boolean) => Promise<{ path: string | null; version: string | null }>;
  /** 读清单文本；失败抛。 */
  fetchManifest: (url: string) => Promise<string>;
  /** 跑一次 upgrade。 */
  runUpgrade: (input: UpgradeInput) => Promise<UpgradeRun>;
  /** 更新成功后重连 MCP；没有管理器时给 null。 */
  reconnect: (() => Promise<boolean>) | null;
  now?: () => number;
}

/** 更新器：检查与执行。 */
export interface Updater {
  /** 读一次清单并与本机版本比较。 */
  check: () => Promise<UpdateCheck>;
  /**
   * 跑一次更新，过程中把事件吐给回调。
   * @param emit - 事件回调，调用方负责把它写进响应流。
   * @returns 结束时 resolve；失败以 error 事件表达，不抛。
   */
  run: (emit: (event: UpdateEvent) => void) => Promise<void>;
}

/**
 * 当前平台的清单地址。
 * @param platform - 三分类平台。
 * @returns 清单 URL；不支持的平台是 null。
 */
export function manifestUrl(platform: KimiCuPlatform): string | null {
  if (platform === 'darwin') return MACOS_UPDATE_MANIFEST;
  if (platform === 'win32') return WINDOWS_UPDATE_MANIFEST;
  return null;
}

/**
 * 从清单文本里取版本号。
 * @param text - 清单 JSON 原文。
 * @returns 版本号；缺字段或坏 JSON 是 null。
 */
export function parseManifest(text: string): string | null {
  try {
    const body = JSON.parse(text) as { version?: unknown };
    if (typeof body.version !== 'string') return null;
    const version = body.version.trim();
    return version === '' ? null : version;
  } catch {
    return null;
  }
}

/**
 * 按数字段比较两个版本号。
 * @param a - 版本号。
 * @param b - 版本号。
 * @returns a 大于 b 是 1，相等是 0，小于 -1；任一方不是纯数字段是 null。
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] | null => {
    const parts = value.split('.');
    const numbers: number[] = [];
    for (const part of parts) {
      if (!/^(0|[1-9]\d*)$/.test(part)) return null;
      numbers.push(Number(part));
    }
    return numbers;
  };
  const left = parse(a);
  const right = parse(b);
  if (left === null || right === null) return null;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const one = left[index] ?? 0;
    const other = right[index] ?? 0;
    if (one > other) return 1;
    if (one < other) return -1;
  }
  return 0;
}

/** 阶段关键字表：先命中先用，顺序就是优先级。 */
const STAGE_RULES: ReadonlyArray<readonly [RegExp, UpdateStage]> = [
  [/下载|download/i, 'downloading'],
  [/校验|公证|签名|哈希|verif|signature|sha-?256/i, 'verifying'],
  [/替换|安装|install|replac/i, 'installing'],
  [/版本|version/i, 'checking'],
];

/**
 * 把 upgrade 的一行输出映射成阶段。
 * @param line - 一行输出。
 * @returns 阶段；认不出的行是 null，调用方保持上一个阶段。
 */
export function parseStage(line: string): UpdateStage | null {
  const text = line.trim();
  if (text.startsWith('==>')) {
    for (const [pattern, stage] of STAGE_RULES) {
      if (pattern.test(text)) return stage;
    }
    return null;
  }
  // macOS 的替换段没有 `==>` 行：签名与公证校验通过之后紧接着就是替换安装。
  if (text.startsWith('✓') && /签名|公证/.test(text)) return 'installing';
  return null;
}

/** 失败关键字表：先命中先用，顺序就是优先级。 */
const FAILURE_RULES: ReadonlyArray<readonly [RegExp, UpdateFailureKind]> = [
  [/另一个升级|正在收尾|in progress|already running|another upgrade/i, 'busy'],
  [/sha-?256|签名|公证|gatekeeper|team id|bundle id|哈希|health check|not pass/i, 'verify'],
  [/权限|administrator|administ|permission|eacces|eperm|staging failed|not permitted/i, 'permission'],
  [/网络|下载失败|network|enotfound|econnrefused|etimedout|fetch failed|offline/i, 'network'],
];

/**
 * 把一次失败的输出归到五类之一。
 * @param raw - upgrade 的完整输出。
 * @param timedOut - 是否等到超时。
 * @returns 失败分类；认不出是 unknown。
 */
export function classifyFailure(raw: string, timedOut: boolean): UpdateFailureKind {
  if (timedOut) return 'timeout';
  // 进度行里有「校验代码签名」这类正常日志，整段扫会把任何失败都误判成校验失败。
  const errors = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('==>') && !line.startsWith('✓'))
    .join('\n');
  const text = errors === '' ? raw : errors;
  for (const [pattern, kind] of FAILURE_RULES) {
    if (pattern.test(text)) return kind;
  }
  return 'unknown';
}

/**
 * 造一个更新器。
 * @param deps - 平台、版本读取、清单读取、upgrade 执行与重连。
 * @returns 检查与执行两个入口。
 */
export function createUpdater(deps: UpdateDeps): Updater {
  const now = deps.now ?? Date.now;
  let running = false;

  const readCurrent = async (refresh: boolean): Promise<{ path: string | null; version: string | null }> => {
    try {
      return await deps.current(refresh);
    } catch {
      return { path: null, version: null };
    }
  };

  const inspect = async (current: { version: string | null }): Promise<UpdateCheck> => {
    const url = manifestUrl(deps.platform);
    if (url === null) {
      return { current: current.version, latest: null, hasUpdate: false, error: 'unsupported platform', checkedAt: now() };
    }
    try {
      const latest = parseManifest(await deps.fetchManifest(url));
      if (latest === null) {
        return { current: current.version, latest: null, hasUpdate: false, error: 'manifest-invalid', checkedAt: now() };
      }
      const order = current.version === null ? null : compareVersions(latest, current.version);
      return {
        current: current.version,
        latest,
        hasUpdate: order === null ? true : order > 0,
        error: null,
        checkedAt: now(),
      };
    } catch (error) {
      return {
        current: current.version,
        latest: null,
        hasUpdate: false,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: now(),
      };
    }
  };

  const check = async (): Promise<UpdateCheck> => inspect(await readCurrent(false));

  const run = async (emit: (event: UpdateEvent) => void): Promise<void> => {
    if (running) {
      emit({ type: 'error', kind: 'busy', raw: '' });
      return;
    }
    running = true;
    let release = true;
    try {
      emit({ type: 'stage', stage: 'checking' });
      const current = await readCurrent(false);
      if (current.path === null) {
        emit({ type: 'error', kind: 'unknown', raw: 'KimiCU is not installed' });
        return;
      }

      const inspected = await inspect(current);
      // Windows 的 upgrade 必须带版本号，清单读不到就没法执行；macOS 可以交给 KimiCU 自己判断。
      if (inspected.error !== null && deps.platform === 'win32') {
        emit({ type: 'error', kind: 'network', raw: inspected.error });
        return;
      }

      if (inspected.error === null && !inspected.hasUpdate) {
        emit({ type: 'done', upToDate: true, version: current.version, reconnect: 'skipped', raw: '' });
        return;
      }
      emit({ type: 'stage', stage: 'downloading' });
      let lastStage: UpdateStage = 'downloading';
      const outcome = await deps.runUpgrade({
        platform: deps.platform,
        binaryPath: current.path,
        version: deps.platform === 'win32' ? inspected.latest : null,
        onLine: (line) => {
          const stage = parseStage(line);
          if (stage === null || stage === lastStage) return;
          lastStage = stage;
          emit({ type: 'stage', stage });
        },
      });

      if (outcome.timedOut) {
        // 进程还在跑：锁留到它真的退出，免得第二次更新并发替换同一个 app。
        release = false;
        void outcome.whenExited.finally(() => {
          running = false;
        });
        emit({ type: 'error', kind: 'timeout', raw: outcome.raw });
        return;
      }
      if (outcome.code !== 0) {
        emit({ type: 'error', kind: classifyFailure(outcome.raw, false), raw: outcome.raw });
        return;
      }

      const after = await readCurrent(true);
      // 读不出来不算「确认变了」：版本为 null 时不能断定升级生效。
      const changed = after.version !== null && after.version !== current.version;
      let reconnect: 'done' | 'failed' | 'skipped' = 'skipped';
      if (changed && deps.reconnect !== null) {
        emit({ type: 'stage', stage: 'restarting' });
        try {
          reconnect = (await deps.reconnect()) ? 'done' : 'failed';
        } catch {
          reconnect = 'failed';
        }
      }
      emit({ type: 'done', upToDate: false, version: after.version, reconnect, raw: outcome.raw });
    } finally {
      if (release) running = false;
    }
  };

  return { check, run };
}

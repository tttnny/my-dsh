/**
 * 状态探测：把 resolveInstall、版本读取与 doctor 合成一份 KimiCuStatus。
 *
 * 结果缓存 10 秒，并发调用共用同一次探测；refresh 绕过缓存。所有失败都落进
 * 状态字段，不向调用方抛——路由与工具拿到的是状态，不是异常。
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { DoctorReport, KimiCuPlatform, KimiCuStatus } from '../shared/status.ts';
import { runDoctor, type DoctorRun } from './doctor.ts';
import { installPlan, resolveInstall, toPlatform } from './resolve.ts';

/** 探测器依赖，测试里可以全部替身。 */
export interface StatusDeps {
  platform: string;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  readVersion: (platform: KimiCuPlatform, path: string) => string | null;
  runDoctor: (platform: KimiCuPlatform, path: string) => Promise<DoctorRun>;
  now?: () => number;
  ttlMs?: number;
}

/**
 * 从 Info.plist 文本里读 CFBundleShortVersionString。
 * @param plist - plist 文本。
 * @returns 版本号；读不出来是 null。
 */
export function parseMacosVersion(plist: string): string | null {
  const key = plist.indexOf('CFBundleShortVersionString');
  if (key === -1) return null;
  const open = plist.indexOf('<string>', key);
  if (open === -1) return null;
  const close = plist.indexOf('</string>', open);
  if (close === -1) return null;
  const value = plist.slice(open + '<string>'.length, close).trim();
  return value === '' ? null : value;
}

/**
 * 读 macOS app 的版本号。
 * @param binaryPath - app 内的二进制路径。
 * @returns 版本号；读不到是 null。
 */
export function readMacosVersion(binaryPath: string): string | null {
  try {
    return parseMacosVersion(readFileSync(join(dirname(dirname(binaryPath)), 'Info.plist'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 造一个带缓存与单飞的探测器。
 * @param deps - 平台、环境变量、文件存在性、版本读取与 doctor 执行。
 * @returns 探测函数；参数 refresh 为 true 时绕过缓存。
 */
export function createStatusDetector(deps: StatusDeps): (refresh?: boolean) => Promise<KimiCuStatus> {
  const ttl = deps.ttlMs ?? 10_000;
  const now = deps.now ?? Date.now;
  let cached: { at: number; value: KimiCuStatus } | undefined;
  let inflight: Promise<KimiCuStatus> | undefined;

  /** 探测整体失败时的兜底状态：不抛，让路由与工具都能如实报告。 */
  const failedStatus = (error: unknown): KimiCuStatus => {
    const platform = toPlatform(deps.platform);
    return {
      platform,
      supported: platform !== 'other',
      installed: false,
      path: null,
      version: null,
      doctor: {
        ran: false,
        ok: false,
        checks: [],
        raw: '',
        error: error instanceof Error ? error.message : String(error),
      },
      mcp: null,
      install: installPlan(platform),
      notes: ['detection-failed'],
      checkedAt: now(),
    };
  };

  const build = async (): Promise<KimiCuStatus> => {
    try {
      const resolved = resolveInstall({ platform: deps.platform, env: deps.env, exists: deps.exists });

      let version: string | null = null;
      if (resolved.path !== null) {
        try {
          version = deps.readVersion(resolved.platform, resolved.path);
        } catch {
          version = null;
        }
      }

      let doctor: DoctorReport = { ran: false, ok: false, checks: [], raw: '' };
      if (resolved.supported && resolved.path !== null) {
        try {
          const run = await deps.runDoctor(resolved.platform, resolved.path);
          doctor = {
            ran: run.ran,
            ok: run.ok,
            checks: run.checks,
            raw: run.raw,
            ...(run.error === undefined ? {} : { error: run.error }),
          };
          version = version ?? run.version;
        } catch (error) {
          doctor = {
            ran: true,
            ok: false,
            checks: [],
            raw: '',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      return {
        platform: resolved.platform,
        supported: resolved.supported,
        installed: resolved.installed,
        path: resolved.path,
        version,
        doctor,
        mcp: resolved.mcp,
        install: resolved.install,
        notes: resolved.notes,
        checkedAt: now(),
      };
    } catch (error) {
      return failedStatus(error);
    }
  };

  return async (refresh = false) => {
    const at = now();
    if (!refresh && cached !== undefined && at - cached.at < ttl) return cached.value;
    if (inflight !== undefined) return inflight;
    inflight = build()
      .then((value) => {
        cached = { at: now(), value };
        return value;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };
}

/**
 * 默认探测器：读当前进程的平台与环境，跑真 doctor。
 * @returns 探测函数。
 */
export function defaultStatusDetector(): (refresh?: boolean) => Promise<KimiCuStatus> {
  return createStatusDetector({
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    readVersion: (platform, path) => (platform === 'darwin' ? readMacosVersion(path) : null),
    runDoctor,
  });
}

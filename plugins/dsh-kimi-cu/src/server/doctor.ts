/**
 * doctor 探测与解析：macOS 看辅助功能/屏幕录制等检查项，Windows 看 mcp=true。
 *
 * 解析是纯函数，spawn 只在 runDoctor 里发生；测试用固定输出验解析，真机验收验 spawn。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { DoctorCheck, KimiCuPlatform } from '../shared/status.ts';

const execFileAsync = promisify(execFile);

/** macOS doctor 标签到机器可读 id 的映射。 */
const MACOS_CHECK_IDS: Record<string, string> = {
  'accessibility (ax)': 'accessibility',
  'screen recording': 'screen-recording',
  'skylight post-to-pid': 'skylight',
  'bg-input (window-location spi)': 'bg-input',
  'signed keyboard': 'signed-keyboard',
};

/** 解析出来的 doctor 结果。 */
export interface ParsedDoctor {
  ok: boolean;
  checks: DoctorCheck[];
  version: string | null;
}

/**
 * 解析 doctor 的原始输出。
 * @param platform - 三分类平台。
 * @param raw - stdout 与 stderr 拼起来的文本。
 * @returns 检查项、是否全绿、版本号。
 */
export function parseDoctor(platform: KimiCuPlatform, raw: string): ParsedDoctor {
  const lines = raw.split('\n').map((line) => line.trim());

  if (platform === 'darwin') {
    const checks: DoctorCheck[] = [];
    for (const line of lines) {
      const mark = line.slice(0, 1);
      if (mark !== '✅' && mark !== '❌') continue;
      const label = line.slice(1).trim();
      if (label === '') continue;
      const id = MACOS_CHECK_IDS[label.toLowerCase()] ?? 'check-' + String(checks.length + 1);
      checks.push({ id, label, ok: mark === '✅' });
    }
    return { ok: checks.length > 0 && checks.every((check) => check.ok), checks, version: null };
  }

  if (platform === 'win32') {
    let version: string | null = null;
    let mcp: string | null = null;
    for (const line of lines) {
      if (line.startsWith('version=')) version = line.slice('version='.length).trim() || null;
      else if (line.startsWith('mcp=')) mcp = line.slice('mcp='.length).trim();
    }
    return {
      ok: mcp === 'true',
      checks: [{ id: 'mcp', label: 'MCP', ok: mcp === 'true' }],
      version,
    };
  }

  return { ok: false, checks: [], version: null };
}

/** 一次真实 doctor 调用的结果。 */
export interface DoctorRun extends ParsedDoctor {
  ran: boolean;
  raw: string;
  error?: string;
}

/**
 * 跑一次 doctor。
 * @param platform - 三分类平台。
 * @param binaryPath - 要执行的 KimiCU 二进制。
 * @returns 解析后的结果；跑不起来时 error 有值，不抛。
 */
export async function runDoctor(platform: KimiCuPlatform, binaryPath: string): Promise<DoctorRun> {
  if (platform === 'other' || binaryPath === '') {
    return { ran: false, ok: false, checks: [], version: null, raw: '', error: 'unsupported platform' };
  }
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ['doctor'], {
      timeout: 15000,
      windowsHide: true,
      encoding: 'utf8',
    });
    const raw = String(stdout ?? '') + String(stderr ?? '');
    return { ran: true, ...parseDoctor(platform, raw), raw };
  } catch (error) {
    const record = error as { stdout?: string; stderr?: string };
    const raw = String(record.stdout ?? '') + String(record.stderr ?? '');
    return {
      ran: true,
      ...parseDoctor(platform, raw),
      raw,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

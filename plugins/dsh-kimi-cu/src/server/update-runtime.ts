/**
 * 更新链路的真实执行：读清单、跑 upgrade 子进程。
 *
 * 超时只放弃等待，不 kill 子进程——upgrade 可能正卡在「已停旧服务、正在换 bundle」，
 * 打断它会留下半成品；KimiCU 自己有回滚与自检，让它走完。调用方靠 whenExited 等它退出。
 */

import { spawn } from 'node:child_process';

import type { UpgradeRun } from './update.ts';

/** 一次更新最多等 5 分钟；超时后进程继续，页面拿到 timeout 事件。 */
export const UPDATE_TIMEOUT_MS = 300_000;

/** 读清单的网络超时。 */
const MANIFEST_TIMEOUT_MS = 5_000;

/**
 * 读一份更新清单的原文。
 * @param url - 清单地址。
 * @returns 响应体文本。
 */
export async function fetchManifestText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error('HTTP ' + String(response.status));
  return response.text();
}

/** 跑一次 upgrade 的输入。 */
export interface RunUpgradeProcessInput {
  binaryPath: string;
  args: string[];
  /** 每读到一行输出回调一次。 */
  onLine: (line: string) => void;
  /** 等待上限；默认 5 分钟。 */
  timeoutMs?: number;
}

/**
 * 跑一次 upgrade，逐行回调输出。
 * @param input - 二进制、参数、逐行回调与等待上限。
 * @returns 退出码、完整输出、是否超时，以及进程真正退出的承诺。
 */
export function runUpgradeProcess(input: RunUpgradeProcessInput): Promise<UpgradeRun> {
  const timeoutMs = input.timeoutMs ?? UPDATE_TIMEOUT_MS;
  return new Promise<UpgradeRun>((resolve) => {
    let raw = '';
    let pending = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let markExited = (): void => {};
    const whenExited = new Promise<void>((done) => {
      markExited = done;
    });

    const finish = (run: Omit<UpgradeRun, 'whenExited'>): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ ...run, whenExited });
    };

    const push = (chunk: string): void => {
      raw += chunk;
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) input.onLine(line);
    };

    let child;
    try {
      child = spawn(input.binaryPath, input.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      markExited();
      finish({ code: null, raw: error instanceof Error ? error.message : String(error), timedOut: false });
      return;
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => push(chunk));
    child.stderr?.on('data', (chunk: string) => push(chunk));
    child.on('error', (error) => {
      markExited();
      finish({ code: null, raw: raw + (error instanceof Error ? error.message : String(error)), timedOut: false });
    });
    child.on('close', (code) => {
      markExited();
      if (pending !== '') input.onLine(pending);
      finish({ code, raw, timedOut: false });
    });

    timer = setTimeout(() => finish({ code: null, raw, timedOut: true }), timeoutMs);
  });
}

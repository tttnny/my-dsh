import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { FallbackReason, JudgeMetrics, LogEntry } from './types.ts';

export const LOG_KEEP = 200;
export const LOG_PAGE_LIMIT = 10;

const REASONS: readonly FallbackReason[] = [
  'unreachable', 'timeout', 'unmatched', 'incomplete', 'unavailable-route',
];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function readMetrics(value: unknown): JudgeMetrics | undefined {
  const item = record(value);
  if (item === undefined) return undefined;
  return {
    judgeModel: text(item.judgeModel),
    optionCount: count(item.optionCount),
    subjectLength: count(item.subjectLength),
  };
}

/** Allow-list the fields written and served so stored request text cannot be replayed. */
function readEntry(value: unknown): LogEntry | undefined {
  const item = record(value);
  if (item === undefined) return undefined;
  const reason = REASONS.find((candidate) => candidate === item.reason);
  const metrics = readMetrics(item.metrics);
  return {
    typeId: count(item.typeId) || null,
    provider: text(item.provider),
    model: text(item.model),
    effort: text(item.effort),
    ...reason === undefined ? {} : { reason },
    at: count(item.at),
    latencyMs: count(item.latencyMs),
    ...metrics === undefined ? {} : { metrics },
  };
}

function newest(entries: LogEntry[]): LogEntry[] {
  return entries.sort((left, right) => right.at - left.at).slice(0, LOG_KEEP);
}

/** A bounded, newest-first log shared by the Host processes in one DSH home. */
export class LogStore {
  private entries: LogEntry[] = [];
  private pending: LogEntry[] = [];
  private loading?: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  private readonly filePath: string;

  constructor(filePath = dshHomePath('dsh-subagent-judge-dispatch', 'judgements.json')) {
    this.filePath = filePath;
  }

  init(): Promise<void> {
    this.loading ??= this.readDisk().then((entries) => {
      this.entries = entries;
    }).catch(() => {});
    return this.loading;
  }

  append(entry: LogEntry): void {
    const sanitized = readEntry(entry);
    if (sanitized === undefined) return;
    this.pending.unshift(sanitized);
    this.writing = this.writing.then(() => this.write()).catch(() => {
      this.pending = newest(this.pending);
      console.warn('[dsh-subagent-judge-dispatch] 判断日志写不进磁盘');
    });
  }

  list(): LogEntry[] {
    return this.snapshot(this.entries);
  }

  async readLatest(): Promise<LogEntry[]> {
    const previous = this.entries;
    const disk = await this.readDisk().catch(() => this.entries);
    // A local commit can complete while the file read observes its old inode.
    return this.snapshot(this.entries === previous ? disk : this.entries);
  }

  private snapshot(entries: LogEntry[]): LogEntry[] {
    return newest([...this.pending, ...entries]).map((entry) => structuredClone(entry));
  }

  async flush(): Promise<void> {
    await this.loading;
    await this.writing;
  }

  private async readDisk(): Promise<LogEntry[]> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      return Array.isArray(parsed)
        ? newest(parsed.map(readEntry).filter((entry): entry is LogEntry => entry !== undefined))
        : [];
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(): Promise<void> {
    if (this.pending.length === 0) return;
    await this.loading;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await withFileLock(this.filePath, async () => {
      const stored = await this.readDisk();
      const count = this.pending.length;
      const merged = newest([...this.pending, ...stored]);
      await writeFileAtomic(this.filePath, JSON.stringify(merged, null, 2), { mode: 0o600 });
      this.pending.length -= count;
      this.entries = merged;
    });
  }
}

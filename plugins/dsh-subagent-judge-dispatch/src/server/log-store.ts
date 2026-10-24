/**
 * The plugin's own log, kept on disk under the DSH home.
 *
 * The Host's native subagent list has no model column and a plugin cannot add
 * one, so this log is the only place a delegation's assigned route is visible.
 * It outlives the Host process: a judgement that ran yesterday is still one
 * question away today.
 *
 * Two bounds, deliberately different. The file keeps {@link LOG_KEEP} entries
 * so "what did it pick last time" survives a restart, while the configuration
 * page shows only {@link LOG_PAGE_LIMIT}: the page is a glance at what just
 * happened, not a log viewer.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { LogEntry } from './types.ts';

/** How many entries the file keeps. */
export const LOG_KEEP = 200;

/** How many entries the configuration page shows. */
export const LOG_PAGE_LIMIT = 10;

/**
 * Read one entry from a stored document value, tolerating a partial record.
 *
 * The file outlives the process, so a line written by another version may be
 * missing a field. Such a line keeps whatever it does carry rather than
 * rejecting the whole document.
 *
 * @param value - one element of the stored array.
 * @returns the entry, or undefined when the value is not an object.
 */
function readEntry(value: unknown): LogEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');
  const count = (key: string): number =>
    typeof record[key] === 'number' && Number.isFinite(record[key]) ? (record[key] as number) : 0;
  return {
    typeId: typeof record.typeId === 'number' ? record.typeId : null,
    provider: text('provider'),
    model: text('model'),
    effort: text('effort'),
    ...typeof record.reason === 'string' ? { reason: record.reason as LogEntry['reason'] } : {},
    at: count('at'),
    latencyMs: count('latencyMs'),
    parentTitle: text('parentTitle'),
    childLabel: text('childLabel'),
    prompt: text('prompt'),
  };
}

/** A bounded, newest-first log backed by one JSON file. */
export class LogStore {
  private entries: LogEntry[] = [];
  private readonly filePath: string;
  /** The initial read, so an append issued before it lands cannot be overwritten by it. */
  private loading: Promise<void> | null = null;
  /** Writes are chained, so two appends cannot interleave their file replaces. */
  private writing: Promise<void> = Promise.resolve();

  /**
   * @param filePath - where the log lives; defaults to this plugin's own
   * directory under the DSH home.
   */
  constructor(filePath: string = dshHomePath('dsh-subagent-judge-dispatch', 'judgements.json')) {
    this.filePath = filePath;
  }

  /**
   * Load what a previous process wrote.
   *
   * A missing, unreadable or malformed file leaves the log empty; the next
   * append rewrites it. This method never rejects, because a broken log must
   * never stop a judgement.
   */
  init(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  /** Read the file once and adopt what it holds. */
  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : [];
      // 先读到的记录排在这次运行新写的那几条后面，谁也不会盖掉谁。
      const stored = list
        .map(readEntry)
        .filter((entry): entry is LogEntry => entry !== undefined);
      this.entries = [...this.entries, ...stored].slice(0, LOG_KEEP);
    } catch {
      // 文件不存在或读不动就从空日志起步；这次运行已经追加的记录保持原样。
    }
  }

  /**
   * Append one entry, dropping the oldest beyond {@link LOG_KEEP}, and write.
   *
   * The write starts at once rather than on a timer: a judgement is rare enough
   * that coalescing buys nothing, and a delayed write is a record a hard exit
   * can lose.
   *
   * @param entry - the entry to append.
   */
  append(entry: LogEntry): void {
    this.entries = [entry, ...this.entries].slice(0, LOG_KEEP);
    // 磁盘里那份先读完再合并，否则这次刚记下的一条会被初始读取整份换成旧记录。
    // 上一笔写在赋新值之前取下来：写成 `() => this.writing` 会等自己，永远不落地。
    const previous = this.writing;
    const afterLoad = this.loading === null ? previous : this.loading.then(() => previous);
    this.writing = afterLoad.then(() => this.write()).catch((error) => {
      console.warn('[dsh-subagent-judge-dispatch] 判断日志写不进磁盘：', error);
    });
  }

  /**
   * Read the whole kept log, newest first.
   * @returns a detached copy, so a reader cannot mutate the stored entries.
   */
  list(): LogEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  /** Wait for the initial read and the writes already started to land. */
  async flush(): Promise<void> {
    if (this.loading !== null) await this.loading;
    await this.writing;
  }

  /** Replace the file atomically, so a crash cannot leave half a document. */
  private async write(): Promise<void> {
    const temp = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(temp, JSON.stringify(this.entries, null, 2), 'utf-8');
      await fs.rename(temp, this.filePath);
    } catch (error) {
      try {
        await fs.unlink(temp);
      } catch {
        // The temp file may never have been created; nothing to clean up.
      }
      throw error;
    }
  }
}

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { cacheGeneration } from './prompt-revision.ts';

/** 池里的一个条目：原文对应的译文。 */
interface CacheEntry {
  v: string;
}

/** 磁盘文档记录生成译文的配置代，加载时只采用当前代。 */
interface CacheDocument {
  rev: string;
  entries: Record<string, CacheEntry>;
}

export class LruDiskCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private filePath: string;
  private revision: string;
  private revisionEpoch = 0;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(maxEntries = 1000, fileName = 'cache.json', revision: string = cacheGeneration()) {
    this.maxEntries = maxEntries;
    this.revision = revision;
    // Follow the DSH convention of component-owned home subdirectories
    // (sessions/, storages/, attachments/) instead of polluting ~/.dsh.
    // dshHomePath mirrors resolveDshHome exactly: explicit configured home,
    // then $DSH_HOME (tilde-expanded), then ~/.dsh.
    this.filePath = dshHomePath('dsh-chat-translate', fileName);
  }

  /** 配置换代时清空内存，并安排覆写磁盘中的旧池。 */
  setRevision(revision: string): void {
    if (revision === this.revision) return;
    this.revision = revision;
    this.revisionEpoch += 1;
    this.cache.clear();
    this.dirty = true;
    this.scheduleSave();
  }

  async init(): Promise<void> {
    const epoch = this.revisionEpoch;
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const doc = JSON.parse(content) as unknown;
      // An edit or new result that landed while reading takes precedence.
      if (epoch !== this.revisionEpoch || this.dirty || this.cache.size > 0 || this.disposed) return;
      if (
        doc &&
        typeof doc === 'object' &&
        (doc as CacheDocument).rev === this.revision &&
        typeof (doc as CacheDocument).entries === 'object' &&
        (doc as CacheDocument).entries !== null
      ) {
        this.loadEntries((doc as CacheDocument).entries as Record<string, unknown>);
      } else {
        // Empty superseded documents too, even if no new result is requested.
        this.dirty = true;
        this.scheduleSave();
      }
    } catch {
      // Ignore missing or corrupt cache file
    }
  }

  /** Adopt loaded entries, dropping malformed ones. */
  private loadEntries(raw: Record<string, unknown>): void {
    for (const [k, entry] of Object.entries(raw)) {
      const value = entry as CacheEntry | undefined;
      // The document on disk outlives the process: only entries carrying a
      // string translation are served again.
      if (value && typeof value === 'object' && typeof value.v === 'string') {
        this.cache.set(k, value);
      }
    }
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) return undefined;
    // Refresh key in LRU order (re-insert at the end)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.v;
  }

  set(key: string, value: string): void {
    if (this.disposed) return;
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Remove least recently used entry (first in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { v: value });
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.disposed || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        // A failed write marks the snapshot dirty again and schedules a retry.
        this.flush().catch((err) => {
          console.warn('[dsh-chat-translate] Failed to flush cache to disk:', err);
        });
      }
    }, 5000);
  }

  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.saving = this.saving.then(() => this.writeSnapshot());
    return this.saving;
  }

  private async writeSnapshot(): Promise<void> {
    if (!this.dirty) return;
    // New edits can set dirty again while this fixed snapshot is written.
    this.dirty = false;
    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      const doc: CacheDocument = { rev: this.revision, entries: Object.fromEntries(this.cache) };
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.filePath);
    } catch (err) {
      this.dirty = true;
      console.warn('[dsh-chat-translate] Failed to write cache file atomically:', err);
      try {
        await fs.unlink(tmpPath);
      } catch {}
      // Schedule one retry so a transient disk failure does not lose the
      // pending entries; dispose() is the only caller that must not reschedule.
      this.scheduleSave();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.flush();
  }
}

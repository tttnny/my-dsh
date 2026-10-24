import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { cacheGeneration } from './prompt-revision.ts';

/** 池里的一个条目：原文对应的译文。 */
interface CacheEntry {
  v: string;
}

/**
 * The on-disk document: the prompt revision that wrote it, then the pool.
 * A document whose `rev` is not the current revision belongs to a superseded
 * prompt semantics and is dropped whole on load — replaying stale
 * translations into a new policy is exactly how a prompt fix "does nothing".
 */
interface CacheDocument {
  rev: string;
  entries: Record<string, CacheEntry>;
}

export class LruDiskCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private filePath: string;
  private revision: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(maxEntries = 1000, fileName = 'cache.json', revision: string = cacheGeneration('')) {
    this.maxEntries = maxEntries;
    this.revision = revision;
    // Follow the DSH convention of component-owned home subdirectories
    // (sessions/, storages/, attachments/) instead of polluting ~/.dsh.
    // dshHomePath mirrors resolveDshHome exactly: explicit configured home,
    // then $DSH_HOME (tilde-expanded), then ~/.dsh.
    this.filePath = dshHomePath('dsh-chat-translate', fileName);
  }

  /**
   * Move the pool to the generation a prompt edit produced.
   *
   * Called whenever the prompt in force changes. A different revision means the
   * entries already held were written under wording the reader has replaced, so
   * they are dropped rather than served under the new prompt; the same revision
   * is a no-op, so re-committing the same text costs nothing.
   *
   * @param revision - the generation the current prompt resolves to.
   */
  setRevision(revision: string): void {
    if (revision === this.revision) return;
    this.revision = revision;
    if (this.cache.size === 0) return;
    this.cache.clear();
    this.dirty = true;
    this.scheduleSave();
  }

  async init(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const doc = JSON.parse(content) as unknown;
      if (
        doc &&
        typeof doc === 'object' &&
        (doc as CacheDocument).rev === this.revision &&
        typeof (doc as CacheDocument).entries === 'object' &&
        (doc as CacheDocument).entries !== null
      ) {
        this.loadEntries((doc as CacheDocument).entries as Record<string, unknown>);
      }
      // Any other document — missing, corrupt, or a superseded revision —
      // leaves the pool empty; the next flush rewrites it under this revision.
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
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        // flush() owns the dirty flag: cleared only on a committed write, so
        // a failure keeps it set and schedules its own retry.
        this.flush().catch((err) => {
          console.warn('[dsh-chat-translate] Failed to flush cache to disk:', err);
        });
      }
    }, 5000);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const tmpPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    try {
      const entries: Record<string, CacheEntry> = {};
      for (const [k, v] of this.cache.entries()) {
        entries[k] = v;
      }
      const doc: CacheDocument = { rev: this.revision, entries };
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.filePath);
      // Only clear the dirty flag once the write actually committed; a failed
      // flush must not silently drop pending entries.
      this.dirty = false;
    } catch (err) {
      console.warn('[dsh-chat-translate] Failed to write cache file atomically:', err);
      try {
        await fs.unlink(tmpPath);
      } catch {}
      // Schedule one retry so a transient disk failure does not lose the
      // pending entries; dispose() is the only caller that must not reschedule.
      if (this.dirty) {
        this.scheduleSave();
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      await this.flush();
    }
  }
}

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { isMaskLeak } from './pipeline/masking.ts';
import { PROMPT_REVISION } from './prompt-revision.ts';

/** Entries older than this are treated as expired. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  t: number; // epoch ms, written at set()
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

  constructor(maxEntries = 1000, fileName = 'cache.json', revision = PROMPT_REVISION) {
    this.maxEntries = maxEntries;
    this.revision = revision;
    // Follow the DSH convention of component-owned home subdirectories
    // (sessions/, storages/, attachments/) instead of polluting ~/.dsh.
    // dshHomePath mirrors resolveDshHome exactly: explicit configured home,
    // then $DSH_HOME (tilde-expanded), then ~/.dsh.
    this.filePath = dshHomePath('dsh-chat-translate', fileName);
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

  /** Adopt loaded entries, dropping poisoned or malformed ones. */
  private loadEntries(raw: Record<string, unknown>): void {
    for (const [k, entry] of Object.entries(raw)) {
      if (entry && typeof entry === 'object' && typeof (entry as CacheEntry).v === 'string') {
        const value = entry as CacheEntry;
        // The document on disk outlives the process: check every entry
        // against the mask-leak guard before it can be served again.
        if (typeof value.t === 'number' && Number.isFinite(value.t) && !isMaskLeak(value.v)) {
          this.cache.set(k, value);
        }
      }
    }
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.t > TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    // Defense in depth: entries written during this session never passed the
    // load-time check, so the leak test guards the map itself too.
    if (isMaskLeak(entry.v)) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh key in LRU order (re-insert at the end)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.v;
  }

  set(key: string, value: string): void {
    if (isMaskLeak(value)) {
      console.warn('[dsh-chat-translate] refusing to cache a translation with a leaked mask placeholder');
      return;
    }
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Remove least recently used entry (first in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { t: Date.now(), v: value });
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

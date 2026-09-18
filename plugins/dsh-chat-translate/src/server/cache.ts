import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { isMaskLeak } from './pipeline/masking.ts';

/** Entries older than this are treated as expired. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  t: number; // epoch ms; 0 = legacy entry without timestamp (never expires on its own)
  v: string;
}

export class LruDiskCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private filePath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  /** Legacy root-level cache file (<=1.1); moved under the plugin subdir. */
  private legacyPath: string;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
    // Follow the DSH convention of component-owned home subdirectories
    // (sessions/, storages/, attachments/) instead of polluting ~/.dsh.
    // dshHomePath mirrors resolveDshHome exactly: explicit configured home,
    // then $DSH_HOME (tilde-expanded), then ~/.dsh.
    this.filePath = dshHomePath('dsh-chat-translate', 'cache.json');
    this.legacyPath = dshHomePath('dsh-chat-translate-cache.json');
  }

  async init(): Promise<void> {
    // One-shot relocation of the pre-1.2 cache file, keeping its value. When
    // the new file already exists (newer cache), the legacy file is retired.
    let readPath = this.filePath;
    try {
      await fs.access(this.filePath);
      // New cache already in place — the legacy file is just garbage now.
      await fs.unlink(this.legacyPath).catch(() => {});
    } catch {
      // The plugin subdirectory may not exist on first boot; rename fails
      // with ENOENT otherwise, which would silently lose the old cache.
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.rename(this.legacyPath, this.filePath);
        readPath = this.filePath;
      } catch {
        readPath = this.legacyPath; // rename failed — read the legacy file directly
      }
    }

    try {
      const content = await fs.readFile(readPath, 'utf-8');
      const obj = JSON.parse(content);
      if (obj && typeof obj === 'object') {
        for (const [k, raw] of Object.entries(obj)) {
          if (typeof raw === 'string') {
            // Legacy entry from an older release — keep it, no known timestamp.
            if (!isMaskLeak(raw)) this.cache.set(k, { t: 0, v: raw });
          } else if (raw && typeof raw === 'object' && typeof (raw as CacheEntry).v === 'string') {
            const entry = raw as CacheEntry;
            // Poisoned translations written before the mask-leak guard existed
            // must not survive a restart: drop them so the text is re-translated.
            if (typeof entry.t === 'number' && Number.isFinite(entry.t) && !isMaskLeak(entry.v)) {
              this.cache.set(k, entry);
            }
          }
        }
      }
    } catch {
      // Ignore missing or corrupt cache file
    }

    // Relocation fallback: the legacy file was the read source — retire it
    // now that its entries are loaded (or proved unreadable).
    if (readPath !== this.filePath) {
      await fs.unlink(this.legacyPath).catch(() => {});
    }
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry === undefined) return undefined;
    if (entry.t > 0 && Date.now() - entry.t > TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    // Safety net for entries that entered the in-memory map before the
    // mask-leak guard (e.g. a warm cache written this session).
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
      const obj: Record<string, CacheEntry> = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(obj, null, 2), 'utf-8');
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

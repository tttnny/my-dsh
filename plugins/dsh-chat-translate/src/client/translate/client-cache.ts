import { isMaskLeak } from '../../server/pipeline/masking.ts';

const CACHE_KEY = 'dsh-chat-translate:cache';
const MAX_LOCAL_ENTRIES = 500;
/** Entries older than this are treated as expired. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  t: number; // epoch ms; 0 = legacy entry without timestamp
  v: string;
}

export class ClientCache {
  // Map preserves insertion order in JS, enabling true LRU semantics.
  private memCache = new Map<string, CacheEntry>();
  private dirty = false;
  private saveTimer: number | null = null;

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          for (const [k, entry] of Object.entries(obj)) {
            if (typeof entry === 'string') {
              // Legacy entry from an older release.
              this.memCache.set(k, { t: 0, v: entry });
            } else if (entry && typeof entry === 'object' && typeof (entry as CacheEntry).v === 'string') {
              this.memCache.set(k, entry as CacheEntry);
            }
          }
        }
      }
    } catch {
      // Ignore parse failure
    }
  }

  get(text: string): string | undefined {
    const key = text.trim().toLowerCase();
    const entry = this.memCache.get(key);
    if (entry === undefined) return undefined;
    // A translation still showing a mask placeholder leaked from an older
    // release — evict it so the text is requested again instead of rendered.
    if (typeof entry.v === 'string' && isMaskLeak(entry.v)) {
      this.memCache.delete(key);
      this.dirty = true;
      this.scheduleSave();
      return undefined;
    }
    // Drop dirty fallback entries where value equals key
    if (entry.v && entry.v.trim().toLowerCase() === key) {
      this.memCache.delete(key);
      this.dirty = true;
      this.scheduleSave();
      return undefined;
    }
    if (entry.t > 0 && Date.now() - entry.t > TTL_MS) {
      this.memCache.delete(key);
      this.dirty = true;
      this.scheduleSave();
      return undefined;
    }
    // True LRU: Re-insert to move to the end (most recently used)
    this.memCache.delete(key);
    this.memCache.set(key, entry);
    return entry.v;
  }

  set(text: string, translated: string): void {
    const key = text.trim().toLowerCase();
    if (this.memCache.has(key)) {
      this.memCache.delete(key);
    } else if (this.memCache.size >= MAX_LOCAL_ENTRIES) {
      // Evict least recently used (first item in Map)
      const oldestKey = this.memCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.memCache.delete(oldestKey);
      }
    }
    this.memCache.set(key, { t: Date.now(), v: translated });
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null || typeof window === 'undefined') return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.flushSync();
    }, 2000);
  }

  flushSync(): void {
    if (!this.dirty || typeof localStorage === 'undefined') return;
    this.dirty = false;
    try {
      const obj: Record<string, CacheEntry> = {};
      for (const [k, v] of this.memCache.entries()) {
        obj[k] = v;
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore quota error
    }
  }

  clear(): void {
    this.memCache.clear();
    this.dirty = true;
    this.flushSync();
  }

  size(): number {
    return this.memCache.size;
  }
}

export const clientCache = new ClientCache();
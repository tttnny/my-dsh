import { isMaskLeak } from '../../server/pipeline/masking.ts';

/** 正文译文的缓存键与容量。这一版沿用了旧缓存的文件名与键：零迁移，旧条目按 TTL 自然淘汰。 */
const CACHE_KEY = 'dsh-chat-translate:cache';
const MAX_ENTRIES = 500;
/** 上一版思考链译文池的键，本版一次性清掉。 */
const RETIRED_CACHE_KEYS = ['dsh-chat-translate:think-cache'];
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
  private storageKey: string;
  private maxEntries: number;

  constructor(storageKey: string = CACHE_KEY, maxEntries: number = MAX_ENTRIES) {
    this.storageKey = storageKey;
    this.maxEntries = maxEntries;
    this.load();
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
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
    } else if (this.memCache.size >= this.maxEntries) {
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
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
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

/**
 * 一次性清掉上一版留下的思考链译文池。浏览器里没有「启动钩子」，所以这段在
 * 模块加载时跑一次：键不存在就是空操作。
 */
function retireClientCaches(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of RETIRED_CACHE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 隐私模式等存储不可用：留着也无害，本版不再读它。
    }
  }
}

retireClientCaches();

/** 正文译文缓存：本插件唯一的客户端缓存池。 */
export const clientCache = new ClientCache();
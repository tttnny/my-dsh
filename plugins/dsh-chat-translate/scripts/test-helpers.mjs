// Shared fakes for the dsh-chat-translate test suites.
// The plugin rides DSH services (this plugin's own Config / ctx.credentials)
// instead of files, so tests inject in-memory fakes with the same shapes.
import { DEFAULT_CONFIG } from '../src/server/config.ts';

/**
 * In-memory stand-in for this plugin's settings entry, covering the faces the
 * host half consumes:
 *
 * - `get` / `watch`: the live Config source `ConfigManager` reads. In the real
 *   runtime those are the `Volatile` refs the entry's Config declares.
 * - `update`: one accepted live edit — what the browser configuration form
 *   writes into the profile entry.
 */
export function createFakeSettingsEntry(initial = {}) {
  let userLayer = Object.keys(initial).length > 0 ? { ...initial } : undefined;
  const listeners = new Set();
  /** Resolved value: schema defaults over the user layer. */
  const value = () => ({ ...DEFAULT_CONFIG, ...(userLayer ?? {}) });
  const commit = () => {
    const next = value();
    for (const listener of [...listeners]) listener(next);
  };
  return {
    get: value,
    watch: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** One accepted live edit of the entry's config section. */
    update: async (patch) => {
      userLayer = { ...(userLayer ?? {}), ...patch };
      commit();
    },
  };
}

/**
 * In-memory stand-in for the DSH credentials service (host half) and for the
 * `remote.credentials` client API. Keys are plain strings; TRANSLATE_API_KEY
 * is the only ref the suites exercise.
 */
/** 原样回显 ⟪…⟫ 打包标记负载的每个段，模拟守规矩的多段翻译。 */
export function echoMarkers(text) {
  const matches = [...text.matchAll(/⟪([a-z]{4})(\d+)⟫/g)];
  return matches
    .map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      return match[0] + '\n译:' + text.slice(start, end).trim();
    })
    .join('\n\n');
}

export function createFakeCredentials(initialKey = '') {
  let key = initialKey;
  return {
    resolve: async (ref) =>
      ref === 'TRANSLATE_API_KEY' && key ? { value: key, source: 'file' } : undefined,
    describe: async (ref) => ({
      configured: Boolean(ref === 'TRANSLATE_API_KEY' && key),
      writable: true,
    }),
    set: async (ref, value) => {
      if (ref === 'TRANSLATE_API_KEY') key = value;
    },
    unset: async (ref) => {
      if (ref === 'TRANSLATE_API_KEY') key = '';
    },
  };
}

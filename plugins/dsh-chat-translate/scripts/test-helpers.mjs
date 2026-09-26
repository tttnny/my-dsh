// Shared fakes for the dsh-chat-translate test suites.
// The plugin rides DSH services (this plugin's own Config / ctx.settings /
// ctx.credentials) instead of files, so tests inject in-memory fakes with the
// same shapes.
import { DEFAULT_CONFIG, SETTINGS_NAMESPACE } from '../src/server/config.ts';

/**
 * In-memory stand-in for this plugin's settings entry, covering both faces the
 * host half consumes:
 *
 * - `get` / `watch`: the live Config source `ConfigManager` reads. In the real
 *   runtime those are the `Volatile` refs the entry's Config declares.
 * - `update`: one accepted live edit — what the browser configuration form
 *   writes into the profile entry.
 * - `describe` / `mutate`: the provider-level `ctx.settings` face the one-shot
 *   legacy-file migration writes through, under one revision fence.
 */
export function createFakeSettingsEntry(initial = {}) {
  let userLayer = Object.keys(initial).length > 0 ? { ...initial } : undefined;
  let revision = 1;
  const listeners = new Set();
  /** Resolved value: schema defaults over the user layer. */
  const value = () => ({ ...DEFAULT_CONFIG, ...(userLayer ?? {}) });
  const commit = () => {
    revision += 1;
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
    // Provider-level path write the legacy migration uses: one revision fence
    // covers every op in the batch.
    mutate: async (ns, ops, expectedRevision) => {
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new Error(`settings conflict: expected ${expectedRevision}, at ${revision}`);
      }
      const next = structuredClone(userLayer ?? {});
      for (const op of ops) {
        let node = next;
        for (let i = 0; i < op.path.length - 1; i++) {
          const key = op.path[i];
          if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
          node = node[key];
        }
        const leaf = op.path[op.path.length - 1];
        if (op.op === 'set') node[leaf] = op.value;
        else delete node[leaf];
      }
      userLayer = next;
      commit();
    },
    // Minimal settings-service face for migration tests. Mirrors the real
    // service: the `user` key is OMITTED (not undefined) while no user layer
    // exists.
    describe: () => [
      { ns: SETTINGS_NAMESPACE, revision, ...(userLayer === undefined ? {} : { user: userLayer }) },
    ],
    setUserLayer: (user) => {
      userLayer = user;
    },
  };
}

/**
 * In-memory stand-in for the DSH credentials service (host half) and for the
 * `remote.credentials` client API. Keys are plain strings; TRANSLATE_API_KEY
 * is the only ref the suites exercise.
 */
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

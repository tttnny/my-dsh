// Shared fakes for the dsh-chat-translate test suites.
// Since 1.2 the plugin rides DSH services (ctx.settings / ctx.credentials)
// instead of files, so tests inject in-memory fakes with the same shapes.
import { DEFAULT_CONFIG, SETTINGS_NAMESPACE } from '../src/server/config.ts';

/**
 * In-memory stand-in for the owner scope returned by ctx.settings.register().
 * get() returns the merged config; update() applies the patch and notifies
 * watchers (mirroring DSH's resolved-value commit).
 */
export function createFakeSettingsScope(initial = {}) {
  let config = { ...DEFAULT_CONFIG, ...initial };
  let userLayer = undefined;
  let revision = 1;
  const listeners = new Set();
  const commit = () => {
    revision += 1;
    for (const listener of [...listeners]) listener(config);
  };
  return {
    get: () => ({ ...config }),
    watch: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: async (patch) => {
      userLayer = { ...(userLayer ?? {}), ...patch };
      config = { ...config, ...patch };
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
      config = { ...DEFAULT_CONFIG, ...next };
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
      config = { ...DEFAULT_CONFIG, ...user };
    },
  };
}

/**
 * In-memory stand-in for the DSH ctx.credentials service. Keys are plain
 * strings; TRANSLATE_API_KEY is the only ref the suites exercise.
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

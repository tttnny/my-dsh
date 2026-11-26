/** Shared by the host and the conversation menu. */
export const DEFAULT_ENABLED = true;
export const SETTINGS_NAMESPACE = 'dsh-subagent-judge-dispatch';

export type SessionOverrides = Readonly<Record<string, boolean>>;

/** An explicit choice takes precedence over the plugin default. */
export function enabledFor(overrides: unknown, fallback: boolean, sessionId?: string): boolean {
  if (sessionId === undefined || overrides === null || typeof overrides !== 'object'
    || !Object.hasOwn(overrides, sessionId)) return fallback;
  const choice = (overrides as SessionOverrides)[sessionId];
  return typeof choice === 'boolean' ? choice : fallback;
}

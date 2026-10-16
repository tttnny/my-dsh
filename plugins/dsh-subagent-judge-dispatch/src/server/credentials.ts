/**
 * Where the judgement key lives, and the Host service it is read through.
 *
 * The reference name is a constant of the plugin rather than a setting: the
 * page asks for the key itself and stores it write-only through the DSH
 * credentials service, so a reader never has to know what a "credential
 * reference" is, and no surface can point the plugin at somebody else's key.
 * This module imports nothing, so both halves can share the literal.
 *
 * The key value crosses in one direction only: it is written, and read back by
 * the Host half alone. The browser face reads a status-only view.
 */

/** Credential reference the judgement key is stored under. */
export const JUDGE_API_KEY_REF = 'SUBAGENT_JUDGE_API_KEY';

/** Minimal structural shape of the Host's `ctx.credentials` service. */
export interface CredentialsServiceLike {
  /** Resolve a reference to its stored or inherited value. */
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>;
  /** Status-only view of a reference; never returns the plaintext value. */
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>;
  /** Store a non-empty value under a reference. */
  set(ref: string, value: string): Promise<void>;
  /** Remove a reference from the document. */
  unset(ref: string): Promise<void>;
}

/** Minimal structural shape of the browser's `ctx.remote.credentials` face. */
export interface CredentialsRemoteLike {
  describe(refs: string[]): Promise<
    { ok: true; value: Record<string, { configured: boolean; source?: string; writable: boolean }> }
    | { ok: false; error: { message: string } }
  >;
  set(ref: string, value: string): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
  unset(ref: string): Promise<{ ok: true } | { ok: false; error: { message: string } }>;
}

/** Owner-only, versioned, single-account refresh-token persistence. */
export declare const AUTH_RECORD_VERSION: 1;
export interface AuthRecordDraft {
    readonly refreshToken: string;
    readonly projectId: string;
    readonly email?: string;
    /** Keep the same lineage for a refresh; a new login omits it to fence older work. */
    readonly lineage?: string;
}
export interface AntigravityAuthRecord {
    readonly version: typeof AUTH_RECORD_VERSION;
    readonly refreshToken: string;
    readonly projectId: string;
    readonly email?: string;
    readonly revision: number;
    readonly updatedAt: string;
    /** A per-login lineage fence; absent only on records written by older versions. */
    readonly lineage?: string;
}
export interface AuthStoreOptions {
    readonly now?: () => number;
    /** Override process.platform only for deterministic cross-platform tests. */
    readonly platform?: NodeJS.Platform;
}
export interface AntigravityAuthStore {
    read(): Promise<AntigravityAuthRecord | undefined>;
    commit(draft: AuthRecordDraft): Promise<AntigravityAuthRecord>;
    compareAndCommit(expectedRevision: number, draft: AuthRecordDraft, expectedLineage?: string): Promise<AntigravityAuthRecord | undefined>;
    /** Clear only when the observed record is still the same account lineage. */
    clearIfCurrent(expectedRevision: number, expectedLineage?: string): Promise<boolean>;
    clear(): Promise<void>;
}
export type AuthStoreErrorCode = 'AUTH_STORE_CORRUPT' | 'AUTH_STORE_UNSUPPORTED_VERSION' | 'AUTH_STORE_UNSAFE_PERMISSIONS' | 'AUTH_STORE_CONFLICT' | 'AUTH_STORE_IO';
export declare class AuthStoreError extends Error {
    readonly code: AuthStoreErrorCode;
    constructor(code: AuthStoreErrorCode, message: string);
}
/** Resolve the plugin-owned default path without reading it. */
export declare function defaultAuthStorePath(env?: NodeJS.ProcessEnv, home?: string | undefined, platform?: NodeJS.Platform): string;
/** Create one store whose public API never exposes an access token field. */
export declare function createAuthStore(path: string, options?: AuthStoreOptions): AntigravityAuthStore;
/** An offline store useful for tests and process-local bootstrap fixtures. */
export declare function createMemoryAuthStore(initial?: AntigravityAuthRecord, options?: AuthStoreOptions): AntigravityAuthStore;
export declare function readAuthRecord(path: string): Promise<AntigravityAuthRecord | undefined>;
export declare function writeAuthRecord(path: string, record: AntigravityAuthRecord): Promise<void>;
export declare function makeAuthRecord(draft: AuthRecordDraft, revision: number, now?: number): AntigravityAuthRecord;
//# sourceMappingURL=auth-store.d.ts.map
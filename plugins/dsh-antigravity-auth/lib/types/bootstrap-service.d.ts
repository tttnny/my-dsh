/** Offline-friendly Host service factory used by tests and embedding code. */
import type { AntigravityAuthService, AntigravityAuthServiceOptions } from './auth-service.ts';
/** Use an in-memory store unless the caller explicitly selects a persistent path/store. */
export declare function createBootstrapStatusService(options?: AntigravityAuthServiceOptions): AntigravityAuthService;
export type { AntigravityAuthService, AntigravityAuthServiceOptions };
//# sourceMappingURL=bootstrap-service.d.ts.map
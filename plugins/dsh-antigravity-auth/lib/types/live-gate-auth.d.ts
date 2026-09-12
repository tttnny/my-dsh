/** Interactive OAuth/project validation implementation for explicit live Gate A. */
import type { AntigravityAuthService } from './auth-service.ts';
import type { LiveGateResult } from './live-gates.ts';
export declare function runAuthGate(auth: AntigravityAuthService, output: (line: string) => void): Promise<LiveGateResult>;
//# sourceMappingURL=live-gate-auth.d.ts.map
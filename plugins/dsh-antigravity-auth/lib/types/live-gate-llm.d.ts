/** One-request Gate 0 and independently selectable LLM-family live fixtures. */
import type { AntigravityAuthService } from './auth-service.ts';
import type { CapabilityGateRegistry } from './capability-gates.ts';
import { AntigravityAdapter } from './llm-adapter.ts';
import type { LiveGateResult } from './live-gates.ts';
import type { LlmFamilyId } from './status.ts';
export declare const LIVE_TEXT_MODEL: "antigravity-gemini-3.7-flash";
export declare const LIVE_TEXT_MODEL_BY_FAMILY: Readonly<Record<LlmFamilyId, string>>;
export declare function runLlmGate(auth: AntigravityAuthService, gates: CapabilityGateRegistry, family?: LlmFamilyId, adapter?: Pick<AntigravityAdapter, 'stream'>): Promise<LiveGateResult>;
//# sourceMappingURL=live-gate-llm.d.ts.map
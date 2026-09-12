/** Small production dispatcher for explicitly authorized, one-at-a-time live gates. */
import { type AntigravityAuthService } from './auth-service.ts';
import { type CapabilityGateRegistry } from './capability-gates.ts';
import type { LiveGateRunner } from './live-gates.ts';
export { LIVE_TEXT_MODEL, LIVE_TEXT_MODEL_BY_FAMILY, runLlmGate } from './live-gate-llm.ts';
export { classifyGate0Outcome } from './live-gate-outcome.ts';
export { LIVE_VIDEO_EXPECTED_ANSWER, LIVE_VIDEO_QUESTION, isDeterministicVideoAnswer, } from './live-gate-video.ts';
export interface ProductionLiveGateRunnerOptions {
    readonly output?: (line: string) => void;
    readonly auth?: AntigravityAuthService;
    readonly gates?: CapabilityGateRegistry;
    readonly attachmentRoot?: string;
}
export declare function createProductionLiveGateRunner(options?: ProductionLiveGateRunnerOptions): LiveGateRunner;
//# sourceMappingURL=live-gate-runner.d.ts.map
/** Controlled pixel-fact verification for explicit live Gate V. */
import type { AntigravityAuthService } from './auth-service.ts';
import type { LiveGateResult, LiveGateRunOptions } from './live-gates.ts';
export declare const LIVE_VIDEO_QUESTION: "What exact uppercase word is visibly shown in the center of the video? Reply with that word only.";
export declare const LIVE_VIDEO_EXPECTED_ANSWER: "KUMQUAT";
export declare function runVideoGate(auth: AntigravityAuthService, options: LiveGateRunOptions): Promise<LiveGateResult>;
export declare function isDeterministicVideoAnswer(value: unknown): boolean;
//# sourceMappingURL=live-gate-video.d.ts.map
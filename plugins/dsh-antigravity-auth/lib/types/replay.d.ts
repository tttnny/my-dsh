/** Bounded, block-aligned replay metadata for Antigravity model turns. */
import type { ReplayEnvelope, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { Message } from '@deepseek-ai/dsh-llm';
export declare const ANTIGRAVITY_REPLAY_VERSION: 1;
export type ReplayBlockKind = 'text' | 'reasoning' | 'tool-call';
export interface AntigravityReplayBlock {
    readonly kind: ReplayBlockKind;
    readonly signature?: string;
}
export interface AntigravityReplayResponse {
    readonly version: typeof ANTIGRAVITY_REPLAY_VERSION;
    readonly provider: 'google-antigravity';
    readonly model: string;
    readonly family: 'gemini' | 'claude' | 'gpt-oss' | 'unknown';
    readonly finish?: string;
}
export interface AntigravityReplayState extends ReplayEnvelope {
    readonly response: AntigravityReplayResponse;
    readonly blocks: readonly AntigravityReplayBlock[];
}
/** Keep only provider-issued signatures and bounded response facts. */
export declare function createReplayState(model: string, family: AntigravityReplayResponse['family'], finish: string | undefined, blocks: readonly AntigravityReplayBlock[]): AntigravityReplayState;
/** Validate replay metadata before it can affect a later private request. */
export declare function compatibleReplayState(message: Message, provider: string, model: string, blockKinds?: readonly ReplayBlockKind[]): AntigravityReplayState | undefined;
/** Return the block family without allowing a model alias to cross families. */
export declare function antigravityModelFamily(model: string): AntigravityReplayResponse['family'];
/** Convert DSH schemas to the small function-declaration subset accepted privately. */
export declare function sanitizeToolSchemas(tools: readonly ToolSchema[] | undefined): readonly Record<string, unknown>[];
export declare function buildFunctionDeclarations(tools: readonly ToolSchema[] | undefined): readonly Record<string, unknown>[];
//# sourceMappingURL=replay.d.ts.map
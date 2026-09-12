/** Gated workspace-video understanding proof of concept. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts';
import { type PrivateTransport } from './private-transport.ts';
export declare const name = "antigravity-video";
export declare const inject: string[];
export declare const ANALYZE_VIDEO_TOOL_NAME = "analyze_video";
export declare const UNDERSTAND_VIDEO_TOOL_NAME = "analyze_video";
export declare const ANTIGRAVITY_VIDEO_ENDPOINT: `${string}/v1internal:generateContent`;
export declare const ANTIGRAVITY_VIDEO_MODEL = "antigravity-gemini-3.7-flash";
export declare const ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE = "antigravity-video";
export interface AntigravityVideoSettings {
    readonly enabled: boolean;
    readonly model: string;
    readonly maxBytes?: number;
}
export interface Config extends AntigravityVideoSettings {
}
export declare const Config: z<Config>;
export interface AntigravityVideoToolOptions {
    readonly auth: Pick<CredentialCoordinator, 'credential'> | {
        credential(signal?: AbortSignal): Promise<HostCredential | undefined>;
    };
    readonly fs: Pick<FileSystem, 'resolve' | 'contains' | 'readBytes' | 'lstat' | 'stat'>;
    readonly settings?: () => AntigravityVideoSettings;
    readonly transport?: PrivateTransport;
}
export declare class AntigravityVideoError extends HarnessError {
}
export interface VideoAnalysisResult {
    readonly text: string;
    readonly usage?: TokenUsage;
}
export declare function createAntigravityVideoTools(options: AntigravityVideoToolOptions): readonly ToolDefinition[];
export declare function buildVideoPayload(prompt: string, model: string, credential: Pick<HostCredential, 'projectId'>, data: Uint8Array): Record<string, unknown>;
export declare function apply(ctx?: Context, config?: Config): void;
//# sourceMappingURL=video.d.ts.map
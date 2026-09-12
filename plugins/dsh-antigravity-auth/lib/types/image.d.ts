/** Antigravity image generation/editing tools and session-authorized image catalog. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CredentialCoordinator, HostCredential } from './credential-coordinator.ts';
import { type PrivateTransport } from './private-transport.ts';
export declare const name = "antigravity-image";
export declare const inject: string[];
export declare const GENERATE_IMAGE_TOOL_NAME = "generate_image";
export declare const LIST_IMAGES_TOOL_NAME = "list_images";
export declare const ANTIGRAVITY_IMAGE_ENDPOINT: `${string}/v1internal:generateContent`;
export declare const ANTIGRAVITY_IMAGE_MODEL = "antigravity-gemini-3.1-flash-image";
export declare const ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE = "antigravity-image";
export interface Config extends AntigravityImageSettings {
}
export declare const Config: z<Config>;
export interface AntigravityImageSettings {
    readonly enabled: boolean;
    readonly model: string;
    readonly n: number;
}
export interface AntigravityImageToolOptions {
    readonly auth: Pick<CredentialCoordinator, 'credential'> | {
        credential(signal?: AbortSignal): Promise<HostCredential | undefined>;
    };
    readonly attachments: Pick<AttachmentStore, 'imageLimits' | 'validateImage' | 'saveImage' | 'readImage'>;
    readonly fs: Pick<FileSystem, 'resolve' | 'contains' | 'readBytes' | 'lstat' | 'stat'>;
    readonly settings?: () => AntigravityImageSettings;
    readonly transport?: PrivateTransport;
}
export declare class AntigravityImageError extends HarnessError {
}
export declare function createAntigravityImageTools(options: AntigravityImageToolOptions): readonly ToolDefinition[];
/** Mount tools when a ToolRuntime is available; the tool bodies recheck the credential gate. */
export declare function apply(ctx?: Context, config?: Config): void;
//# sourceMappingURL=image.d.ts.map
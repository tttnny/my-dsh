/** Shared Host-only media admission for image editing and the video POC. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType, SaveImageAttachment, StoredImageAttachment } from '@deepseek-ai/dsh-attachment';
import type { FileSystem } from '@deepseek-ai/dsh-fs';
import { HarnessError } from '@deepseek-ai/dsh-llm';
export declare const DEFAULT_VIDEO_BYTES: number;
export declare const DEFAULT_INLINE_IMAGE_BYTES: number;
export declare const IMAGE_HANDLE_PATTERN: RegExp;
export type MediaKind = 'image' | 'video';
export interface MediaAdmissionErrorOptions {
    readonly cause?: unknown;
}
export declare class MediaAdmissionError extends HarnessError {
    constructor(message: string, code: string, options?: MediaAdmissionErrorOptions);
}
export interface MediaAdmissionOptions {
    readonly attachments: Pick<AttachmentStore, 'imageLimits' | 'validateImage' | 'saveImage' | 'readImage'>;
    readonly fs: Pick<FileSystem, 'resolve' | 'contains' | 'readBytes' | 'lstat' | 'stat'>;
    readonly maxVideoBytes?: number;
}
export interface AdmittedImage {
    readonly kind: 'image';
    readonly input: SaveImageAttachment;
    readonly stored?: StoredImageAttachment;
    readonly source: 'session' | 'workspace' | 'inline';
}
export interface AdmittedVideo {
    readonly kind: 'video';
    readonly data: Uint8Array;
    readonly mediaType: 'video/mp4';
}
export declare function imageHandle(ref: ImageAttachmentRef): `image:${string}`;
/** Admit bounded, canonical image bytes and let AttachmentStore perform full decode validation. */
export declare function admitImageBytes(options: Pick<MediaAdmissionOptions, 'attachments'>, data: Uint8Array, source: AdmittedImage['source'], name?: string, signal?: AbortSignal): Promise<AdmittedImage>;
export declare function admitBase64Image(options: Pick<MediaAdmissionOptions, 'attachments'>, encoded: string, source?: AdmittedImage['source'], name?: string, signal?: AbortSignal): Promise<AdmittedImage>;
/** Resolve one explicit session handle from durable session history; handles are not bearer capabilities. */
export declare function admitSessionImage(options: Pick<MediaAdmissionOptions, 'attachments'>, agent: Agent, handle: string, signal?: AbortSignal): Promise<AdmittedImage>;
/** Resolve an image only after containment and regular-file checks, then admit its bytes. */
export declare function admitWorkspaceImage(options: MediaAdmissionOptions, workspace: string, path: string, signal?: AbortSignal): Promise<AdmittedImage>;
/** Admit an MP4 container without claiming native video attachment support. */
export declare function admitWorkspaceVideo(options: Pick<MediaAdmissionOptions, 'fs'> & {
    readonly maxVideoBytes?: number;
}, workspace: string, path: string, signal?: AbortSignal): Promise<AdmittedVideo>;
export declare function detectImageMediaType(data: Uint8Array): ImageMediaType | undefined;
export declare function isMp4(data: Uint8Array): boolean;
export interface SessionImageCatalogEntry {
    readonly handle: `image:${string}`;
    readonly attachment: ImageAttachmentRef;
    readonly origin: 'user' | 'reference' | 'generated';
    readonly sequence: number;
}
/** Traverse durable session history once for both authorization and image listing. */
export declare function sessionImageCatalog(agent: Agent): readonly SessionImageCatalogEntry[];
//# sourceMappingURL=media-admission.d.ts.map
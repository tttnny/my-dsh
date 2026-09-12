/** Durable, content-addressed AttachmentStore seam used only by explicitly run Gate I. */
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
export type DurableLiveAttachmentStore = Pick<AttachmentStore, 'imageLimits' | 'validateImage' | 'saveImage' | 'saveImages' | 'readImage'>;
export interface DurableLiveAttachmentStoreOptions {
    /** Override process.platform only for deterministic cross-platform tests. */
    readonly platform?: NodeJS.Platform;
}
/** Create a persistent, owner-only PNG store for controlled live image fixtures. */
export declare function createDurableLiveAttachmentStore(root: string, options?: DurableLiveAttachmentStoreOptions): DurableLiveAttachmentStore;
//# sourceMappingURL=live-gate-attachments.d.ts.map
/**
 * Snapshot store engine.
 *
 * DSH 0.1.5-rc.1 seeds `@deepseek-ai/dsh-client-store` directly into the web
 * shell's static module table, so this fork imports it statically. The runtime
 * probe this file used to carry existed only for kernels on either side of the
 * 0.1.2 split (`dsh-client-runtime` no longer publishes past 0.1.1-rc.2); a
 * single-kernel fork does not need it.
 */

import { createSnapshotStore as kernelCreateSnapshotStore } from '@deepseek-ai/dsh-client-store'

export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  update(mutator: (draft: T) => void): void
  set(next: T): void
}

export const createSnapshotStore = kernelCreateSnapshotStore as unknown as <T extends object>(init: T) => SnapshotStore<T>

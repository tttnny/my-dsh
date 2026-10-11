/** Shared race-safe registration lifecycle for one independently gated capability row. */

import type { Context } from '@deepseek-ai/cordis'
import type { AntigravityStatusView, CapabilityRowId } from './status.ts'

export interface CapabilityStatusSource {
  status(): Promise<AntigravityStatusView>
  watchStatus?(listener: () => void): () => void
  dispose?(): Promise<void>
}

export interface CapabilityLifecycleOptions {
  readonly ctx: Context
  readonly auth: CapabilityStatusSource
  readonly id: CapabilityRowId
  readonly enabled: () => boolean
  readonly register: () => (() => void) | undefined
  readonly ownsAuth?: boolean
  readonly cleanup?: () => void | Promise<void>
  readonly label: string
}

export interface CapabilityLifecycle {
  sync(): void
  refresh(): Promise<void>
}

/** Register a capability set atomically and dispose every owned member best-effort. */
export function registerCapabilitySet<T>(
  values: readonly T[],
  register: (value: T) => () => void,
): () => void {
  const disposers: Array<() => void> = []
  const disposeAll = (): void => {
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* continue releasing the rest of the owned set */ }
    }
  }
  try {
    for (const value of values) disposers.push(register(value))
  } catch (error) {
    disposeAll()
    throw error
  }
  return disposeAll
}

export function mountCapabilityLifecycle(options: CapabilityLifecycleOptions): CapabilityLifecycle {
  let gateReady = false
  let registration: (() => void) | undefined
  let generation = 0
  let disposed = false
  const sync = (): void => {
    if (disposed) return
    const shouldRegister = options.enabled() && gateReady
    if (shouldRegister && registration === undefined) {
      try { registration = options.register() } catch { gateReady = false }
    } else if (!shouldRegister && registration !== undefined) {
      const dispose = registration
      registration = undefined
      try { dispose() } catch { /* a broken public disposer cannot retain plugin ownership */ }
    }
  }
  const refresh = async (): Promise<void> => {
    const currentGeneration = ++generation
    let ready = false
    try {
      const status = await options.auth.status()
      ready = status.login.projectAvailable
        && status.capabilities.some(capability => capability.id === options.id && capability.state === 'available')
    } catch {
      ready = false
    }
    if (disposed || currentGeneration !== generation) return
    gateReady = ready
    sync()
  }
  const unwatch = options.auth.watchStatus?.(() => { void refresh() }) ?? (() => {})
  const lifecycle = options.ctx as unknown as { effect?: (setup: () => () => Promise<void>, label?: string) => unknown }
  lifecycle.effect?.(() => async () => {
    if (disposed) return
    disposed = true
    generation += 1
    try { unwatch() } finally {
      const dispose = registration
      registration = undefined
      try { dispose?.() } finally {
        try { await options.cleanup?.() } finally {
          if (options.ownsAuth) await options.auth.dispose?.()
        }
      }
    }
  }, options.label)
  sync()
  void refresh()
  return { sync, refresh }
}

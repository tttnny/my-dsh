/**
 * The settings-owned master switch pauses the model route and all three tool
 * rows together, and reopens them live when the user turns it back on.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAntigravityAuthService } from '../src/auth-service.ts'
import {
  ANTIGRAVITY_MASTER_DEFAULT_ENABLED,
  ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE,
  Config as MasterConfig,
} from '../src/capability-master.ts'
import { apply as applyImage } from '../src/image.ts'
import { apply as applySearch } from '../src/search.ts'
import { createStatusView } from '../src/status.ts'
import { apply as applyVideo } from '../src/video.ts'

type Kind = 'search' | 'image' | 'video'

const CHECKED_AT = '2026-09-10T00:00:00.000Z'

function availableStatus(kind: Kind) {
  return createStatusView(true, { phase: 'success', configured: true, projectAvailable: true }, undefined, undefined, {
    gate0: { outcome: 'passed', checkedAt: CHECKED_AT },
    capabilities: { [kind]: { outcome: 'passed', checkedAt: CHECKED_AT } },
  })
}

async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
}

function rowBench(kind: Kind) {
  let master = false
  const listeners = new Set<() => void>()
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  const register = vi.fn(() => {
    const dispose = vi.fn()
    disposers.push(dispose)
    return dispose
  })
  const auth = {
    credential: vi.fn(),
    status: vi.fn(async () => availableStatus(kind)),
    watchStatus: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    masterEnabled: () => master,
    dispose: vi.fn(),
  }
  const ctx = {
    ...(kind === 'search' ? { web: { registerSearchProvider: register, searchProviderId: undefined as string | undefined } } : {}),
    ...(kind === 'image' ? { tools: { register }, attachments: {}, fs: {} } : {}),
    ...(kind === 'video' ? { tools: { register }, fs: {} } : {}),
    get: vi.fn(() => auth),
    inject: vi.fn(),
    effect: vi.fn((setup: () => () => Promise<void>) => { setup() }),
  }
  const apply = kind === 'search'
    ? () => applySearch(ctx as never, { enabled: true, model: 'antigravity-gemini-3.7-flash', maxResults: 10 })
    : kind === 'image'
      ? () => applyImage(ctx as never, { enabled: true, model: 'antigravity-gemini-3.1-flash-image', n: 1 })
      : () => applyVideo(ctx as never, { enabled: true, model: 'antigravity-gemini-3.7-flash', maxBytes: 1024 })
  return {
    apply,
    register,
    disposers,
    setMaster: (next: boolean) => {
      master = next
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

describe('Antigravity master switch', () => {
  it('registers a paused namespace the client binds by literal', () => {
    expect(ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE).toBe('antigravity-master')
    expect(ANTIGRAVITY_MASTER_DEFAULT_ENABLED).toBe(false)
    expect(MasterConfig({})).toEqual({ enabled: false })
    expect(MasterConfig({ enabled: true })).toEqual({ enabled: true })
  })

  it('reports the resolved switch and leaves a gate-less service enabled', async () => {
    const paused = createAntigravityAuthService({ masterGate: () => false })
    const open = createAntigravityAuthService({ masterGate: () => true })
    const standalone = createAntigravityAuthService()

    expect(paused.masterEnabled()).toBe(false)
    expect(open.masterEnabled()).toBe(true)
    // A row that owns its service has no switch above it and keeps its own gates.
    expect(standalone.masterEnabled()).toBe(true)

    await Promise.all([paused.dispose(), open.dispose(), standalone.dispose()])
  })

  it('publishes a switch change to every capability observer', async () => {
    const service = createAntigravityAuthService({ masterGate: () => true })
    const observed = vi.fn()
    const unwatch = service.watchStatus(observed)

    service.publishMasterGate()
    expect(observed).toHaveBeenCalledOnce()
    unwatch()
    service.publishMasterGate()
    expect(observed).toHaveBeenCalledOnce()

    await service.dispose()
  })

  it.each(['search', 'image', 'video'] as const)(
    'keeps the %s row unregistered while paused and toggles it live',
    async kind => {
      const bench = rowBench(kind)

      bench.apply()
      await settle()
      expect(bench.register).not.toHaveBeenCalled()

      bench.setMaster(true)
      await settle()
      expect(bench.register).toHaveBeenCalled()
      expect(bench.disposers).not.toHaveLength(0)
      expect(bench.disposers.every(dispose => !dispose.mock.calls.length)).toBe(true)

      bench.setMaster(false)
      await settle()
      expect(bench.disposers.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    },
  )
})
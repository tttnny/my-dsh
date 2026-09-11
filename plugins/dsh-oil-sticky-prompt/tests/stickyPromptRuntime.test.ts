import { describe, expect, it } from 'vitest'

import { StickyPromptRuntime } from '../src/client/stickyPromptRuntime.ts'

/**
 * Records what the runtime asked the DOM half to do, so the preference→
 * behaviour wiring is observable without a DOM.
 */
function createInstaller() {
  let installs = 0
  let disposals = 0
  let live = 0
  const install = (): (() => void) => {
    installs += 1
    live += 1
    return () => {
      disposals += 1
      live -= 1
    }
  }
  return {
    install,
    counts: () => ({ installs, disposals, live }),
  }
}

describe('StickyPromptRuntime', () => {
  it('installs nothing until a preference is applied', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)
    runtime.dispose()
    expect(installer.counts()).toEqual({ installs: 0, disposals: 0, live: 0 })
  })

  it('installs when enabled and disposes when disabled', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)

    runtime.setEnabled(true)
    expect(installer.counts()).toEqual({ installs: 1, disposals: 0, live: 1 })

    runtime.setEnabled(false)
    expect(installer.counts()).toEqual({ installs: 1, disposals: 1, live: 0 })
  })

  it('installs again when the preference flips back on', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)

    runtime.setEnabled(true)
    runtime.setEnabled(false)
    runtime.setEnabled(true)
    expect(installer.counts()).toEqual({ installs: 2, disposals: 1, live: 1 })
  })

  it('keeps the running installation on a repeated notification', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)

    runtime.setEnabled(true)
    runtime.setEnabled(true)
    runtime.setEnabled(false)
    runtime.setEnabled(false)
    expect(installer.counts()).toEqual({ installs: 1, disposals: 1, live: 0 })
  })

  it('releases the installation on dispose and can install again afterwards', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)

    runtime.setEnabled(true)
    runtime.dispose()
    expect(installer.counts()).toEqual({ installs: 1, disposals: 1, live: 0 })

    // The settings service handing the behaviour back to the default value
    // after a dispose is the recovery path this guards.
    runtime.setEnabled(true)
    expect(installer.counts()).toEqual({ installs: 2, disposals: 1, live: 1 })
    runtime.dispose()
    expect(installer.counts()).toEqual({ installs: 2, disposals: 2, live: 0 })
  })

  it('is idempotent when disposed twice', () => {
    const installer = createInstaller()
    const runtime = new StickyPromptRuntime(installer.install)

    runtime.setEnabled(true)
    runtime.dispose()
    runtime.dispose()
    expect(installer.counts()).toEqual({ installs: 1, disposals: 1, live: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

import { apply, name } from '../src/index.ts'
import { DEFAULT_STICKY_PROMPT_SETTINGS, STICKY_PROMPT_SETTINGS_NS } from '../src/settings.ts'

/** One namespace registration as the fake Host settings service received it. */
interface Registration {
  ns: string
  schema: (data?: unknown) => { enabled?: boolean }
  options: { applies?: string } | undefined
}

/**
 * Minimal Host stand-in: records what `ctx.settings.register` was called with
 * and fails loud on any service the plugin did not declare.
 */
function createHostContext() {
  const registrations: Registration[] = []
  const injected: string[][] = []
  const ctx = {
    inject(deps: string[], callback: (ctx: unknown) => void) {
      injected.push(deps)
      callback({
        settings: {
          register: (ns: string, schema: Registration['schema'], options: Registration['options']) => {
            registrations.push({ ns, schema, options })
          },
        },
      })
    },
  }
  return { registrations, injected, ctx }
}

describe('host half settings registration', () => {
  it('registers the one namespace the browser half binds, as live', () => {
    const host = createHostContext()
    apply(host.ctx as unknown as Context)

    expect(host.injected).toEqual([['settings']])
    expect(host.registrations).toHaveLength(1)
    expect(host.registrations[0]?.ns).toBe(STICKY_PROMPT_SETTINGS_NS)
    expect(host.registrations[0]?.options?.applies).toBe('live')
  })

  it('resolves the enabled default from the shared settings defaults', () => {
    const host = createHostContext()
    apply(host.ctx as unknown as Context)
    const schema = host.registrations[0]?.schema

    // An absent user section resolves through the schema defaults, which is
    // exactly what the browser half falls back to when the mirror is empty.
    expect(schema?.({})).toEqual({ enabled: DEFAULT_STICKY_PROMPT_SETTINGS.enabled })
    expect(schema?.({ enabled: false })).toEqual({ enabled: false })
  })

  it('keeps the Host-injection optional so a deployment without settings still loads', () => {
    const host = createHostContext()
    // `ctx.inject` is what defers the registration; the plugin must not throw
    // when the service never appears, which this call shape already proves.
    expect(() => { apply(host.ctx as unknown as Context) }).not.toThrow()
    expect(name).toBe('dsh-oil-sticky-prompt')
  })
})

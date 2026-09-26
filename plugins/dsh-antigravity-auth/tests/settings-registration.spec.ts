import { describe, expect, it, vi } from 'vitest'
import {
  ANTIGRAVITY_IMAGE_ENTRY_ID,
  Config as ImageConfig,
  apply as applyImage,
} from '../src/image.ts'
import {
  ANTIGRAVITY_SEARCH_ENTRY_ID,
  Config as SearchConfig,
  apply as applySearch,
  type AntigravitySearchSettings,
} from '../src/search.ts'
import {
  ANTIGRAVITY_VIDEO_ENTRY_ID,
  Config as VideoConfig,
  apply as applyVideo,
} from '../src/video.ts'
import { createStatusView } from '../src/status.ts'

function bench(kind: 'search' | 'image' | 'video') {
  const configure = vi.fn(() => () => {})
  const auth = {
    status: vi.fn(async () => createStatusView(false, {
      phase: 'idle',
      configured: false,
      projectAvailable: false,
    })),
    watchStatus: vi.fn(() => vi.fn()),
    masterEnabled: () => true,
    dispose: vi.fn(),
  }
  const ctx = {
    ...(kind === 'search' ? { web: { registerSearchProvider: vi.fn() } } : {}),
    ...(kind === 'image' ? { tools: { register: vi.fn() }, attachments: {}, fs: {} } : {}),
    ...(kind === 'video' ? { tools: { register: vi.fn() }, fs: {} } : {}),
    get: vi.fn(() => auth),
    inject: vi.fn((dependencies: readonly string[], callback: (injected: unknown) => unknown) => {
      if (dependencies.length === 1 && dependencies[0] === 'settings') {
        return callback({
          settings: { configure },
          effect: vi.fn((setup: () => () => void) => setup()),
        })
      }
      throw new Error(`unexpected injection: ${dependencies.join(',')}`)
    }),
    on: vi.fn(() => () => {}),
    effect: vi.fn((setup: () => () => Promise<void>) => setup()),
  }
  return { ctx, configure }
}

describe('Host settings registration', () => {
  it.each([
    {
      kind: 'search' as const,
      entry: ANTIGRAVITY_SEARCH_ENTRY_ID,
      schema: SearchConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.7-flash', maxResults: 10 },
      apply: applySearch,
    },
    {
      kind: 'image' as const,
      entry: ANTIGRAVITY_IMAGE_ENTRY_ID,
      schema: ImageConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.1-flash-image', n: 1 },
      apply: applyImage,
    },
    {
      kind: 'video' as const,
      entry: ANTIGRAVITY_VIDEO_ENTRY_ID,
      schema: VideoConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.7-flash', maxBytes: 1024 },
      apply: applyVideo,
    },
  ])('projects the $kind row config as a live settings form', fixture => {
    const { ctx, configure } = bench(fixture.kind)
    // The literal the client binds must match the profile entry id the Host
    // row declares, because that id is the settings namespace.
    expect(fixture.entry).toBe(`antigravity-${fixture.kind}`)

    // The fixture table is a union of rows, so the row's own apply signature is
    // narrowed here rather than intersected across every kind.
    const applyRow = fixture.apply as (ctx: unknown, config: unknown) => void
    applyRow(ctx, fixture.schema(fixture.config))

    // Every field is volatile, which is what makes the entry eligible for a
    // schema-derived form and lets the loader commit an edit without a reload.
    expect(Object.values(fixture.schema.dict ?? {}).every(field => field.meta.volatile === true)).toBe(true)
    expect(configure).toHaveBeenCalledOnce()
    expect(configure).toHaveBeenCalledWith({ auto: true }, undefined)
  })

  it('keeps an active Search provider bound to the live Settings source', async () => {
    const registerSearchProvider = vi.fn()
    const auth = {
      credential: vi.fn(),
      status: vi.fn(async () => ({
        plugin: 'dsh-antigravity-auth',
        mode: 'private-single-account',
        riskAcknowledged: true,
        login: { phase: 'success', configured: true, projectAvailable: true },
        capabilities: [{ id: 'search', state: 'available', reasonCode: 'capability-ready' }],
      })),
      watchStatus: vi.fn(() => vi.fn()),
      masterEnabled: () => true,
      dispose: vi.fn(),
    }
    let model = 'initial-model'
    const ctx = {
      web: { registerSearchProvider },
      get: vi.fn(() => auth),
      inject: vi.fn(),
      on: vi.fn(() => () => {}),
      effect: vi.fn((setup: () => () => Promise<void>) => setup()),
    }
    const config = {
      enabled: { get: () => true },
      model: { get: () => model },
      maxResults: { get: () => 10 },
    }

    applySearch(ctx as never, config)
    await new Promise<void>(resolve => setImmediate(resolve))
    const provider = registerSearchProvider.mock.calls[0]?.[0] as unknown as {
      options: { settings?: () => AntigravitySearchSettings }
    }
    expect(provider.options.settings?.()).toEqual({ enabled: true, model: 'initial-model', maxResults: 10 })

    // The loader commits a volatile edit in place, so the provider sees it
    // without a re-registration.
    model = 'replacement-model'
    expect(provider.options.settings?.()).toEqual({ enabled: true, model: 'replacement-model', maxResults: 10 })
  })
})

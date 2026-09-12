import { describe, expect, it, vi } from 'vitest'
import {
  ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE,
  Config as ImageConfig,
  apply as applyImage,
} from '../src/image.ts'
import {
  ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE,
  Config as SearchConfig,
  apply as applySearch,
  type AntigravitySearchSettings,
} from '../src/search.ts'
import {
  ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE,
  Config as VideoConfig,
  apply as applyVideo,
} from '../src/video.ts'
import { createStatusView } from '../src/status.ts'

function bench(kind: 'search' | 'image' | 'video') {
  const installSection = vi.fn()
  const auth = {
    status: vi.fn(async () => createStatusView(false, {
      phase: 'idle',
      configured: false,
      projectAvailable: false,
    })),
    watchStatus: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
  }
  const ctx = {
    ...(kind === 'search' ? { web: { registerSearchProvider: vi.fn() } } : {}),
    ...(kind === 'image' ? { tools: { register: vi.fn() }, attachments: {}, fs: {} } : {}),
    ...(kind === 'video' ? { tools: { register: vi.fn() }, fs: {} } : {}),
    get: vi.fn(() => auth),
    inject: vi.fn((dependencies: readonly string[], callback: (injected: unknown) => unknown) => {
      if (dependencies.length === 1 && dependencies[0] === 'settings') {
        return callback({ settings: { installSection } })
      }
      throw new Error(`unexpected injection: ${dependencies.join(',')}`)
    }),
    effect: vi.fn((setup: () => () => Promise<void>) => setup()),
  }
  return { ctx, installSection }
}

describe('alpha.5 Host Settings registration', () => {
  it.each([
    {
      kind: 'search' as const,
      namespace: ANTIGRAVITY_SEARCH_SETTINGS_NAMESPACE,
      schema: SearchConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.7-flash', maxResults: 10 },
      apply: applySearch,
    },
    {
      kind: 'image' as const,
      namespace: ANTIGRAVITY_IMAGE_SETTINGS_NAMESPACE,
      schema: ImageConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.1-flash-image', n: 1 },
      apply: applyImage,
    },
    {
      kind: 'video' as const,
      namespace: ANTIGRAVITY_VIDEO_SETTINGS_NAMESPACE,
      schema: VideoConfig,
      config: { enabled: true, model: 'antigravity-gemini-3.7-flash', maxBytes: 1024 },
      apply: applyVideo,
    },
  ])('installs the $kind section through ctx.settings.installSection()', fixture => {
    const { ctx, installSection } = bench(fixture.kind)

    fixture.apply(ctx as never, fixture.config as never)

    expect(installSection).toHaveBeenCalledOnce()
    expect(installSection).toHaveBeenCalledWith(
      ctx,
      fixture.namespace,
      fixture.schema,
      fixture.config,
      expect.objectContaining({
        setSource: expect.any(Function),
        onChange: expect.any(Function),
      }),
    )
  })

  it('keeps an active Search provider bound to a replaced Settings source', async () => {
    let hooks: { setSource(source: () => AntigravitySearchSettings): void; onChange(): void } | undefined
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
      dispose: vi.fn(),
    }
    const initial: AntigravitySearchSettings = { enabled: true, model: 'initial-model', maxResults: 10 }
    const replacement: AntigravitySearchSettings = { enabled: true, model: 'replacement-model', maxResults: 5 }
    const ctx = {
      web: { registerSearchProvider },
      get: vi.fn(() => auth),
      inject: vi.fn((_dependencies: readonly string[], callback: (injected: unknown) => unknown) => callback({
        settings: {
          installSection: (
            _owner: unknown,
            _namespace: string,
            _schema: unknown,
            _entry: unknown,
            installedHooks: typeof hooks,
          ) => {
            hooks = installedHooks
            hooks?.setSource(() => initial)
            hooks?.onChange()
          },
        },
      })),
      effect: vi.fn((setup: () => () => Promise<void>) => setup()),
    }

    applySearch(ctx as never, initial)
    await new Promise<void>(resolve => setImmediate(resolve))
    const provider = registerSearchProvider.mock.calls[0]?.[0] as unknown as {
      options: { settings?: () => AntigravitySearchSettings }
    }
    expect(provider.options.settings?.()).toEqual(initial)

    hooks?.setSource(() => replacement)

    expect(provider.options.settings?.()).toEqual(replacement)
  })
})

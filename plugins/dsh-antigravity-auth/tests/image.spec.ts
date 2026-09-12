import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  createAntigravityImageTools,
  type AntigravityImageToolOptions,
} from '../src/image.ts'
import { PrivateTransportError, type PrivateTransportRequest } from '../src/private-transport.ts'

vi.mock('../src/media-admission.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/media-admission.ts')>()
  return {
    ...actual,
    admitBase64Image: vi.fn(async (...args: Parameters<typeof actual.admitBase64Image>) => {
      const [options, _encoded, source, name, signal] = args
      return actual.admitImageBytes(options, png, source ?? 'inline', name, signal)
    }),
  }
})

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const agent = { session: { header: { cwd: '/workspace' }, snapshotEvents: () => [] } } as never
const exec = { agent, signal: new AbortController().signal } as unknown as ToolRunContext

function imageResponse(mediaType = 'image/png'): Response {
  return new Response(JSON.stringify({ response: { parts: [{ inlineData: { data: 'synthetic-provider-image', mimeType: mediaType } }] } }))
}

function options(transport: AntigravityImageToolOptions['transport']): AntigravityImageToolOptions {
  let sequence = 0
  return {
    auth: { credential: vi.fn(async () => ({ accessToken: 'opaque-test-value', refreshToken: 'opaque-refresh-value', expiresAt: 0, projectId: 'project-id' })) },
    attachments: {
      imageLimits: {
        maxImageBytes: 1024,
        maxImagesPerMessage: 4,
        maxMessageImageBytes: 4096,
        maxImagePixels: 16_000_000,
        maxImageDimension: 4096,
        mediaTypes: ['image/png'],
      },
      validateImage: vi.fn(async () => {}),
      saveImage: vi.fn(async input => ({
        attachmentId: `generated-${String(++sequence)}` as never,
        mediaType: input.mediaType,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
      })),
      readImage: vi.fn(),
    },
    fs: {
      resolve: vi.fn(),
      contains: vi.fn(),
      readBytes: vi.fn(),
      lstat: vi.fn(),
      stat: vi.fn(),
    },
    ...(transport === undefined ? {} : { transport }),
  }
}

describe('Antigravity image tools', () => {
  it('implements n greater than one as explicit independent requests', async () => {
    const request = vi.fn(async (_input: PrivateTransportRequest) => imageResponse())
    const tool = createAntigravityImageTools(options({ request }))[0]!

    const result = await tool.execute({ prompt: 'draw a moon', n: 2 }, exec) as { images: unknown[]; warnings: unknown[] }

    expect(request).toHaveBeenCalledTimes(2)
    expect(result.images).toHaveLength(2)
    expect(result.warnings).toEqual([])
    for (const [input] of request.mock.calls) {
      const body = JSON.parse(String(input.body)) as { request: { generationConfig: Record<string, unknown> } }
      expect(body.request.generationConfig).not.toHaveProperty('candidateCount')
    }
  })

  it('rejects a declared MIME that contradicts admitted magic bytes while preserving other successes', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(imageResponse('image/png'))
      .mockResolvedValueOnce(imageResponse('image/jpeg'))
    const tool = createAntigravityImageTools(options({ request }))[0]!

    const result = await tool.execute({ prompt: 'draw a moon', n: 2 }, exec) as { images: unknown[]; warnings: unknown[] }

    expect(request).toHaveBeenCalledTimes(2)
    expect(result.images).toHaveLength(1)
    expect(result.warnings).toEqual([{ index: 1, code: 'IMAGE_MIME_MISMATCH' }])
  })

  it('returns partial success with a value-free warning and never retries a failed request', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(imageResponse())
      .mockRejectedValueOnce(new PrivateTransportError('rate-limited', 'provider detail', { accepted: true }))
    const tool = createAntigravityImageTools(options({ request }))[0]!

    const result = await tool.execute({ prompt: 'draw a moon', n: 2 }, exec) as { images: unknown[]; warnings: unknown[] }

    expect(request).toHaveBeenCalledTimes(2)
    expect(result.images).toHaveLength(1)
    expect(result.warnings).toEqual([{ index: 1, code: 'IMAGE_REQUEST_RATE_LIMITED' }])
    expect(JSON.stringify(result)).not.toContain('provider detail')
  })

  it('lists only image handles authorized by nested public session content', async () => {
    const attachment = { attachmentId: 'session-image' as never, mediaType: 'image/png' as const, bytes: png.byteLength, width: 1, height: 1, leaked: 'forbidden-media-payload' }
    const sessionAgent = {
      session: {
        header: { cwd: '/workspace' },
        snapshotEvents: () => [{ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'call', content: [{ type: 'image', attachment }] }] } } }],
      },
    } as never
    const listExec = { agent: sessionAgent, signal: new AbortController().signal } as unknown as ToolRunContext
    const tool = createAntigravityImageTools(options({ request: vi.fn() }))[1]!

    const result = await tool.execute({ limit: 5 }, listExec) as { items: Array<{ handle: string; origin: string }> }

    expect(result.items).toEqual([expect.objectContaining({ handle: 'image:session-image', origin: 'generated' })])
    expect(JSON.stringify(result)).not.toContain('forbidden-media-payload')
  })
})

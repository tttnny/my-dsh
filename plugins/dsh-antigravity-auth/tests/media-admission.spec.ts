import { describe, expect, it, vi } from 'vitest'
import { admitBase64Image, admitImageBytes, admitWorkspaceImage, detectImageMediaType, isMp4, MediaAdmissionError } from '../src/media-admission.ts'
import type { MediaAdmissionOptions } from '../src/media-admission.ts'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const attachments = {
  imageLimits: { maxImageBytes: 1024, maxImagesPerMessage: 4, maxMessageImageBytes: 4096, maxImagePixels: 4_000_000, maxImageDimension: 4096, mediaTypes: ['image/png'] as const },
  validateImage: vi.fn(async () => {}),
  saveImage: vi.fn(async () => ({ attachmentId: 'image-id' as never, mediaType: 'image/png' as const, bytes: png.byteLength, width: 1, height: 1 })),
  readImage: vi.fn(),
}

const fsRaw = {
  resolve: vi.fn(async (path: string) => ({ targetKey: path as never, displayPath: path })),
  contains: vi.fn(() => true),
  readBytes: vi.fn(async () => png),
  lstat: vi.fn(async (): Promise<{ type: 'file'; version: never }> => ({ type: 'file', version: 'v' as never })),
  stat: vi.fn(async (): Promise<{ type: 'file'; version: never }> => ({ type: 'file', version: 'v' as never })),
}
const fs = fsRaw as unknown as MediaAdmissionOptions['fs']

describe('Host media admission', () => {
  it('checks image magic bytes before AttachmentStore validation and rejects malformed encoding', async () => {
    expect(detectImageMediaType(png)).toBe('image/png')
    expect(detectImageMediaType(new Uint8Array([1, 2, 3]))).toBeUndefined()
    const admitted = await admitImageBytes({ attachments }, png, 'inline')
    expect(admitted.input.mediaType).toBe('image/png')
    await expect(admitBase64Image({ attachments }, 'malformed-encoding')).rejects.toMatchObject({ code: 'MEDIA_IMAGE_INVALID' })
    expect(attachments.validateImage).toHaveBeenCalledOnce()
  })

  it('requires workspace containment and rejects non-image bytes', async () => {
    await expect(admitWorkspaceImage({ attachments, fs }, '/workspace', 'image.png')).resolves.toMatchObject({ source: 'workspace' })
    fsRaw.contains.mockReturnValueOnce(false)
    await expect(admitWorkspaceImage({ attachments, fs }, '/workspace', '../outside.png')).rejects.toMatchObject({ code: 'MEDIA_WORKSPACE_CONTAINMENT' })
    const badFs = { ...fsRaw, readBytes: vi.fn(async () => new Uint8Array([1, 2, 3])) } as unknown as MediaAdmissionOptions['fs']
    await expect(admitWorkspaceImage({ attachments, fs: badFs }, '/workspace', 'bad.png')).rejects.toBeInstanceOf(MediaAdmissionError)
  })

  it('rejects symlinks and a workspace target replaced during the bounded read', async () => {
    const symlinkFs = {
      ...fsRaw,
      lstat: vi.fn(async () => ({ type: 'symlink' as const, version: 'link' as never })),
      readBytes: vi.fn(async () => png),
    } as unknown as MediaAdmissionOptions['fs']
    await expect(admitWorkspaceImage({ attachments, fs: symlinkFs }, '/workspace', 'link.png')).rejects.toMatchObject({ code: 'MEDIA_WORKSPACE_SYMLINK' })
    expect(symlinkFs.readBytes).not.toHaveBeenCalled()

    const replacingFs = {
      ...fsRaw,
      lstat: vi.fn()
        .mockResolvedValueOnce({ type: 'file' as const, version: 'v1' as never })
        .mockResolvedValueOnce({ type: 'file' as const, version: 'v2' as never }),
      stat: vi.fn()
        .mockResolvedValueOnce({ type: 'file' as const, version: 'v1' as never })
        .mockResolvedValueOnce({ type: 'file' as const, version: 'v2' as never }),
      readBytes: vi.fn(async () => png),
    } as unknown as MediaAdmissionOptions['fs']
    await expect(admitWorkspaceImage({ attachments, fs: replacingFs }, '/workspace', 'image.png')).rejects.toMatchObject({ code: 'MEDIA_WORKSPACE_CHANGED' })
  })

  it('recognizes the MP4 container marker for the gated video POC', () => {
    expect(isMp4(new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]))).toBe(true)
    expect(isMp4(png)).toBe(false)
  })
})

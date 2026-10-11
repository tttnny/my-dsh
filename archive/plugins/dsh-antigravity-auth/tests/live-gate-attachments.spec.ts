import { Buffer } from 'node:buffer'
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { createDurableLiveAttachmentStore } from '../src/live-gate-attachments.ts'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

function syntheticPng(width = 2, height = 3): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const scanlines = Buffer.alloc((1 + width * 4) * height)
  for (let row = 0; row < height; row += 1) scanlines[row * (1 + width * 4)] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(12 + data.byteLength)
  output.writeUInt32BE(data.byteLength, 0)
  name.copy(output, 4)
  Buffer.from(data).copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([name, Buffer.from(data)])), 8 + data.byteLength)
  return output
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

describe('durable live-gate AttachmentStore seam', () => {
  it('persists a decoded immutable PNG reference that a fresh store instance can verify', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-live-attachments-'))
    roots.push(root)
    const first = createDurableLiveAttachmentStore(root)
    const data = syntheticPng()

    const ref = await first.saveImage({ data, mediaType: 'image/png', name: 'controlled-output.png' })
    expect(ref).toMatchObject({ mediaType: 'image/png', bytes: data.byteLength, width: 2, height: 3 })
    expect(String(ref.attachmentId)).not.toContain(root)

    const second = createDurableLiveAttachmentStore(root)
    await expect(second.readImage(ref)).resolves.toMatchObject({ ref })
    const stored = await second.readImage(ref)
    expect([...stored.data]).toEqual([...data])
    if (process.platform !== 'win32') {
      expect((await stat(join(root, `${String(ref.attachmentId).slice('live-sha256-'.length)}.png`))).mode & 0o077).toBe(0)
    }
  })

  it('ignores POSIX mode bits on Windows while preserving strict POSIX enforcement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-live-attachments-'))
    roots.push(root)
    const windowsStore = createDurableLiveAttachmentStore(root, { platform: 'win32' })
    const ref = await windowsStore.saveImage({ data: syntheticPng(), mediaType: 'image/png' })
    const path = join(root, `${String(ref.attachmentId).slice('live-sha256-'.length)}.png`)
    await chmod(path, 0o666)

    await expect(windowsStore.readImage(ref)).resolves.toMatchObject({ ref })
    await expect(createDurableLiveAttachmentStore(root, { platform: 'linux' }).readImage(ref))
      .rejects.toThrow(/could not be admitted/u)
  })

  it('rejects malformed, CRC-corrupt, truncated, or non-PNG live outputs before persistence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-antigravity-live-attachments-'))
    roots.push(root)
    const store = createDurableLiveAttachmentStore(root)
    const valid = syntheticPng()
    const corrupt = Uint8Array.from(valid)
    corrupt[corrupt.length - 5] = corrupt[corrupt.length - 5]! ^ 0xff

    await expect(store.saveImage({ data: new Uint8Array([1, 2, 3]), mediaType: 'image/png' })).rejects.toThrow(/could not be admitted/u)
    await expect(store.saveImage({ data: valid.slice(0, -3), mediaType: 'image/png' })).rejects.toThrow(/could not be admitted/u)
    await expect(store.saveImage({ data: corrupt, mediaType: 'image/png' })).rejects.toThrow(/could not be admitted/u)
    await expect(store.saveImage({ data: valid, mediaType: 'image/jpeg' })).rejects.toThrow(/could not be admitted/u)
  })
})

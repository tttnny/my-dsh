/** Durable, content-addressed AttachmentStore seam used only by explicitly run Gate I. */

import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, link, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import type {
  AttachmentStore,
  ImageAttachmentRef,
  SaveImageAttachment,
  StoredImageAttachment,
} from '@deepseek-ai/dsh-attachment'
import { isBoundedSafeText } from './safe-text.ts'

const MAX_LIVE_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_LIVE_IMAGE_DIMENSION = 16_384
const MAX_LIVE_IMAGE_PIXELS = 16 * 1024 * 1024
const MAX_DECODED_IMAGE_BYTES = 64 * 1024 * 1024
const ID_PREFIX = 'live-sha256-'
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export type DurableLiveAttachmentStore = Pick<
  AttachmentStore,
  'imageLimits' | 'validateImage' | 'saveImage' | 'saveImages' | 'readImage'
>

export interface DurableLiveAttachmentStoreOptions {
  /** Override process.platform only for deterministic cross-platform tests. */
  readonly platform?: NodeJS.Platform
}

/** Create a persistent, owner-only PNG store for controlled live image fixtures. */
export function createDurableLiveAttachmentStore(
  root: string,
  options: DurableLiveAttachmentStoreOptions = {},
): DurableLiveAttachmentStore {
  const platform = options.platform ?? process.platform
  const imageLimits = Object.freeze({
    maxImageBytes: MAX_LIVE_IMAGE_BYTES,
    maxImagesPerMessage: 2,
    maxMessageImageBytes: MAX_LIVE_IMAGE_BYTES * 2,
    maxImagePixels: MAX_LIVE_IMAGE_PIXELS,
    maxImageDimension: MAX_LIVE_IMAGE_DIMENSION,
    mediaTypes: Object.freeze(['image/png'] as const),
  })

  const validateImage = async (input: SaveImageAttachment): Promise<void> => {
    inspectPng(input)
  }

  const saveImage = async (input: SaveImageAttachment): Promise<ImageAttachmentRef> => {
    const dimensions = inspectPng(input)
    await ensureRoot(root)
    const data = Uint8Array.from(input.data)
    const digest = createHash('sha256').update(data).digest('hex')
    const target = join(root, `${digest}.png`)
    const temporary = join(root, `.${digest}.${process.pid}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
      try { await link(temporary, target) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const existing = await readBounded(target, platform)
        if (createHash('sha256').update(existing).digest('hex') !== digest) throw new Error('collision')
      }
      await chmod(target, 0o600)
    } catch {
      throw admissionError()
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    return {
      attachmentId: `${ID_PREFIX}${digest}` as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/png',
      bytes: data.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      ...(input.name === undefined ? {} : { name: safeName(input.name) }),
    }
  }

  const readImage = async (ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment> => {
    signal?.throwIfAborted()
    const id = String(ref.attachmentId)
    const digest = id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : ''
    if (!/^[a-f0-9]{64}$/u.test(digest) || ref.mediaType !== 'image/png') throw admissionError()
    let data: Uint8Array
    try { data = await readBounded(join(root, `${digest}.png`), platform) } catch { throw admissionError() }
    signal?.throwIfAborted()
    if (createHash('sha256').update(data).digest('hex') !== digest) throw admissionError()
    const dimensions = inspectPng({ data, mediaType: 'image/png' })
    if (ref.bytes !== data.byteLength || ref.width !== dimensions.width || ref.height !== dimensions.height) throw admissionError()
    return { ref: { ...ref }, data: Uint8Array.from(data) }
  }

  return {
    imageLimits,
    validateImage,
    saveImage,
    saveImages: async inputs => {
      for (const input of inputs) await validateImage(input)
      const output: ImageAttachmentRef[] = []
      for (const input of inputs) output.push(await saveImage(input))
      return output
    },
    readImage,
  }
}

function inspectPng(input: SaveImageAttachment): { width: number; height: number } {
  try { return decodePng(input) } catch { throw admissionError() }
}

function decodePng(input: SaveImageAttachment): { width: number; height: number } {
  const data = input.data
  if (input.mediaType !== 'image/png' || data.byteLength < 57 || data.byteLength > MAX_LIVE_IMAGE_BYTES) throw new Error('invalid PNG')
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (data[index] !== PNG_SIGNATURE[index]) throw new Error('invalid PNG signature')
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let channels = 0
  let sawHeader = false
  let sawData = false
  let sawEnd = false
  const compressed: Uint8Array[] = []
  while (offset < data.byteLength) {
    if (offset + 12 > data.byteLength) throw new Error('truncated PNG chunk')
    const length = view.getUint32(offset)
    const typeOffset = offset + 4
    const payloadOffset = offset + 8
    const end = payloadOffset + length
    if (length > MAX_LIVE_IMAGE_BYTES || end + 4 > data.byteLength) throw new Error('oversized PNG chunk')
    const type = String.fromCharCode(data[typeOffset]!, data[typeOffset + 1]!, data[typeOffset + 2]!, data[typeOffset + 3]!)
    if (!/^[A-Za-z]{4}$/u.test(type) || view.getUint32(end) !== crc32(data.subarray(typeOffset, end))) throw new Error('invalid PNG chunk')
    const payload = data.subarray(payloadOffset, end)
    if (!sawHeader && type !== 'IHDR') throw new Error('missing PNG header')
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error('duplicate PNG header')
      width = view.getUint32(payloadOffset)
      height = view.getUint32(payloadOffset + 4)
      const bitDepth = data[payloadOffset + 8]
      const colorType = data[payloadOffset + 9]
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)
        || data[payloadOffset + 10] !== 0 || data[payloadOffset + 11] !== 0 || data[payloadOffset + 12] !== 0) {
        throw new Error('unsupported PNG encoding')
      }
      channels = colorType === 6 ? 4 : 3
      if (width < 1 || height < 1 || width > MAX_LIVE_IMAGE_DIMENSION || height > MAX_LIVE_IMAGE_DIMENSION
        || width * height > MAX_LIVE_IMAGE_PIXELS) throw new Error('invalid PNG dimensions')
      sawHeader = true
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd || length === 0) throw new Error('invalid PNG data')
      sawData = true
      compressed.push(payload)
    } else if (type === 'IEND') {
      if (!sawData || sawEnd || length !== 0 || end + 4 !== data.byteLength) throw new Error('invalid PNG end')
      sawEnd = true
    } else if (type[0] === type[0]?.toUpperCase() && type !== 'PLTE') {
      throw new Error('unknown critical PNG chunk')
    }
    offset = end + 4
  }
  if (!sawHeader || !sawData || !sawEnd || offset !== data.byteLength) throw new Error('incomplete PNG')
  const rowBytes = width * channels
  const decodedBytes = (rowBytes + 1) * height
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes > MAX_DECODED_IMAGE_BYTES) throw new Error('oversized decoded PNG')
  const decoded = inflateSync(Buffer.concat(compressed.map(part => Buffer.from(part))), { maxOutputLength: decodedBytes + 1 })
  if (decoded.byteLength !== decodedBytes) throw new Error('invalid decoded PNG length')
  for (let row = 0; row < height; row += 1) {
    if (decoded[row * (rowBytes + 1)]! > 4) throw new Error('invalid PNG row filter')
  }
  return { width, height }
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function ensureRoot(root: string): Promise<void> {
  try {
    await mkdir(root, { recursive: true, mode: 0o700 })
    const info = await lstat(root)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('unsafe root')
    await chmod(root, 0o700)
  } catch {
    throw admissionError()
  }
}

async function readBounded(path: string, platform: NodeJS.Platform): Promise<Uint8Array> {
  const info = await lstat(path)
  const unsafePosixMode = platform !== 'win32' && (info.mode & 0o077) !== 0
  if (info.isSymbolicLink() || !info.isFile() || info.size < 1 || info.size > MAX_LIVE_IMAGE_BYTES || unsafePosixMode) {
    throw admissionError()
  }
  const data = await readFile(path)
  if (data.byteLength !== info.size) throw admissionError()
  return data
}

function safeName(value: string): string {
  const name = value.replaceAll('\\', '/').split('/').at(-1)?.slice(0, 128)
  return name !== undefined && isBoundedSafeText(name, 128) ? name : 'live-gate-output.png'
}

function admissionError(): Error {
  return new Error('The live image output could not be admitted durably')
}

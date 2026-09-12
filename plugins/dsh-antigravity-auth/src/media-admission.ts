/** Shared Host-only media admission for image editing and the video POC. */

import { Buffer } from 'node:buffer'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {
  AttachmentStore,
  ImageAttachmentRef,
  ImageMediaType,
  SaveImageAttachment,
  StoredImageAttachment,
} from '@deepseek-ai/dsh-attachment'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { isBoundedSafeText } from './safe-text.ts'

export const DEFAULT_VIDEO_BYTES = 32 * 1024 * 1024
export const DEFAULT_INLINE_IMAGE_BYTES = 20 * 1024 * 1024
export const IMAGE_HANDLE_PATTERN = /^image:[^\s\p{C}]{1,256}$/u

export type MediaKind = 'image' | 'video'

export interface MediaAdmissionErrorOptions {
  readonly cause?: unknown
}

export class MediaAdmissionError extends HarnessError {
  constructor(message: string, code: string, options: MediaAdmissionErrorOptions = {}) {
    super(message, code, options)
  }
}

export interface MediaAdmissionOptions {
  readonly attachments: Pick<AttachmentStore, 'imageLimits' | 'validateImage' | 'saveImage' | 'readImage'>
  readonly fs: Pick<FileSystem, 'resolve' | 'contains' | 'readBytes' | 'lstat' | 'stat'>
  readonly maxVideoBytes?: number
}

export interface AdmittedImage {
  readonly kind: 'image'
  readonly input: SaveImageAttachment
  readonly stored?: StoredImageAttachment
  readonly source: 'session' | 'workspace' | 'inline'
}

export interface AdmittedVideo {
  readonly kind: 'video'
  readonly data: Uint8Array
  readonly mediaType: 'video/mp4'
}

export function imageHandle(ref: ImageAttachmentRef): `image:${string}` {
  return `image:${String(ref.attachmentId)}`
}

/** Admit bounded, canonical image bytes and let AttachmentStore perform full decode validation. */
export async function admitImageBytes(
  options: Pick<MediaAdmissionOptions, 'attachments'>,
  data: Uint8Array,
  source: AdmittedImage['source'],
  name = 'antigravity-image',
  signal?: AbortSignal,
): Promise<AdmittedImage> {
  throwIfAborted(signal)
  const limits = options.attachments.imageLimits
  if (data.byteLength === 0 || data.byteLength > limits.maxImageBytes) {
    throw new MediaAdmissionError('The image exceeds the deployment byte limit', 'MEDIA_IMAGE_TOO_LARGE')
  }
  const mediaType = detectImageMediaType(data)
  if (mediaType === undefined || !limits.mediaTypes.includes(mediaType)) {
    throw new MediaAdmissionError('The image media type or magic bytes are not supported', 'MEDIA_IMAGE_INVALID')
  }
  const input: SaveImageAttachment = {
    data,
    mediaType,
    name: safeName(name),
  }
  try {
    await options.attachments.validateImage(input)
  } catch {
    throw new MediaAdmissionError('The image failed AttachmentStore admission', 'MEDIA_IMAGE_INVALID')
  }
  return { kind: 'image', input, source }
}

export async function admitBase64Image(
  options: Pick<MediaAdmissionOptions, 'attachments'>,
  encoded: string,
  source: AdmittedImage['source'] = 'inline',
  name?: string,
  signal?: AbortSignal,
): Promise<AdmittedImage> {
  const maxEncoded = Math.ceil(options.attachments.imageLimits.maxImageBytes / 3) * 4 + 4
  if (encoded.length === 0 || encoded.length > maxEncoded || !isCanonicalBase64(encoded)) {
    throw new MediaAdmissionError('The encoded image is not bounded canonical base64', 'MEDIA_IMAGE_INVALID')
  }
  let data: Uint8Array
  try { data = new Uint8Array(Buffer.from(encoded, 'base64')) } catch {
    throw new MediaAdmissionError('The encoded image could not be decoded', 'MEDIA_IMAGE_INVALID')
  }
  return admitImageBytes(options, data, source, name, signal)
}

/** Resolve one explicit session handle from durable session history; handles are not bearer capabilities. */
export async function admitSessionImage(
  options: Pick<MediaAdmissionOptions, 'attachments'>,
  agent: Agent,
  handle: string,
  signal?: AbortSignal,
): Promise<AdmittedImage> {
  throwIfAborted(signal)
  if (!IMAGE_HANDLE_PATTERN.test(handle)) throw new MediaAdmissionError('The image handle is invalid', 'MEDIA_HANDLE_INVALID')
  const authorized = authorizedSessionImages(agent)
  const ref = authorized.get(handle)
  if (ref === undefined) throw new MediaAdmissionError('The image handle is not authorized by this session', 'MEDIA_HANDLE_UNAUTHORIZED')
  try {
    const stored = await options.attachments.readImage(ref, signal)
    return { kind: 'image', input: { data: stored.data, mediaType: stored.ref.mediaType, ...(stored.ref.name === undefined ? {} : { name: stored.ref.name }) }, stored, source: 'session' }
  } catch {
    throw new MediaAdmissionError('The authorized image could not be read', 'MEDIA_IMAGE_READ_FAILED')
  }
}

/** Resolve an image only after containment and regular-file checks, then admit its bytes. */
export async function admitWorkspaceImage(
  options: MediaAdmissionOptions,
  workspace: string,
  path: string,
  signal?: AbortSignal,
): Promise<AdmittedImage> {
  throwIfAborted(signal)
  if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) {
    throw new MediaAdmissionError('The workspace image reference is invalid', 'MEDIA_WORKSPACE_INVALID')
  }
  const data = await readStableWorkspaceBytes(
    options.fs,
    workspace,
    path,
    options.attachments.imageLimits.maxImageBytes,
    'image',
    signal,
  )
  return admitImageBytes(options, data, 'workspace', basename(path), signal)
}

/** Admit an MP4 container without claiming native video attachment support. */
export async function admitWorkspaceVideo(
  options: Pick<MediaAdmissionOptions, 'fs'> & { readonly maxVideoBytes?: number },
  workspace: string,
  path: string,
  signal?: AbortSignal,
): Promise<AdmittedVideo> {
  throwIfAborted(signal)
  if (path.length === 0 || path.length > 4096 || /^https?:\/\//iu.test(path)) {
    throw new MediaAdmissionError('The workspace video reference is invalid', 'MEDIA_VIDEO_INVALID')
  }
  const maxBytes = positive(options.maxVideoBytes, DEFAULT_VIDEO_BYTES)
  const data = await readStableWorkspaceBytes(options.fs, workspace, path, maxBytes, 'video', signal)
  if (data.byteLength === 0 || data.byteLength > maxBytes || !isMp4(data)) {
    throw new MediaAdmissionError('The workspace file is not a bounded MP4 video', 'MEDIA_VIDEO_INVALID')
  }
  return { kind: 'video', data, mediaType: 'video/mp4' }
}

async function readStableWorkspaceBytes(
  fs: MediaAdmissionOptions['fs'],
  workspace: string,
  path: string,
  maxBytes: number,
  kind: 'image' | 'video',
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const symlinkCode = kind === 'image' ? 'MEDIA_WORKSPACE_SYMLINK' : 'MEDIA_VIDEO_SYMLINK'
  const regularCode = kind === 'image' ? 'MEDIA_WORKSPACE_NOT_REGULAR' : 'MEDIA_VIDEO_NOT_REGULAR'
  const containmentCode = kind === 'image' ? 'MEDIA_WORKSPACE_CONTAINMENT' : 'MEDIA_VIDEO_CONTAINMENT'
  const changedCode = kind === 'image' ? 'MEDIA_WORKSPACE_CHANGED' : 'MEDIA_VIDEO_CHANGED'
  const initialPath = await fs.lstat(path, { cwd: workspace }, signal)
  if (initialPath?.type === 'symlink') throw new MediaAdmissionError(`The workspace ${kind} is a symbolic link`, symlinkCode)
  if (initialPath === undefined || initialPath.type !== 'file') throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode)
  const root = await fs.resolve(workspace, fsResolveOptions(workspace, signal))
  const target = await fs.resolve(path, fsResolveOptions(workspace, signal))
  if (!fs.contains(root, target)) throw new MediaAdmissionError(`The workspace ${kind} is outside the active workspace`, containmentCode)
  const before = await fs.stat(target, signal)
  if (before === undefined || before.type !== 'file') throw new MediaAdmissionError(`The workspace ${kind} is not a regular file`, regularCode)
  if (before.version !== initialPath.version) throw new MediaAdmissionError(`The workspace ${kind} changed before it could be read`, changedCode)
  const data = await fs.readBytes(target, signal, maxBytes)
  const finalPath = await fs.lstat(path, { cwd: workspace }, signal)
  const finalTarget = await fs.resolve(path, fsResolveOptions(workspace, signal))
  const after = await fs.stat(target, signal)
  if (finalPath === undefined
    || finalPath.type !== 'file'
    || finalPath.version !== initialPath.version
    || finalTarget.targetKey !== target.targetKey
    || !fs.contains(root, finalTarget)
    || after === undefined
    || after.type !== 'file'
    || after.version !== before.version) {
    throw new MediaAdmissionError(`The workspace ${kind} changed while it was being read`, changedCode)
  }
  return data
}

export function detectImageMediaType(data: Uint8Array): ImageMediaType | undefined {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return 'image/webp'
  if (data.length >= 6 && (ascii(data, 0, 6) === 'GIF87a' || ascii(data, 0, 6) === 'GIF89a')) return 'image/gif'
  return undefined
}

export function isMp4(data: Uint8Array): boolean {
  return data.length >= 12 && ascii(data, 4, 8) === 'ftyp'
}

export interface SessionImageCatalogEntry {
  readonly handle: `image:${string}`
  readonly attachment: ImageAttachmentRef
  readonly origin: 'user' | 'reference' | 'generated'
  readonly sequence: number
}

/** Traverse durable session history once for both authorization and image listing. */
export function sessionImageCatalog(agent: Agent): readonly SessionImageCatalogEntry[] {
  const result = new Map<string, SessionImageCatalogEntry>()
  const visited = new WeakSet<object>()
  let sequence = 0
  let visitedNodes = 0
  const visit = (value: unknown, origin: SessionImageCatalogEntry['origin'], depth = 0): void => {
    if ((typeof value !== 'object' || value === null) || depth > 64 || visitedNodes >= 10_000 || visited.has(value)) return
    visited.add(value)
    visitedNodes += 1
    if (Array.isArray(value)) { for (const nested of value) visit(nested, origin, depth + 1); return }
    if (!isRecord(value)) return
    const attachment = value.type === 'image' ? parseImageRef(value.attachment) : undefined
    if (attachment !== undefined) {
      const handle = imageHandle(attachment)
      if (!result.has(handle)) result.set(handle, { handle, attachment, origin, sequence: sequence++ })
    }
    if (value.type === 'tool-result' && Array.isArray(value.content)) visit(value.content, origin, depth + 1)
  }
  for (const event of agent.session.snapshotEvents()) {
    const rawEvent: unknown = event
    if (!isRecord(rawEvent) || !isRecord(rawEvent.data)) continue
    if (rawEvent.type === 'user/message') visit(rawEvent.data.content, 'user')
    else if (rawEvent.type === 'assistant/message' && isRecord(rawEvent.data.message)) visit(rawEvent.data.message.content, 'reference')
    else if (rawEvent.type === 'tool/result' && isRecord(rawEvent.data.message)) visit(rawEvent.data.message.content, 'generated')
  }
  return [...result.values()]
}

function authorizedSessionImages(agent: Agent): Map<string, ImageAttachmentRef> {
  return new Map(sessionImageCatalog(agent).map(entry => [entry.handle, entry.attachment]))
}

function parseImageRef(value: unknown): ImageAttachmentRef | undefined {
  if (!isRecord(value)
    || !isBoundedSafeText(value.attachmentId, 256)
    || (value.mediaType !== 'image/png' && value.mediaType !== 'image/jpeg' && value.mediaType !== 'image/webp' && value.mediaType !== 'image/gif')
    || !isPositiveSafeInteger(value.bytes, 1024 * 1024 * 1024)
    || !isPositiveSafeInteger(value.width, 1_000_000)
    || !isPositiveSafeInteger(value.height, 1_000_000)) return undefined
  const name = typeof value.name === 'string' && isBoundedSafeText(value.name, 256) ? safeName(value.name) : undefined
  return {
    attachmentId: value.attachmentId as never,
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    ...(name === undefined ? {} : { name }),
  }
}

function isPositiveSafeInteger(value: unknown, max: number): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= max
}

function isCanonicalBase64(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
}

function safeName(value: string): string {
  const base = [...basename(value)].map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/' || character === '\\' ? '_' : character).join('').slice(0, 256)
  return base.length > 0 ? base : 'antigravity-image'
}

function basename(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

function fsResolveOptions(cwd: string, signal: AbortSignal | undefined): { readonly cwd: string; readonly signal?: AbortSignal } {
  return signal === undefined ? { cwd } : { cwd, signal }
}

function ascii(data: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...data.slice(start, end))
}

function positive(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Math.min(Math.floor(value), 128 * 1024 * 1024)
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal !== undefined && signal.aborted) throw new MediaAdmissionError('Media admission was cancelled', 'MEDIA_CANCELLED')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

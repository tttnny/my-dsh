/** Controlled pixel-fact verification for explicit live Gate V. */

import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AntigravityAuthService } from './auth-service.ts'
import type { LiveGateResult, LiveGateRunOptions } from './live-gates.ts'
import { ANTIGRAVITY_VIDEO_MODEL, createAntigravityVideoTools } from './video.ts'

const LIVE_VIDEO_BYTES = 32 * 1024 * 1024
export const LIVE_VIDEO_QUESTION = 'What exact uppercase word is visibly shown in the center of the video? Reply with that word only.' as const
export const LIVE_VIDEO_EXPECTED_ANSWER = 'KUMQUAT' as const

export async function runVideoGate(
  auth: AntigravityAuthService,
  options: LiveGateRunOptions,
): Promise<LiveGateResult> {
  if (options.videoFile === undefined) return { gate: 'V', outcome: 'failed' }
  const absolute = resolve(options.videoFile)
  const workspace = dirname(absolute)
  const path = relative(workspace, absolute)
  const agent = { session: { header: { cwd: workspace }, events: [] } } as unknown as Agent
  const context = { agent, signal: new AbortController().signal } as unknown as ToolRunContext
  const tool = createAntigravityVideoTools({
    auth,
    fs: createNodeFileSystem(workspace),
    settings: () => ({ enabled: true, model: ANTIGRAVITY_VIDEO_MODEL, maxBytes: LIVE_VIDEO_BYTES }),
  })[0]
  if (tool === undefined) throw new Error('The video gate tool is unavailable')
  const result = await tool.execute({ path, prompt: LIVE_VIDEO_QUESTION }, context) as { text?: unknown }
  if (!isDeterministicVideoAnswer(result.text)) throw new Error('The video gate did not verify the fixture pixel fact')
  await auth.recordCapabilityGate('video', 'passed')
  return { gate: 'V', outcome: 'passed' }
}

export function isDeterministicVideoAnswer(value: unknown): boolean {
  return typeof value === 'string' && value === LIVE_VIDEO_EXPECTED_ANSWER
}

function createNodeFileSystem(workspace: string) {
  const target = (path: string): FsTarget => ({ targetKey: path as never, displayPath: path })
  const resolveTarget = async (path: string, options?: { cwd?: string }): Promise<FsTarget> => {
    const absolute = isAbsolute(path) ? path : join(options?.cwd ?? workspace, path)
    return target(await realpath(absolute))
  }
  const version = (value: { readonly dev: number | bigint; readonly ino: number | bigint; readonly size: number | bigint; readonly mtimeMs: number | bigint }): string => `${String(value.dev)}:${String(value.ino)}:${String(value.size)}:${String(value.mtimeMs)}`
  return {
    resolve: resolveTarget,
    contains: (parent: FsTarget, child: FsTarget): boolean => {
      const childRelative = relative(String(parent.targetKey), String(child.targetKey))
      return childRelative === '' || (!childRelative.startsWith('..') && !isAbsolute(childRelative))
    },
    lstat: async (path: string, options?: { cwd?: string }) => {
      const absolute = isAbsolute(path) ? path : join(options?.cwd ?? workspace, path)
      const info = await lstat(absolute, { bigint: true })
      return { type: info.isSymbolicLink() ? 'symlink' as const : info.isFile() ? 'file' as const : info.isDirectory() ? 'directory' as const : 'other' as const, version: version(info) as never, size: Number(info.size) }
    },
    stat: async (value: FsTarget) => {
      const info = await stat(String(value.targetKey), { bigint: true })
      return { type: info.isFile() ? 'file' as const : info.isDirectory() ? 'directory' as const : 'other' as const, version: version(info) as never, size: Number(info.size) }
    },
    readBytes: async (value: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> => {
      signal?.throwIfAborted()
      const info = await stat(String(value.targetKey))
      if (info.size > maxBytes) throw new Error('Fixture exceeds gate bound')
      const data = await readFile(String(value.targetKey))
      signal?.throwIfAborted()
      if (data.byteLength > maxBytes) throw new Error('Fixture exceeds gate bound')
      return new Uint8Array(data)
    },
  }
}

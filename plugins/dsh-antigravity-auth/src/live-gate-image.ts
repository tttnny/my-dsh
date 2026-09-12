/** Durable generation/edit verification for explicit live Gate I. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { AntigravityAuthService } from './auth-service.ts'
import { ANTIGRAVITY_IMAGE_MODEL, createAntigravityImageTools } from './image.ts'
import { createDurableLiveAttachmentStore } from './live-gate-attachments.ts'
import type { LiveGateResult } from './live-gates.ts'

interface LiveImageResult {
  readonly images: readonly { readonly handle: string; readonly attachment: ImageAttachmentRef }[]
  readonly references: readonly unknown[]
}

export async function runImageGate(
  auth: AntigravityAuthService,
  attachmentRoot: string,
): Promise<LiveGateResult> {
  const attachments = createDurableLiveAttachmentStore(attachmentRoot)
  const events: unknown[] = []
  const agent = { session: { header: { cwd: process.cwd() }, events } } as unknown as Agent
  const context = { agent, signal: new AbortController().signal } as unknown as ToolRunContext
  const tool = createAntigravityImageTools({
    auth,
    attachments,
    fs: createUnavailableFileSystem(),
    settings: () => ({ enabled: true, model: ANTIGRAVITY_IMAGE_MODEL, n: 1 }),
  })[0]
  if (tool === undefined) throw new Error('The image gate tool is unavailable')
  const generated = await tool.execute({ prompt: 'A single small blue circle on a plain white background.', n: 1 }, context) as LiveImageResult
  const reference = generated.images[0]
  if (reference === undefined) throw new Error('The image generation gate returned no image')
  events.push({ type: 'tool/result', data: { message: { content: [{ type: 'image', attachment: reference.attachment }] } } })
  const edited = await tool.execute({
    prompt: 'Keep the image simple and change the blue circle to green.',
    references: [{ kind: 'session', handle: reference.handle }],
    n: 1,
  }, context) as LiveImageResult
  if (edited.images.length === 0 || edited.references.length !== 1) throw new Error('The image edit gate returned no admitted output')
  await auth.recordCapabilityGate('image', 'passed')
  return { gate: 'I', outcome: 'passed' }
}

function createUnavailableFileSystem() {
  const unavailable = async (): Promise<never> => { throw new Error('Workspace media is unavailable in Gate I') }
  return {
    resolve: unavailable,
    contains: () => false,
    readBytes: unavailable,
    lstat: unavailable,
    stat: unavailable,
  }
}

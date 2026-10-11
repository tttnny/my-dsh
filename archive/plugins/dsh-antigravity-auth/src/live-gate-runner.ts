/** Small production dispatcher for explicitly authorized, one-at-a-time live gates. */

import { dirname, join } from 'node:path'
import { createAntigravityAuthService, type AntigravityAuthService } from './auth-service.ts'
import { defaultAuthStorePath } from './auth-store.ts'
import {
  createFileCapabilityGates,
  defaultCapabilityGatePath,
  type CapabilityGateRegistry,
} from './capability-gates.ts'
import { runAuthGate } from './live-gate-auth.ts'
import { runImageGate } from './live-gate-image.ts'
import { runLlmGate } from './live-gate-llm.ts'
import { classifyGate0Outcome, classifyOutcome, recordGateFailure } from './live-gate-outcome.ts'
import { runSearchGate } from './live-gate-search.ts'
import { runVideoGate } from './live-gate-video.ts'
import type { LiveGateRunner } from './live-gates.ts'

export { LIVE_TEXT_MODEL, LIVE_TEXT_MODEL_BY_FAMILY, runLlmGate } from './live-gate-llm.ts'
export { classifyGate0Outcome } from './live-gate-outcome.ts'
export {
  LIVE_VIDEO_EXPECTED_ANSWER,
  LIVE_VIDEO_QUESTION,
  isDeterministicVideoAnswer,
} from './live-gate-video.ts'

export interface ProductionLiveGateRunnerOptions {
  readonly output?: (line: string) => void
  readonly auth?: AntigravityAuthService
  readonly gates?: CapabilityGateRegistry
  readonly attachmentRoot?: string
}

export function createProductionLiveGateRunner(options: ProductionLiveGateRunnerOptions = {}): LiveGateRunner {
  const authPath = defaultAuthStorePath()
  const gates = options.gates ?? createFileCapabilityGates(defaultCapabilityGatePath(authPath))
  const auth = options.auth ?? createAntigravityAuthService({ storePath: authPath, gates })
  const ownsAuth = options.auth === undefined
  const output = options.output ?? (() => {})
  const attachmentRoot = options.attachmentRoot ?? join(dirname(authPath), 'live-gate-attachments')

  return {
    run: async (gate, runOptions) => {
      try {
        if (gate === 'A') return await runAuthGate(auth, output)
        if (gate === '0L') {
          if (runOptions.llmFamily !== undefined && !(await auth.gate0Passed())) return { gate, outcome: 'failed' }
          return await runLlmGate(auth, gates, runOptions.llmFamily)
        }
        if (!(await auth.gate0Passed())) {
          await recordGateFailure(auth, gate, 'failed')
          return { gate, outcome: 'failed' }
        }
        if (gate === 'S') return await runSearchGate(auth)
        if (gate === 'I') return await runImageGate(auth, attachmentRoot)
        return await runVideoGate(auth, runOptions)
      } catch (error) {
        const outcome = gate === '0L' ? classifyGate0Outcome(error) : classifyOutcome(error)
        await recordGateFailure(auth, gate, outcome, runOptions.llmFamily).catch(() => {})
        return { gate, outcome }
      }
    },
    dispose: async () => { if (ownsAuth) await auth.dispose() },
  }
}

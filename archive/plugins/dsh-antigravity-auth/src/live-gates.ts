/** Explicit, one-gate-at-a-time CLI boundary for live private endpoint verification. */

import { LLM_FAMILY_IDS, type CapabilityGateOutcome, type LlmFamilyId } from './status.ts'

export const LIVE_ACKNOWLEDGEMENT = 'I_ACKNOWLEDGE_UNOFFICIAL_ANTIGRAVITY_PRIVATE_ENDPOINT_RISK' as const
export const LIVE_GATE_IDS = ['A', '0L', 'S', 'I', 'V'] as const
export type LiveGateId = (typeof LIVE_GATE_IDS)[number]

export interface LiveGateRunOptions {
  readonly videoFile?: string
  readonly llmFamily?: LlmFamilyId
}

export interface LiveGateResult {
  readonly gate: LiveGateId
  readonly outcome: CapabilityGateOutcome
}

export interface LiveGateRunner {
  run(gate: LiveGateId, options: LiveGateRunOptions): Promise<LiveGateResult>
  dispose(): Promise<void>
}

export interface LiveGateCliDependencies {
  readonly createRunner?: () => LiveGateRunner | Promise<LiveGateRunner>
  readonly output?: (line: string) => void
  readonly error?: (line: string) => void
}

/** Parse and enforce opt-in before constructing anything that can read credentials or use the network. */
export async function runLiveGateCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: LiveGateCliDependencies = {},
): Promise<number> {
  const output = dependencies.output ?? (line => { process.stdout.write(`${line}\n`) })
  const error = dependencies.error ?? (line => { process.stderr.write(`${line}\n`) })
  const parsed = parseArguments(argv)
  if (parsed.error !== undefined) {
    error(parsed.error)
    return 2
  }
  if (!parsed.acknowledged || env.DSH_ANTIGRAVITY_LIVE_ACK !== LIVE_ACKNOWLEDGEMENT) {
    error('Live gates require explicit acknowledgement via both --acknowledge-private-risk and DSH_ANTIGRAVITY_LIVE_ACK.')
    return 2
  }
  const createRunner = dependencies.createRunner ?? (async () => {
    const module = await import('./live-gate-runner.ts')
    return module.createProductionLiveGateRunner({ output })
  })
  let runner: LiveGateRunner | undefined
  try {
    runner = await createRunner()
    const result = await runner.run(parsed.gate, parsed.options)
    output(JSON.stringify(result))
    return result.outcome === 'passed' ? 0 : 1
  } catch {
    error('The selected Antigravity live gate failed safely.')
    return 1
  } finally {
    await runner?.dispose().catch(() => {})
  }
}

type ParsedArguments =
  | { readonly error: string }
  | { readonly acknowledged: boolean; readonly gate: LiveGateId; readonly options: LiveGateRunOptions; readonly error?: never }

function parseArguments(argv: readonly string[]): ParsedArguments {
  let acknowledged = false
  let gate: LiveGateId | undefined
  let videoFile: string | undefined
  let llmFamily: LlmFamilyId | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--acknowledge-private-risk') {
      if (acknowledged) return { error: 'The acknowledgement flag may be supplied only once.' }
      acknowledged = true
      continue
    }
    if (value === '--gate') {
      if (gate !== undefined) return { error: 'Select exactly one live gate per invocation.' }
      const candidate = argv[index + 1]
      if (candidate === undefined || !LIVE_GATE_IDS.includes(candidate as LiveGateId)) return { error: 'Select one live gate: A, 0L, S, I, or V.' }
      gate = candidate as LiveGateId
      index += 1
      continue
    }
    if (value === '--family') {
      if (llmFamily !== undefined) return { error: 'The LLM family may be supplied only once.' }
      const candidate = argv[index + 1]
      if (candidate === undefined || !LLM_FAMILY_IDS.includes(candidate as LlmFamilyId)) {
        return { error: 'Select one LLM family: gemini, claude, or gpt-oss.' }
      }
      llmFamily = candidate as LlmFamilyId
      index += 1
      continue
    }
    if (value === '--video-file') {
      if (videoFile !== undefined) return { error: 'The video fixture may be supplied only once.' }
      const candidate = argv[index + 1]
      if (candidate === undefined || candidate.length === 0 || candidate.length > 4096) return { error: 'Gate V requires a bounded video fixture path.' }
      videoFile = candidate
      index += 1
      continue
    }
    return { error: 'The live gate arguments are invalid.' }
  }
  if (gate === undefined) return { error: 'Select exactly one live gate per invocation.' }
  if (gate === 'V' && videoFile === undefined) return { error: 'Gate V requires --video-file.' }
  if (gate !== 'V' && videoFile !== undefined) return { error: '--video-file is valid only for Gate V.' }
  if (gate !== '0L' && llmFamily !== undefined) return { error: '--family is valid only for Gate 0/L.' }
  return {
    acknowledged,
    gate,
    options: {
      ...(videoFile === undefined ? {} : { videoFile }),
      ...(llmFamily === undefined ? {} : { llmFamily }),
    },
  }
}

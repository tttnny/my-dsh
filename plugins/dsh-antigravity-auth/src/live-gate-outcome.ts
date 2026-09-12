/** Closed failure classification and persistence shared by live gate dispatch. */

import type { AntigravityAuthService } from './auth-service.ts'
import type { LiveGateId } from './live-gates.ts'
import type { CapabilityGateOutcome, CapabilityRowId, LlmFamilyId } from './status.ts'

const CAPABILITY_BY_GATE: Readonly<Partial<Record<LiveGateId, CapabilityRowId>>> = Object.freeze({
  S: 'search',
  I: 'image',
  V: 'video',
})

export async function recordGateFailure(
  auth: AntigravityAuthService,
  gate: LiveGateId,
  outcome: Exclude<CapabilityGateOutcome, 'passed'>,
  family?: LlmFamilyId,
): Promise<void> {
  if (gate === '0L') {
    if (family === undefined) await auth.recordGate0(outcome)
    else await auth.recordLlmFamilyGate(family, outcome)
    return
  }
  const id = CAPABILITY_BY_GATE[gate]
  if (id !== undefined) await auth.recordCapabilityGate(id, outcome)
}

export function classifyGate0Outcome(error: unknown): Exclude<CapabilityGateOutcome, 'passed'> {
  const code = errorCode(error)
  if (code === 'GATE_0_ATTRIBUTION' || code.includes('ATTRIBUTION_REJECTED')) return 'attribution-rejected'
  return classifyOutcome(error)
}

export function classifyOutcome(error: unknown): Exclude<CapabilityGateOutcome, 'passed'> {
  const code = errorCode(error)
  if (code === 'GATE_0_ATTRIBUTION' || code.includes('ATTRIBUTION_REJECTED')) return 'attribution-rejected'
  if (code.includes('AUTH') || code.includes('GRANT') || code.includes('LOGIN')) return 'unauthenticated'
  if (code.includes('RATE') || code.includes('RESOURCE_EXHAUSTED')) return 'rate-limited'
  if (code.includes('CANCEL') || code.includes('ABORT')) return 'cancelled'
  if (code.includes('UNSUPPORTED_VIDEO') || code.includes('VIDEO_UNSUPPORTED')) return 'unsupported-video'
  if (code.includes('PROTOCOL') || code.includes('MALFORMED') || code.includes('RESPONSE')) return 'protocol-drift'
  return 'failed'
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).toUpperCase()
    : ''
}

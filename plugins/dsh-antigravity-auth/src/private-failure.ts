/** One closed classifier shared by every capability's public error vocabulary. */

import { PrivateTransportError } from './private-transport-error.ts'
import type { CapabilityGateOutcome } from './status.ts'

export type PrivateFailureKind =
  | 'authentication'
  | 'forbidden'
  | 'rate-limited'
  | 'cancelled'
  | 'timeout'
  | 'attribution-rejected'
  | 'protocol-drift'
  | 'response-limit'
  | 'request-limit'
  | 'upstream'
  | 'network'
  | 'failed'

export function classifyPrivateFailure(error: unknown): PrivateFailureKind {
  if (!(error instanceof PrivateTransportError)) return 'failed'
  switch (error.code) {
    case 'authentication': return 'authentication'
    case 'forbidden': return 'forbidden'
    case 'rate-limited': return 'rate-limited'
    case 'cancelled': return 'cancelled'
    case 'timeout': return 'timeout'
    case 'attribution-rejected': return 'attribution-rejected'
    case 'protocol-drift':
    case 'invalid-response': return 'protocol-drift'
    case 'response-too-large':
    case 'frame-too-large': return 'response-limit'
    case 'request-too-large': return 'request-limit'
    case 'upstream': return 'upstream'
    case 'offline': return 'network'
  }
}

export function capabilityOutcomeForError(error: unknown): Exclude<CapabilityGateOutcome, 'passed'> {
  const kind = classifyPrivateFailure(error)
  if (kind === 'authentication') return 'unauthenticated'
  if (kind === 'rate-limited') return 'rate-limited'
  if (kind === 'cancelled') return 'cancelled'
  if (kind === 'attribution-rejected') return 'attribution-rejected'
  if (kind === 'protocol-drift' || kind === 'response-limit' || kind === 'request-limit') return 'protocol-drift'
  return 'failed'
}

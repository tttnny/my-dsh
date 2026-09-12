/** Browser-safe login state shared by the Host OAuth flow and settings RPC. */

export const LOGIN_PHASES = [
  'idle',
  'pending',
  'success',
  'cancelled',
  'expired',
  'port-conflict',
  'failed',
] as const

export type LoginPhase = (typeof LOGIN_PHASES)[number]

export const LOGIN_ERROR_CODES = [
  'invalid-method',
  'invalid-path',
  'invalid-host',
  'duplicate-parameter',
  'invalid-parameters',
  'missing-state',
  'state-mismatch',
  'missing-code',
  'oauth-error',
  'no-pending-flow',
  'expired',
  'cancelled',
  'port-conflict',
  'token-exchange-failed',
  'project-unavailable',
  'project-authentication-failed',
  'project-forbidden',
  'project-rate-limited',
  'project-offline',
  'project-malformed',
  'project-protocol-drift',
  'project-validation-failed',
  'persistence-failed',
  'credential-conflict',
  'invalid-callback-url',
  'risk-acknowledgement-required',
  'internal',
] as const

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number]

export function isLoginPhase(value: unknown): value is LoginPhase {
  return typeof value === 'string' && LOGIN_PHASES.includes(value as LoginPhase)
}

export function isLoginErrorCode(value: unknown): value is LoginErrorCode {
  return typeof value === 'string' && LOGIN_ERROR_CODES.includes(value as LoginErrorCode)
}

export interface LoginStatusView {
  readonly phase: LoginPhase
  readonly configured: boolean
  readonly projectAvailable: boolean
  readonly authorizationUrl?: string
  readonly expiresAt?: string
  readonly maskedEmail?: string
  readonly errorCode?: LoginErrorCode
}

export interface LoginStartResult {
  readonly started: true
  readonly phase: 'pending'
  readonly authorizationUrl: string
  readonly expiresAt: string
}

export interface LoginActionResult {
  readonly phase: LoginPhase
  readonly errorCode?: LoginErrorCode
}

export type LoginCompletionResult =
  | { readonly completed: true; readonly phase: 'success' }
  | { readonly completed: false; readonly phase: 'failed' | 'cancelled'; readonly errorCode: LoginErrorCode }

export type { LoginStatusView as AntigravityLoginStatusView }

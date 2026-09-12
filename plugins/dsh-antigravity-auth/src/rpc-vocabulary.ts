/** Closed, browser-safe RPC error vocabulary shared by Host and client. */

import { LOGIN_ERROR_CODES, type LoginErrorCode } from './login-types.ts'

const OPERATION_ERROR_CODES = [
  'loopback-required',
  'invalid-grant',
  'network',
  'timeout',
  'rate-limited',
  'server-error',
  'http-error',
  'invalid-response',
  'conflict',
  'storage',
] as const

export const SAFE_RPC_ERROR_CODES = [
  'bad-request',
  ...LOGIN_ERROR_CODES,
  ...OPERATION_ERROR_CODES,
] as const

export type SafeRpcErrorCode = (typeof SAFE_RPC_ERROR_CODES)[number]

const SAFE_RPC_ERROR_MESSAGES: Readonly<Partial<Record<SafeRpcErrorCode, string>>> = Object.freeze({
  'bad-request': 'antigravity-auth: invalid request',
  'loopback-required': 'Antigravity account controls require a loopback-bound DSH Host',
  cancelled: 'The operation was cancelled',
  'risk-acknowledgement-required': 'Risk acknowledgement is required before login',
  'port-conflict': 'The fixed OAuth callback port is already in use',
  'invalid-method': 'The OAuth callback method is not accepted',
  'invalid-path': 'The OAuth callback path is not accepted',
  'invalid-host': 'The OAuth callback host is not accepted',
  'duplicate-parameter': 'The OAuth callback contains duplicate parameters',
  'invalid-parameters': 'The OAuth callback parameters are not accepted',
  'missing-state': 'The OAuth callback state is missing',
  'state-mismatch': 'The OAuth callback state was not accepted',
  'missing-code': 'The OAuth callback code is missing',
  'oauth-error': 'The OAuth provider rejected authorization',
  expired: 'The OAuth login expired',
  'no-pending-flow': 'There is no pending OAuth login',
  'project-unavailable': 'No usable project is available for this account',
  'project-authentication-failed': 'The Antigravity project probe requires authentication',
  'project-forbidden': 'The Antigravity project probe was forbidden',
  'project-rate-limited': 'The Antigravity project probe is rate-limited',
  'project-offline': 'The Antigravity project probe is offline',
  'project-malformed': 'The Antigravity project response was malformed',
  'project-protocol-drift': 'The Antigravity project protocol changed',
  'project-validation-failed': 'Project validation failed',
  'credential-conflict': 'The login changed while it was completing',
  'persistence-failed': 'The login could not be saved',
  'token-exchange-failed': 'The authorization code could not be exchanged',
  'invalid-callback-url': 'The callback URL is invalid',
  'invalid-grant': 'The account must be authenticated again',
  network: 'The operation could not reach the provider',
  timeout: 'The operation timed out',
  'rate-limited': 'The operation is rate-limited',
  'server-error': 'The provider is unavailable',
  'http-error': 'The provider rejected the operation',
  'invalid-response': 'The provider response was not accepted',
  conflict: 'The account changed while the operation was running',
  storage: 'The local account state could not be updated',
})

export function isSafeRpcErrorCode(value: unknown): value is SafeRpcErrorCode {
  return typeof value === 'string' && SAFE_RPC_ERROR_CODES.includes(value as SafeRpcErrorCode)
}

export function safeRpcErrorMessage(code: SafeRpcErrorCode | LoginErrorCode): string {
  return SAFE_RPC_ERROR_MESSAGES[code] ?? 'antigravity-auth: operation failed'
}

/** Static fail-closed guard for account RPC after DSH removed per-channel authority. */

import type { ConnectionRpcHandler, ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection'

export type LoopbackRpcMode = 'enabled' | 'blocked'

export interface LoopbackRpcGuard {
  /** Why the guarded handler is available or blocked for this Host composition. */
  readonly mode: LoopbackRpcMode
  /** Handler safe to register on the public Connection service. */
  readonly handler: ConnectionRpcHandler
}

export const LOOPBACK_REQUIRED_MESSAGE = 'Antigravity account controls require a loopback-bound DSH Host'

/**
 * Decide the account RPC activation from the public WebServer bind.
 * By default in this plugin, we allow non-loopback binds (e.g. 0.0.0.0, LAN, Docker)
 * and trust the outer DSH authentication mechanisms.
 */
export function loopbackMode(_webServerHost: string | undefined): LoopbackRpcMode {
  return 'enabled'
}

/** Command-entry denial shown when the Host exposes the commands seam beyond loopback. */
export const ACCOUNT_COMMAND_DENIED_MESSAGE = 'Antigravity account commands require a local DSH Host (no WebServer or 127.0.0.1-bound)'

/**
 * Decide slash-command activation for one Host composition.
 * Terminal and WebServer binds are all enabled.
 */
export function commandAccountMode(_webServer: { readonly host?: string } | undefined): LoopbackRpcMode {
  return 'enabled'
}

/**
 * Select the real RPC dispatcher only for an explicitly loopback-bound Web
 * service; any other composition registers a value-free inert dispatcher that
 * never calls the delegate.
 */
export function createLoopbackRpcGuard(
  webServerHost: string | undefined,
  delegate: ConnectionRpcHandler,
): LoopbackRpcGuard {
  if (loopbackMode(webServerHost) === 'blocked') {
    return {
      mode: 'blocked',
      handler: async (): Promise<ConnectionRpcResult<never>> => ({
        ok: false,
        error: {
          code: 'loopback-required',
          message: LOOPBACK_REQUIRED_MESSAGE,
          details: {},
        },
      }),
    }
  }
  return { mode: 'enabled', handler: delegate }
}

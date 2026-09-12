/** Human command for inspecting and starting the shared Antigravity login. */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { AntigravityAuthService } from './auth-service.ts'
import { ACCOUNT_COMMAND_DENIED_MESSAGE, type LoopbackRpcMode } from './loopback-rpc.ts'
import { openAuthorizationUrl } from './open-authorization-url.ts'
import type { AntigravityStatusView } from './status.ts'

type AuthCommandService = Pick<
  AntigravityAuthService,
  'status' | 'acknowledgeRisk' | 'startLogin' | 'cancelLogin' | 'logout'
>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatStatus(status: AntigravityStatusView): string {
  const login = status.login
  const parts = [
    login.configured ? 'configured' : 'not configured',
    login.projectAvailable ? 'project available' : 'no project',
  ]
  if (login.maskedEmail !== undefined) parts.push(login.maskedEmail)
  if (login.phase === 'pending') {
    parts.push('authorization pending')
  } else if (login.phase !== 'idle' && login.phase !== 'success') {
    parts.push(`phase ${login.phase}`)
  }
  if (login.errorCode !== undefined) parts.push(`error ${login.errorCode}`)
  const available = status.capabilities
    .filter(capability => capability.state === 'available')
    .map(capability => capability.id)
  if (available.length > 0) parts.push(`available: ${available.join(', ')}`)
  return `Antigravity auth: ${parts.join('; ')}`
}

/**
 * Build the slash command shared by every interactive DSH surface.
 * @param service - the shared Host auth service.
 * @param accountMode - live account-control activation for this Host
 * composition (enabled on a local terminal Host with no WebServer or a
 * loopback-bound WebServer, blocked on a public Web bind); when blocked the
 * command denies every operation without touching the auth service.
 * @param openUrl - best-effort Host browser launcher for the authorization
 * URL; the URL is delivered there and never echoed into the command result,
 * because `CommandResult.text` is persisted verbatim into `command/done`. The
 * resolved false value means the Host has no usable browser launch, which the
 * command reports without reproducing the URL.
 */
export function createAntigravityAuthCommand(
  service: AuthCommandService,
  accountMode: () => LoopbackRpcMode,
  openUrl: (url: string) => boolean | Promise<boolean> = openAuthorizationUrl,
): CommandDefinition {
  return {
    name: 'antigravity-auth',
    description: 'Inspect or start the Antigravity OAuth login',
    input: { hint: '[status|login|cancel|logout]' },
    handler: async ({ rawInput }) => {
      if (accountMode() === 'blocked') {
        return { kind: 'error', text: ACCOUNT_COMMAND_DENIED_MESSAGE }
      }
      const operation = rawInput.trim() || 'status'
      if (operation === 'status') {
        try {
          return { kind: 'success', text: formatStatus(await service.status()) }
        } catch (error) {
          return { kind: 'error', text: `reading Antigravity auth status failed: ${errorMessage(error)}` }
        }
      }
      if (operation === 'login') {
        try {
          // A pending authorization never blocks a new one. `startLogin` cancels
          // the previous flow (closing its loopback listener and dropping its
          // verifier) before starting a fresh PKCE exchange, which is how the Web
          // settings card already behaves; the replaced browser page can no
          // longer complete.
          const replaced = (await service.status()).login.phase === 'pending'
          await service.acknowledgeRisk()
          const started = await service.startLogin()
          // Terminal handoff: hand the authorization URL to the host browser.
          // It is not echoed into the result text, which the session persists
          // verbatim into command/done together with the OAuth state handle.
          const opened = await openUrl(started.authorizationUrl)
          if (!opened) {
            return {
              kind: 'error',
              text: 'Antigravity authorization started, but this Host could not open a browser automatically; complete sign-in in a browser on this Host, then run /antigravity-auth status.',
            }
          }
          return {
            kind: 'success',
            text: replaced
              ? 'Previous Antigravity authorization cancelled and a new one started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status.'
              : 'Antigravity authorization started (unofficial Antigravity channel, personal use); complete Google sign-in in the opened browser, then run /antigravity-auth status.',
          }
        } catch (error) {
          return { kind: 'error', text: `starting Antigravity login failed: ${errorMessage(error)}` }
        }
      }
      if (operation === 'cancel') {
        try {
          const result = await service.cancelLogin()
          return result.phase === 'cancelled'
            ? { kind: 'success', text: 'Antigravity authorization cancelled.' }
            : { kind: 'error', text: `Antigravity authorization could not be cancelled (phase ${result.phase}).` }
        } catch (error) {
          return { kind: 'error', text: `cancelling Antigravity login failed: ${errorMessage(error)}` }
        }
      }
      if (operation === 'logout') {
        try {
          await service.logout()
          return { kind: 'success', text: 'Antigravity logged out.' }
        } catch (error) {
          return { kind: 'error', text: `logging out of Antigravity failed: ${errorMessage(error)}` }
        }
      }
      return { kind: 'error', text: `unknown operation "${operation}" (available: status, login, cancel, logout)` }
    },
  }
}

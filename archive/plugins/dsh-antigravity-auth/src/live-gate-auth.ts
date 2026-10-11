/** Interactive OAuth/project validation implementation for explicit live Gate A. */

import type { AntigravityAuthService } from './auth-service.ts'
import type { LiveGateResult } from './live-gates.ts'

const AUTH_WAIT_MS = 10 * 60 * 1000
const POLL_MS = 250

export async function runAuthGate(
  auth: AntigravityAuthService,
  output: (line: string) => void,
): Promise<LiveGateResult> {
  await auth.acknowledgeRisk()
  const started = await auth.startLogin()
  output(JSON.stringify({ gate: 'A', action: 'open-authorization', authorizationUrl: started.authorizationUrl }))
  const deadline = Date.now() + AUTH_WAIT_MS
  while (Date.now() < deadline) {
    const status = await auth.status()
    if (status.login.phase === 'success') {
      const credential = await auth.credential(undefined, { forceRefresh: true })
      return { gate: 'A', outcome: credential === undefined ? 'unauthenticated' : 'passed' }
    }
    if (status.login.phase === 'failed' || status.login.phase === 'cancelled' || status.login.phase === 'expired') {
      return { gate: 'A', outcome: status.login.phase === 'cancelled' ? 'cancelled' : 'failed' }
    }
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS))
  }
  await auth.cancelLogin()
  return { gate: 'A', outcome: 'cancelled' }
}

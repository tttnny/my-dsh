/** Grounding-source verification for explicit live Gate S. */

import type { AntigravityAuthService } from './auth-service.ts'
import type { LiveGateResult } from './live-gates.ts'
import { ANTIGRAVITY_SEARCH_MODEL, AntigravitySearchProvider } from './search.ts'

export async function runSearchGate(auth: AntigravityAuthService): Promise<LiveGateResult> {
  const provider = new AntigravitySearchProvider({
    auth,
    settings: () => ({ enabled: true, model: ANTIGRAVITY_SEARCH_MODEL, maxResults: 3 }),
  })
  const result = await provider.search({ query: 'What is the official Google domain?', maxResults: 3 })
  if (result.sources.length === 0) throw new Error('The grounded search gate returned no sources')
  await auth.recordCapabilityGate('search', 'passed')
  return { gate: 'S', outcome: 'passed' }
}

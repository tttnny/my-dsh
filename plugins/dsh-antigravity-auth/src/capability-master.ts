/**
 * Settings-owned master switch for the whole capability bundle.
 *
 * The auth row's own profile config owns this switch; the search, image, and
 * video rows read it through the shared {@link AntigravityAuthService} (each
 * declares `antigravityAuth` as a hard dependency) and re-evaluate on
 * `watchStatus`. One switch therefore pauses the model route and all three tool
 * rows without touching the login.
 */

import type { Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Profile entry id of the auth row; the settings form's namespace. */
export const ANTIGRAVITY_AUTH_ENTRY_ID = 'antigravity-auth'

/** Registry default: the switch resolves paused, so a fresh install opts in. */
export const ANTIGRAVITY_MASTER_DEFAULT_ENABLED = false

/** Resolved switch value the rest of the bundle reads. */
export interface AntigravityMasterSettings {
  readonly enabled: boolean
}

/** Resolved profile config of the auth row: one live master switch. */
export interface MasterConfig {
  readonly enabled: Volatile<boolean>
}

/**
 * Runtime config schema. `volatile()` is what makes the field a live
 * reference the loader commits in place, so a form edit needs no reload.
 */
export const Config = z.object({
  enabled: z.boolean().default(ANTIGRAVITY_MASTER_DEFAULT_ENABLED).volatile(),
})

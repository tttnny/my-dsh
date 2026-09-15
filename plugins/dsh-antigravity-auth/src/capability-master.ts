/**
 * Settings-owned master switch for the whole capability bundle.
 *
 * The auth row registers this namespace and hands the resolved value to the
 * shared {@link AntigravityAuthService}; the search, image, and video rows read
 * it through that service (each declares `antigravityAuth` as a hard
 * dependency) and re-evaluate on `watchStatus`. One switch therefore pauses the
 * model route and all three tool rows without touching the login.
 */

import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE = 'antigravity-master'

/** Registry default: the switch resolves paused, so a fresh install opts in. */
export const ANTIGRAVITY_MASTER_DEFAULT_ENABLED = false

export const Config = z.object({
  enabled: z.boolean().default(ANTIGRAVITY_MASTER_DEFAULT_ENABLED),
})

export interface AntigravityMasterSettings {
  readonly enabled: boolean
}
/**
 * Settings-owned master switch for the whole capability bundle.
 *
 * The auth row registers this namespace and hands the resolved value to the
 * shared {@link AntigravityAuthService}; the search, image, and video rows read
 * it through that service (each declares `antigravityAuth` as a hard
 * dependency) and re-evaluate on `watchStatus`. One switch therefore pauses the
 * model route and all three tool rows without touching the login.
 */
import z from '@deepseek-ai/schemastery';
export declare const ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE = "antigravity-master";
/** Registry default: the switch resolves paused, so a fresh install opts in. */
export declare const ANTIGRAVITY_MASTER_DEFAULT_ENABLED = false;
export declare const Config: z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
}>>;
export interface AntigravityMasterSettings {
    readonly enabled: boolean;
}
//# sourceMappingURL=capability-master.d.ts.map
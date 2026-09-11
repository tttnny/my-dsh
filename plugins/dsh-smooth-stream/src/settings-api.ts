/**
 * Shared wire vocabulary for the plugin-owned Connection channel.
 *
 * Preferences no longer ride this channel: they live in the Host-registered
 * settings namespace and reach the browser through the native `settingsScope`
 * service. Only the package's version line and the one-click profile update —
 * both of which need the Host process and the profile manifest — stay here.
 */

/** Dedicated RPC channel registered by the Host half. */
export const STREAM_RPC_CHANNEL = '/lynn-smooth-stream'

/** Endpoints accepted by {@link STREAM_RPC_CHANNEL}. */
export const STREAM_RPC = {
  info: 'plugin.info',
  upgrade: 'plugin.upgrade',
} as const

/** How the active profile supplied this plugin. */
export type StreamInstallationKind = 'npm' | 'development' | 'unmanaged'

/** Package provenance shown by the settings card. */
export interface StreamPluginInfoView {
  /** Version of the package currently running in the Host process. */
  version: string
  /** Source class of this package in the active profile. */
  installation: StreamInstallationKind
  /** Whether a fixed npm update command is safe to offer. */
  canUpgrade: boolean
}

/** Successful package update acknowledgement; loading the new code needs a restart. */
export interface StreamUpgradeView {
  restartRequired: true
}

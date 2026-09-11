/** Browser adapter for the plugin-owned Host channel (version and update). */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  STREAM_RPC,
  STREAM_RPC_CHANNEL,
  type StreamPluginInfoView,
  type StreamUpgradeView,
} from '../settings-api.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function infoView(value: unknown): StreamPluginInfoView {
  const data = record(value)
  if (data === undefined
    || typeof data.version !== 'string'
    || !['npm', 'development', 'unmanaged'].includes(data.installation as string)
    || typeof data.canUpgrade !== 'boolean') {
    throw new Error('dsh-smooth-stream: malformed plugin info response')
  }
  return {
    version: data.version,
    installation: data.installation as StreamPluginInfoView['installation'],
    canUpgrade: data.canUpgrade,
  }
}

function upgradeView(value: unknown): StreamUpgradeView {
  const data = record(value)
  if (data?.restartRequired !== true) throw new Error('dsh-smooth-stream: malformed update response')
  return { restartRequired: true }
}

function accepted(result: Awaited<ReturnType<ConnectionHandle['rpc']['call']>>): unknown {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Narrow client contract consumed by the staged settings-card controller. */
export interface SmoothStreamPluginApi {
  info(): Promise<StreamPluginInfoView>
  upgrade(): Promise<StreamUpgradeView>
}

/** Build the typed facade over the generic Connection RPC service. */
export function createSmoothStreamPluginApi(connection: ConnectionHandle): SmoothStreamPluginApi {
  return {
    async info(): Promise<StreamPluginInfoView> {
      return infoView(accepted(await connection.rpc.call(STREAM_RPC_CHANNEL, STREAM_RPC.info, {})))
    },
    async upgrade(): Promise<StreamUpgradeView> {
      return upgradeView(accepted(await connection.rpc.call(STREAM_RPC_CHANNEL, STREAM_RPC.upgrade, {})))
    },
  }
}

/** Browser adapter for the plugin-owned Host route (version and update). */

import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client'
import {
  STREAM_RPC,
  STREAM_RPC_PATH,
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

function accepted(result: ConnectionRpcResult<unknown>): unknown {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * Post one endpoint to the plugin's exact `/api` route. The route's request
 * body names the endpoint and carries its payload, matching the host handler.
 */
async function callRpc(endpoint: string): Promise<ConnectionRpcResult<unknown>> {
  const response = await fetch(STREAM_RPC_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, payload: {} }),
  })
  if (!response.ok) {
    throw new Error(`dsh-smooth-stream: transport failure for ${endpoint}: HTTP ${response.status}`)
  }
  return await response.json() as ConnectionRpcResult<unknown>
}

/** Narrow client contract consumed by the staged settings-card controller. */
export interface SmoothStreamPluginApi {
  info(): Promise<StreamPluginInfoView>
  upgrade(): Promise<StreamUpgradeView>
}

/** Build the typed facade over the plugin's exact `/api` route. */
export function createSmoothStreamPluginApi(): SmoothStreamPluginApi {
  return {
    async info(): Promise<StreamPluginInfoView> {
      return infoView(accepted(await callRpc(STREAM_RPC.info)))
    },
    async upgrade(): Promise<StreamUpgradeView> {
      return upgradeView(accepted(await callRpc(STREAM_RPC.upgrade)))
    },
  }
}

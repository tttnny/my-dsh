/** Host half of the private Antigravity bootstrap capability bundle. */

import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import { createAntigravityAuthService } from './auth-service.ts'
import { createAntigravityAuthCommand } from './auth-command.ts'
import { AntigravityAdapter, ANTIGRAVITY_PROVIDER } from './llm-adapter.ts'
import { defaultAuthStorePath } from './auth-store.ts'
import { registerAccountRoutes } from './account-routes.ts'
import { ANTIGRAVITY_AUTH_RPC_NAMESPACE, handleAntigravityAuthRpc } from './rpc.ts'
import {
  commandAccountMode, createLoopbackRpcGuard, type LoopbackRpcMode,
} from './loopback-rpc.ts'
import { mountCapabilityLifecycle } from './capability-lifecycle.ts'
import {
  ANTIGRAVITY_MASTER_DEFAULT_ENABLED,
  ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE,
  Config as MasterConfig,
  type AntigravityMasterSettings,
} from './capability-master.ts'

export const name = 'antigravity-auth'
export const inject = ['llm', 'attachments']

/** Mount the Host-only OAuth service, its guarded account RPC channel, and the master switch. */
export function apply(ctx: Context, config: AntigravityMasterSettings = { enabled: ANTIGRAVITY_MASTER_DEFAULT_ENABLED }): void {
  // Resolved master switch. Until the settings section is registered there is no
  // switch above the rows, so they keep their own gates: a composition without
  // the settings service must not silently disable every capability.
  let masterSource = (): AntigravityMasterSettings => config
  let masterInstalled = false
  const masterGate = (): boolean => (masterInstalled ? masterSource().enabled : true)
  const service = createAntigravityAuthService({
    storePath: defaultAuthStorePath(),
    autoActivateGates: true,
    masterGate,
  })
  ctx.inject(['settings'], settingsCtx => {
    settingsCtx.settings.installSection(ctx, ANTIGRAVITY_MASTER_SETTINGS_NAMESPACE, MasterConfig, config, {
      setSource: source => { masterSource = source; service.publishMasterGate() },
      onChange: () => { service.publishMasterGate() },
    })
    masterInstalled = true
    service.publishMasterGate()
  })
  // Account-control activation for the slash command. A terminal composition
  // composes no public WebServer, so the command starts enabled (local-only
  // dispatch); the connection inject below records the WebServer bind and
  // blocks every account operation when the commands seam is exposed beyond
  // loopback. The account RPC keeps its own ADR-0008 static loopback guard.
  let accountMode: LoopbackRpcMode = 'enabled'
  const runtime = ctx as unknown as {
    llm?: {
      listProviders?: () => readonly { id: string }[]
      registerAdapter?: (providers: string[], adapter: AntigravityAdapter) => (() => void) & { replace?: (providers: string[]) => void }
    }
    attachments?: Pick<AttachmentStore, 'readImage'>
  }
  const adapter = new AntigravityAdapter({
    auth: service,
    ...(runtime.attachments === undefined ? {} : { attachments: runtime.attachments }),
  })
  const contextWithProvide = ctx as Context & { provide?: (name: string, value: unknown) => () => Promise<void> | void }
  const unprovide = contextWithProvide.provide?.('antigravityAuth', service) ?? (() => {})
  ctx.inject(['connection'], (connectionCtx) => {
    const webServer = connectionCtx.get('webServer')
    accountMode = commandAccountMode(webServer)
    const guard = createLoopbackRpcGuard(
      webServer?.host,
      (endpoint, payload, signal) => handleAntigravityAuthRpc(service, endpoint, payload, signal, adapter),
    )
    if (guard.mode === 'blocked') {
      connectionCtx.logger.warn('antigravity-auth: account RPC is disabled because the WebServer is not loopback-bound')
    }
    return registerAccountRoutes(connectionCtx.connection, ANTIGRAVITY_AUTH_RPC_NAMESPACE, ['status', 'models', 'usage', 'acknowledge-risk', 'login', 'complete-callback', 'cancel', 'cancel-login', 'logout', 'revoke'], guard.handler)
  })
  mountCapabilityLifecycle({
    ctx,
    auth: service,
    id: 'auth-llm',
    enabled: () => masterGate() && runtime.llm?.registerAdapter !== undefined,
    register: () => {
      if (runtime.llm?.registerAdapter === undefined) return undefined
      if (runtime.llm.listProviders?.().some(provider => provider.id === ANTIGRAVITY_PROVIDER)) return undefined
      const dispose = runtime.llm.registerAdapter([ANTIGRAVITY_PROVIDER], adapter)
      return () => {
        try { dispose() } finally { adapter.invalidateModelCatalog() }
      }
    },
    ownsAuth: true,
    cleanup: async () => {
      // The switch leaves with this row; any surviving row falls back to its own gates.
      masterInstalled = false
      await unprovide()
    },
    label: 'antigravity-auth: OAuth and LLM operations',
  })
  ctx.inject(['commands'], commandCtx => commandCtx.commands.register(createAntigravityAuthCommand(service, () => accountMode)))
}

export * from './auth-service.ts'
export * from './credential-coordinator.ts'
export * from './rpc-contract.ts'
export * from './status.ts'
export * from './project-context.ts'
export * from './wire-identity.ts'
export * from './llm-adapter.ts'
export * from './private-transport.ts'
export * from './replay.ts'
export * from './quota.ts'
export * from './media-admission.ts'
export * from './model-catalog.ts'
export * from './capability-gates.ts'
export * from './capability-master.ts'
export * from './live-gates.ts'

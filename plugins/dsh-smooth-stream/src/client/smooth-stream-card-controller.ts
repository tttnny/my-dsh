/**
 * Staged form state over the native smooth-stream settings namespace.
 *
 * Reads come from the browser's `settingsScope` mirror of the Host document;
 * writes are queued through the same scope, so the durable provider stays the
 * one authority and no plugin-owned settings transport exists. Only the
 * package version line and the one-click update ride the plugin RPC.
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from './clientStore.ts'
import {
  DEFAULT_STREAM_SETTINGS,
  type StreamDebugTuning,
  type StreamMotionPreference,
  type StreamSettings,
} from '../settings.ts'
import type { StreamInstallationKind, StreamPluginInfoView } from '../settings-api.ts'
import type { SmoothStreamPluginApi } from './smooth-stream-settings-api.ts'

/** What the smooth-stream card renders. It remains visible while its scope loads. */
export interface SmoothStreamCardState {
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
  dirty: boolean
  saving: boolean
  failed: boolean
  enabled: boolean
  controlScroll: boolean
  motionPreference: StreamMotionPreference
  thinkAutoExpand: boolean
  debugEnabled: boolean
  debugTuning: StreamDebugTuning
  debugAvailable: boolean
  version: string | undefined
  installation: StreamInstallationKind
  canUpgrade: boolean
  upgrading: boolean
  upgradeFailed: boolean
  restartRequired: boolean
}

/** The registration-side face injected into the settings slot renderer. */
export interface SmoothStreamCardFace {
  hooks: {
    smoothStreamCard: SnapshotStore<SmoothStreamCardState>
  }
  edit: (patch: Partial<StreamSettings>) => void
  save: () => void
  discard: () => void
  reload: () => void
  upgrade: () => void
}

/** Collaborators the card needs: the namespace scope plus the optional Host face. */
export interface SmoothStreamCardOptions {
  /** Bound scope of this plugin's Host settings namespace. */
  scope: SettingsScope<StreamSettings>
  /** Version/update channel; absent when Connection is not composed. */
  pluginApi?: SmoothStreamPluginApi | undefined
  /**
   * Whether this page runs on the Host's own machine. The update command runs
   * in the profile directory, so it is offered only to a local operator: the
   * kernel dropped the per-channel `authority: 'loopback'` option, and this is
   * the remaining honest gate for a convenience action.
   */
  isLoopback: boolean
}

/** Bridges the native settings namespace onto a staged settings form. */
export class SmoothStreamCardController {
  private readonly store = createSnapshotStore<SmoothStreamCardState>(this.projection())
  private readonly scope: SettingsScope<StreamSettings>
  private readonly pluginApi: SmoothStreamPluginApi | undefined
  private readonly isLoopback: boolean
  private info: StreamPluginInfoView | undefined
  private staged: Partial<StreamSettings> | undefined
  private saving = false
  private failed = false
  private upgrading = false
  private upgradeFailed = false
  private restartRequired = false
  private detachScope: (() => void) | undefined
  private detached = false

  constructor(options: SmoothStreamCardOptions) {
    this.scope = options.scope
    this.pluginApi = options.pluginApi
    this.isLoopback = options.isLoopback
  }

  /** Follow the scope and read the Host-side package provenance. */
  start(): void {
    this.detachScope = this.scope.subscribe(() => { this.publish() })
    void this.loadInfo()
  }

  /** Release the scope subscription when the optional services unload. */
  stop(): void {
    this.detached = true
    this.detachScope?.()
    this.detachScope = undefined
  }

  /** Current card snapshot, also consumed by the streaming preference cell. */
  getSnapshot(): SmoothStreamCardState {
    return this.store.getSnapshot()
  }

  /** Subscribe to state changes. */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /** Build the face consumed by the settings slot renderer. */
  inject(): SmoothStreamCardFace {
    return {
      hooks: { smoothStreamCard: this.store },
      edit: patch => { this.edit(patch) },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged === undefined && !this.failed) return
        this.staged = undefined
        this.failed = false
        this.publish()
      },
      reload: () => {
        this.staged = undefined
        this.failed = false
        void this.loadInfo()
        this.publish()
      },
      upgrade: () => { void this.upgrade() },
    }
  }

  private edit(patch: Partial<StreamSettings>): void {
    if (this.saving) return
    const current = this.values()
    const next: Partial<StreamSettings> = { ...this.staged }
    if (patch.enabled !== undefined) next.enabled = patch.enabled
    if (patch.controlScroll !== undefined) next.controlScroll = patch.controlScroll
    if (patch.motionPreference !== undefined) next.motionPreference = patch.motionPreference
    if (patch.thinkAutoExpand !== undefined) next.thinkAutoExpand = patch.thinkAutoExpand
    if (patch.debugEnabled !== undefined) next.debugEnabled = patch.debugEnabled
    if (patch.debugTuning !== undefined) {
      next.debugTuning = { ...current.debugTuning, ...patch.debugTuning }
    }
    this.staged = next
    this.failed = false
    this.publish()
  }

  /** Resolved preferences: the staged draft over the Host section over defaults. */
  private values(): StreamSettings {
    const base = this.scope.getSnapshot().value ?? DEFAULT_STREAM_SETTINGS
    return { ...base, ...this.staged }
  }

  private projection(): SmoothStreamCardState {
    const snapshot = this.scope.getSnapshot()
    return {
      status: snapshot.status,
      writable: snapshot.writable,
      dirty: this.staged !== undefined,
      saving: this.saving,
      failed: this.failed,
      ...this.values(),
      debugAvailable: snapshot.status === 'ready',
      version: this.info?.version,
      installation: this.info?.installation ?? 'unmanaged',
      canUpgrade: this.info?.canUpgrade === true && this.isLoopback,
      upgrading: this.upgrading,
      upgradeFailed: this.upgradeFailed,
      restartRequired: this.restartRequired,
    }
  }

  private async loadInfo(): Promise<void> {
    if (this.pluginApi === undefined) {
      this.publish()
      return
    }
    try {
      const info = await this.pluginApi.info()
      if (this.detached) return
      this.info = info
    } catch {
      if (this.detached) return
      this.info = undefined
    }
    this.publish()
  }

  private async save(): Promise<void> {
    const staged = this.staged
    if (staged === undefined || this.saving || !this.scope.getSnapshot().writable) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      for (const [field, value] of Object.entries(staged)) {
        await this.scope.set(field, value)
      }
      this.staged = undefined
    } catch {
      this.failed = true
    }
    this.saving = false
    this.publish()
  }

  private async upgrade(): Promise<void> {
    if (this.pluginApi === undefined || !this.projection().canUpgrade || this.upgrading) return
    this.upgrading = true
    this.upgradeFailed = false
    this.restartRequired = false
    this.publish()
    try {
      const result = await this.pluginApi.upgrade()
      this.restartRequired = result.restartRequired
    } catch {
      this.upgradeFailed = true
    }
    this.upgrading = false
    this.publish()
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}

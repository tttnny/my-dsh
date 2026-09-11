import { createElement, useSyncExternalStore, type ComponentType } from 'react'
// DSH 0.1.5-rc.1 dropped the separate client-runtime package: a browser plugin
// is a plain cordis Context consumer, and the `slots` service is augmented onto
// Context by the UI renderer.
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the connection Context merge and the plugins section's SlotMap
// entry ('settings.plugin.item') plus the native settings scope contract.
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { TypewriterAssistantNodeView } from './TypewriterAssistantNodeView.tsx'
import { wrapFollowNodeView, type FollowWrapProps } from './TypewriterToolNodeView.tsx'
import { SmoothStreamCard } from './SmoothStreamCard.tsx'
import { claimReadingSettingsPage, READING_ITEM_SLOT } from './reading-settings-page.tsx'
import { SmoothStreamCardController } from './smooth-stream-card-controller.ts'
import { createSmoothStreamPluginApi } from './smooth-stream-settings-api.ts'
import { DebugPanel } from './DebugPanel.tsx'
import { debugRuntime } from './debugRuntime.ts'
import { NS as SETTINGS_NS, en, zh } from './locales.ts'
import { DEFAULT_STREAM_CONFIG, STREAM_BOOT_GLOBAL, type StreamConfig } from '../config.ts'
import { DEFAULT_STREAM_SETTINGS, STREAM_SETTINGS_NS, type StreamSettings } from '../settings.ts'

/**
 * Cordis services required by the browser half. Only `slots` is load-bearing
 * for the stream itself; locale, the native settings scope and Connection power
 * the configuration card and are wired through `ctx.inject` below, so a
 * deployment without them still streams with defaults.
 */
export const inject = ['slots']

type AssistantProps = ChatNodeViewProps<'assistant-step'>

const STREAM_MODES: readonly string[] = ['typewriter', 'teleprompter']
const STREAM_PRESETS: readonly string[] = ['realtime', 'balanced', 'silky']

/**
 * The assistant renderer owns its own character queue and conversation
 * follower, so wrapping it again would create two scroll owners. Human input
 * stays immediate; every Agent-owned output renderer goes through the same
 * generic follow boundary. This is deliberately keyed by the owner that
 * provides the renderer, not by individual tool names, so new Context,
 * Command, and Tool rows are covered automatically.
 */
const SKIP_WRAP = new Set(['assistant-step', 'user', 'steering', 'command-input'])

/**
 * Rows that keep the shared entrance and follow lifecycle but never pace their
 * own text. Tool cards are this fork's deliberate exception: their content
 * arrives instantly — nothing inside a Tool card types itself out — while the
 * row still enters, glides, and follows with the rest of the transcript.
 */
const REVEAL_SKIP = new Set(['tool-call'])

/** React function/class or an exotic component such as memo/forwardRef/lazy. */
function isWrappableComponent(value: unknown): value is ComponentType<FollowWrapProps> {
  return typeof value === 'function'
    || (value !== null && typeof value === 'object' && '$$typeof' in value)
}

/**
 * Read the Host-bridged boot config. The inline script is produced by this
 * plugin's Host half from a schema-validated value, so only the structural
 * guarantees that could break between the two halves are re-checked: the
 * global is absent when the client runs without its Host entry (defaults
 * apply), and any present-but-malformed value fails loudly instead of
 * rendering a half-configured view.
 * @returns The resolved configuration for the assistant node view.
 */
function readBootConfig(): StreamConfig {
  const raw = (globalThis as Record<string, unknown>)[STREAM_BOOT_GLOBAL]
  if (raw === undefined) {
    console.info('[dsh-smooth-stream] no host config bridge; using defaults')
    return DEFAULT_STREAM_CONFIG
  }
  if (
    typeof raw !== 'object' || raw === null
    || !STREAM_MODES.includes((raw as StreamConfig).mode)
    || !STREAM_PRESETS.includes((raw as StreamConfig).preset)
    || typeof (raw as StreamConfig).revealCharsPerSec !== 'number'
    || typeof (raw as StreamConfig).scrollSpeedPxPerSec !== 'number'
    || typeof (raw as StreamConfig).maxScrollSpeedPxPerSec !== 'number'
  ) {
    throw new Error(`[dsh-smooth-stream] malformed ${STREAM_BOOT_GLOBAL} boot global: ${JSON.stringify(raw)}`)
  }
  return raw as StreamConfig
}

/**
 * Wrap every Agent-owned keyed Chat row except the assistant renderer in
 * place. A second
 * register with the same `children` table throws because the child slot is
 * already declared, and only the winning entry receives `renderSlot`;
 * swapping `entry.component` keeps the original children, locale, and inject
 * seats. `assistant-step` is replaced below so text and Think use the
 * typewriter reveal. The wrapper owns only the shared layout-growth/follow
 * lifecycle; the Harness keeps each renderer's controls, disclosures, and
 * cards intact.
 * @param ctx - Browser context carrying the slot registry.
 * @returns Restorer that puts the original components back.
 */
function wrapAgentChatRows(
  ctx: ClientContext,
  useControlScroll: () => boolean,
): () => void {
  const restores: Array<() => void> = []
  const wrapped = new WeakSet<object>()

  const wrapAll = (): void => {
    for (const entry of ctx.slots.entries('conversation.chat.node')) {
      const key = entry.options.key
      if (key === undefined || SKIP_WRAP.has(key)) continue
      const current = entry.component
      if (!isWrappableComponent(current) || wrapped.has(current)) continue
      const inner = current as ComponentType<FollowWrapProps>
      const next = wrapFollowNodeView(inner, useControlScroll, { reveal: !REVEAL_SKIP.has(key) })
      wrapped.add(next)
      entry.component = next
      restores.push(() => {
        if (entry.component === next) entry.component = inner
      })
    }
  }

  wrapAll()
  const off = ctx.on('slots/changed', (key: string) => {
    if (key === 'conversation.chat.node') wrapAll()
  })
  return () => {
    off()
    for (const restore of restores) restore()
  }
}

/**
 * A live settings cell shared by the renderer lifecycle and React views. It
 * starts on the shared defaults and follows the native settings scope once the
 * `settingsScope` service binds this plugin's namespace.
 */
class SettingsCell {
  private readonly listeners = new Set<() => void>()
  private scope: SettingsScope<StreamSettings> | undefined
  private detach: (() => void) | undefined
  private value: StreamSettings = DEFAULT_STREAM_SETTINGS
  private pending = false

  /** Re-point the cell at the native namespace scope. */
  attach(scope: SettingsScope<StreamSettings>): () => void {
    this.scope = scope
    this.refresh()
    const unsubscribe = scope.subscribe(() => { this.refresh() })
    const release = (): void => {
      unsubscribe()
      if (this.scope !== scope) return
      this.scope = undefined
      this.refresh()
    }
    this.detach = release
    return () => {
      if (this.detach === release) this.detach = undefined
      release()
    }
  }

  private read(): StreamSettings {
    const value = this.scope?.getSnapshot().value
    return value === undefined ? this.value : value
  }

  private refresh(): void {
    const next = this.read()
    const pending = this.scope?.getSnapshot().status === 'loading'
    if (
      pending === this.pending
      && next.enabled === this.value.enabled
      && next.controlScroll === this.value.controlScroll
      && next.motionPreference === this.value.motionPreference
      && next.thinkAutoExpand === this.value.thinkAutoExpand
      && next.debugEnabled === this.value.debugEnabled
      && next.debugTuning === this.value.debugTuning
    ) return
    this.pending = pending
    this.value = next
    for (const listener of this.listeners) listener()
  }

  /** False while an available settings service is resolving its authority. */
  takeoverEnabled(): boolean {
    return !this.pending && this.value.enabled
  }

  readonly getSnapshot = (): StreamSettings => this.value

  readonly subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

/**
 * Register the typewriter renderer after the Chat package declares the keyed
 * Chat node seat. A lower priority shadows the built-in assistant row; every
 * other keyed renderer is wrapped in place so Context, commands, Tool cards,
 * retries, and workflow runs share one extensible follow boundary — with the
 * Tool row's own text left unpaced (see {@link REVEAL_SKIP}). The Host-bridged
 * configuration selects the render direction, smoothing preset, and glide
 * speed, while the native settings namespace supplies the live preferences.
 * @param ctx - Browser context carrying the shared slot registry.
 */
export function apply(ctx: ClientContext): void {
  const config = readBootConfig()
  const settings = new SettingsCell()
  const useControlScroll = (): boolean => useSyncExternalStore(
    settings.subscribe,
    () => settings.getSnapshot().controlScroll,
    () => settings.getSnapshot().controlScroll,
  )

  // Preferences live in the Host-registered settings namespace and reach the
  // browser through the native `settingsScope` service, so no plugin-owned
  // settings transport is needed. Connection only powers the card's version
  // line and its update button, and the stream still applies with defaults
  // when neither service is composed.
  ctx.inject(['slots', 'locale', 'settingsScope'], (settingsCtx) => {
    const scope = settingsCtx.settingsScope.bind<StreamSettings>({ namespace: STREAM_SETTINGS_NS })
    // The shared Context augmentation also carries the Host-side Connection
    // shape, so narrow through unknown to its client contract here. Absent
    // Connection only hides the card's version line and update button.
    const connection = settingsCtx.get('connection') as unknown as ConnectionHandle | undefined
    const card = new SmoothStreamCardController({
      scope,
      pluginApi: connection === undefined ? undefined : createSmoothStreamPluginApi(connection),
      isLoopback: connection?.isLoopback === true,
    })
    const detachSettings = settings.attach(scope)
    const syncDebug = (): void => {
      const snapshot = card.getSnapshot()
      debugRuntime.syncSettings({
        available: snapshot.debugAvailable,
        enabled: snapshot.debugEnabled,
        writable: snapshot.writable && !snapshot.saving,
        dirty: snapshot.dirty,
        status: snapshot.status,
        tuning: snapshot.debugTuning,
      })
    }
    const detachBinding = debugRuntime.bindSettings({
      edit: patch => { card.inject().edit(patch) },
      save: () => { card.inject().save() },
      discard: () => { card.inject().discard() },
    })
    const detachDebug = card.subscribe(syncDebug)
    syncDebug()
    card.start()
    const t = settingsCtx.locale.bind(SETTINGS_NS)
    settingsCtx.effect(() => settingsCtx.locale.register(SETTINGS_NS, { zh, en }), 'dsh-smooth-stream: settings dictionaries')
    // The 「阅读体验」 page hosts this plugin's card together with the other
    // reading plugins: whoever activates first claims the page, the rest only
    // register cards into its child slot.
    settingsCtx.slots.inject('settings.section', () => claimReadingSettingsPage(
      settingsCtx,
      () => t('pageNav'),
      SETTINGS_NS,
    ))
    settingsCtx.slots.inject(READING_ITEM_SLOT, () => settingsCtx.slots.register({
      name: READING_ITEM_SLOT,
      id: STREAM_SETTINGS_NS,
      order: 10,
      locale: SETTINGS_NS,
      inject: () => card.inject(),
    }, SmoothStreamCard))
    settingsCtx.slots.inject('conversation.session.header.utilities', () => settingsCtx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'smooth-stream-debug',
      order: 40,
      locale: SETTINGS_NS,
      inject: () => debugRuntime.panelFace(),
    }, DebugPanel))
    return () => {
      card.stop()
      detachDebug()
      detachSettings()
      detachBinding()
    }
  })

  const configured = function StreamConfiguredView(props: AssistantProps) {
    const preferences = useSyncExternalStore(
      settings.subscribe,
      settings.getSnapshot,
      settings.getSnapshot,
    )
    return createElement(TypewriterAssistantNodeView, {
      ...props,
      mode: config.mode,
      preset: config.preset,
      revealCharsPerSec: config.revealCharsPerSec,
      scrollSpeedPxPerSec: config.scrollSpeedPxPerSec,
      maxScrollSpeedPxPerSec: config.maxScrollSpeedPxPerSec,
      thinkAutoExpand: preferences.thinkAutoExpand,
      controlScroll: preferences.controlScroll,
      motionPreference: preferences.motionPreference,
    })
  }
  ctx.slots.inject('conversation.chat.node', () => {
    let releaseTakeover: (() => void) | undefined

    const syncTakeover = (): void => {
      if (!settings.takeoverEnabled()) {
        releaseTakeover?.()
        releaseTakeover = undefined
        return
      }
      if (releaseTakeover !== undefined) return
      const unwrap = wrapAgentChatRows(ctx, useControlScroll)
      const unshadow = ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'assistant-step',
        priority: -100,
        // 0.1.5-rc.1 carries the Chat node's dictionary namespace as `chat`.
        locale: 'chat',
        registrant: '@lynn123411/dsh-smooth-stream',
      }, configured)
      releaseTakeover = () => {
        // Stop observing slot changes before the shadow entry is removed.
        unwrap()
        unshadow()
      }
    }

    const unsubscribe = settings.subscribe(syncTakeover)
    syncTakeover()
    return () => {
      unsubscribe()
      releaseTakeover?.()
    }
  })
}

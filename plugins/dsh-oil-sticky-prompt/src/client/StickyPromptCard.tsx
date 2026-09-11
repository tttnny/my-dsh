/**
 * The sticky-prompt card inside the shared 「阅读体验」 settings page.
 *
 * One preference, written straight through the bound namespace scope: the Host
 * document stays the single authority, so the card keeps no draft state and the
 * browser half follows the committed value live. The chrome mirrors the shipped
 * plugin-card look with inline styles, because the Host cards' styles are not
 * exported for reuse and this plugin ships no CSS pipeline to keep it
 * dependency-light.
 */

import { useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_STICKY_PROMPT_SETTINGS, type StickyPromptSettings } from '../settings.ts'

/** Business face this card's registration injects. */
export interface StickyPromptCardFace {
  /** Bound scope of this plugin's Host settings namespace. */
  scope: SettingsScope<StickyPromptSettings>
}

/** Props the renderer binds for the sticky-prompt card. */
export type StickyPromptCardProps =
  PropsRuntime<'reading.settings.item'>
  & PropsLocale<'settings.oilStickyPrompt'>
  & InjectFace<StickyPromptCardFace>

/** Card chrome, mirroring the shipped plugin-card look through theme tokens. */
const styles: Record<string, CSSProperties> = {
  card: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '12px',
    background: 'var(--dsw-alias-bg-layer-3)',
  },

  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '14px 16px 12px',
  },

  name: {
    fontWeight: 600,
    fontSize: '15px',
    lineHeight: 1.4,
    color: 'var(--dsw-alias-label-primary)',
  },

  description: {
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },

  body: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 16px',
    paddingBottom: '8px',
    borderTop: '1px solid var(--dsw-alias-border-l2)',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 0',
  },

  fieldHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },

  label: {
    flex: 1,
    minWidth: 0,
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: 1.5,
    color: 'var(--dsw-alias-label-primary)',
  },

  toggle: {
    flex: 'none',
    width: '16px',
    height: '16px',
    accentColor: 'var(--dsw-alias-brand-primary)',
    cursor: 'pointer',
  },

  hint: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },

  statusLine: {
    margin: 0,
    paddingBottom: '8px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--dsw-alias-label-tertiary)',
  },

  failure: {
    margin: 0,
    paddingBottom: '8px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'var(--dsw-alias-label-error)',
  },
}

/** Status copy for a scope that cannot serve an edit right now. */
function statusKey(snapshot: SettingsScopeSnapshot<StickyPromptSettings>): 'loading' | 'readOnly' | 'unavailable' | undefined {
  if (snapshot.status === 'loading') return 'loading'
  if (snapshot.status === 'unavailable') return 'unavailable'
  return snapshot.writable ? undefined : 'readOnly'
}

/** Render the sticky-prompt card independently of the core settings namespace allowlist. */
export function StickyPromptCard(props: StickyPromptCardProps) {
  const { t, scope } = props
  // The scope is a live mirror owned by the settings service: subscribing keeps
  // the row honest when the Host document changes elsewhere, including the
  // rollback a refused write performs.
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  const [failed, setFailed] = useState(false)
  const status = statusKey(snapshot)
  const enabled = snapshot.value?.enabled ?? DEFAULT_STICKY_PROMPT_SETTINGS.enabled

  const write = (next: boolean): void => {
    setFailed(false)
    void scope.set('enabled', next).catch(() => { setFailed(true) })
  }

  return (
    <li style={styles.card}>
      <div style={styles.header}>
        <span style={styles.name}>{t('title')}</span>
        <span style={styles.description}>{t('description')}</span>
      </div>
      <div style={styles.body}>
        <label style={styles.field}>
          <span style={styles.fieldHead}>
            <span style={styles.label}>{t('enabled')}</span>
            <input
              type="checkbox"
              style={styles.toggle}
              checked={enabled}
              disabled={status !== undefined}
              onChange={(event) => { write(event.target.checked) }}
            />
          </span>
          <span style={styles.hint}>{t('enabledHint')}</span>
        </label>
        {status === undefined ? null : <p style={styles.statusLine} role="status">{t(status)}</p>}
        {failed ? <p style={styles.failure} role="status">{t('writeFailed')}</p> : null}
      </div>
    </li>
  )
}

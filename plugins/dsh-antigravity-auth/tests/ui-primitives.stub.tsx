/**
 * Vitest stand-in for the `ui-primitives` baseline module.
 *
 * The published package's Node entry is a barrel that imports roughly twenty
 * build-time-only dependencies (`clsx`, `shiki`, `katex`, `micromark`, …). It
 * declares none of them as runtime dependencies because the Web shell inlines
 * them into the browser bundle, so the module only resolves inside that bundle
 * and Node resolution fails on the first missing one. This fixture mirrors the
 * five exports the settings card uses — the same element shape, roles, and prop
 * pass-through as the shipped controls — so the client specs can render the
 * card. It is wired in through the `resolve.alias` table in `vitest.config.ts`.
 */
import { createElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

/** Clickable action: a native button that passes its attributes through. */
export function Button({ variant, size, icon, className, children, ...rest }: {
  variant?: string
  size?: string
  icon?: ReactNode
  className?: string
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return createElement(
    'button',
    { type: 'button', className, 'data-variant': variant, 'data-size': size, ...rest },
    icon === undefined || icon === null ? null : createElement('span', null, icon),
    children,
  )
}

/** Single-line entry: a wrapper span around the native input, attributes through. */
export function Input({ icon, className, ...rest }: {
  icon?: ReactNode
  className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return createElement(
    'span',
    { className },
    icon === undefined || icon === null ? null : createElement('span', null, icon),
    createElement('input', rest),
  )
}

/** Two-state toggle: the shipped `role="switch"` + `aria-checked` button. */
export function Switch({ checked, onChange, label, disabled = false, title, className }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}) {
  return createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked,
    'aria-label': label,
    title,
    disabled,
    className,
    onClick: () => { onChange(!checked) },
  })
}

/** Decorative status mark; the render site owns the accessible name. */
export function StateDot({ state, size, className }: {
  state?: string
  size?: number
  className?: string
}) {
  return createElement('span', { className, 'aria-hidden': true, 'data-state': state, 'data-size': size })
}

/** Refresh glyph; the card only renders it, so a decorative span is enough. */
export function IconRefreshOutlineRegular({ size, className }: {
  size?: number
  className?: string
}) {
  return createElement('span', { className, 'aria-hidden': true, 'data-size': size })
}
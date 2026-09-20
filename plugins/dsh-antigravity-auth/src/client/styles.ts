/** Embedded CSS stylesheet for value-safe Antigravity settings UI. */

export const SETTINGS_CSS = `
.agy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 4px 0 32px;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-primary);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

.agy-settings *,
.agy-settings *::before,
.agy-settings *::after {
  box-sizing: border-box;
}

.agy-bundle-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.agy-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-bundle-title {
  margin: 0;
  font: var(--dsw-font-l-20);
  color: var(--dsw-alias-label-primary);
}

/* Layout wrapper for the decorative StateDot; the name lives on role="status". */
.agy-status {
  display: inline-flex;
  align-items: center;
  flex: none;
}

.agy-bundle-intro,
.agy-card-intro {
  margin: 4px 0 0;
  font: var(--dsw-font-xs-13);
  color: var(--dsw-alias-label-tertiary);
}

.agy-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.agy-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l2);
}

/* Logged in but paused by the master switch: a dashed affordance keeps 1px. */
.agy-card[data-state="paused"] {
  border: 1px dashed var(--dsw-alias-border-l2);
}

.agy-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agy-card-identity {
  min-width: 0;
  flex: 1;
}

.agy-card-title {
  margin: 0;
  font: var(--dsw-font-s-strong-14);
  color: var(--dsw-alias-label-primary);
}

.agy-card-action {
  flex: none;
  display: flex;
  align-items: center;
}

.agy-card-subtext,
.agy-paused-hint {
  margin: 0;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-tertiary);
}

/* Quota Section */
.agy-quota-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.agy-quota-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.agy-quota-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l1);
}

.agy-quota-group-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agy-quota-group-title {
  margin: 0;
  font: var(--dsw-font-xxxs-strong-11);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}

.agy-quota-group-desc {
  margin: 0;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-tertiary);
}

.agy-quota-buckets {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}

.agy-quota-bucket {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agy-quota-bucket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font: var(--dsw-font-xxs-12);
}

.agy-quota-bucket-name {
  font: var(--dsw-font-xxs-strong-12);
  color: var(--dsw-alias-label-secondary);
}

.agy-quota-bucket-val {
  font: var(--dsw-font-xxs-strong-12);
  font-family: var(--ds-font-family-code);
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
  animation: agy-fade-in var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}

.agy-quota-bucket-val[data-tone='normal'] {
  color: var(--dsw-alias-state-success-primary);
}

.agy-quota-bucket-val[data-tone='warning'] {
  color: var(--dsw-alias-state-warn-primary);
}

.agy-quota-bucket-val[data-tone='error'] {
  color: var(--dsw-alias-state-error-primary);
}

.agy-quota-querying {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-tertiary);
  animation: agy-fade-in var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}

/* Spinner ring track: the one border the system allowlists above 0.5px. */
/* ui-style-allow: wide-neutral-border */
.agy-querying-spinner {
  display: inline-block;
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  corner-shape: round;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  animation: agy-spin 0.8s linear infinite;
}

.agy-progress-track {
  position: relative;
  height: 6px;
  width: 100%;
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
}

.agy-progress-bar {
  height: 100%;
  border-radius: 999px;
  corner-shape: round;
  transform-origin: left center;
  animation: agy-fill-progress var(--ds-transition-duration-slow) var(--ds-ease-in-out) forwards;
  transition:
    width var(--ds-transition-duration-slow) var(--ds-ease-in-out),
    background var(--ds-transition-duration-slow) var(--ds-ease-in-out);
}

.agy-progress-bar[data-tone='normal'] {
  background: var(--dsw-alias-state-success-primary);
}

.agy-progress-bar[data-tone='warning'] {
  background: var(--dsw-alias-state-warn-primary);
}

.agy-progress-bar[data-tone='error'] {
  background: var(--dsw-alias-state-error-primary);
}

.agy-shimmer-track {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  corner-shape: round;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--dsw-alias-bg-skeleton) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: agy-shimmer-stream 1.6s var(--ds-ease-in-out) infinite;
}

.agy-quota-subtext {
  font: var(--dsw-font-xxxs-11);
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}

@keyframes agy-fill-progress {
  from {
    transform: scaleX(0);
    opacity: 0.7;
  }
  to {
    transform: scaleX(1);
    opacity: 1;
  }
}

@keyframes agy-shimmer-stream {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes agy-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes agy-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Actions */
.agy-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.agy-refresh-btn {
  margin-left: auto;
}

/* The authorization target stays a real anchor; it colors as a link. */
.agy-auth-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 2px;
  font: var(--dsw-font-xs-13);
  font-weight: 500;
  color: var(--dsw-alias-link);
  text-decoration: none;
}

.agy-auth-link:hover,
.agy-auth-link:focus-visible {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.agy-auth-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary);
}

.agy-spin-icon {
  display: inline-flex;
  animation: agy-spin 1s linear infinite;
}

.agy-footer-notice {
  margin: 6px 0 0;
  font: var(--dsw-font-xxxs-11);
  color: var(--dsw-alias-label-tertiary);
}

.agy-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  font: var(--dsw-font-xxs-12);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}

.agy-manual-callback-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
  border: 1px dashed var(--dsw-alias-border-l2);
}

.agy-manual-callback-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Layout seat for the Input primitive inside the callback row. */
.agy-callback-input {
  flex: 1;
  min-width: 0;
}

@media (prefers-reduced-motion: reduce) {
  .agy-quota-bucket-val,
  .agy-quota-querying,
  .agy-querying-spinner,
  .agy-progress-bar,
  .agy-shimmer-track,
  .agy-spin-icon {
    animation: none;
    transition: none;
  }
}
`

const STYLE_ELEMENT_ID = 'dsh-antigravity-auth-styles'

export function ensureSettingsStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ELEMENT_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = SETTINGS_CSS
  document.head.appendChild(style)
}
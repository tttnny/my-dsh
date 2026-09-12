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
  color: var(--dsw-alias-label-primary, #e6edf3);
  font-family: var(--dsw-font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif);
  font-size: 13px;
  line-height: 1.5;
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
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
  flex: none;
}

.agy-bundle-intro,
.agy-card-intro {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary, #8b949e);
  font-size: 13px;
  line-height: 20px;
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
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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

.agy-card-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-card-title {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-card-action {
  flex: none;
  display: flex;
  align-items: center;
}

.agy-risk-card {
  background: rgba(234, 179, 8, 0.04);
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agy-risk-text {
  color: var(--dsw-alias-label-secondary, #9ca3af);
  font-size: 13px;
  line-height: 19px;
  margin: 0;
}

.agy-link-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0;
}

.agy-link {
  color: var(--dsw-alias-interactive-text, #38bdf8);
  font-size: 12px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.agy-link:hover {
  text-decoration: underline;
  color: #7dd3fc;
}

.agy-ack-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-checkbox {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--dsw-alias-button-primary-fill, #3b82f6);
  cursor: pointer;
}

.agy-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.agy-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 16px;
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
}

.agy-fact {
  min-width: 0;
}

.agy-fact dt {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, #8b949e);
}

.agy-fact dd {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

/* Quota Section */
.agy-quota-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.agy-quota-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.15));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.03));
}

.agy-quota-group-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agy-quota-group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #a1a1aa);
}

.agy-quota-group-desc {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #71717a);
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
  font-size: 12px;
  line-height: 18px;
}

.agy-quota-bucket-name {
  font-weight: 500;
  color: var(--dsw-alias-label-secondary, #d4d4d8);
}

.agy-quota-bucket-val {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  color: var(--dsw-alias-label-primary, #ffffff);
  animation: agy-fade-in 250ms ease;
}

.agy-quota-bucket-val[data-tone='normal'] {
  color: var(--dsw-alias-state-success-label, #10b981);
}

.agy-quota-bucket-val[data-tone='warning'] {
  color: var(--dsw-alias-state-warn-label, #f59e0b);
}

.agy-quota-bucket-val[data-tone='error'] {
  color: var(--dsw-alias-state-error-label, #ef4444);
}

.agy-quota-querying {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 12px;
  line-height: 18px;
  animation: agy-fade-in 200ms ease;
}

.agy-querying-spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  border-top-color: var(--dsw-alias-brand-primary, #4f6ef7);
  animation: agy-spin 0.8s linear infinite;
  display: inline-block;
  flex: none;
}

.agy-progress-track {
  position: relative;
  height: 6px;
  width: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08));
  overflow: hidden;
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

.agy-progress-bar {
  height: 100%;
  border-radius: 999px;
  transform-origin: left center;
  animation: agy-fill-progress 650ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: width 400ms cubic-bezier(0.16, 1, 0.3, 1), background 400ms ease;
}

.agy-progress-bar[data-tone='normal'] {
  background: linear-gradient(90deg, #f59e0b 0%, #10b981 35%, #059669 100%);
}

.agy-progress-bar[data-tone='warning'] {
  background: linear-gradient(90deg, #ef4444 0%, #f97316 40%, #f59e0b 100%);
}

.agy-progress-bar[data-tone='error'] {
  background: linear-gradient(90deg, #f87171 0%, #ef4444 50%, #dc2626 100%);
}

.agy-shimmer-track {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) 25%,
    var(--dsw-alias-fill-secondary, rgba(255, 255, 255, 0.14)) 50%,
    var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) 75%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: agy-shimmer-stream 1.6s ease-in-out infinite;
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

.agy-quota-subtext {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-variant-numeric: tabular-nums;
}

/* Actions */
.agy-action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.agy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08));
  color: var(--dsw-alias-label-primary, #e6edf3);
  text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.agy-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.12));
}

.agy-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.agy-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #18181b);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
}

.agy-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, #27272a);
}

.agy-btn-outline {
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-btn-outline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
}

.agy-btn-ghost {
  background: transparent !important;
  border-color: transparent !important;
  color: var(--dsw-alias-label-secondary, #a1a1aa) !important;
  padding: 0 10px !important;
  border-radius: 6px !important;
}

.agy-btn-ghost:hover:not(:disabled) {
  background: var(--dsw-alias-fill-tertiary, rgba(255, 255, 255, 0.06)) !important;
  color: var(--dsw-alias-label-primary, #ffffff) !important;
}

.agy-refresh-btn {
  margin-left: auto;
}

.agy-footer-notice {
  margin: 6px 0 0;
  color: var(--dsw-alias-label-tertiary, #71717a);
  font-size: 11px;
  line-height: 17px;
}

.agy-privacy {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #6e7681);
  margin: 4px 0 0;
}

.agy-alert {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 18px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.agy-item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agy-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.05));
  border-radius: 8px;
}

.agy-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #e6edf3);
}

.agy-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  flex: none;
}

.agy-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
}

.agy-badge-available {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.agy-badge-available .agy-badge-dot {
  background: #22c55e;
}

.agy-badge-disabled {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.agy-badge-disabled .agy-badge-dot {
  background: #64748b;
}

.agy-badge-warning {
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
  border: 1px solid rgba(234, 179, 8, 0.25);
}

.agy-badge-warning .agy-badge-dot {
  background: #eab308;
}

.agy-badge-error {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.agy-badge-error .agy-badge-dot {
  background: #ef4444;
}

/* Switch Component */
.agy-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 20px;
  cursor: pointer;
  user-select: none;
}

.agy-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.agy-switch-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--dsw-alias-bg-layer-4, rgba(255, 255, 255, 0.15));
  border-radius: 20px;
  transition: 0.2s ease;
}

.agy-switch-slider::before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.agy-switch input:checked + .agy-switch-slider {
  background-color: var(--dsw-alias-button-primary-fill, #2563eb);
}

.agy-switch input:checked + .agy-switch-slider::before {
  transform: translateX(16px);
}

.agy-switch input:disabled + .agy-switch-slider {
  opacity: 0.4;
  cursor: not-allowed;
}

.agy-spin-icon {
  display: inline-flex;
  animation: agy-spin 1s linear infinite;
}

@keyframes agy-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.agy-manual-callback-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.04));
  border: 1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
}

.agy-manual-callback-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agy-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15));
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2));
  color: var(--dsw-alias-label-primary, #e6edf3);
  font-size: 13px;
  outline: none;
}

.agy-input:focus {
  border-color: var(--dsw-alias-color-primary, #10b981);
}

.agy-input::placeholder {
  color: var(--dsw-alias-label-tertiary, #8b949e);
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

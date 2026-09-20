export const SETTINGS_CSS = String.raw`
.dsh-tidy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 580px;
  padding-bottom: 32px;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-s-14);
}

.dsh-tidy-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  /* The shipped settings-card surface; Input's own bg-layer-1 then reads as a
     recessed field in the dark theme instead of vanishing into the card. */
  background: var(--dsw-alias-bg-layer-3);
}

.dsh-tidy-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font: var(--dsw-font-s-strong-14);
}

.dsh-tidy-desc {
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.dsh-tidy-desc code {
  font-family: var(--ds-font-family-code);
}

.dsh-tidy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
}

.dsh-tidy-row + .dsh-tidy-row {
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

.dsh-tidy-row-info {
  flex: 1;
  min-width: 0;
}

.dsh-tidy-row-title {
  font: var(--dsw-font-xs-strong-13);
}

.dsh-tidy-row-desc {
  margin-top: 2px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxxs-11);
}

/* Field widths ride Input's wrapper span; the atom owns its own appearance. */
.dsh-tidy-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dsh-tidy-field-wide {
  width: 260px;
}

.dsh-tidy-field-timeout {
  width: 120px;
}

.dsh-tidy-field-count {
  width: 88px;
}

.dsh-tidy-test-result {
  margin-left: 10px;
  font: var(--dsw-font-xxs-12);
}

.dsh-tidy-test-result.ok {
  color: var(--dsw-alias-state-success-primary);
}

.dsh-tidy-test-result.fail {
  color: var(--dsw-alias-state-error-primary);
}

.dsh-tidy-behavior-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 4px 0 0;
  padding-left: 18px;
}
`;
export const SETTINGS_CSS = String.raw`
.dsh-tidy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
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

/*
 * Prose keeps a reading measure even though the card spans the host column: a
 * paragraph running the full width lands near 76 CJK characters per line. 46em
 * tracks the element's own 12px font, so the measure survives a font-size
 * change.
 */
.dsh-tidy-desc {
  max-width: 46em;
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

/*
 * 提示词输入框：这里不用宿主的 InlineEditor——它是「Enter 存、Esc 撤、
 * 最高六行」的短草稿控件，而这段指令有十几行，要按内容长高、且默认只读。
 * 外观取 Input 的同款令牌（细边框、行内代码字族、底色下陷一层）；高度由组件
 * 按内容量出来写进 style，这里只给一个不让它塌掉的下限。
 *
 * 默认是只读态（:read-only）：边框收淡、底色回到卡片那层，光标不动手；点
 * 「编辑」后才换成可写的下陷观感，一眼能看出此刻改不改得动。
 */
.dsh-tidy-prompt {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  margin: 0;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  outline: none;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  font-family: var(--ds-font-family-code);
  line-height: 1.6;
  overflow: hidden;
  resize: none;
}

.dsh-tidy-prompt:read-only {
  border-color: var(--dsw-alias-border-l2);
  background: transparent;
  cursor: default;
}

.dsh-tidy-prompt:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

/* 标题右侧的按钮组：编辑态多出「恢复默认」与「完成」，与标题同一行排开。 */
.dsh-tidy-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* The save row keeps its two items together at the start of the row instead of
   pushing them to the card's edges, so the hint reads as part of the button. */
.dsh-tidy-actions {
  justify-content: flex-start;
  gap: 10px;
}

.dsh-tidy-hint {
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-11);
}

`;
/** Shared workflow record data and formatting contracts (plain-JS port). */

/** Closed set of workflow record kinds. */
const WorkflowCellKind = {
  SYSTEM: 'system',
  USER: 'user',
  CONTEXT: 'context',
  COMPACTED: 'compacted',
  MESSAGE: 'message',
  TOOL: 'tool',
  SUBTOOL: 'subtool',
};

/**
 * Resolve the identity that survives prepending older projected records.
 * @param cell - Projected workflow record.
 * @returns Stable identity from the owning event or tool call, with a fixture fallback.
 */
function workflowRecordId(cell) {
  if (cell.recordId !== undefined) return cell.recordId;
  if (cell.callId !== undefined) return `${cell.kind}\u0000call\u0000${cell.callId}`;
  if (cell.sourceSeq !== undefined) return `${cell.kind}\u0000seq\u0000${cell.sourceSeq}`;
  return `${cell.kind}\u0000index\u0000${cell.index}`;
}

/**
 * Format a duration in milliseconds with thousands separators.
 * @param milliseconds - Duration in milliseconds, or null when absent.
 * @returns em dash when unknown, otherwise an integer-millisecond label.
 */
function formatDurationMillis(milliseconds) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '—';
  const integer = String(Math.round(milliseconds));
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ms`;
}

/**
 * Format an elapsed duration given in seconds as a millisecond label.
 * @param seconds - Duration seconds, or null when absent.
 * @returns em dash when unknown, otherwise an integer-millisecond label.
 */
function formatElapsedSeconds(seconds) {
  return formatDurationMillis(seconds === null ? null : seconds * 1000);
}

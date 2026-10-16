/**
 * The plugin's own log, kept in the Host's memory.
 *
 * The Host's native subagent list has no model column and a plugin cannot add
 * one, so this log is the only place a delegation's assigned route is visible.
 * It is deliberately disposable: it lives for one Host process and is gone on
 * restart, which is what the reader asked for.
 */

import type { LogEntry } from './types.ts';

/** How many entries the page keeps. */
export const LOG_LIMIT = 20;

/** A bounded, newest-first ring of log entries. */
export class LogStore {
  private entries: LogEntry[] = [];

  /**
   * Append one entry, dropping the oldest beyond {@link LOG_LIMIT}.
   * @param entry - the entry to append.
   */
  append(entry: LogEntry): void {
    this.entries = [entry, ...this.entries].slice(0, LOG_LIMIT);
  }

  /**
   * Read the log, newest first.
   * @returns a detached copy, so a reader cannot mutate the ring.
   */
  list(): LogEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

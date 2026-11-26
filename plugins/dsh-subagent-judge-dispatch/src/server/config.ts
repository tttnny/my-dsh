/**
 * This plugin's Config schema and the live read face the wiring consumes.
 *
 * Every field is `volatile()`, which is what lets the configuration card on the
 * Plugins page commit an edit into these refs without remounting the plugin:
 * the wiring reads the current value on every delegation rather than a snapshot
 * taken when the Host loaded.
 *
 * The type-list rows carry no sequence number. The page numbers the rows the
 * judge is offered — switched on and filled in — counting from 1 in array
 * order; the judge answers with that number, and the log shows it, so a number
 * can never be duplicated and the reader never has to maintain one. A row that
 * is switched off or not filled in keeps its place in the list but carries no
 * number, which is why the numbers offered to the judge stay continuous.
 */

import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type Schema from '@deepseek-ai/schemastery';
import { resolveEndpointUrl } from './endpoint.ts';
import { numberTypeRows, selectableRows } from './judge-prompt.ts';
import type { TypeRow } from './types.ts';
import { DEFAULT_ENABLED, enabledFor, type SessionOverrides } from '../enablement.ts';

/** One type-list row as the configuration document stores it. */
const TypeRowSchema = z.object({
  /** Whether this type takes part in judgements; a row written before the switch existed counts as on. */
  enabled: z.boolean().default(true),
  /** Criterion text the judge reads for this type. */
  description: z.string().default(''),
  /** Provider route of the model this type runs on. */
  provider: z.string().default(''),
  /** Model id interpreted by that provider. */
  model: z.string().default(''),
  /** Reasoning effort id this type runs at. */
  effort: z.string().default(''),
});

/** This plugin's live configuration. */
export const Config: Schema = z.object({
  /** Default for conversations without their own choice. */
  enabled: z.boolean().default(DEFAULT_ENABLED).volatile(),
  sessionOverrides: z.dict(z.boolean()).default({}).volatile(),
  /** Whether judgements are written to the plugin's own log. */
  logEnabled: z.boolean().default(true).volatile(),
  /** Judge service address, as the reader typed it; the path is appended when a call is made. */
  endpointUrl: z.string().default('').volatile(),
  /** Judge model id. */
  judgeModel: z.string().default('').volatile(),
  /** The task-type list, in page order. */
  rows: z.array(TypeRowSchema).default([]).volatile(),
});

/** Fields of this plugin's Config as the runtime resolved them. */
export interface PluginConfigRefs {
  readonly enabled: Volatile<boolean>;
  readonly sessionOverrides: Volatile<SessionOverrides>;
  readonly logEnabled: Volatile<boolean>;
  readonly endpointUrl: Volatile<string>;
  readonly judgeModel: Volatile<string>;
  readonly rows: Volatile<StoredRow[]>;
}

/** One stored row, before the page assigns its sequence number. */
export interface StoredRow {
  /** Whether this type takes part in judgements. */
  enabled: boolean;
  description: string;
  provider: string;
  model: string;
  effort: string;
}

/** A detached plain read of this plugin's configuration. */
export interface ResolvedConfig {
  enabled: boolean;
  sessionOverrides: SessionOverrides;
  logEnabled: boolean;
  /** Full judge URL: the stored address with the service path applied. */
  endpointUrl: string;
  judgeModel: string;
  rows: TypeRow[];
}

/**
 * Read the current committed value of every Config field, numbering the rows.
 * @param refs - the runtime-resolved Config object.
 * @returns a detached plain config value.
 */
export function readPluginConfig(refs: PluginConfigRefs): ResolvedConfig {
  const stored = refs.rows.get();
  // The number is positional, so deleting, moving, switching off or filling in
  // a row renumbers the rest. A log entry written before that edit may therefore
  // name a different type; the reader accepted that when choosing continuous
  // numbering. A row that is not offered keeps its place and carries number 0.
  const rows: TypeRow[] = numberTypeRows((Array.isArray(stored) ? stored : []).map((row) => ({
    enabled: row?.enabled !== false,
    description: typeof row?.description === 'string' ? row.description : '',
    provider: typeof row?.provider === 'string' ? row.provider : '',
    model: typeof row?.model === 'string' ? row.model : '',
    effort: typeof row?.effort === 'string' ? row.effort : '',
  })));
  return {
    enabled: refs.enabled.get() ?? DEFAULT_ENABLED,
    sessionOverrides: refs.sessionOverrides.get(),
    logEnabled: refs.logEnabled.get() !== false,
    endpointUrl: resolveEndpointUrl(refs.endpointUrl.get()),
    judgeModel: typeof refs.judgeModel.get() === 'string' ? refs.judgeModel.get() : '',
    rows,
  };
}

/**
 * Whether a delegation would be judged given the root conversation's choice
 * and the available judgement service and task types.
 */
export function isJudgeUsable(config: ResolvedConfig, rootSessionId?: string): boolean {
  if (!enabledFor(config.sessionOverrides, config.enabled, rootSessionId)) return false;
  if (config.endpointUrl.trim() === '' || config.judgeModel.trim() === '') return false;
  return selectableRows(config.rows).length > 0;
}

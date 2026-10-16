/**
 * This plugin's Config schema and the live read face the wiring consumes.
 *
 * Every field is `volatile()`, which is what lets the configuration card on the
 * Plugins page commit an edit into these refs without remounting the plugin:
 * the wiring reads the current value on every delegation rather than a snapshot
 * taken when the Host loaded.
 *
 * The type-list rows carry no sequence number. The page assigns `1..n` from the
 * array order, the judge answers with that number, and the log shows it — so a
 * number can never be duplicated, and the reader never has to maintain one.
 */

import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type Schema from '@deepseek-ai/schemastery';
import { isSelectableRow } from './judge-prompt.ts';
import type { TypeRow } from './types.ts';

/**
 * The settings namespace this plugin owns. A namespace IS the Profile entry id,
 * so the user-editable layer is this plugin's own row in the active profile's
 * patch — the same literal as the `id` in `cordis.patch.yml`, and a different
 * literal from the npm package name the card is keyed by.
 */
export const SETTINGS_NAMESPACE = 'dsh-subagent-judge-dispatch';

/** Endpoint the page prefills: one System One example. */
export const DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:3425/v1/systemone';

/** Judge model the page prefills. */
export const DEFAULT_JUDGE_MODEL = 'future-jev/jev-latest';

/** One type-list row as the configuration document stores it. */
const TypeRowSchema = z.object({
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
  /** Whether a judgement may rewrite a subagent's model and effort. */
  enabled: z.boolean().default(true).volatile(),
  /** Whether judgements are written to the plugin's own log. */
  logEnabled: z.boolean().default(true).volatile(),
  /** Full judge endpoint URL. */
  endpointUrl: z.string().default(DEFAULT_ENDPOINT_URL).volatile(),
  /** Judge model id. */
  judgeModel: z.string().default(DEFAULT_JUDGE_MODEL).volatile(),
  /** The task-type list, in page order. */
  rows: z.array(TypeRowSchema).default([]).volatile(),
});

/** Fields of this plugin's Config as the runtime resolved them. */
export interface PluginConfigRefs {
  readonly enabled: Volatile<boolean>;
  readonly logEnabled: Volatile<boolean>;
  readonly endpointUrl: Volatile<string>;
  readonly judgeModel: Volatile<string>;
  readonly rows: Volatile<StoredRow[]>;
}

/** One stored row, before the page assigns its sequence number. */
export interface StoredRow {
  description: string;
  provider: string;
  model: string;
  effort: string;
}

/** A detached plain read of this plugin's configuration. */
export interface ResolvedConfig {
  enabled: boolean;
  logEnabled: boolean;
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
  const rows: TypeRow[] = (Array.isArray(stored) ? stored : []).map((row, index) => ({
    // The number is positional, so deleting a row renumbers the rest. A log
    // entry written before that edit may therefore name a different type; the
    // reader accepted that when choosing continuous numbering.
    id: index + 1,
    description: typeof row?.description === 'string' ? row.description : '',
    provider: typeof row?.provider === 'string' ? row.provider : '',
    model: typeof row?.model === 'string' ? row.model : '',
    effort: typeof row?.effort === 'string' ? row.effort : '',
  }));
  return {
    enabled: refs.enabled.get() !== false,
    logEnabled: refs.logEnabled.get() !== false,
    endpointUrl: typeof refs.endpointUrl.get() === 'string' ? refs.endpointUrl.get() : DEFAULT_ENDPOINT_URL,
    judgeModel: typeof refs.judgeModel.get() === 'string' ? refs.judgeModel.get() : DEFAULT_JUDGE_MODEL,
    rows,
  };
}

/**
 * Whether a judgement would do anything at all: the model-rewrite switch is on,
 * a judge endpoint and model are named, and at least one row is selectable.
 *
 * @param config - the resolved configuration.
 * @returns whether a delegation would be judged.
 */
export function isJudgeUsable(config: ResolvedConfig): boolean {
  if (!config.enabled) return false;
  if (config.endpointUrl.trim() === '' || config.judgeModel.trim() === '') return false;
  return config.rows.some(isSelectableRow);
}

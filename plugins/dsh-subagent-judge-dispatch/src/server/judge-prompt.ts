/**
 * The judgement request the plugin sends, and the answer it reads back.
 *
 * Two pure functions live here, so the whole "what did the judge decide"
 * question is answerable without a Host, a socket, or a timer:
 *
 * - {@link buildJudgeRequest} turns the type list plus the task text into the
 *   exact body that goes out.
 * - {@link readJudgeAnswer} turns whatever came back into a decision, treating
 *   every malformed, empty or off-list answer as "no decision" rather than
 *   inventing one.
 *
 * The protocol is the System One one: POST a body of `{ model, state,
 * questions }`, where each question is a `choice` carrying an `instructions`
 * line and a `criteria` map of option id to the text that option means. The
 * answer names the chosen option id.
 */

import type { TypeRow } from './types.ts';

/** The one question key the plugin asks. */
export const QUESTION_KEY = 'task_type';

/**
 * The question's instructions line.
 *
 * It says what to weigh, not what the types are: the types themselves arrive as
 * the criteria map, so the reader's own descriptions are the whole criterion
 * list and nothing here can drift from them.
 */
export const QUESTION_INSTRUCTIONS =
  'Which single task type below does the delegated job best match? '
  + 'Weigh what the job actually requires, not how it is phrased. '
  + 'Answer with the number of exactly one listed type.';

/** The option id the connectivity check offers: the only one it offers. */
export const PROBE_OPTION_ID = '1';

/** The task text the connectivity check sends. */
export const PROBE_TASK_TEXT = '连接测试：这是一次判断服务的连通性检查。';

/**
 * The connectivity check's instructions.
 *
 * It asks for the one option that exists, so an endpoint that understands the
 * protocol at all can answer it: answering it wrong is a failure of the
 * protocol, not of the reader's task list.
 */
export const PROBE_INSTRUCTIONS =
  'Answer with the number of the one option listed below.';

/** The single criterion the connectivity check offers. */
export const PROBE_CRITERION = '确认这次调用可以完成。';

/** One option of the judge's question. */
export interface JudgeChoice {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

/** The exact body sent to the judge endpoint. */
export interface JudgeRequest {
  model: string;
  state: { message: string };
  questions: { [QUESTION_KEY]: JudgeChoice };
}

/**
 * Whether one row is complete enough to be offered to the judge.
 *
 * A row needs its provider, model and effort: a half-filled row could otherwise
 * be chosen and then have nothing to write, which would turn the reader's
 * unfinished edit into a delegation that silently lost its route. This is the
 * ONE place that rule lives — the page, the config gate and the rewrite all ask
 * this function rather than restating the three comparisons.
 *
 * The parameter is narrowed to the three fields the rule reads, so the page's
 * draft row (which carries no sequence number) and the server's numbered row
 * both satisfy it without either shape being converted into the other.
 *
 * @param row - one row, numbered or drafted.
 * @returns whether the judge may choose it.
 */
export function isSelectableRow(row: Pick<TypeRow, 'provider' | 'model' | 'effort'>): boolean {
  return row.provider.trim() !== '' && row.model.trim() !== '' && row.effort.trim() !== '';
}

/**
 * Which rows may be offered to the judge.
 * @param rows - every row on the page, in page order.
 * @returns the rows the judge may choose, in page order.
 */
export function selectableRows(rows: readonly TypeRow[]): TypeRow[] {
  return rows.filter(isSelectableRow);
}

/**
 * Build the exact body sent to the judge endpoint.
 *
 * @param rows - the selectable rows, in page order.
 * @param model - the judge model id.
 * @param taskText - the delegated job's text.
 * @returns the request body.
 */
export function buildJudgeRequest(
  rows: readonly TypeRow[],
  model: string,
  taskText: string,
): JudgeRequest {
  const criteria: Record<string, string> = {};
  for (const row of rows) criteria[String(row.id)] = row.description;
  return {
    model,
    state: { message: taskText },
    questions: {
      [QUESTION_KEY]: {
        type: 'choice',
        instructions: QUESTION_INSTRUCTIONS,
        criteria,
      },
    },
  };
}

/**
 * Build the body the connectivity check sends.
 *
 * It carries its own single option rather than the reader's task types: the
 * question the button answers is "does this endpoint and model work", and that
 * question has an answer before any type list exists. Requiring a finished list
 * first would make the check unable to tell a reader with an empty list from a
 * reader whose endpoint is down.
 *
 * @param model - the judge model id.
 * @returns the request body.
 */
export function buildProbeRequest(model: string): JudgeRequest {
  return {
    model,
    state: { message: PROBE_TASK_TEXT },
    questions: {
      [QUESTION_KEY]: {
        type: 'choice',
        instructions: PROBE_INSTRUCTIONS,
        criteria: { [PROBE_OPTION_ID]: PROBE_CRITERION },
      },
    },
  };
}

/**
 * Serialize one request body the way the page shows it.
 *
 * Both the preview and a logged judgement display this text, while the call
 * itself sends the same object compacted onto the wire. Deriving both from one
 * body is what keeps the shown text from describing a different request than
 * the one that went out.
 *
 * @param body - the request body.
 * @returns the pretty-printed JSON.
 */
export function formatJudgeRequest(body: JudgeRequest): string {
  return JSON.stringify(body, null, 2);
}

/**
 * The text the configuration page's preview shows.
 *
 * It is the request body minus the task text, because no task text exists until
 * a delegation happens; the preview marks that spot instead of inventing one.
 *
 * @param rows - the selectable rows, in page order.
 * @param model - the judge model id.
 * @returns the pretty-printed preview text.
 */
export function buildPreview(rows: readonly TypeRow[], model: string): string {
  return formatJudgeRequest(buildJudgeRequest(rows, model, '（派工时才填）'));
}

/** What reading the judge's answer produced. */
export type JudgeDecision =
  | { kind: 'row'; row: TypeRow }
  | { kind: 'empty' }
  | { kind: 'unmatched' };

/**
 * Find the chosen option id inside whatever the endpoint answered.
 *
 * The protocol's own shape is `answers.<key>.choice`; the two fallbacks are the
 * ones the reference clients read, so an endpoint that answers the shorter way
 * still works. Anything else — a missing body, a non-string, an empty string —
 * yields `undefined` and is treated as no answer.
 *
 * @param payload - the decoded response body.
 * @returns the chosen option id, or undefined when the body names none.
 */
export function readChoice(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const body = payload as Record<string, unknown>;
  const answers = body.answers;
  const fromAnswers =
    typeof answers === 'object' && answers !== null
      ? (answers as Record<string, unknown>)[QUESTION_KEY]
      : undefined;
  const candidate = fromAnswers ?? body[QUESTION_KEY];
  if (typeof candidate === 'object' && candidate !== null) {
    const choice = (candidate as Record<string, unknown>).choice;
    if (typeof choice === 'string' && choice.trim() !== '') return choice.trim();
    if (typeof choice === 'number' && Number.isFinite(choice)) return String(choice);
    return undefined;
  }
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  return undefined;
}

/**
 * Turn the judge's answer into a decision.
 *
 * The choice is the type row's number. Matching is by that number's numeric
 * value, so an endpoint that answers `"3"` and one that answers `3` agree; a
 * number no listed row carries is `unmatched`, and a body naming no choice at
 * all is `empty`. Both travel to the log as their own reason, because "it
 * answered nothing" and "it answered something I do not have" send the reader
 * to different fixes.
 *
 * @param payload - the decoded response body.
 * @param rows - the selectable rows, in page order.
 * @returns the decision.
 */
export function readJudgeAnswer(payload: unknown, rows: readonly TypeRow[]): JudgeDecision {
  const choice = readChoice(payload);
  if (choice === undefined) return { kind: 'empty' };
  const wanted = Number(choice);
  if (!Number.isFinite(wanted)) return { kind: 'unmatched' };
  const row = rows.find((candidate) => candidate.id === wanted);
  return row === undefined ? { kind: 'unmatched' } : { kind: 'row', row };
}

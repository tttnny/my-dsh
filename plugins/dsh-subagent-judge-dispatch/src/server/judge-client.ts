/**
 * The judge call itself: one POST, one budget, no retry.
 *
 * The call can fail in exactly four ways — unreachable, timed out, an answer
 * that names no option, an answer whose row is unusable — and every one of them
 * ends the same way for the caller: no rewrite happens and the child inherits
 * what the main agent is running. That is why nothing here throws: a delegation
 * must never fail because the judge was unavailable.
 */

import {
  PROBE_OPTION_ID,
  buildJudgeRequest,
  buildProbeRequest,
  formatJudgeRequest,
  readJudgeAnswer,
} from './judge-prompt.ts';
import type { FallbackReason, JudgeOutcome, ProbeOutcome, TypeRow } from './types.ts';

/** How long a judgement may take before it is abandoned. */
export const JUDGE_TIMEOUT_MS = 5000;

/** What the judge client needs from the Host to make one call. */
export interface JudgeEndpoint {
  /** Full endpoint URL, including the protocol path. */
  url: string;
  /** Judge model id. */
  model: string;
  /** Authorization value, or '' when the endpoint needs none. */
  apiKey: string;
}

/** Structural `fetch` so tests can supply their own. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Ask the judge whether this endpoint and model can answer at all.
 *
 * This is a different question from a judgement, so it sends its own request
 * with its own single option: the reader uses the button to find out whether
 * the endpoint and model work, which is answerable before any task type has
 * been written. It never throws for the same reason a judgement never does —
 * the page reports the reason, it does not handle an exception.
 *
 * @param endpoint - where and how to call the judge.
 * @param fetchImpl - the fetch to call; defaults to the global one.
 * @returns whether the endpoint answered, and how long it took.
 */
export async function probeJudge(
  endpoint: JudgeEndpoint,
  fetchImpl: FetchLike = fetch,
): Promise<ProbeOutcome> {
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;
  if (endpoint.url.trim() === '' || endpoint.model.trim() === '') {
    return { ok: false, latencyMs: elapsed(), reason: 'unconfigured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  let timedOut = false;
  const onTimeout = (): void => {
    timedOut = true;
  };
  controller.signal.addEventListener('abort', onTimeout);

  try {
    const response = await fetchImpl(endpoint.url.trim(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...endpoint.apiKey.trim() === '' ? {} : { authorization: `Bearer ${endpoint.apiKey.trim()}` },
      },
      body: JSON.stringify(buildProbeRequest(endpoint.model.trim())),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, latencyMs: elapsed(), reason: 'unreachable' };
    const payload: unknown = await response.json();
    // The check asked for the one option it offered: any answer that names a
    // different option means the endpoint did not read the request it was sent.
    return readJudgeAnswer(payload, [{
      id: Number(PROBE_OPTION_ID),
      description: '',
      provider: '',
      model: '',
      effort: '',
    }]).kind === 'row'
      ? { ok: true, latencyMs: elapsed() }
      : { ok: false, latencyMs: elapsed(), reason: 'unmatched' };
  } catch {
    return { ok: false, latencyMs: elapsed(), reason: timedOut ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onTimeout);
  }
}

/**
 * Ask the judge which type one delegated job is.
 *
 * Never throws and never lets an abort cancel the delegation: every failure is
 * reported as a `fallback` outcome carrying its own reason, and the caller
 * writes nothing.
 *
 * @param endpoint - where and how to call the judge.
 * @param rows - the selectable rows, in page order.
 * @param taskText - the delegated job's text.
 * @param fetchImpl - the fetch to call; defaults to the global one.
 * @returns the decision, or the fallback reason that replaced it.
 */
export async function judgeTaskType(
  endpoint: JudgeEndpoint,
  rows: readonly TypeRow[],
  taskText: string,
  fetchImpl: FetchLike = fetch,
): Promise<JudgeOutcome> {
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;
  if (endpoint.url.trim() === '' || endpoint.model.trim() === '' || rows.length === 0) {
    return { kind: 'fallback', reason: 'unreachable', latencyMs: elapsed(), prompt: '' };
  }

  const body = buildJudgeRequest(rows, endpoint.model.trim(), taskText);
  // The body the log keeps is the one sent, not a re-built one: the reader
  // opens it to see exactly what the judge was asked.
  const prompt = formatJudgeRequest(body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  let timedOut = false;
  const onTimeout = (): void => {
    timedOut = true;
  };
  controller.signal.addEventListener('abort', onTimeout);

  try {
    const response = await fetchImpl(endpoint.url.trim(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Sent only when there is a key: an unauthenticated local endpoint
        // would otherwise receive an empty Bearer and reject the call itself.
        ...endpoint.apiKey.trim() === '' ? {} : { authorization: `Bearer ${endpoint.apiKey.trim()}` },
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { kind: 'fallback', reason: 'unreachable', latencyMs: elapsed(), prompt };
    }
    const payload: unknown = await response.json();
    const decision = readJudgeAnswer(payload, rows);
    if (decision.kind === 'empty') {
      return { kind: 'fallback', reason: 'unmatched', latencyMs: elapsed(), prompt };
    }
    if (decision.kind === 'unmatched') {
      return { kind: 'fallback', reason: 'unmatched', latencyMs: elapsed(), prompt };
    }
    return { kind: 'matched', row: decision.row, latencyMs: elapsed(), prompt };
  } catch {
    const reason: FallbackReason = timedOut ? 'timeout' : 'unreachable';
    return { kind: 'fallback', reason, latencyMs: elapsed(), prompt };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onTimeout);
  }
}

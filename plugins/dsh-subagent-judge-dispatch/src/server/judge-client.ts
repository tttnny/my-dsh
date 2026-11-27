import { JudgeBudget } from './judge-budget.ts';
import { PROBE_OPTION_ID, buildJudgeRequest, buildProbeRequest, readJudgeAnswer } from './judge-prompt.ts';
import type { JudgeMetrics, JudgeOutcome, ProbeOutcome, TypeRow } from './types.ts';

export interface JudgeEndpoint {
  url: string;
  model: string;
  apiKey: string;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function requestJudge(
  budget: JudgeBudget, endpoint: JudgeEndpoint, body: unknown, fetchImpl: FetchLike,
): Promise<unknown> {
  return budget.run(async (signal) => {
    const response = await fetchImpl(endpoint.url.trim(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...endpoint.apiKey.trim() === '' ? {} : { authorization: `Bearer ${endpoint.apiKey.trim()}` },
      },
      body: JSON.stringify(body),
      signal,
    });
    signal.throwIfAborted();
    if (!response.ok) throw new Error('Judge endpoint failed');
    return response.json();
  });
}

/** Test the endpoint with one fixed option, independent of the configured task types. */
export async function probeJudge(
  endpoint: JudgeEndpoint, fetchImpl: FetchLike = fetch,
): Promise<ProbeOutcome> {
  if (endpoint.url.trim() === '' || endpoint.model.trim() === '') {
    return { ok: false, latencyMs: 0, reason: 'unconfigured' };
  }
  const budget = new JudgeBudget();
  try {
    const payload = await requestJudge(budget, endpoint, buildProbeRequest(endpoint.model.trim()), fetchImpl);
    const options = [{
      id: Number(PROBE_OPTION_ID), enabled: true, description: '', provider: '', model: '', effort: '',
    }];
    return readJudgeAnswer(payload, options).kind === 'row'
      ? { ok: true, latencyMs: budget.elapsed() }
      : { ok: false, latencyMs: budget.elapsed(), reason: 'unmatched' };
  } catch {
    return { ok: false, latencyMs: budget.elapsed(), reason: budget.expired() ? 'timeout' : 'unreachable' };
  } finally {
    budget.dispose();
  }
}

/** Classify one task using the caller’s deadline when it also needs to preflight a route. */
export async function judgeTaskType(
  endpoint: JudgeEndpoint, rows: readonly TypeRow[], subject: string,
  fetchImpl: FetchLike = fetch, sharedBudget?: JudgeBudget,
): Promise<JudgeOutcome> {
  const budget = sharedBudget ?? new JudgeBudget();
  const model = endpoint.model.trim();
  let metrics: JudgeMetrics | undefined;
  try {
    if (endpoint.url.trim() === '' || model === '' || rows.length === 0) {
      return { kind: 'fallback', reason: 'unreachable', latencyMs: budget.elapsed() };
    }
    budget.check();
    metrics = { judgeModel: model, optionCount: rows.length, subjectLength: subject.length };
    const payload = await requestJudge(budget, endpoint, buildJudgeRequest(rows, model, subject), fetchImpl);
    const decision = readJudgeAnswer(payload, rows);
    return decision.kind === 'row'
      ? { kind: 'matched', row: decision.row, latencyMs: budget.elapsed(), metrics }
      : { kind: 'fallback', reason: 'unmatched', latencyMs: budget.elapsed(), metrics };
  } catch {
    const reason = budget.expired() ? 'timeout' : 'unreachable';
    return { kind: 'fallback', reason, latencyMs: budget.elapsed(), metrics };
  } finally {
    if (sharedBudget === undefined) budget.dispose();
  }
}

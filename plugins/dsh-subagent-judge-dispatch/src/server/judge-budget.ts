/** The total time available for the judge request and route preflight. */
const JUDGE_TIMEOUT_MS = 5000;

export class JudgeBudget {
  private readonly startedAt = performance.now();
  private readonly controller = new AbortController();
  private readonly timer = setTimeout(() => this.controller.abort(), JUDGE_TIMEOUT_MS);
  readonly signal: AbortSignal;

  constructor(parent?: AbortSignal) {
    this.signal = parent === undefined
      ? this.controller.signal
      : AbortSignal.any([parent, this.controller.signal]);
  }

  elapsed(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  expired(): boolean {
    if (performance.now() - this.startedAt >= JUDGE_TIMEOUT_MS) this.controller.abort();
    return this.controller.signal.aborted;
  }

  check(): void {
    this.expired();
    this.signal.throwIfAborted();
  }

  /** Stop waiting at the deadline even if the operation ignores its signal. */
  async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.check();
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.signal.reason);
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = await Promise.race([aborted, Promise.resolve().then(() => {
        this.check();
        return operation(this.signal);
      })]);
      this.check();
      return result;
    } finally {
      this.signal.removeEventListener('abort', onAbort);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}

import type { MetricsPoint } from './types';

/** Rolling-window latency and error statistics over sim time. */
export class Metrics {
  private latencies: { t: number; v: number }[] = [];
  private errorTimes: number[] = [];
  private arrivalsSinceTick = 0;
  private completionsSinceTick = 0;

  constructor(private windowSeconds: number) {}

  setWindow(seconds: number): void {
    this.windowSeconds = seconds;
  }

  recordArrival(): void {
    this.arrivalsSinceTick++;
  }

  recordCompletion(t: number, latency: number): void {
    this.latencies.push({ t, v: latency });
    this.completionsSinceTick++;
  }

  recordError(t: number): void {
    this.errorTimes.push(t);
  }

  /** Produce a point for time t and reset the per-tick counters. */
  tick(t: number, tickSeconds: number, rest: Omit<MetricsPoint, 't' | 'p50' | 'p95' | 'p99' | 'errorRate' | 'rpsIn' | 'rpsOut'>): MetricsPoint {
    this.prune(t);
    const sorted = this.latencies.map((x) => x.v).sort((a, b) => a - b);
    const completions = sorted.length;
    const errors = this.errorTimes.length;
    const point: MetricsPoint = {
      t,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      errorRate: completions + errors === 0 ? 0 : errors / (completions + errors),
      rpsIn: this.arrivalsSinceTick / tickSeconds,
      rpsOut: this.completionsSinceTick / tickSeconds,
      ...rest,
    };
    this.arrivalsSinceTick = 0;
    this.completionsSinceTick = 0;
    return point;
  }

  private prune(t: number): void {
    const cutoff = t - this.windowSeconds;
    let i = 0;
    while (i < this.latencies.length && this.latencies[i].t < cutoff) i++;
    if (i > 0) this.latencies.splice(0, i);
    let j = 0;
    while (j < this.errorTimes.length && this.errorTimes[j] < cutoff) j++;
    if (j > 0) this.errorTimes.splice(0, j);
  }
}

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

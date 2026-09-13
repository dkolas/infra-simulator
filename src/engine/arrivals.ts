import type { SimConfig } from './config';
import type { Rng } from './rng';

/** Multiplier from 1+4 × burstiness at burstiness = 1. */
const BURST_GAIN = 4;
const TEN_X = 10;

export function profileMultiplier(t: number, c: SimConfig['traffic']): number {
  switch (c.profileKind) {
    case 'constant':
      return 1;
    case 'ramp':
      return 1 + (c.rampTo - 1) * Math.min(1, t / c.rampDuration);
    case 'step':
      return t >= c.stepAt ? c.stepTo : 1;
    case 'sine':
      return 1 + c.sineAmplitude * Math.sin((2 * Math.PI * t) / c.sinePeriod);
  }
}

function profileMax(c: SimConfig['traffic']): number {
  switch (c.profileKind) {
    case 'constant':
      return 1;
    case 'ramp':
      return Math.max(1, c.rampTo);
    case 'step':
      return Math.max(1, c.stepTo);
    case 'sine':
      return 1 + c.sineAmplitude;
  }
}

/**
 * Nonhomogeneous Poisson arrivals by thinning, with a two-state burst layer.
 * Call `next(t)` to get the sim time of the arrival after `t`.
 */
export class Arrivals {
  private inBurst = false;
  private burstInitialised = false;
  private burstStateUntil = 0;
  private tenXFrom = 0;
  private tenXUntil = -1;

  constructor(
    private rng: Rng,
    private config: SimConfig['traffic'],
  ) {}

  setConfig(config: SimConfig['traffic']): void {
    this.config = config;
  }

  triggerTenX(t: number): void {
    this.tenXFrom = t;
    this.tenXUntil = t + this.config.tenXDuration;
  }

  tenXRemaining(t: number): number {
    return Math.max(0, this.tenXUntil - t);
  }

  burstActive(): boolean {
    return this.inBurst;
  }

  /** Instantaneous rate at t, advancing the burst state machine as needed. */
  rate(t: number): number {
    const c = this.config;
    this.advanceBurstState(t);
    const burst = this.inBurst ? 1 + BURST_GAIN * c.burstiness : 1;
    const tenX = t >= this.tenXFrom && t < this.tenXUntil ? TEN_X : 1;
    return c.baseRate * Math.max(0, profileMultiplier(t, c)) * burst * tenX;
  }

  /** Sim time of the next arrival strictly after t, or Infinity if the rate is zero. */
  next(t: number): number {
    const c = this.config;
    const maxRate = c.baseRate * profileMax(c) * (1 + BURST_GAIN * c.burstiness) * TEN_X;
    if (maxRate <= 0) return Infinity;
    let candidate = t;
    for (let guard = 0; guard < 100000; guard++) {
      candidate += this.rng.exponential(1 / maxRate);
      const r = this.rate(candidate);
      if (this.rng.next() * maxRate < r) return candidate;
    }
    return Infinity;
  }

  private advanceBurstState(t: number): void {
    const c = this.config;
    if (c.burstiness <= 0) {
      this.inBurst = false;
      return;
    }
    if (!this.burstInitialised) {
      // Start quiet; the first burst comes after one gap.
      this.burstInitialised = true;
      this.inBurst = false;
      this.burstStateUntil = t + this.rng.exponential(c.burstGap);
    }
    while (t >= this.burstStateUntil) {
      this.inBurst = !this.inBurst;
      const mean = this.inBurst ? c.burstDuration : c.burstGap;
      this.burstStateUntil = Math.max(this.burstStateUntil, t) + this.rng.exponential(mean);
    }
  }
}

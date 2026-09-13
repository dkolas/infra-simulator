/** Seeded 32-bit PRNG (mulberry32). Deterministic for a given seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal via Box-Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Exponential with the given mean. */
  exponential(mean: number): number {
    let u = 0;
    while (u === 0) u = this.next();
    return -Math.log(u) * mean;
  }

  /** Lognormal parameterised by its median and 95th percentile. */
  lognormal(p50: number, p95: number): number {
    const { mu, sigma } = lognormalParams(p50, p95);
    return Math.exp(mu + sigma * this.normal());
  }
}

/** z-score of the 95th percentile of a standard normal. */
const Z95 = 1.6449;

export function lognormalParams(p50: number, p95: number): { mu: number; sigma: number } {
  const mu = Math.log(p50);
  const sigma = p95 > p50 ? Math.log(p95 / p50) / Z95 : 0;
  return { mu, sigma };
}

/** Mean of a lognormal given its median and 95th percentile. */
export function lognormalMean(p50: number, p95: number): number {
  const { mu, sigma } = lognormalParams(p50, p95);
  return Math.exp(mu + (sigma * sigma) / 2);
}

export type DistributionKind = 'constant' | 'exponential' | 'lognormal' | 'bimodal';

export type Distribution = {
  kind: DistributionKind;
  /** Median for lognormal/constant, mean for exponential, cheap mode for bimodal. */
  p50: number;
  /** 95th percentile for lognormal, expensive mode for bimodal. Ignored otherwise. */
  p95: number;
  /** Bimodal only: fraction of draws from the expensive mode. */
  heavyFraction?: number;
};

export function sample(rng: Rng, d: Distribution): number {
  switch (d.kind) {
    case 'constant':
      return d.p50;
    case 'exponential':
      return rng.exponential(d.p50);
    case 'lognormal':
      return rng.lognormal(d.p50, d.p95);
    case 'bimodal': {
      const heavy = rng.next() < (d.heavyFraction ?? 0.2);
      const centre = heavy ? d.p95 : d.p50;
      // Each mode is a narrow lognormal so the two peaks stay distinct.
      return rng.lognormal(centre, centre * 1.3);
    }
  }
}

export function distributionMean(d: Distribution): number {
  switch (d.kind) {
    case 'constant':
    case 'exponential':
      return d.p50;
    case 'lognormal':
      return lognormalMean(d.p50, d.p95);
    case 'bimodal': {
      const h = d.heavyFraction ?? 0.2;
      return (1 - h) * lognormalMean(d.p50, d.p50 * 1.3) + h * lognormalMean(d.p95, d.p95 * 1.3);
    }
  }
}

import { describe, expect, test } from 'vitest';
import { Arrivals, profileMultiplier } from './arrivals';
import { DEFAULTS } from './config';
import { Rng } from './rng';

function perSecondCounts(a: Arrivals, horizon: number): number[] {
  const counts = new Array<number>(horizon).fill(0);
  let t = a.next(0);
  while (t < horizon) {
    counts[Math.floor(t)]++;
    t = a.next(t);
  }
  return counts;
}

function cv(xs: number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const varc = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varc) / mean;
}

describe('Arrivals', () => {
  test('smooth traffic matches the base rate within 5 %', () => {
    const cfg = { ...DEFAULTS.traffic, baseRate: 10, burstiness: 0 };
    const counts = perSecondCounts(new Arrivals(new Rng(1), cfg), 1000);
    const total = counts.reduce((s, x) => s + x, 0);
    expect(Math.abs(total - 10000) / 10000).toBeLessThan(0.05);
  });

  test('bursty traffic has a much higher coefficient of variation', () => {
    const smooth = perSecondCounts(new Arrivals(new Rng(2), { ...DEFAULTS.traffic, baseRate: 10, burstiness: 0 }), 2000);
    const bursty = perSecondCounts(new Arrivals(new Rng(2), { ...DEFAULTS.traffic, baseRate: 10, burstiness: 1 }), 2000);
    expect(cv(bursty)).toBeGreaterThan(cv(smooth) * 1.5);
  });

  test('10x multiplies the rate for the configured duration only', () => {
    const cfg = { ...DEFAULTS.traffic, baseRate: 10, burstiness: 0, tenXDuration: 60 };
    const a = new Arrivals(new Rng(3), cfg);
    a.triggerTenX(100);
    expect(a.rate(50)).toBeCloseTo(10);
    expect(a.rate(130)).toBeCloseTo(100);
    expect(a.rate(161)).toBeCloseTo(10);
    expect(a.tenXRemaining(130)).toBeCloseTo(30);
  });

  test('profiles shape the rate', () => {
    const base = DEFAULTS.traffic;
    expect(profileMultiplier(300, { ...base, profileKind: 'ramp', rampTo: 3, rampDuration: 600 })).toBeCloseTo(2);
    expect(profileMultiplier(900, { ...base, profileKind: 'ramp', rampTo: 3, rampDuration: 600 })).toBeCloseTo(3);
    expect(profileMultiplier(119, { ...base, profileKind: 'step', stepTo: 3, stepAt: 120 })).toBe(1);
    expect(profileMultiplier(120, { ...base, profileKind: 'step', stepTo: 3, stepAt: 120 })).toBe(3);
    expect(profileMultiplier(150, { ...base, profileKind: 'sine', sineAmplitude: 0.5, sinePeriod: 600 })).toBeCloseTo(1.5);
  });

  test('zero base rate never arrives', () => {
    const a = new Arrivals(new Rng(4), { ...DEFAULTS.traffic, baseRate: 0 });
    expect(a.next(0)).toBe(Infinity);
  });
});

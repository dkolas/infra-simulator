import { describe, expect, test } from 'vitest';
import { Rng, lognormalMean, sample } from './rng';

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

describe('Rng', () => {
  test('same seed produces the same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  test('different seeds diverge', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  test('uniform draws stay in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const u = rng.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  test('lognormal hits its p50 and p95 within 5 %', () => {
    const rng = new Rng(123);
    const n = 20000;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) xs.push(rng.lognormal(8, 30));
    xs.sort((a, b) => a - b);
    expect(quantile(xs, 0.5)).toBeCloseTo(8, -0.5);
    expect(Math.abs(quantile(xs, 0.5) - 8) / 8).toBeLessThan(0.05);
    expect(Math.abs(quantile(xs, 0.95) - 30) / 30).toBeLessThan(0.05);
  });

  test('lognormalMean matches the sample mean', () => {
    const rng = new Rng(9);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += rng.lognormal(8, 30);
    const empirical = sum / n;
    expect(Math.abs(empirical - lognormalMean(8, 30)) / empirical).toBeLessThan(0.05);
  });

  test('exponential has the requested mean', () => {
    const rng = new Rng(5);
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) sum += rng.exponential(11);
    expect(Math.abs(sum / n - 11) / 11).toBeLessThan(0.03);
  });

  test('constant distribution returns p50', () => {
    expect(sample(new Rng(1), { kind: 'constant', p50: 4, p95: 99 })).toBe(4);
  });
});

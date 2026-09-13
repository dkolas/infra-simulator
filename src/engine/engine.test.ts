import { describe, expect, test } from 'vitest';
import { DEFAULTS, type SimConfig } from './config';
import { Engine } from './engine';
import type { MetricsPoint } from './types';

/** Defaults with no randomness in the parts a test does not exercise. */
function calm(overrides: (c: SimConfig) => SimConfig = (c) => c): SimConfig {
  const base: SimConfig = {
    ...DEFAULTS,
    traffic: { ...DEFAULTS.traffic, burstiness: 0 },
    processing: {
      time: { kind: 'constant', p50: 2, p95: 2 },
      memoryMb: { kind: 'constant', p50: 10, p95: 10 },
    },
    external: { ...DEFAULTS.external, failureRate: 0 },
    api: { ...DEFAULTS.api, scaling: { ...DEFAULTS.api.scaling, min: 2, max: 2 } },
    workers: { ...DEFAULTS.workers, scaling: { ...DEFAULTS.workers.scaling, min: 2, max: 2 } },
  };
  return overrides(base);
}

function run(cfg: SimConfig, seconds: number, seed = 1): { engine: Engine; series: MetricsPoint[] } {
  const engine = new Engine(cfg, seed);
  engine.advance(seconds);
  return { engine, series: engine.drainSeries() };
}

describe('happy path', () => {
  test('low load: p50 latency equals handling plus processing time', () => {
    const cfg = calm();
    const { series } = run(cfg, 120);
    const last = series[series.length - 1];
    expect(last.p50).toBeCloseTo(2 + 0.005, 2);
    expect(last.errorRate).toBe(0);
    expect(last.queueDepth).toBe(0);
  });

  test('load above worker capacity grows the queue', () => {
    // 2 workers × 14 slots = 28 in flight; 2 s jobs → 14 jobs/s capacity. Offer 40/s.
    const cfg = calm((c) => ({ ...c, traffic: { ...c.traffic, baseRate: 40 } }));
    const { series } = run(cfg, 60);
    const depths = series.map((p) => p.queueDepth);
    expect(depths[59]).toBeGreaterThan(depths[30]);
    expect(depths[30]).toBeGreaterThan(depths[10]);
  });

  test('throughput out matches throughput in when healthy', () => {
    const { engine } = run(calm(), 300);
    const t = engine.totals;
    expect(t.errors).toBe(0);
    expect(Math.abs(t.completions - t.arrivals)).toBeLessThan(60);
  });

  test('same seed and config replay identically', () => {
    const a = run(DEFAULTS, 200, 77);
    const b = run(DEFAULTS, 200, 77);
    expect(a.engine.snapshot()).toEqual(b.engine.snapshot());
    expect(a.series).toEqual(b.series);
  });

  test('different seeds differ', () => {
    const a = run(DEFAULTS, 100, 1);
    const b = run(DEFAULTS, 100, 2);
    expect(a.engine.totals.arrivals).not.toBe(b.engine.totals.arrivals);
  });
});

describe('failure modes', () => {
  test('deadline counts an error once and the job still completes the work', () => {
    const cfg = calm((c) => ({
      ...c,
      processing: { ...c.processing, time: { kind: 'constant', p50: 20, p95: 20 } },
      queue: { ...c.queue, deadline: 10 },
    }));
    const { engine } = run(cfg, 60);
    const t = engine.totals;
    expect(t.errorsByCause.deadline).toBeGreaterThan(0);
    expect(t.errors).toBe(t.errorsByCause.deadline);
    // Nothing completed inside the deadline, so no successful completions were recorded.
    expect(t.completions).toBe(0);
  });

  test('external failures retry and exhaust into errors', () => {
    const cfg = calm((c) => ({
      ...c,
      external: { ...c.external, failureRate: 1 },
      queue: { ...c.queue, maxAttempts: 3 },
    }));
    const { engine } = run(cfg, 60);
    const t = engine.totals;
    expect(t.externalFailures).toBeGreaterThan(0);
    expect(t.errorsByCause.exhausted).toBeGreaterThan(0);
    expect(t.completions).toBe(0);
    // Each exhausted job made exactly maxAttempts calls.
    expect(t.externalFailures).toBeGreaterThanOrEqual(t.errorsByCause.exhausted * 3);
  });

  test('capacity cap fails calls over the cap', () => {
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, baseRate: 20 },
      external: { ...c.external, capEnabled: true, capConcurrent: 5 },
    }));
    const { engine } = run(cfg, 60);
    const s = engine.snapshot();
    expect(engine.totals.externalCapped).toBeGreaterThan(0);
    expect(s.schematic.external.inflight).toBeLessThanOrEqual(5);
    // Capped jobs wait on the worker with backoff rather than burning all attempts instantly.
    expect(engine.totals.completions).toBeGreaterThan(0);
    const held = s.schematic.workers.reduce((n, w) => n + w.inflight, 0);
    expect(held + s.schematic.queue.visible).toBeGreaterThan(0);
    const atApi = s.schematic.api.reduce((n, a) => n + a.inflight, 0);
    expect(engine.totals.completions + engine.totals.errors + held + atApi + s.schematic.queue.visible + s.schematic.queue.invisible).toBe(engine.totals.arrivals);
  });

  test('full queue rejects jobs', () => {
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, baseRate: 100 },
      queue: { ...c.queue, maxDepth: 20 },
    }));
    const { engine } = run(cfg, 30);
    expect(engine.totals.errorsByCause.queueFull).toBeGreaterThan(0);
    expect(engine.queueDepth()).toBeLessThanOrEqual(20);
  });

  test('API rejects when connections are exhausted', () => {
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, baseRate: 200 },
      api: { ...c.api, connections: 1, handlingMs: 500 },
    }));
    const { engine } = run(cfg, 30);
    expect(engine.totals.errorsByCause.apiRejected).toBeGreaterThan(0);
  });

  test('out-of-memory kills the worker, restarts it, and redelivers its jobs', () => {
    // 10 MB per job, 256 base, limit 300 → dies on the 5th concurrent job.
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, baseRate: 5 },
      workers: { ...c.workers, memoryLimitMb: 300, scaling: { ...c.workers.scaling, min: 1, max: 1, coldStart: 10 } },
      queue: { ...c.queue, visibilityTimeout: 15, deadline: 1000 },
    }));
    const engine = new Engine(cfg, 3);
    const seen = new Set<string>();
    let invisibleSeen = 0;
    for (let t = 0; t <= 120; t += 0.5) {
      engine.advance(t);
      const s = engine.snapshot();
      for (const w of s.schematic.workers) seen.add(w.state);
      invisibleSeen = Math.max(invisibleSeen, s.schematic.queue.invisible);
    }
    expect(engine.totals.workerDeaths).toBeGreaterThan(0);
    expect(seen.has('dead')).toBe(true);
    expect(seen.has('coldStarting')).toBe(true);
    expect(seen.has('ready')).toBe(true);
    expect(invisibleSeen).toBeGreaterThan(0);
    // Abandoned jobs came back and were eventually processed or exhausted; none leaked.
    const s = engine.snapshot();
    const accounted = engine.totals.completions + engine.totals.errors + s.schematic.queue.visible + s.schematic.queue.invisible + s.schematic.workers.reduce((n, w) => n + w.inflight, 0);
    expect(accounted).toBe(engine.totals.arrivals);
    expect(s.schematic.external.inflight).toBe(s.schematic.workers.reduce((n, w) => n + w.inflight, 0));
  });
});

describe('autoscaling', () => {
  test('sustained overload scales workers up to max in steps, respecting cooldown', () => {
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, baseRate: 60 },
      workers: {
        ...c.workers,
        scaling: { ...c.workers.scaling, min: 2, max: 8, upStep: 2, upCooldown: 60, evalInterval: 10, coldStart: 5 },
      },
    }));
    const { series } = run(cfg, 400);
    const counts = series.map((p) => p.workerReplicas);
    expect(counts[399]).toBe(8);
    // Two replicas per decision, at least 60 s apart: at most 4 after the first 60 s.
    expect(Math.max(...counts.slice(0, 60))).toBeLessThanOrEqual(4);
    expect(series[399].workerReplicasReady).toBe(8);
  });

  test('scale-down drains back to min without generating errors', () => {
    const cfg = calm((c) => ({
      ...c,
      traffic: { ...c.traffic, profileKind: 'step', baseRate: 60, stepTo: 0, stepAt: 200 },
      workers: {
        ...c.workers,
        scaling: { ...c.workers.scaling, min: 2, max: 8, upStep: 4, upCooldown: 10, downStep: 2, downCooldown: 20, evalInterval: 10, coldStart: 5, drainGrace: 30 },
      },
      queue: { ...c.queue, deadline: 10000 },
    }));
    const { engine, series } = run(cfg, 600);
    expect(Math.max(...series.map((p) => p.workerReplicas))).toBeGreaterThan(2);
    expect(series[599].workerReplicas).toBe(2);
    expect(engine.totals.errors).toBe(0);
    expect(engine.totals.completions).toBe(engine.totals.arrivals);
  });
});

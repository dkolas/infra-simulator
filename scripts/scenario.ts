import { DEFAULTS } from '../src/engine/config';
import { Engine } from '../src/engine/engine';

const overrides = process.env.OVERRIDE ? JSON.parse(process.env.OVERRIDE) : {};
const cfg = {
  ...DEFAULTS,
  workers: { ...DEFAULTS.workers, ...overrides.workers, scaling: { ...DEFAULTS.workers.scaling, ...overrides.workers?.scaling } },
};
const engine = new Engine(cfg, Number(process.env.SEED ?? 1));
const rows: string[] = [];
function log(t: number) {
  const s = engine.snapshot();
  const p = s.series[s.series.length - 1];
  if (!p) return;
  rows.push(
    [
      String(t).padStart(5),
      p.p50.toFixed(1).padStart(6),
      p.p95.toFixed(1).padStart(6),
      p.p99.toFixed(1).padStart(6),
      (p.errorRate * 100).toFixed(1).padStart(6) + '%',
      String(p.queueDepth).padStart(6),
      `${p.workerReplicasReady}/${p.workerReplicas}`.padStart(6),
      String(s.schematic.external.inflight).padStart(5),
      String(s.totals.workerDeaths).padStart(5),
    ].join(' '),
  );
}
console.log('    t    p50    p95    p99   err   queue  wrk   ext deaths');
for (let t = 30; t <= 600; t += 30) {
  engine.advance(t);
  log(t);
}
engine.triggerTenX();
console.log('--- 10x pressed at 600 ---');
for (let t = 630; t <= 1500; t += 30) {
  engine.advance(t);
  log(t);
}
console.log(rows.join('\n'));
console.log(engine.totals);

import { useMemo } from 'react';
import { CHART_SPAN, store, useSim } from '../store';
import { Chart, type SeriesSpec } from './Chart';
import { Explain } from './Explain';

const secs = (v: number) => `${v.toFixed(v >= 10 ? 0 : 1)}s`;
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const num = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));
const rps = (v: number) => `${v.toFixed(0)}/s`;

export function Charts() {
  const { series, snapshot, config } = useSim();
  const now = snapshot?.t ?? 0;
  const green = '--text';
  const amber = '--warn';
  const red = '--danger';
  const dim = '--muted';

  const latency = useMemo<SeriesSpec[]>(
    () => [
      { key: 'p50', label: 'p50', color: dim },
      { key: 'p95', label: 'p95', color: green },
      { key: 'p99', label: 'p99', color: amber },
    ],
    [],
  );
  const errors = useMemo<SeriesSpec[]>(() => [{ key: 'errorRate', label: 'error rate', color: red }], []);
  const throughput = useMemo<SeriesSpec[]>(
    () => [
      { key: 'rpsIn', label: 'in', color: amber, dashed: true, smooth: 5 },
      { key: 'rpsOut', label: 'out', color: green, smooth: 5 },
    ],
    [],
  );
  const depth = useMemo<SeriesSpec[]>(() => [{ key: 'queueDepth', label: 'queue depth', color: green }], []);
  const replicas = useMemo<SeriesSpec[]>(
    () => [
      { key: 'apiReplicas', label: 'api', color: dim },
      { key: 'workerReplicas', label: 'workers', color: amber, dashed: true },
      { key: 'workerReplicasReady', label: 'workers ready', color: green },
    ],
    [],
  );

  return (
    <section className="charts" aria-label="Metrics">
      <div className="panel">
        <div className="panel-head">
          <h2>End-to-end latency</h2>
          <button type="button" className="link" onClick={() => store.openDrawer('sim')}>
            window {config.sim.metricsWindow}s
          </button>
        </div>
        <Explain short="Arrival to job completion, over the rolling window. The deadline is the ceiling: anything slower is an error instead." />
        <Chart data={series} series={latency} span={CHART_SPAN} now={now} format={secs} minY={10} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Error rate</h2>
        </div>
        <Explain short="Share of jobs that were rejected, missed the deadline, or exhausted their retries." />
        <Chart data={series} series={errors} span={CHART_SPAN} now={now} format={pct} maxY={1} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Throughput</h2>
        </div>
        <Explain short="Requests arriving versus jobs completing, smoothed over 5 s. A persistent gap means the queue is growing." />
        <Chart data={series} series={throughput} span={CHART_SPAN} now={now} format={rps} minY={10} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Queue depth</h2>
        </div>
        <Explain short="Jobs waiting for a worker. The scaler watches this per worker." />
        <Chart data={series} series={depth} span={CHART_SPAN} now={now} format={num} minY={10} />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Replicas</h2>
        </div>
        <Explain short="Container counts. The gap between workers and workers ready is cold starts and restarts." />
        <Chart data={series} series={replicas} span={CHART_SPAN} now={now} format={num} minY={4} />
      </div>
    </section>
  );
}

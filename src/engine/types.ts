export type ReplicaState = 'coldStarting' | 'ready' | 'draining' | 'dead';

export type ReplicaView = {
  id: number;
  state: ReplicaState;
  inflight: number;
  memUsedMb: number;
};

export type MetricsPoint = {
  t: number;
  p50: number;
  p95: number;
  p99: number;
  /** errors / (errors + completions) over the window, 0..1 */
  errorRate: number;
  rpsIn: number;
  rpsOut: number;
  queueDepth: number;
  apiReplicas: number;
  workerReplicas: number;
  workerReplicasReady: number;
};

export type Snapshot = {
  t: number;
  tenXRemaining: number;
  burstActive: boolean;
  series: MetricsPoint[];
  schematic: {
    api: ReplicaView[];
    queue: { visible: number; invisible: number };
    workers: ReplicaView[];
    external: { inflight: number; capped: boolean };
  };
  totals: Totals;
};

export type ErrorCause = 'apiRejected' | 'queueFull' | 'deadline' | 'exhausted';

export type Totals = {
  arrivals: number;
  completions: number;
  errors: number;
  errorsByCause: Record<ErrorCause, number>;
  workerDeaths: number;
  externalFailures: number;
  externalCapped: number;
};

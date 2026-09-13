import type { Distribution } from './rng';

export type ProfileKind = 'constant' | 'ramp' | 'step' | 'sine';

export type ScalingConfig = {
  min: number;
  max: number;
  /** Metric value the scaler tries to hold per ready replica. */
  target: number;
  evalInterval: number;
  upStep: number;
  upCooldown: number;
  downStep: number;
  downCooldown: number;
  coldStart: number;
  drainGrace: number;
};

export type SimConfig = {
  traffic: {
    baseRate: number;
    profileKind: ProfileKind;
    rampTo: number;
    rampDuration: number;
    stepTo: number;
    stepAt: number;
    sineAmplitude: number;
    sinePeriod: number;
    burstiness: number;
    burstDuration: number;
    burstGap: number;
    tenXDuration: number;
  };
  processing: {
    time: Distribution;
    memoryMb: Distribution;
  };
  api: {
    connections: number;
    handlingMs: number;
    scaling: ScalingConfig;
  };
  queue: {
    maxDepth: number;
    maxAttempts: number;
    visibilityTimeout: number;
    deadline: number;
  };
  workers: {
    concurrency: number;
    memoryLimitMb: number;
    baseMemoryMb: number;
    scaling: ScalingConfig;
  };
  external: {
    capEnabled: boolean;
    capConcurrent: number;
    failureRate: number;
  };
  sim: {
    metricsWindow: number;
  };
};

export const DEFAULTS: SimConfig = {
  traffic: {
    baseRate: 10,
    profileKind: 'constant',
    rampTo: 3,
    rampDuration: 600,
    stepTo: 3,
    stepAt: 120,
    sineAmplitude: 0.5,
    sinePeriod: 600,
    burstiness: 0.3,
    burstDuration: 20,
    burstGap: 90,
    tenXDuration: 60,
  },
  processing: {
    time: { kind: 'lognormal', p50: 8, p95: 30, heavyFraction: 0.2 },
    memoryMb: { kind: 'lognormal', p50: 50, p95: 130, heavyFraction: 0.2 },
  },
  api: {
    connections: 200,
    handlingMs: 5,
    scaling: {
      min: 2,
      max: 10,
      target: 100,
      evalInterval: 15,
      upStep: 1,
      upCooldown: 30,
      downStep: 1,
      downCooldown: 300,
      coldStart: 5,
      drainGrace: 10,
    },
  },
  queue: {
    maxDepth: 10000,
    maxAttempts: 3,
    visibilityTimeout: 60,
    deadline: 120,
  },
  workers: {
    concurrency: 14,
    memoryLimitMb: 1536,
    baseMemoryMb: 256,
    scaling: {
      min: 4,
      max: 20,
      target: 10,
      evalInterval: 15,
      upStep: 4,
      upCooldown: 30,
      downStep: 1,
      downCooldown: 300,
      coldStart: 30,
      drainGrace: 60,
    },
  },
  external: {
    capEnabled: false,
    capConcurrent: 200,
    failureRate: 0.01,
  },
  sim: {
    metricsWindow: 30,
  },
};

export type ParamMeta = {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** One line shown next to the control. */
  short: string;
  /** Longer explanation shown on expand. */
  long?: string;
};

const scalingParams = (metricName: string, unit: string): Record<string, ParamMeta> => ({
  min: { label: 'Min replicas', unit: '', min: 0, max: 100, step: 1, short: 'Never scale below this.' },
  max: { label: 'Max replicas', unit: '', min: 1, max: 200, step: 1, short: 'Never scale above this.' },
  target: {
    label: `Target ${metricName}`,
    unit,
    min: 1,
    max: 1000,
    step: 1,
    short: `The scaler tries to hold ${metricName} per ready replica at this value.`,
    long: 'Desired replicas = ceil(current × observed ÷ target), clamped by step and bounds.',
  },
  evalInterval: { label: 'Evaluation interval', unit: 's', min: 1, max: 600, step: 1, short: 'How often the scaler looks at the metric.' },
  upStep: { label: 'Scale-up step', unit: 'replicas', min: 1, max: 50, step: 1, short: 'Maximum replicas added per decision.' },
  upCooldown: { label: 'Scale-up cooldown', unit: 's', min: 0, max: 3600, step: 5, short: 'Wait after adding replicas before adding more.' },
  downStep: { label: 'Scale-down step', unit: 'replicas', min: 1, max: 50, step: 1, short: 'Maximum replicas removed per decision.' },
  downCooldown: { label: 'Scale-down cooldown', unit: 's', min: 0, max: 3600, step: 5, short: 'Wait after removing replicas before removing more.' },
  coldStart: {
    label: 'Cold start',
    unit: 's',
    min: 0,
    max: 600,
    step: 1,
    short: 'Time from a scale-up decision to the replica accepting work.',
    long: 'Also the restart time after a replica dies.',
  },
  drainGrace: {
    label: 'Drain grace period',
    unit: 's',
    min: 0,
    max: 3600,
    step: 5,
    short: 'On scale-down, finish in-flight work for up to this long before terminating.',
  },
});

/** Metadata for every numeric leaf of SimConfig, keyed by dotted path. */
export const PARAMS: Record<string, ParamMeta> = {
  'traffic.baseRate': { label: 'Base rate', unit: 'req/s', min: 0, max: 1000, step: 1, short: 'Average arrival rate before profile and bursts.' },
  'traffic.rampTo': { label: 'Ramp to', unit: '× base', min: 0, max: 20, step: 0.5, short: 'Multiplier reached at the end of the ramp.' },
  'traffic.rampDuration': { label: 'Ramp duration', unit: 's', min: 10, max: 7200, step: 10, short: 'Time to reach the ramp target, then hold.' },
  'traffic.stepTo': { label: 'Step to', unit: '× base', min: 0, max: 20, step: 0.5, short: 'Multiplier applied after the step time.' },
  'traffic.stepAt': { label: 'Step at', unit: 's', min: 0, max: 7200, step: 10, short: 'Sim time at which the step happens.' },
  'traffic.sineAmplitude': { label: 'Sine amplitude', unit: '× base', min: 0, max: 1, step: 0.05, short: 'Peak deviation from the base rate.' },
  'traffic.sinePeriod': { label: 'Sine period', unit: 's', min: 10, max: 7200, step: 10, short: 'Length of one full cycle.' },
  'traffic.burstiness': {
    label: 'Burstiness',
    unit: '',
    min: 0,
    max: 1,
    step: 0.05,
    short: 'Zero is smooth Poisson traffic. One means bursts arrive at five times the base rate.',
    long: 'Traffic alternates between quiet and burst states. During a burst the rate is multiplied by 1 + 4 × burstiness.',
  },
  'traffic.burstDuration': { label: 'Burst duration', unit: 's', min: 1, max: 600, step: 1, short: 'Average length of a burst.' },
  'traffic.burstGap': { label: 'Burst gap', unit: 's', min: 1, max: 3600, step: 1, short: 'Average quiet time between bursts.' },
  'traffic.tenXDuration': { label: '10× duration', unit: 's', min: 1, max: 600, step: 1, short: 'How long the 10× button multiplies the rate.' },
  'processing.time.p50': { label: 'Processing time p50', unit: 's', min: 0.01, max: 600, step: 0.5, short: 'Median time the external resource takes per job.' },
  'processing.time.p95': { label: 'Processing time p95', unit: 's', min: 0.01, max: 3600, step: 0.5, short: 'Slow tail of processing time.' },
  'processing.time.heavyFraction': { label: 'Heavy fraction', unit: '', min: 0, max: 1, step: 0.05, short: 'Bimodal only: share of jobs from the expensive mode.' },
  'processing.memoryMb.p50': { label: 'Memory per job p50', unit: 'MB', min: 1, max: 8192, step: 5, short: 'Median memory a job holds while in flight.' },
  'processing.memoryMb.p95': { label: 'Memory per job p95', unit: 'MB', min: 1, max: 16384, step: 5, short: 'Fat tail of per-job memory.' },
  'processing.memoryMb.heavyFraction': { label: 'Heavy fraction', unit: '', min: 0, max: 1, step: 0.05, short: 'Bimodal only: share of jobs from the expensive mode.' },
  'api.connections': { label: 'Connections per container', unit: '', min: 1, max: 10000, step: 10, short: 'Requests over this limit are rejected.' },
  'api.handlingMs': { label: 'Handling time', unit: 'ms', min: 0, max: 5000, step: 1, short: 'Time to validate and enqueue one request.' },
  'queue.maxDepth': { label: 'Max depth', unit: 'jobs', min: 1, max: 1000000, step: 100, short: 'Jobs arriving to a full queue are rejected.' },
  'queue.maxAttempts': { label: 'Max attempts', unit: '', min: 1, max: 20, step: 1, short: 'Total tries before a job is counted as failed.' },
  'queue.visibilityTimeout': {
    label: 'Visibility timeout',
    unit: 's',
    min: 1,
    max: 3600,
    step: 5,
    short: 'A job whose worker died reappears after this long.',
    long: 'Counts as a new attempt when it reappears. Failures the worker reports back retry immediately instead.',
  },
  'queue.deadline': {
    label: 'Job deadline',
    unit: 's',
    min: 1,
    max: 7200,
    step: 5,
    short: 'A job not completed within this time of arrival counts as an error.',
    long: 'The worker is not told and keeps processing the job, holding a slot and memory for work nobody will use.',
  },
  'workers.concurrency': { label: 'Concurrency per container', unit: 'jobs', min: 1, max: 256, step: 1, short: 'Jobs a worker holds in flight at once.' },
  'workers.memoryLimitMb': {
    label: 'Memory limit',
    unit: 'MB',
    min: 64,
    max: 65536,
    step: 64,
    short: 'The container dies when base memory plus in-flight job memory exceeds this.',
  },
  'workers.baseMemoryMb': { label: 'Base memory', unit: 'MB', min: 0, max: 8192, step: 16, short: 'Memory the runtime uses before any job runs.' },
  'external.capConcurrent': { label: 'Concurrent call cap', unit: 'calls', min: 1, max: 100000, step: 10, short: 'Calls over the cap fail immediately. Only applies when the cap is on.' },
  'external.failureRate': { label: 'Failure rate', unit: '', min: 0, max: 1, step: 0.005, short: 'Share of calls that fail regardless of load.' },
  'sim.metricsWindow': { label: 'Percentile window', unit: 's', min: 5, max: 600, step: 5, short: 'Percentiles and error rate are computed over the last this many seconds.' },
};

for (const [path, meta] of Object.entries(scalingParams('in-flight requests', 'per container'))) {
  PARAMS[`api.scaling.${path}`] = meta;
}
for (const [path, meta] of Object.entries(scalingParams('queue depth', 'jobs per worker'))) {
  PARAMS[`workers.scaling.${path}`] = meta;
}

/** Numeric leaf paths of a config object, dotted. */
export function numericLeafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out.push(path);
    else if (typeof v === 'object' && v !== null) out.push(...numericLeafPaths(v, path));
  }
  return out;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

/** Returns a new config with the value at the dotted path replaced. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = (o: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const src = o as Record<string, unknown>;
    return { ...src, [keys[i]]: clone(src[keys[i]], i + 1) };
  };
  return clone(obj, 0) as T;
}

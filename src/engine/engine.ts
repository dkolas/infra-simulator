import { Arrivals } from './arrivals';
import type { ScalingConfig, SimConfig } from './config';
import { TimeHeap } from './heap';
import { Metrics } from './metrics';
import { Rng, sample } from './rng';
import type { ErrorCause, MetricsPoint, ReplicaState, ReplicaView, Snapshot, Totals } from './types';

/** Sim seconds between metrics points. */
export const METRICS_TICK = 1;
/** Pause between a replica dying and its restart beginning. */
const RESTART_DELAY = 5;
/** Scaler ignores metric ratios this close to 1, like a Kubernetes HPA. */
const SCALE_TOLERANCE = 0.1;

type Job = {
  id: number;
  arrivedAt: number;
  attempt: number;
  memoryMb: number;
  /** Set once the job has been counted as an error. */
  failed: boolean;
  done: boolean;
  worker: Replica | null;
  /** Incremented per external call so stale completion events can be ignored. */
  callGen: number;
  /** True while an external call for this job is in flight. */
  inExternal: boolean;
};

type Replica = {
  id: number;
  tier: 'api' | 'workers';
  state: ReplicaState;
  /** Worker jobs in flight. */
  jobs: Set<Job>;
  /** API requests in flight. */
  inflight: number;
  memUsedMb: number;
  removed: boolean;
  /** Incremented on each state change so stale timer events can be ignored. */
  gen: number;
};

type Event =
  | { kind: 'arrival'; gen: number }
  | { kind: 'apiDone'; replica: Replica; job: Job }
  | { kind: 'externalDone'; job: Job; replica: Replica; callGen: number }
  | { kind: 'visibilityExpired'; job: Job }
  | { kind: 'deadline'; job: Job }
  | { kind: 'restart'; replica: Replica; gen: number }
  | { kind: 'coldStartDone'; replica: Replica; gen: number }
  | { kind: 'drainExpired'; replica: Replica; gen: number }
  | { kind: 'scalerTick'; tier: 'api' | 'workers' }
  | { kind: 'metricsTick' };

type ScalerState = { lastUp: number; lastDown: number };

export class Engine {
  t = 0;
  private events = new TimeHeap<Event>();
  private rng: Rng;
  private arrivals: Arrivals;
  private arrivalGen = 0;
  private metrics: Metrics;
  private pendingSeries: MetricsPoint[] = [];
  private nextJobId = 1;
  private nextReplicaId = 1;

  private api: Replica[] = [];
  private workers: Replica[] = [];
  private queue: Job[] = [];
  private queueHead = 0;
  private invisible = 0;
  private externalInflight = 0;
  private scalers: Record<'api' | 'workers', ScalerState> = {
    api: { lastUp: -Infinity, lastDown: -Infinity },
    workers: { lastUp: -Infinity, lastDown: -Infinity },
  };

  totals: Totals = {
    arrivals: 0,
    completions: 0,
    errors: 0,
    errorsByCause: { apiRejected: 0, queueFull: 0, deadline: 0, exhausted: 0 },
    workerDeaths: 0,
    externalFailures: 0,
    externalCapped: 0,
  };

  constructor(
    private config: SimConfig,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.arrivals = new Arrivals(this.rng, config.traffic);
    this.metrics = new Metrics(config.sim.metricsWindow);
    for (let i = 0; i < config.api.scaling.min; i++) this.addReplica('api', true);
    for (let i = 0; i < config.workers.scaling.min; i++) this.addReplica('workers', true);
    this.scheduleArrival();
    this.events.push(config.api.scaling.evalInterval, { kind: 'scalerTick', tier: 'api' });
    this.events.push(config.workers.scaling.evalInterval, { kind: 'scalerTick', tier: 'workers' });
    this.events.push(METRICS_TICK, { kind: 'metricsTick' });
  }

  setConfig(config: SimConfig): void {
    const trafficChanged = config.traffic !== this.config.traffic;
    this.config = config;
    this.arrivals.setConfig(config.traffic);
    this.metrics.setWindow(config.sim.metricsWindow);
    if (trafficChanged) this.scheduleArrival();
    this.dispatch();
  }

  triggerTenX(): void {
    this.arrivals.triggerTenX(this.t);
    this.scheduleArrival();
  }

  /** Run all events up to and including sim time `to`. */
  advance(to: number): void {
    for (;;) {
      const next = this.events.peekTime();
      if (next === undefined || next > to) break;
      const { t, v } = this.events.pop()!;
      this.t = t;
      this.handle(v);
    }
    this.t = to;
  }

  /** Metrics points produced since the last call. */
  drainSeries(): MetricsPoint[] {
    const out = this.pendingSeries;
    this.pendingSeries = [];
    return out;
  }

  snapshot(): Snapshot {
    const view = (r: Replica): ReplicaView => ({
      id: r.id,
      state: r.state,
      inflight: r.tier === 'api' ? r.inflight : r.jobs.size,
      memUsedMb: r.memUsedMb,
    });
    return {
      t: this.t,
      tenXRemaining: this.arrivals.tenXRemaining(this.t),
      burstActive: this.arrivals.burstActive(),
      series: this.drainSeries(),
      schematic: {
        api: this.api.map(view),
        queue: { visible: this.queueDepth(), invisible: this.invisible },
        workers: this.workers.map(view),
        external: {
          inflight: this.externalInflight,
          capped: this.config.external.capEnabled && this.externalInflight >= this.config.external.capConcurrent,
        },
      },
      totals: { ...this.totals, errorsByCause: { ...this.totals.errorsByCause } },
    };
  }

  queueDepth(): number {
    return this.queue.length - this.queueHead;
  }

  replicas(tier: 'api' | 'workers'): readonly Replica[] {
    return tier === 'api' ? this.api : this.workers;
  }

  // ---------------------------------------------------------------- events

  private handle(e: Event): void {
    switch (e.kind) {
      case 'arrival':
        if (e.gen === this.arrivalGen) {
          this.onArrival();
          this.scheduleArrival();
        }
        break;
      case 'apiDone':
        this.onApiDone(e.replica, e.job);
        break;
      case 'externalDone':
        if (e.job.worker === e.replica && e.job.callGen === e.callGen) this.onExternalDone(e.job, e.replica);
        break;
      case 'visibilityExpired':
        this.onVisibilityExpired(e.job);
        break;
      case 'deadline':
        this.onDeadline(e.job);
        break;
      case 'restart':
        if (e.gen === e.replica.gen && !e.replica.removed) this.beginColdStart(e.replica);
        break;
      case 'coldStartDone':
        if (e.gen === e.replica.gen && !e.replica.removed) {
          this.setState(e.replica, 'ready');
          this.dispatch();
        }
        break;
      case 'drainExpired':
        if (e.gen === e.replica.gen && !e.replica.removed) this.terminate(e.replica);
        break;
      case 'scalerTick':
        this.onScalerTick(e.tier);
        this.events.push(this.t + this.scaling(e.tier).evalInterval, { kind: 'scalerTick', tier: e.tier });
        break;
      case 'metricsTick':
        this.onMetricsTick();
        this.events.push(this.t + METRICS_TICK, { kind: 'metricsTick' });
        break;
    }
  }

  private scheduleArrival(): void {
    this.arrivalGen++;
    const next = this.arrivals.next(this.t);
    if (Number.isFinite(next)) this.events.push(next, { kind: 'arrival', gen: this.arrivalGen });
  }

  private onArrival(): void {
    this.totals.arrivals++;
    this.metrics.recordArrival();
    const job: Job = {
      id: this.nextJobId++,
      arrivedAt: this.t,
      attempt: 1,
      memoryMb: 0,
      failed: false,
      done: false,
      worker: null,
      callGen: 0,
      inExternal: false,
    };
    this.events.push(this.t + this.config.queue.deadline, { kind: 'deadline', job });

    let best: Replica | null = null;
    for (const r of this.api) {
      if (r.state !== 'ready') continue;
      if (r.inflight >= this.config.api.connections) continue;
      if (!best || r.inflight < best.inflight) best = r;
    }
    if (!best) {
      this.fail(job, 'apiRejected');
      return;
    }
    best.inflight++;
    this.events.push(this.t + this.config.api.handlingMs / 1000, { kind: 'apiDone', replica: best, job });
  }

  private onApiDone(replica: Replica, job: Job): void {
    replica.inflight--;
    if (replica.state === 'draining' && replica.inflight === 0) this.terminate(replica);
    if (this.queueDepth() >= this.config.queue.maxDepth) {
      this.fail(job, 'queueFull');
      return;
    }
    this.enqueue(job);
    this.dispatch();
  }

  private enqueue(job: Job): void {
    this.queue.push(job);
  }

  private takeFromQueue(): Job {
    const job = this.queue[this.queueHead++];
    if (this.queueHead > 1024 && this.queueHead * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.queueHead);
      this.queueHead = 0;
    }
    return job;
  }

  /** Hand visible jobs to workers with free slots until one side runs out. */
  private dispatch(): void {
    while (this.queueDepth() > 0) {
      let best: Replica | null = null;
      for (const w of this.workers) {
        if (w.state !== 'ready') continue;
        if (w.jobs.size >= this.config.workers.concurrency) continue;
        if (!best || w.jobs.size < best.jobs.size) best = w;
      }
      if (!best) return;
      const job = this.takeFromQueue();
      this.startJob(best, job);
    }
  }

  private startJob(worker: Replica, job: Job): void {
    job.memoryMb = sample(this.rng, this.config.processing.memoryMb);
    job.worker = worker;
    job.callGen++;
    worker.jobs.add(job);
    worker.memUsedMb += job.memoryMb;

    const limit = this.config.workers.memoryLimitMb;
    if (this.config.workers.baseMemoryMb + worker.memUsedMb > limit) {
      this.killWorker(worker);
      return;
    }

    const ext = this.config.external;
    if (ext.capEnabled && this.externalInflight >= ext.capConcurrent) {
      this.totals.externalCapped++;
      this.releaseJob(worker, job);
      this.retry(job);
      return;
    }
    this.externalInflight++;
    job.inExternal = true;
    const duration = sample(this.rng, this.config.processing.time);
    this.events.push(this.t + duration, { kind: 'externalDone', job, replica: worker, callGen: job.callGen });
  }

  private onExternalDone(job: Job, worker: Replica): void {
    this.externalInflight--;
    this.releaseJob(worker, job);
    if (this.rng.next() < this.config.external.failureRate) {
      this.totals.externalFailures++;
      this.retry(job);
    } else {
      this.complete(job);
    }
    if (worker.state === 'draining' && worker.jobs.size === 0) this.terminate(worker);
    this.dispatch();
  }

  private releaseJob(worker: Replica, job: Job): void {
    worker.jobs.delete(job);
    worker.memUsedMb -= job.memoryMb;
    job.worker = null;
    job.inExternal = false;
  }

  private complete(job: Job): void {
    job.done = true;
    if (!job.failed) {
      this.totals.completions++;
      this.metrics.recordCompletion(this.t, this.t - job.arrivedAt);
    }
  }

  /** Worker-reported failure: retry immediately or give up. */
  private retry(job: Job): void {
    job.attempt++;
    if (job.attempt > this.config.queue.maxAttempts) {
      this.fail(job, 'exhausted');
      return;
    }
    this.enqueue(job);
  }

  private fail(job: Job, cause: ErrorCause): void {
    job.done = true;
    if (job.failed) return;
    job.failed = true;
    this.totals.errors++;
    this.totals.errorsByCause[cause]++;
    this.metrics.recordError(this.t);
  }

  private onDeadline(job: Job): void {
    if (job.done || job.failed) return;
    job.failed = true;
    this.totals.errors++;
    this.totals.errorsByCause.deadline++;
    this.metrics.recordError(this.t);
  }

  private onVisibilityExpired(job: Job): void {
    this.invisible--;
    job.attempt++;
    if (job.attempt > this.config.queue.maxAttempts) {
      this.fail(job, 'exhausted');
      return;
    }
    this.enqueue(job);
    this.dispatch();
  }

  // -------------------------------------------------------------- replicas

  private addReplica(tier: 'api' | 'workers', ready: boolean): Replica {
    const r: Replica = {
      id: this.nextReplicaId++,
      tier,
      state: ready ? 'ready' : 'coldStarting',
      jobs: new Set(),
      inflight: 0,
      memUsedMb: 0,
      removed: false,
      gen: 0,
    };
    (tier === 'api' ? this.api : this.workers).push(r);
    if (!ready) this.events.push(this.t + this.scaling(tier).coldStart, { kind: 'coldStartDone', replica: r, gen: r.gen });
    return r;
  }

  private setState(r: Replica, state: ReplicaState): void {
    r.state = state;
    r.gen++;
  }

  private killWorker(worker: Replica): void {
    this.totals.workerDeaths++;
    this.abandonJobs(worker);
    this.setState(worker, 'dead');
    this.events.push(this.t + RESTART_DELAY, { kind: 'restart', replica: worker, gen: worker.gen });
  }

  /** In-flight jobs of a dying worker go invisible until the visibility timeout. */
  private abandonJobs(worker: Replica): void {
    for (const job of worker.jobs) {
      if (job.inExternal) {
        // The external call is abandoned; its stale externalDone event is ignored.
        this.externalInflight--;
        job.inExternal = false;
      }
      job.worker = null;
      this.invisible++;
      this.events.push(this.t + this.config.queue.visibilityTimeout, { kind: 'visibilityExpired', job });
    }
    worker.jobs.clear();
    worker.memUsedMb = 0;
  }

  private beginColdStart(r: Replica): void {
    this.setState(r, 'coldStarting');
    this.events.push(this.t + this.scaling(r.tier).coldStart, { kind: 'coldStartDone', replica: r, gen: r.gen });
  }

  private beginDrain(r: Replica): void {
    this.setState(r, 'draining');
    const busy = r.tier === 'api' ? r.inflight > 0 : r.jobs.size > 0;
    if (!busy) {
      this.terminate(r);
      return;
    }
    this.events.push(this.t + this.scaling(r.tier).drainGrace, { kind: 'drainExpired', replica: r, gen: r.gen });
  }

  private terminate(r: Replica): void {
    if (r.removed) return;
    // Grace period ran out with work in flight: same fate as a crash.
    if (r.tier === 'workers' && r.jobs.size > 0) this.abandonJobs(r);
    r.removed = true;
    r.gen++;
    const list = r.tier === 'api' ? this.api : this.workers;
    const i = list.indexOf(r);
    if (i >= 0) list.splice(i, 1);
  }

  // -------------------------------------------------------------- scaling

  private scaling(tier: 'api' | 'workers'): ScalingConfig {
    return this.config[tier].scaling;
  }

  private onScalerTick(tier: 'api' | 'workers'): void {
    const cfg = this.scaling(tier);
    const state = this.scalers[tier];
    const list = tier === 'api' ? this.api : this.workers;
    const counted = list.filter((r) => r.state !== 'draining');
    const current = counted.length;
    const observed = tier === 'api' ? list.reduce((s, r) => s + r.inflight, 0) : this.queueDepth();
    const ratio = observed / (cfg.target * Math.max(1, current));
    let desired = Math.ceil(current * ratio);
    if (Math.abs(ratio - 1) < SCALE_TOLERANCE) desired = current;
    desired = Math.min(cfg.max, Math.max(cfg.min, desired));

    if (desired > current && this.t - state.lastUp >= cfg.upCooldown) {
      const add = Math.min(cfg.upStep, desired - current);
      for (let i = 0; i < add; i++) this.addReplica(tier, false);
      state.lastUp = this.t;
    } else if (desired < current && this.t - state.lastDown >= cfg.downCooldown) {
      const remove = Math.min(cfg.downStep, current - desired);
      const candidates = counted
        .filter((r) => r.state === 'ready')
        .sort((a, b) => (a.tier === 'api' ? a.inflight - b.inflight : a.jobs.size - b.jobs.size));
      for (const r of candidates.slice(0, remove)) this.beginDrain(r);
      if (candidates.length > 0) state.lastDown = this.t;
    }
  }

  // -------------------------------------------------------------- metrics

  private onMetricsTick(): void {
    this.pendingSeries.push(
      this.metrics.tick(this.t, METRICS_TICK, {
        queueDepth: this.queueDepth(),
        apiReplicas: this.api.length,
        workerReplicas: this.workers.length,
        workerReplicasReady: this.workers.filter((r) => r.state === 'ready').length,
      }),
    );
  }
}

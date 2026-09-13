import { useSyncExternalStore } from 'react';
import { DEFAULTS, setPath, type SimConfig } from '../engine/config';
import type { MetricsPoint, Snapshot } from '../engine/types';
import type { FromWorker, ToWorker } from '../worker/protocol';

export type DrawerId = 'traffic' | 'api' | 'queue' | 'workers' | 'external' | 'sim' | null;

/** Sim seconds of history kept for the charts. */
export const CHART_SPAN = 600;

export type State = {
  config: SimConfig;
  seed: number;
  running: boolean;
  speed: number;
  snapshot: Snapshot | null;
  series: MetricsPoint[];
  drawer: DrawerId;
};

type Listener = () => void;

class SimStore {
  private state: State = {
    config: DEFAULTS,
    seed: 1,
    running: false,
    speed: 10,
    snapshot: null,
    series: [],
    drawer: null,
  };
  private listeners = new Set<Listener>();
  private worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.send({ type: 'init', config: this.state.config, seed: this.state.seed });
    this.send({ type: 'setSpeed', speed: this.state.speed });
    // ?autostart runs the simulation on load, for demo links and screenshots.
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('autostart')) this.start();
  }

  getState = (): State => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  start(): void {
    this.send({ type: 'start' });
    this.set({ running: true });
  }

  pause(): void {
    this.send({ type: 'pause' });
    this.set({ running: false });
  }

  reset(): void {
    this.send({ type: 'reset', config: this.state.config, seed: this.state.seed });
    this.set({ running: false, series: [] });
  }

  setSpeed(speed: number): void {
    this.send({ type: 'setSpeed', speed });
    this.set({ speed });
  }

  setSeed(seed: number): void {
    this.set({ seed });
  }

  tenX(): void {
    this.send({ type: 'tenX' });
  }

  setConfig(config: SimConfig): void {
    this.send({ type: 'setConfig', config });
    this.set({ config });
  }

  update(path: string, value: unknown): void {
    this.setConfig(setPath(this.state.config, path, value));
  }

  openDrawer(drawer: DrawerId): void {
    this.set({ drawer });
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  private onMessage(m: FromWorker): void {
    if (m.type !== 'snapshot') return;
    const s = m.snapshot;
    let series = this.state.series;
    if (s.series.length > 0) {
      series = series.concat(s.series);
      const cutoff = s.t - CHART_SPAN;
      let i = 0;
      while (i < series.length && series[i].t < cutoff) i++;
      if (i > 0) series = series.slice(i);
    }
    this.set({ snapshot: s, series, running: m.running });
  }

  private set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}

export const store = new SimStore();

export function useSim(): State {
  return useSyncExternalStore(store.subscribe, store.getState);
}

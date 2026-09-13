import { Engine } from '../engine/engine';
import type { FromWorker, ToWorker } from './protocol';

/** Wall-clock milliseconds between engine advances and snapshots. */
const TICK_MS = 33;
/** Upper bound on sim seconds advanced per tick, so a stalled tab cannot request a huge jump. */
const MAX_STEP_SIM_S = 30;

let engine: Engine | null = null;
let running = false;
let speed = 10;
let lastWall = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function post(): void {
  if (!engine) return;
  const msg: FromWorker = { type: 'snapshot', snapshot: engine.snapshot(), running, speed };
  self.postMessage(msg);
}

function loop(): void {
  timer = null;
  if (!engine || !running) return;
  const now = performance.now();
  const elapsed = Math.min(MAX_STEP_SIM_S, ((now - lastWall) / 1000) * speed);
  lastWall = now;
  engine.advance(engine.t + elapsed);
  post();
  timer = setTimeout(loop, TICK_MS);
}

function start(): void {
  if (running || !engine) return;
  running = true;
  lastWall = performance.now();
  if (timer === null) timer = setTimeout(loop, TICK_MS);
}

function pause(): void {
  running = false;
  post();
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
    case 'reset':
      running = false;
      engine = new Engine(m.config, m.seed);
      post();
      break;
    case 'start':
      start();
      break;
    case 'pause':
      pause();
      break;
    case 'setSpeed':
      speed = m.speed;
      post();
      break;
    case 'setConfig':
      engine?.setConfig(m.config);
      post();
      break;
    case 'tenX':
      engine?.triggerTenX();
      post();
      break;
  }
};

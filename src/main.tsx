import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULTS } from './engine/config';
import type { FromWorker, ToWorker } from './worker/protocol';

// Temporary plumbing check for step 8; replaced by the app shell in step 9.
const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
const send = (m: ToWorker) => worker.postMessage(m);
let count = 0;
const wallStart = performance.now();
worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const { snapshot, speed } = e.data;
  if (++count % 30 === 0) {
    const wall = (performance.now() - wallStart) / 1000;
    console.log(`speed ${speed}x  sim ${snapshot.t.toFixed(1)}s  wall ${wall.toFixed(1)}s  ratio ${(snapshot.t / wall).toFixed(1)}`);
  }
};
send({ type: 'init', config: DEFAULTS, seed: 1 });
send({ type: 'setSpeed', speed: 10 });
send({ type: 'start' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>Infra Simulator (worker plumbing check, see console)</div>
  </StrictMode>,
);

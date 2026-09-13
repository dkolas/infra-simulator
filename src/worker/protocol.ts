import type { SimConfig } from '../engine/config';
import type { Snapshot } from '../engine/types';

export type ToWorker =
  | { type: 'init'; config: SimConfig; seed: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset'; config: SimConfig; seed: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'setConfig'; config: SimConfig }
  | { type: 'tenX' };

export type FromWorker = { type: 'snapshot'; snapshot: Snapshot; running: boolean; speed: number };

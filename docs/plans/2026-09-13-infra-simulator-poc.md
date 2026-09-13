# Infra simulator POC

**Goal:** A browser-only app, deployed on Vercel, that simulates the architecture in `docs/concept.md`. Done means: the default scenario runs healthy, pressing the 10x button drives it into visible breakdown on the latency and error charts and the schematic, every parameter in the concept's defaults table is editable from a config drawer, and the same seed replays identically.
**Out of scope:** everything in concept sections 7 and 8, including the hand-drawn traffic profile.

## Context

Empty repository. Only `docs/concept.md` and the three project skills exist. Node 24 and npm 11 are installed locally. The frontend-design skill holds the visual tokens and the UI checklist; this plan does not restate them.

Decisions already made with the user: React, Vite, TypeScript, Vitest, simulation engine in a Web Worker, charts drawn on canvas without a library, static deploy to Vercel.

## Approach

Three layers with one-way dependencies:

1. **`src/engine/`**: a pure, synchronous discrete-event simulation with no DOM or worker imports. Takes a config and a seed, exposes `advance(toSimTime)` and `snapshot()`. All queueing logic and all tests live here.
2. **`src/worker/`**: a thin Web Worker that owns one engine instance, runs a wall-clock loop, advances the engine by `speed × elapsed`, and posts a snapshot each tick. Accepts `start`, `pause`, `reset`, `setSpeed`, `setConfig`, `tenX` messages.
3. **`src/app/`**: React UI. Holds the latest snapshot plus ring buffers of time series, renders the schematic, controls, charts, and config drawers. Never computes simulation logic.

The engine is kept pure so it can be tested and tuned headlessly, and so the worker wrapper stays under 100 lines. Config changes apply live: the worker swaps the config object and the engine reads it at each decision point, so knobs move a running simulation.

Alternative considered: running the engine on the main thread inside `requestAnimationFrame`. Simpler plumbing, but at 100x playback with bursty traffic the engine can process tens of thousands of events per frame and would stall the UI. Rejected.

### Engine design notes

- **Events** live in a binary min-heap keyed on sim time. Event kinds: `arrival`, `apiDone`, `jobDone`, `externalDone`, `visibilityExpired`, `deadline`, `coldStartDone`, `drainExpired`, `scalerTick`, `metricsTick`.
- **RNG** is a seeded 32-bit generator (mulberry32). Lognormal from p50 and p95: `mu = ln(p50)`, `sigma = ln(p95 / p50) / 1.645`. Normal draws via Box-Muller.
- **Arrivals** use a nonhomogeneous Poisson process by thinning against a known maximum rate. Instantaneous rate = base × profile(t) × burstMultiplier(t) × (10x active ? 10 : 1). The burst layer is a two-state process: quiet and burst, with exponentially distributed dwell times whose means are the configured gap and duration. Burst multiplier is `1 + burstiness × 4`, so burstiness 1 means bursts run at 5x.
- **Replica lifecycle** is shared by API and worker replicas: `coldStarting → ready → draining → gone`, and `ready → dead → coldStarting` on out-of-memory. A dead replica restarts in place and keeps counting toward the replica total.
- **Worker admission**: a ready worker with a free slot takes the oldest visible job immediately. On take, the job's memory is drawn. If base memory plus in-flight memory exceeds the limit, the replica dies: its in-flight jobs become invisible until the visibility timeout, and it enters `coldStarting`.
- **Job outcome**: external call completes after the processing-time draw. On success, the job completes. On failure or over-cap, the worker reports back and the job is requeued immediately with `attempt + 1`, or counted as an error when attempts are exhausted. Jobs from a dead worker are requeued via the visibility timeout instead.
- **Deadline**: a `deadline` event is scheduled at arrival. If the job has not completed by then, it is counted as an error at that instant and flagged. Its later completion is ignored for metrics, but the worker still finishes the work.
- **Autoscaler**: on each `scalerTick`, `desired = ceil(current × metric / target)`, clamped by step and min/max, and skipped while a cooldown is active. Scale-up creates `coldStarting` replicas. Scale-down marks the emptiest ready replicas `draining`.
- **Metrics**: a ring buffer of `(completionTime, latency)` for the rolling window. Each `metricsTick` (every 1 s sim time) computes p50/p95/p99 by sorting the window, error rate as `errors / (completions + errors)` in the window, in and out throughput, queue depth, and replica counts by state. The tick result is appended to the snapshot's `series` array; the worker clears it after posting.

### Snapshot shape

```ts
type Snapshot = {
  t: number;                       // sim seconds
  tenXRemaining: number;           // 0 when inactive
  series: MetricsPoint[];          // points since last snapshot
  schematic: {
    api: ReplicaView[];            // { state, inflight }
    queue: { visible: number; invisible: number };
    workers: ReplicaView[];        // { state, inflight, memUsedMb }
    external: { inflight: number; capped: boolean };
  };
};
```

### Config and parameter metadata

One `SimConfig` type with nested sections: `traffic`, `processing`, `api`, `queue`, `workers`, `external`, `sim`. Alongside it, a `PARAMS` table mapping each leaf path to `{ label, unit, min, max, step, short, long }`. Config drawers render from this table, so adding a parameter is one line in the type, one in the defaults, and one in the table.

## Files

```
.nvmrc                          node version pin
package.json                    engines.node pinned to the same version
vite.config.ts
tsconfig.json
index.html
src/main.tsx
src/engine/rng.ts               seeded RNG, normal, lognormal, exponential
src/engine/heap.ts              binary min-heap of events
src/engine/config.ts            SimConfig, DEFAULTS, PARAMS
src/engine/arrivals.ts          profile, burst state, thinning
src/engine/engine.ts            Engine class: state, event handlers, advance, snapshot
src/engine/metrics.ts           rolling window, percentiles
src/engine/types.ts             Job, Replica, Snapshot, MetricsPoint
src/engine/*.test.ts
src/worker/sim.worker.ts        loop, message protocol
src/worker/protocol.ts          message types shared with the app
src/app/App.tsx                 layout grid
src/app/store.ts                snapshot, series ring buffers, config, worker handle
src/app/tokens.css              design tokens from the frontend-design skill
src/app/components/Controls.tsx
src/app/components/Schematic.tsx
src/app/components/Chart.tsx    canvas line chart, multi-series
src/app/components/Charts.tsx   the five chart panels
src/app/components/ConfigDrawer.tsx
src/app/components/ParamField.tsx
src/app/components/DistributionEditor.tsx
src/app/components/Explain.tsx  one- or two-sentence panel blurb with expand
```

## Steps

1. **Scaffold** - files: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `.nvmrc`, `.gitignore` - Vite React TypeScript template, Vitest, Node pinned. `git init` and first commit. - verify: `npm run build` and `npm test` both pass on an empty test.
2. **RNG and distributions** - files: `src/engine/rng.ts`, `src/engine/rng.test.ts` - verify: test that 20 000 lognormal draws from p50 = 8, p95 = 30 land within 5 % of those quantiles; test that two generators with the same seed produce identical sequences.
3. **Event heap and config** - files: `src/engine/heap.ts`, `src/engine/config.ts`, `src/engine/types.ts`, tests - verify: heap pops in time order under random inserts; every leaf in `DEFAULTS` has a `PARAMS` entry and vice versa, checked by a test.
4. **Arrivals** - files: `src/engine/arrivals.ts`, test - verify: with burstiness 0 and constant profile, arrival count over 1 000 s is within 5 % of rate × 1 000; with burstiness 1, the coefficient of variation of per-second counts is materially higher than at 0; 10x active doubles nothing else but the rate.
5. **Engine happy path** - files: `src/engine/engine.ts`, `src/engine/metrics.ts`, tests - arrivals, API handling, queue, workers with fixed replica counts, external resource, completion metrics. No failure modes, no scaling yet. - verify: at low load with constant processing time, p50 latency equals API handling time plus processing time within one metrics tick; at load above worker capacity, queue depth grows monotonically; same seed and config produce identical snapshots.
6. **Failure modes** - files: `src/engine/engine.ts`, tests - deadline, retries, visibility timeout, external failure rate and capacity cap, worker out-of-memory with restart. - verify: one test per mode with a config that forces it, asserting the error is counted exactly once and, for out-of-memory, that the replica passes through `dead` then `coldStarting` and its jobs reappear after the visibility timeout.
7. **Autoscaling and drain** - files: `src/engine/engine.ts`, tests - shared scaler for both tiers, cold start, drain grace period. - verify: sustained load above capacity raises worker replicas to max in steps respecting cooldown; dropping load to zero drains replicas back to min with no errors generated by scale-down.
8. **Worker wrapper** - files: `src/worker/sim.worker.ts`, `src/worker/protocol.ts` - wall-clock loop at about 30 Hz, speed multiplier, pause, reset, live config swap, 10x with countdown. Worker created with `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })` so Vite bundles it. - verify: temporary console logging in `main.tsx` shows snapshots arriving at 1x, 10x, and 100x with sim time advancing at the expected ratio; `vite build` output contains a separate worker chunk.
9. **App shell and store** - files: `src/app/App.tsx`, `src/app/store.ts`, `src/app/tokens.css`, `src/main.tsx` - layout grid per the concept, design tokens, store that keeps the last 600 metrics points. Empty panels with titles. - verify: renders at about 400 px and 1280 px with no horizontal scroll; UI checklist in the frontend-design skill.
10. **Controls** - files: `src/app/components/Controls.tsx` - start, pause, reset, speed, seed, base rate, burstiness, 10x with countdown. - verify: each control changes the snapshot visibly; keyboard operable.
11. **Schematic** - files: `src/app/components/Schematic.tsx` - four labelled rectangles, one health square per replica, queue depth bar with visible and invisible portions, external in-flight count. Clicking a component opens its drawer. - verify: forcing out-of-memory via config shows squares turn red then amber then green; queue bar moves.
12. **Charts** - files: `src/app/components/Chart.tsx`, `src/app/components/Charts.tsx` - one canvas line chart component, five panels: latency p50/p95/p99, error rate, throughput in and out, queue depth, replicas by tier. Redraw on each snapshot. Handles device pixel ratio and resize. - verify: 100x playback for five sim minutes stays smooth; charts scroll and the y-axis rescales.
13. **Config drawers** - files: `src/app/components/ConfigDrawer.tsx`, `src/app/components/ParamField.tsx`, `src/app/components/DistributionEditor.tsx` - drawer per component rendered from `PARAMS`; distribution editor with preset select plus p50 and p95 inputs; time profile select with its parameters. Long descriptions behind an expand. - verify: every default in the concept table is reachable and editing it changes engine behavior while running.
14. **Explanations** - files: `src/app/components/Explain.tsx`, edits to each panel - one or two sentences per panel from the concept. - verify: read through as someone seeing it for the first time.
15. **Tune defaults** - files: `src/engine/config.ts`, `docs/concept.md` - run the default scenario at 100x for ten sim minutes; adjust so it is healthy, then press 10x and confirm breakdown with recovery afterward. Record final defaults in the concept table. - verify: the scenario behaves as described, screenshots kept in `docs/`.
16. **Deploy** - files: `.nvmrc`, `package.json`, `vercel.json` only if needed - connect the repository to Vercel, confirm framework preset is Vite, output `dist`. - verify: the deployed URL runs the default scenario and the worker loads without console errors.

## Risks and open questions

- **Blocks start:** none.
- **Decide during implementation:**
  - Thinning needs a maximum rate. Use base × max profile value × 5 × 10 and recompute when config changes.
  - Percentile computation sorts the window each tick. At 100x with high rates the window may hold tens of thousands of points. If profiling shows a stall, switch to a fixed-bucket histogram.
  - Whether drain should also apply to API replicas or only workers. Plan assumes both, per the concept table.
  - Chart y-axis scaling: fixed per chart versus auto. Start with auto and a minimum span.
  - Whether the seed field regenerates on reset or persists. Start with persist.

## Throwaway

- `Chart.tsx` is a minimal line chart with no legend interaction, tooltips, or zoom. Do not grow it into a library.
- The worker protocol is untyped beyond `protocol.ts`. No versioning, no error channel.
- The store is a plain React context with `useReducer`. No persistence, no undo.
- Screenshots in `docs/` from step 15 are for the record, not a regression suite.

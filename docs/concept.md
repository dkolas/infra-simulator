# Infra Simulator: Project Concept

**Status:** draft for review
**Date:** 2026-09-13

## 1. Purpose

A visual, interactive simulator for a simple backend architecture of the kind used to run an agent harness. Users turn knobs for incoming traffic and component configuration, start the simulation, and watch latency and error rates tick along with a live schematic of the system. The goal is to run realistic scenarios and predict how the architecture scales and where it begins to break down given a set of parameters.

This is a proof of concept. It should be convincing to look at, correct in the mechanisms it models, and small enough to change quickly.

**Audience:** the author, to reason about the architecture, and other people it is demonstrated to. The UI carries short, clear explanations of what is on screen. Longer descriptions of configuration parameters live behind a click.

## 2. The architecture being simulated

```
clients ──▶ [ Web API containers ] ──▶ [ Queue ] ──▶ [ Worker containers ] ──▶ [ External resource ]
                    │                                        │
                    └── returns job id immediately           └── result recorded on completion
```

- **Web API containers** accept requests, enqueue a job, and respond immediately with a job id. They are lightweight and limited by concurrent connections.
- **Queue** holds jobs in first-in, first-out order with a maximum depth and a retry policy.
- **Worker containers** pull jobs, call the external resource, and record the result. They are I/O bound and hold N jobs concurrently, but each job carries a meaningful memory footprint.
- **External resource** represents everything outside the simulation, such as a model API. It has its own latency distribution, an optional capacity cap, and a failure rate.

The API is asynchronous. **End-to-end latency** is the time from request arrival to job completion. API response time is tracked separately because API saturation is its own failure mode.

## 3. Simulation model

### 3.1 Engine

- Discrete-event simulation with a seeded random number generator, so a given configuration and seed replays identically.
- Simulation time is decoupled from wall-clock time. Playback runs at 1x, 10x, or 100x, and can be paused and reset.
- Metrics are aggregated over a rolling simulation-time window and emitted on a fixed tick for the charts.

### 3.2 Incoming traffic

Arrivals are generated in two layers.

1. **Base rate and time profile.** A base rate in requests per second, shaped by a profile over the scenario timeline: constant, linear ramp, step, or sine for a diurnal pattern.
2. **Burst layer.** The generator alternates between a quiet state and a burst state. Burst intensity, typical duration, and frequency are configurable. The burstiness knob scales intensity. At zero the arrival process is plain Poisson.

The **10x button** multiplies the current rate for a configurable duration of simulation time and shows a countdown while active.

### 3.3 Processing time and memory

- **Processing time** per job is drawn from a distribution. Default is lognormal, parameterized by p50 and p95 so the inputs are intuitive. Presets: constant, exponential, lognormal, and bimodal for a mix of cheap and expensive jobs.
- **Memory per job** is drawn from its own distribution with the same parameterization.

Processing time is the latency of the external resource, since that is where a worker spends its time.

### 3.4 Containers and autoscaling

Both container types share one generic autoscaling model. It does not mimic any specific platform.

| Parameter | Meaning |
|---|---|
| min / max replicas | bounds on the replica count |
| scaling metric | workers: queue depth per worker; API: in-flight requests per container |
| target | the metric value the scaler tries to hold |
| evaluation interval | how often the scaler checks the metric |
| scale-up step, cooldown | how many replicas to add and the wait before adding again |
| scale-down step, cooldown | how many to remove and the wait before removing again |
| cold start | time from a scale-up decision to a replica accepting work |
| drain grace period | on scale-down a replica stops taking new work, finishes in-flight work, and is terminated when idle or when the grace period expires, whichever comes first |

Worker-specific parameters: concurrency per container, memory limit per container, and base memory used by the runtime before any job runs. When base memory plus the memory of in-flight jobs exceeds the limit, the container dies. Its in-flight jobs fail, and it restarts after a cold start.

API-specific parameters: maximum concurrent connections per container and a small fixed handling time.

### 3.5 Queue and retries

- Maximum depth. A job arriving to a full queue is rejected.
- Maximum attempts. A job that fails is requeued until it has used all attempts, then counted as an error.
- Visibility timeout. A job taken by a worker that dies or fails without reporting back becomes visible again only after this timeout, then counts as a new attempt.
- Job deadline. A job that exceeds the deadline from arrival to completion is counted as an error. The worker is not told. It keeps processing the job to completion, consuming a concurrency slot and memory for work nobody will use. This is realistic and is one of the amplifiers the simulator should show.

Retries are included from the start because they amplify load during a breakdown, which is the classic death spiral this simulator should be able to show.

### 3.6 External resource

- Latency comes from the processing-time distribution above.
- Optional capacity cap expressed as a maximum concurrent calls or calls per minute. Calls over the cap fail immediately. Off by default.
- Failure rate, a percentage of calls that fail regardless of load.

### 3.7 Errors

For the first version all failure modes are counted together into one error rate. The failure modes that exist in the model are:

- API container over its connection limit rejects the request.
- Queue at maximum depth rejects the job.
- Job exceeds its deadline.
- Worker container dies from memory pressure, failing its in-flight jobs.
- External resource returns a failure or is over its capacity cap.

Breaking these out is listed under future enhancements.

## 4. Metrics

Shown as ticking charts over the last several minutes of simulation time:

- End-to-end latency p50, p95, p99
- Error rate as a percentage of completed or failed jobs
- Throughput in and out, requests per second
- Queue depth
- Replica count per container type, including replicas still cold-starting

## 5. User interface

### 5.1 Layout

- **Schematic** occupies the top of the screen. Each component is a labelled rectangle. Inside it, one small square per replica, color coded by health: cold-starting, healthy, degraded, dead. The queue shows a depth bar. The external resource shows its in-flight count. Request flow is indicated simply, by counters or a light pulse along the edges, not by particle animation.
- **Controls** sit beside the schematic: start, pause, reset, playback speed, seed, the base rate knob, the burstiness knob, and the 10x button.
- **Charts** occupy the lower part of the screen.
- **Configuration** for each component opens on click, in a drawer or panel, so the main view stays clean. Each parameter has a short label and unit, with a longer description available on hover or expand.

### 5.2 Explanations

Every panel has one or two sentences saying what it shows and why it matters. This is for demonstrating to people who did not build the simulator.

### 5.3 Visual design

An old-school sci-fi terminal: phosphor monochrome on a dark ground, a single monospace typeface, boxed panels, no gradients or shadows. Color is reserved for state, so warnings and failures stand out. The retro treatment is the frame; the data stays the hero. The detailed direction lives in the frontend-design skill.

## 6. Sensible defaults

Starting values, chosen so the default scenario runs healthy and breaks down under the 10x button. To be tuned once the engine runs.

| Area | Parameter | Default |
|---|---|---|
| Traffic | base rate | 10 req/s |
| Traffic | time profile | constant |
| Traffic | burstiness | 0.3 |
| Traffic | 10x duration | 60 s |
| Processing | time distribution | lognormal, p50 8 s, p95 30 s |
| Processing | memory per job | lognormal, p50 50 MB, p95 130 MB (p99 about 200 MB) |
| API | connections per container | 200 |
| API | handling time | 5 ms |
| API | replicas min / max | 2 / 10 |
| API | target in-flight per container | 100 |
| API | cold start | 5 s |
| API | drain grace period | 10 s |
| API | eval interval, up cooldown, down cooldown | 15 s, 30 s, 300 s |
| Queue | max depth | 10 000 |
| Queue | max attempts | 3 |
| Queue | visibility timeout | 60 s |
| Queue | job deadline | 120 s |
| Workers | concurrency per container | 14 |
| Workers | memory limit | 1.5 GB |
| Workers | base memory (runtime, before any job) | 256 MB |
| Workers | replicas min / max | 4 / 20 |
| Workers | target queue depth per worker | 10 |
| Workers | cold start | 30 s |
| Workers | drain grace period | 60 s |
| Workers | scale step up / down | 4 / 1 |
| Workers | eval interval, up cooldown, down cooldown | 15 s, 30 s, 300 s |
| External | capacity cap | off |
| External | failure rate | 1 % |
| Sim | playback speed | 10x |
| Sim | percentile window | 30 s of sim time |
| Sim | chart span | last 10 min of sim time |

## 7. Out of scope for the proof of concept

- Persistence of any kind. Reloading the page resets the simulation.
- Multiple queues, priorities, or more than one worker pool.
- Network latency between components.
- CPU modeling. API containers are bounded by connections, workers by memory and concurrency.
- Making the API tier easy to saturate. At default rates it will not break, which matches how an async harness fails in practice. Users can raise the rate to explore it.
- Mimicking a specific cloud platform's autoscaler.

## 8. Future enhancements

- **Errors broken out by cause**, each with its own color on the error chart, so the first thing to break is visible.
- **Configurable scenarios**: export and import configuration as JSON, built-in presets, and side-by-side comparison of two runs.
- **Breaking-point sweep**: automatically increase load until an SLA is violated and report the rate at which it happened.
- **SLA overlay**: a target latency and error budget drawn on the charts, with the moment of violation marked.
- **Cost estimate**: replica-seconds per container type as a proxy for spend.
- **Richer schematic**: animated request flow along the edges.
- **Hand-drawn traffic profile**: a piecewise-linear curve editor as an additional time profile.
- **Per-component latency breakdown**: time in queue versus time in worker versus time in external resource.

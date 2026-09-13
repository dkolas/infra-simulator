import { useEffect, useRef } from 'react';
import type { ProfileKind } from '../../engine/config';
import { store, useSim, type DrawerId } from '../store';
import { DistributionEditor } from './DistributionEditor';
import { Explain } from './Explain';
import { ParamField } from './ParamField';

const TITLES: Record<Exclude<DrawerId, null>, string> = {
  traffic: 'Incoming requests',
  api: 'Web API containers',
  queue: 'Queue',
  workers: 'Worker containers',
  external: 'External resource',
  sim: 'Metrics',
};

const PROFILE_PARAMS: Record<ProfileKind, string[]> = {
  constant: [],
  ramp: ['traffic.rampTo', 'traffic.rampDuration'],
  step: ['traffic.stepTo', 'traffic.stepAt'],
  sine: ['traffic.sineAmplitude', 'traffic.sinePeriod'],
};

const SCALING = ['min', 'max', 'target', 'evalInterval', 'upStep', 'upCooldown', 'downStep', 'downCooldown', 'coldStart', 'drainGrace'];

function Fields({ paths }: { paths: string[] }) {
  return (
    <>
      {paths.map((p) => (
        <ParamField key={p} path={p} />
      ))}
    </>
  );
}

function Scaling({ tier }: { tier: 'api' | 'workers' }) {
  return (
    <fieldset className="group">
      <legend>Autoscaling</legend>
      <Explain
        short="A generic scaler, not any specific platform."
        long="Every evaluation interval it computes desired = ceil(current × observed ÷ target), then adds or removes at most one step, waiting out the cooldown between decisions. Replicas in a cooldown or cold start still count as current."
      />
      <Fields paths={SCALING.map((k) => `${tier}.scaling.${k}`)} />
    </fieldset>
  );
}

function Body({ id }: { id: Exclude<DrawerId, null> }) {
  const { config } = useSim();
  switch (id) {
    case 'traffic':
      return (
        <>
          <Explain short="Requests arrive at random with this average rate, shaped by a profile over time and a burst layer on top." />
          <Fields paths={['traffic.baseRate', 'traffic.tenXDuration']} />
          <fieldset className="group">
            <legend>Profile over time</legend>
            <div className="param-row">
              <label htmlFor="profile-kind">Profile</label>
              <select id="profile-kind" value={config.traffic.profileKind} onChange={(e) => store.update('traffic.profileKind', e.target.value)}>
                <option value="constant">constant</option>
                <option value="ramp">ramp</option>
                <option value="step">step</option>
                <option value="sine">sine</option>
              </select>
            </div>
            <Fields paths={PROFILE_PARAMS[config.traffic.profileKind]} />
          </fieldset>
          <fieldset className="group">
            <legend>Bursts</legend>
            <Fields paths={['traffic.burstiness', 'traffic.burstDuration', 'traffic.burstGap']} />
          </fieldset>
          <DistributionEditor path="processing.time" title="Processing time per job (s)" />
          <DistributionEditor path="processing.memoryMb" title="Memory per job (MB)" />
        </>
      );
    case 'api':
      return (
        <>
          <Explain short="Accepts a request, puts a job on the queue, and answers immediately with a job id. Limited by concurrent connections." />
          <Fields paths={['api.connections', 'api.handlingMs']} />
          <Scaling tier="api" />
        </>
      );
    case 'queue':
      return (
        <>
          <Explain short="First in, first out. Holds jobs until a worker has a free slot." />
          <Fields paths={['queue.maxDepth', 'queue.maxAttempts', 'queue.visibilityTimeout', 'queue.deadline']} />
        </>
      );
    case 'workers':
      return (
        <>
          <Explain
            short="Pull jobs and call the external resource. I/O bound, so each holds many jobs at once, but every job costs memory."
            long="When base memory plus in-flight job memory passes the limit the container dies, its jobs go invisible until the visibility timeout, and it restarts after a cold start."
          />
          <Fields paths={['workers.concurrency', 'workers.memoryLimitMb', 'workers.baseMemoryMb']} />
          <Scaling tier="workers" />
        </>
      );
    case 'external':
      return (
        <>
          <Explain short="Everything outside the simulation, such as a model API. Processing time is its latency. Optionally capped." />
          <div className="param-row">
            <label htmlFor="cap-enabled">Capacity cap</label>
            <input id="cap-enabled" type="checkbox" checked={config.external.capEnabled} onChange={(e) => store.update('external.capEnabled', e.target.checked)} />
          </div>
          <Fields paths={['external.capConcurrent', 'external.failureRate']} />
        </>
      );
    case 'sim':
      return (
        <>
          <Explain short="How the charts are computed." />
          <Fields paths={['sim.metricsWindow']} />
        </>
      );
  }
}

export function ConfigDrawer() {
  const { drawer } = useSim();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.openDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [drawer]);
  if (!drawer) return null;
  return (
    <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="panel-head">
        <h2 id="drawer-title">{TITLES[drawer]}</h2>
        <button ref={closeRef} type="button" onClick={() => store.openDrawer(null)}>
          close
        </button>
      </div>
      <div className="drawer-body">
        <Body id={drawer} />
      </div>
    </aside>
  );
}

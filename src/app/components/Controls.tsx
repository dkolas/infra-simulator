import { PARAMS } from '../../engine/config';
import { store, useSim } from '../store';
import { Explain } from './Explain';

const SPEEDS = [1, 10, 100];

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Controls() {
  const { config, seed, running, speed, snapshot } = useSim();
  const tenX = snapshot?.tenXRemaining ?? 0;
  const rate = PARAMS['traffic.baseRate'];
  const burst = PARAMS['traffic.burstiness'];
  return (
    <section className="panel controls" aria-label="Simulation controls">
      <div className="panel-head">
        <h2>Controls</h2>
        <span>
          T+{fmtTime(snapshot?.t ?? 0)} <span className="muted">{running ? `running ${speed}×` : 'paused'}</span>
        </span>
      </div>
      <Explain short="Simulation time runs faster than the clock. Knobs apply immediately to a running simulation." />
      <div className="button-row">
        {running ? (
          <button type="button" className="primary" onClick={() => store.pause()}>
            pause
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => store.start()}>
            start
          </button>
        )}
        <button type="button" onClick={() => store.reset()}>
          reset
        </button>
        <label>
          speed{' '}
          <select value={speed} onChange={(e) => store.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label>
          seed{' '}
          <input type="number" value={seed} min={0} step={1} style={{ width: '5em' }} onChange={(e) => store.setSeed(Number(e.target.value) || 0)} />
        </label>
      </div>
      <div className="knob">
        <label htmlFor="knob-rate">
          {rate.label} <span className="muted">{config.traffic.baseRate} {rate.unit}</span>
        </label>
        <input id="knob-rate" type="range" min={0} max={200} step={1} value={config.traffic.baseRate} onChange={(e) => store.update('traffic.baseRate', Number(e.target.value))} />
      </div>
      <div className="knob">
        <label htmlFor="knob-burst">
          {burst.label} <span className="muted">{config.traffic.burstiness.toFixed(2)}</span>
          {snapshot?.burstActive && <span className="warn"> burst</span>}
        </label>
        <input id="knob-burst" type="range" min={0} max={1} step={0.05} value={config.traffic.burstiness} onChange={(e) => store.update('traffic.burstiness', Number(e.target.value))} />
      </div>
      <button type="button" className="warn tenx" disabled={tenX > 0} onClick={() => store.tenX()}>
        {tenX > 0 ? `10× load  ${Math.ceil(tenX)}s` : `10× load for ${config.traffic.tenXDuration}s`}
      </button>
      <button type="button" className="link" onClick={() => store.openDrawer('traffic')}>
        configure requests
      </button>
    </section>
  );
}

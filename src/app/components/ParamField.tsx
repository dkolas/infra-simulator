import { useState } from 'react';
import { PARAMS, getPath } from '../../engine/config';
import { store, useSim } from '../store';

/** Numeric config input rendered from PARAMS metadata for a dotted path. */
export function ParamField({ path }: { path: string }) {
  const { config } = useSim();
  const meta = PARAMS[path];
  const value = getPath(config, path) as number;
  const [showLong, setShowLong] = useState(false);
  const id = `param-${path.replace(/\./g, '-')}`;
  return (
    <div className="param">
      <div className="param-row">
        <label htmlFor={id}>{meta.label}</label>
        <span>
          <input
            id={id}
            type="number"
            value={value}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) store.update(path, Math.min(meta.max, Math.max(meta.min, v)));
            }}
          />
          {meta.unit && <span className="muted"> {meta.unit}</span>}
        </span>
      </div>
      <p className="explain">
        {meta.short}
        {meta.long && (
          <>
            {' '}
            <button type="button" aria-expanded={showLong} onClick={() => setShowLong((s) => !s)}>
              {showLong ? 'less' : 'more'}
            </button>
            {showLong && <> {meta.long}</>}
          </>
        )}
      </p>
    </div>
  );
}

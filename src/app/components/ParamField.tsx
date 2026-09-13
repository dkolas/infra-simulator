import { useEffect, useState } from 'react';
import { PARAMS, getPath } from '../../engine/config';
import { store, useSim } from '../store';

/** Numeric config input rendered from PARAMS metadata for a dotted path. */
export function ParamField({ path }: { path: string }) {
  const { config } = useSim();
  const meta = PARAMS[path];
  const value = getPath(config, path) as number;
  const [draft, setDraft] = useState(String(value));
  const [showLong, setShowLong] = useState(false);
  const id = `param-${path.replace(/\./g, '-')}`;

  // Follow external changes (reset, another control) while not mid-edit.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(meta.max, Math.max(meta.min, v));
    setDraft(String(clamped));
    if (clamped !== value) store.update(path, clamped);
  };

  return (
    <div className="param">
      <div className="param-row">
        <label htmlFor={id}>{meta.label}</label>
        <span>
          <input
            id={id}
            type="number"
            value={draft}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
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

import type { DistributionKind } from '../../engine/rng';
import { getPath } from '../../engine/config';
import { store, useSim } from '../store';
import { ParamField } from './ParamField';

const KINDS: { value: DistributionKind; label: string }[] = [
  { value: 'lognormal', label: 'lognormal' },
  { value: 'exponential', label: 'exponential' },
  { value: 'constant', label: 'constant' },
  { value: 'bimodal', label: 'bimodal' },
];

const NOTES: Record<DistributionKind, string> = {
  lognormal: 'Long right tail, typical for model calls. Set the median and the 95th percentile.',
  exponential: 'Memoryless. Only the mean is used.',
  constant: 'Every job takes exactly the p50 value.',
  bimodal: 'A mix of cheap jobs around p50 and expensive jobs around p95.',
};

/** Preset select plus the numeric fields relevant to the chosen distribution. */
export function DistributionEditor({ path, title }: { path: string; title: string }) {
  const { config } = useSim();
  const kind = getPath(config, `${path}.kind`) as DistributionKind;
  const id = `dist-${path.replace(/\./g, '-')}`;
  return (
    <fieldset className="group">
      <legend>{title}</legend>
      <div className="param-row">
        <label htmlFor={id}>Distribution</label>
        <select id={id} value={kind} onChange={(e) => store.update(`${path}.kind`, e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <p className="explain">{NOTES[kind]}</p>
      <ParamField path={`${path}.p50`} />
      {(kind === 'lognormal' || kind === 'bimodal') && <ParamField path={`${path}.p95`} />}
      {kind === 'bimodal' && <ParamField path={`${path}.heavyFraction`} />}
    </fieldset>
  );
}

import { expect, test } from 'vitest';
import { DEFAULTS, PARAMS, getPath, numericLeafPaths, setPath } from './config';

test('every numeric leaf in DEFAULTS has PARAMS metadata', () => {
  const missing = numericLeafPaths(DEFAULTS).filter((p) => !PARAMS[p]);
  expect(missing).toEqual([]);
});

test('every PARAMS entry points at a numeric leaf in DEFAULTS', () => {
  const stale = Object.keys(PARAMS).filter((p) => typeof getPath(DEFAULTS, p) !== 'number');
  expect(stale).toEqual([]);
});

test('defaults sit within their declared bounds', () => {
  for (const [path, meta] of Object.entries(PARAMS)) {
    const v = getPath(DEFAULTS, path) as number;
    expect(v, path).toBeGreaterThanOrEqual(meta.min);
    expect(v, path).toBeLessThanOrEqual(meta.max);
  }
});

test('setPath returns a new object without mutating the original', () => {
  const next = setPath(DEFAULTS, 'workers.scaling.max', 99);
  expect(getPath(next, 'workers.scaling.max')).toBe(99);
  expect(DEFAULTS.workers.scaling.max).toBe(20);
  expect(next.api).toBe(DEFAULTS.api);
});

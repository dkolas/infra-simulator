import { expect, test } from 'vitest';
import { TimeHeap } from './heap';
import { Rng } from './rng';

test('pops in time order under random inserts', () => {
  const heap = new TimeHeap<number>();
  const rng = new Rng(3);
  const times: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const t = Math.floor(rng.next() * 1000);
    times.push(t);
    heap.push(t, i);
  }
  times.sort((a, b) => a - b);
  for (const expected of times) expect(heap.pop()!.t).toBe(expected);
  expect(heap.pop()).toBeUndefined();
});

test('equal times pop in insertion order', () => {
  const heap = new TimeHeap<string>();
  heap.push(5, 'a');
  heap.push(5, 'b');
  heap.push(5, 'c');
  expect(heap.pop()!.v).toBe('a');
  expect(heap.pop()!.v).toBe('b');
  expect(heap.pop()!.v).toBe('c');
});

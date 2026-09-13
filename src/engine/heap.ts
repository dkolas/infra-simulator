/** Binary min-heap keyed on a numeric time. Ties break by insertion order. */
export class TimeHeap<T> {
  private items: { t: number; seq: number; v: T }[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(t: number, v: T): void {
    const items = this.items;
    items.push({ t, seq: this.seq++, v });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }

  peekTime(): number | undefined {
    return this.items[0]?.t;
  }

  pop(): { t: number; v: T } | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(l, m)) m = l;
        if (r < items.length && this.less(r, m)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return { t: top.t, v: top.v };
  }

  clear(): void {
    this.items = [];
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.t < y.t || (x.t === y.t && x.seq < y.seq);
  }
}

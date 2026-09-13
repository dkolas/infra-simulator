import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetricsPoint } from '../../engine/types';

export type SeriesSpec = {
  key: keyof MetricsPoint;
  label: string;
  /** A design token name such as '--text'. Resolved at draw time; canvas cannot read var(). */
  color: string;
  dashed?: boolean;
  /** Moving-average window in points, for noisy per-second series. */
  smooth?: number;
};

type Props = {
  data: MetricsPoint[];
  series: SeriesSpec[];
  /** Sim seconds shown on the x-axis. */
  span: number;
  /** Latest sim time; the right edge of the chart. */
  now: number;
  format: (v: number) => string;
  /** Smallest y range, so a flat line does not fill the chart. */
  minY?: number;
  /** Fixed upper bound, for rates. */
  maxY?: number;
  height?: number;
};

const FONT = '11px "IBM Plex Mono", ui-monospace, monospace';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fmtAgo(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `-${m}:${String(s).padStart(2, '0')}`;
}

/** Per-series values, smoothed where requested, aligned with `data`. */
function values(data: MetricsPoint[], s: SeriesSpec): number[] {
  const raw = data.map((p) => p[s.key] as number);
  const w = s.smooth ?? 1;
  if (w <= 1) return raw;
  const out = new Array<number>(raw.length);
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    sum += raw[i];
    if (i >= w) sum -= raw[i - w];
    out[i] = sum / Math.min(w, i + 1);
  }
  return out;
}

/** Minimal multi-series line chart on a canvas with a hover cursor. */
export function Chart({ data, series, span, now, format, minY = 1, maxY, height = 140 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hoverT = useRef<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const line = cssVar('--line');
    const muted = cssVar('--muted');
    const padL = 44;
    const padR = 6;
    const padT = 6;
    const padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const t0 = now - span;

    const cols = series.map((s) => values(data, s));
    let top = minY;
    for (const col of cols) for (const v of col) top = Math.max(top, v);
    if (maxY !== undefined) top = maxY;
    top *= maxY === undefined ? 1.1 : 1;

    const x = (t: number) => padL + ((t - t0) / span) * plotW;
    const y = (v: number) => padT + plotH - (Math.min(v, top) / top) * plotH;

    ctx.strokeStyle = line;
    ctx.fillStyle = muted;
    ctx.font = FONT;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = (top * i) / 4;
      const yy = y(v);
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(w - padR, yy);
      ctx.stroke();
      ctx.fillText(format(v), padL - 4, yy);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const t = t0 + (span * i) / 4;
      const agoMin = (span * (4 - i)) / 4 / 60;
      const label = i === 4 ? 'now' : `-${Number.isInteger(agoMin) ? agoMin : agoMin.toFixed(1)}m`;
      ctx.fillText(label, x(t), h - padB + 4);
    }

    series.forEach((s, si) => {
      const col = cols[si];
      ctx.strokeStyle = cssVar(s.color);
      ctx.setLineDash(s.dashed ? [3, 3] : []);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i].t < t0) continue;
        const px = x(data[i].t);
        const py = y(col[i]);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Hover cursor: nearest point in sim time to the pointer.
    const ht = hoverT.current;
    if (ht !== null && data.length > 0) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < data.length; i++) {
        const d = Math.abs(data[i].t - ht);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const p = data[best];
      if (p.t >= t0) {
        const px = x(p.t);
        ctx.strokeStyle = cssVar('--warn');
        ctx.beginPath();
        ctx.moveTo(px, padT);
        ctx.lineTo(px, padT + plotH);
        ctx.stroke();
        series.forEach((s, si) => {
          ctx.fillStyle = cssVar(s.color);
          ctx.beginPath();
          ctx.arc(px, y(cols[si][best]), 3, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = cssVar('--warn');
        ctx.textAlign = px > padL + plotW / 2 ? 'right' : 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(fmtAgo(now - p.t), px + (px > padL + plotW / 2 ? -4 : 4), padT);
      }
      setHoverIndex((cur) => (cur === best ? cur : best));
    }
  }, [data, series, span, now, format, minY, maxY, height]);

  useEffect(() => {
    draw();
    const canvas = ref.current;
    if (!canvas) return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const padL = 44;
    const padR = 6;
    const plotW = rect.width - padL - padR;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - padL) / plotW));
    hoverT.current = now - span + frac * span;
    draw();
  };
  const onPointerLeave = () => {
    hoverT.current = null;
    setHoverIndex(null);
    draw();
  };

  const shown = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : data[data.length - 1];
  const cols = series.map((s) => values(data, s));
  const shownIndex = hoverIndex !== null && data[hoverIndex] ? hoverIndex : data.length - 1;
  return (
    <div className="chart">
      <canvas
        ref={ref}
        style={{ width: '100%', height, touchAction: 'none' }}
        role="img"
        aria-label={series.map((s) => `${s.label} ${shown ? format(shown[s.key] as number) : 'no data'}`).join(', ')}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
      <ul className="legend">
        {series.map((s, si) => (
          <li key={s.key} style={{ color: `var(${s.color})` }}>
            <span aria-hidden="true">{s.dashed ? '╌' : '─'} </span>
            {s.label}
            {shown && <span className="value"> {format(cols[si][shownIndex])}</span>}
          </li>
        ))}
        {hoverIndex !== null && shown && <li className="warn">at {fmtAgo(now - shown.t)}</li>}
      </ul>
    </div>
  );
}

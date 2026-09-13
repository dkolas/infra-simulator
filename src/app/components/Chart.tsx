import { useEffect, useRef } from 'react';
import type { MetricsPoint } from '../../engine/types';

export type SeriesSpec = {
  key: keyof MetricsPoint;
  label: string;
  color: string;
  dashed?: boolean;
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

/** Minimal multi-series line chart on a canvas. Redraws on every data change. */
export function Chart({ data, series, span, now, format, minY = 1, maxY, height = 140 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
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

      let top = minY;
      for (const p of data) for (const s of series) top = Math.max(top, p[s.key] as number);
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

      for (const s of series) {
        ctx.strokeStyle = s.color;
        ctx.setLineDash(s.dashed ? [3, 3] : []);
        ctx.beginPath();
        let started = false;
        for (const p of data) {
          if (p.t < t0) continue;
          const px = x(p.t);
          const py = y(p[s.key] as number);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [data, series, span, now, format, minY, maxY, height]);

  const latest = data[data.length - 1];
  return (
    <div className="chart">
      <canvas ref={ref} style={{ width: '100%', height }} role="img" aria-label={series.map((s) => `${s.label} ${latest ? format(latest[s.key] as number) : 'no data'}`).join(', ')} />
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key} style={{ color: s.color }}>
            <span aria-hidden="true">{s.dashed ? '╌' : '─'} </span>
            {s.label} <span className="value">{latest ? format(latest[s.key] as number) : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

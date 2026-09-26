import { useEffect, useMemo, useRef, useState } from "react";
import { formatDay, formatShortDay } from "../lib/format";

type Point = { date: string; value: number; note?: string };

/**
 * Single-series line chart for change over time. The series colour is
 * validated for contrast against both surfaces (see the dataviz guidance):
 * light #3f55d6, dark #6b7ff0. Single series → no legend; the card title names it.
 */
export function TrendChart({ points, label, height = 220 }: { points: Point[]; label: string; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 16, right: 44, bottom: 26, left: 36 };
  const innerW = Math.max(width - pad.left - pad.right, 10);
  const innerH = height - pad.top - pad.bottom;

  const { x, y, ticks } = useMemo(() => {
    const values = points.map((p) => p.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, max);
    // Nice ticks: zero-based if the range is close to zero, otherwise padded.
    const lo = min < max * 0.4 ? 0 : Math.floor((min * 0.9) / 10) * 10;
    const step = Math.max(1, Math.ceil((max - lo) / 4 / 5) * 5);
    const hi = lo + step * 4;
    return {
      x: (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
      y: (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH,
      ticks: [0, 1, 2, 3, 4].map((i) => lo + step * i),
    };
  }, [points, innerW, innerH, pad.left, pad.top]);

  if (points.length === 0) return null;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(points.length - 1).toFixed(1)},${pad.top + innerH}L${x(0).toFixed(1)},${pad.top + innerH}Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 70))));
  const last = points.length - 1;
  const active = hover ?? null;

  const nearest = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const rel = clientX - rect.left - pad.left;
    return Math.round(Math.min(Math.max(rel / innerW, 0), 1) * (points.length - 1));
  };

  return (
    <div ref={wrap} className="relative text-zinc-400 dark:text-zinc-500 [--series:#3f55d6] dark:[--series:#6b7ff0]">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${points.length} data points from ${formatDay(points[0]!.date)} to ${formatDay(points[last]!.date)}, latest ${points[last]!.value}.`}
        tabIndex={0}
        className="block touch-pan-y outline-none"
        onPointerMove={(e) => setHover(nearest(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(last)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? last) + 1));
        }}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--series)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--series)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.18} strokeDasharray={t === ticks[0] ? undefined : "2 4"} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="currentColor">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          (i % labelEvery === 0 && last - i >= labelEvery * 0.6) || i === last ? (
            <text key={p.date} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="currentColor">
              {formatShortDay(p.date)}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#trend-fill)" />
        <path d={line} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} stroke="currentColor" strokeOpacity={0.5} />
        )}
        {/* Direct label on the latest value */}
        <circle cx={x(last)} cy={y(points[last]!.value)} r={4} fill="var(--series)" className="stroke-white dark:stroke-zinc-900" strokeWidth={2} />
        <text x={x(last) + 8} y={y(points[last]!.value)} dy="0.32em" fontSize={12} fontWeight={600} className="fill-zinc-700 dark:fill-zinc-200">
          {points[last]!.value}
        </text>
        {active !== null && active !== last && (
          <circle cx={x(active)} cy={y(points[active]!.value)} r={4} fill="var(--series)" className="stroke-white dark:stroke-zinc-900" strokeWidth={2} />
        )}
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-800"
          style={{ left: Math.min(Math.max(x(active), 60), width - 60) }}
        >
          <div className="text-sm font-semibold text-zinc-900 tabular-nums dark:text-white">{points[active]!.value}</div>
          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="h-0.5 w-3 rounded bg-[var(--series)]" aria-hidden />
            {formatDay(points[active]!.date)}
          </div>
          {points[active]!.note && <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">{points[active]!.note}</div>}
        </div>
      )}
    </div>
  );
}

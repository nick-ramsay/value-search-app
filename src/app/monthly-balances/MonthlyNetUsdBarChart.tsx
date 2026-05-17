"use client";

import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import { parseMonthKey } from "@/lib/monthly-balances";

export type NetUsdBarPoint = {
  monthKey: string;
  shortLabel: string;
} & (
  | { kind: "ok"; netUsd: number }
  | { kind: "empty" }
  | { kind: "mixed" }
);

function formatAxisUsd(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      compactDisplay: "short",
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return `$${n.toFixed(0)}`;
  }
}

/** Full month name + year for tooltips and screen readers (matches table row wording). */
function formatMonthFull(monthKey: string): string {
  const d = parseMonthKey(monthKey);
  if (!d) return monthKey;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

/** Two-line x-axis: short month, then 4-digit year (readable without rotation). */
function monthAxisTwoLines(monthKey: string): { month: string; year: string } {
  const d = parseMonthKey(monthKey);
  if (!d) return { month: monthKey, year: "" };
  return {
    month: d.toLocaleString(undefined, { month: "short" }),
    year: String(d.getFullYear()),
  };
}

type MonthlyNetUsdBarChartProps = {
  points: NetUsdBarPoint[];
};

/**
 * Vertical bars of Net (USD) by month (chronological left → right).
 * Chart width grows with month count so labels stay legible; scroll horizontally when needed.
 */
export default function MonthlyNetUsdBarChart({ points }: MonthlyNetUsdBarChartProps) {
  const gradId = useId().replace(/:/g, "");
  const chartScrollWrapRef = useRef<HTMLDivElement>(null);

  const okVals = useMemo(
    () =>
      points
        .filter((p): p is NetUsdBarPoint & { kind: "ok"; netUsd: number } => p.kind === "ok")
        .map((p) => p.netUsd),
    [points],
  );

  /** Layout width (must match values below) for scroll sync when the figure is shown. */
  const layoutW = useMemo(() => {
    const MIN_SLOT_W = 56;
    const BASE_CHART_W = 720;
    const padL = 52;
    const padR = 12;
    const n = points.length;
    const MIN_PLOT_W = BASE_CHART_W - padL - padR;
    const plotW = Math.max(MIN_PLOT_W, n * MIN_SLOT_W);
    return padL + plotW + padR;
  }, [points]);

  const chartScrollSyncKey = useMemo(
    () =>
      `${points.length}:${points.map((p) => p.monthKey).join(",")}:${layoutW}`,
    [points, layoutW],
  );

  /** Latest months are on the right; scroll the wrap so they’re in view first (matches wide sheet table). */
  useLayoutEffect(() => {
    if (points.length === 0 || okVals.length === 0) return;
    const wrap = chartScrollWrapRef.current;
    if (!wrap) return;
    const snapRight = () => {
      wrap.scrollLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    };
    snapRight();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(snapRight);
    });
    const t0 = window.setTimeout(snapRight, 0);
    const t1 = window.setTimeout(snapRight, 80);
    const ro = new ResizeObserver(snapRight);
    ro.observe(wrap);
    const svg = wrap.firstElementChild;
    if (svg) ro.observe(svg);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      ro.disconnect();
    };
  }, [chartScrollSyncKey, okVals.length, points.length]);

  if (points.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        Add month rows to see your Net (USD) trend.
      </p>
    );
  }

  if (okVals.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        Net (USD) bars appear when at least one month has a computable total (entered balances and
        valid FX rates).
      </p>
    );
  }

  let minV = Math.min(0, ...okVals);
  let maxV = Math.max(0, ...okVals);
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
    return null;
  }
  if (Math.abs(maxV - minV) < 1e-9) {
    const pad = Math.abs(minV) < 1e-9 ? 1 : Math.abs(minV) * 0.08;
    minV -= pad;
    maxV += pad;
  }

  /** Minimum horizontal space per month so stacked labels stay readable (no squashing). */
  const MIN_SLOT_W = 56;
  const BASE_CHART_W = 720;
  const padL = 52;
  const padR = 12;
  const padT = 10;
  const padB = 50;
  const H = 222;
  const MIN_PLOT_W = BASE_CHART_W - padL - padR;

  const n = points.length;
  const plotW = Math.max(MIN_PLOT_W, n * MIN_SLOT_W);
  const W = padL + plotW + padR;
  const plotH = H - padT - padB;

  const yAt = (v: number) => padT + ((maxV - v) / (maxV - minV)) * plotH;
  const zeroY = yAt(0);
  const slotW = plotW / n;
  const barW = Math.max(4, Math.min(slotW * 0.58, 52));

  const showScrollHint = plotW > MIN_PLOT_W;

  const monthBaselineY = H - 36;
  const ariaSummary = points
    .map((p) => {
      const label = formatMonthFull(p.monthKey);
      if (p.kind === "ok") {
        return `${label}: ${formatMoneyAmount(p.netUsd, "USD")}`;
      }
      return `${label}: unavailable`;
    })
    .join("; ");

  return (
    <figure className="monthly-balances-net-chart-figure mb-0">
      <div
        ref={chartScrollWrapRef}
        className="monthly-balances-net-chart-svg-wrap"
      >
        <svg
          className="monthly-balances-net-chart-svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label={`Net in US dollars by month. ${ariaSummary}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success)" stopOpacity="0.92" />
              <stop offset="100%" stopColor="var(--success)" stopOpacity="0.42" />
            </linearGradient>
            <linearGradient id={`${gradId}-neg`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.48" />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            rx={10}
            ry={10}
            className="monthly-balances-net-chart-plot-bg"
          />

          <g aria-hidden="true">
            {([0.25, 0.5, 0.75] as const).map((frac) => (
              <line
                key={frac}
                x1={padL}
                x2={padL + plotW}
                y1={padT + frac * plotH}
                y2={padT + frac * plotH}
                className="monthly-balances-net-chart-grid-line"
              />
            ))}
          </g>

          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={zeroY}
              y2={zeroY}
              className="monthly-balances-net-chart-zero-line"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={padT + 11}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd(maxV)}
            </text>
            <text
              x={padL - 8}
              y={padT + plotH * 0.5 + 4}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd((maxV + minV) / 2)}
            </text>
            <text
              x={padL - 8}
              y={padT + plotH - 3}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd(minV)}
            </text>
          </g>

          <g>
            {points.map((p, i) => {
              const cx = padL + i * slotW + slotW / 2;
              const x = cx - barW / 2;
              const fullMonth = formatMonthFull(p.monthKey);

              if (p.kind !== "ok") {
                return (
                  <g key={p.monthKey}>
                    <rect
                      x={x}
                      y={zeroY - 3}
                      width={barW}
                      height={6}
                      rx={3}
                      className="monthly-balances-net-chart-placeholder-bar"
                    >
                      <title>
                        {fullMonth}: Net unavailable
                        {p.kind === "mixed" ? " (missing FX rate or invalid rate)" : ""}
                      </title>
                    </rect>
                  </g>
                );
              }

              const v = p.netUsd;
              const yTop = yAt(v);
              const yBot = zeroY;
              const top = Math.min(yTop, yBot);
              const h = Math.max(Math.abs(yBot - yTop), 2);
              const fill = v >= 0 ? `url(#${gradId})` : `url(#${gradId}-neg)`;

              return (
                <g key={p.monthKey}>
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    rx={4}
                    className="monthly-balances-net-chart-bar"
                    fill={fill}
                  >
                    <title>
                      {fullMonth}: {formatMoneyAmount(v, "USD")}
                    </title>
                  </rect>
                </g>
              );
            })}
          </g>

          {/* Stacked month / year — drawn above bars, horizontal (no diagonal overlap). */}
          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              const cx = padL + i * slotW + slotW / 2;
              const { month, year } = monthAxisTwoLines(p.monthKey);
              return (
                <text
                  key={p.monthKey}
                  x={cx}
                  y={monthBaselineY}
                  textAnchor="middle"
                  className="monthly-balances-net-chart-x-label"
                >
                  <tspan className="monthly-balances-net-chart-x-month" x={cx}>
                    {month}
                  </tspan>
                  <tspan className="monthly-balances-net-chart-x-year" x={cx} dy="13">
                    {year}
                  </tspan>
                </text>
              );
            })}
          </g>
        </svg>
      </div>
      {showScrollHint ? (
        <p className="small text-secondary mb-0 mt-2 monthly-balances-net-chart-scroll-hint">
          <i className="bi bi-arrow-left-right me-1" aria-hidden />
          Scroll sideways to see every month; hover a bar for the full date and amount.
        </p>
      ) : null}
    </figure>
  );
}

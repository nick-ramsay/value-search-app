"use client";

import { useId, useMemo } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";

export type YearlyNetUsdBarRow = {
  year: number;
  averageNetUsd: number;
  monthCount: number;
};

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

type YearlyNetUsdBarChartProps = {
  rows: YearlyNetUsdBarRow[];
};

/**
 * Vertical bars of average monthly Net (USD) by calendar year (chronological left → right).
 * Matches {@link MonthlyNetUsdBarChart} styling; chart width grows with year count.
 */
export default function YearlyNetUsdBarChart({ rows }: YearlyNetUsdBarChartProps) {
  const gradId = useId().replace(/:/g, "");

  const points = useMemo(
    () => [...rows].sort((a, b) => a.year - b.year),
    [rows],
  );

  const okVals = points.map((p) => p.averageNetUsd).filter((v) => Number.isFinite(v));

  if (points.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        No yearly averages to chart yet.
      </p>
    );
  }

  if (okVals.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        Bars appear when yearly averages include valid amounts.
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

  const xBaselineY = H - 36;
  const ariaSummary = points
    .map((p) => {
      const amt = formatMoneyAmount(p.averageNetUsd, "USD");
      return `${p.year}: ${amt} (${p.monthCount} month${p.monthCount === 1 ? "" : "s"})`;
    })
    .join("; ");

  return (
    <figure className="monthly-balances-net-chart-figure mb-0">
      <div className="monthly-balances-net-chart-svg-wrap">
        <svg
          className="monthly-balances-net-chart-svg"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label={`Average monthly net worth in US dollars by year. ${ariaSummary}`}
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
              const v = p.averageNetUsd;
              const yTop = yAt(v);
              const yBot = zeroY;
              const top = Math.min(yTop, yBot);
              const h = Math.max(Math.abs(yBot - yTop), 2);
              const fill = v >= 0 ? `url(#${gradId})` : `url(#${gradId}-neg)`;
              const tip = `${p.year}: ${formatMoneyAmount(v, "USD")} (avg of ${p.monthCount} month${p.monthCount === 1 ? "" : "s"})`;

              return (
                <g key={p.year}>
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    rx={4}
                    className="monthly-balances-net-chart-bar"
                    fill={fill}
                  >
                    <title>{tip}</title>
                  </rect>
                </g>
              );
            })}
          </g>

          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              const cx = padL + i * slotW + slotW / 2;
              const mo =
                p.monthCount === 1 ? "1 mo." : `${p.monthCount} mo.`;
              return (
                <text
                  key={p.year}
                  x={cx}
                  y={xBaselineY}
                  textAnchor="middle"
                  className="monthly-balances-net-chart-x-label"
                >
                  <tspan className="monthly-balances-net-chart-x-month" x={cx}>
                    {String(p.year)}
                  </tspan>
                  <tspan className="monthly-balances-net-chart-x-year" x={cx} dy="13">
                    {mo}
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
          Scroll sideways to see every year; hover a bar for the average amount and month count.
        </p>
      ) : null}
    </figure>
  );
}

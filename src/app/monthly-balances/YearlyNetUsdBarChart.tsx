"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import { buildAreaPath, computeLabelStep, toLineSegments } from "./areaLineChartMath";
import { useContainerWidth } from "./useContainerWidth";
import FitToScreenToggle from "./FitToScreenToggle";

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

const MIN_SLOT_W = 56;
const MIN_LABEL_SLOT_W = 34;
const BASE_CHART_W = 720;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 50;
const H = 222;
const MIN_PLOT_W = BASE_CHART_W - PAD_L - PAD_R;
const MIN_FIT_PLOT_W = 160;

/**
 * Area/line chart of average monthly Net (USD) by calendar year (chronological left → right).
 * Matches {@link MonthlyNetUsdBarChart}'s styling and "fit to screen" behavior.
 */
export default function YearlyNetUsdBarChart({ rows }: YearlyNetUsdBarChartProps) {
  const gradId = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(false);
  const containerWidth = useContainerWidth(wrapRef);

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
        The line appears when yearly averages include valid amounts.
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

  const n = points.length;
  const naturalPlotW = Math.max(MIN_PLOT_W, n * MIN_SLOT_W);
  const fitPlotW =
    containerWidth != null ? Math.max(MIN_FIT_PLOT_W, containerWidth - PAD_L - PAD_R) : naturalPlotW;
  const plotW = fit ? fitPlotW : naturalPlotW;
  const W = PAD_L + plotW + PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const yAt = (v: number) => PAD_T + ((maxV - v) / (maxV - minV)) * plotH;
  const zeroY = yAt(0);
  const slotW = plotW / n;
  const pointR = Math.max(1.8, Math.min(slotW * 0.22, 4));

  const showScrollHint = !fit && plotW > MIN_PLOT_W;
  const labelStep = computeLabelStep(n, plotW, MIN_LABEL_SLOT_W);

  const xBaselineY = H - 36;
  const ariaSummary = points
    .map((p) => {
      const amt = formatMoneyAmount(p.averageNetUsd, "USD");
      return `${p.year}: ${amt} (${p.monthCount} month${p.monthCount === 1 ? "" : "s"})`;
    })
    .join("; ");

  const lineData = points.map((p, i) => ({
    x: PAD_L + i * slotW + slotW / 2,
    y: Number.isFinite(p.averageNetUsd) ? yAt(p.averageNetUsd) : null,
  }));
  const segments = toLineSegments(lineData);
  const posClipId = `${gradId}-clip-pos`;
  const negClipId = `${gradId}-clip-neg`;

  return (
    <figure className="monthly-balances-net-chart-figure mb-0">
      <div className="monthly-balances-net-chart-toolbar">
        <FitToScreenToggle fit={fit} onToggle={() => setFit((f) => !f)} />
      </div>
      <div ref={wrapRef} className="monthly-balances-net-chart-svg-wrap">
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
              <stop offset="0%" stopColor="var(--success)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--success)" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${gradId}-neg`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.03" />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity="0.5" />
            </linearGradient>
            <clipPath id={posClipId}>
              <rect x={PAD_L} y={PAD_T} width={plotW} height={Math.max(0, zeroY - PAD_T)} />
            </clipPath>
            <clipPath id={negClipId}>
              <rect
                x={PAD_L}
                y={zeroY}
                width={plotW}
                height={Math.max(0, PAD_T + plotH - zeroY)}
              />
            </clipPath>
          </defs>

          <rect
            x={PAD_L}
            y={PAD_T}
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
                x1={PAD_L}
                x2={PAD_L + plotW}
                y1={PAD_T + frac * plotH}
                y2={PAD_T + frac * plotH}
                className="monthly-balances-net-chart-grid-line"
              />
            ))}
          </g>

          <g>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={zeroY}
              y2={zeroY}
              className="monthly-balances-net-chart-zero-line"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={PAD_T + 11}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd(maxV)}
            </text>
            <text
              x={PAD_L - 8}
              y={PAD_T + plotH * 0.5 + 4}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd((maxV + minV) / 2)}
            </text>
            <text
              x={PAD_L - 8}
              y={PAD_T + plotH - 3}
              textAnchor="end"
              className="monthly-balances-net-chart-axis-label"
              fontSize={10}
            >
              {formatAxisUsd(minV)}
            </text>
          </g>

          <g>
            {segments.map((segment, si) => {
              const areaPath = buildAreaPath(segment, zeroY);
              const linePath = segment
                .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                .join(" ");
              return (
                <g key={si}>
                  <path
                    d={areaPath}
                    fill={`url(#${gradId})`}
                    clipPath={`url(#${posClipId})`}
                    className="monthly-balances-net-chart-area"
                  />
                  <path
                    d={areaPath}
                    fill={`url(#${gradId}-neg)`}
                    clipPath={`url(#${negClipId})`}
                    className="monthly-balances-net-chart-area"
                  />
                  <path
                    d={linePath}
                    clipPath={`url(#${posClipId})`}
                    className="monthly-balances-net-chart-line monthly-balances-net-chart-line--pos"
                  />
                  <path
                    d={linePath}
                    clipPath={`url(#${negClipId})`}
                    className="monthly-balances-net-chart-line monthly-balances-net-chart-line--neg"
                  />
                </g>
              );
            })}
          </g>

          <g>
            {points.map((p, i) => {
              const cx = PAD_L + i * slotW + slotW / 2;
              const v = p.averageNetUsd;
              const tip = `${p.year}: ${formatMoneyAmount(v, "USD")} (avg of ${p.monthCount} month${p.monthCount === 1 ? "" : "s"})`;
              return (
                <circle
                  key={p.year}
                  cx={cx}
                  cy={yAt(v)}
                  r={pointR}
                  className={`monthly-balances-net-chart-point ${v >= 0 ? "monthly-balances-net-chart-point--pos" : "monthly-balances-net-chart-point--neg"}`}
                >
                  <title>{tip}</title>
                </circle>
              );
            })}
          </g>

          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              if (i !== n - 1 && i % labelStep !== 0) return null;
              const cx = PAD_L + i * slotW + slotW / 2;
              const mo = p.monthCount === 1 ? "1 mo." : `${p.monthCount} mo.`;
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
          Scroll sideways to see every year, or use “Fit to screen” — hover a point for the average
          amount and month count.
        </p>
      ) : null}
    </figure>
  );
}

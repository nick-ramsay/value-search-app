"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import { parseMonthKey } from "@/lib/monthly-balances";
import { buildAreaPath, computeLabelStep, toLineSegments } from "./areaLineChartMath";
import { useContainerWidth } from "./useContainerWidth";
import FitToScreenToggle from "./FitToScreenToggle";

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

/** Minimum horizontal space per month in the natural (scrollable) layout, and
 * the narrower minimum a label alone needs once "fit to screen" compresses
 * points closer together than that. */
const MIN_SLOT_W = 56;
const MIN_LABEL_SLOT_W = 34;
const BASE_CHART_W = 720;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 50;
const H = 222;
const MIN_PLOT_W = BASE_CHART_W - PAD_L - PAD_R;
/** Floor so an unusually narrow container can't collapse the fitted plot to nothing. */
const MIN_FIT_PLOT_W = 160;

/**
 * Area/line chart of net worth (USD) by month (chronological left → right).
 * Defaults to a natural width that scrolls horizontally once there are many
 * months; "Fit to screen" compresses the whole series into the available
 * width instead, thinning x-axis labels (never data points) so they don't
 * collide.
 */
export default function MonthlyNetUsdBarChart({ points }: MonthlyNetUsdBarChartProps) {
  const gradId = useId().replace(/:/g, "");
  const chartScrollWrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const containerWidth = useContainerWidth(chartScrollWrapRef);

  const okVals = useMemo(
    () =>
      points
        .filter((p): p is NetUsdBarPoint & { kind: "ok"; netUsd: number } => p.kind === "ok")
        .map((p) => p.netUsd),
    [points],
  );

  const n = points.length;
  const naturalPlotW = Math.max(MIN_PLOT_W, n * MIN_SLOT_W);
  const fitPlotW =
    containerWidth != null ? Math.max(MIN_FIT_PLOT_W, containerWidth - PAD_L - PAD_R) : naturalPlotW;
  const plotW = fit ? fitPlotW : naturalPlotW;
  const layoutW = PAD_L + plotW + PAD_R;

  const chartScrollSyncKey = useMemo(
    () => `${points.length}:${points.map((p) => p.monthKey).join(",")}:${layoutW}:${fit}`,
    [points, layoutW, fit],
  );

  /** Latest months are on the right; scroll the wrap so they’re in view first (matches wide sheet table). No-op once "fit" makes the whole chart visible without scrolling. */
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
        Add month rows to see your net worth (USD) trend.
      </p>
    );
  }

  if (okVals.length === 0) {
    return (
      <p className="small text-secondary mb-0">
        The net worth (USD) line appears when at least one month has a computable total (entered
        balances and valid FX rates).
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

  const W = PAD_L + plotW + PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const yAt = (v: number) => PAD_T + ((maxV - v) / (maxV - minV)) * plotH;
  const zeroY = yAt(0);
  const slotW = plotW / n;
  const pointR = Math.max(1.8, Math.min(slotW * 0.22, 4));

  const showScrollHint = !fit && plotW > MIN_PLOT_W;
  const labelStep = computeLabelStep(n, plotW, MIN_LABEL_SLOT_W);

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

  const lineData = points.map((p, i) => ({
    x: PAD_L + i * slotW + slotW / 2,
    y: p.kind === "ok" ? yAt(p.netUsd) : null,
  }));
  const segments = toLineSegments(lineData);
  const posClipId = `${gradId}-clip-pos`;
  const negClipId = `${gradId}-clip-neg`;

  return (
    <figure className="monthly-balances-net-chart-figure mb-0">
      <div className="monthly-balances-net-chart-toolbar">
        <FitToScreenToggle fit={fit} onToggle={() => setFit((f) => !f)} />
      </div>
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
          aria-label={`Net worth in US dollars by month. ${ariaSummary}`}
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

          {/* Area + line, split into segments so gap months (no computable total) break the line
              instead of being interpolated across, and clipped by the zero baseline so the fill/
              stroke color still flips at zero like the old bars did. */}
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
              const fullMonth = formatMonthFull(p.monthKey);

              if (p.kind !== "ok") {
                return (
                  <circle
                    key={p.monthKey}
                    cx={cx}
                    cy={zeroY}
                    r={pointR}
                    className="monthly-balances-net-chart-placeholder-point"
                  >
                    <title>
                      {fullMonth}: Net unavailable
                      {p.kind === "mixed" ? " (missing FX rate or invalid rate)" : ""}
                    </title>
                  </circle>
                );
              }

              const v = p.netUsd;
              return (
                <circle
                  key={p.monthKey}
                  cx={cx}
                  cy={yAt(v)}
                  r={pointR}
                  className={`monthly-balances-net-chart-point ${v >= 0 ? "monthly-balances-net-chart-point--pos" : "monthly-balances-net-chart-point--neg"}`}
                >
                  <title>
                    {fullMonth}: {formatMoneyAmount(v, "USD")}
                  </title>
                </circle>
              );
            })}
          </g>

          {/* Stacked month / year — thinned to labelStep so labels never collide when compressed.
              First/last labels anchor toward the inside of the plot (start/end rather than
              middle) so they grow away from the edge instead of overflowing past it when the
              slot is too narrow for half the label's width. */}
          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              if (i !== n - 1 && i % labelStep !== 0) return null;
              const cx = PAD_L + i * slotW + slotW / 2;
              const isFirst = i === 0;
              const isLast = i === n - 1;
              const anchor = isFirst ? "start" : isLast ? "end" : "middle";
              const { month, year } = monthAxisTwoLines(p.monthKey);
              return (
                <text
                  key={p.monthKey}
                  x={cx}
                  y={monthBaselineY}
                  textAnchor={anchor}
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
          Scroll sideways to see every month, or use “Fit to screen” — hover a point for the full
          date and amount.
        </p>
      ) : null}
    </figure>
  );
}

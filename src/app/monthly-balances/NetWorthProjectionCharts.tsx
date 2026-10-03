"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import type { MonteCarloYearSummaryJson } from "@/lib/monte-carlo-simulation-types";
import type { TrendAndProjectionPayload } from "@/lib/net-worth-projection";
import { buildAreaPath, computeLabelStep, toLineSegments } from "./areaLineChartMath";
import { useContainerWidth } from "./useContainerWidth";
import FitToScreenToggle from "./FitToScreenToggle";

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

type ScalarPoint = { year: number; value: number };

const MIN_SLOT_W = 44;
const MIN_LABEL_SLOT_W = 30;
const BASE_CHART_W = 720;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 46;
const H = 222;
const MIN_PLOT_W = BASE_CHART_W - PAD_L - PAD_R;
const MIN_FIT_PLOT_W = 160;

function ScalarUsdAreaChart({
  points,
  ariaSummaryPrefix,
}: {
  points: ScalarPoint[];
  ariaSummaryPrefix: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const containerWidth = useContainerWidth(wrapRef);

  const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v));

  if (points.length === 0) {
    return (
      <p className="small text-secondary mb-0">No projection points to chart.</p>
    );
  }

  if (vals.length === 0) {
    return (
      <p className="small text-secondary mb-0">Projection values are unavailable.</p>
    );
  }

  let minV = Math.min(0, ...vals);
  let maxV = Math.max(0, ...vals);
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

  const monthBaselineY = H - 34;
  const ariaSummary = points
    .map((p) => `${p.year}: ${formatMoneyAmount(p.value, "USD")}`)
    .join("; ");

  const lineData = points.map((p, i) => ({
    x: PAD_L + i * slotW + slotW / 2,
    y: Number.isFinite(p.value) ? yAt(p.value) : null,
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
          aria-label={`${ariaSummaryPrefix}. ${ariaSummary}`}
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
              const v = p.value;
              return (
                <circle
                  key={`${p.year}-${i}`}
                  cx={cx}
                  cy={yAt(v)}
                  r={pointR}
                  className={`monthly-balances-net-chart-point ${v >= 0 ? "monthly-balances-net-chart-point--pos" : "monthly-balances-net-chart-point--neg"}`}
                >
                  <title>
                    {p.year}: {formatMoneyAmount(v, "USD")}
                  </title>
                </circle>
              );
            })}
          </g>

          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              if (i !== n - 1 && i % labelStep !== 0) return null;
              const cx = PAD_L + i * slotW + slotW / 2;
              return (
                <text
                  key={`${p.year}-xl-${i}`}
                  x={cx}
                  y={monthBaselineY}
                  textAnchor="middle"
                  className="monthly-balances-net-chart-x-label"
                >
                  <tspan className="monthly-balances-net-chart-x-month" x={cx}>
                    {String(p.year)}
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
          Scroll sideways to see every year, or use “Fit to screen” — hover a point for the amount.
        </p>
      ) : null}
    </figure>
  );
}

function ProjectionValuesAccordion({
  points,
  valueMode,
}: {
  points: ScalarPoint[];
  valueMode: "monte-carlo" | "cagr";
}) {
  const uid = useId().replace(/:/g, "");
  const accordionId = `mb-proj-values-acc-${uid}`;
  const collapseId = `mb-proj-values-collapse-${uid}`;
  const valueHeading =
    valueMode === "monte-carlo" ? "Median net (USD)" : "Projected net (USD)";

  return (
    <div
      className="accordion mb-projection-values-accordion mt-3"
      id={accordionId}
    >
      <div className="accordion-item mb-projection-values-accordion__item">
        <h4 className="accordion-header mb-0">
          <button
            type="button"
            className="accordion-button collapsed mb-projection-values-accordion__btn"
            data-bs-toggle="collapse"
            data-bs-target={`#${collapseId}`}
            aria-expanded="false"
            aria-controls={collapseId}
          >
            <span className="mb-projection-values-accordion__btn-inner">
              <span className="mb-projection-values-accordion__label">
                Year-by-year values
              </span>
              <span className="mb-projection-values-accordion__hint text-secondary">
                Same figures as the chart
              </span>
            </span>
          </button>
        </h4>
        <div
          id={collapseId}
          className="accordion-collapse collapse"
          data-bs-parent={`#${accordionId}`}
        >
          <div className="accordion-body mb-projection-values-accordion__body">
            <div className="mb-projection-values-table-wrap">
              <table className="mb-projection-values-table">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">{valueHeading}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.year}>
                      <td>{p.year}</td>
                      <td>{formatMoneyAmount(p.value, "USD")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type NetWorthProjectionChartsProps = {
  projection: TrendAndProjectionPayload | null;
  /** When present (from Python worker), bars use median (p50) “most likely” net per year. */
  monteCarloYearSummaries: MonteCarloYearSummaryJson[] | null;
};

/** Area/line chart: Monte Carlo median path when stored; otherwise CAGR-compounded projection. */
export default function NetWorthProjectionCharts({
  projection,
  monteCarloYearSummaries,
}: NetWorthProjectionChartsProps) {
  const useMonteCarlo =
    Array.isArray(monteCarloYearSummaries) && monteCarloYearSummaries.length > 0;
  const [showInfo, setShowInfo] = useState(false);

  const nwPoints = useMemo<ScalarPoint[]>(() => {
    if (useMonteCarlo) {
      return [...monteCarloYearSummaries!]
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ year: row.year, value: row.p50 }));
    }
    if (!projection?.projectionYears?.length) return [];
    return projection.projectionYears.map((row) => ({
      year: row.year,
      value: row.projectedNetWorthUsd,
    }));
  }, [useMonteCarlo, monteCarloYearSummaries, projection]);

  if (nwPoints.length === 0) {
    return (
      <p className="text-secondary small mb-0">
        No projections to chart yet. For the <strong>CAGR</strong> view, yearly averages must
        sync first—use <strong>Monthly Sheet</strong> or <strong>Year Averages</strong>. For the{" "}
        <strong>Monte Carlo (most likely)</strong> view, run the pyworker projection script so{" "}
        <code className="user-select-all">usernetworthmontecarlosimulations</code> has a document
        for your account.
      </p>
    );
  }

  return (
    <div className="net-worth-projection-charts">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h3
          className="mb-0 monthly-balances-net-chart-section__title"
          id="mb-projection-nw-heading"
        >
          {useMonteCarlo
            ? "Most Likely Total Net (USD) by Year (Monte Carlo)"
            : "Projected Total Net (USD) by Year"}
        </h3>
        <button
          type="button"
          className="btn btn-link p-0 monthly-balances-account-info-btn"
          onClick={() => setShowInfo((v) => !v)}
          aria-expanded={showInfo}
          aria-controls="mb-projection-nw-caption"
          aria-label="About this chart"
          title="About this chart"
        >
          <i className="bi bi-info-circle" aria-hidden />
        </button>
      </div>
      {showInfo ? (
        <p id="mb-projection-nw-caption" className="small text-secondary mb-2">
          {useMonteCarlo
            ? "Median (p50) across simulated paths. Illustrative only."
            : "Compounded from your baseline using your historical CAGR. Illustrative only."}
        </p>
      ) : null}
      <ScalarUsdAreaChart
        points={nwPoints}
        ariaSummaryPrefix={
          useMonteCarlo
            ? "Most likely total net worth in US dollars by calendar year from Monte Carlo median"
            : "Projected total net worth in US dollars by calendar year"
        }
      />

      <ProjectionValuesAccordion
        points={nwPoints}
        valueMode={useMonteCarlo ? "monte-carlo" : "cagr"}
      />

    </div>
  );
}

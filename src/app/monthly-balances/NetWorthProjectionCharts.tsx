"use client";

import { useId, useMemo } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import type { MonteCarloYearSummaryJson } from "@/lib/monte-carlo-simulation-types";
import type { TrendAndProjectionPayload } from "@/lib/net-worth-projection";

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

function ScalarUsdBarChart({
  points,
  ariaSummaryPrefix,
}: {
  points: ScalarPoint[];
  ariaSummaryPrefix: string;
}) {
  const gradId = useId().replace(/:/g, "");

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

  const MIN_SLOT_W = 44;
  const BASE_CHART_W = 720;
  const padL = 52;
  const padR = 12;
  const padT = 10;
  const padB = 46;
  const H = 222;
  const MIN_PLOT_W = BASE_CHART_W - padL - padR;

  const n = points.length;
  const plotW = Math.max(MIN_PLOT_W, n * MIN_SLOT_W);
  const W = padL + plotW + padR;
  const plotH = H - padT - padB;

  const yAt = (v: number) => padT + ((maxV - v) / (maxV - minV)) * plotH;
  const zeroY = yAt(0);
  const slotW = plotW / n;
  const barW = Math.max(3, Math.min(slotW * 0.52, 44));

  const showScrollHint = plotW > MIN_PLOT_W;

  const monthBaselineY = H - 34;
  const ariaSummary = points
    .map((p) => `${p.year}: ${formatMoneyAmount(p.value, "USD")}`)
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
          aria-label={`${ariaSummaryPrefix}. ${ariaSummary}`}
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
              const v = p.value;
              const yTop = yAt(v);
              const yBot = zeroY;
              const top = Math.min(yTop, yBot);
              const h = Math.max(Math.abs(yBot - yTop), 2);
              const fill = v >= 0 ? `url(#${gradId})` : `url(#${gradId}-neg)`;

              return (
                <g key={`${p.year}-${i}`}>
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
                      {p.year}: {formatMoneyAmount(v, "USD")}
                    </title>
                  </rect>
                </g>
              );
            })}
          </g>

          <g className="monthly-balances-net-chart-x-labels" pointerEvents="none">
            {points.map((p, i) => {
              const cx = padL + i * slotW + slotW / 2;
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
          Scroll sideways to see every year; hover a bar for the amount.
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

/** Bar chart: Monte Carlo median path when stored; otherwise CAGR-compounded projection. */
export default function NetWorthProjectionCharts({
  projection,
  monteCarloYearSummaries,
}: NetWorthProjectionChartsProps) {
  const useMonteCarlo =
    Array.isArray(monteCarloYearSummaries) && monteCarloYearSummaries.length > 0;

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
        sync first—use <strong>Monthly sheet</strong> or <strong>Year averages</strong>. For the{" "}
        <strong>Monte Carlo (most likely)</strong> view, run the pyworker projection script so{" "}
        <code className="user-select-all">usernetworthmontecarlosimulations</code> has a document
        for your account.
      </p>
    );
  }

  return (
    <div className="net-worth-projection-charts">
      <h3
        className="h6 fw-semibold mb-2 monthly-balances-net-chart-section__title"
        id="mb-projection-nw-heading"
      >
        {useMonteCarlo
          ? "Most likely total Net (USD) by year (Monte Carlo)"
          : "Projected total Net (USD) by year"}
      </h3>
      <p className="small text-secondary mb-2">
        {useMonteCarlo
          ? "Median (p50) across simulated paths. Illustrative only."
          : "Compounded from your baseline using your historical CAGR. Illustrative only."}
      </p>
      <ScalarUsdBarChart
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

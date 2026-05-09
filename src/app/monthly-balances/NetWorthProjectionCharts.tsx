"use client";

import { useId, useMemo } from "react";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
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

type NetWorthProjectionChartsProps = {
  projection: TrendAndProjectionPayload | null;
};

/** Bar chart of projected Net (USD) by calendar year from stored CAGR compounding. */
export default function NetWorthProjectionCharts({
  projection,
}: NetWorthProjectionChartsProps) {
  const nwPoints = useMemo<ScalarPoint[]>(() => {
    if (!projection?.projectionYears?.length) return [];
    return projection.projectionYears.map((row) => ({
      year: row.year,
      value: row.projectedNetWorthUsd,
    }));
  }, [projection]);

  const meta = useMemo(() => {
    if (!projection) return null;
    const computed = new Date(projection.computedAt);
    const when = Number.isNaN(computed.getTime())
      ? projection.computedAt
      : computed.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
    const parts: string[] = [];
    if (projection.baselineMonthKey) {
      parts.push(
        `Baseline month ${projection.baselineMonthKey}: ${formatMoneyAmount(projection.baselineNetWorthUsd, "USD")}`,
      );
    } else {
      parts.push(
        `Baseline net worth: ${formatMoneyAmount(projection.baselineNetWorthUsd, "USD")}`,
      );
    }
    parts.push(`${projection.historicalPointsUsed} year(s) of yearly averages`);
    parts.push(`Computed ${when}`);
    return parts.join(" · ");
  }, [projection]);

  if (!projection || projection.projectionYears.length === 0) {
    return (
      <p className="text-secondary small mb-0">
        No projections yet. Yearly averages must sync first—use{" "}
        <strong>Monthly sheet</strong> or <strong>Year averages</strong>, then return
        here after the sheet updates.
      </p>
    );
  }

  return (
    <div className="net-worth-projection-charts">
      <p className="small text-secondary mb-3">{meta}</p>

      <p className="small text-secondary mb-4">
        {projection.simpleAnnualizedGrowthRate !== null ? (
          <>
            Projection compounds your baseline month at the historical{" "}
            <strong>CAGR</strong> from first to last yearly average (mean monthly Net snapshot per
            year):{" "}
            <strong>
              {(projection.simpleAnnualizedGrowthRate * 100).toFixed(2)}% per year
            </strong>
            .
          </>
        ) : (
          <>
            Historical CAGR was not computed (need at least two calendar years with positive first
            and last averages). The chart holds baseline flat at{" "}
            <strong>0% annual growth</strong>.
          </>
        )}
      </p>

      <h3
        className="h6 fw-semibold mb-2 monthly-balances-net-chart-section__title"
        id="mb-projection-nw-heading"
      >
        Projected total Net (USD) by year
      </h3>
      <p className="small text-secondary mb-2">
        Exponential projection from your latest-month baseline using that CAGR (each yearly average
        is the mean of monthly <strong>balance-sheet Net</strong> snapshots—not income).
        Illustrative only.
      </p>
      <ScalarUsdBarChart
        points={nwPoints}
        ariaSummaryPrefix="Projected total net worth in US dollars by calendar year"
      />

      <p className="small text-secondary monthly-balances-footnote mb-0 mt-3">
        <i className="bi bi-info-circle me-1" aria-hidden />
        Values are compounded <strong>wealth levels</strong> from baseline and historic average
        growth—not forecasts of returns. Not financial advice.
      </p>
    </div>
  );
}

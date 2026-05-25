"use client";

import { useEffect, useMemo, useState } from "react";

import { getRatingBadgeClass, toTitleCase } from "@/lib/ai-rating-display";

type HistoryPoint = {
  date: string;
  value: number;
  label?: string;
};

type HistoryResponse = {
  scoreHistory: HistoryPoint[];
  ratingHistory: HistoryPoint[];
};

type HistoryChartsProps = {
  symbol?: string;
  name?: string;
  /** Id for the collapse panel (must be unique per card). */
  collapseId: string;
  /** When true, use a smaller "View trends" button (e.g. in compact cards). */
  compact?: boolean;
  /** When true and this panel is open, show a small "Close" button inside the panel. */
  showInlineCloseAll?: boolean;
  /** Called when the inline "Close" is clicked (closes only this panel). */
  onCloseThisPanel?: () => void;
};

type ActiveView = "score" | "rating";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: HistoryResponse }
  | { status: "error"; message: string };

/** Fixed locale so server and client match (avoids hydration mismatch). */
function formatDateLabel(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "short",
    day: "numeric",
  });
}

/** Matches value score pill semantics on the card (0–100 scale). */
function scoreBadgeClassForPercent(pct: number): string {
  const p = Math.min(100, Math.max(0, pct));
  if (p > 66) return "badge bg-success text-white stock-card__badge";
  if (p >= 33) return "badge bg-warning text-dark stock-card__badge";
  return "badge bg-danger text-white stock-card__badge";
}

const SCORE_DOMAIN = { min: 0, max: 100 };

const SCORE_Y_TICKS: { value: number; label: string }[] = [
  { value: 100, label: "100%" },
  { value: 75, label: "75%" },
  { value: 50, label: "50%" },
  { value: 25, label: "25%" },
  { value: 0, label: "0%" },
];

const SCORE_BAND_ALPHA = [0.15, 0.09, 0.055, 0.03];

function clampScorePercent(value: number): number {
  return Math.min(SCORE_DOMAIN.max, Math.max(SCORE_DOMAIN.min, value));
}

function formatScoreTooltip(value: number, dateLabel: string, label?: string): string {
  const trimmed = typeof label === "string" ? label.trim() : "";
  const pct = `${clampScorePercent(value).toFixed(1).replace(/\.0$/, "")}%`;
  if (trimmed.length > 0) return `${trimmed} (${pct}) — ${dateLabel}`;
  return `${pct} — ${dateLabel}`;
}

function ValueScoreHistoryChart({
  data,
  gradientId = "valueScoreLineGrad",
}: {
  data: HistoryPoint[];
  gradientId?: string;
}) {
  const width = 560;
  const height = 200;
  const marginLeft = 52;
  const marginRight = 14;
  const marginTop = 10;
  const marginBottom = 34;

  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const layout = useMemo(() => {
    if (!data.length) return null;

    const valueToY = (v: number) =>
      marginTop +
      ((SCORE_DOMAIN.max - clampScorePercent(v)) /
        (SCORE_DOMAIN.max - SCORE_DOMAIN.min)) *
        plotH;

    const n = data.length;
    const xAt = (index: number) =>
      marginLeft + (n === 1 ? plotW / 2 : (index / (n - 1)) * plotW);

    const points = data.map((d, i) => ({
      x: xAt(i),
      y: valueToY(d.value),
      dateLabel: formatDateLabel(d.date),
      value: d.value,
    }));

    const lineD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const tickYs = SCORE_Y_TICKS.map((t) => ({
      ...t,
      y: valueToY(t.value),
    }));

    const bandRects: { y1: number; y2: number; key: string; alpha: number }[] = [];
    for (let i = 0; i < SCORE_Y_TICKS.length - 1; i++) {
      const hi = SCORE_Y_TICKS[i].value;
      const lo = SCORE_Y_TICKS[i + 1].value;
      const yTop = valueToY(hi);
      const yBot = valueToY(lo);
      bandRects.push({
        y1: yTop,
        y2: yBot,
        key: `${hi}-${lo}`,
        alpha: SCORE_BAND_ALPHA[i] ?? 0.04,
      });
    }

    const xTickIndices =
      n <= 1
        ? [0]
        : n <= 4
          ? data.map((_, i) => i)
          : (() => {
              const want = Math.min(6, n);
              const out: number[] = [];
              for (let k = 0; k < want; k++) {
                out.push(Math.round((k / (want - 1)) * (n - 1)));
              }
              return [...new Set(out)].sort((a, b) => a - b);
            })();

    return { points, lineD, tickYs, bandRects, xTickIndices };
  }, [data, marginLeft, plotW, plotH, marginTop]);

  if (!data.length) {
    return (
      <div className="text-center text-muted small py-4">
        No history available yet for this metric.
      </div>
    );
  }

  if (!layout) return null;

  const last = data[data.length - 1];
  const lastPct = clampScorePercent(last.value);
  const lastPctLabel = `${lastPct.toFixed(1).replace(/\.0$/, "")}%`;
  const ariaLabel = `Value score over time from ${SCORE_DOMAIN.min}% to ${SCORE_DOMAIN.max}% scale, latest ${lastPctLabel}`;

  const firstDateLabel = formatDateLabel(data[0].date);
  const lastDateLabel = formatDateLabel(data[data.length - 1].date);
  const rangeLabel =
    firstDateLabel === lastDateLabel
      ? firstDateLabel
      : `${firstDateLabel} – ${lastDateLabel}`;

  return (
    <div className="stock-card__trends-chart-wrap stock-card__score-history-chart w-100">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-2 small">
        <span className={scoreBadgeClassForPercent(last.value)}>
          <span>Latest: {lastPctLabel}</span>
        </span>
        <span className="text-muted" aria-hidden>
          •
        </span>
        <span className="text-muted">{rangeLabel}</span>
      </div>

      <div className="position-relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={ariaLabel}
          className="stock-card__score-history-chart-svg"
          style={{ width: "100%", height: "auto", minHeight: "200px" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>

          {layout.bandRects.map((b) => (
            <rect
              key={b.key}
              x={marginLeft}
              y={b.y1}
              width={plotW}
              height={Math.max(0.5, b.y2 - b.y1)}
              fill={`rgba(139, 92, 246, ${b.alpha})`}
            />
          ))}

          {layout.tickYs.map((t) => {
            const isBound = t.value === 0 || t.value === 100;
            return (
              <g key={t.value}>
                <line
                  x1={marginLeft}
                  x2={marginLeft + plotW}
                  y1={t.y}
                  y2={t.y}
                  stroke={
                    isBound
                      ? "rgba(148, 163, 184, 0.5)"
                      : "rgba(148, 163, 184, 0.22)"
                  }
                  strokeWidth={isBound ? 1.15 : 0.75}
                  strokeDasharray={isBound ? "5 4" : undefined}
                />
                <text
                  x={marginLeft - 8}
                  y={t.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="currentColor"
                  style={{
                    fontSize: "11px",
                    fontWeight: isBound ? 600 : 400,
                  }}
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          <path
            d={layout.lineD}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {layout.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--bs-body-bg, #fff)"
              stroke="#8b5cf6"
              strokeWidth={2}
            >
              <title>
                {formatScoreTooltip(data[i].value, p.dateLabel, data[i].label)}
              </title>
            </circle>
          ))}

          {layout.xTickIndices.map((i) => {
            const p = layout.points[i];
            return (
              <text
                key={`score-xt-${i}`}
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fill="currentColor"
                style={{ fontSize: "10px", opacity: 0.75 }}
              >
                {p.dateLabel}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Internal scale for API values; not shown in the chart UI. */
const RATING_DOMAIN = { min: -2, max: 2 };

const RATING_TICKS: { value: number; name: string }[] = [
  { value: 2, name: "Strong Buy" },
  { value: 1, name: "Buy" },
  { value: 0, name: "Neutral" },
  { value: -1, name: "Sell" },
  { value: -2, name: "Strong Sell" },
];

function clampRatingValue(value: number): number {
  return Math.min(RATING_DOMAIN.max, Math.max(RATING_DOMAIN.min, value));
}

function displayRatingForPoint(value: number, label?: string): string {
  const trimmed = typeof label === "string" ? label.trim() : "";
  if (trimmed.length > 0) return trimmed;
  const r = Math.round(clampRatingValue(value));
  const tick = RATING_TICKS.find((t) => t.value === r);
  return tick?.name ?? "Neutral";
}

function AiRatingHistoryChart({
  data,
  gradientId = "aiRatingLineGrad",
}: {
  data: HistoryPoint[];
  gradientId?: string;
}) {
  const width = 560;
  const height = 200;
  const marginLeft = 102;
  const marginRight = 14;
  const marginTop = 10;
  const marginBottom = 34;

  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const layout = useMemo(() => {
    if (!data.length) return null;

    const valueToY = (v: number) =>
      marginTop +
      ((RATING_DOMAIN.max - clampRatingValue(v)) / (RATING_DOMAIN.max - RATING_DOMAIN.min)) * plotH;

    const n = data.length;
    const xAt = (index: number) =>
      marginLeft + (n === 1 ? plotW / 2 : (index / (n - 1)) * plotW);

    const points = data.map((d, i) => ({
      x: xAt(i),
      y: valueToY(d.value),
      dateLabel: formatDateLabel(d.date),
      ratingText: displayRatingForPoint(d.value, d.label),
    }));

    const lineD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const tickYs = RATING_TICKS.map((t) => ({
      ...t,
      y: valueToY(t.value),
    }));

    const bandRects: {
      y1: number;
      y2: number;
      key: string;
      tone: "bull" | "weakBull" | "weakBear" | "bear";
    }[] = [];
    for (let i = 0; i < RATING_TICKS.length - 1; i++) {
      const hi = RATING_TICKS[i].value;
      const lo = RATING_TICKS[i + 1].value;
      const yTop = valueToY(hi);
      const yBot = valueToY(lo);
      const key = `${hi}-${lo}`;
      let tone: "bull" | "weakBull" | "weakBear" | "bear";
      if (hi === 2) tone = "bull";
      else if (lo === -2) tone = "bear";
      else if (hi === 1) tone = "weakBull";
      else tone = "weakBear";
      bandRects.push({
        y1: yTop,
        y2: yBot,
        key,
        tone,
      });
    }

    const first = data[0];
    const last = data[data.length - 1];
    const firstLabel = displayRatingForPoint(first.value, first.label);
    const lastLabel = displayRatingForPoint(last.value, last.label);

    const xTickIndices =
      n <= 1
        ? [0]
        : n <= 4
          ? data.map((_, i) => i)
          : (() => {
              const want = Math.min(6, n);
              const out: number[] = [];
              for (let k = 0; k < want; k++) {
                out.push(Math.round((k / (want - 1)) * (n - 1)));
              }
              return [...new Set(out)].sort((a, b) => a - b);
            })();

    return {
      points,
      lineD,
      tickYs,
      bandRects,
      firstLabel,
      lastLabel,
      xTickIndices,
    };
  }, [data, marginLeft, plotW, plotH, marginTop]);

  if (!data.length) {
    return (
      <div className="text-center text-muted small py-4">
        No history available yet for this metric.
      </div>
    );
  }

  if (!layout) return null;

  const ariaLabel = `AI rating over time from ${layout.firstLabel} to ${layout.lastLabel}`;

  const firstDateLabel = formatDateLabel(data[0].date);
  const lastDateLabel = formatDateLabel(data[data.length - 1].date);
  const rangeLabel =
    firstDateLabel === lastDateLabel
      ? firstDateLabel
      : `${firstDateLabel} – ${lastDateLabel}`;

  return (
    <div className="stock-card__trends-chart-wrap stock-card__ai-rating-chart w-100">
      <div className="d-flex align-items-center flex-wrap gap-2 mb-2 small">
        <span
          className={`${getRatingBadgeClass(layout.lastLabel)} stock-card__badge`}
        >
          <span>Latest: {toTitleCase(layout.lastLabel)}</span>
        </span>
        <span className="text-muted" aria-hidden>
          •
        </span>
        <span className="text-muted">{rangeLabel}</span>
      </div>

      <div className="position-relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={ariaLabel}
          className="stock-card__ai-rating-chart-svg"
          style={{ width: "100%", height: "auto", minHeight: "200px" }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7cb342" />
              <stop offset="100%" stopColor="#9ACD32" />
            </linearGradient>
          </defs>

          {layout.bandRects.map((b) => (
            <rect
              key={b.key}
              x={marginLeft}
              y={b.y1}
              width={plotW}
              height={Math.max(0.5, b.y2 - b.y1)}
              fill={
                b.tone === "bull"
                  ? "rgba(34, 197, 94, 0.14)"
                  : b.tone === "weakBull"
                    ? "rgba(34, 197, 94, 0.06)"
                    : b.tone === "weakBear"
                      ? "rgba(239, 68, 68, 0.06)"
                      : "rgba(239, 68, 68, 0.12)"
              }
              className="stock-card__ai-rating-band"
            />
          ))}

          {layout.tickYs.map((t) => (
            <g key={t.value}>
              <line
                x1={marginLeft}
                x2={marginLeft + plotW}
                y1={t.y}
                y2={t.y}
                stroke={
                  t.value === 0
                    ? "rgba(148, 163, 184, 0.55)"
                    : "rgba(148, 163, 184, 0.22)"
                }
                strokeWidth={t.value === 0 ? 1.25 : 0.75}
                strokeDasharray={t.value === 0 ? "6 4" : undefined}
              />
              <text
                x={marginLeft - 8}
                y={t.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="stock-card__ai-rating-y-label"
                fill="currentColor"
                style={{ fontSize: "11px", fontWeight: t.value === 0 ? 600 : 400 }}
              >
                {t.name}
              </text>
            </g>
          ))}

          <path
            d={layout.lineD}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {layout.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--bs-body-bg, #fff)"
              stroke="#9ACD32"
              strokeWidth={2}
            >
              <title>{`${p.ratingText} — ${p.dateLabel}`}</title>
            </circle>
          ))}

          {layout.xTickIndices.map((i) => {
            const p = layout.points[i];
            return (
              <text
                key={`xt-${i}`}
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fill="currentColor"
                className="stock-card__ai-rating-x-label"
                style={{ fontSize: "10px", opacity: 0.75 }}
              >
                {p.dateLabel}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function HistoryChartsTrigger({
  collapseId,
  symbol,
  compact = false,
}: {
  collapseId: string;
  symbol?: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const el = document.getElementById(collapseId);
    if (!el) return;
    const onShown = () => setExpanded(true);
    const onHidden = () => setExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [collapseId]);
  const triggerDisabled = !symbol;
  const triggerTitle = symbol
    ? `View trends for ${symbol}`
    : "History is only available when a symbol is present.";
  return (
    <button
      type="button"
      className={`stock-card__action stock-card__action--secondary${compact ? " stock-card__action--compact" : ""}`}
      data-bs-toggle="collapse"
      data-bs-target={`#${collapseId}`}
      aria-expanded={expanded}
      aria-controls={collapseId}
      disabled={triggerDisabled}
      title={triggerTitle}
    >
      <i className="bi bi-graph-up stock-card__action-icon" aria-hidden />
      <span className="stock-card__action-label stock-card__action-label--full">View trends</span>
      <span className="stock-card__action-label stock-card__action-label--short">Trends</span>
      <i
        className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} stock-card__action-chevron`}
        aria-hidden
      />
    </button>
  );
}

export function HistoryChartsPanel({
  collapseId,
  symbol,
  accordionParentId,
  showInlineCloseAll = false,
  onCloseThisPanel,
}: {
  collapseId: string;
  symbol?: string;
  accordionParentId?: string;
  showInlineCloseAll?: boolean;
  onCloseThisPanel?: () => void;
}) {
  const [activeView, setActiveView] = useState<ActiveView>("score");
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = document.getElementById(collapseId);
    if (!el) return;
    const onShown = () => setExpanded(true);
    const onHidden = () => setExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [collapseId]);

  useEffect(() => {
    if (!expanded || !symbol) return;
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const response = await fetch(
          `/api/value-history?symbol=${encodeURIComponent(symbol)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          let message = "Unable to load history.";
          try {
            const errorBody = (await response.json()) as {
              error?: string;
              message?: string;
            };
            if (errorBody?.error || errorBody?.message) {
              message = errorBody.error ?? errorBody.message ?? message;
            }
          } catch {
            // ignore
          }
          throw new Error(
            `${message} (status ${response.status}${
              response.statusText ? `: ${response.statusText}` : ""
            })`,
          );
        }
        const json = (await response.json()) as HistoryResponse;
        if (cancelled) return;
        setState({ status: "success", data: json });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong loading history.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [expanded, symbol]);

  return (
    <div
      id={collapseId}
      className="collapse stock-card__panel stock-card__panel--trends"
      aria-label="Trends"
      data-bs-parent={accordionParentId}
    >
      <div className="stock-card__panel-inner stock-card__trends-panel">
        <div className="stock-card__close-all-inline-wrap">
          <span className="stock-card__panel-heading">Trends</span>
          {showInlineCloseAll && onCloseThisPanel ? (
            <button
              type="button"
              className="stock-card__panel-close-btn"
              onClick={onCloseThisPanel}
              aria-label="Close this section"
            >
              <i className="bi bi-x" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="stock-card__trends-intro small text-muted mb-3">
          Explore how the value score and AI rating have evolved over time.
        </p>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <div className="stock-card__trends-view-toggle btn-group btn-group-sm" role="group" aria-label="History view">
            <button
              type="button"
              className={`btn ${activeView === "score" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setActiveView("score")}
            >
              <i className="bi bi-graph-up me-1" aria-hidden />
              Score history
            </button>
            <button
              type="button"
              className={`btn ${activeView === "rating" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setActiveView("rating")}
            >
              <i className="bi bi-stars me-1" aria-hidden />
              AI rating history
            </button>
          </div>
        </div>

        {state.status === "loading" && (
          <div className="d-flex flex-column align-items-center justify-content-center py-4">
            <span className="spinner-border" aria-hidden />
            <span className="small text-muted mt-2">Fetching history…</span>
          </div>
        )}

        {state.status === "error" && (
          <div className="alert alert-danger small mb-0" role="alert">
            {state.message}
          </div>
        )}

        {state.status === "success" && (
          <div className="stock-card__trends-chart-content w-100 d-flex flex-column align-items-stretch">
            {state.data.scoreHistory.length === 0 &&
              state.data.ratingHistory.length === 0 && (
                <div className="alert alert-info small w-100" role="status">
                  No history data found yet for this symbol. Once the value
                  score or AI rating has been recorded over time, trends will
                  appear here.
                </div>
              )}
            {activeView === "score" ? (
              <div className="w-100">
                <h6 className="fw-semibold mb-3">Value score over time</h6>
                <ValueScoreHistoryChart
                  data={state.data.scoreHistory}
                  gradientId={`${collapseId}-score-gradient`}
                />
              </div>
            ) : (
              <div className="w-100">
                <h6 className="fw-semibold mb-3">AI rating over time</h6>
                <AiRatingHistoryChart
                  data={state.data.ratingHistory}
                  gradientId={`${collapseId}-ai-rating-line`}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryCharts(props: HistoryChartsProps) {
  const { collapseId, symbol, compact, showInlineCloseAll, onCloseThisPanel } = props;
  return (
    <>
      <HistoryChartsTrigger collapseId={collapseId} symbol={symbol} compact={compact} />
      <HistoryChartsPanel
        collapseId={collapseId}
        symbol={symbol}
        showInlineCloseAll={showInlineCloseAll}
        onCloseThisPanel={onCloseThisPanel}
      />
    </>
  );
}


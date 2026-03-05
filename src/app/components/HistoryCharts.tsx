"use client";

import { useEffect, useMemo, useState } from "react";

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

function formatDateLabel(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
  });
}

type BarGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  dateLabel: string;
  tooltip: string;
};

function TrendBarChart({
  data,
  color,
  height = 140,
  valueSuffix,
  hideValueMeta,
  fixedDomain,
  gradientId = "historyGradient",
}: {
  data: HistoryPoint[];
  color: string;
  height?: number;
  valueSuffix?: string;
  hideValueMeta?: boolean;
  fixedDomain?: { min: number; max: number };
  gradientId?: string;
}) {
  const width = 560; // will scale with viewBox + container width

  const { bars, minY, maxY, zeroY } = useMemo(() => {
    if (!data.length) {
      return {
        bars: [] as BarGeometry[],
        minY: 0,
        maxY: 0,
        zeroY: null as number | null,
      };
    }
    const values = data.map((d) => d.value);
    let min = fixedDomain ? fixedDomain.min : Math.min(...values);
    let max = fixedDomain ? fixedDomain.max : Math.max(...values);
    if (!fixedDomain && min === max) {
      min = min - 1;
      max = max + 1;
    }

    const paddingTop = 10;
    const paddingBottom = 20;
    const chartHeight = height - paddingTop - paddingBottom;
    const n = data.length;
    const gap = n > 1 ? 4 : 0;
    const totalBarWidth = width - (n - 1) * gap;
    const barWidth = Math.max(4, totalBarWidth / n);

    let baseline: number;
    if (fixedDomain && min <= 0 && max >= 0) {
      const zeroRatio = (0 - min) / (max - min || 1);
      baseline = paddingTop + (1 - zeroRatio) * chartHeight;
    } else {
      baseline = height - paddingBottom;
    }

    const barsLocal: BarGeometry[] = data.map((d, index) => {
      const ratio = (d.value - min) / (max - min || 1);
      const valueY = paddingTop + (1 - ratio) * chartHeight;
      const barY = Math.min(valueY, baseline);
      const barHeight = Math.abs(baseline - valueY) || 2;
      const x = index * (barWidth + gap);
      const dateLabel = formatDateLabel(d.date);
      const tooltip =
        typeof d.label === "string" && d.label.trim().length > 0
          ? `${d.label} – ${dateLabel}`
          : dateLabel;
      return {
        x,
        y: barY,
        width: barWidth,
        height: barHeight,
        value: d.value,
        dateLabel,
        tooltip,
      };
    });

    let zeroY: number | null = null;
    if (min <= 0 && max >= 0) {
      const zeroRatio = (0 - min) / (max - min || 1);
      zeroY = paddingTop + (1 - zeroRatio) * chartHeight;
    }

    return { bars: barsLocal, minY: min, maxY: max, zeroY };
  }, [data, height, width, fixedDomain]);

  if (!data.length) {
    return (
      <div className="text-center text-muted small py-4">
        No history available yet for this metric.
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const change = last.value - first.value;
  const changeLabel =
    (change >= 0 ? "+" : "") +
    change.toFixed(1) +
    (valueSuffix ? valueSuffix : "");

  return (
    <div className="stock-card__trends-chart-wrap w-100">
      {!hideValueMeta && (
        <div className="d-flex justify-content-between align-items-baseline mb-2">
          <div className="d-flex align-items-baseline gap-2">
            <span className="fw-semibold">
              {last.value.toFixed(1)}
              {valueSuffix}
            </span>
            <span
              className={`small ${
                change > 0
                  ? "text-success"
                  : change < 0
                    ? "text-danger"
                    : "text-muted"
              }`}
            >
              {changeLabel} from start
            </span>
          </div>
          <span className="small text-muted">
            {formatDateLabel(first.date)} – {formatDateLabel(last.date)}
          </span>
        </div>
      )}
      <div className="position-relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-hidden="true"
          style={{ width: "100%", height: `${height}px` }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0.15" />
            </linearGradient>
          </defs>
          {/* Zero baseline (e.g. AI rating 0) */}
          {zeroY != null && (
            <line
              x1={0}
              x2={width}
              y1={zeroY}
              y2={zeroY}
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}
          {/* Bars */}
          {bars.map((bar, index) => (
            <rect
              key={index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={`url(#${gradientId})`}
              stroke={color}
              strokeWidth={1}
              rx={2}
            >
              <title>{bar.tooltip}</title>
            </rect>
          ))}
        </svg>
      </div>
      {!hideValueMeta && (
        <div className="d-flex justify-content-between mt-1 small text-muted">
          <span>
            Min: {minY.toFixed(1)}
            {valueSuffix}
          </span>
          <span>
            Max: {maxY.toFixed(1)}
            {valueSuffix}
          </span>
        </div>
      )}
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
      <span className="stock-card__action-label">View trends</span>
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
  showInlineCloseAll = false,
  onCloseThisPanel,
}: {
  collapseId: string;
  symbol?: string;
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
      className="collapse stock-card__panel"
      aria-label="Trends"
    >
      <div className="stock-card__panel-inner stock-card__trends-panel">
        <div className="stock-card__close-all-inline-wrap">
          <span className="stock-card__panel-heading">Trends</span>
          {showInlineCloseAll && onCloseThisPanel ? (
            <button
              type="button"
              className="stock-card__close-all-inline"
              onClick={onCloseThisPanel}
              aria-label="Close this section"
            >
              <i className="bi bi-chevron-up" aria-hidden />
              Close
            </button>
          ) : null}
        </div>
        <p className="stock-card__trends-intro small text-muted mb-3">
          Explore how the value score and AI rating have evolved over time.
        </p>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <div className="btn-group btn-group-sm" role="group" aria-label="History view">
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
                <h6 className="fw-semibold mb-2">Value score over time</h6>
                <p className="small text-muted mb-2">
                  The score is shown as a percentage from 0–100. Rising bars
                  suggest the company is ticking more boxes in your value
                  checklist.
                </p>
                <TrendBarChart
                  data={state.data.scoreHistory}
                  color="#8b5cf6"
                  valueSuffix="%"
                  fixedDomain={{ min: 0, max: 100 }}
                  gradientId={`${collapseId}-score-gradient`}
                />
              </div>
            ) : (
              <div className="w-100">
                <h6 className="fw-semibold mb-2">
                  AI rating score over time
                </h6>
                <p className="small text-muted mb-2">
                  These bars show the AI&apos;s raw rating score from -2 to 2,
                  where -2 = Strong Sell, 0 = Neutral, and 2 = Strong Buy.
                </p>
                <TrendBarChart
                  data={state.data.ratingHistory}
                  color="var(--bs-info)"
                  fixedDomain={{ min: -2, max: 2 }}
                  gradientId={`${collapseId}-rating-gradient`}
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


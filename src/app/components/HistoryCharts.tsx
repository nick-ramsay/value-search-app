"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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

function Sparkline({
  data,
  color,
  height = 140,
  valueSuffix,
  hideValueMeta,
  fixedDomain,
}: {
  data: HistoryPoint[];
  color: string;
  height?: number;
  valueSuffix?: string;
  hideValueMeta?: boolean;
  fixedDomain?: { min: number; max: number };
}) {
  const width = 560; // will scale with viewBox + container width

  const { points, minY, maxY, coords, zeroY } = useMemo(() => {
    if (!data.length) {
      return {
        points: "",
        minY: 0,
        maxY: 0,
        coords: [] as { x: number; y: number }[],
        zeroY: null as number | null,
      };
    }
    const values = data.map((d) => d.value);
    let min = fixedDomain ? fixedDomain.min : Math.min(...values);
    let max = fixedDomain ? fixedDomain.max : Math.max(...values);
    if (!fixedDomain && min === max) {
      // Pad a flat line so it has some vertical space
      min = min - 1;
      max = max + 1;
    }

    const xStep = width / Math.max(data.length - 1, 1);
    const paddingTop = 10;
    const paddingBottom = 20;
    const chartHeight = height - paddingTop - paddingBottom;

    const coordsLocal = data.map((d, index) => {
      const x = index * xStep;
      const ratio = (d.value - min) / (max - min || 1);
      const y = paddingTop + (1 - ratio) * chartHeight;
      return { x, y };
    });

    const pts = coordsLocal.map(({ x, y }) => `${x},${y}`).join(" ");

    let zeroY: number | null = null;
    if (min <= 0 && max >= 0) {
      const zeroRatio = (0 - min) / (max - min || 1);
      zeroY = paddingTop + (1 - zeroRatio) * chartHeight;
    }

    return { points: pts, minY: min, maxY: max, coords: coordsLocal, zeroY };
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
    <div>
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
            <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Soft background area */}
          {points && (
            <polyline
              points={`${points} ${width},${height} 0,${height}`}
              fill="url(#historyGradient)"
              stroke="none"
            />
          )}
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
          {/* Line */}
          {points && (
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* Dots at each data point */}
          {coords.map(({ x, y }, index) => {
            const point = data[index];
            if (!point) return null;
            const dateLabel = formatDateLabel(point.date);
            const tooltip =
              typeof point.label === "string" && point.label.trim().length > 0
                ? `${point.label} – ${dateLabel}`
                : dateLabel;
            return (
              <circle
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                cx={x}
                cy={y}
                r={3}
                fill={color}
                stroke="var(--surface-base)"
                strokeWidth={1}
              >
                {tooltip && <title>{tooltip}</title>}
              </circle>
            );
          })}
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

export default function HistoryCharts({ symbol, name }: HistoryChartsProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("score");
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !symbol) return;

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
            // ignore JSON parse errors and fall back to default message
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
  }, [open, symbol]);

  const handleOpen = () => {
    if (!symbol) return;
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const triggerDisabled = !symbol;
  const triggerTitle = symbol
    ? `View trends for ${symbol}`
    : "History is only available when a symbol is present.";

  const content =
    !open || !mounted
      ? null
      : createPortal(
          <>
            <div className="modal-backdrop fade show" />
            <div
              className="modal fade score-breakdown-modal show"
              style={{ display: "block" }}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content">
                  <div className="modal-header">
                    <div>
                      <h5 className="modal-title mb-0">
                        Trends for{" "}
                        {name && symbol ? `${name} (${symbol})` : symbol ?? name}
                      </h5>
                      <p className="small text-muted mb-0">
                        Explore how the value score and AI rating have evolved
                        over time.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={handleClose}
                      data-bs-dismiss="modal"
                    />
                  </div>
                  <div className="modal-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div className="btn-group" role="group" aria-label="History view">
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            activeView === "score"
                              ? "btn-primary"
                              : "btn-outline-primary"
                          }`}
                          onClick={() => setActiveView("score")}
                        >
                          <i className="bi bi-graph-up me-1" aria-hidden />
                          Score history
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            activeView === "rating"
                              ? "btn-primary"
                              : "btn-outline-primary"
                          }`}
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
                        <span className="small text-muted mt-2">
                          Fetching history…
                        </span>
                      </div>
                    )}

                    {state.status === "error" && (
                      <div className="alert alert-danger small mb-0" role="alert">
                        {state.message}
                      </div>
                    )}

                    {state.status === "success" && (
                      <div>
                        {state.data.scoreHistory.length === 0 &&
                          state.data.ratingHistory.length === 0 && (
                            <div className="alert alert-info small" role="status">
                              No history data found yet for this symbol. Once the
                              value score or AI rating has been recorded over
                              time, trends will appear here.
                            </div>
                          )}
                        {activeView === "score" ? (
                          <div>
                            <h6 className="fw-semibold mb-2">
                              Value score over time
                            </h6>
                            <p className="small text-muted">
                              The score is shown as a percentage from 0–100. A
                              rising line suggests the company is ticking more
                              boxes in your value checklist.
                            </p>
                            <Sparkline
                              data={state.data.scoreHistory}
                              color="var(--bs-success)"
                              valueSuffix="%"
                            />
                          </div>
                        ) : (
                          <div>
                            <h6 className="fw-semibold mb-2">
                              AI rating score over time
                            </h6>
                            <p className="small text-muted mb-2">
                              This line shows the AI&apos;s raw rating score
                              from -2 to 2, where -2 = Strong Sell, 0 = Neutral,
                              and 2 = Strong Buy.
                            </p>
                            <Sparkline
                              data={state.data.ratingHistory}
                              color="var(--bs-info)"
                              fixedDomain={{ min: -2, max: 2 }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body,
        );

  return (
    <>
      <div className="d-flex justify-content-center gap-2 mt-3">
        <button
          type="button"
          className="btn btn-sm result-card-badge border-0 text-decoration-none view-trends-btn"
          onClick={handleOpen}
          disabled={triggerDisabled}
          title={triggerTitle}
        >
          <i className="bi bi-activity me-1" aria-hidden />
          View trends
        </button>
      </div>
      {content}
    </>
  );
}


"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ResearchQueryStatus = "pending" | "processing" | "complete" | "error";
type DangerAction = "stop" | "delete";

type ResearchQueryView = {
  id: string;
  prompt: string;
  status: ResearchQueryStatus;
  result: string | null;
  mentionedStocks: string[];
  errorMessage: string | null;
  createdAt: string;
  processingStartedAt: string | null;
  durationSeconds: number | null;
};

const POLL_INTERVAL_MS = 3000;

function symbolHref(symbols: string[]): string {
  const params = new URLSearchParams();
  for (const symbol of symbols) params.append("symbol", symbol);
  return `/?${params.toString()}`;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m === 0 ? `${rem}s` : `${m}m ${rem}s`;
}

/** Ticks its own state every second rather than lifting this into the parent's
 * poll-driven state, so a live timer doesn't force a re-render of the whole
 * query list every second — only this one small span re-renders. */
function LiveDuration({ startIso }: { startIso: string }) {
  const [elapsedSec, setElapsedSec] = useState(() => (Date.now() - new Date(startIso).getTime()) / 1000);

  useEffect(() => {
    const startMs = new Date(startIso).getTime();
    const tick = () => setElapsedSec((Date.now() - startMs) / 1000);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startIso]);

  return <span className="research-query-card__duration">{formatDuration(elapsedSec)}</span>;
}

/** Renders result text with every validated $TICKER mention turned into a
 * link, in addition to the summary pill row below — reading the answer
 * shouldn't require scrolling down to click a ticker it already named. */
function linkifyResult(text: string, symbols: string[]): React.ReactNode {
  if (symbols.length === 0 || !text) return text;
  const escaped = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\$(${escaped.join("|")})\\b`, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const symbol = match[1];
    parts.push(
      <a
        key={`inline-link-${key++}`}
        href={symbolHref([symbol])}
        target="_blank"
        rel="noopener noreferrer"
        className="research-inline-stock-link"
      >
        ${symbol}
      </a>,
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function StatusPill({ status }: { status: ResearchQueryStatus }) {
  if (status === "complete") return null;
  if (status === "error") {
    return (
      <span className="badge research-query-card__status research-query-card__status--error">
        Error
      </span>
    );
  }
  return (
    <span className="research-query-card__status research-query-card__status--processing">
      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      Processing
    </span>
  );
}

function ResearchQueryCard({
  query: q,
  onRequestDangerAction,
}: {
  query: ResearchQueryView;
  onRequestDangerAction: (id: string, prompt: string, action: DangerAction) => void;
}) {
  const collapseId = `research-result-${q.id}`;
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

  const hasResult = q.status === "complete" && Boolean(q.result);
  const inProgress = q.status === "pending" || q.status === "processing";

  return (
    <article className="research-query-card card glass-card">
      <div className="card-body">
        <div className="research-query-card__head">
          <p className="research-query-card__prompt mb-0">{q.prompt}</p>
          <div className="research-query-card__meta">
            <StatusPill status={q.status} />
            {inProgress ? (
              <LiveDuration startIso={q.processingStartedAt ?? q.createdAt} />
            ) : q.durationSeconds != null ? (
              <span className="research-query-card__duration">{formatDuration(q.durationSeconds)}</span>
            ) : null}
            <span className="research-query-card__timestamp">{formatRelative(q.createdAt)}</span>
            {inProgress ? (
              <button
                type="button"
                className="research-query-card__danger-btn"
                onClick={() => onRequestDangerAction(q.id, q.prompt, "stop")}
                aria-label="Stop this research request"
                title="Stop this research request"
              >
                <i className="bi bi-stop-circle" aria-hidden />
                <span>Stop</span>
              </button>
            ) : null}
            {q.status === "error" ? (
              <button
                type="button"
                className="research-query-card__danger-btn"
                onClick={() => onRequestDangerAction(q.id, q.prompt, "delete")}
                aria-label="Delete this research query"
                title="Delete this research query"
              >
                <i className="bi bi-trash3" aria-hidden />
                <span>Delete</span>
              </button>
            ) : null}
            {hasResult ? (
              <button
                type="button"
                className="research-query-card__chevron-btn"
                data-bs-toggle="collapse"
                data-bs-target={`#${collapseId}`}
                aria-expanded={expanded}
                aria-controls={collapseId}
                aria-label={expanded ? "Hide answer" : "View answer"}
                title={expanded ? "Hide answer" : "View answer"}
              >
                <i className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {q.status === "error" ? (
          <p className="research-query-card__error mb-0">
            {q.errorMessage || "This research request failed."}
          </p>
        ) : null}

        {hasResult ? (
          <div id={collapseId} className="collapse">
            <div className="research-query-card__panel">
              <p className="research-query-card__result mb-0">
                {linkifyResult(q.result as string, q.mentionedStocks)}
              </p>
              {q.mentionedStocks.length > 0 ? (
                <div className="research-query-card__stocks">
                  {q.mentionedStocks.map((symbol) => (
                    <a
                      key={symbol}
                      href={symbolHref([symbol])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="research-stock-link"
                    >
                      {symbol}
                    </a>
                  ))}
                  <a
                    href={symbolHref(q.mentionedStocks)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="research-stock-link research-stock-link--all"
                  >
                    View All Stocks
                  </a>
                </div>
              ) : null}
              <div className="research-query-card__panel-footer">
                <button
                  type="button"
                  className="research-query-card__danger-btn"
                  onClick={() => onRequestDangerAction(q.id, q.prompt, "delete")}
                  aria-label="Delete this research query"
                  title="Delete this research query"
                >
                  <i className="bi bi-trash3" aria-hidden />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

const DANGER_MODAL_ID = "research-danger-action-modal";

export default function ResearchClient() {
  const [queries, setQueries] = useState<ResearchQueryView[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [promptDraft, setPromptDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dangerTarget, setDangerTarget] = useState<{ id: string; prompt: string; action: DangerAction } | null>(
    null,
  );
  const [actingOnDanger, setActingOnDanger] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dangerModalElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/research")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!cancelled) setQueries(data.queries ?? []);
      })
      .catch(() => {
        // History hydration failing just means an empty list — the page is still usable.
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pollInFlight = useCallback(() => {
    setQueries((current) => {
      const inFlightIds = current.filter((q) => q.status === "pending" || q.status === "processing").map((q) => q.id);
      if (inFlightIds.length === 0) return current;
      Promise.all(
        inFlightIds.map((id) =>
          fetch(`/api/research/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      ).then((results) => {
        const byId = new Map(results.filter(Boolean).map((r) => [r.id, r as ResearchQueryView]));
        if (byId.size === 0) return;
        setQueries((latest) => latest.map((q) => byId.get(q.id) ?? q));
      });
      return current;
    });
  }, []);

  useEffect(() => {
    const hasInFlight = queries.some((q) => q.status === "pending" || q.status === "processing");
    if (hasInFlight && pollRef.current === null) {
      pollRef.current = setInterval(pollInFlight, POLL_INTERVAL_MS);
    } else if (!hasInFlight && pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [queries, pollInFlight]);

  const hasInFlightNow = queries.some((q) => q.status === "pending" || q.status === "processing");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = promptDraft.trim();
    if (!prompt || submitting || hasInFlightNow) return;
    setSubmitting(true);
    setSubmitError(null);
    fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message || "Something went wrong.");
        return data as ResearchQueryView;
      })
      .then((doc) => {
        setQueries((current) => [doc, ...current]);
        setPromptDraft("");
      })
      .catch((err: Error) => setSubmitError(err.message))
      .finally(() => setSubmitting(false));
  };

  const handleRequestDangerAction = (id: string, prompt: string, action: DangerAction) => {
    setDangerError(null);
    setDangerTarget({ id, prompt, action });
    window.setTimeout(() => {
      // Must be the same bundle entry point BootstrapClient (src/app/bootstrap-client.tsx)
      // loads globally on mount, not the standalone "bootstrap/js/dist/modal"
      // submodule — importing it separately pulls in a second, independent
      // Modal class whose backdrop/body-lock bookkeeping the global bundle's
      // own data-API (which is what handles the Cancel/X buttons' plain
      // data-bs-dismiss="modal" attributes, and clicking the backdrop, and
      // Escape) knows nothing about. That mismatch is exactly what left the
      // backdrop and body scroll-lock stuck after closing, requiring a
      // refresh — fixed by having every path (open here, close below, and
      // the declarative dismiss buttons) share one Modal instance.
      void import("bootstrap/dist/js/bootstrap.bundle.min.js").then((bootstrap) => {
        const el = dangerModalElRef.current;
        if (!el) return;
        bootstrap.Modal.getOrCreateInstance(el).show();
      });
    }, 0);
  };

  const handleConfirmDangerAction = async () => {
    if (!dangerTarget) return;
    setActingOnDanger(true);
    setDangerError(null);
    try {
      // Stopping and deleting are the same backend operation: removing the
      // row. For an in-flight row this also frees up the "one in-flight
      // request" slot. If the pyworker daemon is mid-call on it, its
      // eventual write just finds no matching _id and silently no-ops.
      const r = await fetch(`/api/research/${dangerTarget.id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        throw new Error(data?.message || "Something went wrong.");
      }
      const targetId = dangerTarget.id;
      setQueries((current) => current.filter((q) => q.id !== targetId));
      const bootstrap = await import("bootstrap/dist/js/bootstrap.bundle.min.js");
      const el = dangerModalElRef.current;
      if (el) bootstrap.Modal.getOrCreateInstance(el).hide();
    } catch (err) {
      setDangerError((err as Error).message);
    } finally {
      setActingOnDanger(false);
    }
  };

  const isStop = dangerTarget?.action === "stop";

  return (
    <div className="research-page__body d-flex flex-column">
      <form onSubmit={handleSubmit} className="research-prompt-form card glass-card">
        <div className="card-body">
          <div className="research-composer">
            <textarea
              id="research-prompt"
              className="research-composer__input"
              placeholder="Ask a research question — e.g. What are some undervalued semiconductor stocks right now?"
              rows={3}
              maxLength={2000}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              disabled={submitting || hasInFlightNow}
            />
            <div className="research-composer__footer">
              <span className="research-prompt-hint">
                {hasInFlightNow
                  ? "Finish processing your current request before starting a new one."
                  : "Answers are grounded in valuesearch.app's own stock data."}
              </span>
              <button
                type="submit"
                className="btn btn-sm glass-btn glass-btn-primary"
                disabled={submitting || hasInFlightNow || promptDraft.trim().length === 0}
              >
                {submitting ? "Submitting…" : "Research"}
              </button>
            </div>
          </div>
          {submitError ? <p className="research-prompt-error mb-0 mt-2">{submitError}</p> : null}
        </div>
      </form>

      <div className="research-query-list">
        {loadingHistory ? (
          <p className="research-empty-state">Loading your research history…</p>
        ) : queries.length === 0 ? (
          <div className="research-empty-state">
            <i className="bi bi-stars research-empty-state__icon" aria-hidden />
            <p className="mb-0">No research queries yet — ask one above.</p>
          </div>
        ) : (
          queries.map((q) => (
            <ResearchQueryCard key={q.id} query={q} onRequestDangerAction={handleRequestDangerAction} />
          ))
        )}
      </div>

      <div
        ref={dangerModalElRef}
        className="modal fade"
        id={DANGER_MODAL_ID}
        tabIndex={-1}
        aria-labelledby={`${DANGER_MODAL_ID}-label`}
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={`${DANGER_MODAL_ID}-label`}>
                {isStop ? "Stop this research request?" : "Delete this research query?"}
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
                disabled={actingOnDanger}
              />
            </div>
            <div className="modal-body">
              {dangerTarget ? (
                <p className="mb-0">
                  {isStop
                    ? "This stops "
                    : "This permanently deletes "}
                  <strong>&ldquo;{dangerTarget.prompt}&rdquo;</strong>
                  {isStop
                    ? " and discards its progress. You can ask again afterward."
                    : " and its result. This cannot be undone."}
                </p>
              ) : null}
              {dangerError ? <p className="research-prompt-error mb-0 mt-2">{dangerError}</p> : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn glass-btn glass-btn-secondary"
                data-bs-dismiss="modal"
                disabled={actingOnDanger}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger research-delete-confirm-btn"
                disabled={actingOnDanger}
                onClick={() => void handleConfirmDangerAction()}
              >
                {actingOnDanger ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" aria-hidden />
                    {isStop ? "Stopping…" : "Deleting…"}
                  </>
                ) : isStop ? (
                  "Stop"
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

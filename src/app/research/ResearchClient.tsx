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
  consideredStocks: string[];
  stockNames: Record<string, string>;
  errorMessage: string | null;
  createdAt: string;
  processingStartedAt: string | null;
  durationSeconds: number | null;
  /** Only ever populated on a root query (from GET /api/research's nesting) —
   * a follow-up's own `followups` is always []; threads are two levels deep,
   * not recursive. */
  followups: ResearchQueryView[];
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
 * link reading "Company Name ($TICKER)" (falling back to the bare ticker if
 * no name is known), in addition to the summary pill row below — reading
 * the answer shouldn't require scrolling down to click a ticker it already
 * named, or guessing what a symbol stands for. */
function linkifyResult(text: string, symbols: string[], stockNames: Record<string, string>): React.ReactNode {
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
    const name = stockNames[symbol];
    parts.push(
      <a
        key={`inline-link-${key++}`}
        href={symbolHref([symbol])}
        target="_blank"
        rel="noopener noreferrer"
        className="research-inline-stock-link"
      >
        {name ? `${name} ($${symbol})` : `$${symbol}`}
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

/** One follow-up turn, rendered within the root's already-open accordion.
 * Its own answer is collapsed behind its own chevron — same pattern as the
 * root's — so a thread with several follow-ups doesn't dump a wall of text;
 * each turn's prompt stays visible, its answer opens on demand. */
function FollowupTurn({ turn }: { turn: ResearchQueryView }) {
  const collapseId = `research-followup-result-${turn.id}`;
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

  const hasResult = turn.status === "complete" && Boolean(turn.result);
  const inProgress = turn.status === "pending" || turn.status === "processing";

  return (
    <div className="research-followup">
      <div className="research-followup__head">
        <p className="research-followup__prompt mb-0">{turn.prompt}</p>
        <div className="research-query-card__meta">
          <StatusPill status={turn.status} />
          {inProgress ? (
            <LiveDuration startIso={turn.processingStartedAt ?? turn.createdAt} />
          ) : turn.durationSeconds != null ? (
            <span className="research-query-card__duration">{formatDuration(turn.durationSeconds)}</span>
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
      {turn.status === "error" ? (
        <p className="research-query-card__error mb-0">
          {turn.errorMessage || "This follow-up failed."}
        </p>
      ) : null}
      {hasResult ? (
        <div id={collapseId} className="collapse">
          <p className="research-followup__result mb-0">
            {linkifyResult(turn.result as string, turn.mentionedStocks, turn.stockNames)}
          </p>
          {turn.mentionedStocks.length > 0 ? (
            <div className="research-query-card__stocks">
              {turn.mentionedStocks.map((symbol) => (
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
                href={symbolHref(turn.mentionedStocks)}
                target="_blank"
                rel="noopener noreferrer"
                className="research-stock-link research-stock-link--all"
              >
                View All Stocks
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResearchQueryCard({
  query: q,
  onRequestDangerAction,
  onSubmitFollowup,
  hasInFlightNow,
}: {
  query: ResearchQueryView;
  onRequestDangerAction: (id: string, prompt: string, action: DangerAction) => void;
  onSubmitFollowup: (rootId: string, prompt: string) => Promise<void>;
  hasInFlightNow: boolean;
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

  const [followupDraft, setFollowupDraft] = useState("");
  const [submittingFollowup, setSubmittingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);

  const hasResult = q.status === "complete" && Boolean(q.result);
  const inProgress = q.status === "pending" || q.status === "processing";
  // The thread can only take a follow-up once its latest turn (the root
  // itself, or the last follow-up if any) has actually finished.
  const latestTurn = q.followups.length > 0 ? q.followups[q.followups.length - 1] : q;
  const canFollowUp = latestTurn.status === "complete" && !hasInFlightNow;

  const handleSubmitFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = followupDraft.trim();
    if (!text || submittingFollowup || !canFollowUp) return;
    setSubmittingFollowup(true);
    setFollowupError(null);
    try {
      await onSubmitFollowup(q.id, text);
      setFollowupDraft("");
    } catch (err) {
      setFollowupError((err as Error).message);
    } finally {
      setSubmittingFollowup(false);
    }
  };

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
                {linkifyResult(q.result as string, q.mentionedStocks, q.stockNames)}
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
              {q.consideredStocks.length > 0 ? (
                <p className="research-query-card__considered mb-0">
                  Considered: {q.consideredStocks.join(", ")}
                </p>
              ) : null}

              {q.followups.map((turn) => (
                <FollowupTurn key={turn.id} turn={turn} />
              ))}

              <form onSubmit={(e) => void handleSubmitFollowup(e)} className="research-followup-composer">
                <textarea
                  className="research-followup-composer__input"
                  placeholder="Ask a follow-up…"
                  rows={2}
                  maxLength={2000}
                  value={followupDraft}
                  onChange={(e) => setFollowupDraft(e.target.value)}
                  disabled={!canFollowUp || submittingFollowup}
                />
                <div className="research-followup-composer__footer">
                  <span className="research-prompt-hint">
                    {!canFollowUp && hasInFlightNow
                      ? "Finish your current request before asking a follow-up."
                      : !canFollowUp
                        ? "Waiting for this thread's latest answer to finish."
                        : ""}
                  </span>
                  <button
                    type="submit"
                    className="btn btn-sm glass-btn glass-btn-primary research-followup-send-btn"
                    disabled={!canFollowUp || submittingFollowup || followupDraft.trim().length === 0}
                    aria-label="Ask follow-up"
                    title="Ask follow-up"
                  >
                    {submittingFollowup ? (
                      <span className="spinner-border spinner-border-sm" aria-hidden />
                    ) : (
                      <i className="bi bi-send-fill" aria-hidden />
                    )}
                  </button>
                </div>
                {followupError ? <p className="research-prompt-error mb-0 mt-2">{followupError}</p> : null}
              </form>

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
      const inFlightIds: string[] = [];
      for (const q of current) {
        if (q.status === "pending" || q.status === "processing") inFlightIds.push(q.id);
        for (const f of q.followups) {
          if (f.status === "pending" || f.status === "processing") inFlightIds.push(f.id);
        }
      }
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
        setQueries((latest) =>
          latest.map((q) => {
            const updatedRoot = byId.get(q.id);
            const updatedFollowups = q.followups.map((f) => byId.get(f.id) ?? f);
            // The single-row polling endpoint never returns a `followups`
            // field — it only ever updates one turn's own status/result —
            // so merge the root's own fields in without letting that spread
            // clobber the (separately updated) followups array.
            return updatedRoot
              ? { ...q, ...updatedRoot, followups: updatedFollowups }
              : { ...q, followups: updatedFollowups };
          }),
        );
      });
      return current;
    });
  }, []);

  useEffect(() => {
    const hasInFlight = queries.some(
      (q) =>
        q.status === "pending" ||
        q.status === "processing" ||
        q.followups.some((f) => f.status === "pending" || f.status === "processing"),
    );
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

  const hasInFlightNow = queries.some(
    (q) =>
      q.status === "pending" ||
      q.status === "processing" ||
      q.followups.some((f) => f.status === "pending" || f.status === "processing"),
  );

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

  const handleSubmitFollowup = async (rootId: string, prompt: string): Promise<void> => {
    const r = await fetch(`/api/research/${rootId}/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.message || "Something went wrong.");
    setQueries((current) =>
      current.map((q) => (q.id === rootId ? { ...q, followups: [...q.followups, data] } : q)),
    );
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
            <ResearchQueryCard
              key={q.id}
              query={q}
              onRequestDangerAction={handleRequestDangerAction}
              onSubmitFollowup={handleSubmitFollowup}
              hasInFlightNow={hasInFlightNow}
            />
          ))
        )}
      </div>

      <div
        ref={dangerModalElRef}
        className="modal fade"
        id={DANGER_MODAL_ID}
        tabIndex={-1}
        aria-labelledby={`${DANGER_MODAL_ID}-label`}
        // No aria-hidden here — Bootstrap's own JS toggles it on this exact
        // element when the modal opens/closes. A hardcoded "true" in JSX
        // means React reasserts it on every re-render of this component,
        // including the poll loop firing every 3s whenever any card is
        // in-flight — fighting Bootstrap's own state out from under it
        // while the modal is still visually open. Mobile Safari enforces
        // aria-hidden="true" strictly enough to suppress taps on the
        // subtree, and the reflow from React's re-render can also disturb
        // Bootstrap's own centering/position calculation — this is a
        // documented class of bug wherever React and Bootstrap's modal JS
        // both try to own the same DOM attribute.
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

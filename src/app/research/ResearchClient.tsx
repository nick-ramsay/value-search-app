"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ResearchQueryStatus = "pending" | "processing" | "complete" | "error";

type ResearchQueryView = {
  id: string;
  prompt: string;
  status: ResearchQueryStatus;
  result: string | null;
  mentionedStocks: string[];
  errorMessage: string | null;
  createdAt: string;
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

export default function ResearchClient() {
  const [queries, setQueries] = useState<ResearchQueryView[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [promptDraft, setPromptDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            <article key={q.id} className="research-query-card card glass-card">
              <div className="card-body">
                <div className="research-query-card__head">
                  <p className="research-query-card__prompt mb-0">{q.prompt}</p>
                  <div className="research-query-card__meta">
                    <StatusPill status={q.status} />
                    <span className="research-query-card__timestamp">{formatRelative(q.createdAt)}</span>
                  </div>
                </div>
                {q.status === "complete" && q.result ? (
                  <p className="research-query-card__result mb-0">{q.result}</p>
                ) : null}
                {q.status === "error" ? (
                  <p className="research-query-card__error mb-0">
                    {q.errorMessage || "This research request failed."}
                  </p>
                ) : null}
                {q.status === "complete" && q.mentionedStocks.length > 0 ? (
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
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

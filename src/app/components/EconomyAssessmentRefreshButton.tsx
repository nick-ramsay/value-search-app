"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type RefreshStatus = "pending" | "processing" | "complete" | "error";

type RefreshRequest = {
  id: string;
  status: RefreshStatus;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type RefreshState = {
  latestRequest: RefreshRequest | null;
  canRefreshNow: boolean;
  nextEligibleAt: string | null;
};

const POLL_INTERVAL_MS = 4000;

function formatCooldownTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "later";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Admin-only manual trigger for a fresh economy assessment, picked up by
 * value-search-pyworker's run_research_requests.py daemon (see
 * EconomyAssessmentRefreshRequest). Rate-limited to once per rolling 24h by
 * the API route — this component just reflects that state and polls while a
 * request is in flight.
 */
export default function EconomyAssessmentRefreshButton() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = sessionStatus === "authenticated" && session?.user?.role === "admin";
  const router = useRouter();

  const [state, setState] = useState<RefreshState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    const r = await fetch("/api/admin/economy-assessment/refresh");
    if (!r.ok) return;
    const data: RefreshState = await r.json();
    setState(data);
    return data;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/economy-assessment/refresh")
      .then((r) => (r.ok ? (r.json() as Promise<RefreshState>) : null))
      .then((data) => data && setState(data))
      .catch(() => {});
  }, [isAdmin]);

  const inFlight =
    state?.latestRequest?.status === "pending" || state?.latestRequest?.status === "processing";

  useEffect(() => {
    if (!inFlight) {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current === null) {
      pollRef.current = setInterval(async () => {
        const data = await fetchState();
        if (data && data.latestRequest?.status === "complete") {
          setFeedback("Economy assessment refreshed.");
          router.refresh();
        } else if (data && data.latestRequest?.status === "error") {
          setFeedback(data.latestRequest.errorMessage ?? "Refresh failed.");
        }
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [inFlight, fetchState, router]);

  if (!isAdmin) return null;

  const handleClick = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/admin/economy-assessment/refresh", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        setFeedback(data.message ?? "Could not start refresh.");
        await fetchState();
        return;
      }
      await fetchState();
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || inFlight || (state ? !state.canRefreshNow : false);

  let statusText: string | null = feedback;
  if (!statusText) {
    if (inFlight) {
      statusText = "Refreshing economy assessment…";
    } else if (state && !state.canRefreshNow && state.nextEligibleAt) {
      statusText = `Already refreshed manually today — available again ${formatCooldownTime(state.nextEligibleAt)}.`;
    }
  }

  return (
    <div className="economy-assessment-refresh">
      <button
        type="button"
        className="glass-btn glass-btn-secondary economy-assessment-refresh-btn"
        onClick={handleClick}
        disabled={disabled}
      >
        {inFlight && (
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        )}
        Refresh now
      </button>
      {statusText && (
        <p className="economy-assessment-refresh-status text-secondary small mb-0" aria-live="polite">
          {statusText}
        </p>
      )}
    </div>
  );
}

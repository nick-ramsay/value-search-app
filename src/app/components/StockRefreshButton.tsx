"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type RefreshStatus = "pending" | "processing" | "complete" | "error";

type RefreshRequest = {
  id: string;
  symbol: string;
  status: RefreshStatus;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

const POLL_INTERVAL_MS = 4000;
/** How long the success checkmark stays before reverting to the idle icon. */
const SUCCESS_FLASH_MS = 2500;

/**
 * Admin-only manual trigger for a single stock's quote -> fundamentals -> AI
 * assessment refresh pipeline, picked up by value-search-pyworker's
 * run_research_requests.py daemon (see StockRefreshRequest). Unlike the
 * economy-assessment/undervalued-picks refresh buttons, there's no daily
 * cap (each symbol is independent) — only one in-flight request per symbol
 * at a time, enforced server-side.
 */
export default function StockRefreshButton({ symbol }: { symbol: string }) {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = sessionStatus === "authenticated" && session?.user?.role === "admin";
  const router = useRouter();

  const [latestRequest, setLatestRequest] = useState<RefreshRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSucceeded, setJustSucceeded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = useCallback(async () => {
    const r = await fetch(`/api/admin/stock-refresh?symbol=${encodeURIComponent(symbol)}`);
    if (!r.ok) return null;
    const data: { latestRequest: RefreshRequest | null } = await r.json();
    setLatestRequest(data.latestRequest);
    return data.latestRequest;
  }, [symbol]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`/api/admin/stock-refresh?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ latestRequest: RefreshRequest | null }>) : null))
      .then((data) => data && setLatestRequest(data.latestRequest))
      .catch(() => {});
  }, [isAdmin, symbol]);

  const inFlight = latestRequest?.status === "pending" || latestRequest?.status === "processing";

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
        if (data?.status === "complete") {
          setJustSucceeded(true);
          if (successTimerRef.current) clearTimeout(successTimerRef.current);
          successTimerRef.current = setTimeout(() => setJustSucceeded(false), SUCCESS_FLASH_MS);
          router.refresh();
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

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  if (!isAdmin) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (submitting || inFlight) return;
    setSubmitting(true);
    setJustSucceeded(false);
    try {
      const r = await fetch("/api/admin/stock-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await r.json();
      if (!r.ok) {
        setLatestRequest(data.request ?? { symbol, status: "error", errorMessage: data.message, id: "", createdAt: "", completedAt: null });
        return;
      }
      setLatestRequest(data);
    } finally {
      setSubmitting(false);
    }
  };

  const hasError = !inFlight && !justSucceeded && latestRequest?.status === "error";

  let icon = "bi-arrow-clockwise";
  let title = `Refresh ${symbol}: quote, fundamentals, and AI assessment`;
  if (inFlight) {
    title = `Refreshing ${symbol}…`;
  } else if (justSucceeded) {
    icon = "bi-check-lg";
    title = `${symbol} refreshed`;
  } else if (hasError) {
    icon = "bi-exclamation-triangle-fill";
    title = latestRequest?.errorMessage || "Refresh failed";
  }

  return (
    <button
      type="button"
      className={`stock-card__refresh-btn${inFlight ? " stock-card__refresh-btn--spinning" : ""}${hasError ? " stock-card__refresh-btn--error" : ""}`}
      onClick={handleClick}
      disabled={submitting || inFlight}
      aria-label={title}
      title={title}
    >
      <i className={`bi ${icon}`} aria-hidden />
    </button>
  );
}

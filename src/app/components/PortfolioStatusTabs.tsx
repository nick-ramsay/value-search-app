"use client";

import { useEffect, useState } from "react";
import type { ValueRecord } from "@/lib/value-search";
import StockResultCard from "./StockResultCard";

const STATUSES = ["Avoid", "Watch", "Own", "Hold"] as const;

type Counts = Record<(typeof STATUSES)[number], number>;

export default function PortfolioStatusTabs() {
  const [activeStatus, setActiveStatus] = useState<(typeof STATUSES)[number]>("Watch");
  const [stocks, setStocks] = useState<ValueRecord[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        symbol?: string;
        cardId?: string;
        recordId?: string;
        previousStatus: string;
        nextStatus: string;
      }>;
      const detail = custom.detail;
      if (!detail) return;
      if (detail.previousStatus === detail.nextStatus) return;

      const {
        recordId,
        symbol,
        previousStatus,
        nextStatus,
      } = detail;

      setCounts((prevCounts) => {
        if (!prevCounts) return prevCounts;
        const updated: Counts = { ...prevCounts };

        if (previousStatus && previousStatus in updated) {
          const key = previousStatus as keyof Counts;
          updated[key] = Math.max(0, (updated[key] ?? 0) - 1);
        }

        if (nextStatus && nextStatus in updated) {
          const key = nextStatus as keyof Counts;
          updated[key] = (updated[key] ?? 0) + 1;
        }

        return updated;
      });

      setStocks((prevStocks) => {
        if (previousStatus === activeStatus && nextStatus !== activeStatus) {
          if (!recordId && !symbol) return prevStocks;
          return prevStocks.filter((s) =>
            recordId ? s._id !== recordId : s.symbol !== symbol,
          );
        }

        if (previousStatus !== activeStatus && nextStatus === activeStatus) {
          setLoading(true);
          fetch(
            `/api/user-stocks-by-status?status=${encodeURIComponent(
              activeStatus,
            )}&full=1`,
          )
            .then((r) => (r.ok ? r.json() : { stocks: [] }))
            .then((data) => setStocks(data.stocks ?? []))
            .catch(() => setStocks([]))
            .finally(() => setLoading(false));
        }

        return prevStocks;
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "portfolioStatusChange",
        handler as EventListener,
      );
      return () => {
        window.removeEventListener(
          "portfolioStatusChange",
          handler as EventListener,
        );
      };
    }

    return undefined;
  }, [activeStatus]);

  useEffect(() => {
    fetch("/api/user-stock-counts")
      .then((r) => (r.ok ? r.json() as Promise<Counts> : Promise.resolve(null)))
      .then((data) => setCounts(data))
      .catch(() => setCounts(null));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/user-stocks-by-status?status=${encodeURIComponent(activeStatus)}&full=1`
    )
      .then((r) => (r.ok ? r.json() : { stocks: [] }))
      .then((data) => setStocks(data.stocks ?? []))
      .catch(() => setStocks([]))
      .finally(() => setLoading(false));
  }, [activeStatus]);

  return (
    <section className="portfolio-tabs-glass mt-4" aria-label="Portfolio by status">
      <div className="portfolio-tabs-nav overflow-auto pb-1" role="tablist">
        {STATUSES.map((status) => (
          <button
            type="button"
            className={`portfolio-tab-btn ${activeStatus === status ? "active" : ""}`}
            onClick={() => setActiveStatus(status)}
            role="tab"
            aria-selected={activeStatus === status}
            key={status}
          >
            {status}
            {counts != null && (
              <span className="ms-1 opacity-85">({counts[status] ?? 0})</span>
            )}
          </button>
        ))}
      </div>
      <div
        className="portfolio-tabpanel"
        role="tabpanel"
        aria-label={`${activeStatus} stocks`}
      >
        {loading ? (
          <p className="text-muted small mb-0 text-center py-3">Loading…</p>
        ) : stocks.length === 0 ? (
          <p className="text-muted small mb-0 text-center py-4">
            No stocks with status &quot;{activeStatus}&quot;.
          </p>
        ) : (
          <div className="portfolio-cards-list">
            {stocks.map((item) => (
              <StockResultCard key={item._id} item={item} compact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

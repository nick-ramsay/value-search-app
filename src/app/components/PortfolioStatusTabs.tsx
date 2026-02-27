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

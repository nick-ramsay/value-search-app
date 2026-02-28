"use client";

import { useEffect, useState } from "react";
import type { ValueRecord } from "@/lib/value-search";
import StockResultCard from "./StockResultCard";
import DisclosureModal from "./DisclosureModal";

type PortfolioCurrentSelectionProps = {
  initialSymbol: string | null;
  initialStock: ValueRecord | null;
};

export default function PortfolioCurrentSelection({
  initialSymbol,
  initialStock,
}: PortfolioCurrentSelectionProps) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [stock, setStock] = useState<ValueRecord | null>(initialStock);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ symbol?: string }>;
      const nextSymbol = custom.detail?.symbol?.trim() ?? "";

      setSymbol(nextSymbol);
      if (!nextSymbol) {
        setStock(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      fetch(`/api/value-by-symbol?symbol=${encodeURIComponent(nextSymbol)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!data) {
            setStock(null);
            return;
          }
          setStock(data.stock ?? null);
        })
        .catch(() => {
          setStock(null);
        })
        .finally(() => setLoading(false));
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "portfolioSymbolSelected",
        handler as EventListener,
      );
      return () => {
        window.removeEventListener(
          "portfolioSymbolSelected",
          handler as EventListener,
        );
      };
    }

    return undefined;
  }, []);

  const handleClear = () => {
    setSymbol("");
    setStock(null);
    setLoading(false);
  };

  const hasSymbol = symbol.trim().length > 0;

  return (
    <>
      <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
        <h2 className="glass-heading fs-6 fw-semibold mb-0">
          Current Selection
        </h2>
        {hasSymbol && (
          <button
            type="button"
            className="btn theme-switcher-btn rounded-circle d-flex align-items-center justify-content-center p-0"
            style={{ width: "1.5rem", height: "1.5rem", minWidth: "1.5rem" }}
            aria-label="Clear selection"
            title="Clear selection"
            onClick={handleClear}
          >
            <i className="bi bi-x" style={{ fontSize: "0.75rem" }} aria-hidden />
          </button>
        )}
      </div>
      <div className="mb-4">
        {loading ? (
          <article className="stock-card stock-card--compact">
            <header className="stock-card__head d-flex align-items-center justify-content-center text-center">
              <p className="text-muted mb-0 w-100 px-2" style={{ fontSize: "0.95rem" }}>
                Loading selection…
              </p>
            </header>
            <div className="stock-card__signals invisible" aria-hidden="true">
              <span className="stock-card__badge">AI: Neutral</span>
              <span className="stock-card__badge">0%</span>
            </div>
            <div className="stock-card__actions invisible" aria-hidden="true">
              <span className="stock-card__action stock-card__action--secondary">View trends</span>
              <span className="stock-card__action stock-card__action--secondary">Assessment</span>
            </div>
          </article>
        ) : stock ? (
          <StockResultCard item={stock} compact />
        ) : (
          <article className="stock-card stock-card--compact position-relative">
            <header className="stock-card__head">
              <span style={{ fontSize: "0.95rem", visibility: "hidden" }} aria-hidden="true">
                {/* Keeps head same height as when title is present */}
                Placeholder
              </span>
            </header>
            <div
              className="position-absolute start-0 end-0 d-flex align-items-center justify-content-center px-3"
              style={{ top: "50%", transform: "translateY(-50%)" }}
            >
              <p className="text-muted mb-0 text-center px-3" style={{ fontSize: "0.95rem" }}>
                {hasSymbol
                  ? "No results found for that symbol."
                  : "Search for a stock above to view its card here."}
              </p>
            </div>
            <div className="stock-card__signals invisible" aria-hidden="true">
              <span className="stock-card__badge">AI: Neutral</span>
              <span className="stock-card__badge">0%</span>
            </div>
            <div className="stock-card__actions invisible" aria-hidden="true">
              <span className="stock-card__action stock-card__action--secondary">View trends</span>
              <span className="stock-card__action stock-card__action--secondary">Assessment</span>
            </div>
          </article>
        )}
      </div>
      <p className="text-center small mb-0 mt-2">
        <DisclosureModal />
      </p>
    </>
  );
}


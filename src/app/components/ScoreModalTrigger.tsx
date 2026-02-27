"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const VALUE_SCORE_BREAKDOWN: { key: string; label: string }[] = [
  { key: "healthyPE", label: "Healthy P/E (0–15)" },
  { key: "healthyFuturePE", label: "Healthy Forward P/E (0–15)" },
  { key: "profitMarginPositive", label: "Positive profit margin" },
  { key: "forwardPEGreater", label: "Forward P/E ≥ current P/E" },
  { key: "healthyDebtEquity", label: "Healthy debt/equity (0–2)" },
  { key: "healthyPriceBook", label: "Healthy P/B (0.95–1.1)" },
  { key: "healthyPriceSales", label: "Healthy P/S (0–2)" },
  { key: "movingAveragesGreaterThanPrice", label: "MAs > price & 200d > 50d" },
  { key: "movingAverageSupport", label: "Moving average support" },
  { key: "returnOnEquity", label: "Return on equity" },
  { key: "returnOnInvestment", label: "Return on investment" },
  { key: "priceToEarningsGrowth", label: "Price/earnings growth" },
  { key: "relativeStengthIndex", label: "Relative strength index (30–70)" },
  { key: "earningsPerShareGrowingNextYear", label: "EPS growing next year" },
];

type ValueSearchScoreDisplay = {
  calculatedScorePercentage: number;
  totalPossiblePoints: number;
  totalCalculatedPoints?: number;
  [key: string]: unknown;
};

export default function ScoreModalTrigger({
  modalId,
  name,
  symbol,
  valueSearchScore,
  buttonClassName,
  buttonLabel,
}: {
  modalId: string;
  name?: string;
  symbol?: string;
  valueSearchScore: ValueSearchScoreDisplay;
  buttonClassName: string;
  buttonLabel: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modalEl = (
    <div
      className="modal fade score-breakdown-modal"
      id={modalId}
      tabIndex={-1}
      aria-labelledby={`${modalId}-label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${modalId}-label`}>
              {name ?? ""}{name && symbol ? " " : ""}{symbol ? `(${symbol})` : ""}
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            <p className="mb-3 small score-breakdown-summary">
              {valueSearchScore.totalCalculatedPoints ?? 0} / {valueSearchScore.totalPossiblePoints} points (
              {(valueSearchScore.calculatedScorePercentage * 100).toFixed(0)}%)
            </p>
            <ul className="list-group list-group-flush score-breakdown-list">
              {VALUE_SCORE_BREAKDOWN.map(({ key, label }) => {
                const attempted = valueSearchScore[`${key}Attempted`];
                const value = valueSearchScore[key];
                const points = typeof value === "number" ? value : 0;
                if (!attempted) return null;
                return (
                  <li key={key} className="list-group-item d-flex justify-content-between align-items-center">
                    <span>{label}</span>
                    <span>{points > 0 ? "✅" : "❌"} {points} pt{points !== 1 ? "s" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="d-flex align-items-center justify-content-center gap-2">
        <button
          type="button"
          className={`${buttonClassName} border-0 text-decoration-none`}
          data-bs-toggle="modal"
          data-bs-target={`#${modalId}`}
          aria-label="View score breakdown"
        >
          {buttonLabel}
        </button>
        <button
          type="button"
          className="btn btn-link p-0 border-0 align-baseline text-secondary score-info-btn"
          data-bs-toggle="modal"
          data-bs-target="#score-explanation-modal"
          aria-label="What does the score mean?"
          title="What does the score mean?"
        >
          <i className="bi bi-info-circle" style={{ fontSize: "0.9rem" }} aria-hidden />
        </button>
      </div>
      {mounted && createPortal(modalEl, document.body)}
    </>
  );
}

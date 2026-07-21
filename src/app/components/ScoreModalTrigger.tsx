"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const VALUE_SCORE_MA_SUPPORT_KEY = "movingAverageSupport";

const VALUE_SCORE_BREAKDOWN: { key: string; label: string }[] = [
  { key: "healthyPE", label: "Healthy P/E (0–15)" },
  { key: "healthyFuturePE", label: "Healthy Forward P/E (0–15)" },
  { key: "profitMarginPositive", label: "Positive profit margin" },
  { key: "forwardPEGreater", label: "Forward P/E ≥ current P/E" },
  { key: "healthyDebtEquity", label: "Healthy debt/equity (0–2)" },
  { key: "healthyPriceBook", label: "Healthy P/B (0.95–1.1)" },
  { key: "healthyPriceSales", label: "Healthy P/S (0–2)" },
  { key: "movingAveragesGreaterThanPrice", label: "MAs > price & 200d > 50d" },
  { key: VALUE_SCORE_MA_SUPPORT_KEY, label: "Moving average support" },
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
            <div className="score-breakdown-summary">
              <span className="score-breakdown-summary__pct">
                {(valueSearchScore.calculatedScorePercentage * 100).toFixed(0)}%
              </span>
              <span className="score-breakdown-summary__detail">
                {valueSearchScore.totalCalculatedPoints ?? 0} of {valueSearchScore.totalPossiblePoints} points
              </span>
            </div>
            <ul className="score-breakdown-list">
              {VALUE_SCORE_BREAKDOWN.map(({ key, label }) => {
                const attempted = valueSearchScore[`${key}Attempted`];
                const value = valueSearchScore[key];
                const points = typeof value === "number" ? value : 0;
                if (!attempted) return null;
                const passed = points > 0;
                return (
                  <li
                    key={key}
                    className={`score-breakdown-item${passed ? " score-breakdown-item--pass" : " score-breakdown-item--fail"}`}
                  >
                    <span className="score-breakdown-item__label">
                      <i
                        className={`bi ${passed ? "bi-check-circle-fill" : "bi-circle"} score-breakdown-item__icon`}
                        aria-hidden
                      />
                      {label}
                    </span>
                    <span className="score-breakdown-item__points">
                      {points} pt{points !== 1 ? "s" : ""}
                    </span>
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
      <button
        type="button"
        className={`${buttonClassName} stock-card__score-pill border-0 text-decoration-none`}
        data-bs-toggle="modal"
        data-bs-target={`#${modalId}`}
        aria-label="View score breakdown"
      >
        <span className="stock-card__score-pill-label">{buttonLabel}</span>
        <i className="bi bi-info-circle stock-card__score-pill-icon" aria-hidden />
      </button>
      {mounted && createPortal(modalEl, document.body)}
    </>
  );
}

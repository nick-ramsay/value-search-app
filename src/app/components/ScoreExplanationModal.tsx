"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SCORE_EXPLANATION_ID = "score-explanation-modal";

export default function ScoreExplanationModal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const modalEl = (
    <div
      className="modal fade score-breakdown-modal"
      id={SCORE_EXPLANATION_ID}
      tabIndex={-1}
      aria-labelledby={`${SCORE_EXPLANATION_ID}-label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${SCORE_EXPLANATION_ID}-label`}>
              About the Value Score
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            <p className="mb-3">
              The score is a value investing checklist. It measures how well a stock matches a set of fundamental and technical criteria.
            </p>
            <p className="mb-3">
              Each criterion is either passed (points earned) or failed (0 points). The score is the percentage of possible points earned — for example, 80% means the stock passed 80% of the checks that applied to it.
            </p>
            <p className="mb-0">
              Criteria include valuation (P/E, Forward P/E, P/B, P/S), profitability (Profit Margin, ROE, ROI), balance sheet (Debt/Equity), price trends (Moving Averages, RSI), and growth (PEG, EPS Growth). Click the score label on a card to see the full breakdown for that stock.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modalEl, document.body);
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Same fixed-UTC formatting convention as StockResultCard's other
 * "last updated" timestamps — avoids a client/server hydration mismatch
 * from the browser's local timezone. */
function formatUpdatedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const datePart = date.toLocaleDateString("en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    return `${datePart} UTC`;
  } catch {
    return "";
  }
}

export default function NewsSummaryModalTrigger({
  modalId,
  name,
  symbol,
  summary,
  updatedAt,
}: {
  modalId: string;
  name?: string;
  symbol?: string;
  summary: string;
  updatedAt?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const formattedUpdatedAt = formatUpdatedAt(updatedAt);

  const modalEl = (
    <div
      className="modal fade news-summary-modal"
      id={modalId}
      tabIndex={-1}
      aria-labelledby={`${modalId}-label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${modalId}-label`}>
              {name ?? ""}{name && symbol ? " " : ""}{symbol ? `(${symbol})` : ""} — News Summary
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            <p className="news-summary-modal__text mb-0">{summary}</p>
            {formattedUpdatedAt && (
              <p className="news-summary-modal__updated mb-0">
                Updated {formattedUpdatedAt}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="stock-card__news-btn"
        data-bs-toggle="modal"
        data-bs-target={`#${modalId}`}
        aria-label={`View news summary for ${symbol ?? name ?? "this stock"}`}
        title="News summary"
      >
        <i className="bi bi-newspaper" aria-hidden />
      </button>
      {mounted && createPortal(modalEl, document.body)}
    </>
  );
}

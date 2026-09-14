"use client";

import { useEffect, useOptimistic, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";

export type SummaryChip = {
  id: string;
  label: string;
  icon?: string;
  removeHref: string;
  ariaLabel: string;
};

type Props = {
  totalCount: number;
  chips: SummaryChip[];
  /** True while any individual stock is selected (vs. browsing by filter). */
  isFiltered: boolean;
  /** Href that drops every selected symbol while keeping other filters. */
  clearAllSymbolsHref: string;
};

const CLEAR_SYMBOLS_MODAL_ID = "clear-selected-symbols-modal";

export default function ResultsSummaryClient({
  totalCount,
  chips,
  isFiltered,
  clearAllSymbolsHref,
}: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useHomeNavigation();
  const [optimisticChips, removeChipOptimistically] = useOptimistic(
    chips,
    (current, idToRemove: string) => current.filter((c) => c.id !== idToRemove),
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleRemove = (chip: SummaryChip) => {
    startTransition(() => {
      removeChipOptimistically(chip.id);
      router.push(chip.removeHref);
    });
  };

  const handleConfirmClearAll = () => {
    startTransition(() => {
      router.push(clearAllSymbolsHref);
    });
  };

  const modalEl = (
    <div
      className="modal fade score-breakdown-modal"
      id={CLEAR_SYMBOLS_MODAL_ID}
      tabIndex={-1}
      aria-labelledby={`${CLEAR_SYMBOLS_MODAL_ID}-label`}
      aria-hidden="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={`${CLEAR_SYMBOLS_MODAL_ID}-label`}>
              Remove all selected stocks?
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            <p className="mb-0">
              This removes every individually selected stock and takes you back to the full list.
              You&apos;d need to search and add them again to get back to this view.
            </p>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-sm clear-symbols-cancel-btn"
              data-bs-dismiss="modal"
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm clear-symbols-confirm-btn"
              data-bs-dismiss="modal"
              onClick={handleConfirmClearAll}
            >
              <i className="bi bi-trash" aria-hidden />
              Remove all
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="results-summary">
      <div className="active-filter-chips" role="list" aria-label="Active filters">
        {optimisticChips.map((chip) => (
          <span key={chip.id} className="active-filter-chip" role="listitem">
            {chip.icon && (
              <i className={`bi ${chip.icon} active-filter-chip__icon`} aria-hidden />
            )}
            {chip.label}
            <button
              type="button"
              className="active-filter-chip__remove-btn"
              aria-label={chip.ariaLabel}
              onClick={() => handleRemove(chip)}
            >
              <i className="bi bi-x" aria-hidden />
            </button>
          </span>
        ))}
        {isFiltered ? (
          <button
            type="button"
            className="clear-symbols-trigger-btn"
            data-bs-toggle="modal"
            data-bs-target={`#${CLEAR_SYMBOLS_MODAL_ID}`}
            disabled={isPending}
          >
            <i className="bi bi-trash" aria-hidden />
            Clear all
          </button>
        ) : null}
      </div>
      {isPending ? (
        <p className="results-summary__count--skeleton" />
      ) : (
        <p className="results-summary__count">
          {totalCount.toLocaleString()} {totalCount === 1 ? "result" : "results"}
        </p>
      )}
      {mounted && typeof document !== "undefined"
        ? createPortal(modalEl, document.body)
        : null}
    </div>
  );
}

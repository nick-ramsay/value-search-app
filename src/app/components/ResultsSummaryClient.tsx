"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

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
};

export default function ResultsSummaryClient({ totalCount, chips }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticChips, removeChipOptimistically] = useOptimistic(
    chips,
    (current, idToRemove: string) => current.filter((c) => c.id !== idToRemove),
  );

  const handleRemove = (chip: SummaryChip) => {
    startTransition(() => {
      removeChipOptimistically(chip.id);
      router.push(chip.removeHref);
    });
  };

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
      </div>
      {isPending ? (
        <p className="results-summary__count--skeleton" />
      ) : (
        <p className="results-summary__count">
          {totalCount.toLocaleString()} {totalCount === 1 ? "result" : "results"}
        </p>
      )}
    </div>
  );
}

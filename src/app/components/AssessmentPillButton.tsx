"use client";

import { useEffect, useState } from "react";

type AssessmentPillButtonProps = {
  collapseId: string;
  ariaLabel?: string;
};

export default function AssessmentPillButton({
  collapseId,
  ariaLabel = "Toggle assessment",
}: AssessmentPillButtonProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = document.getElementById(collapseId);
    if (!el) return;
    const onShown = () => setExpanded(true);
    const onHidden = () => setExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [collapseId]);

  return (
    <button
      type="button"
      className="stock-card__action stock-card__action--secondary"
      data-bs-toggle="collapse"
      data-bs-target={`#${collapseId}`}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className="stock-card__action-label">Assessment</span>
      <i
        className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} stock-card__action-chevron`}
        aria-hidden
      />
    </button>
  );
}

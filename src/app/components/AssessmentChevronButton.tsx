"use client";

import { useEffect, useState } from "react";

type AssessmentChevronButtonProps = {
  collapseId: string;
  ariaLabel?: string;
};

export default function AssessmentChevronButton({
  collapseId,
  ariaLabel = "Toggle assessment",
}: AssessmentChevronButtonProps) {
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
      className="btn theme-switcher-btn rounded-circle d-flex align-items-center justify-content-center p-0 assessment-chevron-btn"
      style={{ width: "1.5rem", height: "1.5rem", minWidth: "1.5rem" }}
      data-bs-toggle="collapse"
      data-bs-target={`#${collapseId}`}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <i
        className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"}`}
        style={{ fontSize: "0.75rem" }}
        aria-hidden
      />
    </button>
  );
}

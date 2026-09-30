"use client";

/** Toggles a chart between its natural (wider, horizontally-scrollable)
 * width and a compressed width that fits entirely within the available
 * space — shared by all three Monthly Balances charts. */
export default function FitToScreenToggle({
  fit,
  onToggle,
}: {
  fit: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm monthly-balances-net-chart-fit-toggle"
      onClick={onToggle}
      aria-pressed={fit}
    >
      <i
        className={`bi ${fit ? "bi-arrows-angle-expand" : "bi-arrows-angle-contract"} me-1`}
        aria-hidden
      />
      {fit ? "Show full width" : "Fit to screen"}
    </button>
  );
}

/** A line falling then flattening out — visually distinct from the topping/chop
 * (bi-activity) and momentum (bi-rocket-takeoff-fill) icons, since no stock
 * bootstrap-icons glyph depicts "fell, then found a bottom and went sideways". */
export default function BottomingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ verticalAlign: "-0.125em" }}
      aria-hidden
    >
      <path d="M3 3 L8 12 L13.5 12" />
    </svg>
  );
}

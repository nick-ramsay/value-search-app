/**
 * Shared SVG path math for the Monthly Balances area/line charts
 * (MonthlyNetUsdBarChart, YearlyNetUsdBarChart, NetWorthProjectionCharts).
 * All three plot a value-vs-zero-baseline series with the same shape —
 * this is the one piece of genuinely identical logic between them (the
 * axis/label/tooltip JSX around it still differs per chart, so that stays
 * in each file).
 */

export type LineDatum = {
  x: number;
  /** null marks a gap (e.g. a month with no computable value) — breaks the line/area rather than interpolating across it. */
  y: number | null;
};

/** Split a series into contiguous runs of non-null points — each run gets its own area/line path, so gaps render as breaks, not straight-line interpolation across missing data. */
export function toLineSegments(points: LineDatum[]): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push({ x: p.x, y: p.y });
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** Open path along the data points (the stroked line). */
export function buildLinePath(segment: { x: number; y: number }[]): string {
  return segment
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

/** Closed path from the zero baseline up/down to the data points and back — the filled area. */
export function buildAreaPath(segment: { x: number; y: number }[], zeroY: number): string {
  if (segment.length === 0) return "";
  const line = buildLinePath(segment);
  const first = segment[0];
  const last = segment[segment.length - 1];
  return `${line} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
}

/**
 * How many x-axis labels to skip between the ones actually drawn, when
 * "fit to screen" compresses many points into a narrower plot than their
 * natural per-point label width would need. Every point still gets plotted
 * on the line — this only thins which ones get a text label.
 */
export function computeLabelStep(n: number, plotW: number, minLabelSlotW: number): number {
  if (n <= 1 || plotW <= 0) return 1;
  const maxLabels = Math.max(1, Math.floor(plotW / minLabelSlotW));
  return Math.max(1, Math.ceil(n / maxLabels));
}

/**
 * Whether the point at index `i` (of `n`) should draw an x-axis label, given
 * the thinning step from computeLabelStep. The first and last points always
 * show (so both edges of the chart always read) — but naively ALSO always
 * showing the last point regardless of step means it can land just one or
 * two slots after the last regularly-spaced label, overlapping it. Suppress
 * a regular-step label if it's within one step of the forced-last label so
 * the two can't collide; the forced-last label itself is unaffected.
 */
export function shouldShowLabel(i: number, n: number, labelStep: number): boolean {
  if (i === 0 || i === n - 1) return true;
  if (i % labelStep !== 0) return false;
  return n - 1 - i >= labelStep;
}

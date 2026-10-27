/**
 * The 5 canonical AI rating values, strongest-buy first — matches the sort
 * order used everywhere ratings are ranked (e.g. page.tsx's aiRatingScore
 * sort). Stored in the DB as the literal uppercase strings (see pyworker's
 * generate_ai_assessments.py _RATING_TO_SCORE); display/URL values here are
 * Title Case for readability — convert with .toUpperCase() before querying.
 */
export const AI_RATING_OPTIONS = ["Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"];

/** Title-case each word for AI rating display (e.g. "STRONG BUY" → "Strong Buy"). */
export function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function getRatingBadgeClass(rating: string) {
  const normalized = rating.trim().toUpperCase();
  switch (normalized) {
    case "STRONG BUY":
      return "badge badge-rating-strong-buy";
    case "BUY":
      return "badge badge-rating-buy";
    case "NEUTRAL":
      return "badge badge-rating-neutral";
    case "SELL":
      return "badge badge-rating-sell";
    case "STRONG SELL":
      return "badge badge-rating-strong-sell";
    default:
      return "badge badge-rating-neutral";
  }
}

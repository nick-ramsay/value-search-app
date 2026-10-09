import type { IResearchQuery } from "@/models/ResearchQuery";

/** Shared shape sent to the frontend for a single research turn (root or
 * follow-up) — used by every /api/research* route so the client always
 * sees the same fields regardless of which endpoint returned them. */
export function serializeQuery(d: IResearchQuery) {
  return {
    id: d._id.toString(),
    prompt: d.prompt,
    status: d.status,
    result: d.result ?? null,
    mentionedStocks: d.mentionedStocks ?? [],
    consideredStocks: d.consideredStocks ?? [],
    // Mongoose Map fields don't serialize to a plain object through
    // NextResponse.json() on their own — convert explicitly.
    stockNames: d.stockNames ? Object.fromEntries(d.stockNames) : {},
    errorMessage: d.errorMessage ?? null,
    createdAt: d.createdAt,
    processingStartedAt: d.processingStartedAt ?? null,
    durationSeconds: d.durationSeconds ?? null,
  };
}

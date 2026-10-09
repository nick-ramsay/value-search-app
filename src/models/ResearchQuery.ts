import mongoose from "mongoose";

export type ResearchQueryStatus = "pending" | "processing" | "complete" | "error";

export interface IResearchQuery extends mongoose.Document {
  userId: string;
  /** Set only on a follow-up row — the root query's own _id (as a string),
   * never chained further (a follow-up to a follow-up still points at the
   * original root), so fetching a whole thread is one flat query. */
  rootId?: string | null;
  prompt: string;
  status: ResearchQueryStatus;
  result?: string | null;
  mentionedStocks: string[];
  consideredStocks: string[];
  /** symbol -> company name, for every stock considered in this turn (not
   * just mentioned) — lets the UI render "Apple, Inc. ($AAPL)" instead of a
   * bare ticker wherever a symbol is referenced. Pymongo writes this as a
   * plain dict; Mongoose's Map type reads it back correctly either way. */
  stockNames: Map<string, string>;
  errorMessage?: string | null;
  processingStartedAt?: Date | null;
  completedAt?: Date | null;
  durationSeconds?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Written exclusively by value-search-pyworker's run_research_requests.py
 * daemon (status/result/mentionedStocks/errorMessage/completedAt) — this
 * app only ever inserts a "pending" row and reads it back. See the
 * /research feature plan for why: keeping the LLM call entirely on the
 * pyworker side is what keeps this app's own Fluid-CPU usage near zero for
 * this feature.
 */
const ResearchQuerySchema = new mongoose.Schema<IResearchQuery>(
  {
    userId: { type: String, required: true, index: true },
    rootId: { type: String, default: null, index: true },
    prompt: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["pending", "processing", "complete", "error"],
      default: "pending",
    },
    result: { type: String, default: null },
    mentionedStocks: { type: [String], default: [] },
    consideredStocks: { type: [String], default: [] },
    stockNames: { type: Map, of: String, default: {} },
    errorMessage: { type: String, default: null },
    processingStartedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: true },
);

// Explicit collection name: Mongoose would otherwise pluralize "ResearchQuery"
// to "researchqueries", but value-search-pyworker's run_research_requests.py
// writes to "research-queries" (matching this repo's existing kebab-case
// collection-naming convention) — must match exactly or the two apps read/
// write different collections.
export default mongoose.models.ResearchQuery ||
  mongoose.model<IResearchQuery>("ResearchQuery", ResearchQuerySchema, "research-queries");

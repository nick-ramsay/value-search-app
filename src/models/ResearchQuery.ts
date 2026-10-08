import mongoose from "mongoose";

export type ResearchQueryStatus = "pending" | "processing" | "complete" | "error";

export interface IResearchQuery extends mongoose.Document {
  userId: string;
  prompt: string;
  status: ResearchQueryStatus;
  result?: string | null;
  mentionedStocks: string[];
  errorMessage?: string | null;
  completedAt?: Date | null;
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
    prompt: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["pending", "processing", "complete", "error"],
      default: "pending",
    },
    result: { type: String, default: null },
    mentionedStocks: { type: [String], default: [] },
    errorMessage: { type: String, default: null },
    completedAt: { type: Date, default: null },
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

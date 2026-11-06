import mongoose from "mongoose";

export type EconomyAssessmentRefreshStatus =
  | "pending"
  | "processing"
  | "complete"
  | "error";

export interface IEconomyAssessmentRefreshRequest extends mongoose.Document {
  requestedBy: string;
  status: EconomyAssessmentRefreshStatus;
  processingStartedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Written by this app (status "pending" only, on admin button click) and
 * exclusively picked up/progressed from there by value-search-pyworker's
 * run_research_requests.py daemon, which also polls this collection — same
 * claim/process/write pattern as ResearchQuery. See
 * generate_economy_assessment_claude.py's run_manual_refresh() for the
 * actual regeneration work.
 */
const EconomyAssessmentRefreshRequestSchema =
  new mongoose.Schema<IEconomyAssessmentRefreshRequest>(
    {
      requestedBy: { type: String, required: true },
      status: {
        type: String,
        enum: ["pending", "processing", "complete", "error"],
        default: "pending",
      },
      processingStartedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      errorMessage: { type: String, default: null },
    },
    { timestamps: true },
  );

// Explicit collection name, matching value-search-pyworker's kebab-case
// convention — must match run_research_requests.py's collection name exactly.
export default mongoose.models.EconomyAssessmentRefreshRequest ||
  mongoose.model<IEconomyAssessmentRefreshRequest>(
    "EconomyAssessmentRefreshRequest",
    EconomyAssessmentRefreshRequestSchema,
    "economy-assessment-refresh-requests",
  );

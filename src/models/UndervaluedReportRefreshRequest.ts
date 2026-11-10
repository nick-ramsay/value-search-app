import mongoose from "mongoose";

export type UndervaluedReportRefreshStatus =
  | "pending"
  | "processing"
  | "complete"
  | "error";

export interface IUndervaluedReportRefreshRequest extends mongoose.Document {
  requestedBy: string;
  status: UndervaluedReportRefreshStatus;
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
 * claim/process/write pattern as EconomyAssessmentRefreshRequest. See
 * generate_undervalued_report.py's run_manual_refresh() for the actual
 * regeneration work.
 */
const UndervaluedReportRefreshRequestSchema =
  new mongoose.Schema<IUndervaluedReportRefreshRequest>(
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
export default mongoose.models.UndervaluedReportRefreshRequest ||
  mongoose.model<IUndervaluedReportRefreshRequest>(
    "UndervaluedReportRefreshRequest",
    UndervaluedReportRefreshRequestSchema,
    "undervalued-report-refresh-requests",
  );

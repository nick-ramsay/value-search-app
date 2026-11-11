import mongoose from "mongoose";

export type StockRefreshStatus = "pending" | "processing" | "complete" | "error";

export interface IStockRefreshRequest extends mongoose.Document {
  symbol: string;
  requestedBy: string;
  status: StockRefreshStatus;
  processingStartedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Written by this app (status "pending" only, on admin icon click) and
 * exclusively picked up/progressed from there by value-search-pyworker's
 * run_research_requests.py daemon — same claim/process/write pattern as
 * EconomyAssessmentRefreshRequest/UndervaluedReportRefreshRequest, but keyed
 * per-symbol rather than a single shared document. See
 * refresh_single_stock.py's run_manual_refresh() for the actual
 * quote -> fundamentals -> AI assessment pipeline.
 */
const StockRefreshRequestSchema = new mongoose.Schema<IStockRefreshRequest>(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
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
export default mongoose.models.StockRefreshRequest ||
  mongoose.model<IStockRefreshRequest>(
    "StockRefreshRequest",
    StockRefreshRequestSchema,
    "stock-refresh-requests",
  );

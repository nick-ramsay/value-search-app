import mongoose from "mongoose";

/** One calendar year in the 30-year forward projection. */
export interface IProjectionYearEntry {
  year: number;
  /** Compounded total Net (USD) for that year (baseline × (1 + CAGR)^t). */
  projectedNetWorthUsd: number;
}

export interface IUserNetWorthProjection extends mongoose.Document {
  userId: string;
  computedAt: Date;
  /** Latest `YYYY-MM` month key used for baseline net worth. */
  baselineMonthKey?: string;
  /** Total Net (USD) for that month (same rules as the sheet Net column). */
  baselineNetWorthUsd: number;
  historicalPointsUsed: number;
  firstHistoricalYear?: number;
  lastHistoricalYear?: number;
  /** CAGR from first to last historical yearly average when computable (fraction per year). */
  simpleAnnualizedGrowthRate?: number;
  projectionStartYear: number;
  projectionEndYear: number;
  projectionYears: IProjectionYearEntry[];
}

const ProjectionYearEntrySchema = new mongoose.Schema<IProjectionYearEntry>(
  {
    year: { type: Number, required: true },
    projectedNetWorthUsd: { type: Number, required: true },
  },
  { _id: false },
);

const UserNetWorthProjectionSchema = new mongoose.Schema<IUserNetWorthProjection>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    computedAt: { type: Date, required: true },
    baselineMonthKey: { type: String, trim: true },
    baselineNetWorthUsd: { type: Number, required: true },
    historicalPointsUsed: { type: Number, required: true },
    firstHistoricalYear: { type: Number },
    lastHistoricalYear: { type: Number },
    simpleAnnualizedGrowthRate: { type: Number },
    projectionStartYear: { type: Number, required: true },
    projectionEndYear: { type: Number, required: true },
    projectionYears: {
      type: [ProjectionYearEntrySchema],
      default: [],
    },
  },
  { timestamps: true },
);

export default mongoose.models.UserNetWorthProjection ||
  mongoose.model<IUserNetWorthProjection>(
    "UserNetWorthProjection",
    UserNetWorthProjectionSchema,
  );

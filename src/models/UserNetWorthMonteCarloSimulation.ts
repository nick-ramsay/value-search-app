import mongoose from "mongoose";

/** One calendar year in the Monte Carlo summary (distribution of simulated net worth). */
export interface IMonteCarloYearSummary {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

/** One calendar year in the deterministic CAGR projection (same formula as `UserNetWorthProjection`). */
export interface IDeterministicProjectionYearEntry {
  year: number;
  projectedNetWorthUsd: number;
}

/**
 * Stored output from `value-search-pyworker/projections/monte_carlo_net_worth.py`.
 * Shown on Monthly balances (Charts section) via `GET /api/monthly-balances/monte-carlo-simulation`.
 * One document per user (`userId` unique).
 */
export interface IUserNetWorthMonteCarloSimulation extends mongoose.Document {
  userId: string;
  computedAt: Date;
  method: string;
  methodVersion: number;
  numSimulations: number;
  horizonYears: number;
  projectionStartYear: number;
  projectionEndYear: number;
  baselineMonthKey?: string;
  baselineNetWorthUsd: number;
  /** Sum of debt account USD marks on the baseline month (signed; typically negative). */
  debtTotalUsdBaseline: number;
  simulatedAssetAccountCount: number;
  simpleAnnualizedGrowthRate?: number | null;
  historicalYearlyPointsUsed: number;
  firstHistoricalYear?: number | null;
  lastHistoricalYear?: number | null;
  deterministicProjectionYears: IDeterministicProjectionYearEntry[];
  monteCarloYearSummaries: IMonteCarloYearSummary[];
  simulationParameters: {
    defaultAnnualDrift: number;
    defaultAnnualVol: number;
    minAnnualVol: number;
    maxAnnualVol: number;
  };
}

const MonteCarloYearSummarySchema = new mongoose.Schema<IMonteCarloYearSummary>(
  {
    year: { type: Number, required: true },
    p10: { type: Number, required: true },
    p50: { type: Number, required: true },
    p90: { type: Number, required: true },
    mean: { type: Number, required: true },
  },
  { _id: false },
);

const DeterministicProjectionYearEntrySchema =
  new mongoose.Schema<IDeterministicProjectionYearEntry>(
    {
      year: { type: Number, required: true },
      projectedNetWorthUsd: { type: Number, required: true },
    },
    { _id: false },
  );

const SimulationParametersSchema = new mongoose.Schema(
  {
    defaultAnnualDrift: { type: Number, required: true },
    defaultAnnualVol: { type: Number, required: true },
    minAnnualVol: { type: Number, required: true },
    maxAnnualVol: { type: Number, required: true },
  },
  { _id: false },
);

const UserNetWorthMonteCarloSimulationSchema =
  new mongoose.Schema<IUserNetWorthMonteCarloSimulation>(
    {
      userId: { type: String, required: true, unique: true, index: true },
      computedAt: { type: Date, required: true },
      method: { type: String, required: true },
      methodVersion: { type: Number, required: true },
      numSimulations: { type: Number, required: true },
      horizonYears: { type: Number, required: true },
      projectionStartYear: { type: Number, required: true },
      projectionEndYear: { type: Number, required: true },
      baselineMonthKey: { type: String, trim: true },
      baselineNetWorthUsd: { type: Number, required: true },
      debtTotalUsdBaseline: { type: Number, required: true },
      simulatedAssetAccountCount: { type: Number, required: true },
      simpleAnnualizedGrowthRate: { type: Number },
      historicalYearlyPointsUsed: { type: Number, required: true },
      firstHistoricalYear: { type: Number },
      lastHistoricalYear: { type: Number },
      deterministicProjectionYears: {
        type: [DeterministicProjectionYearEntrySchema],
        default: [],
      },
      monteCarloYearSummaries: {
        type: [MonteCarloYearSummarySchema],
        default: [],
      },
      simulationParameters: {
        type: SimulationParametersSchema,
        required: true,
      },
    },
    { timestamps: true, collection: "usernetworthmontecarlosimulations" },
  );

export default mongoose.models.UserNetWorthMonteCarloSimulation ||
  mongoose.model<IUserNetWorthMonteCarloSimulation>(
    "UserNetWorthMonteCarloSimulation",
    UserNetWorthMonteCarloSimulationSchema,
  );

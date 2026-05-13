/** JSON shape from `GET /api/monthly-balances/monte-carlo-simulation`. */

export type MonteCarloYearSummaryJson = {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
};

export type DeterministicProjectionYearJson = {
  year: number;
  projectedNetWorthUsd: number;
};

export type MonteCarloSimulationPayload = {
  computedAt: string;
  baselineMonthKey?: string;
  baselineNetWorthUsd: number;
  numSimulations: number;
  horizonYears: number;
  projectionStartYear: number;
  projectionEndYear: number;
  debtTotalUsdBaseline: number;
  simulatedAssetAccountCount: number;
  simpleAnnualizedGrowthRate: number | null;
  historicalYearlyPointsUsed: number;
  firstHistoricalYear: number | null;
  lastHistoricalYear: number | null;
  method: string;
  methodVersion: number;
  monteCarloYearSummaries: MonteCarloYearSummaryJson[];
  deterministicProjectionYears: DeterministicProjectionYearJson[];
  simulationParameters: {
    defaultAnnualDrift: number;
    defaultAnnualVol: number;
    minAnnualVol: number;
    maxAnnualVol: number;
  };
};

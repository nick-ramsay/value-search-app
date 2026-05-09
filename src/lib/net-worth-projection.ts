import { roundMoney2 } from "@/lib/csv-monthly-balance-import";
import { parseMonthKey } from "@/lib/monthly-balances";
import type { BalanceSheetLike } from "@/lib/net-worth-yearly-averages";
import { latestMonthNetUsdFromSheet } from "@/lib/net-worth-yearly-averages";
import UserNetWorthProjection from "@/models/UserNetWorthProjection";
import UserNetWorthYearlyAverage from "@/models/UserNetWorthYearlyAverage";

/** Number of future calendar years to project (inclusive span). */
export const PROJECTION_HORIZON_YEARS = 30;

/** Plain shape from Mongo (e.g. `.lean()`) for {@link UserNetWorthProjection}. */
export type LeanUserNetWorthProjection = {
  computedAt: Date;
  baselineMonthKey?: string;
  baselineNetWorthUsd: number;
  historicalPointsUsed: number;
  firstHistoricalYear?: number;
  lastHistoricalYear?: number;
  /** Fractional CAGR when computable from first/last yearly averages (e.g. 0.042 ≈ 4.2% per year). */
  simpleAnnualizedGrowthRate?: number;
  projectionStartYear: number;
  projectionEndYear: number;
  projectionYears: Array<{
    year: number;
    projectedNetWorthUsd: number;
  }>;
};

export type TrendAndProjectionPayload = {
  computedAt: string;
  baselineMonthKey?: string;
  baselineNetWorthUsd: number;
  historicalPointsUsed: number;
  firstHistoricalYear: number | null;
  lastHistoricalYear: number | null;
  /** Fractional annual growth (e.g. 0.042 ≈ 4.2% per year) when computable from history; projection uses 0% when null. */
  simpleAnnualizedGrowthRate: number | null;
  projectionStartYear: number;
  projectionEndYear: number;
  projectionYears: Array<{
    year: number;
    /** Compounded snapshot-wealth level for that year (same units as historical yearly averages). */
    projectedNetWorthUsd: number;
  }>;
};

/** CAGR between first and last average when both endpoints are positive and span ≥ 1 year. */
function annualizedGrowthBetweenAverages(
  firstYear: number,
  lastYear: number,
  firstAvg: number,
  lastAvg: number,
): number | null {
  const span = lastYear - firstYear;
  if (span <= 0) return null;
  if (firstAvg <= 0 || lastAvg <= 0) return null;
  return (lastAvg / firstAvg) ** (1 / span) - 1;
}

/**
 * After yearly averages are synced, computes historical CAGR from first/last yearly averages and
 * stores a 30-year forward projection: baseline net × (1 + CAGR)^t for each future calendar year.
 */
export async function upsertNetWorthTrendAndProjections(
  userId: string,
  sheet: BalanceSheetLike,
  usdRates: Record<string, number>,
): Promise<void> {
  const yearlyRows = await UserNetWorthYearlyAverage.find({ userId })
    .select({ year: 1, averageNetUsd: 1 })
    .sort({ year: 1 })
    .lean();

  if (yearlyRows.length === 0) {
    await UserNetWorthProjection.deleteOne({ userId });
    return;
  }

  const years = yearlyRows.map((r) => r.year);
  const avgs = yearlyRows.map((r) => r.averageNetUsd);
  const firstHistoricalYear = years[0]!;
  const lastHistoricalYear = years[years.length - 1]!;

  const growthApprox = annualizedGrowthBetweenAverages(
    firstHistoricalYear,
    lastHistoricalYear,
    avgs[0]!,
    avgs[avgs.length - 1]!,
  );

  const r =
    growthApprox !== null && Number.isFinite(growthApprox) ? growthApprox : 0;

  const baselineNet = latestMonthNetUsdFromSheet(sheet, usdRates);
  const rows = sheet.monthRows ?? [];
  let bestKey: string | undefined;
  for (const row of rows) {
    const mk = typeof row.monthKey === "string" ? row.monthKey.trim() : "";
    if (!parseMonthKey(mk)) continue;
    if (!bestKey || mk > bestKey) bestKey = mk;
  }

  const nw0 =
    baselineNet !== null && Number.isFinite(baselineNet) ? baselineNet : 0;

  const currentCalendarYear = new Date().getFullYear();
  const projectionStartYear = currentCalendarYear + 1;
  const projectionEndYear = currentCalendarYear + PROJECTION_HORIZON_YEARS;

  const projectionYears: Array<{
    year: number;
    projectedNetWorthUsd: number;
  }> = [];

  for (let y = projectionStartYear; y <= projectionEndYear; y += 1) {
    const yearsOut = y - projectionStartYear + 1;
    const compounded = nw0 * (1 + r) ** yearsOut;
    projectionYears.push({
      year: y,
      projectedNetWorthUsd: roundMoney2(compounded),
    });
  }

  const $unset: Record<string, ""> = {
    trendSlopeUsdPerYear: "",
    trendInterceptUsd: "",
    trendRSquared: "",
  };
  if (growthApprox === null || !Number.isFinite(growthApprox)) {
    $unset.simpleAnnualizedGrowthRate = "";
  }

  await UserNetWorthProjection.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        computedAt: new Date(),
        baselineMonthKey: bestKey,
        baselineNetWorthUsd: roundMoney2(nw0),
        historicalPointsUsed: yearlyRows.length,
        firstHistoricalYear,
        lastHistoricalYear,
        ...(growthApprox !== null && Number.isFinite(growthApprox)
          ? {
              simpleAnnualizedGrowthRate:
                Math.round(growthApprox * 1e6) / 1e6,
            }
          : {}),
        projectionStartYear,
        projectionEndYear,
        projectionYears,
      },
      $unset,
    },
    { upsert: true },
  );
}

/** Maps stored projection doc to API payload (ISO date string for computedAt). */
export function projectionDocToPayload(
  doc: LeanUserNetWorthProjection | null,
): TrendAndProjectionPayload | null {
  if (!doc) return null;
  return {
    computedAt: doc.computedAt.toISOString(),
    baselineMonthKey: doc.baselineMonthKey,
    baselineNetWorthUsd: doc.baselineNetWorthUsd,
    historicalPointsUsed: doc.historicalPointsUsed,
    firstHistoricalYear: doc.firstHistoricalYear ?? null,
    lastHistoricalYear: doc.lastHistoricalYear ?? null,
    simpleAnnualizedGrowthRate: doc.simpleAnnualizedGrowthRate ?? null,
    projectionStartYear: doc.projectionStartYear,
    projectionEndYear: doc.projectionEndYear,
    projectionYears: doc.projectionYears.map((p) => ({
      year: p.year,
      projectedNetWorthUsd: p.projectedNetWorthUsd,
    })),
  };
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { MonteCarloSimulationPayload } from "@/lib/monte-carlo-simulation-types";
import { connectDB } from "@/lib/mongoose-connect";
import UserNetWorthMonteCarloSimulation from "@/models/UserNetWorthMonteCarloSimulation";

function docToPayload(
  doc: Record<string, unknown>,
): MonteCarloSimulationPayload {
  const computedAt = doc.computedAt;
  const computedAtStr =
    computedAt instanceof Date
      ? computedAt.toISOString()
      : typeof computedAt === "string"
        ? computedAt
        : new Date().toISOString();

  return {
    computedAt: computedAtStr,
    baselineMonthKey:
      typeof doc.baselineMonthKey === "string" ? doc.baselineMonthKey : undefined,
    baselineNetWorthUsd: Number(doc.baselineNetWorthUsd) || 0,
    numSimulations: Number(doc.numSimulations) || 0,
    horizonYears: Number(doc.horizonYears) || 0,
    projectionStartYear: Number(doc.projectionStartYear) || 0,
    projectionEndYear: Number(doc.projectionEndYear) || 0,
    debtTotalUsdBaseline: Number(doc.debtTotalUsdBaseline) || 0,
    simulatedAssetAccountCount: Number(doc.simulatedAssetAccountCount) || 0,
    simpleAnnualizedGrowthRate:
      typeof doc.simpleAnnualizedGrowthRate === "number" &&
      Number.isFinite(doc.simpleAnnualizedGrowthRate)
        ? doc.simpleAnnualizedGrowthRate
        : null,
    historicalYearlyPointsUsed: Number(doc.historicalYearlyPointsUsed) || 0,
    firstHistoricalYear:
      typeof doc.firstHistoricalYear === "number" ? doc.firstHistoricalYear : null,
    lastHistoricalYear:
      typeof doc.lastHistoricalYear === "number" ? doc.lastHistoricalYear : null,
    method: typeof doc.method === "string" ? doc.method : "",
    methodVersion: Number(doc.methodVersion) || 0,
    monteCarloYearSummaries: Array.isArray(doc.monteCarloYearSummaries)
      ? (doc.monteCarloYearSummaries as MonteCarloSimulationPayload["monteCarloYearSummaries"])
      : [],
    deterministicProjectionYears: Array.isArray(doc.deterministicProjectionYears)
      ? (doc.deterministicProjectionYears as MonteCarloSimulationPayload["deterministicProjectionYears"])
      : [],
    simulationParameters:
      doc.simulationParameters &&
      typeof doc.simulationParameters === "object" &&
      !Array.isArray(doc.simulationParameters)
        ? {
            defaultAnnualDrift: Number(
              (doc.simulationParameters as Record<string, unknown>).defaultAnnualDrift,
            ),
            defaultAnnualVol: Number(
              (doc.simulationParameters as Record<string, unknown>).defaultAnnualVol,
            ),
            minAnnualVol: Number(
              (doc.simulationParameters as Record<string, unknown>).minAnnualVol,
            ),
            maxAnnualVol: Number(
              (doc.simulationParameters as Record<string, unknown>).maxAnnualVol,
            ),
          }
        : {
            defaultAnnualDrift: 0,
            defaultAnnualVol: 0,
            minAnnualVol: 0,
            maxAnnualVol: 0,
          },
  };
}

/** GET — latest Monte Carlo projection document (`UserNetWorthMonteCarloSimulation`) for the signed-in user. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const doc = await UserNetWorthMonteCarloSimulation.findOne({
    userId: session.user.id,
  }).lean();

  if (!doc) {
    return NextResponse.json({ simulation: null });
  }

  const simulation = docToPayload(doc as Record<string, unknown>);
  return NextResponse.json({ simulation });
}

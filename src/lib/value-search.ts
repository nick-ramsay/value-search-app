import clientPromise from "@/lib/mongodb";

export type ValueSearchScoreDisplay = {
  calculatedScorePercentage: number;
  totalPossiblePoints: number;
  totalCalculatedPoints?: number;
  [key: string]: unknown;
};

export type ValueRecord = {
  _id: string;
  symbol?: string;
  name?: string;
  aiRating?: string;
  aiRatingScore?: number;
  assessment?: string;
  industry?: string;
  sector?: string;
  country?: string;
  valueSearchScore?: ValueSearchScoreDisplay;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Map a raw assessment document to ValueRecord (shared for API and getValueBySymbol). */
export function docToValueRecord(doc: {
  _id?: unknown;
  symbol?: unknown;
  name?: unknown;
  aiRating?: unknown;
  aiRatingScore?: unknown;
  assessment?: unknown;
  industry?: unknown;
  sector?: unknown;
  country?: unknown;
  valueSearchScore?: unknown;
}): ValueRecord {
  const valueSearchScore = doc.valueSearchScore as
    | ValueSearchScoreDisplay
    | undefined;
  let normalized: ValueSearchScoreDisplay | undefined;
  if (valueSearchScore) {
    const totalPossiblePoints = Number(valueSearchScore.totalPossiblePoints);
    const calculatedScorePercentage = Number(
      valueSearchScore.calculatedScorePercentage
    );
    if (
      totalPossiblePoints > 0 &&
      !Number.isNaN(calculatedScorePercentage)
    ) {
      normalized = {
        ...valueSearchScore,
        calculatedScorePercentage,
        totalPossiblePoints,
      };
    }
  }
  return {
    _id: doc._id != null ? String(doc._id) : "",
    symbol: typeof doc.symbol === "string" ? doc.symbol : undefined,
    aiRating: typeof doc.aiRating === "string" ? doc.aiRating : undefined,
    aiRatingScore:
      typeof doc.aiRatingScore === "number" ? doc.aiRatingScore : undefined,
    assessment:
      typeof doc.assessment === "string" ? doc.assessment : undefined,
    name: typeof doc.name === "string" ? doc.name : undefined,
    industry: typeof doc.industry === "string" ? doc.industry : undefined,
    sector: typeof doc.sector === "string" ? doc.sector : undefined,
    country: typeof doc.country === "string" ? doc.country : undefined,
    valueSearchScore: normalized,
  };
}

/**
 * Fetch a single stock/assessment by symbol (case-insensitive). Returns null if not found.
 */
export async function getValueBySymbol(
  symbol: string
): Promise<ValueRecord | null> {
  const trimmed = symbol.trim();
  if (!trimmed) return null;

  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName || !aiAssessmentsCollection) {
    throw new Error(
      "MONGODB_DB and MONGODB_AI_ASSESSMENTS_COLLECTION must be set."
    );
  }

  const client = await clientPromise;
  const db = client.db(dbName);

  const doc = await db
    .collection(aiAssessmentsCollection)
    .findOne({
      symbol: {
        $regex: `^${escapeRegExp(trimmed)}$`,
        $options: "i",
      },
    });

  if (!doc) return null;
  return docToValueRecord(doc);
}

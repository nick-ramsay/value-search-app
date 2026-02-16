import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import clientPromise from "@/lib/mongodb";

type RawDoc = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _id?: any;
  symbol?: unknown;
  aiRating?: unknown;
  aiRatingScore?: unknown;
  valueSearchScore?: {
    calculatedScorePercentage?: unknown;
    calculatedScore?: unknown;
    score?: unknown;
    percentage?: unknown;
  };
  valueScore?: unknown;
  valueScorePercentage?: unknown;
  calculatedScorePercentage?: unknown;
  score?: unknown;
  timestamp?: unknown;
  date?: unknown;
  createdAt?: unknown;
};

type HistoryPoint = {
  date: string;
  value: number;
  label?: string;
};

type HistoryResponse = {
  scoreHistory: HistoryPoint[];
  ratingHistory: HistoryPoint[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normaliseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Handle MongoDB ISODate serialized as object with $date, if present
  if (
    typeof value === "object" &&
    value !== null &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (value as any).$date === "string"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = new Date((value as any).$date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  // Fallback: ObjectId from MongoDB – use its embedded timestamp
  if (value instanceof ObjectId) {
    const ts = value.getTimestamp();
    if (!Number.isNaN(ts.getTime())) {
      return ts.toISOString();
    }
  }

  return null;
}

function getFirstValidDate(doc: RawDoc): string | null {
  return (
    normaliseDate(doc.timestamp) ??
    normaliseDate(doc.date) ??
    normaliseDate(doc.createdAt) ??
    normaliseDate(doc._id) ??
    null
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function getScoreFromDoc(doc: RawDoc): number | null {
  // Prefer nested valueSearchScore fields if present
  if (doc.valueSearchScore) {
    const vs = doc.valueSearchScore;
    const fromCalcPct = toNumber(vs.calculatedScorePercentage);
    if (fromCalcPct != null) return fromCalcPct;

    const fromCalc = toNumber(vs.calculatedScore);
    if (fromCalc != null) return fromCalc;

    const fromScore = toNumber(vs.score);
    if (fromScore != null) return fromScore;

    const fromPct = toNumber(vs.percentage);
    if (fromPct != null) return fromPct;
  }

  // Fallback to common top-level fields used for value scores
  const rootCandidates: unknown[] = [
    doc.calculatedScorePercentage,
    doc.valueScorePercentage,
    doc.valueScore,
    doc.score,
  ];

  for (const candidate of rootCandidates) {
    const num = toNumber(candidate);
    if (num != null) return num;
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim();

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required parameter 'symbol'." },
      { status: 400 },
    );
  }

  const dbName = process.env.MONGODB_DB;
  const scoreHistoryCollection =
    process.env.MONGODB_SCORE_HISTORY_COLLECTION ?? "stock_score_history";
  const ratingHistoryCollection =
    process.env.MONGODB_AI_ASSESSMENTS_HISTORY_COLLECTION ??
    "stock-ai-assessment-history";

  if (!dbName) {
    return NextResponse.json(
      { error: "Missing database configuration." },
      { status: 500 },
    );
  }

  const client = await clientPromise;
  const db = client.db(dbName);

  // Build a symbol matcher that is resilient to case and minor format differences
  const symbolRegex = new RegExp(`^${escapeRegExp(symbol)}$`, "i");
  const symbolFilter = {
    $or: [
      // Common "symbol" casings
      { symbol },
      { symbol: symbol.toUpperCase() },
      { symbol: symbol.toLowerCase() },
      { symbol: symbolRegex },
      // Sometimes stored as "ticker"
      { ticker: symbol },
      { ticker: symbol.toUpperCase() },
      { ticker: symbol.toLowerCase() },
      { ticker: symbolRegex },
      // Occasionally capitalised field name
      { Symbol: symbol },
      { Symbol: symbol.toUpperCase() },
      { Symbol: symbol.toLowerCase() },
      { Symbol: symbolRegex },
    ],
  };

  // Fetch score history
  const rawScoreDocs = (await db
    .collection(scoreHistoryCollection)
    .find(symbolFilter)
    .sort({ timestamp: 1, date: 1, createdAt: 1 })
    .limit(365)
    .toArray()) as RawDoc[];

  const scoreHistory: HistoryPoint[] = rawScoreDocs
    .map((doc) => {
      const date = getFirstValidDate(doc);
      const scoreValue = getScoreFromDoc(doc);

      if (!date || scoreValue == null) return null;

      // If value looks like a ratio (0–1), convert to percentage
      const normalisedValue =
        scoreValue <= 1 && scoreValue >= 0 ? scoreValue * 100 : scoreValue;

      return {
        date,
        value: normalisedValue,
      } satisfies HistoryPoint;
    })
    .filter((point): point is HistoryPoint => point !== null);

  // Fetch AI rating history
  const rawRatingDocs = (await db
    .collection(ratingHistoryCollection)
    .find(symbolFilter)
    .sort({ timestamp: 1, date: 1, createdAt: 1 })
    .limit(365)
    .toArray()) as RawDoc[];

  const ratingHistory: HistoryPoint[] = rawRatingDocs
    .map((doc) => {
      const date = getFirstValidDate(doc);
      const value = toNumber(doc.aiRatingScore);
      const label =
        typeof doc.aiRating === "string" && doc.aiRating.trim().length > 0
          ? doc.aiRating
          : undefined;

      if (!date || value == null) return null;

      return {
        date,
        value,
        label,
      } satisfies HistoryPoint;
    })
    .filter((point) => point !== null) as HistoryPoint[];

  const response: HistoryResponse = {
    scoreHistory,
    ratingHistory,
  };

  return NextResponse.json(response, { status: 200 });
}


import { NextResponse } from "next/server";

import clientPromise from "@/lib/mongodb";

type Suggestion = {
  symbol?: string;
  name?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim();

  if (!query) {
    return NextResponse.json({ suggestions: [] });
  }

  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName || !aiAssessmentsCollection) {
    return NextResponse.json(
      { suggestions: [], error: "Missing database configuration." },
      { status: 500 },
    );
  }

  const client = await clientPromise;
  const db = client.db(dbName);
  const regex = new RegExp(escapeRegExp(query), "i");

  const docs = await db
    .collection(aiAssessmentsCollection)
    .find({
      symbol: { $exists: true, $ne: "" },
      $or: [{ symbol: regex }, { name: regex }],
    })
    .project({ symbol: 1, name: 1 })
    .sort({ symbol: 1, name: 1 })
    .limit(10)
    .toArray();

  const suggestions: Suggestion[] = docs
    .map((doc) => ({
      symbol: typeof doc.symbol === "string" ? doc.symbol : undefined,
      name: typeof doc.name === "string" ? doc.name : undefined,
    }))
    .filter((item) => item.symbol || item.name);

  return NextResponse.json({ suggestions });
}

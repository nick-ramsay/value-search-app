import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import UserStockData from "@/models/UserStockData";
import { docToValueRecord, type ValueRecord } from "@/lib/value-search";
import mongoose from "mongoose";

const STATUSES = ["Avoid", "Watch", "Own", "Hold"] as const;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "";
  const full = searchParams.get("full") === "1" || searchParams.get("full") === "true";
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json(
      { message: "Valid status is required (Avoid, Watch, Own, Hold)" },
      { status: 400 }
    );
  }
  await connectDB();
  const docs = await UserStockData.find({
    userId: session.user.id,
    status,
  })
    .select("symbol")
    .lean();
  const symbols = docs.map((d) => d.symbol).filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ stocks: [] });
  }
  const db = mongoose.connection.db;
  const collName = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;
  if (!db || !collName) {
    return NextResponse.json({
      stocks: full
        ? (symbols.map((s) => docToValueRecord({ _id: s, symbol: s, name: s })) as ValueRecord[])
        : symbols.map((s) => ({ symbol: s, name: s })),
    });
  }
  if (full) {
    const assessments = await db
      .collection(collName)
      .find({ symbol: { $in: symbols } })
      .toArray();
    const stocks = assessments.map((doc) => docToValueRecord(doc));
    stocks.sort((a, b) => (a.name ?? a.symbol ?? "").localeCompare(b.name ?? b.symbol ?? "", undefined, { sensitivity: "base" }));
    return NextResponse.json({ stocks });
  }
  const assessments = await db
    .collection(collName)
    .find({ symbol: { $in: symbols } })
    .project({ symbol: 1, name: 1 })
    .toArray();
  const nameBySymbol: Record<string, string> = {};
  for (const a of assessments) {
    const sym = typeof a.symbol === "string" ? a.symbol : "";
    const name = typeof a.name === "string" ? a.name : sym;
    nameBySymbol[sym] = name;
  }
  const stocks = symbols.map((symbol) => ({
    symbol,
    name: nameBySymbol[symbol] ?? symbol,
  }));
  stocks.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return NextResponse.json({ stocks });
}

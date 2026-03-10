import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";

const STOCK_QUOTES_COLLECTION =
  process.env.MONGODB_STOCK_QUOTES_COLLECTION ?? "stock-quotes";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** GET ?symbol=XXX – requires auth. Returns data fed into the LLM for the AI assessment. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim() ?? "";

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing required parameter 'symbol'." },
      { status: 400 }
    );
  }

  const dbName = process.env.MONGODB_DB;
  if (!dbName) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const client = await clientPromise;
  const db = client.db(dbName);
  const exact = symbol.toUpperCase();
  const filter = {
    $or: [
      { symbol: exact },
      { symbol: symbol },
      { symbol: { $regex: `^${escapeRegExp(symbol)}$`, $options: "i" } },
      { ticker: exact },
      { ticker: symbol },
      { ticker: { $regex: `^${escapeRegExp(symbol)}$`, $options: "i" } },
      { Symbol: exact },
      { Symbol: symbol },
    ],
  };

  const doc = await db.collection(STOCK_QUOTES_COLLECTION).findOne(filter, {
    projection: {
      quote: 1,
      fundamentals_original: 1,
      industry: 1,
      sector: 1,
      country: 1,
      investmentDescription: 1,
    },
  });

  if (!doc) {
    return NextResponse.json(
      {
        quote: null,
        fundamentals: null,
        industry: null,
        sector: null,
        country: null,
        investmentDescription: null,
      },
      { status: 200 }
    );
  }

  const d = doc as {
    quote?: Record<string, unknown> | null;
    fundamentals_original?: Record<string, unknown> | null;
    industry?: string | null;
    sector?: string | null;
    country?: string | null;
    investmentDescription?: string | null;
  };

  return NextResponse.json({
    quote: d.quote ?? null,
    fundamentals: d.fundamentals_original ?? null,
    industry: d.industry ?? null,
    sector: d.sector ?? null,
    country: d.country ?? null,
    investmentDescription: d.investmentDescription ?? null,
  });
}

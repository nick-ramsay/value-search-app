import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const STOCK_QUOTES_COLLECTION =
  process.env.MONGODB_STOCK_QUOTES_COLLECTION ?? "stock-quotes";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** GET ?symbol=XXX – public. Returns company description from fundamentals / investment description. */
export async function GET(request: Request) {
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

  const doc = await db
    .collection(STOCK_QUOTES_COLLECTION)
    .findOne(filter, {
      projection: {
        investmentDescription: 1,
        "fundamentals_original.companyDescription": 1,
      },
    });

  if (!doc) {
    return NextResponse.json(
      { companyDescription: null, investmentDescription: null },
      { status: 200 }
    );
  }

  const d = doc as {
    investmentDescription?: string | null;
    fundamentals_original?: { companyDescription?: string | null } | null;
  };
  const fromFundamentals =
    d.fundamentals_original?.companyDescription ?? null;
  const investmentDescription =
    d.investmentDescription ?? null;
  const companyDescription =
    (fromFundamentals && String(fromFundamentals).trim()) ||
    (investmentDescription && String(investmentDescription).trim()) ||
    null;

  return NextResponse.json({
    companyDescription: companyDescription || investmentDescription || null,
    investmentDescription: investmentDescription || null,
  });
}

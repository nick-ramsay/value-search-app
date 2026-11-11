import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import StockRefreshRequest from "@/models/StockRefreshRequest";

function serialize(d: InstanceType<typeof StockRefreshRequest>) {
  return {
    id: d._id.toString(),
    symbol: d.symbol,
    status: d.status,
    errorMessage: d.errorMessage ?? null,
    createdAt: d.createdAt,
    completedAt: d.completedAt ?? null,
  };
}

/**
 * Pure Mongo insert, same pattern as the economy-assessment/undervalued-picks
 * manual refreshes — the actual quote -> fundamentals -> AI assessment
 * pipeline is picked up entirely by value-search-pyworker's
 * run_research_requests.py daemon, which polls this collection for status
 * "pending" rows and calls refresh_single_stock.py's run_manual_refresh().
 * Admin-only. Unlike the economy/undervalued refreshes (a single shared
 * document, capped to once/day), this is keyed per-symbol with no daily cap
 * — only one in-flight request per symbol at a time.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { symbol?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const symbol = body.symbol?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ message: "Symbol is required" }, { status: 400 });
  }

  await connectDB();

  const latest = await StockRefreshRequest.findOne({ symbol }).sort({ createdAt: -1 });
  if (latest && (latest.status === "pending" || latest.status === "processing")) {
    return NextResponse.json(
      { message: "A refresh for this stock is already in progress.", request: serialize(latest) },
      { status: 409 },
    );
  }

  const doc = await StockRefreshRequest.create({
    symbol,
    requestedBy: session.user.email,
    status: "pending",
  });

  return NextResponse.json(serialize(doc));
}

/** Lets the per-card button poll its own symbol's in-flight request status. */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ message: "Symbol is required" }, { status: 400 });
  }

  await connectDB();

  const latest = await StockRefreshRequest.findOne({ symbol }).sort({ createdAt: -1 });
  return NextResponse.json({ latestRequest: latest ? serialize(latest) : null });
}

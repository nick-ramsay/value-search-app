import { NextResponse } from "next/server";
import { getValueBySymbol } from "@/lib/value-search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "";

  if (!symbol.trim()) {
    return NextResponse.json(
      { error: "Missing required parameter 'symbol'." },
      { status: 400 },
    );
  }

  try {
    const stock = await getValueBySymbol(symbol);
    return NextResponse.json({ stock }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load stock.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}


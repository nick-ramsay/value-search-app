import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import {
  projectionDocToPayload,
  type LeanUserNetWorthProjection,
  type TrendAndProjectionPayload,
} from "@/lib/net-worth-projection";
import { syncYearlyNetWorthIfStaleFromSheetDoc } from "@/lib/net-worth-yearly-averages";
import UserMonthlyBalanceSheet from "@/models/UserMonthlyBalanceSheet";
import UserNetWorthProjection from "@/models/UserNetWorthProjection";
import UserNetWorthYearlyAverage from "@/models/UserNetWorthYearlyAverage";

export type YearlyAverageRow = {
  year: number;
  averageNetUsd: number;
  monthCount: number;
};

/** GET — calendar-year averages plus stored trend / 30-year projection (`UserNetWorthProjection`). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const sheet = await UserMonthlyBalanceSheet.findOne({ userId: session.user.id });
  if (sheet) {
    await syncYearlyNetWorthIfStaleFromSheetDoc(session.user.id, sheet);
  }
  const docs = await UserNetWorthYearlyAverage.find({ userId: session.user.id })
    .select({ year: 1, averageNetUsd: 1, monthCount: 1 })
    .sort({ year: -1 })
    .lean();

  const rows: YearlyAverageRow[] = docs.map((d) => ({
    year: d.year,
    averageNetUsd: d.averageNetUsd,
    monthCount: d.monthCount,
  }));

  const projDoc = await UserNetWorthProjection.findOne({
    userId: session.user.id,
  }).lean<LeanUserNetWorthProjection | null>();
  const trendAndProjection: TrendAndProjectionPayload | null =
    projectionDocToPayload(projDoc);

  return NextResponse.json({ rows, trendAndProjection });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import UserStockData from "@/models/UserStockData";

const STATUSES = ["Avoid", "Watch", "Own", "Hold"] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const counts = await UserStockData.aggregate([
    { $match: { userId: session.user.id, status: { $in: [...STATUSES] } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const result: Record<string, number> = {};
  for (const s of STATUSES) result[s] = 0;
  for (const row of counts) {
    if (row._id && typeof row.count === "number") result[row._id] = row.count;
  }
  return NextResponse.json(result);
}

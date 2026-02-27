import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import UserStockData, {
  type StatusType,
  type IComment,
} from "@/models/UserStockData";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json(
      { message: "Symbol is required" },
      { status: 400 }
    );
  }
  await connectDB();
  const doc = await UserStockData.findOne({
    userId: session.user.id,
    symbol,
  });
  return NextResponse.json({
    status: doc?.status ?? "",
    comments: doc?.comments ?? [],
  });
}

type PatchBody = {
  symbol: string;
  status?: StatusType;
  comments?: IComment[];
};

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const symbol = body.symbol?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json(
      { message: "Symbol is required" },
      { status: 400 }
    );
  }
  const validStatuses: StatusType[] = ["", "Avoid", "Watch", "Own", "Hold"];
  if (
    body.status !== undefined &&
    !validStatuses.includes(body.status as StatusType)
  ) {
    return NextResponse.json(
      { message: "Invalid status" },
      { status: 400 }
    );
  }
  await connectDB();
  const update: Partial<{ status: StatusType; comments: IComment[] }> = {};
  if (body.status !== undefined) update.status = body.status as StatusType;
  if (body.comments !== undefined) update.comments = body.comments;

  const doc = await UserStockData.findOneAndUpdate(
    { userId: session.user.id, symbol },
    { $set: update },
    { new: true, upsert: true }
  );
  return NextResponse.json({
    status: doc.status,
    comments: doc.comments,
  });
}

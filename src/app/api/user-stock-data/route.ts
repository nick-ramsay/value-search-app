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

  const rawLabel =
    typeof doc?.label === "string" ? doc.label.trim() : "";
  const rawLabels = Array.isArray(doc?.labels) ? doc.labels : [];
  const labels: string[] =
    rawLabels.length > 0
      ? (rawLabels as unknown[]).filter(
          (l): l is string => typeof l === "string",
        )
      : rawLabel
        ? [rawLabel]
        : [];

  return NextResponse.json({
    status: doc?.status ?? "",
    comments: doc?.comments ?? [],
    buyTarget: doc?.buyTarget ?? undefined,
    sellTarget: doc?.sellTarget ?? undefined,
    label: rawLabel || undefined,
    labels,
  });
}

type PatchBody = {
  symbol: string;
  status?: StatusType;
  comments?: IComment[];
  buyTarget?: number | null;
  sellTarget?: number | null;
  label?: string | null;
  labels?: string[];
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
  const update: Partial<{
    status: StatusType;
    comments: IComment[];
    buyTarget?: number | null;
    sellTarget?: number | null;
    label?: string | null;
    labels?: string[];
  }> = {};
  if (body.status !== undefined) update.status = body.status as StatusType;
  if (body.comments !== undefined) update.comments = body.comments;
  if (body.buyTarget !== undefined) update.buyTarget = body.buyTarget;
  if (body.sellTarget !== undefined) update.sellTarget = body.sellTarget;
  if (Array.isArray(body.labels)) {
    const normalized = Array.from(
      new Set(
        body.labels
          .map((l) => (typeof l === "string" ? l.trim() : ""))
          .filter(Boolean),
      ),
    );
    update.labels = normalized;
    update.label = normalized[0] ?? null;
  } else if (body.label !== undefined) {
    const trimmed =
      typeof body.label === "string" ? body.label.trim() : "";
    const arr = trimmed ? [trimmed] : [];
    update.label = trimmed || null;
    update.labels = arr;
  }
  const doc = await UserStockData.findOneAndUpdate(
    { userId: session.user.id, symbol },
    { $set: update },
    { new: true, upsert: true }
  );
  return NextResponse.json({
    status: doc.status,
    comments: doc.comments,
    buyTarget: doc.buyTarget ?? undefined,
    sellTarget: doc.sellTarget ?? undefined,
    label: typeof doc.label === "string" ? doc.label : undefined,
    labels: Array.isArray(doc.labels)
      ? (doc.labels as unknown[]).filter(
          (l): l is string => typeof l === "string",
        )
      : [],
  });
}

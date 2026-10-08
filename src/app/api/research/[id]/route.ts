import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ResearchQuery from "@/models/ResearchQuery";

type Params = { params: Promise<{ id: string }> };

/** Polling endpoint for one research query's current status/result. Read-only —
 * only value-search-pyworker (writing to Mongo directly) ever changes a row. */
export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDB();
  let doc;
  try {
    doc = await ResearchQuery.findOne({ _id: id, userId: session.user.id });
  } catch {
    // Malformed id (fails ObjectId cast) — same externally-visible outcome as not found.
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!doc) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: doc._id.toString(),
    prompt: doc.prompt,
    status: doc.status,
    result: doc.result ?? null,
    mentionedStocks: doc.mentionedStocks ?? [],
    errorMessage: doc.errorMessage ?? null,
    createdAt: doc.createdAt,
  });
}

/** Deletes one research query (the prompt + its result), ownership-checked. */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDB();
  let result;
  try {
    result = await ResearchQuery.deleteOne({ _id: id, userId: session.user.id });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (result.deletedCount === 0) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}

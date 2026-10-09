import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ResearchQuery from "@/models/ResearchQuery";
import { serializeQuery } from "@/lib/research-serialize";

type Params = { params: Promise<{ id: string }> };

/** Polling endpoint for one research query's current status/result (root or
 * follow-up — the frontend polls whichever turn is currently in-flight).
 * Read-only — only value-search-pyworker (writing to Mongo directly) ever
 * changes a row. */
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
  return NextResponse.json(serializeQuery(doc));
}

/** Deletes one research thread, ownership-checked. Deleting a root cascades
 * to every follow-up in that thread — there's no meaningful way to keep a
 * follow-up around once the question it followed up on is gone. */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDB();
  let result;
  try {
    result = await ResearchQuery.deleteMany({
      userId: session.user.id,
      $or: [{ _id: id }, { rootId: id }],
    });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (result.deletedCount === 0) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}

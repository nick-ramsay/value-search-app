import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ThesisPoint, { type ThesisStatus } from "@/models/ThesisPoint";
import { serializeThesisPoint } from "@/lib/thesis-serialize";

type Params = { params: Promise<{ id: string }> };

type PatchBody = { status?: ThesisStatus };

/** Toggles a thesis point between active/inactive, ownership-checked. */
export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (body.status !== "active" && body.status !== "inactive") {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  await connectDB();
  let doc;
  try {
    doc = await ThesisPoint.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: { status: body.status } },
      { new: true },
    );
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!doc) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json(serializeThesisPoint(doc));
}

/** Permanently deletes one thesis point, ownership-checked. */
export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDB();
  let result;
  try {
    result = await ThesisPoint.deleteOne({ _id: id, userId: session.user.id });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (result.deletedCount === 0) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}

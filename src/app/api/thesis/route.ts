import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ThesisPoint, { type ThesisDirection } from "@/models/ThesisPoint";
import { serializeThesisPoint } from "@/lib/thesis-serialize";

const MAX_TEXT_LENGTH = 500;

/** Lists the signed-in user's thesis points, newest first. The frontend
 * splits these into Active/Inactive sections itself. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const points = await ThesisPoint.find({ userId: session.user.id }).sort({
    createdAt: -1,
  });
  return NextResponse.json({ points: points.map(serializeThesisPoint) });
}

type PostBody = { text?: string; direction?: ThesisDirection };

/** Pure Mongo insert — every new point starts "active". */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ message: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { message: `Text must be ${MAX_TEXT_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }
  if (body.direction !== "interested" && body.direction !== "avoid") {
    return NextResponse.json({ message: "Invalid direction" }, { status: 400 });
  }

  await connectDB();
  const doc = await ThesisPoint.create({
    userId: session.user.id,
    text,
    direction: body.direction,
    status: "active",
  });

  return NextResponse.json(serializeThesisPoint(doc));
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ResearchQuery, { type IResearchQuery } from "@/models/ResearchQuery";
import { serializeQuery } from "@/lib/research-serialize";

const MAX_PROMPT_LENGTH = 2000;
const HISTORY_LIMIT = 50;

/** List the signed-in user's research threads, newest first, for hydrating page
 * history. Only root queries are top-level; each carries its own follow-ups
 * (oldest first, so they read top-to-bottom like a conversation) nested
 * underneath — the frontend renders a whole thread inside one card. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const roots = await ResearchQuery.find({ userId: session.user.id, rootId: null })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT);
  const rootIds = roots.map((d) => d._id.toString());
  const followups = rootIds.length
    ? await ResearchQuery.find({ userId: session.user.id, rootId: { $in: rootIds } }).sort({
        createdAt: 1,
      })
    : [];
  const followupsByRoot = new Map<string, IResearchQuery[]>();
  for (const f of followups) {
    const key = f.rootId as string;
    if (!followupsByRoot.has(key)) followupsByRoot.set(key, []);
    followupsByRoot.get(key)!.push(f);
  }

  return NextResponse.json({
    queries: roots.map((d) => ({
      ...serializeQuery(d),
      followups: (followupsByRoot.get(d._id.toString()) ?? []).map(serializeQuery),
    })),
  });
}

type PostBody = { prompt?: string };

/**
 * Pure Mongo insert — no LLM call happens here. The actual research work is
 * picked up and performed entirely by value-search-pyworker's
 * run_research_requests.py daemon, which polls for status "pending" rows.
 */
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
  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ message: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { message: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  await connectDB();

  // Only one in-flight request per user at a time (root or follow-up) — keeps
  // load on the pyworker daemon predictable and means the frontend never has
  // to poll more than one in-flight card.
  const existingInFlight = await ResearchQuery.findOne({
    userId: session.user.id,
    status: { $in: ["pending", "processing"] },
  });
  if (existingInFlight) {
    return NextResponse.json(
      { message: "You already have a research request in progress." },
      { status: 409 },
    );
  }

  const doc = await ResearchQuery.create({
    userId: session.user.id,
    prompt,
    status: "pending",
  });

  return NextResponse.json({ ...serializeQuery(doc), followups: [] });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import ResearchQuery from "@/models/ResearchQuery";
import { serializeQuery } from "@/lib/research-serialize";

type Params = { params: Promise<{ id: string }> };
type PostBody = { prompt?: string };

const MAX_PROMPT_LENGTH = 2000;

/**
 * Creates a follow-up turn in an existing research thread. Same pure-insert,
 * no-LLM-here shape as the root POST — value-search-pyworker's daemon picks
 * this up like any other pending row, except it also fetches the thread's
 * prior turns to give Ollama real conversation history (see
 * run_research_requests.py's _build_conversation_history) so "what about its
 * competitors" can resolve "its" against the previous turn.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
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

  let anchor;
  try {
    anchor = await ResearchQuery.findOne({ _id: id, userId: session.user.id });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!anchor) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  // Never chain follow-ups of follow-ups — always attach to the true root,
  // even if the UI only ever calls this on a root id.
  const rootId = anchor.rootId || anchor._id.toString();

  if (anchor.status !== "complete") {
    return NextResponse.json(
      { message: "Wait for the current answer to finish before asking a follow-up." },
      { status: 409 },
    );
  }

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
    rootId,
    prompt,
    status: "pending",
  });

  return NextResponse.json(serializeQuery(doc));
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import EconomyAssessmentRefreshRequest from "@/models/EconomyAssessmentRefreshRequest";

const MANUAL_REFRESH_COOLDOWN_HOURS = 24;

function serialize(d: InstanceType<typeof EconomyAssessmentRefreshRequest>) {
  return {
    id: d._id.toString(),
    status: d.status,
    errorMessage: d.errorMessage ?? null,
    createdAt: d.createdAt,
    completedAt: d.completedAt ?? null,
  };
}

/**
 * Pure Mongo insert, same pattern as POST /api/research — the actual
 * regeneration work is picked up entirely by value-search-pyworker's
 * run_research_requests.py daemon, which polls this collection for status
 * "pending" rows and calls generate_economy_assessment_claude.py's
 * run_manual_refresh(). Admin-only; rate-limited to once per rolling 24h.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const latest = await EconomyAssessmentRefreshRequest.findOne().sort({
    createdAt: -1,
  });

  if (latest && (latest.status === "pending" || latest.status === "processing")) {
    return NextResponse.json(
      { message: "A manual refresh is already in progress.", request: serialize(latest) },
      { status: 409 },
    );
  }

  // A failed attempt doesn't count against the daily cap — only a run that
  // actually completed (or is in flight) does, so a transient failure
  // doesn't lock admins out for a full day.
  if (latest && latest.status === "complete") {
    const cooldownUntil = new Date(
      latest.createdAt.getTime() + MANUAL_REFRESH_COOLDOWN_HOURS * 60 * 60 * 1000,
    );
    if (cooldownUntil > new Date()) {
      return NextResponse.json(
        {
          message: "The economy assessment can only be refreshed manually once per day.",
          nextEligibleAt: cooldownUntil.toISOString(),
        },
        { status: 429 },
      );
    }
  }

  const doc = await EconomyAssessmentRefreshRequest.create({
    requestedBy: session.user.email,
    status: "pending",
  });

  return NextResponse.json(serialize(doc));
}

/** Lets the admin UI poll an in-flight request's status, and tells it
 * up front whether a new refresh is currently allowed (so the button can
 * render disabled with a cooldown message without first hitting a 429). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const latest = await EconomyAssessmentRefreshRequest.findOne().sort({
    createdAt: -1,
  });

  if (!latest) {
    return NextResponse.json({ latestRequest: null, canRefreshNow: true, nextEligibleAt: null });
  }

  let canRefreshNow = true;
  let nextEligibleAt: string | null = null;

  if (latest.status === "pending" || latest.status === "processing") {
    canRefreshNow = false;
  } else if (latest.status === "complete") {
    const cooldownUntil = new Date(
      latest.createdAt.getTime() + MANUAL_REFRESH_COOLDOWN_HOURS * 60 * 60 * 1000,
    );
    if (cooldownUntil > new Date()) {
      canRefreshNow = false;
      nextEligibleAt = cooldownUntil.toISOString();
    }
  }

  return NextResponse.json({
    latestRequest: serialize(latest),
    canRefreshNow,
    nextEligibleAt,
  });
}

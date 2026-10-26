import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * Actively forces the ISR cache for /economy-assessment to refresh, so that
 * page's `revalidate = 86400` is a real *guarantee* rather than "only if a
 * visitor happens to request it after the window elapses" (passive ISR can
 * otherwise go far longer than a day stale on a quiet page — see the
 * comment in that page's source for the incident this followed).
 *
 * Invoked once a week, Mondays, by the Vercel Cron Job defined in
 * /vercel.json — the underlying data (value-search-pyworker's
 * generate_economy_assessment_claude.py) only regenerates once a week
 * itself, Saturdays, so a Monday cron is the earliest weekly slot
 * guaranteed to land after that run has completed, independent of real
 * user traffic. Requires CRON_SECRET to be set in the Vercel project's
 * environment variables — Vercel automatically sends it as
 * `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests, so this
 * checks that header to reject any other caller.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Server configuration error: CRON_SECRET not set." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  revalidatePath("/economy-assessment");
  return NextResponse.json({ revalidated: true, path: "/economy-assessment" });
}

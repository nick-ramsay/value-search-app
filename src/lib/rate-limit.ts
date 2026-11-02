import mongoose from "mongoose";

/**
 * Fixed-window counters backed by Mongo rather than in-memory, since Vercel
 * serverless functions don't share memory across instances/invocations — an
 * in-memory counter would silently do nothing in production.
 *
 * windowStart is always set to "now" when a window is (re)started, so a
 * single fixed TTL safely cleans up every window doc regardless of which
 * caller's (shorter) windowSeconds was used, as long as it's comfortably
 * longer than the longest window any caller passes.
 */
const RATE_LIMIT_TTL_SECONDS = 3600;

const RateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 1 },
  windowStart: { type: Date, required: true },
});
RateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: RATE_LIMIT_TTL_SECONDS });

const RateLimit =
  mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);

/**
 * Returns true if `key` is still within `limit` hits in the trailing
 * `windowSeconds`, incrementing its count as a side effect. Returns false
 * once the limit is exceeded — callers should reject the request.
 *
 * Assumes connectDB() has already been called by the caller.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = new Date();
  const windowStartThreshold = new Date(now.getTime() - windowSeconds * 1000);

  const existing = await RateLimit.findOneAndUpdate(
    { key, windowStart: { $gte: windowStartThreshold } },
    { $inc: { count: 1 } },
    { new: true }
  );

  if (existing) {
    return existing.count <= limit;
  }

  // No active window (either none yet, or the previous one expired) — start
  // a fresh one. A concurrent request racing this upsert can only cause an
  // extra window reset, never a bypass beyond one extra request, which is an
  // acceptable tradeoff for a rate limiter.
  await RateLimit.findOneAndUpdate(
    { key },
    { $set: { windowStart: now, count: 1 } },
    { upsert: true }
  );
  return true;
}

/** Best-effort client IP from the headers Vercel's proxy sets. Falls back to
 * a constant so local dev / missing-header requests still get IP-bucketed
 * together rather than throwing — callers also rate-limit by email, so this
 * isn't the only line of defense. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

import { connectDB } from "@/lib/mongoose-connect";
import { isValidCurrencyCode } from "@/lib/iso4217-currencies";
import CurrencyUsdExchangeRate from "@/models/CurrencyUsdExchangeRate";
import UserMonthlyBalanceSheet, {
  type IBalanceAccount,
} from "@/models/UserMonthlyBalanceSheet";

type ExchangeRateLean = {
  usdPerUnit?: number | null;
  updatedAt?: Date;
};

const STALE_MS = 24 * 60 * 60 * 1000;
const FRANKFURTER_LATEST =
  "https://api.frankfurter.dev/v1/latest?from=USD";

/** Frankfurter returns foreign units per 1 USD; we store USD per 1 foreign unit. */
function foreignPerUsdToUsdPerUnit(foreignPerUsd: number): number {
  return 1 / foreignPerUsd;
}

/**
 * Ensure the collection has an AUD row (per product requirement). Does not overwrite rates.
 */
export async function ensureAustralianDollarSeed(): Promise<void> {
  await connectDB();
  await CurrencyUsdExchangeRate.findOneAndUpdate(
    { currency: "AUD" },
    { $setOnInsert: { currency: "AUD" } },
    { upsert: true },
  );
}

/**
 * Upsert ISO currency rows so we can attach FX later. Skips invalid codes and USD (implicit 1:1).
 */
export async function ensureCurrenciesTracked(currencyCodes: string[]): Promise<void> {
  await connectDB();
  const uniq = new Set(
    currencyCodes
      .map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""))
      .filter((c) => c && c !== "USD" && isValidCurrencyCode(c)),
  );
  for (const currency of uniq) {
    await CurrencyUsdExchangeRate.findOneAndUpdate(
      { currency },
      { $setOnInsert: { currency } },
      { upsert: true },
    );
  }
}

async function fetchFrankfurterUsdPerUnitMap(): Promise<Record<string, number>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(FRANKFURTER_LATEST, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Frankfurter HTTP ${res.status}`);
    }
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rates = data.rates ?? {};
    const out: Record<string, number> = {};
    for (const [cur, perUsd] of Object.entries(rates)) {
      const code = cur.trim().toUpperCase();
      if (
        typeof perUsd === "number" &&
        Number.isFinite(perUsd) &&
        perUsd > 0 &&
        isValidCurrencyCode(code)
      ) {
        out[code] = foreignPerUsdToUsdPerUnit(perUsd);
      }
    }
    out.USD = 1;
    return out;
  } finally {
    clearTimeout(t);
  }
}

/**
 * For the given currencies, refresh rows in MongoDB when missing rate or older than 24 hours.
 * Uses a single Frankfurter request when any currency needs an update.
 */
export async function refreshStaleExchangeRates(currencyCodes: string[]): Promise<void> {
  await connectDB();
  const codes = [
    ...new Set(
      currencyCodes
        .map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""))
        .filter((c) => c && c !== "USD"),
    ),
  ];
  if (codes.length === 0) return;

  const now = Date.now();
  const needRefresh: string[] = [];

  for (const code of codes) {
    const row = (await CurrencyUsdExchangeRate.findOne({ currency: code })
      .select({ usdPerUnit: 1, updatedAt: 1 })
      .lean()) as ExchangeRateLean | null;
    if (!row) {
      needRefresh.push(code);
      continue;
    }
    const u = row.usdPerUnit;
    const hasRate =
      typeof u === "number" && Number.isFinite(u) && u > 0;
    const updatedAt = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    if (!hasRate || now - updatedAt > STALE_MS) {
      needRefresh.push(code);
    }
  }

  if (needRefresh.length === 0) return;

  let fetched: Record<string, number>;
  try {
    fetched = await fetchFrankfurterUsdPerUnitMap();
  } catch (e) {
    console.error("[usd-exchange-rates] Frankfurter fetch failed", e);
    return;
  }

  for (const code of needRefresh) {
    const usdPer = fetched[code];
    if (usdPer == null || !Number.isFinite(usdPer) || usdPer <= 0) continue;
    await CurrencyUsdExchangeRate.updateOne(
      { currency: code },
      { $set: { usdPerUnit: usdPer } },
    );
  }
}

export async function getUsdPerUnitRatesForCurrencies(
  currencyCodes: string[],
): Promise<Record<string, number>> {
  await connectDB();
  const uniq = [
    ...new Set(
      currencyCodes
        .map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""))
        .filter(Boolean),
    ),
  ];
  const out: Record<string, number> = { USD: 1 };
  const query = uniq.filter((c) => c !== "USD");
  if (query.length === 0) return out;

  const rows = await CurrencyUsdExchangeRate.find({ currency: { $in: query } })
    .select({ currency: 1, usdPerUnit: 1 })
    .lean();

  for (const r of rows) {
    const c = typeof r.currency === "string" ? r.currency.toUpperCase() : "";
    const u = r.usdPerUnit;
    if (
      c &&
      typeof u === "number" &&
      Number.isFinite(u) &&
      u > 0
    ) {
      out[c] = u;
    }
  }
  return out;
}

/** Called from NextAuth `signIn` to warm FX for currencies on the user’s balance sheet. */
export async function refreshExchangeRatesForUserOnLogin(userId: string): Promise<void> {
  await connectDB();
  await ensureAustralianDollarSeed();
  const doc = (await UserMonthlyBalanceSheet.findOne({ userId }).lean()) as {
    accounts?: IBalanceAccount[];
  } | null;
  const accounts = doc?.accounts ?? [];
  const active = accounts.filter((a: IBalanceAccount) => !a.archived);
  const currencies = active.map((a: IBalanceAccount) =>
    (typeof a.currency === "string" ? a.currency : "USD").trim().toUpperCase() || "USD",
  );
  await ensureCurrenciesTracked(currencies);
  await refreshStaleExchangeRates(currencies);
}

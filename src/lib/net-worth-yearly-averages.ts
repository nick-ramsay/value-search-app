import { roundMoney2 } from "@/lib/csv-monthly-balance-import";
import { parseMonthKey } from "@/lib/monthly-balances";
import { connectDB } from "@/lib/mongoose-connect";
import {
  ensureAustralianDollarSeed,
  ensureCurrenciesTracked,
  getUsdPerUnitRatesForCurrencies,
  refreshStaleExchangeRates,
} from "@/lib/usd-exchange-rates";
import type { HydratedDocument } from "mongoose";
import UserNetWorthYearlyAverage from "@/models/UserNetWorthYearlyAverage";
import type {
  IBalanceAccount,
  IMonthBalanceRow,
  IUserMonthlyBalanceSheet,
} from "@/models/UserMonthlyBalanceSheet";

export type BalanceSheetLike = {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
  hiddenColumnIds?: string[] | null;
};

function isAccountArchived(a: IBalanceAccount): boolean {
  return Boolean(a.archived);
}

function activeAccounts(accounts: IBalanceAccount[]): IBalanceAccount[] {
  return accounts.filter((a) => !isAccountArchived(a));
}

/** Same visibility as the sheet Net column: active, non-archived, not hidden via Columns. */
function visibleAccountsForNetColumn(
  accounts: IBalanceAccount[],
  hiddenColumnIds: string[] | null | undefined,
): IBalanceAccount[] {
  const hidden = new Set(hiddenColumnIds ?? []);
  return activeAccounts(accounts).filter((a) => !hidden.has(a.id));
}

/**
 * Net (USD) for one month row — mirrors client `netSummaryForMonth` (exempt accounts omitted).
 */
function netUsdForMonthRow(
  row: IMonthBalanceRow,
  visibleAccounts: IBalanceAccount[],
  usdRates: Record<string, number>,
): { kind: "ok"; netUsd: number } | { kind: "skip" } {
  const balances = (row.balances ?? {}) as Record<string, number>;
  let netUsd = 0;
  let had = false;
  let missingRate = false;
  for (const a of visibleAccounts) {
    if (a.exemptFromNetWorth) continue;
    const v = balances[a.id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    had = true;
    const cur = (a.currency ?? "USD").toUpperCase();
    const rate = usdRates[cur];
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      missingRate = true;
      continue;
    }
    netUsd += v * rate;
  }
  if (!had) return { kind: "skip" };
  if (missingRate) return { kind: "skip" };
  return { kind: "ok", netUsd };
}

/** Latest calendar month on the sheet (by `YYYY-MM`) with a valid key; returns Net (USD) or null. */
export function latestMonthNetUsdFromSheet(
  sheet: BalanceSheetLike,
  usdRates: Record<string, number>,
): number | null {
  const rows = sheet.monthRows ?? [];
  const visible = visibleAccountsForNetColumn(
    sheet.accounts,
    sheet.hiddenColumnIds,
  );
  let bestKey: string | null = null;
  for (const row of rows) {
    const mk = typeof row.monthKey === "string" ? row.monthKey.trim() : "";
    if (!parseMonthKey(mk)) continue;
    if (!bestKey || mk > bestKey) bestKey = mk;
  }
  if (!bestKey) return null;
  const row = rows.find((r) => {
    const mk = typeof r.monthKey === "string" ? r.monthKey.trim() : "";
    return mk === bestKey;
  });
  if (!row) return null;
  const net = netUsdForMonthRow(row, visible, usdRates);
  return net.kind === "ok" ? net.netUsd : null;
}

/**
 * Recomputes calendar-year averages of monthly Net (USD) and upserts `UserNetWorthYearlyAverage`.
 * Normally invoked from {@link syncYearlyNetWorthIfStaleFromSheetDoc} when the sheet’s
 * `yearlyNetWorthAveragesMatchSheet` flag is not `true`.
 */
export async function syncUserYearlyNetWorthFromBalanceSheet(
  userId: string,
  sheet: BalanceSheetLike,
): Promise<void> {
  await connectDB();
  await ensureAustralianDollarSeed();

  const rows = sheet.monthRows ?? [];
  const visible = visibleAccountsForNetColumn(
    sheet.accounts,
    sheet.hiddenColumnIds,
  );
  const currencies = [
    ...new Set(
      visible.map((a) => (typeof a.currency === "string" ? a.currency : "USD").toUpperCase()),
    ),
  ];
  await ensureCurrenciesTracked(currencies);
  await refreshStaleExchangeRates(currencies.length > 0 ? currencies : ["USD"]);
  const usdRates = await getUsdPerUnitRatesForCurrencies(
    currencies.length > 0 ? currencies : ["USD"],
  );

  const byYear = new Map<number, { sum: number; count: number }>();

  for (const row of rows) {
    const mk = typeof row.monthKey === "string" ? row.monthKey.trim() : "";
    if (!parseMonthKey(mk)) continue;
    const year = Number.parseInt(mk.slice(0, 4), 10);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) continue;

    const net = netUsdForMonthRow(row, visible, usdRates);
    if (net.kind !== "ok") continue;

    const agg = byYear.get(year) ?? { sum: 0, count: 0 };
    agg.sum += net.netUsd;
    agg.count += 1;
    byYear.set(year, agg);
  }

  const yearsWithData = [...byYear.keys()];

  await UserNetWorthYearlyAverage.deleteMany({
    userId,
    ...(yearsWithData.length > 0 ? { year: { $nin: yearsWithData } } : {}),
  });

  for (const [year, { sum, count }] of byYear) {
    if (count <= 0) continue;
    const averageNetUsd = roundMoney2(sum / count);
    await UserNetWorthYearlyAverage.findOneAndUpdate(
      { userId, year },
      {
        $set: {
          userId,
          year,
          averageNetUsd,
          monthCount: count,
        },
      },
      { upsert: true },
    );
  }

  try {
    const { upsertNetWorthTrendAndProjections } = await import(
      "@/lib/net-worth-projection"
    );
    await upsertNetWorthTrendAndProjections(userId, sheet, usdRates);
  } catch (e) {
    console.error("[monthly-balances] net worth trend/projection upsert failed", e);
  }
}

/**
 * Runs {@link syncUserYearlyNetWorthFromBalanceSheet} only when the sheet document says
 * yearly aggregates are out of date (`yearlyNetWorthAveragesMatchSheet !== true`), then sets the flag true.
 */
export async function syncYearlyNetWorthIfStaleFromSheetDoc(
  userId: string,
  doc: HydratedDocument<IUserMonthlyBalanceSheet>,
): Promise<void> {
  if (doc.yearlyNetWorthAveragesMatchSheet === true) return;
  try {
    await syncUserYearlyNetWorthFromBalanceSheet(userId, {
      accounts: doc.accounts ?? [],
      monthRows: doc.monthRows ?? [],
      hiddenColumnIds: doc.hiddenColumnIds ?? [],
    });
    doc.yearlyNetWorthAveragesMatchSheet = true;
    await doc.save();
  } catch (e) {
    console.error("[monthly-balances] yearly net worth sync failed", e);
  }
}


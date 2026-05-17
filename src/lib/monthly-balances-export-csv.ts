import { roundMoney2 } from "@/lib/csv-monthly-balance-import";
import { currencyDisplayNameEn } from "@/lib/iso4217-currencies";
import {
  monthKeyCompareDesc,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";

export type MonthlyBalancesCsvExportAccount = {
  id: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
};

export type MonthlyBalancesCsvExportMonthRow = {
  monthKey: string;
  balances: Record<string, number>;
};

/**
 * One CSV column per distinct `{kind} {accountType} ({currency display name})`.
 * Multiple accounts that share that triple are summed for each month.
 */
export function monthlyBalancesGroupColumnHeader(
  account: MonthlyBalancesCsvExportAccount,
): string {
  const code = (account.currency ?? "USD").trim().toUpperCase();
  const currencyName = currencyDisplayNameEn(code);
  return `${account.kind} ${account.accountType} (${currencyName})`;
}

function escapeCsvCell(raw: string): string {
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Pivot CSV: one row per `YYYY-MM`, first column `Month`, remaining columns are
 * signed totals (assets positive, debts negative) grouped by account kind, type, and currency name.
 */
export function buildMonthlyBalancesGroupedTotalsCsv(
  accounts: MonthlyBalancesCsvExportAccount[],
  monthRows: MonthlyBalancesCsvExportMonthRow[],
): string {
  const headerToAccountIds = new Map<string, string[]>();
  for (const a of accounts) {
    const h = monthlyBalancesGroupColumnHeader(a);
    const list = headerToAccountIds.get(h);
    if (list) list.push(a.id);
    else headerToAccountIds.set(h, [a.id]);
  }

  const columns = [...headerToAccountIds.keys()].sort((x, y) =>
    x.localeCompare(y, "en", { sensitivity: "base" }),
  );

  const monthsAsc = [...monthRows].sort((a, b) =>
    monthKeyCompareDesc(b.monthKey, a.monthKey),
  );

  const headerLine = [
    escapeCsvCell("Month"),
    ...columns.map((c) => escapeCsvCell(c)),
  ].join(",");

  const bodyLines = monthsAsc.map((row) => {
    const bal = row.balances ?? {};
    const cells: string[] = [escapeCsvCell(row.monthKey)];
    for (const col of columns) {
      const ids = headerToAccountIds.get(col) ?? [];
      let sum = 0;
      let any = false;
      for (const id of ids) {
        const v = bal[id];
        if (typeof v === "number" && Number.isFinite(v)) {
          any = true;
          sum += v;
        }
      }
      cells.push(
        any ? escapeCsvCell(String(roundMoney2(sum))) : "",
      );
    }
    return cells.join(",");
  });

  return [headerLine, ...bodyLines].join("\r\n");
}

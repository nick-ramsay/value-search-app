export const ASSET_ACCOUNT_TYPES = [
  "Checking",
  "Savings",
  "Checking/Savings",
  "Retirement",
  "Mortgage Offset",
  "Brokerage",
  "Real Estate",
  "Unvested RSU",
  "Other",
] as const;

/** ISO calendar date `YYYY-MM-DD`, four years from today (local). */
export function defaultUnvestedRsuVestingDateIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 4);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/** Valid Gregorian `YYYY-MM-DD` string. */
export function parseIsoDateOnly(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) {
    return null;
  }
  return t;
}

export const DEBT_ACCOUNT_TYPES = [
  "Mortgage",
  "Auto Loan",
  "Student Loan",
  "Personal Loan",
  "Other",
] as const;

export type AssetAccountType = (typeof ASSET_ACCOUNT_TYPES)[number];
export type DebtAccountType = (typeof DEBT_ACCOUNT_TYPES)[number];

export type BalanceAccountKind = "Asset" | "Debt";

export function isUnvestedRsuAsset(
  kind: BalanceAccountKind,
  accountType: string,
): boolean {
  return kind === "Asset" && accountType === "Unvested RSU";
}

export function isRealEstateAsset(
  kind: BalanceAccountKind,
  accountType: string,
): boolean {
  return kind === "Asset" && accountType === "Real Estate";
}

export function formatMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${m.toString().padStart(2, "0")}`;
}

export function parseMonthKey(monthKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const d = new Date(y, mo - 1, 1);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1) return null;
  return d;
}

/** Most recent first; only past and current months (no future). */
export function defaultMonthRows(count = 12): { monthKey: string; balances: Record<string, number> }[] {
  const now = new Date();
  const rows: { monthKey: string; balances: Record<string, number> }[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.push({ monthKey: formatMonthKey(d), balances: {} });
  }
  return rows;
}

export function isValidAccountTypeForKind(
  kind: BalanceAccountKind,
  accountType: string,
): boolean {
  if (kind === "Asset") {
    return (ASSET_ACCOUNT_TYPES as readonly string[]).includes(accountType);
  }
  return (DEBT_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}

export function monthKeyCompareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * Inclusive calendar months from `fromMonthKey` through `throughMonthKey`, ascending.
 * Returns [] if either key is invalid or if From is chronologically after Through.
 */
export function monthKeysInclusiveRange(
  fromMonthKey: string,
  throughMonthKey: string,
): string[] {
  const from = parseMonthKey(fromMonthKey.trim());
  const through = parseMonthKey(throughMonthKey.trim());
  if (!from || !through) return [];
  if (from.getTime() > through.getTime()) return [];
  const keys: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(through.getFullYear(), through.getMonth(), 1);
  while (cur.getTime() <= end.getTime()) {
    keys.push(formatMonthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

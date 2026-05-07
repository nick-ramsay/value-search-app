import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import {
  defaultUnvestedRsuVestingDateIso,
  isRealEstateAsset,
  isUnvestedRsuAsset,
  isValidAccountTypeForKind,
  monthKeyCompareDesc,
  monthKeysInclusiveRange,
  parseIsoDateOnly,
  parseMonthKey,
  formatMonthKey,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
import { roundMoney2 } from "@/lib/csv-monthly-balance-import";
import { isValidCurrencyCode } from "@/lib/iso4217-currencies";
import {
  ensureAustralianDollarSeed,
  ensureCurrenciesTracked,
  refreshStaleExchangeRates,
  getUsdPerUnitRatesForCurrencies,
} from "@/lib/usd-exchange-rates";
import UserMonthlyBalanceSheet, {
  type IBalanceAccount,
  type IMonthBalanceRow,
} from "@/models/UserMonthlyBalanceSheet";

function currentMonthKey(): string {
  return formatMonthKey(new Date());
}

function isMonthNotAfterToday(monthKey: string): boolean {
  const cur = parseMonthKey(currentMonthKey());
  const d = parseMonthKey(monthKey);
  if (!cur || !d) return false;
  return d.getTime() <= cur.getTime();
}

function isAccountArchived(a: IBalanceAccount): boolean {
  return Boolean(a.archived);
}

function activeAccounts(accounts: IBalanceAccount[]): IBalanceAccount[] {
  return accounts.filter((a) => !isAccountArchived(a));
}

function activeAccountIds(accounts: IBalanceAccount[]): Set<string> {
  return new Set(activeAccounts(accounts).map((a) => a.id));
}

function parseAnnualGrowthPercent(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < -99 || n > 100) return null;
  return roundMoney2(n);
}

/** When there is at least one active account but no month rows, add the current month. Returns true if mutated. */
function ensureMonthRowWhenHasAccounts(doc: {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
}): boolean {
  if (!doc.monthRows) doc.monthRows = [];
  if (activeAccounts(doc.accounts).length === 0 || doc.monthRows.length > 0) return false;
  doc.monthRows = [{ monthKey: currentMonthKey(), balances: {} }];
  return true;
}

function applyRealEstateAutoGrowthForNewMonths(
  doc: {
    accounts: IBalanceAccount[];
    monthRows?: IMonthBalanceRow[] | null;
  },
  newMonthKeys: Set<string>,
): boolean {
  const rows = doc.monthRows ?? [];
  if (rows.length === 0 || newMonthKeys.size === 0) return false;
  const realEstateAccounts = doc.accounts.filter(
    (a) =>
      !isAccountArchived(a) &&
      isRealEstateAsset(a.kind, a.accountType) &&
      typeof a.annualGrowthPercent === "number" &&
      Number.isFinite(a.annualGrowthPercent),
  );
  if (realEstateAccounts.length === 0) return false;
  const byMonth = new Map(rows.map((r) => [r.monthKey, r]));
  const sortedKeys = [...new Set(rows.map((r) => r.monthKey))].sort();
  let changed = false;
  for (let i = 1; i < sortedKeys.length; i += 1) {
    const currentKey = sortedKeys[i];
    if (!newMonthKeys.has(currentKey)) continue;
    const prevKey = sortedKeys[i - 1];
    const prevRow = byMonth.get(prevKey);
    const curRow = byMonth.get(currentKey);
    if (!prevRow || !curRow) continue;
    const prevBalances = (prevRow.balances ?? {}) as Record<string, number>;
    const curBalances = { ...((curRow.balances ?? {}) as Record<string, number>) };
    for (const acc of realEstateAccounts) {
      if (curBalances[acc.id] !== undefined) continue;
      const prevVal = prevBalances[acc.id];
      if (typeof prevVal !== "number" || !Number.isFinite(prevVal)) continue;
      const annual = acc.annualGrowthPercent ?? 0;
      const monthlyFactor = 1 + annual / 1200;
      curBalances[acc.id] = roundMoney2(prevVal * monthlyFactor);
      changed = true;
    }
    curRow.balances = curBalances;
  }
  return changed;
}

function serializeSheet(doc: {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
  hiddenColumnIds?: string[] | null;
}) {
  const rawRows = doc.monthRows ?? [];
  const monthRows = [...rawRows].sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
    monthKeyCompareDesc(a.monthKey, b.monthKey),
  );
  const visible = activeAccounts(doc.accounts);
  const visibleIds = activeAccountIds(doc.accounts);
  const hiddenColumnIds = Array.isArray(doc.hiddenColumnIds)
    ? [...new Set(doc.hiddenColumnIds.filter((id) => visibleIds.has(id)))]
    : [];
  return {
    accounts: visible.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      accountType: a.accountType,
      currency:
        typeof a.currency === "string" && a.currency.trim()
          ? a.currency.trim().toUpperCase()
          : "USD",
      ...(typeof a.vestingDate === "string" && a.vestingDate.trim()
        ? { vestingDate: a.vestingDate.trim() }
        : {}),
      ...(typeof a.annualGrowthPercent === "number" &&
      Number.isFinite(a.annualGrowthPercent)
        ? { annualGrowthPercent: a.annualGrowthPercent }
        : {}),
      ...(a.exemptFromNetWorth ? { exemptFromNetWorth: true } : {}),
    })),
    monthRows: monthRows.map((row) => {
      const b = (row.balances ?? {}) as Record<string, unknown>;
      const balances = Object.fromEntries(
        Object.entries(b).filter(
          ([id, v]) =>
            visibleIds.has(id) && typeof v === "number" && Number.isFinite(v),
        ),
      ) as Record<string, number>;
      return {
        monthKey: row.monthKey,
        balances,
      };
    }),
    hiddenColumnIds,
  };
}

type MonthlyBalancesDoc = {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
  hiddenColumnIds?: string[] | null;
};

/** Serialized sheet plus `rates` (USD per 1 unit of each currency used by active accounts). */
async function monthlyBalancesPayload(doc: MonthlyBalancesDoc | null) {
  await ensureAustralianDollarSeed();
  const base = doc ? serializeSheet(doc) : { accounts: [], monthRows: [] };
  const currencies = base.accounts.map((a) => a.currency.toUpperCase());
  await ensureCurrenciesTracked(currencies);
  await refreshStaleExchangeRates(currencies);
  const rates = await getUsdPerUnitRatesForCurrencies(
    currencies.length > 0 ? currencies : ["USD"],
  );
  return { ...base, rates };
}

async function getOrCreateSheet(userId: string) {
  let doc = await UserMonthlyBalanceSheet.findOne({ userId });
  if (!doc) {
    doc = await UserMonthlyBalanceSheet.create({
      userId,
      accounts: [],
      monthRows: [],
      hiddenColumnIds: [],
    });
    return doc;
  }
  if (ensureMonthRowWhenHasAccounts(doc)) {
    doc.markModified("monthRows");
    await doc.save();
  }
  return doc;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const doc = await UserMonthlyBalanceSheet.findOne({ userId: session.user.id });
  if (!doc) {
    return NextResponse.json(await monthlyBalancesPayload(null));
  }
  if (ensureMonthRowWhenHasAccounts(doc)) {
    doc.markModified("monthRows");
    await doc.save();
  }
  return NextResponse.json(await monthlyBalancesPayload(doc));
}

type PatchBody =
  | {
      op: "addAccount";
      name: string;
      kind: BalanceAccountKind;
      accountType: string;
      currency: string;
      /** Required when account type is Unvested RSU (Asset). ISO `YYYY-MM-DD`. */
      vestingDate?: string;
      /** Required when account type is Real Estate (Asset). Example: `4` for 4%. */
      annualGrowthPercent?: number;
    }
  | { op: "removeAccount"; accountId: string }
  | { op: "restoreAccount"; accountId: string }
  | {
      op: "updateAccount";
      accountId: string;
      name: string;
      kind: BalanceAccountKind;
      accountType: string;
      currency: string;
      /** Required when account type is Unvested RSU (Asset). ISO `YYYY-MM-DD`. */
      vestingDate?: string;
      /** Required when account type is Real Estate (Asset). Example: `4` for 4%. */
      annualGrowthPercent?: number;
      /** When true, this account is omitted from client Net (USD) totals. */
      exemptFromNetWorth?: boolean;
    }
  | {
      op: "setCell";
      monthKey: string;
      accountId: string;
      /** Positive magnitude; server applies sign from account kind. Null clears. */
      amount: number | null;
    }
  | { op: "addMonth"; monthKey: string }
  | { op: "addMonthRange"; fromMonthKey: string; throughMonthKey: string }
  | { op: "removeMonth"; monthKey: string }
  | { op: "setHiddenColumns"; accountIds: string[] }
  | {
      op: "wizardImport";
      /** merge = append accounts & balances (default); replace = purge sheet then import only */
      sheetMode?: "merge" | "replace";
      accounts: Array<{
        name: string;
        kind: BalanceAccountKind;
        accountType: string;
        currency: string;
        vestingDate?: string;
        annualGrowthPercent?: number;
      }>;
      monthRows: Array<{
        monthKey: string;
        /** Positive magnitude per account index; null skips the cell */
        amounts: Array<number | null>;
      }>;
    };

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("op" in body)) {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  await connectDB();
  const userId = session.user.id;

  if (body.op === "addAccount") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return NextResponse.json({ message: "Invalid account name" }, { status: 400 });
    }
    if (body.kind !== "Asset" && body.kind !== "Debt") {
      return NextResponse.json({ message: "Invalid kind" }, { status: 400 });
    }
    const accountType =
      typeof body.accountType === "string" ? body.accountType.trim() : "";
    if (!isValidAccountTypeForKind(body.kind, accountType)) {
      return NextResponse.json({ message: "Invalid account type" }, { status: 400 });
    }
    const currencyRaw =
      typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    if (!currencyRaw || !isValidCurrencyCode(currencyRaw)) {
      return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
    }
    let vestingDate: string | undefined;
    if (isUnvestedRsuAsset(body.kind, accountType)) {
      const raw =
        typeof body.vestingDate === "string" ? body.vestingDate.trim() : "";
      const parsed = parseIsoDateOnly(raw);
      if (!parsed) {
        return NextResponse.json(
          { message: "Vesting date must be a valid YYYY-MM-DD" },
          { status: 400 },
        );
      }
      vestingDate = parsed;
    }
    let annualGrowthPercent: number | undefined;
    if (isRealEstateAsset(body.kind, accountType)) {
      const parsedGrowth = parseAnnualGrowthPercent(body.annualGrowthPercent);
      if (parsedGrowth === null) {
        return NextResponse.json(
          { message: "Annual growth must be a number between -99 and 100" },
          { status: 400 },
        );
      }
      annualGrowthPercent = parsedGrowth;
    }
    await ensureCurrenciesTracked([currencyRaw]);
    const doc = await getOrCreateSheet(userId);
    if (
      doc.accounts.some(
        (a: IBalanceAccount) => !isAccountArchived(a) && a.name === name,
      )
    ) {
      return NextResponse.json(
        { message: "An account with this name already exists." },
        { status: 409 },
      );
    }
    const archivedSameName = doc.accounts.find(
      (a: IBalanceAccount) => isAccountArchived(a) && a.name === name,
    );
    if (archivedSameName) {
      return NextResponse.json(
        {
          code: "ARCHIVED_ACCOUNT_EXISTS",
          message: `An archived account named "${name}" already exists. Restore it instead of creating a new one.`,
          archivedAccountId: archivedSameName.id,
        },
        { status: 409 },
      );
    }
    const account: IBalanceAccount = {
      id: randomUUID(),
      name,
      kind: body.kind,
      accountType,
      currency: currencyRaw,
      archived: false,
      ...(vestingDate ? { vestingDate } : {}),
      ...(annualGrowthPercent !== undefined ? { annualGrowthPercent } : {}),
    };
    doc.accounts = [...doc.accounts, account];
    if (ensureMonthRowWhenHasAccounts(doc)) {
      doc.markModified("monthRows");
    }
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "removeAccount") {
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) {
      return NextResponse.json({ message: "accountId required" }, { status: 400 });
    }
    const doc = await UserMonthlyBalanceSheet.findOne({ userId });
    if (!doc) {
      return NextResponse.json(await monthlyBalancesPayload(null));
    }
    const acc = doc.accounts.find((a: IBalanceAccount) => a.id === accountId);
    if (!acc) {
      return NextResponse.json({ message: "Unknown account" }, { status: 404 });
    }
    if (isAccountArchived(acc)) {
      return NextResponse.json(await monthlyBalancesPayload(doc));
    }
    acc.archived = true;
    doc.markModified("accounts");
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "restoreAccount") {
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) {
      return NextResponse.json({ message: "accountId required" }, { status: 400 });
    }
    const doc = await getOrCreateSheet(userId);
    const acc = doc.accounts.find((a: IBalanceAccount) => a.id === accountId);
    if (!acc) {
      return NextResponse.json({ message: "Unknown account" }, { status: 404 });
    }
    if (!isAccountArchived(acc)) {
      return NextResponse.json({ message: "Account is not archived" }, { status: 400 });
    }
    if (
      doc.accounts.some(
        (a: IBalanceAccount) =>
          !isAccountArchived(a) && a.id !== accountId && a.name === acc.name,
      )
    ) {
      return NextResponse.json(
        {
          message:
            "An active account already uses this name. Rename or archive it before restoring.",
        },
        { status: 409 },
      );
    }
    acc.archived = false;
    doc.markModified("accounts");
    if (ensureMonthRowWhenHasAccounts(doc)) {
      doc.markModified("monthRows");
    }
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "updateAccount") {
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!accountId || !name || name.length > 120) {
      return NextResponse.json({ message: "Invalid account" }, { status: 400 });
    }
    if (body.kind !== "Asset" && body.kind !== "Debt") {
      return NextResponse.json({ message: "Invalid kind" }, { status: 400 });
    }
    const accountType =
      typeof body.accountType === "string" ? body.accountType.trim() : "";
    if (!isValidAccountTypeForKind(body.kind, accountType)) {
      return NextResponse.json({ message: "Invalid account type" }, { status: 400 });
    }
    const currencyRaw =
      typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    if (!currencyRaw || !isValidCurrencyCode(currencyRaw)) {
      return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
    }

    let vestingDateUpdate: string | undefined | null = null;
    if (isUnvestedRsuAsset(body.kind, accountType)) {
      const raw =
        typeof body.vestingDate === "string" ? body.vestingDate.trim() : "";
      const parsed = parseIsoDateOnly(raw);
      if (!parsed) {
        return NextResponse.json(
          { message: "Vesting date must be a valid YYYY-MM-DD" },
          { status: 400 },
        );
      }
      vestingDateUpdate = parsed;
    } else {
      vestingDateUpdate = null;
    }
    let annualGrowthUpdate: number | undefined | null = null;
    if (isRealEstateAsset(body.kind, accountType)) {
      const parsedGrowth = parseAnnualGrowthPercent(body.annualGrowthPercent);
      if (parsedGrowth === null) {
        return NextResponse.json(
          { message: "Annual growth must be a number between -99 and 100" },
          { status: 400 },
        );
      }
      annualGrowthUpdate = parsedGrowth;
    } else {
      annualGrowthUpdate = null;
    }

    const doc = await UserMonthlyBalanceSheet.findOne({ userId });
    if (!doc) {
      return NextResponse.json({ message: "No sheet" }, { status: 404 });
    }
    const acc = doc.accounts.find((a: IBalanceAccount) => a.id === accountId);
    if (!acc || isAccountArchived(acc)) {
      return NextResponse.json({ message: "Unknown account" }, { status: 404 });
    }

    if (
      doc.accounts.some(
        (a: IBalanceAccount) =>
          !isAccountArchived(a) && a.id !== accountId && a.name === name,
      )
    ) {
      return NextResponse.json(
        { message: "An account with this name already exists." },
        { status: 409 },
      );
    }
    const archivedSameName = doc.accounts.find(
      (a: IBalanceAccount) =>
        isAccountArchived(a) && a.name === name && a.id !== accountId,
    );
    if (archivedSameName) {
      return NextResponse.json(
        {
          code: "ARCHIVED_ACCOUNT_EXISTS",
          message: `An archived account named "${name}" already exists. Restore it instead of renaming to this name.`,
          archivedAccountId: archivedSameName.id,
        },
        { status: 409 },
      );
    }

    const oldKind = acc.kind;
    const newKind = body.kind;
    if (oldKind !== newKind) {
      for (const row of doc.monthRows ?? []) {
        const balances = (row.balances ?? {}) as Record<string, number>;
        if (!(accountId in balances)) continue;
        const v = balances[accountId];
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        const mag = Math.abs(v);
        balances[accountId] = newKind === "Debt" ? -mag : mag;
        row.balances = { ...balances };
      }
      doc.markModified("monthRows");
    }

    acc.name = name;
    acc.kind = newKind;
    acc.accountType = accountType;
    acc.currency = currencyRaw;
    if (vestingDateUpdate === null) {
      delete acc.vestingDate;
    } else {
      acc.vestingDate = vestingDateUpdate;
    }
    if (annualGrowthUpdate === null) {
      delete acc.annualGrowthPercent;
    } else {
      acc.annualGrowthPercent = annualGrowthUpdate;
    }
    if (typeof body.exemptFromNetWorth === "boolean") {
      acc.exemptFromNetWorth = body.exemptFromNetWorth;
    }
    doc.markModified("accounts");
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "addMonth") {
    const monthKey =
      typeof body.monthKey === "string" ? body.monthKey.trim() : "";
    if (!parseMonthKey(monthKey)) {
      return NextResponse.json({ message: "Invalid month" }, { status: 400 });
    }
    if (!isMonthNotAfterToday(monthKey)) {
      return NextResponse.json(
        { message: "Month cannot be in the future" },
        { status: 400 },
      );
    }
    const doc = await getOrCreateSheet(userId);
    const existingMonths = doc.monthRows ?? [];
    if (existingMonths.some((r: IMonthBalanceRow) => r.monthKey === monthKey)) {
      return NextResponse.json({ message: "Month already exists" }, { status: 409 });
    }
    doc.monthRows = [...existingMonths, { monthKey, balances: {} }].sort(
      (a: IMonthBalanceRow, b: IMonthBalanceRow) =>
        monthKeyCompareDesc(a.monthKey, b.monthKey),
    );
    const grew = applyRealEstateAutoGrowthForNewMonths(doc, new Set([monthKey]));
    doc.markModified("monthRows");
    if (grew) doc.markModified("monthRows");
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "addMonthRange") {
    const fromRaw =
      typeof body.fromMonthKey === "string" ? body.fromMonthKey.trim() : "";
    const throughRaw =
      typeof body.throughMonthKey === "string" ? body.throughMonthKey.trim() : "";
    const fromD = parseMonthKey(fromRaw);
    const throughD = parseMonthKey(throughRaw);
    if (!fromD || !throughD) {
      return NextResponse.json({ message: "Invalid month" }, { status: 400 });
    }
    if (fromD.getTime() > throughD.getTime()) {
      return NextResponse.json(
        {
          message: "From month must be the same as or earlier than Through month.",
        },
        { status: 400 },
      );
    }
    const keys = monthKeysInclusiveRange(fromRaw, throughRaw);
    for (const k of keys) {
      if (!isMonthNotAfterToday(k)) {
        return NextResponse.json(
          { message: "Month cannot be in the future" },
          { status: 400 },
        );
      }
    }
    const doc = await getOrCreateSheet(userId);
    const existingMonths = doc.monthRows ?? [];
    const existingSet = new Set(
      existingMonths.map((r: IMonthBalanceRow) => r.monthKey),
    );
    const toAdd = keys.filter((k) => !existingSet.has(k));
    if (toAdd.length === 0) {
      return NextResponse.json(
        { message: "All months in that range are already in the table." },
        { status: 400 },
      );
    }
    const newRows: IMonthBalanceRow[] = toAdd.map((monthKey) => ({
      monthKey,
      balances: {},
    }));
    doc.monthRows = [...existingMonths, ...newRows].sort(
      (a: IMonthBalanceRow, b: IMonthBalanceRow) =>
        monthKeyCompareDesc(a.monthKey, b.monthKey),
    );
    const grew = applyRealEstateAutoGrowthForNewMonths(doc, new Set(toAdd));
    doc.markModified("monthRows");
    if (grew) doc.markModified("monthRows");
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "removeMonth") {
    const monthKey =
      typeof body.monthKey === "string" ? body.monthKey.trim() : "";
    if (!parseMonthKey(monthKey)) {
      return NextResponse.json({ message: "Invalid month" }, { status: 400 });
    }
    const doc = await UserMonthlyBalanceSheet.findOne({ userId });
    if (!doc) {
      return NextResponse.json({ message: "No sheet" }, { status: 404 });
    }
    const rows = doc.monthRows ?? [];
    const filtered = rows.filter((r: IMonthBalanceRow) => r.monthKey !== monthKey);
    if (filtered.length === rows.length) {
      return NextResponse.json({ message: "Month not found" }, { status: 404 });
    }
    doc.monthRows = filtered;
    doc.markModified("monthRows");
    if (ensureMonthRowWhenHasAccounts(doc)) {
      doc.markModified("monthRows");
    }
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "setHiddenColumns") {
    if (!Array.isArray(body.accountIds)) {
      return NextResponse.json({ message: "accountIds must be an array" }, { status: 400 });
    }
    if (!body.accountIds.every((x) => typeof x === "string")) {
      return NextResponse.json({ message: "Invalid account id list" }, { status: 400 });
    }
    const existing = await UserMonthlyBalanceSheet.findOne({ userId });
    const activeIds = existing ? activeAccountIds(existing.accounts) : new Set<string>();
    const hiddenColumnIds = [
      ...new Set(
        body.accountIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && activeIds.has(id)),
      ),
    ];
    const doc = await UserMonthlyBalanceSheet.findOneAndUpdate(
      { userId },
      {
        $set: { hiddenColumnIds },
        $setOnInsert: { userId, accounts: [], monthRows: [] },
      },
      { upsert: true, new: true },
    );
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "wizardImport") {
    if (!Array.isArray(body.accounts) || !Array.isArray(body.monthRows)) {
      return NextResponse.json({ message: "Invalid wizard import" }, { status: 400 });
    }
    if (body.accounts.length === 0) {
      return NextResponse.json(
        { message: "At least one account is required." },
        { status: 400 },
      );
    }
    for (const a of body.accounts) {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name || name.length > 120) {
        return NextResponse.json({ message: "Invalid account name" }, { status: 400 });
      }
      if (a.kind !== "Asset" && a.kind !== "Debt") {
        return NextResponse.json({ message: "Invalid kind" }, { status: 400 });
      }
      const accountType =
        typeof a.accountType === "string" ? a.accountType.trim() : "";
      if (!isValidAccountTypeForKind(a.kind, accountType)) {
        return NextResponse.json({ message: "Invalid account type" }, { status: 400 });
      }
      const currencyRaw =
        typeof a.currency === "string" ? a.currency.trim().toUpperCase() : "";
      if (!currencyRaw || !isValidCurrencyCode(currencyRaw)) {
        return NextResponse.json({ message: "Invalid currency" }, { status: 400 });
      }
      if (isUnvestedRsuAsset(a.kind, accountType)) {
        const raw =
          typeof a.vestingDate === "string" ? a.vestingDate.trim() : "";
        if (raw && !parseIsoDateOnly(raw)) {
          return NextResponse.json(
            { message: "Vesting date must be a valid YYYY-MM-DD" },
            { status: 400 },
          );
        }
      }
      if (isRealEstateAsset(a.kind, accountType)) {
        const parsedGrowth = parseAnnualGrowthPercent(a.annualGrowthPercent);
        if (parsedGrowth === null && a.annualGrowthPercent !== undefined) {
          return NextResponse.json(
            { message: "Annual growth must be a number between -99 and 100" },
            { status: 400 },
          );
        }
      }
    }
    const namesInPayload = new Set<string>();
    for (const a of body.accounts) {
      const name = (a.name as string).trim();
      if (namesInPayload.has(name)) {
        return NextResponse.json(
          { message: `Duplicate account name in import: "${name}".` },
          { status: 400 },
        );
      }
      namesInPayload.add(name);
    }

    const sheetMode =
      body.sheetMode === "replace" ? "replace" : "merge";

    const doc = await getOrCreateSheet(userId);

    if (sheetMode === "merge") {
      for (const a of body.accounts) {
        const name = (a.name as string).trim();
        if (
          doc.accounts.some(
            (x: IBalanceAccount) => !isAccountArchived(x) && x.name === name,
          )
        ) {
          return NextResponse.json(
            {
              message: `An account named "${name}" already exists. Rename it in your sheet or archive the existing account first.`,
            },
            { status: 409 },
          );
        }
        const archivedSameName = doc.accounts.find(
          (x: IBalanceAccount) => isAccountArchived(x) && x.name === name,
        );
        if (archivedSameName) {
          return NextResponse.json(
            {
              code: "ARCHIVED_ACCOUNT_EXISTS",
              message: `An archived account named "${name}" already exists. Restore or remove it before importing.`,
              archivedAccountId: archivedSameName.id,
            },
            { status: 409 },
          );
        }
      }
    }

    const n = body.accounts.length;
    const newAccounts: IBalanceAccount[] = body.accounts.map((a) => {
      const name = (a.name as string).trim();
      const accountType = (a.accountType as string).trim();
      const currencyRaw = (a.currency as string).trim().toUpperCase();
      const base: IBalanceAccount = {
        id: randomUUID(),
        name,
        kind: a.kind,
        accountType,
        currency: currencyRaw,
        archived: false,
      };
      if (isUnvestedRsuAsset(a.kind, accountType)) {
        const raw =
          typeof a.vestingDate === "string" ? a.vestingDate.trim() : "";
        base.vestingDate =
          parseIsoDateOnly(raw) ?? defaultUnvestedRsuVestingDateIso();
      }
      if (isRealEstateAsset(a.kind, accountType)) {
        base.annualGrowthPercent =
          parseAnnualGrowthPercent(a.annualGrowthPercent) ?? 4;
      }
      return base;
    });

    for (const cur of new Set(
      newAccounts.map((a) => a.currency.toUpperCase()),
    )) {
      await ensureCurrenciesTracked([cur]);
    }

    for (const row of body.monthRows) {
      const monthKey = typeof row.monthKey === "string" ? row.monthKey.trim() : "";
      if (!parseMonthKey(monthKey)) {
        return NextResponse.json({ message: "Invalid month in import" }, { status: 400 });
      }
      if (!isMonthNotAfterToday(monthKey)) {
        return NextResponse.json(
          { message: "Month cannot be in the future" },
          { status: 400 },
        );
      }
      if (!Array.isArray(row.amounts) || row.amounts.length !== n) {
        return NextResponse.json(
          { message: "Each row must include one amount per account." },
          { status: 400 },
        );
      }
      for (const amt of row.amounts) {
        if (amt === null || amt === undefined) continue;
        const raw = Number(amt);
        if (!Number.isFinite(raw) || raw < 0) {
          return NextResponse.json(
            { message: "Amounts must be non-negative magnitudes." },
            { status: 400 },
          );
        }
      }
    }

    if (sheetMode === "replace") {
      doc.accounts = newAccounts;
      const builtRows: IMonthBalanceRow[] = [];
      for (const row of body.monthRows) {
        const monthKey = row.monthKey.trim();
        const balances = {} as Record<string, number>;
        for (let i = 0; i < n; i += 1) {
          const amt = row.amounts[i];
          if (amt === null || amt === undefined) continue;
          const magnitude = roundMoney2(Math.abs(Number(amt)));
          const acc = newAccounts[i];
          balances[acc.id] = acc.kind === "Debt" ? -magnitude : magnitude;
        }
        builtRows.push({ monthKey, balances });
      }
      builtRows.sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
        monthKeyCompareDesc(a.monthKey, b.monthKey),
      );
      doc.monthRows = builtRows;
      doc.markModified("accounts");
      doc.markModified("monthRows");
      await doc.save();
      return NextResponse.json(await monthlyBalancesPayload(doc));
    }

    doc.accounts = [...doc.accounts, ...newAccounts];
    if (!doc.monthRows) doc.monthRows = [];

    for (const row of body.monthRows) {
      const monthKey = row.monthKey.trim();
      let target = doc.monthRows.find((r: IMonthBalanceRow) => r.monthKey === monthKey);
      if (!target) {
        target = { monthKey, balances: {} };
        doc.monthRows.push(target);
        doc.monthRows.sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
          monthKeyCompareDesc(a.monthKey, b.monthKey),
        );
      }
      const balances = { ...(target.balances ?? {}) } as Record<string, number>;
      for (let i = 0; i < n; i += 1) {
        const amt = row.amounts[i];
        if (amt === null || amt === undefined) continue;
        const magnitude = roundMoney2(Math.abs(Number(amt)));
        const acc = newAccounts[i];
        balances[acc.id] = acc.kind === "Debt" ? -magnitude : magnitude;
      }
      target.balances = balances;
    }

    doc.markModified("accounts");
    doc.markModified("monthRows");
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  if (body.op === "setCell") {
    const monthKey =
      typeof body.monthKey === "string" ? body.monthKey.trim() : "";
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!parseMonthKey(monthKey) || !accountId) {
      return NextResponse.json({ message: "Invalid cell" }, { status: 400 });
    }
    if (!isMonthNotAfterToday(monthKey)) {
      return NextResponse.json(
        { message: "Month cannot be in the future" },
        { status: 400 },
      );
    }
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const doc = await getOrCreateSheet(userId);
      const account = doc.accounts.find(
        (a: IBalanceAccount) => a.id === accountId && !isAccountArchived(a),
      );
      if (!account) {
        return NextResponse.json({ message: "Unknown account" }, { status: 400 });
      }
      if (!doc.monthRows) doc.monthRows = [];
      let row = doc.monthRows.find((r: IMonthBalanceRow) => r.monthKey === monthKey);
      if (!row) {
        row = { monthKey, balances: {} };
        doc.monthRows.push(row);
        doc.monthRows.sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
          monthKeyCompareDesc(a.monthKey, b.monthKey),
        );
      }
      const balances = (row.balances ?? {}) as Record<string, number>;
      if (body.amount === null || body.amount === undefined) {
        delete balances[accountId];
      } else {
        const raw = Number(body.amount);
        if (!Number.isFinite(raw)) {
          return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
        }
        const magnitude = Math.abs(raw);
        balances[accountId] =
          account.kind === "Debt" ? -magnitude : magnitude;
      }
      row.balances = { ...balances };
      doc.markModified("monthRows");
      try {
        await doc.save();
        return NextResponse.json(await monthlyBalancesPayload(doc));
      } catch (err) {
        const isVersionError =
          !!err &&
          typeof err === "object" &&
          "name" in err &&
          (err as { name?: string }).name === "VersionError";
        if (isVersionError && attempt < maxAttempts - 1) {
          continue;
        }
        throw err;
      }
    }
    return NextResponse.json({ message: "Could not save cell right now" }, { status: 409 });
  }

  return NextResponse.json({ message: "Unknown op" }, { status: 400 });
}

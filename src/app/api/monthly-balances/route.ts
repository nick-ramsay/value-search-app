import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import {
  isValidAccountTypeForKind,
  monthKeyCompareDesc,
  monthKeysInclusiveRange,
  parseMonthKey,
  formatMonthKey,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
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

function serializeSheet(doc: {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
}) {
  const rawRows = doc.monthRows ?? [];
  const monthRows = [...rawRows].sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
    monthKeyCompareDesc(a.monthKey, b.monthKey),
  );
  const visible = activeAccounts(doc.accounts);
  const visibleIds = activeAccountIds(doc.accounts);
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
  };
}

type MonthlyBalancesDoc = {
  accounts: IBalanceAccount[];
  monthRows?: IMonthBalanceRow[] | null;
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
    }
  | {
      op: "setCell";
      monthKey: string;
      accountId: string;
      /** Positive magnitude; server applies sign from account kind. Null clears. */
      amount: number | null;
    }
  | { op: "addMonth"; monthKey: string }
  | { op: "addMonthRange"; fromMonthKey: string; throughMonthKey: string };

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
    doc.markModified("monthRows");
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
    await doc.save();
    return NextResponse.json(await monthlyBalancesPayload(doc));
  }

  return NextResponse.json({ message: "Unknown op" }, { status: 400 });
}

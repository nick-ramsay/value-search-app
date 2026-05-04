import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose-connect";
import {
  defaultMonthRows,
  isValidAccountTypeForKind,
  monthKeyCompareDesc,
  parseMonthKey,
  formatMonthKey,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
import { isValidCurrencyCode } from "@/lib/iso4217-currencies";
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

function serializeSheet(doc: {
  accounts: IBalanceAccount[];
  monthRows: IMonthBalanceRow[];
}) {
  const monthRows = [...doc.monthRows].sort((a: IMonthBalanceRow, b: IMonthBalanceRow) =>
    monthKeyCompareDesc(a.monthKey, b.monthKey),
  );
  return {
    accounts: doc.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      accountType: a.accountType,
      currency:
        typeof a.currency === "string" && a.currency.trim()
          ? a.currency.trim().toUpperCase()
          : "USD",
    })),
    monthRows: monthRows.map((row) => ({
      monthKey: row.monthKey,
      balances: { ...(row.balances ?? {}) },
    })),
  };
}

async function getOrCreateSheet(userId: string) {
  let doc = await UserMonthlyBalanceSheet.findOne({ userId });
  if (!doc) {
    doc = await UserMonthlyBalanceSheet.create({
      userId,
      accounts: [],
      monthRows: defaultMonthRows(12),
    });
  } else if (!doc.monthRows || doc.monthRows.length === 0) {
    doc.monthRows = defaultMonthRows(12);
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
    return NextResponse.json({
      accounts: [],
      monthRows: defaultMonthRows(12),
    });
  }
  if (!doc.monthRows || doc.monthRows.length === 0) {
    doc.monthRows = defaultMonthRows(12);
    await doc.save();
  }
  return NextResponse.json(serializeSheet(doc));
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
  | {
      op: "setCell";
      monthKey: string;
      accountId: string;
      /** Positive magnitude; server applies sign from account kind. Null clears. */
      amount: number | null;
    }
  | { op: "addMonth"; monthKey: string };

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
    const doc = await getOrCreateSheet(userId);
    const account: IBalanceAccount = {
      id: randomUUID(),
      name,
      kind: body.kind,
      accountType,
      currency: currencyRaw,
    };
    doc.accounts = [...doc.accounts, account];
    await doc.save();
    return NextResponse.json(serializeSheet(doc));
  }

  if (body.op === "removeAccount") {
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) {
      return NextResponse.json({ message: "accountId required" }, { status: 400 });
    }
    const doc = await UserMonthlyBalanceSheet.findOne({ userId });
    if (!doc) {
      return NextResponse.json({ accounts: [], monthRows: defaultMonthRows(12) });
    }
    doc.accounts = doc.accounts.filter((a: IBalanceAccount) => a.id !== accountId);
    for (const row of doc.monthRows) {
      const b = row.balances as Record<string, number>;
      if (b && accountId in b) {
        delete b[accountId];
      }
    }
    await doc.save();
    return NextResponse.json(serializeSheet(doc));
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
    if (doc.monthRows.some((r: IMonthBalanceRow) => r.monthKey === monthKey)) {
      return NextResponse.json({ message: "Month already exists" }, { status: 409 });
    }
    doc.monthRows = [...doc.monthRows, { monthKey, balances: {} }].sort(
      (a: IMonthBalanceRow, b: IMonthBalanceRow) =>
        monthKeyCompareDesc(a.monthKey, b.monthKey),
    );
    await doc.save();
    return NextResponse.json(serializeSheet(doc));
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
    const account = doc.accounts.find((a: IBalanceAccount) => a.id === accountId);
    if (!account) {
      return NextResponse.json({ message: "Unknown account" }, { status: 400 });
    }
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
    row.balances = balances;
    await doc.save();
    return NextResponse.json(serializeSheet(doc));
  }

  return NextResponse.json({ message: "Unknown op" }, { status: 400 });
}

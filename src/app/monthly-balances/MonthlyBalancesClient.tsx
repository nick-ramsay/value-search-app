"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ASSET_ACCOUNT_TYPES,
  DEBT_ACCOUNT_TYPES,
  defaultMonthRows,
  formatMonthKey,
  parseMonthKey,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import CurrencySearchCombobox from "./CurrencySearchCombobox";

const MONTHLY_BALANCES_LOGIN_CALLBACK = `/login?callbackUrl=${encodeURIComponent("/monthly-balances")}`;

type Account = {
  id: string;
  name: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
};

type MonthRow = { monthKey: string; balances: Record<string, number> };

function formatMonthLabel(monthKey: string): string {
  const d = parseMonthKey(monthKey);
  if (!d) return monthKey;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function signedToDisplayMagnitude(account: Account, signed: number | undefined): string {
  if (signed === undefined || signed === null || Number.isNaN(signed)) return "";
  const v = account.kind === "Debt" ? Math.abs(signed) : signed;
  return String(v);
}

function parseInputToMagnitude(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

type NetSummary =
  | { kind: "empty" }
  | { kind: "mixed" }
  | { kind: "ok"; net: number; currency: string };

function netSummaryForMonth(
  monthKey: string,
  accounts: Account[],
  getSigned: (m: string, id: string) => number | undefined,
): NetSummary {
  const currencies = new Set<string>();
  let net = 0;
  let had = false;
  for (const a of accounts) {
    const v = getSigned(monthKey, a.id);
    if (typeof v === "number") {
      had = true;
      net += v;
      currencies.add((a.currency ?? "USD").toUpperCase());
    }
  }
  if (!had) return { kind: "empty" };
  if (currencies.size > 1) return { kind: "mixed" };
  const [currency] = currencies;
  return { kind: "ok", net, currency };
}

function makeCellBufferKey(monthKey: string, accountId: string): string {
  return `${monthKey}::${accountId}`;
}

export default function MonthlyBalancesClient() {
  const router = useRouter();
  const { status } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<BalanceAccountKind>("Asset");
  const [newAccountType, setNewAccountType] = useState<string>(ASSET_ACCOUNT_TYPES[0]);
  const [newCurrency, setNewCurrency] = useState("USD");
  const [adding, setAdding] = useState(false);
  const [addMonthKey, setAddMonthKey] = useState("");
  const [addingMonth, setAddingMonth] = useState(false);

  const debouncers = useRef<Map<string, number>>(new Map());
  const [buffers, setBuffers] = useState<Record<string, string>>({});

  const typeOptions = newKind === "Asset" ? ASSET_ACCOUNT_TYPES : DEBT_ACCOUNT_TYPES;

  useEffect(() => {
    if (newKind === "Asset") {
      setNewAccountType((prev) =>
        (ASSET_ACCOUNT_TYPES as readonly string[]).includes(prev)
          ? prev
          : ASSET_ACCOUNT_TYPES[0],
      );
    } else {
      setNewAccountType((prev) =>
        (DEBT_ACCOUNT_TYPES as readonly string[]).includes(prev)
          ? prev
          : DEBT_ACCOUNT_TYPES[0],
      );
    }
  }, [newKind]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/monthly-balances");
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not load balances");
      }
      const data = (await res.json()) as { accounts: Account[]; monthRows: MonthRow[] };
      setAccounts(data.accounts ?? []);
      setMonthRows(data.monthRows?.length ? data.monthRows : defaultMonthRows(12));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load balances");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
      return;
    }
    if (status === "authenticated") {
      void load();
    }
  }, [status, load, router]);

  const monthOptionsToAdd = useMemo(() => {
    const existing = new Set(monthRows.map((r) => r.monthKey));
    const now = new Date();
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 120; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = formatMonthKey(d);
      if (!existing.has(key)) {
        opts.push({ value: key, label: formatMonthLabel(key) });
      }
    }
    return opts;
  }, [monthRows]);

  useEffect(() => {
    if (monthOptionsToAdd.length > 0 && !addMonthKey) {
      setAddMonthKey(monthOptionsToAdd[0].value);
    }
  }, [monthOptionsToAdd, addMonthKey]);

  const flushSave = useCallback(
    async (monthKey: string, accountId: string, magnitude: number | null) => {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "setCell",
          monthKey,
          accountId,
          amount: magnitude,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Save failed");
      }
      const data = (await res.json()) as { accounts: Account[]; monthRows: MonthRow[] };
      setAccounts(data.accounts);
      setMonthRows(data.monthRows);
    },
    [],
  );

  const scheduleCellSave = useCallback(
    (monthKey: string, accountId: string, magnitude: number | null) => {
      const key = makeCellBufferKey(monthKey, accountId);
      const prev = debouncers.current.get(key);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        debouncers.current.delete(key);
        void flushSave(monthKey, accountId, magnitude).catch((e) => {
          setError(e instanceof Error ? e.message : "Save failed");
        });
      }, 450);
      debouncers.current.set(key, t);
    },
    [flushSave],
  );

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "addAccount",
          name,
          kind: newKind,
          accountType: newAccountType,
          currency: newCurrency,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not add account");
      }
      const data = (await res.json()) as { accounts: Account[]; monthRows: MonthRow[] };
      setAccounts(data.accounts);
      setMonthRows(data.monthRows);
      setNewName("");
      setNewKind("Asset");
      setNewAccountType(ASSET_ACCOUNT_TYPES[0]);
      setNewCurrency("USD");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    if (
      !window.confirm(
        "Remove this account and all of its monthly balances? This cannot be undone.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "removeAccount", accountId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not remove account");
      }
      const data = (await res.json()) as { accounts: Account[]; monthRows: MonthRow[] };
      setAccounts(data.accounts);
      setMonthRows(data.monthRows);
      setBuffers((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.endsWith(`::${accountId}`)) delete next[k];
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove account");
    }
  };

  const handleAddMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMonthKey) return;
    setAddingMonth(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "addMonth", monthKey: addMonthKey }),
      });
      if (res.status === 409) {
        setError("That month is already in the table.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not add month");
      }
      const data = (await res.json()) as { accounts: Account[]; monthRows: MonthRow[] };
      setAccounts(data.accounts);
      setMonthRows(data.monthRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add month");
    } finally {
      setAddingMonth(false);
    }
  };

  const getSigned = (monthKey: string, accountId: string): number | undefined => {
    const row = monthRows.find((r) => r.monthKey === monthKey);
    const v = row?.balances?.[accountId];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  const sheetUsesMultipleCurrencies =
    accounts.length > 0 &&
    new Set(accounts.map((a) => (a.currency ?? "USD").toUpperCase())).size > 1;

  if (status === "loading") {
    return (
      <div className="d-flex align-items-center justify-content-center py-5 gap-2 text-secondary">
        <span className="spinner-border spinner-border-sm" aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="d-flex align-items-center justify-content-center py-5 gap-2 text-secondary">
        <span className="spinner-border spinner-border-sm" aria-hidden />
        <span>Redirecting to sign in…</span>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="alert glass-alert-danger mb-3" role="alert">
          {error}
        </div>
      ) : null}

      <section className="card liquid-glass-card mb-4">
        <div className="card-body pt-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="h5 mb-0">Monthly balances</h2>
            {loading ? (
              <span className="small text-secondary d-inline-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" aria-hidden />
                Syncing…
              </span>
            ) : null}
          </div>

          <div className="accordion mb-3" id="mb-table-actions-accordion">
            <div className="d-flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                className="btn stock-card__action stock-card__action--primary"
                data-bs-toggle="collapse"
                data-bs-target="#mb-collapse-add-account"
                aria-expanded="false"
                aria-controls="mb-collapse-add-account"
              >
                <i className="bi bi-wallet2 me-1" aria-hidden />
                Add account
              </button>
              <button
                type="button"
                className="btn stock-card__action stock-card__action--secondary"
                data-bs-toggle="collapse"
                data-bs-target="#mb-collapse-add-month"
                aria-expanded="false"
                aria-controls="mb-collapse-add-month"
              >
                <i className="bi bi-calendar-plus me-1" aria-hidden />
                Add new month
              </button>
            </div>

            <div
              id="mb-collapse-add-account"
              className="accordion-collapse collapse"
              data-bs-parent="#mb-table-actions-accordion"
            >
              <div className="accordion-body rounded-3 border mb-0">
                <p className="small text-secondary mb-3">
                  Enter a friendly name, asset or debt, account type, and the currency balances
                  will use. Debt balances are stored as negative amounts for net math; enter
                  positive numbers (for example the amount owed).
                </p>
                <form className="row g-3" onSubmit={handleAddAccount}>
                  <div className="col-md-4">
                    <label htmlFor="mb-account-name" className="form-label fw-semibold">
                      Account name
                    </label>
                    <input
                      id="mb-account-name"
                      className="form-control search-input-glass"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Main checking"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="mb-kind" className="form-label fw-semibold">
                      Asset or debt
                    </label>
                    <select
                      id="mb-kind"
                      className="form-select glass-select"
                      value={newKind}
                      onChange={(e) => setNewKind(e.target.value as BalanceAccountKind)}
                    >
                      <option value="Asset">Asset</option>
                      <option value="Debt">Debt</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="mb-account-type" className="form-label fw-semibold">
                      Account type
                    </label>
                    <select
                      id="mb-account-type"
                      className="form-select glass-select"
                      value={newAccountType}
                      onChange={(e) => setNewAccountType(e.target.value)}
                    >
                      {typeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-lg-8">
                    <CurrencySearchCombobox
                      id="mb-currency-combobox"
                      value={newCurrency}
                      onChange={setNewCurrency}
                      disabled={adding}
                    />
                  </div>
                  <div className="col-12 d-flex justify-content-end">
                    <button
                      type="submit"
                      className="btn filter-apply-button"
                      disabled={adding || !newName.trim()}
                    >
                      {adding ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            aria-hidden
                          />
                          Adding…
                        </>
                      ) : (
                        "Save account"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div
              id="mb-collapse-add-month"
              className="accordion-collapse collapse"
              data-bs-parent="#mb-table-actions-accordion"
            >
              <div className="accordion-body rounded-3 border mb-0">
                <p className="small text-secondary mb-3">
                  The table includes recent months by default. Pick a past or current month
                  that is not already in the table, then add it as a new row.
                </p>
                <form
                  className="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-end"
                  onSubmit={handleAddMonth}
                >
                  <div className="flex-grow-1" style={{ minWidth: "12rem" }}>
                    <label htmlFor="mb-add-month" className="form-label fw-semibold small mb-1">
                      Month
                    </label>
                    <select
                      id="mb-add-month"
                      className="form-select glass-select"
                      value={addMonthKey}
                      onChange={(e) => setAddMonthKey(e.target.value)}
                      disabled={monthOptionsToAdd.length === 0}
                    >
                      {monthOptionsToAdd.length === 0 ? (
                        <option value="">All available months are already in the table</option>
                      ) : (
                        monthOptionsToAdd.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="btn filter-apply-button"
                    disabled={addingMonth || monthOptionsToAdd.length === 0}
                  >
                    {addingMonth ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" aria-hidden />
                        Adding…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-calendar-check me-1" aria-hidden />
                        Add month to table
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {accounts.length === 0 ? (
            <p className="text-secondary small mb-0">
              Use <strong>Add account</strong> to create columns, then enter an end-of-month
              balance for each month row. Use <strong>Add new month</strong> to backfill older
              periods. Amounts use each account&apos;s currency; debts are stored as negatives for
              net totals.
            </p>
          ) : (
            <>
              <div className="monthly-balances-table-wrap">
                <table className="table table-sm monthly-balances-table mb-0">
                  <thead>
                    <tr>
                      <th scope="col" className="monthly-balances-sticky-col">
                        Month
                      </th>
                      {accounts.map((a) => (
                        <th
                          key={a.id}
                          scope="col"
                          className="text-center monthly-balances-account-col"
                        >
                          <div className="d-flex flex-column align-items-center gap-1 py-1">
                            <span className="fw-semibold text-break px-1">{a.name}</span>
                            <span className="d-flex flex-wrap align-items-center justify-content-center gap-1">
                              <span
                                className={`badge ${a.kind === "Debt" ? "bg-danger-subtle" : "bg-success-subtle"}`}
                              >
                                {a.kind}
                              </span>
                              <span className="badge bg-secondary text-wrap">{a.accountType}</span>
                              <span className="badge bg-primary-subtle text-wrap">
                                {(a.currency ?? "USD").toUpperCase()}
                              </span>
                            </span>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger p-0 monthly-balances-remove-btn"
                              onClick={() => void handleRemoveAccount(a.id)}
                              aria-label={`Remove account ${a.name}`}
                            >
                              <i className="bi bi-trash" aria-hidden />
                              <span className="visually-hidden">Remove {a.name}</span>
                            </button>
                          </div>
                        </th>
                      ))}
                      <th scope="col" className="text-end monthly-balances-net-col">
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((row) => {
                      const summary = netSummaryForMonth(row.monthKey, accounts, getSigned);
                      const netText =
                        summary.kind === "ok"
                          ? formatMoneyAmount(summary.net, summary.currency)
                          : "—";
                      const netClass =
                        summary.kind === "empty"
                          ? "text-secondary"
                          : summary.kind === "mixed"
                            ? "text-secondary"
                            : summary.net >= 0
                              ? "text-success"
                              : "text-danger";
                      return (
                        <tr key={row.monthKey}>
                          <th
                            scope="row"
                            className="monthly-balances-sticky-col monthly-balances-month-label"
                          >
                            {formatMonthLabel(row.monthKey)}
                          </th>
                          {accounts.map((a) => {
                            const signed = getSigned(row.monthKey, a.id);
                            const key = makeCellBufferKey(row.monthKey, a.id);
                            const buffer = buffers[key];
                            const display =
                              buffer !== undefined
                                ? buffer
                                : signedToDisplayMagnitude(a, signed);
                            return (
                              <td key={a.id} className="align-middle text-center">
                                <label
                                  className="visually-hidden"
                                  htmlFor={`cell-${row.monthKey}-${a.id}`}
                                >
                                  {a.name} balance for {formatMonthLabel(row.monthKey)}
                                </label>
                                <input
                                  id={`cell-${row.monthKey}-${a.id}`}
                                  className="form-control form-control-sm monthly-balances-cell-input text-end"
                                  inputMode="decimal"
                                  placeholder="—"
                                  value={display}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setBuffers((prev) => ({ ...prev, [key]: v }));
                                    const mag = parseInputToMagnitude(v);
                                    scheduleCellSave(row.monthKey, a.id, mag);
                                  }}
                                  onBlur={() => {
                                    const mag = parseInputToMagnitude(
                                      buffers[key] ?? signedToDisplayMagnitude(a, signed),
                                    );
                                    setBuffers((prev) => {
                                      const next = { ...prev };
                                      delete next[key];
                                      return next;
                                    });
                                    void flushSave(row.monthKey, a.id, mag).catch((err) => {
                                      setError(
                                        err instanceof Error ? err.message : "Save failed",
                                      );
                                    });
                                    const tkey = makeCellBufferKey(row.monthKey, a.id);
                                    const prevT = debouncers.current.get(tkey);
                                    if (prevT) window.clearTimeout(prevT);
                                    debouncers.current.delete(tkey);
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td
                            className={`text-end fw-semibold monthly-balances-net-col ${netClass}`}
                            title={
                              summary.kind === "mixed"
                                ? "Multiple currencies in this row; enter values in one currency to see a net total."
                                : undefined
                            }
                          >
                            {netText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small text-secondary mt-2 mb-0">
                <i className="bi bi-info-circle me-1" aria-hidden />
                {sheetUsesMultipleCurrencies
                  ? "Net is shown only when every entered amount in that month uses the same currency; otherwise it shows an em dash."
                  : "Net uses your account currency when a row only has one currency among entered cells. Debts count as negative in the sum."}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

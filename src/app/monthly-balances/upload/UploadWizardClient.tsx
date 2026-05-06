"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ASSET_ACCOUNT_TYPES,
  DEBT_ACCOUNT_TYPES,
  isValidAccountTypeForKind,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
import { analyzeMonthlyBalanceWizardCsv } from "@/lib/csv-monthly-balance-import";
import { getCurrencyOptionsSorted, isValidCurrencyCode } from "@/lib/iso4217-currencies";

const LOGIN = `/login?callbackUrl=${encodeURIComponent("/monthly-balances/upload")}`;
const MB_IMPORT_CHOICE_MODAL_ID = "mb-upload-import-choice-modal";
const MB_OVERWRITE_CONFIRM_MODAL_ID = "mb-upload-overwrite-confirm-modal";
const OVERWRITE_CONFIRM_PHRASE = "I am sure";

type EditableAccount = {
  draftId: string;
  name: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
  mixedSignWarning: boolean;
};

function sheetHasExistingData(data: {
  accounts?: unknown;
  monthRows?: unknown;
}): boolean {
  const ac = Array.isArray(data.accounts) && data.accounts.length > 0;
  const mr = Array.isArray(data.monthRows) && data.monthRows.length > 0;
  return Boolean(ac || mr);
}

export default function UploadWizardClient() {
  const router = useRouter();
  const { status } = useSession();
  const currencyOptions = useMemo(() => getCurrencyOptionsSorted(), []);

  const importChoiceModalElRef = useRef<HTMLDivElement>(null);
  const overwriteConfirmModalElRef = useRef<HTMLDivElement>(null);

  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editableAccounts, setEditableAccounts] = useState<EditableAccount[]>([]);
  const [monthRows, setMonthRows] = useState<
    Array<{ monthKey: string; magnitudes: (number | null)[] }>
  >([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overwriteConfirmInput, setOverwriteConfirmInput] = useState("");

  const resetReview = () => {
    setEditableAccounts([]);
    setMonthRows([]);
    setCsvWarnings([]);
    setParseError(null);
    setSaveError(null);
  };

  const hideModalEl = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    void import("bootstrap/js/dist/modal").then(({ default: Modal }) => {
      Modal.getOrCreateInstance(el).hide();
    });
  }, []);

  const onPickFile = (file: File | null) => {
    resetReview();
    setFileLabel(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please choose a file with a .csv extension.");
      return;
    }
    setFileLabel(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const result = analyzeMonthlyBalanceWizardCsv(text);
      if (!result.ok) {
        setParseError(result.errors.map((e) => e.message).join(" "));
        return;
      }
      setCsvWarnings(result.warnings);
      setMonthRows(result.monthRows);
      setEditableAccounts(
        result.accounts.map((a) => ({
          draftId: a.draftId,
          name: a.name,
          kind: a.inferredKind,
          accountType: "",
          currency: "",
          mixedSignWarning: a.mixedSignWarning,
        })),
      );
    };
    reader.onerror = () => {
      setParseError("Could not read that file.");
    };
    reader.readAsText(file, "UTF-8");
  };

  const updateAccount = (draftId: string, patch: Partial<EditableAccount>) => {
    setEditableAccounts((prev) =>
      prev.map((row) => {
        if (row.draftId !== draftId) return row;
        const next = { ...row, ...patch };
        if (patch.kind !== undefined && patch.kind !== row.kind) {
          if (!isValidAccountTypeForKind(patch.kind, next.accountType)) {
            next.accountType = "";
          }
        }
        return next;
      }),
    );
  };

  const validateAccountsForSave = useCallback((): string | null => {
    if (editableAccounts.length === 0 || monthRows.length === 0) {
      return "Nothing to import. Choose a valid CSV first.";
    }
    for (const a of editableAccounts) {
      const name = a.name.trim();
      if (!name || name.length > 120) {
        return "Each account needs a name between 1 and 120 characters.";
      }
      if (
        !a.accountType.trim() ||
        !isValidAccountTypeForKind(a.kind, a.accountType.trim())
      ) {
        return `Choose a valid account type for “${name}”.`;
      }
      const cur = a.currency.trim().toUpperCase();
      if (!cur || !isValidCurrencyCode(cur)) {
        return `Choose a currency for “${name}”.`;
      }
    }
    return null;
  }, [editableAccounts, monthRows.length]);

  const buildImportBody = useCallback(
    (sheetMode: "merge" | "replace") => ({
      op: "wizardImport" as const,
      sheetMode,
      accounts: editableAccounts.map((a) => ({
        name: a.name.trim(),
        kind: a.kind,
        accountType: a.accountType.trim(),
        currency: a.currency.trim().toUpperCase(),
      })),
      monthRows: monthRows.map((r) => ({
        monthKey: r.monthKey,
        amounts: r.magnitudes,
      })),
    }),
    [editableAccounts, monthRows],
  );

  const executeWizardImport = useCallback(
    async (sheetMode: "merge" | "replace") => {
      setSaveError(null);
      setSaving(true);
      hideModalEl(importChoiceModalElRef.current);
      hideModalEl(overwriteConfirmModalElRef.current);
      setOverwriteConfirmInput("");
      try {
        const res = await fetch("/api/monthly-balances", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildImportBody(sheetMode)),
        });
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        if (res.status === 401) {
          router.replace(LOGIN);
          return;
        }
        if (!res.ok) {
          throw new Error(j.message ?? "Import failed");
        }
        router.push("/monthly-balances");
        router.refresh();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setSaving(false);
      }
    },
    [buildImportBody, hideModalEl, router],
  );

  const beginSave = async () => {
    const validationError = validateAccountsForSave();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaveError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "GET",
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace(LOGIN);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not load your sheet.");
      }
      const data = (await res.json()) as {
        accounts?: unknown;
        monthRows?: unknown;
      };
      if (!sheetHasExistingData(data)) {
        await executeWizardImport("merge");
        return;
      }
      void import("bootstrap/js/dist/modal").then(({ default: Modal }) => {
        const el = importChoiceModalElRef.current;
        if (!el) return;
        Modal.getOrCreateInstance(el, { backdrop: "static", keyboard: true }).show();
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not continue.");
    }
  };

  const onChooseAdditionalData = () => {
    void executeWizardImport("merge");
  };

  const onChooseOverwriteIntro = () => {
    hideModalEl(importChoiceModalElRef.current);
    setOverwriteConfirmInput("");
    window.setTimeout(() => {
      void import("bootstrap/js/dist/modal").then(({ default: Modal }) => {
        const el = overwriteConfirmModalElRef.current;
        if (!el) return;
        Modal.getOrCreateInstance(el, { backdrop: "static", keyboard: true }).show();
      });
    }, 200);
  };

  const onConfirmOverwrite = () => {
    if (overwriteConfirmInput.trim() !== OVERWRITE_CONFIRM_PHRASE) return;
    void executeWizardImport("replace");
  };

  const overwritePhraseOk =
    overwriteConfirmInput.trim() === OVERWRITE_CONFIRM_PHRASE;

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
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h1 className="h4 mb-1">Monthly Balance CSV Upload</h1>
          <p className="small text-secondary mb-0">
            Import months and accounts from a spreadsheet file, confirm details, then save to your
            sheet.
          </p>
        </div>
        <Link href="/monthly-balances" className="btn btn-outline-secondary btn-sm">
          <i className="bi bi-arrow-left me-1" aria-hidden />
          Back to Monthly Balances
        </Link>
      </div>

      <section className="card liquid-glass-card mb-4">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-3">1. Choose a CSV File</h2>
          <p className="small text-secondary mb-2">
            First column: <strong>MONTH-YEAR</strong> in English, hyphen between month and four-digit
            year (e.g. <code>August-2018</code> or <code>Aug-2018</code>). Each data row must have the
            same number of columns as the header (use empty cells where a balance is missing).
            Remaining columns: one per account — the header cell is the account name; values are
            balances (numbers only; blanks allowed). Non-numeric text or wrong column counts reject the
            file. Each calendar month must appear at most once. Values are rounded to{" "}
            <strong>two decimal places</strong>. Negative numbers in a column suggest debt; positive
            suggest asset (mixed-sign columns are flagged before saving).
          </p>
          <label
            className="form-label small fw-semibold mb-2"
            htmlFor="mb-csv-upload-input"
          >
            CSV File
          </label>
          <input
            id="mb-csv-upload-input"
            type="file"
            accept=".csv,text/csv"
            className="form-control"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {fileLabel ? (
            <p className="small text-secondary mt-2 mb-0">
              Selected: <span className="fw-semibold text-body">{fileLabel}</span>
            </p>
          ) : null}
        </div>
      </section>

      {parseError ? (
        <div className="alert glass-alert-danger mb-4" role="alert">
          {parseError}
        </div>
      ) : null}

      {saveError ? (
        <div className="alert glass-alert-danger mb-4" role="alert">
          {saveError}
        </div>
      ) : null}

      {csvWarnings.length > 0 ? (
        <div className="alert glass-alert glass-alert-warning mb-4" role="alert">
          <strong className="d-block mb-1">Notes</strong>
          <ul className="mb-0 ps-3 small">
            {csvWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {editableAccounts.length > 0 ? (
        <section className="card liquid-glass-card mb-4">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-2">2. Confirm Each Account</h2>
            <p className="small text-secondary mb-3">
              Names start from your CSV header — you can edit them here. Choose asset/debt, account
              type, and currency for each row (none are pre-selected). Import creates new accounts;
              if your sheet already has data, you can merge this import or replace everything after you
              save.
            </p>
            <p className="small text-secondary mb-3">
              <strong>{monthRows.length}</strong> month row
              {monthRows.length === 1 ? "" : "s"} will be updated or added.
            </p>
            <div className="vstack gap-3">
              {editableAccounts.map((a) => (
                <div
                  key={a.draftId}
                  className="border rounded-3 p-3"
                  style={{
                    borderColor: "var(--glass-border-subtle)",
                    background: "var(--glass-bg-subtle)",
                  }}
                >
                  {a.mixedSignWarning ? (
                    <div className="small text-warning mb-3">
                      This column had both positive and negative values — confirm Asset vs Debt.
                    </div>
                  ) : null}
                  <div className="row g-3">
                    <div className="col-12">
                      <label
                        className="form-label small fw-semibold mb-1"
                        htmlFor={`name-${a.draftId}`}
                      >
                        Account Name
                      </label>
                      <input
                        id={`name-${a.draftId}`}
                        type="text"
                        className="form-control search-input-glass"
                        autoComplete="off"
                        maxLength={120}
                        value={a.name}
                        onChange={(e) =>
                          updateAccount(a.draftId, { name: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-12 col-sm-4">
                      <label className="form-label small fw-semibold mb-1" htmlFor={`kind-${a.draftId}`}>
                        Asset / Debt
                      </label>
                      <select
                        id={`kind-${a.draftId}`}
                        className="form-select glass-select"
                        value={a.kind}
                        onChange={(e) =>
                          updateAccount(a.draftId, {
                            kind: e.target.value as BalanceAccountKind,
                          })
                        }
                      >
                        <option value="Asset">Asset</option>
                        <option value="Debt">Debt</option>
                      </select>
                    </div>
                    <div className="col-12 col-sm-4">
                      <label
                        className="form-label small fw-semibold mb-1"
                        htmlFor={`type-${a.draftId}`}
                      >
                        Account Type
                      </label>
                      <select
                        id={`type-${a.draftId}`}
                        className="form-select glass-select"
                        value={a.accountType}
                        onChange={(e) =>
                          updateAccount(a.draftId, { accountType: e.target.value })
                        }
                      >
                        <option value="">Select Account Type…</option>
                        {(a.kind === "Asset" ? ASSET_ACCOUNT_TYPES : DEBT_ACCOUNT_TYPES).map(
                          (t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div className="col-12 col-sm-4">
                      <label
                        className="form-label small fw-semibold mb-1"
                        htmlFor={`cur-${a.draftId}`}
                      >
                        Currency
                      </label>
                      <select
                        id={`cur-${a.draftId}`}
                        className="form-select glass-select"
                        value={a.currency}
                        onChange={(e) => updateAccount(a.draftId, { currency: e.target.value })}
                      >
                        <option value="">Select Currency…</option>
                        {currencyOptions.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="d-flex justify-content-end">
                <button
                  type="button"
                  className="btn filter-apply-button"
                  disabled={saving}
                  onClick={() => void beginSave()}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-cloud-upload me-1" aria-hidden />
                      Save to Monthly Balances
                    </>
                  )}
                </button>
              </div>
              <p className="small text-secondary text-end mt-2 mb-0">
                Balances are stored as magnitudes; debts are saved as negative amounts.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Merge vs replace when sheet already has data */}
      <div
        ref={importChoiceModalElRef}
        className="modal fade"
        id={MB_IMPORT_CHOICE_MODAL_ID}
        tabIndex={-1}
        aria-labelledby={`${MB_IMPORT_CHOICE_MODAL_ID}-label`}
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content score-breakdown-modal">
            <div className="modal-header">
              <h5 className="modal-title" id={`${MB_IMPORT_CHOICE_MODAL_ID}-label`}>
                Existing Monthly Balance Data
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="mb-3">
                Your sheet already has accounts or month rows. How should this import be applied?
              </p>
              <ul className="small text-secondary mb-0">
                <li className="mb-2">
                  <strong>Add as additional data</strong> — keep everything you already have and add
                  these new accounts and balances (same rules as a normal import; duplicate account
                  names will still block the save).
                </li>
                <li>
                  <strong>Overwrite existing data</strong> — remove all current accounts and month
                  balances, then save only what is in this CSV.
                </li>
              </ul>
            </div>
            <div className="modal-footer flex-column flex-sm-row gap-2 align-items-stretch">
              <button
                type="button"
                className="btn btn-outline-secondary order-sm-1"
                data-bs-dismiss="modal"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn filter-apply-button order-sm-2"
                disabled={saving}
                onClick={() => onChooseAdditionalData()}
              >
                Add as Additional Data
              </button>
              <button
                type="button"
                className="btn btn-danger order-sm-3"
                disabled={saving}
                onClick={() => onChooseOverwriteIntro()}
              >
                Overwrite Existing Data
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={overwriteConfirmModalElRef}
        className="modal fade"
        id={MB_OVERWRITE_CONFIRM_MODAL_ID}
        tabIndex={-1}
        aria-labelledby={`${MB_OVERWRITE_CONFIRM_MODAL_ID}-label`}
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content score-breakdown-modal">
            <div className="modal-header">
              <h5 className="modal-title" id={`${MB_OVERWRITE_CONFIRM_MODAL_ID}-label`}>
                Confirm Overwrite
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="mb-3">
                This will permanently delete all existing monthly balance accounts and month data on
                your sheet, then import only this CSV. Type{" "}
                <strong className="text-body">{OVERWRITE_CONFIRM_PHRASE}</strong> to continue.
              </p>
              <label className="form-label fw-semibold" htmlFor="mb-overwrite-confirm-input">
                Confirmation
              </label>
              <input
                id="mb-overwrite-confirm-input"
                type="text"
                className="form-control search-input-glass"
                autoComplete="off"
                value={overwriteConfirmInput}
                onChange={(e) => setOverwriteConfirmInput(e.target.value)}
                placeholder={OVERWRITE_CONFIRM_PHRASE}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" data-bs-dismiss="modal">
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={saving || !overwritePhraseOk}
                onClick={() => onConfirmOverwrite()}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ASSET_ACCOUNT_TYPES,
  DEBT_ACCOUNT_TYPES,
  defaultUnvestedRsuVestingDateIso,
  formatMonthKey,
  isRealEstateAsset,
  isUnvestedRsuAsset,
  monthKeyCompareDesc,
  monthKeysInclusiveRange,
  parseMonthKey,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";
import { formatMoneyAmount } from "@/lib/iso4217-currencies";
import type { TrendAndProjectionPayload } from "@/lib/net-worth-projection";
import CurrencySearchCombobox from "./CurrencySearchCombobox";
import MonthlyNetUsdBarChart, {
  type NetUsdBarPoint,
} from "./MonthlyNetUsdBarChart";
import NetWorthProjectionCharts from "./NetWorthProjectionCharts";
import YearlyNetUsdBarChart from "./YearlyNetUsdBarChart";

const MONTHLY_BALANCES_LOGIN_CALLBACK = `/login?callbackUrl=${encodeURIComponent("/monthly-balances")}`;
const MB_ARCHIVE_ACCOUNT_MODAL_ID = "mb-archive-account-modal";
const MB_ACCOUNT_INFO_MODAL_ID = "mb-account-info-modal";
/** Persisted preference: when true, balance cells are read-only. */
const MB_CELLS_LOCKED_STORAGE_KEY = "value-search-mb-balance-cells-locked";
const MB_COLUMN_VISIBILITY_MODAL_ID = "mb-column-visibility-modal";
const MB_DELETE_MONTH_MODAL_ID = "mb-delete-month-modal";
/** Case-sensitive confirmation required to archive an account. */
const ARCHIVE_CONFIRM_PHRASE = "Delete";
/** Persisted preference: monthly sheet vs yearly averages vs projections (`sheet` | `yearly` | `projections`). */
const MB_TABLE_VIEW_STORAGE_KEY = "value-search-mb-table-view";

type MbTableView = "sheet" | "yearly" | "projections";

type YearlyAverageRow = {
  year: number;
  averageNetUsd: number;
  monthCount: number;
};

type Account = {
  id: string;
  name: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
  /** ISO `YYYY-MM-DD` when account type is Unvested RSU. */
  vestingDate?: string;
  /** Annual growth percentage for Real Estate (e.g. 4 = 4%). */
  annualGrowthPercent?: number;
  /** When true, balances are excluded from the monthly Net (USD) total. */
  exemptFromNetWorth?: boolean;
};

type MonthRow = { monthKey: string; balances: Record<string, number> };

type AccountDetailsFormState = {
  name: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
  vestingDate?: string;
  annualGrowthPercent?: string;
  exemptFromNetWorth: boolean;
};

function formatMonthLabel(monthKey: string): string {
  const d = parseMonthKey(monthKey);
  if (!d) return monthKey;
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function signedToDisplayMagnitude(
  account: Account,
  signed: number | undefined,
): string {
  if (signed === undefined || signed === null || Number.isNaN(signed))
    return "";
  const v = account.kind === "Debt" ? Math.abs(signed) : signed;
  return String(v);
}

function parseInputToMagnitude(raw: string): number | null {
  const t = raw.trim().replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

function signedToGroupedAmountDisplay(
  account: Account,
  signed: number | undefined,
): string {
  if (signed === undefined || signed === null || Number.isNaN(signed))
    return "";
  const v = account.kind === "Debt" ? Math.abs(signed) : signed;
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return v.toFixed(2);
  }
}

function magnitudeToGroupedAmountDisplay(magnitude: number | null): string {
  if (magnitude === null || !Number.isFinite(magnitude)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(magnitude));
  } catch {
    return Math.abs(magnitude).toFixed(2);
  }
}

type NetSummary =
  | { kind: "empty" }
  | { kind: "mixed" }
  | { kind: "ok"; net: number; currency: string };

/** USD per one unit of currency (1 AUD → X USD). Always includes USD → 1. */
function normalizeUsdRates(raw: unknown): Record<string, number> {
  const out: Record<string, number> = { USD: 1 };
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = k.trim().toUpperCase();
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[code] = v;
    }
  }
  return out;
}

/** Net is the sum of visible account cell values converted to USD using `usdRates` (excludes exempt accounts). */
function netSummaryForMonth(
  monthKey: string,
  accounts: Account[],
  getSigned: (m: string, id: string) => number | undefined,
  usdRates: Record<string, number>,
): NetSummary {
  let netUsd = 0;
  let had = false;
  let missingRate = false;
  for (const a of accounts) {
    if (a.exemptFromNetWorth) continue;
    const v = getSigned(monthKey, a.id);
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
  if (!had) return { kind: "empty" };
  if (missingRate) return { kind: "mixed" };
  return { kind: "ok", net: netUsd, currency: "USD" };
}

function makeCellBufferKey(monthKey: string, accountId: string): string {
  return `${monthKey}::${accountId}`;
}

/** Latest month key in `rows` that is strictly before `currentKey` (YYYY-MM string order). */
function priorMonthKeyInSheet(
  rows: MonthRow[],
  currentKey: string,
): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const k = r.monthKey;
    if (k >= currentKey) continue;
    if (best === null || k > best) best = k;
  }
  return best;
}

function signedFromDisplayMagnitude(account: Account, mag: number): number {
  return account.kind === "Debt" ? -Math.abs(mag) : Math.abs(mag);
}

/** Signed value for trend compare: in-edit buffer if non-empty, else committed cell. */
function cellSignedForTrend(
  account: Account,
  buffer: string | undefined,
  committedSigned: number | undefined,
): number | undefined {
  if (buffer !== undefined && buffer.trim() !== "") {
    const mag = parseInputToMagnitude(buffer);
    if (mag === null) return undefined;
    return signedFromDisplayMagnitude(account, mag);
  }
  if (committedSigned === undefined || !Number.isFinite(committedSigned))
    return undefined;
  return committedSigned;
}

function cellTrendToneClass(
  rows: MonthRow[],
  monthKey: string,
  account: Account,
  buffer: string | undefined,
  committedSigned: number | undefined,
  getSigned: (m: string, id: string) => number | undefined,
): string {
  const priorKey = priorMonthKeyInSheet(rows, monthKey);
  if (!priorKey) return "";
  const priorSigned = getSigned(priorKey, account.id);
  if (priorSigned === undefined || !Number.isFinite(priorSigned)) return "";
  const cur = cellSignedForTrend(account, buffer, committedSigned);
  if (cur === undefined || !Number.isFinite(cur)) return "";
  if (cur > priorSigned) return "monthly-balances-cell-input--above-prior";
  if (cur < priorSigned) return "monthly-balances-cell-input--below-prior";
  return "";
}

function normalizeMonthRows(rows: unknown): MonthRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const seen = new Set<string>();
  const parsed: MonthRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { monthKey?: unknown; balances?: unknown };
    const mk = typeof r.monthKey === "string" ? r.monthKey.trim() : "";
    if (!mk || parseMonthKey(mk) === null || seen.has(mk)) continue;
    seen.add(mk);
    const b = r.balances;
    const balances: Record<string, number> =
      b && typeof b === "object" && !Array.isArray(b)
        ? Object.fromEntries(
            Object.entries(b as Record<string, unknown>).filter(
              ([, v]) => typeof v === "number" && Number.isFinite(v),
            ) as [string, number][],
          )
        : {};
    parsed.push({ monthKey: mk, balances });
  }
  parsed.sort((a, b) => monthKeyCompareDesc(a.monthKey, b.monthKey));
  return parsed;
}

/** Bootstrap `md` — table vs stacked cards; only one layout mounts (avoids duplicate balance input ids). */
function useMediaMinMd(): boolean {
  const [matches, setMatches] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setMatches(mq.matches);
    const handler = () => setMatches(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return matches;
}

export default function MonthlyBalancesClient() {
  const router = useRouter();
  const { status } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [usdRates, setUsdRates] = useState<Record<string, number>>({ USD: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<BalanceAccountKind>("Asset");
  const [newAccountType, setNewAccountType] = useState<string>(
    ASSET_ACCOUNT_TYPES[0],
  );
  const [newVestingDate, setNewVestingDate] = useState(() =>
    defaultUnvestedRsuVestingDateIso(),
  );
  const [newAnnualGrowthPercent, setNewAnnualGrowthPercent] = useState("4");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [adding, setAdding] = useState(false);
  const [addMonthKey, setAddMonthKey] = useState("");
  const [addMonthMode, setAddMonthMode] = useState<"single" | "range">(
    "single",
  );
  const [rangeFromKey, setRangeFromKey] = useState(() =>
    formatMonthKey(new Date()),
  );
  const [rangeThroughKey, setRangeThroughKey] = useState(() =>
    formatMonthKey(new Date()),
  );
  const [addingMonth, setAddingMonth] = useState(false);
  const [actionsPanel, setActionsPanel] = useState<"account" | "month" | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [archiveConfirmInput, setArchiveConfirmInput] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [archivedConflict, setArchivedConflict] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [restoringArchived, setRestoringArchived] = useState(false);

  const archiveModalElRef = useRef<HTMLDivElement>(null);
  const archiveBsModalRef = useRef<{
    show: () => void;
    hide: () => void;
    dispose: () => void;
  } | null>(null);
  const accountInfoModalElRef = useRef<HTMLDivElement>(null);
  const accountInfoBsModalRef = useRef<{
    show: () => void;
    hide: () => void;
    dispose: () => void;
  } | null>(null);
  const columnVisibilityModalElRef = useRef<HTMLDivElement>(null);
  const columnVisibilityBsModalRef = useRef<{
    show: () => void;
    hide: () => void;
    dispose: () => void;
  } | null>(null);
  const deleteMonthModalElRef = useRef<HTMLDivElement>(null);
  const deleteMonthBsModalRef = useRef<{
    show: () => void;
    hide: () => void;
    dispose: () => void;
  } | null>(null);
  const debouncers = useRef<Map<string, number>>(new Map());
  const saveSeqRef = useRef<Map<string, number>>(new Map());
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [savingCellKeys, setSavingCellKeys] = useState<Record<string, number>>(
    {},
  );
  const [pendingSaveMagnitudes, setPendingSaveMagnitudes] = useState<
    Record<string, { seq: number; magnitude: number | null }>
  >({});
  /** `monthKey::accountId` while that balance cell is in edit mode (input visible). */
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  /** When true, balance amount cells cannot be edited (desktop table + mobile cards). Default: locked. */
  const [balanceCellsLocked, setBalanceCellsLocked] = useState(true);
  const [accountDetailsTarget, setAccountDetailsTarget] =
    useState<Account | null>(null);
  const [accountDetailsForm, setAccountDetailsForm] =
    useState<AccountDetailsFormState | null>(null);
  const [savingAccountDetails, setSavingAccountDetails] = useState(false);
  const [accountDetailsArchivedConflict, setAccountDetailsArchivedConflict] =
    useState<{
      id: string;
      message: string;
    } | null>(null);
  const [expandedMobileMonthKey, setExpandedMobileMonthKey] = useState<
    string | null
  >(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [deleteMonthTargetKey, setDeleteMonthTargetKey] = useState<
    string | null
  >(null);
  const [deleteMonthConfirmInput, setDeleteMonthConfirmInput] = useState("");
  const [deletingMonth, setDeletingMonth] = useState(false);
  const [hiddenColumnsLoadedFromServer, setHiddenColumnsLoadedFromServer] =
    useState(false);
  const [tableView, setTableView] = useState<MbTableView>("sheet");
  const [yearlyRows, setYearlyRows] = useState<YearlyAverageRow[]>([]);
  const [projectionPayload, setProjectionPayload] =
    useState<TrendAndProjectionPayload | null>(null);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyError, setYearlyError] = useState<string | null>(null);

  const typeOptions =
    newKind === "Asset" ? ASSET_ACCOUNT_TYPES : DEBT_ACCOUNT_TYPES;

  const hiddenColumnIdSet = useMemo(
    () => new Set(hiddenColumnIds),
    [hiddenColumnIds],
  );

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => !hiddenColumnIdSet.has(a.id)),
    [accounts, hiddenColumnIdSet],
  );

  const hiddenAccountColumnCount = accounts.length - visibleAccounts.length;

  const applySheetPayload = useCallback(
    (data: {
      accounts?: Account[];
      monthRows?: unknown;
      rates?: unknown;
      hiddenColumnIds?: unknown;
    }) => {
      setAccounts(data.accounts ?? []);
      setMonthRows(normalizeMonthRows(data.monthRows));
      setUsdRates(normalizeUsdRates(data.rates));
      if (
        Array.isArray(data.hiddenColumnIds) &&
        data.hiddenColumnIds.every((x) => typeof x === "string")
      ) {
        setHiddenColumnIds(data.hiddenColumnIds);
        setHiddenColumnsLoadedFromServer(true);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(MB_CELLS_LOCKED_STORAGE_KEY) === "0") {
        setBalanceCellsLocked(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    try {
      const v = localStorage.getItem(MB_TABLE_VIEW_STORAGE_KEY);
      if (v === "yearly" || v === "projections") {
        setTableView(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setTableViewPersisted = useCallback((next: MbTableView) => {
    setTableView(next);
    try {
      localStorage.setItem(MB_TABLE_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchYearlyAverages = useCallback(async () => {
    setYearlyError(null);
    setYearlyLoading(true);
    try {
      const res = await fetch("/api/monthly-balances/yearly-averages", {
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(j.message ?? "Could not load yearly averages");
      }
      const data = (await res.json()) as {
        rows?: YearlyAverageRow[];
        trendAndProjection?: TrendAndProjectionPayload | null;
      };
      setYearlyRows(Array.isArray(data.rows) ? data.rows : []);
      setProjectionPayload(data.trendAndProjection ?? null);
    } catch (e) {
      setYearlyError(
        e instanceof Error ? e.message : "Could not load yearly averages",
      );
      setYearlyRows([]);
      setProjectionPayload(null);
    } finally {
      setYearlyLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (
      loading ||
      (tableView !== "yearly" && tableView !== "projections")
    ) {
      return;
    }
    void fetchYearlyAverages();
  }, [
    loading,
    tableView,
    fetchYearlyAverages,
    monthRows,
    accounts,
    hiddenColumnIds,
  ]);

  useEffect(() => {
    const ids = new Set(accounts.map((a) => a.id));
    setHiddenColumnIds((prev) => {
      const next = prev.filter((id) => ids.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [accounts]);

  useEffect(() => {
    if (!hiddenColumnsLoadedFromServer) return;
    const save = async () => {
      try {
        const res = await fetch("/api/monthly-balances", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "setHiddenColumns",
            accountIds: hiddenColumnIds,
          }),
        });
        if (res.status === 401) {
          router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
          return;
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(j.message ?? "Could not save hidden columns");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save hidden columns",
        );
      }
    };
    void save();
  }, [hiddenColumnIds, hiddenColumnsLoadedFromServer, router]);

  const hideAccountColumn = useCallback((accountId: string) => {
    setHiddenColumnIds((prev) =>
      prev.includes(accountId) ? prev : [...prev, accountId],
    );
  }, []);

  const showAccountColumn = useCallback((accountId: string) => {
    setHiddenColumnIds((prev) => prev.filter((id) => id !== accountId));
  }, []);

  const showAllAccountColumns = useCallback(() => {
    setHiddenColumnIds([]);
  }, []);

  const setAccountColumnVisible = useCallback(
    (accountId: string, visible: boolean) => {
      if (visible) showAccountColumn(accountId);
      else hideAccountColumn(accountId);
    },
    [hideAccountColumn, showAccountColumn],
  );

  const openColumnsModal = useCallback(() => {
    window.setTimeout(() => {
      void import("bootstrap/js/dist/modal").then((mod) => {
        const Modal = mod.default;
        const el = columnVisibilityModalElRef.current;
        if (!el) return;
        columnVisibilityBsModalRef.current = Modal.getOrCreateInstance(el, {
          backdrop: true,
          keyboard: true,
        });
        columnVisibilityBsModalRef.current.show();
      });
    }, 0);
  }, []);

  const openDeleteMonthModal = useCallback(
    (monthKey: string) => {
      if (balanceCellsLocked) return;
      setDeleteMonthTargetKey(monthKey);
      setDeleteMonthConfirmInput("");
      window.setTimeout(() => {
        void import("bootstrap/js/dist/modal").then((mod) => {
          const Modal = mod.default;
          const el = deleteMonthModalElRef.current;
          if (!el) return;
          deleteMonthBsModalRef.current = Modal.getOrCreateInstance(el, {
            backdrop: "static",
            keyboard: false,
          });
          deleteMonthBsModalRef.current.show();
        });
      }, 0);
    },
    [balanceCellsLocked],
  );

  const deleteMonthConfirmPhrase = useMemo(
    () => (deleteMonthTargetKey ? formatMonthLabel(deleteMonthTargetKey) : ""),
    [deleteMonthTargetKey],
  );

  const deleteMonthConfirmValid =
    deleteMonthConfirmPhrase !== "" &&
    deleteMonthConfirmInput.trim() === deleteMonthConfirmPhrase;

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

  useEffect(() => {
    if (!accountDetailsTarget) {
      setAccountDetailsForm(null);
      setAccountDetailsArchivedConflict(null);
      return;
    }
    setAccountDetailsForm({
      name: accountDetailsTarget.name,
      kind: accountDetailsTarget.kind,
      accountType: accountDetailsTarget.accountType,
      currency: (accountDetailsTarget.currency ?? "USD").toUpperCase(),
      vestingDate: accountDetailsTarget.vestingDate?.trim(),
      annualGrowthPercent:
        typeof accountDetailsTarget.annualGrowthPercent === "number" &&
        Number.isFinite(accountDetailsTarget.annualGrowthPercent)
          ? String(accountDetailsTarget.annualGrowthPercent)
          : "",
      exemptFromNetWorth: Boolean(accountDetailsTarget.exemptFromNetWorth),
    });
    setAccountDetailsArchivedConflict(null);
  }, [accountDetailsTarget]);

  const accountDetailsTypeOptions =
    accountDetailsForm?.kind === "Asset"
      ? ASSET_ACCOUNT_TYPES
      : DEBT_ACCOUNT_TYPES;

  const accountDetailsDirty = useMemo(() => {
    if (!accountDetailsTarget || !accountDetailsForm) return false;
    const cur = accountDetailsForm;
    const orig = accountDetailsTarget;
    const curCur = (cur.currency ?? "").trim().toUpperCase();
    const origCur = (orig.currency ?? "USD").toUpperCase();
    const curVest = (cur.vestingDate ?? "").trim();
    const origVest = (orig.vestingDate ?? "").trim();
    const curGrowth = (cur.annualGrowthPercent ?? "").trim();
    const origGrowth =
      typeof orig.annualGrowthPercent === "number" &&
      Number.isFinite(orig.annualGrowthPercent)
        ? String(orig.annualGrowthPercent)
        : "";
    return (
      cur.name.trim() !== orig.name ||
      cur.kind !== orig.kind ||
      cur.accountType !== orig.accountType ||
      curCur !== origCur ||
      curVest !== origVest ||
      curGrowth !== origGrowth ||
      cur.exemptFromNetWorth !== Boolean(orig.exemptFromNetWorth)
    );
  }, [accountDetailsTarget, accountDetailsForm]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/monthly-balances", {
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not load balances");
      }
      const data = (await res.json()) as {
        accounts: Account[];
        monthRows: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      applySheetPayload(data);
      setEditingCellKey(null);
      setAccountDetailsTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load balances");
    } finally {
      setLoading(false);
    }
  }, [applySheetPayload, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
      return;
    }
    if (status === "authenticated") {
      void load();
    }
  }, [status, load, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = archiveModalElRef.current;
    if (!el) return;
    const onHidden = () => {
      setArchiveTarget(null);
      setArchiveConfirmInput("");
      setArchiving(false);
    };
    el.addEventListener("hidden.bs.modal", onHidden);
    return () => {
      el.removeEventListener("hidden.bs.modal", onHidden);
    };
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = accountInfoModalElRef.current;
    if (!el) return;
    const onHidden = () => {
      setAccountDetailsTarget(null);
    };
    el.addEventListener("hidden.bs.modal", onHidden);
    return () => {
      el.removeEventListener("hidden.bs.modal", onHidden);
    };
  }, [mounted]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = deleteMonthModalElRef.current;
    if (!el) return;
    const onHidden = () => {
      setDeleteMonthTargetKey(null);
      setDeleteMonthConfirmInput("");
      setDeletingMonth(false);
    };
    el.addEventListener("hidden.bs.modal", onHidden);
    return () => {
      el.removeEventListener("hidden.bs.modal", onHidden);
    };
  }, [mounted]);

  useEffect(() => {
    return () => {
      archiveBsModalRef.current?.dispose();
      archiveBsModalRef.current = null;
      accountInfoBsModalRef.current?.dispose();
      accountInfoBsModalRef.current = null;
      columnVisibilityBsModalRef.current?.dispose();
      columnVisibilityBsModalRef.current = null;
      deleteMonthBsModalRef.current?.dispose();
      deleteMonthBsModalRef.current = null;
    };
  }, []);

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

  /** Oldest → newest (within last 120 months, not past today). */
  const allMonthsAscending = useMemo(() => {
    const now = new Date();
    const opts: { value: string; label: string }[] = [];
    for (let i = 119; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = formatMonthKey(d);
      opts.push({ value: key, label: formatMonthLabel(key) });
    }
    return opts;
  }, []);

  const monthThroughOptions = useMemo(() => {
    if (!rangeFromKey) return allMonthsAscending;
    return allMonthsAscending.filter((o) => o.value >= rangeFromKey);
  }, [allMonthsAscending, rangeFromKey]);

  const newMonthsInSelectedRange = useMemo(() => {
    if (!rangeFromKey || !rangeThroughKey) return 0;
    const existing = new Set(monthRows.map((r) => r.monthKey));
    return monthKeysInclusiveRange(rangeFromKey, rangeThroughKey).filter(
      (k) => !existing.has(k),
    ).length;
  }, [rangeFromKey, rangeThroughKey, monthRows]);

  useEffect(() => {
    if (monthOptionsToAdd.length > 0 && !addMonthKey) {
      setAddMonthKey(monthOptionsToAdd[0].value);
    }
  }, [monthOptionsToAdd, addMonthKey]);

  useEffect(() => {
    if (!rangeFromKey || monthThroughOptions.length === 0) return;
    setRangeThroughKey((t) => {
      if (!t || t < rangeFromKey) return rangeFromKey;
      if (monthThroughOptions.some((o) => o.value === t)) return t;
      return monthThroughOptions[monthThroughOptions.length - 1].value;
    });
  }, [rangeFromKey, monthThroughOptions]);

  const flushSave = useCallback(
    async (
      monthKey: string,
      accountId: string,
      magnitude: number | null,
      saveSeq: number,
    ) => {
      const saveKey = makeCellBufferKey(monthKey, accountId);
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "setCell",
          monthKey,
          accountId,
          amount: magnitude,
        }),
      });
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Save failed");
      }
      const data = (await res.json()) as {
        accounts: Account[];
        monthRows: MonthRow[];
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      applySheetPayload(data);
      setSavingCellKeys((prev) => {
        if (prev[saveKey] !== saveSeq) return prev;
        const next = { ...prev };
        delete next[saveKey];
        return next;
      });
      setPendingSaveMagnitudes((prev) => {
        if (prev[saveKey]?.seq !== saveSeq) return prev;
        const next = { ...prev };
        delete next[saveKey];
        return next;
      });
    },
    [applySheetPayload, router],
  );

  const scheduleCellSave = useCallback(
    (monthKey: string, accountId: string, magnitude: number | null) => {
      const key = makeCellBufferKey(monthKey, accountId);
      const nextSeq = (saveSeqRef.current.get(key) ?? 0) + 1;
      saveSeqRef.current.set(key, nextSeq);
      setSavingCellKeys((prev) => ({ ...prev, [key]: nextSeq }));
      setPendingSaveMagnitudes((prev) => ({
        ...prev,
        [key]: { seq: nextSeq, magnitude },
      }));
      const prev = debouncers.current.get(key);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        debouncers.current.delete(key);
        void flushSave(monthKey, accountId, magnitude, nextSeq).catch((e) => {
          setError(e instanceof Error ? e.message : "Save failed");
          setSavingCellKeys((prev) => {
            if (prev[key] !== nextSeq) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setPendingSaveMagnitudes((prev) => {
            if (prev[key]?.seq !== nextSeq) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        });
      }, 450);
      debouncers.current.set(key, t);
    },
    [flushSave],
  );

  const handleToggleBalanceCellsLocked = useCallback(() => {
    setBalanceCellsLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MB_CELLS_LOCKED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /** Commit active cell edit when locking (same as input blur). */
  useEffect(() => {
    if (!balanceCellsLocked || !editingCellKey) return;
    const sep = editingCellKey.indexOf("::");
    if (sep <= 0) return;
    const monthKey = editingCellKey.slice(0, sep);
    const accountId = editingCellKey.slice(sep + 2);
    const account = accounts.find((x) => x.id === accountId);
    const row = monthRows.find((r) => r.monthKey === monthKey);
    const signed =
      typeof row?.balances?.[accountId] === "number" &&
      Number.isFinite(row.balances[accountId])
        ? row.balances[accountId]
        : undefined;
    const raw =
      buffers[editingCellKey] ??
      (account ? signedToDisplayMagnitude(account, signed) : "");
    const mag = parseInputToMagnitude(raw);
    const tkey = makeCellBufferKey(monthKey, accountId);
    const prevT = debouncers.current.get(tkey);
    if (prevT) window.clearTimeout(prevT);
    debouncers.current.delete(tkey);
    setBuffers((prev) => {
      const next = { ...prev };
      delete next[editingCellKey];
      return next;
    });
    setEditingCellKey(null);
    const nextSeq = (saveSeqRef.current.get(tkey) ?? 0) + 1;
    saveSeqRef.current.set(tkey, nextSeq);
    setSavingCellKeys((prev) => ({ ...prev, [tkey]: nextSeq }));
    setPendingSaveMagnitudes((prev) => ({
      ...prev,
      [tkey]: { seq: nextSeq, magnitude: mag },
    }));
    void flushSave(monthKey, accountId, mag, nextSeq).catch((err) => {
      setError(err instanceof Error ? err.message : "Save failed");
      setSavingCellKeys((prev) => {
        if (prev[tkey] !== nextSeq) return prev;
        const next = { ...prev };
        delete next[tkey];
        return next;
      });
      setPendingSaveMagnitudes((prev) => {
        if (prev[tkey]?.seq !== nextSeq) return prev;
        const next = { ...prev };
        delete next[tkey];
        return next;
      });
    });
  }, [
    balanceCellsLocked,
    editingCellKey,
    buffers,
    accounts,
    monthRows,
    flushSave,
  ]);

  useEffect(() => {
    if (!editingCellKey) return;
    const sep = editingCellKey.indexOf("::");
    if (sep <= 0) return;
    const monthKey = editingCellKey.slice(0, sep);
    const accountId = editingCellKey.slice(sep + 2);
    const inputId = `cell-${monthKey}-${accountId}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }, [editingCellKey]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setArchivedConflict(null);
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "addAccount",
          name,
          kind: newKind,
          accountType: newAccountType,
          currency: newCurrency,
          ...(isUnvestedRsuAsset(newKind, newAccountType)
            ? { vestingDate: newVestingDate }
            : {}),
          ...(isRealEstateAsset(newKind, newAccountType)
            ? { annualGrowthPercent: Number(newAnnualGrowthPercent) }
            : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        archivedAccountId?: string;
        accounts?: Account[];
        monthRows?: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (
        res.status === 409 &&
        j.code === "ARCHIVED_ACCOUNT_EXISTS" &&
        typeof j.archivedAccountId === "string"
      ) {
        setArchivedConflict({
          id: j.archivedAccountId,
          message:
            j.message ??
            `An archived account named "${name}" already exists. Restore it instead of creating a new one.`,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(j.message ?? "Could not add account");
      }
      if (!Array.isArray(j.accounts) || !Array.isArray(j.monthRows)) {
        throw new Error("Could not add account");
      }
      applySheetPayload(j);
      setNewName("");
      setNewKind("Asset");
      setNewAccountType(ASSET_ACCOUNT_TYPES[0]);
      setNewVestingDate(defaultUnvestedRsuVestingDateIso());
      setNewAnnualGrowthPercent("4");
      setNewCurrency("USD");
      setActionsPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add account");
    } finally {
      setAdding(false);
    }
  };

  const openArchiveModal = useCallback((account: Account) => {
    setArchiveTarget(account);
    setArchiveConfirmInput("");
    window.setTimeout(() => {
      void import("bootstrap/js/dist/modal").then((mod) => {
        const Modal = mod.default;
        const el = archiveModalElRef.current;
        if (!el) return;
        archiveBsModalRef.current = Modal.getOrCreateInstance(el, {
          backdrop: "static",
          keyboard: false,
        });
        archiveBsModalRef.current.show();
      });
    }, 0);
  }, []);

  const openAccountInfoModal = useCallback((account: Account) => {
    setAccountDetailsTarget(account);
    window.setTimeout(() => {
      void import("bootstrap/js/dist/modal").then((mod) => {
        const Modal = mod.default;
        const el = accountInfoModalElRef.current;
        if (!el) return;
        accountInfoBsModalRef.current = Modal.getOrCreateInstance(el, {
          backdrop: true,
          keyboard: true,
        });
        accountInfoBsModalRef.current.show();
      });
    }, 0);
  }, []);

  const handleArchiveFromAccountDetails = useCallback(() => {
    const a = accountDetailsTarget;
    if (!a) return;
    const el = accountInfoModalElRef.current;
    const runArchive = () => {
      openArchiveModal(a);
    };
    if (el && accountInfoBsModalRef.current) {
      el.addEventListener("hidden.bs.modal", runArchive, { once: true });
      accountInfoBsModalRef.current.hide();
      return;
    }
    setAccountDetailsTarget(null);
    runArchive();
  }, [accountDetailsTarget, openArchiveModal]);

  const handleSaveAccountDetails = async () => {
    if (!accountDetailsTarget || !accountDetailsForm) return;
    const name = accountDetailsForm.name.trim();
    if (!name) {
      setError("Account name is required.");
      return;
    }
    setSavingAccountDetails(true);
    setError(null);
    setAccountDetailsArchivedConflict(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "updateAccount",
          accountId: accountDetailsTarget.id,
          name,
          kind: accountDetailsForm.kind,
          accountType: accountDetailsForm.accountType,
          currency: accountDetailsForm.currency,
          ...(isUnvestedRsuAsset(
            accountDetailsForm.kind,
            accountDetailsForm.accountType,
          )
            ? { vestingDate: accountDetailsForm.vestingDate ?? "" }
            : {}),
          ...(isRealEstateAsset(
            accountDetailsForm.kind,
            accountDetailsForm.accountType,
          )
            ? {
                annualGrowthPercent: Number(
                  accountDetailsForm.annualGrowthPercent ?? "",
                ),
              }
            : {}),
          exemptFromNetWorth: accountDetailsForm.exemptFromNetWorth,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        archivedAccountId?: string;
        accounts?: Account[];
        monthRows?: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (
        res.status === 409 &&
        j.code === "ARCHIVED_ACCOUNT_EXISTS" &&
        typeof j.archivedAccountId === "string"
      ) {
        setAccountDetailsArchivedConflict({
          id: j.archivedAccountId,
          message:
            j.message ??
            `An archived account named "${name}" already exists. Restore it instead of renaming to this name.`,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(j.message ?? "Could not save account");
      }
      if (!Array.isArray(j.accounts) || !Array.isArray(j.monthRows)) {
        throw new Error("Could not save account");
      }
      applySheetPayload(j);
      const id = accountDetailsTarget.id;
      const updated = j.accounts.find((a) => a.id === id);
      if (updated) setAccountDetailsTarget(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save account");
    } finally {
      setSavingAccountDetails(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget || archiveConfirmInput !== ARCHIVE_CONFIRM_PHRASE)
      return;
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "removeAccount",
          accountId: archiveTarget.id,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        accounts?: Account[];
        monthRows?: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        throw new Error(j.message ?? "Could not archive account");
      }
      if (!Array.isArray(j.accounts) || !Array.isArray(j.monthRows)) {
        throw new Error("Could not archive account");
      }
      const id = archiveTarget.id;
      applySheetPayload(j);
      setBuffers((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (k.endsWith(`::${id}`)) delete next[k];
        }
        return next;
      });
      setEditingCellKey(null);
      archiveBsModalRef.current?.hide();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not archive account",
      );
    } finally {
      setArchiving(false);
    }
  };

  const handleRestoreArchivedAccount = async (accountId: string) => {
    setError(null);
    setRestoringArchived(true);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "restoreAccount", accountId }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        accounts?: Account[];
        monthRows?: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        throw new Error(j.message ?? "Could not restore account");
      }
      if (!Array.isArray(j.accounts) || !Array.isArray(j.monthRows)) {
        throw new Error("Could not restore account");
      }
      applySheetPayload(j);
      setArchivedConflict(null);
      setAccountDetailsArchivedConflict(null);
      setActionsPanel(null);
      setEditingCellKey(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore account",
      );
    } finally {
      setRestoringArchived(false);
    }
  };

  const handleConfirmDeleteMonth = async () => {
    if (!deleteMonthTargetKey || deletingMonth || !deleteMonthConfirmValid)
      return;
    const targetKey = deleteMonthTargetKey;
    setDeletingMonth(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "removeMonth", monthKey: targetKey }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        message?: string;
        accounts?: Account[];
        monthRows?: unknown;
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        throw new Error(j.message ?? "Could not delete month");
      }
      if (!Array.isArray(j.accounts) || !Array.isArray(j.monthRows)) {
        throw new Error("Could not delete month");
      }
      applySheetPayload(j);
      setBuffers((prev) => {
        const next = { ...prev };
        const prefix = `${targetKey}::`;
        for (const k of Object.keys(next)) {
          if (k.startsWith(prefix)) delete next[k];
        }
        return next;
      });
      setExpandedMobileMonthKey((prev) => (prev === targetKey ? null : prev));
      setEditingCellKey(null);
      deleteMonthBsModalRef.current?.hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete month");
    } finally {
      setDeletingMonth(false);
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "addMonth", monthKey: addMonthKey }),
      });
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (res.status === 409) {
        setError("That month is already in the table.");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not add month");
      }
      const data = (await res.json()) as {
        accounts: Account[];
        monthRows: MonthRow[];
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      applySheetPayload(data);
      setActionsPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add month");
    } finally {
      setAddingMonth(false);
    }
  };

  const handleAddMonthRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeFromKey || !rangeThroughKey) return;
    setAddingMonth(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly-balances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "addMonthRange",
          fromMonthKey: rangeFromKey,
          throughMonthKey: rangeThroughKey,
        }),
      });
      if (res.status === 401) {
        router.replace(MONTHLY_BALANCES_LOGIN_CALLBACK);
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Could not add months");
      }
      const data = (await res.json()) as {
        accounts: Account[];
        monthRows: MonthRow[];
        rates?: unknown;
        hiddenColumnIds?: unknown;
      };
      applySheetPayload(data);
      setActionsPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add months");
    } finally {
      setAddingMonth(false);
    }
  };

  const getSigned = (
    monthKey: string,
    accountId: string,
  ): number | undefined => {
    const row = monthRows.find((r) => r.monthKey === monthKey);
    const v = row?.balances?.[accountId];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  const netUsdBarChartPoints = useMemo((): NetUsdBarPoint[] => {
    const getSignedLocal = (
      monthKey: string,
      accountId: string,
    ): number | undefined => {
      const row = monthRows.find((r) => r.monthKey === monthKey);
      const v = row?.balances?.[accountId];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };
    const chronological = [...monthRows].sort((a, b) =>
      monthKeyCompareDesc(b.monthKey, a.monthKey),
    );
    return chronological.map((row) => {
      const summary = netSummaryForMonth(
        row.monthKey,
        visibleAccounts,
        getSignedLocal,
        usdRates,
      );
      const d = parseMonthKey(row.monthKey);
      const shortLabel =
        d?.toLocaleString(undefined, { month: "short", year: "2-digit" }) ??
        row.monthKey;
      if (summary.kind === "ok") {
        return {
          monthKey: row.monthKey,
          shortLabel,
          kind: "ok" as const,
          netUsd: summary.net,
        };
      }
      if (summary.kind === "empty") {
        return { monthKey: row.monthKey, shortLabel, kind: "empty" as const };
      }
      return { monthKey: row.monthKey, shortLabel, kind: "mixed" as const };
    });
  }, [monthRows, visibleAccounts, usdRates]);

  const isDesktopTable = useMediaMinMd();

  const renderAccountBalanceEditor = (monthKey: string, a: Account) => {
    const signed = getSigned(monthKey, a.id);
    const key = makeCellBufferKey(monthKey, a.id);
    const buffer = buffers[key];
    const display =
      buffer !== undefined ? buffer : signedToDisplayMagnitude(a, signed);
    const isSavingCell = savingCellKeys[key] !== undefined;
    const pendingForCell = pendingSaveMagnitudes[key];
    const usePendingDisplay =
      isSavingCell &&
      pendingForCell !== undefined &&
      pendingForCell.seq === savingCellKeys[key];
    const displayAmount = usePendingDisplay
      ? magnitudeToGroupedAmountDisplay(pendingForCell.magnitude)
      : signedToGroupedAmountDisplay(a, signed);
    const trendClassEditing = cellTrendToneClass(
      monthRows,
      monthKey,
      a,
      buffer,
      signed,
      getSigned,
    );
    const trendClassDisplay = cellTrendToneClass(
      monthRows,
      monthKey,
      a,
      undefined,
      signed,
      getSigned,
    );
    const trendClass =
      editingCellKey === key ? trendClassEditing : trendClassDisplay;
    const inputId = `cell-${monthKey}-${a.id}`;
    const displayText = displayAmount.trim() === "" ? "—" : displayAmount;
    if (balanceCellsLocked) {
      return (
        <span
          className={`monthly-balances-cell-display monthly-balances-cell-display--locked${
            trendClassDisplay ? ` ${trendClassDisplay}` : ""
          }`}
          aria-label={`${a.name} for ${formatMonthLabel(monthKey)}: ${displayAmount === "" || displayAmount.trim() === "" ? "empty" : displayAmount}. Editing locked.`}
        >
          {displayText}
        </span>
      );
    }
    if (editingCellKey === key) {
      return (
        <>
          <label className="visually-hidden" htmlFor={inputId}>
            {a.name} balance for {formatMonthLabel(monthKey)}
          </label>
          <input
            id={inputId}
            className={`form-control form-control-sm monthly-balances-cell-input text-end${trendClass ? ` ${trendClass}` : ""}`}
            inputMode="decimal"
            placeholder="—"
            value={display}
            onChange={(e) => {
              const v = e.target.value;
              setBuffers((prev) => ({ ...prev, [key]: v }));
              const mag = parseInputToMagnitude(v);
              scheduleCellSave(monthKey, a.id, mag);
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
              const tkey = makeCellBufferKey(monthKey, a.id);
              const nextSeq = (saveSeqRef.current.get(tkey) ?? 0) + 1;
              saveSeqRef.current.set(tkey, nextSeq);
              setSavingCellKeys((prev) => ({ ...prev, [tkey]: nextSeq }));
              setPendingSaveMagnitudes((prev) => ({
                ...prev,
                [tkey]: { seq: nextSeq, magnitude: mag },
              }));
              void flushSave(monthKey, a.id, mag, nextSeq).catch((err) => {
                setError(err instanceof Error ? err.message : "Save failed");
                setSavingCellKeys((prev) => {
                  if (prev[tkey] !== nextSeq) return prev;
                  const next = { ...prev };
                  delete next[tkey];
                  return next;
                });
                setPendingSaveMagnitudes((prev) => {
                  if (prev[tkey]?.seq !== nextSeq) return prev;
                  const next = { ...prev };
                  delete next[tkey];
                  return next;
                });
              });
              const prevT = debouncers.current.get(tkey);
              if (prevT) window.clearTimeout(prevT);
              debouncers.current.delete(tkey);
              setEditingCellKey(null);
            }}
          />
        </>
      );
    }
    return (
      <button
        type="button"
        className={`monthly-balances-cell-display${trendClass ? ` ${trendClass}` : ""}`}
        aria-label={`${a.name} for ${formatMonthLabel(monthKey)}: ${displayAmount === "" || displayAmount.trim() === "" ? "empty" : displayAmount}. Click to edit.`}
        onClick={() => setEditingCellKey(key)}
      >
        {displayText}
      </button>
    );
  };

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

      <section
        className="card glass-card mb-3 monthly-balances-page-heading"
        aria-label="Monthly Balances"
      >
        <div className="card-body monthly-balances-page-heading-body py-3 px-3 px-sm-4">
          <h2 className="h5 mb-0">Monthly Balances</h2>
        </div>
      </section>

      {loading ? (
        <div
          className="monthly-balances-sheet-loading card glass-card d-flex flex-column align-items-center justify-content-center gap-3 py-5 px-3 text-secondary mb-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{ minHeight: "12rem" }}
        >
          <span className="spinner-border" aria-hidden />
          <span className="small">Loading table…</span>
        </div>
      ) : (
        <>
            {accounts.length === 0 && monthRows.length === 0 ? (
              <p className="text-secondary small mb-3">
                The table is empty until you add a month and/or an account.
                Use <strong>Add new month</strong> or{" "}
                <strong>Add new account</strong> to begin.
              </p>
            ) : accounts.length === 0 && monthRows.length > 0 ? (
              <p className="text-secondary small mb-3">
                You have month rows. Use <strong>Add new account</strong> to add
                balance columns and enter amounts.
              </p>
            ) : null}

            <section
              className="monthly-balances-chart-view-section mb-3"
              aria-labelledby="mb-chart-view-heading"
            >
              <h3
                id="mb-chart-view-heading"
                className="monthly-balances-chart-view-section__subheading"
              >
                Charts
              </h3>
              <div
                className="btn-group monthly-balances-view-toggle flex-wrap"
                role="group"
                aria-label="Monthly sheet, year averages, or projections"
              >
                <button
                  type="button"
                  className={`btn btn-sm btn-outline-secondary ${tableView === "sheet" ? "active" : ""}`}
                  aria-pressed={tableView === "sheet"}
                  onClick={() => setTableViewPersisted("sheet")}
                >
                  <i className="bi bi-table me-1" aria-hidden />
                  Monthly sheet
                </button>
                <button
                  type="button"
                  className={`btn btn-sm btn-outline-secondary ${tableView === "yearly" ? "active" : ""}`}
                  aria-pressed={tableView === "yearly"}
                  onClick={() => setTableViewPersisted("yearly")}
                >
                  <i className="bi bi-calendar3 me-1" aria-hidden />
                  Year averages
                </button>
                <button
                  type="button"
                  className={`btn btn-sm btn-outline-secondary ${tableView === "projections" ? "active" : ""}`}
                  aria-pressed={tableView === "projections"}
                  onClick={() => setTableViewPersisted("projections")}
                >
                  <i className="bi bi-graph-up-arrow me-1" aria-hidden />
                  Projections
                </button>
              </div>

            {tableView === "sheet" ? (
              accounts.length === 0 && monthRows.length === 0 ? null : (
                <>
                  {accounts.length > 0 && visibleAccounts.length === 0 ? (
                    <div
                      className="alert alert-secondary glass-alert mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
                      role="status"
                    >
                      <span className="small mb-0">
                        All account columns are hidden. Use{" "}
                        <strong>Columns</strong> to show accounts again.
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm filter-apply-button text-nowrap"
                        onClick={() => openColumnsModal()}
                      >
                        Open Columns
                      </button>
                    </div>
                  ) : null}
                  {accounts.length > 0 &&
                  visibleAccounts.length > 0 &&
                  monthRows.length > 0 ? (
                    <section
                      className="monthly-balances-net-chart-section mb-3"
                      aria-labelledby="mb-net-usd-chart-heading"
                    >
                      <h2
                        id="mb-net-usd-chart-heading"
                        className="h6 fw-semibold mb-2 monthly-balances-net-chart-section__title"
                      >
                        Net (USD) by month
                      </h2>
                      <p className="small mb-2 mb-md-3">
                        Progress of your monthly Net (USD) total (same
                        calculation as the column below), with the earliest month
                        on the left.
                      </p>
                      <MonthlyNetUsdBarChart points={netUsdBarChartPoints} />
                    </section>
                  ) : null}
                </>
              )
            ) : tableView === "yearly" ? (
            <section
              className="monthly-balances-net-chart-section mb-4"
              aria-labelledby="mb-yearly-averages-heading"
            >
              <h2
                id="mb-yearly-averages-heading"
                className="h6 fw-semibold mb-2 monthly-balances-net-chart-section__title"
              >
                Average monthly Net (USD) by year
              </h2>
              <p className="small text-secondary mb-3 mb-lg-4">
                Mean of monthly Net (USD) for each calendar year. Uses the same
                Net rules as the monthly sheet (visible columns, exemptions, FX).
              </p>
              {yearlyLoading ? (
                <div
                  className="d-flex flex-column align-items-center justify-content-center gap-2 py-5 text-secondary"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span className="spinner-border spinner-border-sm" aria-hidden />
                  <span className="small">Loading yearly averages…</span>
                </div>
              ) : yearlyError ? (
                <div className="alert alert-danger glass-alert mb-0" role="alert">
                  {yearlyError}
                </div>
              ) : yearlyRows.length === 0 ? (
                <p className="text-secondary small mb-0">
                  No yearly averages yet. Add balances on the monthly sheet and
                  save; averages sync when the sheet updates or when you open this
                  page.
                </p>
              ) : (
                <YearlyNetUsdBarChart rows={yearlyRows} />
              )}
              {yearlyRows.length > 0 && !yearlyLoading && !yearlyError ? (
                <p className="small text-secondary monthly-balances-footnote mb-0 mt-3">
                  <i className="bi bi-info-circle me-1" aria-hidden />
                  Each bar is the arithmetic mean of monthly Net (USD) for that
                  calendar year (only months with a valid Net are counted). The
                  second line under each year is how many months were averaged.
                </p>
              ) : null}
            </section>
            ) : (
            <section
              className="monthly-balances-net-chart-section mb-4"
              aria-labelledby="mb-projections-heading"
            >
              <h2
                id="mb-projections-heading"
                className="h6 fw-semibold mb-2 monthly-balances-net-chart-section__title"
              >
                Net worth projections
              </h2>
              {yearlyLoading ? (
                <div
                  className="d-flex flex-column align-items-center justify-content-center gap-2 py-5 text-secondary"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span className="spinner-border spinner-border-sm" aria-hidden />
                  <span className="small">Loading projections…</span>
                </div>
              ) : yearlyError ? (
                <div className="alert alert-danger glass-alert mb-0" role="alert">
                  {yearlyError}
                </div>
              ) : (
                <NetWorthProjectionCharts projection={projectionPayload} />
              )}
            </section>
            )}
            </section>

            <section
            className="monthly-balances-toolbar monthly-balances-table-toolbar mb-3"
            aria-label="Balance table tools"
          >
            <div className="monthly-balances-toolbar-inner">
              <div className="mb-3">
                <div
                  className="monthly-balances-actions-bar"
                  role="tablist"
                  aria-label="Add account or month"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={actionsPanel === "account"}
                    aria-controls="mb-panel-add-account"
                    id="mb-tab-add-account"
                    className={`monthly-balances-action-btn ${actionsPanel === "account" ? "monthly-balances-action-btn--active" : ""}`}
                    onClick={() =>
                      setActionsPanel((p) =>
                        p === "account" ? null : "account",
                      )
                    }
                  >
                    <i
                      className="bi bi-wallet2 monthly-balances-action-btn__icon"
                      aria-hidden
                    />
                    <span className="monthly-balances-action-btn__label">
                      Add new account
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={actionsPanel === "month"}
                    aria-controls="mb-panel-add-month"
                    id="mb-tab-add-month"
                    className={`monthly-balances-action-btn ${actionsPanel === "month" ? "monthly-balances-action-btn--active" : ""}`}
                    onClick={() =>
                      setActionsPanel((p) => (p === "month" ? null : "month"))
                    }
                  >
                    <i
                      className="bi bi-calendar-plus monthly-balances-action-btn__icon"
                      aria-hidden
                    />
                    <span className="monthly-balances-action-btn__label">
                      Add new month
                    </span>
                  </button>
                </div>
              </div>

              <div className="monthly-balances-toolbar-quick row g-2 g-lg-3 align-items-lg-center mb-0">
                <div className="col-12 col-lg-5 col-xl-4">
                  <div className="monthly-balances-toolbar-cluster">
                    <span className="monthly-balances-toolbar-cluster-label">
                      Cells
                    </span>
                    <button
                      type="button"
                      className={`btn btn-sm ${balanceCellsLocked ? "btn-danger" : "btn-success"} monthly-balances-lock-btn monthly-balances-toolbar-btn-wide`}
                      onClick={handleToggleBalanceCellsLocked}
                      aria-pressed={balanceCellsLocked}
                      title={
                        balanceCellsLocked
                          ? "Unlock balance cells for editing"
                          : "Lock balance cells (read-only)"
                      }
                    >
                      <i
                        className={`bi ${balanceCellsLocked ? "bi-lock-fill" : "bi-unlock"} me-1`}
                        aria-hidden
                      />
                      {balanceCellsLocked ? "Locked" : "Edit"}
                    </button>
                  </div>
                </div>
                <div className="col-12 col-lg-7 col-xl-8">
                  <div className="monthly-balances-toolbar-cluster monthly-balances-toolbar-cluster--end">
                    <span className="monthly-balances-toolbar-cluster-label">
                      Data
                    </span>
                    <div className="monthly-balances-toolbar-data-btns d-flex flex-wrap gap-2 align-items-center">
                      <Link
                        href="/monthly-balances/upload"
                        className="btn btn-outline-secondary btn-sm monthly-balances-upload-btn"
                      >
                        <i
                          className="bi bi-file-earmark-arrow-up me-1"
                          aria-hidden
                        />
                        Upload from CSV
                      </Link>
                      {accounts.length > 0 ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => openColumnsModal()}
                          title="Show or hide account columns in the sheet"
                        >
                          <i
                            className="bi bi-layout-three-columns me-1"
                            aria-hidden
                          />
                          Columns
                          {hiddenAccountColumnCount > 0 ? (
                            <span className="badge text-bg-secondary ms-1">
                              {hiddenAccountColumnCount}
                            </span>
                          ) : null}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="monthly-balances-toolbar-expand">
                <div className="mb-0">
                  <div
                    id="mb-panel-add-account"
                    role="tabpanel"
                    aria-labelledby="mb-tab-add-account"
                    className={`collapse monthly-balances-action-panel ${actionsPanel === "account" ? "show" : ""}`}
                  >
                    <div className="accordion-body rounded-3 border mb-0">
                      <p className="small text-secondary mb-3">
                        Enter a friendly name, asset or debt, account type, and
                        the currency balances will use. Debt balances are stored
                        as negative amounts for net math; enter positive numbers
                        (for example the amount owed).
                      </p>
                      {archivedConflict ? (
                        <div
                          className="alert alert-warning glass-alert mb-3 d-flex flex-column flex-sm-row align-items-sm-center gap-2"
                          role="status"
                        >
                          <span className="flex-grow-1 small mb-0">
                            {archivedConflict.message}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm filter-apply-button text-nowrap"
                            disabled={restoringArchived}
                            onClick={() =>
                              void handleRestoreArchivedAccount(
                                archivedConflict.id,
                              )
                            }
                          >
                            {restoringArchived ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  aria-hidden
                                />
                                Restoring…
                              </>
                            ) : (
                              "Restore archived account"
                            )}
                          </button>
                        </div>
                      ) : null}
                      <form className="row g-3" onSubmit={handleAddAccount}>
                        <div className="col-md-4">
                          <label
                            htmlFor="mb-account-name"
                            className="form-label fw-semibold"
                          >
                            Account name
                          </label>
                          <input
                            id="mb-account-name"
                            className="form-control search-input-glass"
                            value={newName}
                            onChange={(e) => {
                              setNewName(e.target.value);
                              setArchivedConflict(null);
                            }}
                            placeholder="e.g. Main checking"
                            maxLength={120}
                            autoComplete="off"
                          />
                        </div>
                        <div className="col-md-4">
                          <label
                            htmlFor="mb-kind"
                            className="form-label fw-semibold"
                          >
                            Asset or debt
                          </label>
                          <select
                            id="mb-kind"
                            className="form-select glass-select"
                            value={newKind}
                            onChange={(e) =>
                              setNewKind(e.target.value as BalanceAccountKind)
                            }
                          >
                            <option value="Asset">Asset</option>
                            <option value="Debt">Debt</option>
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label
                            htmlFor="mb-account-type"
                            className="form-label fw-semibold"
                          >
                            Account type
                          </label>
                          <select
                            id="mb-account-type"
                            className="form-select glass-select"
                            value={newAccountType}
                            onChange={(e) => {
                              const v = e.target.value;
                              setNewAccountType(v);
                              if (newKind === "Asset" && v === "Unvested RSU") {
                                setNewVestingDate(
                                  defaultUnvestedRsuVestingDateIso(),
                                );
                              }
                              if (newKind === "Asset" && v === "Real Estate") {
                                setNewAnnualGrowthPercent((prev) =>
                                  prev.trim() !== "" ? prev : "4",
                                );
                              }
                            }}
                          >
                            {typeOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        {newKind === "Asset" &&
                        newAccountType === "Unvested RSU" ? (
                          <div className="col-md-4">
                            <label
                              htmlFor="mb-rsu-vesting"
                              className="form-label fw-semibold"
                            >
                              Vesting date
                            </label>
                            <input
                              id="mb-rsu-vesting"
                              type="date"
                              className="form-control search-input-glass"
                              value={newVestingDate}
                              onChange={(e) =>
                                setNewVestingDate(e.target.value)
                              }
                              disabled={adding}
                            />
                          </div>
                        ) : null}
                        {newKind === "Asset" &&
                        newAccountType === "Real Estate" ? (
                          <div className="col-md-4">
                            <label
                              htmlFor="mb-real-estate-growth"
                              className="form-label fw-semibold"
                            >
                              Annual Growth (%)
                            </label>
                            <input
                              id="mb-real-estate-growth"
                              type="number"
                              inputMode="decimal"
                              min={-99}
                              max={100}
                              step="0.01"
                              className="form-control search-input-glass"
                              value={newAnnualGrowthPercent}
                              onChange={(e) =>
                                setNewAnnualGrowthPercent(e.target.value)
                              }
                              disabled={adding}
                            />
                          </div>
                        ) : null}
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
                            disabled={
                              adding ||
                              !newName.trim() ||
                              (isUnvestedRsuAsset(newKind, newAccountType) &&
                                !newVestingDate.trim()) ||
                              (isRealEstateAsset(newKind, newAccountType) &&
                                newAnnualGrowthPercent.trim() === "")
                            }
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
                    id="mb-panel-add-month"
                    role="tabpanel"
                    aria-labelledby="mb-tab-add-month"
                    className={`collapse monthly-balances-action-panel ${actionsPanel === "month" ? "show" : ""}`}
                  >
                    <div className="accordion-body rounded-3 border mb-0">
                      <p className="small text-secondary mb-3">
                        Add one month at a time, or add every month in a range
                        (skipping months already in the table). You can add
                        months before accounts; balance columns appear after
                        your first account.
                      </p>
                      <fieldset className="mb-3">
                        <legend className="form-label fw-semibold small mb-2">
                          How to add
                        </legend>
                        <div className="d-flex flex-wrap gap-3">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="mb-add-month-mode"
                              id="mb-add-month-mode-single"
                              checked={addMonthMode === "single"}
                              onChange={() => setAddMonthMode("single")}
                            />
                            <label
                              className="form-check-label"
                              htmlFor="mb-add-month-mode-single"
                            >
                              Single month
                            </label>
                          </div>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="mb-add-month-mode"
                              id="mb-add-month-mode-range"
                              checked={addMonthMode === "range"}
                              onChange={() => setAddMonthMode("range")}
                            />
                            <label
                              className="form-check-label"
                              htmlFor="mb-add-month-mode-range"
                            >
                              Month range
                            </label>
                          </div>
                        </div>
                      </fieldset>

                      {addMonthMode === "single" ? (
                        <form
                          className="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-end"
                          onSubmit={handleAddMonth}
                        >
                          <div
                            className="flex-grow-1"
                            style={{ minWidth: "12rem" }}
                          >
                            <label
                              htmlFor="mb-add-month"
                              className="form-label fw-semibold small mb-1"
                            >
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
                                <option value="">
                                  All available months are already in the table
                                </option>
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
                            disabled={
                              addingMonth || monthOptionsToAdd.length === 0
                            }
                          >
                            {addingMonth ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  aria-hidden
                                />
                                Adding…
                              </>
                            ) : (
                              <>
                                <i
                                  className="bi bi-calendar-check me-1"
                                  aria-hidden
                                />
                                Add month to table
                              </>
                            )}
                          </button>
                        </form>
                      ) : (
                        <form
                          className="d-flex flex-column gap-3"
                          onSubmit={handleAddMonthRange}
                        >
                          <div className="row g-3 align-items-end">
                            <div className="col-12 col-sm-6">
                              <label
                                htmlFor="mb-range-from"
                                className="form-label fw-semibold small mb-1"
                              >
                                From month
                              </label>
                              <select
                                id="mb-range-from"
                                className="form-select glass-select"
                                value={rangeFromKey}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setRangeFromKey(v);
                                  setRangeThroughKey((t) => (t < v ? v : t));
                                }}
                                disabled={allMonthsAscending.length === 0}
                              >
                                {allMonthsAscending.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-12 col-sm-6">
                              <label
                                htmlFor="mb-range-through"
                                className="form-label fw-semibold small mb-1"
                              >
                                Through month
                              </label>
                              <select
                                id="mb-range-through"
                                className="form-select glass-select"
                                value={rangeThroughKey}
                                onChange={(e) =>
                                  setRangeThroughKey(e.target.value)
                                }
                                disabled={monthThroughOptions.length === 0}
                              >
                                {monthThroughOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <p className="small text-secondary mb-0">
                            {newMonthsInSelectedRange === 0
                              ? "Every month in this range is already in the table. Change the range or use Single month."
                              : `${newMonthsInSelectedRange} new month row${newMonthsInSelectedRange === 1 ? "" : "s"} will be added (existing months in the range are skipped).`}
                          </p>
                          <div>
                            <button
                              type="submit"
                              className="btn filter-apply-button"
                              disabled={
                                addingMonth || newMonthsInSelectedRange === 0
                              }
                            >
                              {addingMonth ? (
                                <>
                                  <span
                                    className="spinner-border spinner-border-sm me-2"
                                    aria-hidden
                                  />
                                  Adding…
                                </>
                              ) : (
                                <>
                                  <i
                                    className="bi bi-calendar-range me-1"
                                    aria-hidden
                                  />
                                  Add months in range
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

            {accounts.length === 0 && monthRows.length === 0 ? null : (
            <>
              {tableView !== "sheet" &&
              accounts.length > 0 &&
              visibleAccounts.length === 0 ? (
                <div
                  className="alert alert-secondary glass-alert mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
                  role="status"
                >
                  <span className="small mb-0">
                    All account columns are hidden. Use <strong>Columns</strong>{" "}
                    to show accounts again.
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm filter-apply-button text-nowrap"
                    onClick={() => openColumnsModal()}
                  >
                    Open Columns
                  </button>
                </div>
              ) : null}
              {isDesktopTable ? (
                <div
                  className="monthly-balances-table-viewport mb-4"
                  role="region"
                  aria-label="Monthly balance sheet"
                >
                  <table className="table monthly-balances-table mb-0">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="monthly-balances-sticky-col monthly-balances-corner-th"
                        >
                          Month
                        </th>
                        {visibleAccounts.map((a) => (
                          <th
                            key={a.id}
                            scope="col"
                            className="text-center monthly-balances-account-col"
                          >
                            <div className="monthly-balances-account-head">
                              <div className="monthly-balances-account-title-wrap">
                                <span className="monthly-balances-account-name">
                                  {a.name}
                                </span>
                                <span className="monthly-balances-account-currency-pill">
                                  {a.currency}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-link p-0 monthly-balances-account-info-btn"
                                onClick={() => openAccountInfoModal(a)}
                                aria-label={`Account details for ${a.name}`}
                                title="Account details"
                              >
                                <i className="bi bi-info-circle" aria-hidden />
                              </button>
                            </div>
                          </th>
                        ))}
                        {accounts.length > 0 ? (
                          <th
                            scope="col"
                            className="text-end monthly-balances-net-col monthly-balances-corner-th"
                            title="Sum of visible account amounts converted to US dollars using stored FX rates. Hidden columns, and accounts marked exempt from net worth, are excluded."
                          >
                            Net (USD)
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((row) => {
                        const summary = netSummaryForMonth(
                          row.monthKey,
                          visibleAccounts,
                          getSigned,
                          usdRates,
                        );
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
                              <div className="d-flex align-items-center justify-content-between gap-2">
                                <span className="flex-grow-1">
                                  {formatMonthLabel(row.monthKey)}
                                </span>
                                {!balanceCellsLocked ? (
                                  <button
                                    type="button"
                                    className="btn btn-link btn-sm p-0 text-danger flex-shrink-0"
                                    onClick={() =>
                                      openDeleteMonthModal(row.monthKey)
                                    }
                                    aria-label={`Delete month row ${formatMonthLabel(row.monthKey)}`}
                                    title="Delete month row"
                                  >
                                    <i className="bi bi-trash" aria-hidden />
                                  </button>
                                ) : null}
                              </div>
                            </th>
                            {visibleAccounts.map((a) => (
                              <td
                                key={a.id}
                                className="align-middle text-center monthly-balances-account-col"
                              >
                                {renderAccountBalanceEditor(row.monthKey, a)}
                              </td>
                            ))}
                            {accounts.length > 0 ? (
                              <td
                                className={`text-end fw-semibold monthly-balances-net-col monthly-balances-net-cell ${netClass}`}
                                title={
                                  summary.kind === "mixed"
                                    ? "Net is in USD using stored FX rates. A rate is missing or invalid for at least one visible account currency in this row."
                                    : summary.kind === "ok"
                                      ? "Net is the sum of entered amounts for visible columns converted to USD. Hidden columns and accounts exempt from net worth are excluded."
                                      : undefined
                                }
                              >
                                {netText}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <section className="mb-4" aria-label="Balances by month">
                  <div className="monthly-balances-mobile-stack" role="list">
                    {monthRows.map((row) => {
                      const summary = netSummaryForMonth(
                        row.monthKey,
                        visibleAccounts,
                        getSigned,
                        usdRates,
                      );
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
                        <article
                          key={row.monthKey}
                          className="monthly-balances-month-card"
                          role="listitem"
                        >
                          <div className="d-flex align-items-stretch gap-1 monthly-balances-month-card__header-row">
                            <button
                              type="button"
                              className="monthly-balances-month-card__header monthly-balances-month-card__toggle flex-grow-1 min-w-0"
                              onClick={() =>
                                setExpandedMobileMonthKey((prev) =>
                                  prev === row.monthKey ? null : row.monthKey,
                                )
                              }
                              aria-expanded={
                                expandedMobileMonthKey === row.monthKey
                              }
                              aria-controls={`mb-mobile-month-body-${row.monthKey}`}
                            >
                              <h3 className="monthly-balances-month-card__title">
                                {formatMonthLabel(row.monthKey)}
                              </h3>
                              {accounts.length > 0 ? (
                                <div
                                  className={`monthly-balances-month-card__net ${netClass}`}
                                  title={
                                    summary.kind === "mixed"
                                      ? "Net is in USD using stored FX rates. A rate is missing or invalid for at least one visible account currency in this row."
                                      : summary.kind === "ok"
                                        ? "Net is the sum of entered amounts for visible columns converted to USD. Hidden columns and accounts exempt from net worth are excluded."
                                        : undefined
                                  }
                                >
                                  <span className="monthly-balances-month-card__net-label">
                                    Net (USD)
                                  </span>
                                  <span className="monthly-balances-month-card__net-value">
                                    {netText}
                                  </span>
                                </div>
                              ) : null}
                              <i
                                className={`bi ${expandedMobileMonthKey === row.monthKey ? "bi-chevron-up" : "bi-chevron-down"} monthly-balances-month-card__chevron`}
                                aria-hidden
                              />
                            </button>
                            {!balanceCellsLocked ? (
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm align-self-stretch monthly-balances-month-delete-btn flex-shrink-0 px-2"
                                onClick={() =>
                                  openDeleteMonthModal(row.monthKey)
                                }
                                aria-label={`Delete month ${formatMonthLabel(row.monthKey)}`}
                                title="Delete month row"
                              >
                                <i className="bi bi-trash" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          {expandedMobileMonthKey === row.monthKey ? (
                            accounts.length > 0 ? (
                              <div
                                id={`mb-mobile-month-body-${row.monthKey}`}
                                className="monthly-balances-month-card__body"
                              >
                                {visibleAccounts.map((a) => (
                                  <div
                                    key={a.id}
                                    className="monthly-balances-mobile-account-row"
                                  >
                                    <div className="monthly-balances-mobile-account-row__info">
                                      <div className="monthly-balances-mobile-account-row__name-line">
                                        <span className="monthly-balances-mobile-account-name">
                                          {a.name}
                                        </span>
                                        <button
                                          type="button"
                                          className="btn btn-link p-0 monthly-balances-account-info-btn"
                                          onClick={() =>
                                            openAccountInfoModal(a)
                                          }
                                          aria-label={`Account details for ${a.name}`}
                                          title="Account details"
                                        >
                                          <i
                                            className="bi bi-info-circle"
                                            aria-hidden
                                          />
                                        </button>
                                      </div>
                                      <span className="monthly-balances-mobile-currency-pill">
                                        {a.currency}
                                      </span>
                                    </div>
                                    <div className="monthly-balances-mobile-account-row__value">
                                      {renderAccountBalanceEditor(
                                        row.monthKey,
                                        a,
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p
                                id={`mb-mobile-month-body-${row.monthKey}`}
                                className="small text-secondary mb-0 monthly-balances-month-card__empty"
                              >
                                Add an account to enter balances for this month.
                              </p>
                            )
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
              {accounts.length > 0 ? (
                <p className="small text-secondary monthly-balances-footnote mb-0">
                  <i className="bi bi-info-circle me-1" aria-hidden />
                  <strong>Net</strong> is in <strong>USD</strong>, converting
                  each cell from its account currency using stored rates. Rates
                  refresh when you sign in and when this sheet loads or updates
                  if a currency’s rate is missing or older than 24 hours. Debts
                  count as negative in the sum. Accounts marked exempt from net
                  worth in Account details are omitted from Net, as are balances
                  in columns you hide via <strong>Columns</strong>. If a rate is
                  unavailable for a currency in a row, Net shows an em dash.
                </p>
              ) : (
                <p className="small text-secondary monthly-balances-footnote mb-0">
                  <i className="bi bi-info-circle me-1" aria-hidden />
                  Net and balance cells appear after you add your first account.
                </p>
              )}
              {monthRows.length > 0 ? (
                <p className="small text-secondary monthly-balances-footnote mb-0 mt-2">
                  <i className="bi bi-info-circle me-1" aria-hidden />
                  To <strong>delete a month row</strong>, choose{" "}
                  <strong>Edit</strong> (not <strong>Locked</strong>), then use
                  the trash icon on that row. You must confirm by typing the
                  month label exactly as shown (for example “May 2026”).
                </p>
              ) : null}
            </>
            )}
        </>
      )}

      {mounted && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                ref={archiveModalElRef}
                className="modal fade"
                id={MB_ARCHIVE_ACCOUNT_MODAL_ID}
                tabIndex={-1}
                aria-labelledby={`${MB_ARCHIVE_ACCOUNT_MODAL_ID}-label`}
                aria-hidden="true"
              >
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content score-breakdown-modal">
                    <div className="modal-header">
                      <h5
                        className="modal-title"
                        id={`${MB_ARCHIVE_ACCOUNT_MODAL_ID}-label`}
                      >
                        Archive account?
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        data-bs-dismiss="modal"
                        aria-label="Close"
                      />
                    </div>
                    <div className="modal-body">
                      {archiveTarget ? (
                        <>
                          <p className="mb-3">
                            <strong>{archiveTarget.name}</strong> will be hidden
                            from this table. Balances stay in your data and
                            reappear if you restore this account later.
                          </p>
                          <p className="small text-secondary mb-2">
                            To confirm, type{" "}
                            <strong>{ARCHIVE_CONFIRM_PHRASE}</strong> (case
                            sensitive) in the box below.
                          </p>
                          <label
                            htmlFor="mb-archive-confirm-input"
                            className="form-label fw-semibold"
                          >
                            Confirmation
                          </label>
                          <input
                            id="mb-archive-confirm-input"
                            className="form-control search-input-glass"
                            autoComplete="off"
                            value={archiveConfirmInput}
                            onChange={(e) =>
                              setArchiveConfirmInput(e.target.value)
                            }
                            placeholder={ARCHIVE_CONFIRM_PHRASE}
                            disabled={archiving}
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn glass-btn glass-btn-secondary"
                        data-bs-dismiss="modal"
                        disabled={archiving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn glass-btn glass-btn-primary"
                        disabled={
                          archiving ||
                          archiveConfirmInput !== ARCHIVE_CONFIRM_PHRASE ||
                          !archiveTarget
                        }
                        onClick={() => void handleConfirmArchive()}
                      >
                        {archiving ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              aria-hidden
                            />
                            Archiving…
                          </>
                        ) : (
                          "Archive account"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={accountInfoModalElRef}
                className="modal fade"
                id={MB_ACCOUNT_INFO_MODAL_ID}
                tabIndex={-1}
                aria-labelledby={`${MB_ACCOUNT_INFO_MODAL_ID}-label`}
                aria-hidden="true"
              >
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content score-breakdown-modal">
                    <div className="modal-header">
                      <h5
                        className="modal-title"
                        id={`${MB_ACCOUNT_INFO_MODAL_ID}-label`}
                      >
                        Account details
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        data-bs-dismiss="modal"
                        aria-label="Close"
                      />
                    </div>
                    <div className="modal-body">
                      {accountDetailsTarget && accountDetailsForm ? (
                        <>
                          {accountDetailsArchivedConflict ? (
                            <div
                              className="alert alert-warning glass-alert mb-3 d-flex flex-column flex-sm-row align-items-sm-center gap-2"
                              role="status"
                            >
                              <span className="flex-grow-1 small mb-0">
                                {accountDetailsArchivedConflict.message}
                              </span>
                              <button
                                type="button"
                                className="btn btn-sm filter-apply-button text-nowrap"
                                disabled={restoringArchived}
                                onClick={() =>
                                  void handleRestoreArchivedAccount(
                                    accountDetailsArchivedConflict.id,
                                  )
                                }
                              >
                                {restoringArchived ? (
                                  <>
                                    <span
                                      className="spinner-border spinner-border-sm me-2"
                                      aria-hidden
                                    />
                                    Restoring…
                                  </>
                                ) : (
                                  "Restore archived account"
                                )}
                              </button>
                            </div>
                          ) : null}
                          <div className="row g-3">
                            <div className="col-12">
                              <label
                                htmlFor="mb-info-account-name"
                                className="form-label fw-semibold small mb-1"
                              >
                                Account name
                              </label>
                              <input
                                id="mb-info-account-name"
                                className="form-control search-input-glass form-control-sm"
                                value={accountDetailsForm.name}
                                onChange={(e) => {
                                  setAccountDetailsArchivedConflict(null);
                                  setAccountDetailsForm((prev) =>
                                    prev
                                      ? { ...prev, name: e.target.value }
                                      : prev,
                                  );
                                }}
                                maxLength={120}
                                autoComplete="off"
                                disabled={savingAccountDetails}
                              />
                            </div>
                            <div className="col-12 col-sm-6">
                              <label
                                htmlFor="mb-info-kind"
                                className="form-label fw-semibold small mb-1"
                              >
                                Asset or debt
                              </label>
                              <select
                                id="mb-info-kind"
                                className="form-select glass-select form-select-sm"
                                value={accountDetailsForm.kind}
                                onChange={(e) => {
                                  const kind = e.target
                                    .value as BalanceAccountKind;
                                  setAccountDetailsArchivedConflict(null);
                                  setAccountDetailsForm((prev) => {
                                    if (!prev) return prev;
                                    const accountType =
                                      kind === "Asset"
                                        ? (
                                            ASSET_ACCOUNT_TYPES as readonly string[]
                                          ).includes(prev.accountType)
                                          ? prev.accountType
                                          : ASSET_ACCOUNT_TYPES[0]
                                        : (
                                              DEBT_ACCOUNT_TYPES as readonly string[]
                                            ).includes(prev.accountType)
                                          ? prev.accountType
                                          : DEBT_ACCOUNT_TYPES[0];
                                    const vestingDate = isUnvestedRsuAsset(
                                      kind,
                                      accountType,
                                    )
                                      ? prev.vestingDate?.trim() ||
                                        defaultUnvestedRsuVestingDateIso()
                                      : undefined;
                                    const annualGrowthPercent =
                                      isRealEstateAsset(kind, accountType)
                                        ? prev.annualGrowthPercent?.trim() ||
                                          "4"
                                        : undefined;
                                    return {
                                      ...prev,
                                      kind,
                                      accountType,
                                      vestingDate,
                                      annualGrowthPercent,
                                    };
                                  });
                                }}
                                disabled={savingAccountDetails}
                              >
                                <option value="Asset">Asset</option>
                                <option value="Debt">Debt</option>
                              </select>
                            </div>
                            <div className="col-12 col-sm-6">
                              <label
                                htmlFor="mb-info-account-type"
                                className="form-label fw-semibold small mb-1"
                              >
                                Account type
                              </label>
                              <select
                                id="mb-info-account-type"
                                className="form-select glass-select form-select-sm"
                                value={accountDetailsForm.accountType}
                                onChange={(e) => {
                                  const accountType = e.target.value;
                                  setAccountDetailsArchivedConflict(null);
                                  setAccountDetailsForm((prev) => {
                                    if (!prev) return prev;
                                    const vestingDate = isUnvestedRsuAsset(
                                      prev.kind,
                                      accountType,
                                    )
                                      ? prev.vestingDate?.trim() ||
                                        defaultUnvestedRsuVestingDateIso()
                                      : undefined;
                                    const annualGrowthPercent =
                                      isRealEstateAsset(prev.kind, accountType)
                                        ? prev.annualGrowthPercent?.trim() ||
                                          "4"
                                        : undefined;
                                    return {
                                      ...prev,
                                      accountType,
                                      vestingDate,
                                      annualGrowthPercent,
                                    };
                                  });
                                }}
                                disabled={savingAccountDetails}
                              >
                                {accountDetailsTypeOptions.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {accountDetailsForm.kind === "Asset" &&
                            accountDetailsForm.accountType ===
                              "Unvested RSU" ? (
                              <div className="col-12">
                                <label
                                  htmlFor="mb-info-rsu-vesting"
                                  className="form-label fw-semibold small mb-1"
                                >
                                  Vesting date
                                </label>
                                <input
                                  id="mb-info-rsu-vesting"
                                  type="date"
                                  className="form-control search-input-glass form-control-sm"
                                  value={accountDetailsForm.vestingDate ?? ""}
                                  onChange={(e) => {
                                    setAccountDetailsArchivedConflict(null);
                                    setAccountDetailsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            vestingDate: e.target.value,
                                          }
                                        : prev,
                                    );
                                  }}
                                  disabled={savingAccountDetails}
                                />
                              </div>
                            ) : null}
                            {accountDetailsForm.kind === "Asset" &&
                            accountDetailsForm.accountType === "Real Estate" ? (
                              <div className="col-12">
                                <label
                                  htmlFor="mb-info-real-estate-growth"
                                  className="form-label fw-semibold small mb-1"
                                >
                                  Annual Growth (%)
                                </label>
                                <input
                                  id="mb-info-real-estate-growth"
                                  type="number"
                                  inputMode="decimal"
                                  min={-99}
                                  max={100}
                                  step="0.01"
                                  className="form-control search-input-glass form-control-sm"
                                  value={
                                    accountDetailsForm.annualGrowthPercent ?? ""
                                  }
                                  onChange={(e) => {
                                    setAccountDetailsArchivedConflict(null);
                                    setAccountDetailsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            annualGrowthPercent: e.target.value,
                                          }
                                        : prev,
                                    );
                                  }}
                                  disabled={savingAccountDetails}
                                />
                              </div>
                            ) : null}
                            <div className="col-12">
                              <CurrencySearchCombobox
                                id="mb-info-currency-combobox"
                                value={accountDetailsForm.currency}
                                onChange={(c) => {
                                  setAccountDetailsArchivedConflict(null);
                                  setAccountDetailsForm((prev) =>
                                    prev ? { ...prev, currency: c } : prev,
                                  );
                                }}
                                disabled={savingAccountDetails}
                              />
                            </div>
                          </div>
                          <div className="row g-2 mt-2">
                            <div className="col-12">
                              <div className="form-check d-flex align-items-start gap-2 mb-0">
                                <input
                                  className="form-check-input mt-1"
                                  type="checkbox"
                                  id="mb-info-exempt-net-worth"
                                  checked={
                                    accountDetailsForm.exemptFromNetWorth
                                  }
                                  onChange={(e) => {
                                    setAccountDetailsArchivedConflict(null);
                                    setAccountDetailsForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            exemptFromNetWorth:
                                              e.target.checked,
                                          }
                                        : prev,
                                    );
                                  }}
                                  disabled={savingAccountDetails}
                                />
                                <label
                                  className="form-check-label small fw-semibold mb-0"
                                  htmlFor="mb-info-exempt-net-worth"
                                >
                                  Exempt from Net Worth
                                </label>
                              </div>
                              <p className="small text-secondary mb-0 mt-1 ms-4">
                                When checked, this account’s balances are
                                omitted from each month’s{" "}
                                <strong>Net (USD)</strong> total (balances still
                                appear in the grid).
                              </p>
                            </div>
                            <div className="col-12">
                              <div className="form-check d-flex align-items-start gap-2 mb-0">
                                <input
                                  className="form-check-input mt-1"
                                  type="checkbox"
                                  id="mb-info-hide-column"
                                  checked={hiddenColumnIdSet.has(
                                    accountDetailsTarget.id,
                                  )}
                                  onChange={(e) =>
                                    setAccountColumnVisible(
                                      accountDetailsTarget.id,
                                      !e.target.checked,
                                    )
                                  }
                                  disabled={savingAccountDetails}
                                />
                                <label
                                  className="form-check-label small fw-semibold mb-0"
                                  htmlFor="mb-info-hide-column"
                                >
                                  Hide this account column
                                </label>
                              </div>
                              <p className="small text-secondary mb-0 mt-1 ms-4">
                                Hides this account from the desktop and mobile
                                table until you show it again in{" "}
                                <strong>Columns</strong>.
                              </p>
                            </div>
                          </div>
                          {accountDetailsForm.kind === "Debt" ? (
                            <p className="small text-secondary mt-3 mb-0">
                              Debt balances are stored as negative amounts for
                              net totals; enter positive numbers in cells for
                              the amount owed.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn glass-btn glass-btn-secondary"
                        data-bs-dismiss="modal"
                        disabled={savingAccountDetails}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm filter-clear-button"
                        disabled={!accountDetailsTarget || savingAccountDetails}
                        aria-label="Archive account"
                        onClick={() => {
                          handleArchiveFromAccountDetails();
                        }}
                      >
                        <i className="bi bi-trash me-1" aria-hidden />
                        Archive
                      </button>
                      {accountDetailsDirty ? (
                        <button
                          type="button"
                          className="btn glass-btn glass-btn-primary"
                          disabled={
                            savingAccountDetails ||
                            !accountDetailsForm?.name.trim() ||
                            (accountDetailsForm != null &&
                              isUnvestedRsuAsset(
                                accountDetailsForm.kind,
                                accountDetailsForm.accountType,
                              ) &&
                              !(accountDetailsForm.vestingDate ?? "").trim()) ||
                            (accountDetailsForm != null &&
                              isRealEstateAsset(
                                accountDetailsForm.kind,
                                accountDetailsForm.accountType,
                              ) &&
                              !(
                                accountDetailsForm.annualGrowthPercent ?? ""
                              ).trim())
                          }
                          onClick={() => void handleSaveAccountDetails()}
                        >
                          {savingAccountDetails ? (
                            <>
                              <span
                                className="spinner-border spinner-border-sm me-2"
                                aria-hidden
                              />
                              Saving…
                            </>
                          ) : (
                            "Save"
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={deleteMonthModalElRef}
                className="modal fade"
                id={MB_DELETE_MONTH_MODAL_ID}
                tabIndex={-1}
                aria-labelledby={`${MB_DELETE_MONTH_MODAL_ID}-label`}
                aria-hidden="true"
              >
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content score-breakdown-modal">
                    <div className="modal-header">
                      <h5
                        className="modal-title"
                        id={`${MB_DELETE_MONTH_MODAL_ID}-label`}
                      >
                        Delete month row?
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        data-bs-dismiss="modal"
                        aria-label="Close"
                        disabled={deletingMonth}
                      />
                    </div>
                    <div className="modal-body">
                      {deleteMonthTargetKey ? (
                        <>
                          <p className="mb-3">
                            This removes the{" "}
                            <strong>
                              {formatMonthLabel(deleteMonthTargetKey)}
                            </strong>{" "}
                            row and all balance values stored for that month.
                            This cannot be undone.
                          </p>
                          <p className="small text-secondary mb-2">
                            To confirm, type the month label exactly as shown in
                            the table (e.g.{" "}
                            <strong>{deleteMonthConfirmPhrase}</strong>).
                          </p>
                          <label
                            htmlFor="mb-delete-month-confirm-input"
                            className="form-label fw-semibold"
                          >
                            Month year
                          </label>
                          <input
                            id="mb-delete-month-confirm-input"
                            className="form-control search-input-glass"
                            autoComplete="off"
                            value={deleteMonthConfirmInput}
                            onChange={(e) =>
                              setDeleteMonthConfirmInput(e.target.value)
                            }
                            placeholder={deleteMonthConfirmPhrase}
                            disabled={deletingMonth}
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn glass-btn glass-btn-secondary"
                        data-bs-dismiss="modal"
                        disabled={deletingMonth}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={
                          !deleteMonthConfirmValid ||
                          deletingMonth ||
                          !deleteMonthTargetKey
                        }
                        onClick={() => void handleConfirmDeleteMonth()}
                      >
                        {deletingMonth ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              aria-hidden
                            />
                            Deleting…
                          </>
                        ) : (
                          "Delete month"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={columnVisibilityModalElRef}
                className="modal fade"
                id={MB_COLUMN_VISIBILITY_MODAL_ID}
                tabIndex={-1}
                aria-labelledby={`${MB_COLUMN_VISIBILITY_MODAL_ID}-label`}
                aria-hidden="true"
              >
                <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                  <div className="modal-content score-breakdown-modal">
                    <div className="modal-header">
                      <h5
                        className="modal-title"
                        id={`${MB_COLUMN_VISIBILITY_MODAL_ID}-label`}
                      >
                        Column visibility
                      </h5>
                      <button
                        type="button"
                        className="btn-close"
                        data-bs-dismiss="modal"
                        aria-label="Close"
                      />
                    </div>
                    <div className="modal-body">
                      <p className="small text-secondary mb-3">
                        Choose which accounts appear as columns in the sheet.
                        This preference is saved to your account.
                      </p>
                      <ul className="list-group list-group-flush">
                        {accounts.map((a) => (
                          <li
                            key={a.id}
                            className="list-group-item d-flex align-items-center justify-content-between gap-2 border-secondary border-opacity-25 bg-transparent px-0"
                          >
                            <span className="small text-break pe-2">
                              {a.name}{" "}
                              <span className="text-secondary">
                                ({a.currency})
                              </span>
                            </span>
                            <div className="form-check form-switch flex-shrink-0 mb-0">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                role="switch"
                                id={`mb-col-vis-${a.id}`}
                                checked={!hiddenColumnIdSet.has(a.id)}
                                onChange={(e) =>
                                  setAccountColumnVisible(
                                    a.id,
                                    e.target.checked,
                                  )
                                }
                              />
                              <label
                                className="visually-hidden"
                                htmlFor={`mb-col-vis-${a.id}`}
                              >
                                Show column for {a.name}
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn btn-sm glass-btn glass-btn-secondary"
                        onClick={showAllAccountColumns}
                        disabled={hiddenColumnIds.length === 0}
                      >
                        Show all columns
                      </button>
                      <button
                        type="button"
                        className="btn glass-btn glass-btn-primary"
                        data-bs-dismiss="modal"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

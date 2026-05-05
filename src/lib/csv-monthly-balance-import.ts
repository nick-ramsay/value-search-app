import { formatMonthKey, type BalanceAccountKind } from "@/lib/monthly-balances";
import { parseCsvRows } from "@/lib/csv-parse";

export type WizardCsvAnalysisError = { message: string };

/** One account column from the CSV header row. */
export type WizardCsvDraftAccount = {
  /** Stable id for React keys before save */
  draftId: string;
  columnIndex: number;
  name: string;
  inferredKind: BalanceAccountKind;
  /** True if column had both positive and negative non-zero values */
  mixedSignWarning: boolean;
};

export type WizardCsvMonthRow = {
  monthKey: string;
  /** Parallel to draft accounts order; absolute magnitude; null = empty cell */
  magnitudes: (number | null)[];
};

export type WizardCsvAnalysis =
  | {
      ok: true;
      accounts: WizardCsvDraftAccount[];
      monthRows: WizardCsvMonthRow[];
      warnings: string[];
    }
  | {
      ok: false;
      errors: WizardCsvAnalysisError[];
    };

function randomDraftId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** English full month names → 0–11 */
const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/** Common English abbreviations → 0–11 */
const MONTH_ABBR_TO_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse MONTH-YEAR (e.g. August-2018, Aug-2018) → calendar month key YYYY-MM.
 * Month is English, case-insensitive; year is four digits.
 */
export function parseMonthYearLabelToMonthKey(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^([A-Za-z]+)\s*-\s*(\d{4})$/.exec(t);
  if (!m) return null;
  const monthToken = m[1].toLowerCase();
  const year = Number(m[2]);
  if (year < 1000 || year > 9999) return null;
  const monthIndex =
    MONTH_NAME_TO_INDEX[monthToken] ?? MONTH_ABBR_TO_INDEX[monthToken];
  if (monthIndex === undefined) return null;
  return formatMonthKey(new Date(year, monthIndex, 1));
}

/** Round to two decimal places (half-up via typical float rounding). */
export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

function isEmptyBalanceCell(raw: string): boolean {
  const t = raw.trim();
  return t === "" || t === "—" || t === "-" || t === "–";
}

/**
 * Parse a balance cell: empty → null; otherwise must be a valid number or fails validation.
 */
function parseMoneyCellStrict(raw: string):
  | { ok: true; value: number | null }
  | { ok: false; message: string } {
  if (isEmptyBalanceCell(raw)) return { ok: true, value: null };
  const cleaned = raw.trim().replace(/[$€£¥\s,]/g, "");
  if (cleaned === "") {
    return { ok: false, message: "contains only symbols or spaces (use a number or leave blank)" };
  }
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, message: `is not a valid number (“${raw.trim()}”)` };
  }
  return { ok: true, value: roundMoney2(n) };
}

function inferKindFromValues(signedValues: number[]): {
  kind: BalanceAccountKind;
  mixed: boolean;
} {
  const nonZero = signedValues.filter((v) => v !== 0 && Number.isFinite(v));
  if (nonZero.length === 0) return { kind: "Asset", mixed: false };
  const hasPos = nonZero.some((v) => v > 0);
  const hasNeg = nonZero.some((v) => v < 0);
  if (hasPos && hasNeg) return { kind: "Asset", mixed: true };
  if (hasNeg && !hasPos) return { kind: "Debt", mixed: false };
  return { kind: "Asset", mixed: false };
}

/**
 * Parse raw CSV text into draft accounts and month rows per product rules:
 * - Row 0: col 0 label ignored; cols 1+ = account names
 * - Row 1+: col 0 = MONTH-YEAR (e.g. August-2018) → month; cols 1+ = signed balances
 */
export function analyzeMonthlyBalanceWizardCsv(csvText: string): WizardCsvAnalysis {
  const rows = parseCsvRows(csvText);
  const errors: WizardCsvAnalysisError[] = [];
  const warnings: string[] = [];

  if (rows.length < 2) {
    return {
      ok: false,
      errors: [{ message: "CSV must have a header row and at least one data row." }],
    };
  }

  const header = rows[0];
  if (header.length < 2) {
    return {
      ok: false,
      errors: [
        {
          message:
            "CSV must have at least two columns: a date/month column and one or more account columns.",
        },
      ],
    };
  }

  const accountNames = header.slice(1).map((h) => h.trim());
  const seenNames = new Set<string>();
  for (let i = 0; i < accountNames.length; i += 1) {
    const n = accountNames[i];
    if (!n) {
      errors.push({ message: `Column ${i + 2} has an empty account name in the header row.` });
    } else if (seenNames.has(n)) {
      errors.push({
        message: `Duplicate account name in header: "${n}". Each column must be unique.`,
      });
    } else {
      seenNames.add(n);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const colCount = accountNames.length;
  /** Every row must match the header column count (date + one cell per account). */
  const columnCount = header.length;
  const signedByColumn: number[][] = Array.from({ length: colCount }, () => []);

  const dataRows = rows.slice(1);
  const seenMonthKeys = new Set<string>();
  const monthRows: WizardCsvMonthRow[] = [];

  for (let r = 0; r < dataRows.length; r += 1) {
    const rowNum = r + 2;
    const line = dataRows[r];

    if (line.length !== columnCount) {
      return {
        ok: false,
        errors: [
          {
            message: `Row ${rowNum}: expected exactly ${columnCount} columns to match the header (${colCount} account column${colCount === 1 ? "" : "s"}), found ${line.length}. Each row must align with the header; include empty trailing cells if your editor drops them.`,
          },
        ],
      };
    }

    const dateCell = line[0] ?? "";
    if (isEmptyBalanceCell(dateCell) || dateCell.trim() === "") {
      return {
        ok: false,
        errors: [
          {
            message: `Row ${rowNum}: first column must be a month-year label (e.g. August-2018).`,
          },
        ],
      };
    }

    const mk = parseMonthYearLabelToMonthKey(dateCell);
    if (!mk) {
      return {
        ok: false,
        errors: [
          {
            message: `Row ${rowNum}: could not parse “${dateCell.trim()}”. Use MONTH-YEAR in English (e.g. August-2018 or Aug-2018).`,
          },
        ],
      };
    }

    if (seenMonthKeys.has(mk)) {
      return {
        ok: false,
        errors: [
          {
            message: `Duplicate month ${mk}: each calendar month must appear at most once in the file (see row ${rowNum}).`,
          },
        ],
      };
    }
    seenMonthKeys.add(mk);

    const magnitudes: (number | null)[] = [];
    for (let c = 0; c < colCount; c += 1) {
      const cell = line[c + 1] ?? "";
      const parsed = parseMoneyCellStrict(cell);
      if (!parsed.ok) {
        return {
          ok: false,
          errors: [
            {
              message: `Row ${rowNum}, column ${c + 2} (${accountNames[c]}): ${parsed.message}`,
            },
          ],
        };
      }
      if (parsed.value === null) {
        magnitudes.push(null);
      } else {
        signedByColumn[c].push(parsed.value);
        magnitudes.push(roundMoney2(Math.abs(parsed.value)));
      }
    }

    monthRows.push({ monthKey: mk, magnitudes });
  }

  if (monthRows.length === 0) {
    return {
      ok: false,
      errors: [
        {
          message:
            "No data rows found after the header. Add at least one row with a date and balance columns.",
        },
      ],
    };
  }

  const accounts: WizardCsvDraftAccount[] = accountNames.map((name, columnIndex) => {
    const signed = signedByColumn[columnIndex];
    const { kind, mixed } = inferKindFromValues(signed);
    return {
      draftId: randomDraftId(),
      columnIndex,
      name,
      inferredKind: kind,
      mixedSignWarning: mixed,
    };
  });

  const dedupedRows = [...monthRows].sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
  );

  return {
    ok: true,
    accounts,
    monthRows: dedupedRows,
    warnings,
  };
}

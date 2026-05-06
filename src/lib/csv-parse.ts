/**
 * Parse CSV text into rows of string cells (RFC 4180-style quotes and commas).
 */
export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;

  const flushCell = () => {
    row.push(cur);
    cur = "";
  };

  const flushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < normalized.length) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      flushCell();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      flushCell();
      flushRow();
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  flushCell();
  const lastRowNonempty = row.some((cell) => cell.trim() !== "");
  if (lastRowNonempty) {
    flushRow();
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

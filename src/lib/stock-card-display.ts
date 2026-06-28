import type { ValueRecord } from "@/lib/value-search";

/** Fixed locale so server and client render the same (avoids hydration mismatch). */
export function formatLastUpdated(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const datePart = date.toLocaleDateString("en-US", { dateStyle: "medium" });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} ${timePart}`;
  } catch {
    return date.toISOString();
  }
}

/** Relative time for inline freshness (en-US, stable across server/client for same instant). */
export function formatRelativeUpdated(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const nowMs = Date.now();
  const diffSec = Math.round((nowMs - date.getTime()) / 1000);
  if (diffSec < 0) return "just now";

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m}m ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h}h ago`;
  }
  if (diffSec < 86400 * 7) {
    const d = Math.floor(diffSec / 86400);
    return `${d}d ago`;
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type CardMetric = {
  label: string;
  value: string;
  title?: string;
  tone?: "neutral" | "positive" | "negative";
};

function formatRatio(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 100 ? n.toFixed(0) : n.toFixed(2);
}

function formatPercentRatio(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function formatPrice(n: number): string {
  return n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function pctVs(price: number, ref: number): CardMetric["tone"] | undefined {
  if (!Number.isFinite(price) || !Number.isFinite(ref) || ref === 0) return undefined;
  const pct = ((price - ref) / ref) * 100;
  if (Math.abs(pct) < 0.05) return "neutral";
  return pct > 0 ? "positive" : "negative";
}

function formatPctChange(price: number, ref: number): string {
  const pct = ((price - ref) / ref) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Key quote metrics for the collapsed card surface (max 6). */
export function buildCardMetrics(item: ValueRecord): CardMetric[] {
  const metrics: CardMetric[] = [];

  if (item.peRatio != null && Number.isFinite(item.peRatio)) {
    metrics.push({ label: "P/E", value: formatRatio(item.peRatio) });
  }
  if (item.forwardPeRatio != null && Number.isFinite(item.forwardPeRatio)) {
    metrics.push({ label: "Fwd P/E", value: formatRatio(item.forwardPeRatio) });
  }

  if (
    typeof item.price === "number" &&
    item.movingAverage50Day != null &&
    Number.isFinite(item.movingAverage50Day) &&
    item.movingAverage50Day > 0
  ) {
    const tone = pctVs(item.price, item.movingAverage50Day);
    metrics.push({
      label: "vs 50d",
      value: formatPctChange(item.price, item.movingAverage50Day),
      tone,
      title: `50-day MA: ${formatPrice(item.movingAverage50Day)}`,
    });
  }

  if (item.relativeStrengthIndex != null && Number.isFinite(item.relativeStrengthIndex)) {
    const rsi = item.relativeStrengthIndex;
    const tone: CardMetric["tone"] =
      rsi >= 70 ? "negative" : rsi <= 30 ? "positive" : "neutral";
    metrics.push({
      label: "RSI",
      value: rsi.toFixed(0),
      tone,
      title: rsi >= 70 ? "Overbought zone" : rsi <= 30 ? "Oversold zone" : undefined,
    });
  }

  if (item.profitMargin != null && Number.isFinite(item.profitMargin)) {
    metrics.push({
      label: "Margin",
      value: formatPercentRatio(item.profitMargin),
    });
  }

  if (
    typeof item.price === "number" &&
    item.analystTargetPrice != null &&
    Number.isFinite(item.analystTargetPrice) &&
    item.analystTargetPrice > 0
  ) {
    const tone = pctVs(item.price, item.analystTargetPrice);
    metrics.push({
      label: "vs target",
      value: formatPctChange(item.price, item.analystTargetPrice),
      tone,
      title: `Analyst target: ${formatPrice(item.analystTargetPrice)}`,
    });
  }

  if (item.debtToEquity != null && Number.isFinite(item.debtToEquity)) {
    metrics.push({ label: "D/E", value: formatRatio(item.debtToEquity) });
  }

  return metrics.slice(0, 6);
}

export type TargetDistanceLine = {
  text: string;
  tone: "fulfilled" | "close" | "neutral";
  ariaLabel: string;
};

export function formatTargetPrice(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
}

/** Distance from current price to portfolio buy/sell target. */
export function buildTargetDistanceLine(
  currentPrice: number | undefined,
  status: string,
  buyTarget?: number,
  sellTarget?: number,
): TargetDistanceLine | null {
  if (currentPrice == null || Number.isNaN(currentPrice)) return null;

  const showBuy = status === "Avoid" || status === "Watch" || status === "Queued";
  const showSell = status === "Own" || status === "Hold";

  if (showBuy && buyTarget != null && buyTarget > 0) {
    const fulfilled = currentPrice <= buyTarget;
    const pct = ((currentPrice - buyTarget) / buyTarget) * 100;
    const absPct = Math.abs(pct).toFixed(1);
    const targetStr = formatTargetPrice(buyTarget);

    if (fulfilled) {
      return {
        text: `At or below buy target ($${targetStr})`,
        tone: "fulfilled",
        ariaLabel: `Buy target fulfilled at $${targetStr}`,
      };
    }

    const tone: TargetDistanceLine["tone"] =
      Math.abs(pct) <= 5 ? "close" : "neutral";

    return {
      text: `${absPct}% above buy target ($${targetStr})`,
      tone,
      ariaLabel: `Price is ${absPct} percent above buy target of $${targetStr}`,
    };
  }

  if (showSell && sellTarget != null && sellTarget > 0) {
    const fulfilled = currentPrice >= sellTarget;
    const pct = ((currentPrice - sellTarget) / sellTarget) * 100;
    const absPct = Math.abs(pct).toFixed(1);
    const targetStr = formatTargetPrice(sellTarget);

    if (fulfilled) {
      return {
        text: `At or above sell target ($${targetStr})`,
        tone: "fulfilled",
        ariaLabel: `Sell target fulfilled at $${targetStr}`,
      };
    }

    const tone: TargetDistanceLine["tone"] =
      Math.abs(pct) <= 5 ? "close" : "neutral";

    return {
      text: `${absPct}% below sell target ($${targetStr})`,
      tone,
      ariaLabel: `Price is ${absPct} percent below sell target of $${targetStr}`,
    };
  }

  return null;
}

/** camelCase / snake_case → Title Case label */
export function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const FIELD_LABELS: Record<string, string> = {
  price: "Price",
  pe: "P/E",
  peRatio: "P/E",
  trailingPE: "Trailing P/E",
  forwardPE: "Forward P/E",
  forwardPe: "Forward P/E",
  profitMargin: "Profit margin",
  debtToEquity: "Debt / equity",
  priceToBook: "Price / book",
  priceToSales: "Price / sales",
  returnOnEquity: "Return on equity",
  relativeStrengthIndex: "RSI",
  movingAverage50Day: "50-day MA",
  movingAverage200Day: "200-day MA",
  analystTargetPrice: "Analyst target",
  marketCap: "Market cap",
  dividendYield: "Dividend yield",
  beta: "Beta",
  eps: "EPS",
  revenue: "Revenue",
};

export function labelForFieldKey(key: string): string {
  return FIELD_LABELS[key] ?? humanizeFieldKey(key);
}

export type AssessmentFieldGroup = "context" | "valuation" | "profitability" | "balance" | "technical" | "other";

const VALUATION_KEYS = new Set([
  "pe",
  "peRatio",
  "trailingPE",
  "forwardPE",
  "forwardPe",
  "priceToBook",
  "priceToSales",
  "analystTargetPrice",
  "marketCap",
  "eps",
]);

const PROFITABILITY_KEYS = new Set([
  "profitMargin",
  "returnOnEquity",
  "revenue",
  "grossProfit",
  "operatingMargin",
]);

const BALANCE_KEYS = new Set(["debtToEquity", "totalDebt", "currentRatio", "quickRatio"]);

const TECHNICAL_KEYS = new Set([
  "relativeStrengthIndex",
  "rsi",
  "movingAverage50Day",
  "movingAverage200Day",
  "fiftyDayAverage",
  "twoHundredDayAverage",
  "beta",
]);

export function groupForFieldKey(key: string): AssessmentFieldGroup {
  const k = key.replace(/_/g, "");
  if (VALUATION_KEYS.has(key) || VALUATION_KEYS.has(k)) return "valuation";
  if (PROFITABILITY_KEYS.has(key) || PROFITABILITY_KEYS.has(k)) return "profitability";
  if (BALANCE_KEYS.has(key) || BALANCE_KEYS.has(k)) return "balance";
  if (TECHNICAL_KEYS.has(key) || TECHNICAL_KEYS.has(k)) return "technical";
  if (key === "price" || k === "price") return "valuation";
  return "other";
}

export const ASSESSMENT_GROUP_TITLES: Record<AssessmentFieldGroup, string> = {
  context: "Context",
  valuation: "Valuation",
  profitability: "Profitability",
  balance: "Balance sheet",
  technical: "Technicals",
  other: "Other",
};

export function formatAssessmentValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    const lk = key.toLowerCase();
    if (lk.includes("margin") || lk.includes("yield") || lk === "roe") {
      const pct = Math.abs(v) <= 1 ? v * 100 : v;
      return `${pct.toFixed(2)}%`;
    }
    if (lk.includes("ratio") || lk === "pe" || lk.includes("rsi")) {
      return v >= 100 ? v.toFixed(0) : v.toFixed(2);
    }
    if (lk.includes("price") || lk === "eps") {
      return v >= 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
    }
    return v >= 1_000_000 ? v.toLocaleString("en-US") : String(v);
  }
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

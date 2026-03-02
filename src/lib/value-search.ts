import clientPromise from "@/lib/mongodb";

export type ValueSearchScoreDisplay = {
  calculatedScorePercentage: number;
  totalPossiblePoints: number;
  totalCalculatedPoints?: number;
  [key: string]: unknown;
};

/** Metrics read from MongoDB assessment documents (when present). */
export type ValueRecordMetrics = {
  /** Current stock price */
  price?: number;
  /** When the current stock price/quote was last updated (ISO string). */
  priceLastUpdated?: string;
  /** P/E ratio */
  peRatio?: number;
  /** Forward P/E ratio */
  forwardPeRatio?: number;
  /** Profit margin (e.g. 0.15 = 15%) */
  profitMargin?: number;
  /** Debt to equity ratio */
  debtToEquity?: number;
  /** Price to book ratio */
  priceToBook?: number;
  /** Price to sales ratio */
  priceToSales?: number;
  /** 50-day moving average */
  movingAverage50Day?: number;
  /** 200-day moving average */
  movingAverage200Day?: number;
  /** Return on equity (e.g. 0.20 = 20%) */
  returnOnEquity?: number;
  /** Relative strength index (0–100) */
  relativeStrengthIndex?: number;
  /** Analyst target price */
  analystTargetPrice?: number;
};

export type ValueRecord = {
  _id: string;
  symbol?: string;
  name?: string;
  aiRating?: string;
  aiRatingScore?: number;
  /** When the AI assessment was last generated/updated (ISO string). */
  aiAssessmentLastUpdated?: string;
  assessment?: string;
  industry?: string;
  sector?: string;
  country?: string;
  valueSearchScore?: ValueSearchScoreDisplay;
} & ValueRecordMetrics;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Coerce a value to a number if possible (number or numeric string). */
function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** Coerce a value to an ISO date-time string if possible. Accepts Date, ISO string, or epoch seconds/ms. */
function toDateString(v: unknown): string | undefined {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v.toISOString();
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

/** Read a quote last-updated timestamp from either the assessment doc or nested quote/quotes objects. */
function readQuoteLastUpdatedFromAny(
  doc: Record<string, unknown>,
): string | undefined {
  const sources: Record<string, unknown>[] = [];
  const quote = doc.quote ?? (doc as { quotes?: unknown }).quotes;
  if (quote && typeof quote === "object") {
    sources.push(quote as Record<string, unknown>);
  }
  sources.push(doc);

  const candidateKeys = [
    "lastUpdated",
    "lastUpdate",
    "updatedAt",
    "updated_at",
    "priceUpdatedAt",
    "price_updated_at",
    "timestamp",
  ];

  for (const src of sources) {
    for (const key of candidateKeys) {
      if (key in src) {
        const iso = toDateString(src[key]);
        if (iso) return iso;
      }
    }
  }

  return undefined;
}

/** Read an AI assessment last-updated timestamp from the assessment document itself. */
function readAssessmentLastUpdatedFromAny(
  doc: Record<string, unknown>,
): string | undefined {
  // Prefer the explicit lastUpdatedAssessment field on the stock-ai-assessments document
  const direct = toDateString(
    (doc as { lastUpdatedAssessment?: unknown }).lastUpdatedAssessment,
  );
  if (direct) return direct;

  const sources: Record<string, unknown>[] = [doc];

  const candidateKeys = [
    // Legacy / alternate field names kept as fallbacks
    "assessmentUpdatedAt",
    "assessmentLastUpdated",
    "aiUpdatedAt",
    "aiLastUpdated",
    "aiGeneratedAt",
    "generatedAt",
    "updatedAt",
    "updated_at",
  ];

  for (const src of sources) {
    for (const key of candidateKeys) {
      if (key in src) {
        const iso = toDateString(src[key]);
        if (iso) return iso;
      }
    }
  }

  return undefined;
}

/** Read a number from doc, valueSearchScore, or nested doc.metrics / doc.quote using the first matching key. */
function readNumber(
  doc: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  const valueSearchScore = doc.valueSearchScore as Record<string, unknown> | undefined;
  const metrics = doc.metrics as Record<string, unknown> | undefined;
  const quote = doc.quote as Record<string, unknown> | undefined;
  const sources = [doc, valueSearchScore, metrics, quote].filter(
    (s): s is Record<string, unknown> => typeof s === "object" && s !== null
  );
  for (const key of keys) {
    for (const src of sources) {
      const v = src[key];
      const n = toNumber(v);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

export type DocInput = {
  _id?: unknown;
  symbol?: unknown;
  name?: unknown;
  aiRating?: unknown;
  aiRatingScore?: unknown;
  assessment?: unknown;
  industry?: unknown;
  sector?: unknown;
  country?: unknown;
  valueSearchScore?: unknown;
  [key: string]: unknown;
};

/** Map a raw assessment document to ValueRecord (shared for API and getValueBySymbol). */
export function docToValueRecord(doc: DocInput): ValueRecord {
  const valueSearchScore = doc.valueSearchScore as
    | ValueSearchScoreDisplay
    | undefined;
  let normalized: ValueSearchScoreDisplay | undefined;
  if (valueSearchScore) {
    const totalPossiblePoints = Number(valueSearchScore.totalPossiblePoints);
    const calculatedScorePercentage = Number(
      valueSearchScore.calculatedScorePercentage
    );
    if (
      totalPossiblePoints > 0 &&
      !Number.isNaN(calculatedScorePercentage)
    ) {
      normalized = {
        ...valueSearchScore,
        calculatedScorePercentage,
        totalPossiblePoints,
      };
    }
  }
  const d = doc as Record<string, unknown>;
  return {
    _id: doc._id != null ? String(doc._id) : "",
    symbol: typeof doc.symbol === "string" ? doc.symbol : undefined,
    aiRating: typeof doc.aiRating === "string" ? doc.aiRating : undefined,
    aiRatingScore:
      typeof doc.aiRatingScore === "number" ? doc.aiRatingScore : undefined,
    assessment:
      typeof doc.assessment === "string" ? doc.assessment : undefined,
    name: typeof doc.name === "string" ? doc.name : undefined,
    industry: typeof doc.industry === "string" ? doc.industry : undefined,
    sector: typeof doc.sector === "string" ? doc.sector : undefined,
    country: typeof doc.country === "string" ? doc.country : undefined,
    valueSearchScore: normalized,
    aiAssessmentLastUpdated: readAssessmentLastUpdatedFromAny(d),
    priceLastUpdated: readQuoteLastUpdatedFromAny(d),
    price: readNumber(d, "price", "currentPrice", "regularMarketPrice", "current_price", "close"),
    peRatio: readNumber(d, "peRatio", "pe", "trailingPE", "trailingPe", "peRatio", "pe_ratio"),
    forwardPeRatio: readNumber(d, "forwardPeRatio", "forwardPE", "forwardPe", "forwardPE", "fwdPe", "forward_pe"),
    profitMargin: readNumber(d, "profitMargin", "profitMarginPercent", "profitMargins", "profit_margin"),
    debtToEquity: readNumber(d, "debtToEquity", "debtToEquityRatio", "debt_to_equity", "totalDebtToEquity"),
    priceToBook: readNumber(d, "priceToBook", "priceToBookRatio", "pb", "price_to_book", "priceToBook"),
    priceToSales: readNumber(d, "priceToSales", "priceToSalesRatio", "ps", "price_to_sales", "priceToSales"),
    movingAverage50Day: readNumber(d, "movingAverage50Day", "ma50", "movingAverage50", "fiftyDayAverage", "fiftyDayMovingAverage", "ma_50", "sma50"),
    movingAverage200Day: readNumber(d, "movingAverage200Day", "ma200", "movingAverage200", "twoHundredDayAverage", "twoHundredDayMovingAverage", "ma_200", "sma200"),
    returnOnEquity: readNumber(d, "returnOnEquity", "roe", "return_on_equity"),
    relativeStrengthIndex: readNumber(d, "relativeStrengthIndex", "rsi", "relative_strength_index"),
    analystTargetPrice: readNumber(d, "analystTargetPrice", "targetPrice", "targetMeanPrice", "target_high_price", "target_low_price", "analyst_target"),
  };
}

function getStockQuotesCollectionName(): string {
  return process.env.MONGODB_STOCK_QUOTES_COLLECTION ?? "stock-quotes";
}

/** Read price from a stock-quotes document (quote.price or quotes.price). */
function readPriceFromQuoteDoc(doc: Record<string, unknown>): number | undefined {
  const quote = doc.quote ?? doc.quotes;
  if (quote == null || typeof quote !== "object") return undefined;
  const obj = quote as Record<string, unknown>;
  if (!("price" in obj)) return undefined;
  return toNumber(obj.price);
}

/** Read last-updated timestamp from a stock-quotes document, if present. */
function readLastUpdatedFromQuoteDoc(
  doc: Record<string, unknown>,
): string | undefined {
  // Prefer the explicit lastUpdatedQuote field on the stock_quote document
  const preferred = toDateString(
    (doc as { lastUpdatedQuote?: unknown }).lastUpdatedQuote,
  );
  if (preferred) return preferred;

  // Fallback to other common timestamp fields, including any nested quote/quotes objects
  return readQuoteLastUpdatedFromAny(doc);
}

/** Fetch price from stock-quotes collection (quote.price) for one symbol. */
async function getPriceFromStockQuotes(
  db: { collection: (name: string) => { findOne: (filter: object) => Promise<Record<string, unknown> | null> } },
  symbol: string
): Promise<number | undefined> {
  const trimmed = symbol.trim();
  if (!trimmed) return undefined;
  const coll = getStockQuotesCollectionName();
  const exact = trimmed.toUpperCase();
  const filter = {
    $or: [
      { symbol: exact },
      { symbol: trimmed },
      { symbol: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } },
      { ticker: exact },
      { ticker: trimmed },
      { ticker: { $regex: `^${escapeRegExp(trimmed)}$`, $options: "i" } },
      { Symbol: exact },
      { Symbol: trimmed },
    ],
  };
  const doc = await db.collection(coll).findOne(filter);
  if (!doc) return undefined;
  return readPriceFromQuoteDoc(doc);
}

/** Fetch prices from stock-quotes (quote.price) for many symbols. Returns map of uppercase symbol -> price. */
export type QuotePriceSnapshot = {
  price: number;
  lastUpdated?: string;
};

export async function getPricesBySymbols(
  symbols: string[]
): Promise<Record<string, QuotePriceSnapshot>> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const dbName = process.env.MONGODB_DB;
  if (!dbName) return {};

  const client = await clientPromise;
  const db = client.db(dbName);
  const coll = getStockQuotesCollectionName();

  const orClauses: object[] = [];
  for (const s of unique) {
    const up = s.toUpperCase();
    orClauses.push(
      { symbol: up },
      { symbol: s },
      { symbol: { $regex: `^${escapeRegExp(s)}$`, $options: "i" } },
      { ticker: up },
      { ticker: s },
      { ticker: { $regex: `^${escapeRegExp(s)}$`, $options: "i" } },
      { Symbol: up },
      { Symbol: s },
    );
  }
  const docs = await db.collection(coll).find({ $or: orClauses }).toArray();

  const map: Record<string, QuotePriceSnapshot> = {};
  for (const doc of docs) {
    const d = doc as Record<string, unknown>;
    const sym = (typeof d.symbol === "string" ? d.symbol : typeof d.ticker === "string" ? d.ticker : typeof (d as { Symbol?: string }).Symbol === "string" ? (d as { Symbol: string }).Symbol : "") as string;
    if (!sym) continue;
    const num = readPriceFromQuoteDoc(d);
    if (num !== undefined) {
      const lastUpdated = readLastUpdatedFromQuoteDoc(d);
      map[sym.toUpperCase()] = lastUpdated
        ? { price: num, lastUpdated }
        : { price: num };
    }
  }
  return map;
}

/**
 * Fetch a single stock/assessment by symbol (case-insensitive). Returns null if not found.
 * Price is loaded from the stock-quotes collection (quote.price).
 */
export async function getValueBySymbol(
  symbol: string
): Promise<ValueRecord | null> {
  const trimmed = symbol.trim();
  if (!trimmed) return null;

  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName || !aiAssessmentsCollection) {
    throw new Error(
      "MONGODB_DB and MONGODB_AI_ASSESSMENTS_COLLECTION must be set."
    );
  }

  const client = await clientPromise;
  const db = client.db(dbName);

  const doc = await db
    .collection(aiAssessmentsCollection)
    .findOne({
      symbol: {
        $regex: `^${escapeRegExp(trimmed)}$`,
        $options: "i",
      },
    });

  if (!doc) return null;

  const record = docToValueRecord(doc);
  const price = await getPriceFromStockQuotes(db, trimmed);
  if (price !== undefined) record.price = price;
  return record;
}

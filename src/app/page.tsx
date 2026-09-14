import { cache, Suspense } from "react";

import clientPromise from "@/lib/mongodb";
import { docToValueRecord, getPricesBySymbols, type DocInput, type ValueRecord } from "@/lib/value-search";
import { pruneIndustriesForSectors } from "@/lib/sectorIndustryFilter";
import AppNavbar from "../app/components/AppNavbar";
import PaginationWithLoader from "../app/components/PaginationWithLoader";
import StockResultCard from "../app/components/StockResultCard";
import ScoreExplanationModal from "../app/components/ScoreExplanationModal";
import DisclosureModal from "../app/components/DisclosureModal";
import ResultsSummaryClient from "../app/components/ResultsSummaryClient";
import FiltersFormClient from "../app/components/FiltersFormClient";
import { HomeNavigationProvider } from "../app/components/HomeNavigationContext";
import SkeletonStockCard from "../app/components/SkeletonStockCard";

const PAGE_SIZE = 25;
const EXCLUDED_ETF_INDUSTRY = "Exchange Traded Fund";

type FilterOptions = {
  industries: string[];
  sectors: string[];
  countries: string[];
  /** sector -> industries belonging to it, from stock-sector-industries. */
  sectorIndustryMap: Record<string, string[]>;
};

function FiltersSection({
  filterOptions,
  symbols,
  selectedIndustries,
  selectedSectors,
  selectedCountries,
  excludeEtfsEnabled,
  maSupportEnabled,
}: {
  filterOptions: FilterOptions;
  symbols: string[];
  selectedIndustries: string[];
  selectedSectors: string[];
  selectedCountries: string[];
  excludeEtfsEnabled: boolean;
  maSupportEnabled: boolean;
}) {
  const { industries, sectors, countries, sectorIndustryMap } = filterOptions;
  return (
    <section className="mt-3">
      <div className="accordion pb-3 filters-accordion-glass" id="filtersAccordion">
        <div className="accordion-item">
          <h2 className="accordion-header" id="filtersHeading">
            <button
              className="accordion-button collapsed ai-accordion-button fw-bold"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#filtersCollapse"
              aria-expanded="false"
              aria-controls="filtersCollapse"
            >
              Filters
            </button>
          </h2>
          <div
            id="filtersCollapse"
            className="accordion-collapse collapse"
            aria-labelledby="filtersHeading"
            data-bs-parent="#filtersAccordion"
          >
            <div className="accordion-body">
              <FiltersFormClient
                industries={industries}
                sectors={sectors}
                countries={countries}
                sectorIndustryMap={sectorIndustryMap}
                selectedIndustries={selectedIndustries}
                selectedSectors={selectedSectors}
                selectedCountries={selectedCountries}
                excludeEtfsEnabled={excludeEtfsEnabled}
                maSupportEnabled={maSupportEnabled}
                symbols={symbols}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FiltersLoadingFallback() {
  return (
    <section className="mt-3">
      <div className="accordion pb-3 filters-accordion-glass" id="filtersAccordion">
        <div className="accordion-item">
          <h2 className="accordion-header" id="filtersHeading">
            <button
              className="accordion-button collapsed ai-accordion-button fw-bold"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#filtersCollapse"
              aria-expanded="false"
              aria-controls="filtersCollapse"
            >
              Filters
            </button>
          </h2>
          <div
            id="filtersCollapse"
            className="accordion-collapse collapse"
            aria-labelledby="filtersHeading"
            data-bs-parent="#filtersAccordion"
          >
            <div className="accordion-body" role="status" aria-label="Loading filters">
              <div className="row g-3">
                <div className="col-md-4">
                  <span className="skel d-block" style={{ width: "40%", height: "0.72rem", marginBottom: "0.4rem" }} />
                  <span className="skel d-block" style={{ width: "100%", height: "2.5rem" }} />
                </div>
                <div className="col-md-4">
                  <span className="skel d-block" style={{ width: "40%", height: "0.72rem", marginBottom: "0.4rem" }} />
                  <span className="skel d-block" style={{ width: "100%", height: "2.5rem" }} />
                </div>
                <div className="col-md-4">
                  <span className="skel d-block" style={{ width: "40%", height: "0.72rem", marginBottom: "0.4rem" }} />
                  <span className="skel d-block" style={{ width: "100%", height: "2.5rem" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** searchParams shape shared by every function below that reads them. */
type HomeSearchParams = {
  page?: string;
  symbol?: string | string[];
  industry?: string | string[];
  sector?: string | string[];
  country?: string | string[];
  excludeEtfs?: string | string[];
  maSupport?: string | string[];
};

async function FiltersAsyncWrapper({
  searchParams,
}: {
  searchParams?: Promise<HomeSearchParams>;
}) {
  const [resolvedSearchParams, filterOptions] = await Promise.all([
    searchParams,
    getFilterOptions(),
  ]);
  const symbols = getSelectedSymbols(resolvedSearchParams?.symbol);
  if (symbols.length > 0) {
    // Filter criteria are disregarded entirely once any individual stock is
    // selected (see buildValueFilterConditions) — hide the dropdown rather
    // than show controls that no longer affect the results.
    return null;
  }
  const selectedIndustries = getSelectedValues(resolvedSearchParams?.industry);
  const selectedSectors = getSelectedValues(resolvedSearchParams?.sector);
  const selectedCountries = getSelectedValues(resolvedSearchParams?.country);
  const excludeEtfsParam = getSearchParamValue(resolvedSearchParams?.excludeEtfs);
  const excludeEtfsEnabled = excludeEtfsParam !== "0";
  const maSupportParam = getSearchParamValue(resolvedSearchParams?.maSupport);
  const maSupportEnabled = maSupportParam === "1";
  return (
    <FiltersSection
      filterOptions={filterOptions}
      symbols={symbols}
      selectedIndustries={selectedIndustries}
      selectedSectors={selectedSectors}
      selectedCountries={selectedCountries}
      excludeEtfsEnabled={excludeEtfsEnabled}
      maSupportEnabled={maSupportEnabled}
    />
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSearchParamValue(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value;
}

/** Normalize a repeated search param into a deduped, trimmed list, preserving case. */
function getSelectedValues(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      values.push(trimmed);
    }
  }
  return values;
}

/** Same as getSelectedValues, but uppercased — symbols are always compared/stored upper. */
function getSelectedSymbols(value?: string | string[]): string[] {
  return getSelectedValues(value).map((v) => v.toUpperCase());
}

const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;

  if (!dbName) {
    throw new Error("Missing MONGODB_URI in environment.");
  }

  const db = client.db(dbName);

  const industriesDocs = (await db
    .collection("stock-ai-industries")
    .find({})
    .sort({ value: 1 })
    .toArray()) as { value?: string }[];

  const sectorsDocs = (await db
    .collection("stock-ai-sectors")
    .find({})
    .sort({ value: 1 })
    .toArray()) as { value?: string }[];

  const countriesDocs = (await db
    .collection("stock-ai-countries")
    .find({})
    .sort({ value: 1 })
    .toArray()) as { value?: string }[];

  // Every distinct sector+industry pairing — used to narrow the Industry
  // picker to only what belongs to the currently selected sector(s).
  const sectorIndustryDocs = (await db
    .collection(process.env.MONGODB_SECTOR_INDUSTRIES_COLLECTION ?? "stock-sector-industries")
    .find({})
    .toArray()) as { sector?: string; industry?: string }[];

  const industries = industriesDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  const sectors = sectorsDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  const countries = countriesDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  const sectorIndustryMap: Record<string, string[]> = {};
  for (const doc of sectorIndustryDocs) {
    if (typeof doc.sector === "string" && typeof doc.industry === "string") {
      (sectorIndustryMap[doc.sector] ??= []).push(doc.industry);
    }
  }

  return {
    industries,
    sectors,
    countries,
    sectorIndustryMap,
  };
});

/**
 * Industry/sector/country live in stock-quotes, not the assessment doc, and
 * most assessment docs never got their own `industry` field backfilled (it's
 * null). Filtering "exclude ETFs" against the assessment doc's own field
 * therefore misses most ETFs. Resolve the actual set of ETF symbols from
 * stock-quotes (the source of truth) so the exclusion works regardless of
 * whether the assessment doc's industry field was populated.
 */
const getEtfSymbols = cache(async (): Promise<string[]> => {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  if (!dbName) {
    throw new Error("Missing MONGODB_URI in environment.");
  }
  const db = client.db(dbName);
  const docs = await db
    .collection(process.env.MONGODB_STOCK_QUOTES_COLLECTION ?? "stock-quotes")
    .find({ industry: EXCLUDED_ETF_INDUSTRY }, { projection: { symbol: 1 } })
    .toArray();
  return docs
    .map((doc) => (typeof doc.symbol === "string" ? doc.symbol.toUpperCase() : undefined))
    .filter((s): s is string => Boolean(s));
});

/** Build the $and conditions shared by getValues and getValuesCount. */
async function buildValueFilterConditions({
  symbols,
  industries,
  sectors,
  countries,
  excludeEtfs,
  maSupport,
}: {
  symbols?: string[];
  industries?: string[];
  sectors?: string[];
  countries?: string[];
  excludeEtfs?: boolean;
  maSupport?: boolean;
}): Promise<Record<string, unknown>[]> {
  const conditions: Record<string, unknown>[] = [];

  if (symbols && symbols.length > 0) {
    // Individually-selected stocks always show, regardless of the other
    // filters — those only apply when browsing the unfiltered list.
    conditions.push({
      $or: symbols.map((symbol) => ({
        symbol: { $regex: `^${escapeRegExp(symbol)}$`, $options: "i" },
      })),
    });
    return conditions;
  }

  if (industries && industries.length > 0) {
    conditions.push({ industry: { $in: industries } });
  } else if (excludeEtfs) {
    // Belt-and-suspenders: exclude on the assessment doc's own field when
    // present, and on the real stock-quotes-derived ETF symbol list, since
    // the assessment doc's industry field is frequently unpopulated.
    conditions.push({ industry: { $ne: EXCLUDED_ETF_INDUSTRY } });
    const etfSymbols = await getEtfSymbols();
    if (etfSymbols.length > 0) {
      conditions.push({ symbol: { $nin: etfSymbols } });
    }
  }

  if (sectors && sectors.length > 0) {
    conditions.push({ sector: { $in: sectors } });
  }

  if (countries && countries.length > 0) {
    conditions.push({ country: { $in: countries } });
  }

  if (maSupport) {
    conditions.push({ "valueSearchScore.movingAverageSupport": { $gte: 1 } });
  }

  return conditions;
}

async function getValues(
  page: number,
  {
    symbols,
    industries,
    sectors,
    countries,
    excludeEtfs,
    maSupport,
  }: {
    symbols?: string[];
    industries?: string[];
    sectors?: string[];
    countries?: string[];
    excludeEtfs?: boolean;
    maSupport?: boolean;
  },
): Promise<{ values: ValueRecord[]; hasMore: boolean }> {
  const hasSymbols = Boolean(symbols && symbols.length > 0);
  // Selecting the ETF-industry bucket while also asking to exclude ETFs is
  // a contradiction (that bucket IS "the ETFs") — short-circuit to empty
  // rather than silently ignoring one side of it.
  if (!hasSymbols && excludeEtfs && industries?.includes(EXCLUDED_ETF_INDUSTRY)) {
    return { values: [], hasMore: false };
  }

  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName) {
    throw new Error("Missing MONGODB_URI in environment.");
  }

  if (!aiAssessmentsCollection) {
    throw new Error("Missing MONGODB_AI_ASSESSMENTS_COLLECTION in environment.");
  }

  const db = client.db(dbName);
  const skip = (page - 1) * PAGE_SIZE;
  const conditions = await buildValueFilterConditions({
    symbols,
    industries,
    sectors,
    countries,
    excludeEtfs,
    maSupport,
  });
  const filter: Record<string, unknown> = conditions.length > 0 ? { $and: conditions } : {};

  // Fetch a page of assessments sorted by aiRatingScore, name, symbol (no lookup yet)
  const docs = await db
    .collection(aiAssessmentsCollection)
    .find(filter)
    .sort({ aiRatingScore: -1, "valueSearchScore.calculatedScorePercentage": -1, name: 1, symbol: 1 })
    .skip(skip)
    .limit(PAGE_SIZE + 1)
    .toArray();

  const hasMore = docs.length > PAGE_SIZE;
  const pageDocs = docs.slice(0, PAGE_SIZE);

  const pageSymbols = pageDocs
    .map((d) => (typeof d.symbol === "string" ? d.symbol : undefined))
    .filter((s): s is string => Boolean(s));
  const priceBySymbol = await getPricesBySymbols(pageSymbols);

  const values = pageDocs.map((doc) => {
    const record = docToValueRecord(doc as DocInput);
    const raw = record.symbol?.trim();
    if (raw) {
      const sym = raw.toUpperCase();
      const baseSym = sym.includes(".") ? sym.split(".")[0] : sym;
      const snapshot = priceBySymbol[sym] ?? priceBySymbol[baseSym];
      if (snapshot?.price !== undefined) {
        record.price = snapshot.price;
        if (snapshot.lastUpdated) {
          record.priceLastUpdated = snapshot.lastUpdated;
        }
      }
      // Industry/sector/country live in stock-quotes, not the assessment doc.
      // Prefer the assessment value when present, else fall back to the quote.
      if (snapshot) {
        record.industry = record.industry ?? snapshot.industry;
        record.sector = record.sector ?? snapshot.sector;
        record.country = record.country ?? snapshot.country;
      }
    }
    return record;
  });

  return { values, hasMore };
}

async function getValuesCount({
  symbols,
  industries,
  sectors,
  countries,
  excludeEtfs,
  maSupport,
}: {
  symbols?: string[];
  industries?: string[];
  sectors?: string[];
  countries?: string[];
  excludeEtfs?: boolean;
  maSupport?: boolean;
}): Promise<number> {
  const hasSymbols = Boolean(symbols && symbols.length > 0);
  if (!hasSymbols && excludeEtfs && industries?.includes(EXCLUDED_ETF_INDUSTRY)) {
    return 0;
  }

  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  const aiAssessmentsCollection = process.env.MONGODB_AI_ASSESSMENTS_COLLECTION;

  if (!dbName) {
    throw new Error("Missing MONGODB_URI in environment.");
  }

  if (!aiAssessmentsCollection) {
    throw new Error("Missing MONGODB_AI_ASSESSMENTS_COLLECTION in environment.");
  }

  const db = client.db(dbName);
  const conditions = await buildValueFilterConditions({
    symbols,
    industries,
    sectors,
    countries,
    excludeEtfs,
    maSupport,
  });
  const filter: Record<string, unknown> = conditions.length > 0 ? { $and: conditions } : {};

  const totalCount = await db.collection(aiAssessmentsCollection).countDocuments(filter);
  return totalCount;
}

async function ResultsCard({
  searchParams,
}: {
  searchParams?: Promise<HomeSearchParams>;
}) {
  const [resolvedSearchParams, filterOptions] = await Promise.all([
    searchParams,
    getFilterOptions(),
  ]);
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isNaN(requestedPage) ? 1 : Math.max(1, requestedPage);
  const symbols = getSelectedSymbols(resolvedSearchParams?.symbol);
  const selectedIndustries = getSelectedValues(resolvedSearchParams?.industry);
  const selectedSectors = getSelectedValues(resolvedSearchParams?.sector);
  const selectedCountries = getSelectedValues(resolvedSearchParams?.country);
  const excludeEtfsParam = getSearchParamValue(resolvedSearchParams?.excludeEtfs);
  const excludeEtfsEnabled = excludeEtfsParam !== "0";
  const maSupportParam = getSearchParamValue(resolvedSearchParams?.maSupport);
  const maSupportEnabled = maSupportParam === "1";
  const isFiltered = symbols.length > 0;

  const { sectorIndustryMap } = filterOptions;

  const filterParams = {
    symbols: isFiltered ? symbols : undefined,
    industries: selectedIndustries,
    sectors: selectedSectors,
    countries: selectedCountries,
    excludeEtfs: excludeEtfsEnabled,
    maSupport: maSupportEnabled,
  };

  const [{ values, hasMore }, totalCount] = await Promise.all([
    getValues(isFiltered ? 1 : currentPage, filterParams),
    getValuesCount(filterParams),
  ]);

  // Single href builder for every navigation this card triggers (pagination,
  // removing one symbol/industry/sector/country, clearing all symbols,
  // toggling excludeEtfs/maSupport) — each just overrides the one field that
  // changed and leaves everything else at its current selected value.
  const buildHref = (overrides: {
    page?: number;
    symbols?: string[];
    industries?: string[];
    sectors?: string[];
    countries?: string[];
    excludeEtfs?: boolean;
    maSupport?: boolean;
  }) => {
    const p = new URLSearchParams();
    const syms = overrides.symbols ?? symbols;
    const inds = overrides.industries ?? selectedIndustries;
    const secs = overrides.sectors ?? selectedSectors;
    const cous = overrides.countries ?? selectedCountries;
    const exc = overrides.excludeEtfs ?? excludeEtfsEnabled;
    const mas = overrides.maSupport ?? maSupportEnabled;
    if (overrides.page) p.set("page", overrides.page.toString());
    for (const symbol of syms) p.append("symbol", symbol);
    for (const industry of inds) p.append("industry", industry);
    for (const sector of secs) p.append("sector", sector);
    for (const country of cous) p.append("country", country);
    if (!exc) p.set("excludeEtfs", "0");
    if (mas) p.set("maSupport", "1");
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  // Removing a sector chip can invalidate a currently-selected industry that
  // only belonged to that sector — re-validate the industry selection
  // against the sector set the removal leaves behind, same as the live
  // sector checkbox toggle does in FiltersFormClient.
  const buildSectorRemoveHref = (sectorToRemove: string) => {
    const nextSectors = selectedSectors.filter((s) => s !== sectorToRemove);
    const nextIndustries = pruneIndustriesForSectors(selectedIndustries, nextSectors, sectorIndustryMap);
    return buildHref({ sectors: nextSectors, industries: nextIndustries });
  };

  const chips = [
    ...symbols.map((symbol) => ({
      id: `symbol:${symbol}`,
      label: symbol,
      removeHref: buildHref({ symbols: symbols.filter((s) => s !== symbol) }),
      ariaLabel: `Remove ${symbol} filter`,
    })),
    // The other filters are disregarded (and their pills hidden) while any
    // individual stock is selected — only the symbol chips above show.
    ...(!isFiltered && excludeEtfsEnabled ? [{
      id: "excludeEtfs",
      label: "ETFs excluded",
      icon: "bi-slash-circle",
      removeHref: buildHref({ excludeEtfs: false }),
      ariaLabel: "Remove ETFs excluded filter",
    }] : []),
    ...(!isFiltered ? selectedSectors.map((sector) => ({
      id: `sector:${sector}`,
      label: sector,
      removeHref: buildSectorRemoveHref(sector),
      ariaLabel: `Remove ${sector} filter`,
    })) : []),
    ...(!isFiltered ? selectedIndustries.map((industry) => ({
      id: `industry:${industry}`,
      label: industry,
      removeHref: buildHref({ industries: selectedIndustries.filter((i) => i !== industry) }),
      ariaLabel: `Remove ${industry} filter`,
    })) : []),
    ...(!isFiltered ? selectedCountries.map((country) => ({
      id: `country:${country}`,
      label: country,
      removeHref: buildHref({ countries: selectedCountries.filter((c) => c !== country) }),
      ariaLabel: `Remove ${country} filter`,
    })) : []),
    ...(!isFiltered && maSupportEnabled ? [{
      id: "maSupport",
      label: "MA support",
      removeHref: buildHref({ maSupport: false }),
      ariaLabel: "Remove moving average support filter",
    }] : []),
  ];

  return (
    <div>
      <section className="card-body pb-2">
        <ResultsSummaryClient
          totalCount={totalCount}
          chips={chips}
          isFiltered={isFiltered}
          clearAllSymbolsHref={buildHref({ symbols: [] })}
        />
      </section>
      <section className="card glass-card mb-4 pt-3">
        <div className="card-body pt-0">
          <ScoreExplanationModal />
          <PaginationWithLoader
            currentPage={currentPage}
            hasMore={hasMore}
            isFiltered={isFiltered}
            symbols={symbols}
            selectedIndustries={selectedIndustries}
            selectedSectors={selectedSectors}
            selectedCountries={selectedCountries}
            excludeEtfsEnabled={excludeEtfsEnabled}
            maSupportEnabled={maSupportEnabled}
          >
            {values.length === 0 ? (
              <p className="text-muted text-center mb-0">
                No results found
              </p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {values.map((item) => (
                  <StockResultCard key={item._id} item={item} compact />
                ))}
              </div>
            )}
          </PaginationWithLoader>
        </div>
      </section>
    </div >
  );
}

function ResultsLoadingFallback({
  isFiltered = false,
  symbols = [],
  selectedIndustries = [],
  selectedSectors = [],
  selectedCountries = [],
  excludeEtfsEnabled = true,
  maSupportEnabled = false,
}: {
  isFiltered?: boolean;
  symbols?: string[];
  selectedIndustries?: string[];
  selectedSectors?: string[];
  selectedCountries?: string[];
  excludeEtfsEnabled?: boolean;
  maSupportEnabled?: boolean;
}) {
  return (
    <div className="d-flex flex-column flex-grow-1">
      <section className="card-body pb-2" aria-hidden="true">
        <div className="results-summary">
          <div className="active-filter-chips">
            {isFiltered ? (
              <>
                {symbols.map((symbol) => (
                  <span key={symbol} className="active-filter-chip active-filter-chip--skeleton">
                    {symbol}
                    <i className="bi bi-x" />
                  </span>
                ))}
              </>
            ) : (
              <>
                {excludeEtfsEnabled && (
                  <span className="active-filter-chip active-filter-chip--skeleton">
                    <i className="bi bi-slash-circle active-filter-chip__icon" />
                    ETFs excluded
                    <i className="bi bi-x" />
                  </span>
                )}
                {selectedSectors.map((sector) => (
                  <span key={`sector:${sector}`} className="active-filter-chip active-filter-chip--skeleton">
                    {sector}
                    <i className="bi bi-x" />
                  </span>
                ))}
                {selectedIndustries.map((industry) => (
                  <span key={`industry:${industry}`} className="active-filter-chip active-filter-chip--skeleton">
                    {industry}
                    <i className="bi bi-x" />
                  </span>
                ))}
                {selectedCountries.map((country) => (
                  <span key={`country:${country}`} className="active-filter-chip active-filter-chip--skeleton">
                    {country}
                    <i className="bi bi-x" />
                  </span>
                ))}
                {maSupportEnabled && (
                  <span className="active-filter-chip active-filter-chip--skeleton">
                    MA support
                    <i className="bi bi-x" />
                  </span>
                )}
              </>
            )}
          </div>
          <p className="results-summary__count--skeleton" />
        </div>
      </section>
      <section className="card glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
        <div className="card-body pt-0 page-loading-results-card-body d-flex flex-column">
          <nav
            aria-label="Results pages"
            className="d-flex align-items-center justify-content-between mb-3"
            aria-busy="true"
            aria-live="polite"
          >
            <span
              className="page-change-icon page-change-icon-disabled"
              style={{ width: "1.75rem" }}
              aria-hidden
            >
              <i className="bi bi-chevron-left" />
            </span>
            <span className="pagination-page-label align-self-center">Page 1</span>
            <span
              className="page-change-icon page-change-icon-disabled"
              style={{ width: "1.75rem" }}
              aria-hidden
            >
              <i className="bi bi-chevron-right" />
            </span>
          </nav>
          <div className="d-flex flex-column gap-2" role="status" aria-live="polite">
            <span className="visually-hidden">Loading results…</span>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonStockCard key={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<HomeSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const symbols = getSelectedSymbols(resolvedSearchParams?.symbol);
  const selectedIndustries = getSelectedValues(resolvedSearchParams?.industry);
  const selectedSectors = getSelectedValues(resolvedSearchParams?.sector);
  const selectedCountries = getSelectedValues(resolvedSearchParams?.country);
  const excludeEtfsEnabled = getSearchParamValue(resolvedSearchParams?.excludeEtfs) !== "0";
  const maSupportEnabled = getSearchParamValue(resolvedSearchParams?.maSupport) === "1";

  const isFiltered = symbols.length > 0;

  return (
    <div className="min-vh-100">
      <HomeNavigationProvider>
        <AppNavbar
          searchInitialQuery=""
          searchSelected={symbols.length > 0}
        />
        <main className="container pt-5 mt-4 home-page">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <section
                className="card glass-card monthly-balances-page-heading home-page__assessments-title"
                aria-label="Current Assessments"
              >
                <div className="card-body monthly-balances-page-heading-body px-3 px-sm-4">
                  <h2 className="h5 mb-0">Current Assessments</h2>
                  <p className="home-page__tagline mb-0">
                    AI-powered value investing research — search by ticker or name — not investing advice.
                  </p>
                </div>
              </section>
              <div className="text-center mb-2 mt-1">
                <DisclosureModal />
              </div>
              {/* Filters dropdown is hidden entirely (both while loading and
                  once loaded) while any individual stock is selected — its
                  criteria are disregarded in that mode anyway (see
                  buildValueFilterConditions), so showing it would be
                  misleading. */}
              <Suspense fallback={isFiltered ? null : <FiltersLoadingFallback />}>
                <FiltersAsyncWrapper searchParams={searchParams} />
              </Suspense>
              <Suspense fallback={
                <ResultsLoadingFallback
                  isFiltered={isFiltered}
                  symbols={symbols}
                  selectedIndustries={selectedIndustries}
                  selectedSectors={selectedSectors}
                  selectedCountries={selectedCountries}
                  excludeEtfsEnabled={excludeEtfsEnabled}
                  maSupportEnabled={maSupportEnabled}
                />
              }>
                <ResultsCard searchParams={searchParams} />
              </Suspense>
            </div>
          </div>
        </main>
      </HomeNavigationProvider>
    </div>
  )
};
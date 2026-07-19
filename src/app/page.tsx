import { cache, Suspense } from "react";

import clientPromise from "@/lib/mongodb";
import { docToValueRecord, getPricesBySymbols, type DocInput, type ValueRecord } from "@/lib/value-search";
import AppNavbar from "../app/components/AppNavbar";
import PaginationWithLoader from "../app/components/PaginationWithLoader";
import StockResultCard from "../app/components/StockResultCard";
import ScoreExplanationModal from "../app/components/ScoreExplanationModal";
import DisclosureModal from "../app/components/DisclosureModal";
import ResultsSummaryClient from "../app/components/ResultsSummaryClient";
import FiltersFormClient from "../app/components/FiltersFormClient";

const VALUE_SCORE_BREAKDOWN: { key: string; label: string }[] = [
  { key: "healthyPE", label: "Healthy P/E (0–15)" },
  { key: "healthyFuturePE", label: "Healthy Forward P/E (0–15)" },
  { key: "profitMarginPositive", label: "Positive profit margin" },
  { key: "forwardPEGreater", label: "Forward P/E ≥ current P/E" },
  { key: "healthyDebtEquity", label: "Healthy debt/equity (0–2)" },
  { key: "healthyPriceBook", label: "Healthy P/B (0.95–1.1)" },
  { key: "healthyPriceSales", label: "Healthy P/S (0–2)" },
  { key: "movingAveragesGreaterThanPrice", label: "MAs > price & 200d > 50d" },
  { key: "movingAverageSupport", label: "Moving average support" },
  { key: "returnOnEquity", label: "Return on equity" },
  { key: "returnOnInvestment", label: "Return on investment" },
  { key: "priceToEarningsGrowth", label: "Price/earnings growth" },
  { key: "relativeStengthIndex", label: "Relative strength index (30–70)" },
  { key: "earningsPerShareGrowingNextYear", label: "EPS growing next year" },
];

const PAGE_SIZE = 25;
const EXCLUDED_ETF_INDUSTRY = "Exchange Traded Fund";

type FilterOptions = {
  industries: string[];
  sectors: string[];
  countries: string[];
};

function FiltersSection({
  filterOptions,
  query,
  isSelected,
  selectedIndustry,
  selectedSector,
  selectedCountry,
  excludeEtfsEnabled,
  maSupportEnabled,
}: {
  filterOptions: FilterOptions;
  query: string;
  isSelected: boolean;
  selectedIndustry: string;
  selectedSector: string;
  selectedCountry: string;
  excludeEtfsEnabled: boolean;
  maSupportEnabled: boolean;
}) {
  const { industries, sectors, countries } = filterOptions;
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
                selectedIndustry={selectedIndustry}
                selectedSector={selectedSector}
                selectedCountry={selectedCountry}
                excludeEtfsEnabled={excludeEtfsEnabled}
                maSupportEnabled={maSupportEnabled}
                query={query}
                isSelected={isSelected}
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
            <div className="accordion-body d-flex align-items-center justify-content-center py-4">
              <span className="spinner-border spinner-border-sm me-2" aria-hidden />
              <span className="small text-muted">Loading filters…</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function FiltersAsyncWrapper({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    selected?: string;
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: string | string[];
    maSupport?: string | string[];
  }>;
}) {
  const [resolvedSearchParams, filterOptions] = await Promise.all([
    searchParams,
    getFilterOptions(),
  ]);
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";
  const selectedIndustry = resolvedSearchParams?.industry ?? "";
  const selectedSector = resolvedSearchParams?.sector ?? "";
  const selectedCountry = resolvedSearchParams?.country ?? "";
  const excludeEtfsParam = getSearchParamValue(resolvedSearchParams?.excludeEtfs);
  const excludeEtfsEnabled = excludeEtfsParam !== "0";
  const maSupportParam = getSearchParamValue(resolvedSearchParams?.maSupport);
  const maSupportEnabled = maSupportParam === "1";
  return (
    <FiltersSection
      filterOptions={filterOptions}
      query={query}
      isSelected={isSelected}
      selectedIndustry={selectedIndustry}
      selectedSector={selectedSector}
      selectedCountry={selectedCountry}
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

  const industries = industriesDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  const sectors = sectorsDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  const countries = countriesDocs
    .map((doc) => doc.value)
    .filter((value): value is string => typeof value === "string");

  return {
    industries,
    sectors,
    countries,
  };
});

async function getValues(
  page: number,
  {
    symbolFilter,
    industry,
    sector,
    country,
    excludeEtfs,
    maSupport,
  }: {
    symbolFilter?: string;
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: boolean;
    maSupport?: boolean;
  },
): Promise<{ values: ValueRecord[]; hasMore: boolean }> {
  if (excludeEtfs && industry === EXCLUDED_ETF_INDUSTRY) {
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
  const filter: Record<string, unknown> = {};

  if (symbolFilter && symbolFilter.trim().length > 0) {
    filter.symbol = {
      $regex: `^${escapeRegExp(symbolFilter.trim())}$`,
      $options: "i",
    };
  }

  if (industry && industry.trim().length > 0) {
    filter.industry = industry;
  } else if (excludeEtfs) {
    filter.industry = { $ne: EXCLUDED_ETF_INDUSTRY };
  }

  if (sector && sector.trim().length > 0) {
    filter.sector = sector;
  }

  if (country && country.trim().length > 0) {
    filter.country = country;
  }

  if (maSupport) {
    filter["valueSearchScore.movingAverageSupport"] = { $gte: 1 };
  }

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

  const symbols = pageDocs
    .map((d) => (typeof d.symbol === "string" ? d.symbol : undefined))
    .filter((s): s is string => Boolean(s));
  const priceBySymbol = await getPricesBySymbols(symbols);

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
  symbolFilter,
  industry,
  sector,
  country,
  excludeEtfs,
  maSupport,
}: {
  symbolFilter?: string;
  industry?: string;
  sector?: string;
  country?: string;
  excludeEtfs?: boolean;
  maSupport?: boolean;
}): Promise<number> {
  if (excludeEtfs && industry === EXCLUDED_ETF_INDUSTRY) {
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
  const filter: Record<string, unknown> = {};

  if (symbolFilter && symbolFilter.trim().length > 0) {
    filter.symbol = {
      $regex: `^${escapeRegExp(symbolFilter.trim())}$`,
      $options: "i",
    };
  }

  if (industry && industry.trim().length > 0) {
    filter.industry = industry;
  } else if (excludeEtfs) {
    filter.industry = { $ne: EXCLUDED_ETF_INDUSTRY };
  }

  if (sector && sector.trim().length > 0) {
    filter.sector = sector;
  }

  if (country && country.trim().length > 0) {
    filter.country = country;
  }

  if (maSupport) {
    filter["valueSearchScore.movingAverageSupport"] = { $gte: 1 };
  }

  const totalCount = await db.collection(aiAssessmentsCollection).countDocuments(filter);
  return totalCount;
}

async function ResultsCard({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    selected?: string;
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: string | string[];
    maSupport?: string | string[];
  }>;
}) {
  const [resolvedSearchParams, filterOptions] = await Promise.all([
    searchParams,
    getFilterOptions(),
  ]);
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isNaN(requestedPage) ? 1 : Math.max(1, requestedPage);
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";
  const selectedIndustry = resolvedSearchParams?.industry ?? "";
  const selectedSector = resolvedSearchParams?.sector ?? "";
  const selectedCountry = resolvedSearchParams?.country ?? "";
  const excludeEtfsParam = getSearchParamValue(resolvedSearchParams?.excludeEtfs);
  const excludeEtfsEnabled = excludeEtfsParam !== "0";
  const maSupportParam = getSearchParamValue(resolvedSearchParams?.maSupport);
  const maSupportEnabled = maSupportParam === "1";
  const isFiltered = isSelected && query.length > 0;

  const { industries, sectors, countries } = filterOptions;

  const filterParams = {
    symbolFilter: isFiltered ? query : undefined,
    industry: selectedIndustry || undefined,
    sector: selectedSector || undefined,
    country: selectedCountry || undefined,
    excludeEtfs: excludeEtfsEnabled,
    maSupport: maSupportEnabled,
  };

  const [{ values, hasMore }, totalCount] = await Promise.all([
    getValues(isFiltered ? 1 : currentPage, filterParams),
    getValuesCount(filterParams),
  ]);

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    if (query) params.set("q", query);
    if (isSelected) params.set("selected", "1");
    if (selectedIndustry) params.set("industry", selectedIndustry);
    if (selectedSector) params.set("sector", selectedSector);
    if (selectedCountry) params.set("country", selectedCountry);
    if (!excludeEtfsEnabled) params.set("excludeEtfs", "0");
    if (maSupportEnabled) params.set("maSupport", "1");
    const search = params.toString();
    return search.length > 0 ? `/?${search}` : "/";
  };

  // Build a URL that preserves all current params except the ones explicitly overridden
  const buildChipHref = (overrides: {
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: boolean;
    maSupport?: boolean;
  }) => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (isSelected) p.set("selected", "1");
    const ind = "industry" in overrides ? overrides.industry : selectedIndustry;
    const sec = "sector" in overrides ? overrides.sector : selectedSector;
    const cou = "country" in overrides ? overrides.country : selectedCountry;
    const exc = "excludeEtfs" in overrides ? overrides.excludeEtfs : excludeEtfsEnabled;
    const mas = "maSupport" in overrides ? overrides.maSupport : maSupportEnabled;
    if (ind) p.set("industry", ind);
    if (sec) p.set("sector", sec);
    if (cou) p.set("country", cou);
    if (!exc) p.set("excludeEtfs", "0");
    if (mas) p.set("maSupport", "1");
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const chips = [
    ...(excludeEtfsEnabled ? [{
      id: "excludeEtfs",
      label: "ETFs excluded",
      icon: "bi-slash-circle",
      removeHref: buildChipHref({ excludeEtfs: false }),
      ariaLabel: "Remove ETFs excluded filter",
    }] : []),
    ...(selectedIndustry ? [{
      id: "industry",
      label: selectedIndustry,
      removeHref: buildChipHref({ industry: "" }),
      ariaLabel: "Remove industry filter",
    }] : []),
    ...(selectedSector ? [{
      id: "sector",
      label: selectedSector,
      removeHref: buildChipHref({ sector: "" }),
      ariaLabel: "Remove sector filter",
    }] : []),
    ...(selectedCountry ? [{
      id: "country",
      label: selectedCountry,
      removeHref: buildChipHref({ country: "" }),
      ariaLabel: "Remove country filter",
    }] : []),
    ...(maSupportEnabled ? [{
      id: "maSupport",
      label: "MA support",
      removeHref: buildChipHref({ maSupport: false }),
      ariaLabel: "Remove moving average support filter",
    }] : []),
  ];

  return (
    <div>
      <section className="card-body pb-2">
        <ResultsSummaryClient totalCount={totalCount} chips={chips} />
      </section>
      <section className="card glass-card mb-4 pt-3">
        <div className="card-body pt-0">
          <ScoreExplanationModal />
          <PaginationWithLoader
            currentPage={currentPage}
            hasMore={hasMore}
            isFiltered={isFiltered}
            query={query}
            isSelected={isSelected}
            selectedIndustry={selectedIndustry}
            selectedSector={selectedSector}
            selectedCountry={selectedCountry}
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
  selectedIndustry = "",
  selectedSector = "",
  selectedCountry = "",
  excludeEtfsEnabled = true,
  maSupportEnabled = false,
}: {
  selectedIndustry?: string;
  selectedSector?: string;
  selectedCountry?: string;
  excludeEtfsEnabled?: boolean;
  maSupportEnabled?: boolean;
}) {
  return (
    <div className="d-flex flex-column flex-grow-1">
      <section className="card-body pb-2" aria-hidden="true">
        <div className="results-summary">
          <div className="active-filter-chips">
            {excludeEtfsEnabled && (
              <span className="active-filter-chip active-filter-chip--skeleton">
                <i className="bi bi-slash-circle active-filter-chip__icon" />
                ETFs excluded
                <i className="bi bi-x" />
              </span>
            )}
            {selectedIndustry && (
              <span className="active-filter-chip active-filter-chip--skeleton">
                {selectedIndustry}
                <i className="bi bi-x" />
              </span>
            )}
            {selectedSector && (
              <span className="active-filter-chip active-filter-chip--skeleton">
                {selectedSector}
                <i className="bi bi-x" />
              </span>
            )}
            {selectedCountry && (
              <span className="active-filter-chip active-filter-chip--skeleton">
                {selectedCountry}
                <i className="bi bi-x" />
              </span>
            )}
            {maSupportEnabled && (
              <span className="active-filter-chip active-filter-chip--skeleton">
                MA support
                <i className="bi bi-x" />
              </span>
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
          <div
            className="d-flex flex-column align-items-center justify-content-center flex-grow-1"
            role="status"
            aria-live="polite"
          >
            <span className="spinner-border" aria-hidden />
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    selected?: string;
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: string | string[];
    maSupport?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";
  const selectedIndustry = resolvedSearchParams?.industry ?? "";
  const selectedSector = resolvedSearchParams?.sector ?? "";
  const selectedCountry = resolvedSearchParams?.country ?? "";
  const excludeEtfsEnabled = getSearchParamValue(resolvedSearchParams?.excludeEtfs) !== "0";
  const maSupportEnabled = getSearchParamValue(resolvedSearchParams?.maSupport) === "1";

  return (
    <div className="min-vh-100">
      <AppNavbar
        searchInitialQuery={query}
        searchSelected={isSelected}
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
            <Suspense fallback={<FiltersLoadingFallback />}>
              <FiltersAsyncWrapper searchParams={searchParams} />
            </Suspense>
            <Suspense fallback={
              <ResultsLoadingFallback
                selectedIndustry={selectedIndustry}
                selectedSector={selectedSector}
                selectedCountry={selectedCountry}
                excludeEtfsEnabled={excludeEtfsEnabled}
                maSupportEnabled={maSupportEnabled}
              />
            }>
              <ResultsCard searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
};
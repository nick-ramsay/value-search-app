import Link from "next/link";
import { cache, Suspense } from "react";

import clientPromise from "@/lib/mongodb";
import SearchBar from "../app/components/SearchBar";
import FilterClearButton from "../app/components/FilterClearButton";
import ThemeSwitcher from "../app/components/ThemeSwitcher";
import PaginationWithLoader from "../app/components/PaginationWithLoader";
import ScoreModalTrigger from "../app/components/ScoreModalTrigger";
import ScoreExplanationModal from "../app/components/ScoreExplanationModal";
import HistoryCharts from "../app/components/HistoryCharts";

type ValueSearchScoreDisplay = {
  calculatedScorePercentage: number;
  totalPossiblePoints: number;
  totalCalculatedPoints?: number;
  [key: string]: unknown;
};

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

type ValueRecord = {
  _id: string;
  symbol?: string;
  name?: string;
  aiRating?: string;
  aiRatingScore?: number;
  assessment?: string;
  industry?: string;
  sector?: string;
  country?: string;
  valueSearchScore?: ValueSearchScoreDisplay;
};

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
}: {
  filterOptions: FilterOptions;
  query: string;
  isSelected: boolean;
  selectedIndustry: string;
  selectedSector: string;
  selectedCountry: string;
  excludeEtfsEnabled: boolean;
}) {
  const { industries, sectors, countries } = filterOptions;
  return (
    <section>
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
              <form method="get" action="/" className="row g-3">
                <input type="hidden" name="q" value={query} />
                {isSelected ? <input type="hidden" name="selected" value="1" /> : null}
                <div className="col-md-4">
                  <label htmlFor="industry" className="form-label fw-semibold">
                    Industry
                  </label>
                  <select
                    id="industry"
                    name="industry"
                    className="form-select glass-select"
                    defaultValue={selectedIndustry}
                  >
                    <option value="">All industries</option>
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label htmlFor="sector" className="form-label fw-semibold">
                    Sector
                  </label>
                  <select
                    id="sector"
                    name="sector"
                    className="form-select glass-select"
                    defaultValue={selectedSector}
                  >
                    <option value="">All sectors</option>
                    {sectors.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label htmlFor="country" className="form-label fw-semibold">
                    Country
                  </label>
                  <select
                    id="country"
                    name="country"
                    className="form-select glass-select"
                    defaultValue={selectedCountry}
                  >
                    <option value="">All countries</option>
                    {countries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <span className="form-label fw-semibold d-block">
                    Exclude ETFs
                  </span>
                  <div className="filter-toggle">
                    <input type="hidden" name="excludeEtfs" value="0" />
                    <input
                      type="checkbox"
                      id="excludeEtfs"
                      name="excludeEtfs"
                      value="1"
                      className="filter-toggle-input"
                      defaultChecked={excludeEtfsEnabled}
                    />
                    <label htmlFor="excludeEtfs" className="filter-toggle-label">
                      <span className="filter-toggle-slider" aria-hidden />
                      <span className="filter-toggle-text" />
                    </label>
                  </div>
                </div>
                <div className="col-12 d-flex justify-content-end gap-2 mt-2">
                  {(selectedIndustry || selectedSector || selectedCountry || !excludeEtfsEnabled) && (
                    <FilterClearButton className="btn btn-sm filter-clear-button" />
                  )}
                  <button
                    type="submit"
                    className="btn btn-light btn-sm filter-apply-button"
                  >
                    Apply
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FiltersLoadingFallback() {
  return (
    <section>
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
  return (
    <FiltersSection
      filterOptions={filterOptions}
      query={query}
      isSelected={isSelected}
      selectedIndustry={selectedIndustry}
      selectedSector={selectedSector}
      selectedCountry={selectedCountry}
      excludeEtfsEnabled={excludeEtfsEnabled}
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

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function getRatingBadgeClass(rating: string) {
  switch (rating) {
    case "STRONG BUY":
      return "badge bg-success text-white";
    case "BUY":
      return "badge bg-success-subtle text-success";
    case "NEUTRAL":
      return "badge bg-primary text-white";
    case "SELL":
      return "badge bg-danger-subtle text-danger";
    case "STRONG SELL":
      return "badge bg-danger text-white";
    default:
      return "badge bg-secondary text-white";
  }
}

function getValueScoreBadgeClass(calculatedScorePercentage: number): string {
  if (calculatedScorePercentage > 0.66) return "badge bg-success text-white";
  if (calculatedScorePercentage >= 0.33) return "badge bg-warning text-dark";
  return "badge bg-danger text-white";
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
  }: {
    symbolFilter?: string;
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: boolean;
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

  const values = pageDocs.map((doc) => {
    const symbol = typeof doc.symbol === "string" ? doc.symbol : undefined;
    const valueSearchScore = doc.valueSearchScore as ValueSearchScoreDisplay | undefined;
    let normalized: ValueSearchScoreDisplay | undefined;
    if (valueSearchScore) {
      const totalPossiblePoints = Number(valueSearchScore.totalPossiblePoints);
      const calculatedScorePercentage = Number(valueSearchScore.calculatedScorePercentage);
      if (totalPossiblePoints > 0 && !Number.isNaN(calculatedScorePercentage)) {
        normalized = {
          ...valueSearchScore,
          calculatedScorePercentage,
          totalPossiblePoints,
        };
      }
    }
    return {
      _id: doc._id.toString(),
      symbol,
      aiRating: typeof doc.aiRating === "string" ? doc.aiRating : undefined,
      aiRatingScore: typeof doc.aiRatingScore === "number" ? doc.aiRatingScore : undefined,
      assessment: typeof doc.assessment === "string" ? doc.assessment : undefined,
      name: typeof doc.name === "string" ? doc.name : undefined,
      industry: typeof doc.industry === "string" ? doc.industry : undefined,
      sector: typeof doc.sector === "string" ? doc.sector : undefined,
      country: typeof doc.country === "string" ? doc.country : undefined,
      valueSearchScore: normalized,
    };
  });

  return { values, hasMore };
}

async function getValuesCount({
  symbolFilter,
  industry,
  sector,
  country,
  excludeEtfs,
}: {
  symbolFilter?: string;
  industry?: string;
  sector?: string;
  country?: string;
  excludeEtfs?: boolean;
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
  const isFiltered = isSelected && query.length > 0;

  const { industries, sectors, countries } = filterOptions;

  const filterParams = {
    symbolFilter: isFiltered ? query : undefined,
    industry: selectedIndustry || undefined,
    sector: selectedSector || undefined,
    country: selectedCountry || undefined,
    excludeEtfs: excludeEtfsEnabled,
  };

  const { values, hasMore } = await getValues(isFiltered ? 1 : currentPage, filterParams);
  const totalCount = await getValuesCount(filterParams);

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    if (query) params.set("q", query);
    if (isSelected) params.set("selected", "1");
    if (selectedIndustry) params.set("industry", selectedIndustry);
    if (selectedSector) params.set("sector", selectedSector);
    if (selectedCountry) params.set("country", selectedCountry);
    if (!excludeEtfsEnabled) params.set("excludeEtfs", "0");
    const search = params.toString();
    return search.length > 0 ? `/?${params.toString()}` : "/";
  };

  return (
    <div>
      <section className="card-body pb-2">
        <p className="text-muted small mb-0 text-center">
          {(() => {
            const appliedFilters: string[] = [];
            if (selectedIndustry) appliedFilters.push(`Industry: ${selectedIndustry}`);
            if (selectedSector) appliedFilters.push(`Sector: ${selectedSector}`);
            if (selectedCountry) appliedFilters.push(`Country: ${selectedCountry}`);
            if (!excludeEtfsEnabled) appliedFilters.push("Include ETFs");

            const baseText = `${totalCount} ${totalCount === 1 ? "result" : "results"}`;

            if (appliedFilters.length === 0) {
              return baseText;
            }

            return `${baseText} filtered by ${appliedFilters.join(", ")}`;
          })()}
        </p>
      </section>
      <section className="card liquid-glass-card mb-4 pt-3">
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
          >
            {values.length === 0 ? (
              <p className="text-muted text-center mb-0">
                No results found
              </p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {values.map((item) => {
                  const accordionId = `accordion-${item._id}`;
                  const headingId = `heading-${item._id}`;
                  const collapseId = `collapse-${item._id}`;

                  return (
                    <div key={item._id} className="card result-item-glass">
                      <div className="card-body text-center p-0">
                        <div className="result-card-header">
                          <div className="result-card-title">
                            {item.symbol ? (
                              <a
                                href={
                                  "https://finviz.com/quote.ashx?t=" +
                                  item.symbol.replace(".", "-") +
                                  "&ty=l&ta=0&p=w"
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="result-card-title-link"
                              >
                                {(item.name ? item.name : "") + (item.symbol ? " (" + item.symbol + ")" : "" + ")")}
                                <i className="bi bi-link-45deg ms-1 result-card-title-link-icon" aria-hidden />
                              </a>
                            ) : (
                              ""
                            )}
                          </div>
                          <div className="text-secondary mt-2 mb-2 row g-2">
                            <div
                              className={
                                item.valueSearchScore != null &&
                                item.valueSearchScore.totalPossiblePoints > 0 &&
                                typeof item.valueSearchScore.calculatedScorePercentage === "number"
                                  ? "col-6 d-flex justify-content-center"
                                  : "col-12 d-flex justify-content-center"
                              }
                            >
                              {item.aiRating ? (
                                <span className={`${getRatingBadgeClass(item.aiRating)} result-card-badge`}>
                                  AI Rating: {toTitleCase(item.aiRating)}
                                </span>
                              ) : null}
                            </div>
                            {item.valueSearchScore != null &&
                              item.valueSearchScore.totalPossiblePoints > 0 &&
                              typeof item.valueSearchScore.calculatedScorePercentage === "number" ? (
                              <div className="col-6 d-flex justify-content-center">
                                <ScoreModalTrigger
                                  modalId={`score-modal-${item._id}`}
                                  name={item.name}
                                  symbol={item.symbol}
                                  valueSearchScore={item.valueSearchScore}
                                  buttonClassName={getValueScoreBadgeClass(item.valueSearchScore.calculatedScorePercentage)}
                                  buttonLabel={`Score: ${(item.valueSearchScore.calculatedScorePercentage * 100).toFixed(0)}%`}
                                />
                              </div>
                            ) : null}
                          </div>
                          <HistoryCharts symbol={item.symbol} name={item.name ?? item.symbol} />
                        </div>
                        <div className="px-3 pb-3">
                        <div className="accordion" id={accordionId}>
                          <div className="accordion-item">
                            <h2 className="accordion-header" id={headingId}>
                              <button
                                className="accordion-button collapsed ai-accordion-button fw-bold"
                                type="button"
                                data-bs-toggle="collapse"
                                data-bs-target={`#${collapseId}`}
                                aria-expanded="false"
                                aria-controls={collapseId}
                              >
                                Assessment
                              </button>
                            </h2>
                            <div
                              id={collapseId}
                              className="accordion-collapse collapse"
                              data-bs-parent={`#${accordionId}`}
                              aria-labelledby={headingId}
                            >
                              <div className="accordion-body">
                                {item.assessment ? (
                                  <div className="text-secondary">
                                    {item.assessment}
                                  </div>
                                ) : (
                                  ""
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PaginationWithLoader>
        </div>
      </section>
    </div >
  );
}

function ResultsLoadingFallback() {
  return (
    <div className="d-flex flex-column flex-grow-1">
      <section className="card-body pb-2">
        <p className="text-muted small mb-0 text-center">
          0 results
        </p>
      </section>
      <section className="card liquid-glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
        <div className="card-body pt-0 page-loading-results-card-body d-flex flex-column">
          <nav
            aria-label="Results pages"
            className="d-flex align-items-center justify-content-between mb-4"
            aria-busy="true"
            aria-live="polite"
          >
            <span
              className="page-change-icon page-change-icon-disabled"
              style={{ width: "40px" }}
              aria-hidden
            >
              <i className="bi bi-chevron-left" />
            </span>
            <span className="align-self-center">Page 1</span>
            <span
              className="page-change-icon page-change-icon-disabled"
              style={{ width: "40px" }}
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
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";

  return (
    <div className="min-vh-100">
      <nav className="navbar navbar-expand-lg fixed-top w-100 liquid-navbar" style={{ padding: "0.5rem 0" }}>
        <div className="container-fluid px-3">
          <div className="d-flex flex-row align-items-center gap-2 w-100 flex-nowrap">
            <span className="navbar-brand mb-0 h1 text-truncate" style={{ minWidth: 0, fontWeight: 600 }}>
              <Link href="/" style={{ color: "var(--text-primary)", textDecoration: "none" }}>
                valuesearch.app
              </Link>
            </span>
            <div className="ms-auto d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
              <div className="flex-grow-1" style={{ maxWidth: "460px" }}>
                <SearchBar initialQuery={isSelected ? "" : query} />
              </div>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </nav>
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <Suspense fallback={<FiltersLoadingFallback />}>
              <FiltersAsyncWrapper searchParams={searchParams} />
            </Suspense>
            <Suspense fallback={<ResultsLoadingFallback />}>
              <ResultsCard searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
};
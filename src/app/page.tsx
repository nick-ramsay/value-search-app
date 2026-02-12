import Link from "next/link";
import { Suspense } from "react";

import clientPromise from "@/lib/mongodb";
import SearchBar from "../app/components/SearchBar";
import FilterClearButton from "../app/components/FilterClearButton";

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
};

const PAGE_SIZE = 25;

type FilterOptions = {
  industries: string[];
  sectors: string[];
  countries: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function getFilterOptions(): Promise<FilterOptions> {
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
}

async function getValues(
  page: number,
  {
    symbolFilter,
    industry,
    sector,
    country,
  }: {
    symbolFilter?: string;
    industry?: string;
    sector?: string;
    country?: string;
  },
): Promise<{ values: ValueRecord[]; hasMore: boolean }> {
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
  }

  if (sector && sector.trim().length > 0) {
    filter.sector = sector;
  }

  if (country && country.trim().length > 0) {
    filter.country = country;
  }

  const docs = await db
    .collection(aiAssessmentsCollection)
    .find(filter)
    .sort({ aiRatingScore: -1, name: 1, symbol: 1 })
    .skip(skip)
    .limit(PAGE_SIZE + 1)
    .toArray();
  const hasMore = docs.length > PAGE_SIZE;

  const values = docs.slice(0, PAGE_SIZE).map((doc) => ({
    _id: doc._id.toString(),
    symbol: typeof doc.symbol === "string" ? doc.symbol : undefined,
    aiRating: typeof doc.aiRating === "string" ? doc.aiRating : undefined,
    aiRatingScore: typeof doc.aiRatingScore === "number" ? doc.aiRatingScore : undefined,
    assessment: typeof doc.assessment === "string" ? doc.assessment : undefined,
    name: typeof doc.name === "string" ? doc.name : undefined,
    industry: typeof doc.industry === "string" ? doc.industry : undefined,
    sector: typeof doc.sector === "string" ? doc.sector : undefined,
    country: typeof doc.country === "string" ? doc.country : undefined,
  }));

  return { values, hasMore };
}

async function getValuesCount({
  symbolFilter,
  industry,
  sector,
  country,
}: {
  symbolFilter?: string;
  industry?: string;
  sector?: string;
  country?: string;
}): Promise<number> {
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
  filterOptions,
}: {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    selected?: string;
    industry?: string;
    sector?: string;
    country?: string;
  }>;
  filterOptions: FilterOptions;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isNaN(requestedPage) ? 1 : Math.max(1, requestedPage);
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";
  const selectedIndustry = resolvedSearchParams?.industry ?? "";
  const selectedSector = resolvedSearchParams?.sector ?? "";
  const selectedCountry = resolvedSearchParams?.country ?? "";
  const isFiltered = isSelected && query.length > 0;

  const { industries, sectors, countries } = filterOptions;

  const filterParams = {
    symbolFilter: isFiltered ? query : undefined,
    industry: selectedIndustry || undefined,
    sector: selectedSector || undefined,
    country: selectedCountry || undefined,
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
    const search = params.toString();
    return search.length > 0 ? `/?${params.toString()}` : "/";
  };

  return (
    <div>
      <section>
        <div className="accordion pb-3" id="filtersAccordion">
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
                      className="form-select"
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
                      className="form-select"
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
                      className="form-select"
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
                <div className="col-12 d-flex justify-content-end gap-2 mt-2">
                  {(selectedIndustry || selectedSector || selectedCountry) && (
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
      <section className="card-body pb-2">
        <p className="text-muted small mb-0 text-center">
          {(() => {
            const appliedFilters: string[] = [];
            if (selectedIndustry) appliedFilters.push(`Industry: ${selectedIndustry}`);
            if (selectedSector) appliedFilters.push(`Sector: ${selectedSector}`);
            if (selectedCountry) appliedFilters.push(`Country: ${selectedCountry}`);

            const baseText = `${totalCount} ${totalCount === 1 ? "result" : "results"}`;

            if (appliedFilters.length === 0) {
              return baseText;
            }

            return `${baseText} filtered by ${appliedFilters.join(", ")}`;
          })()}
        </p>
      </section>
      <section className="card shadow-sm mb-4 pt-3">
        <div className="card-body pt-0">
          {!isFiltered ? (
            <nav aria-label="Results pages" className="d-flex align-items-center justify-content-between mb-4">
              {currentPage > 1 ? (
                <Link
                  href={buildPageHref(currentPage - 1)}
                >
                  <i className="page-change-icon bi bi-chevron-left"></i>
                </Link>
              ) : (
                <span aria-hidden="true" style={{ width: "40px" }} />
              )
              }
              <span className="align-self-center">Page {currentPage}</span>
              {hasMore ? (
                <Link href={buildPageHref(currentPage + 1)}>
                  <i className="page-change-icon bi bi bi-chevron-right"></i>
                </Link>
              ) : (
                <span aria-hidden="true" style={{ width: "40px" }} />
              )}
            </nav>
          ) : null}
          {values.length === 0 ? (
            <p className="text-muted text-center mb-0">
              No values found
            </p>
          ) : (
            <>
              <div className="d-flex flex-column gap-3">
                {values.map((item) => {
                  const accordionId = `accordion-${item._id}`;
                  const headingId = `heading-${item._id}`;
                  const collapseId = `collapse-${item._id}`;

                  return (
                    <div key={item._id} className="card shadow-sm">
                      <div className="card-body text-center">
                        <div className="fw-semibold">
                          {item.symbol ? (
                            <a
                              href={
                                "https://finviz.com/quote.ashx?t=" +
                                item.symbol.replace(".", "-") +
                                "&ty=l&ta=0&p=w"
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              {(item.name ? item.name : "") + (item.symbol ? " (" + item.symbol + ")" : "" + ")")}
                            </a>
                          ) : (
                            ""
                          )}
                        </div>
                        <div className="text-secondary mt-2 mb-3">
                          {item.aiRating ? (
                            <span className={`${getRatingBadgeClass(item.aiRating)} fw-bold`}>
                              {toTitleCase(item.aiRating)}
                            </span>
                          ) : (
                            ""
                          )}
                        </div>
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
                  );
                })}
              </div>
              {!isFiltered && hasMore ? (
                <nav aria-label="Results pages" className="d-flex align-items-center justify-content-between mt-4">
                  {currentPage > 1 ? (
                    <Link
                      href={buildPageHref(currentPage - 1)}
                    >
                      <i className="page-change-icon bi bi-chevron-left"></i>
                    </Link>
                  ) : (
                    <span aria-hidden="true" style={{ width: "40px" }} />
                  )}
                  <span className="align-self-center">Page {currentPage}</span>
                  {hasMore ? (
                    <Link href={buildPageHref(currentPage + 1)}>
                      <i className="page-change-icon bi bi-chevron-right"></i>
                    </Link>
                  ) : (
                    <span aria-hidden="true" style={{ width: "40px" }} />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div >
  );
}

function ResultsLoadingFallback() {
  return (
    <section className="card shadow-sm mb-4">
      <div className="card-body d-flex flex-column align-items-center justify-content-center py-5">
        <div className="d-flex align-items-center gap-2" role="status" aria-live="polite">
          <span className="spinner-border" aria-hidden="true"></span>
        </div>
      </div>
    </section>
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
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const filterOptions = await getFilterOptions();

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg bg-white border-bottom fixed-top w-100 shadow-sm">
        <div className="container-fluid px-3">
          <div className="d-flex flex-row align-items-center gap-2 w-100 flex-nowrap">
            <span className="navbar-brand mb-0 h1 text-truncate" style={{ minWidth: 0 }}>
              <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
                valuesearch.app
              </Link>
            </span>
            <div className="ms-auto flex-grow-1" style={{ minWidth: 0, maxWidth: "460px" }}>
              <SearchBar initialQuery={query} />
            </div>
          </div>
        </div>
      </nav>
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <Suspense fallback={<ResultsLoadingFallback />}>
              <ResultsCard searchParams={searchParams} filterOptions={filterOptions} />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
};
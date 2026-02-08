import Link from "next/link";

import clientPromise from "@/lib/mongodb";
import SearchBar from "../app/components/SearchBar";

type ValueRecord = {
  _id: string;
  symbol?: string;
  name?: string;
  aiRating?: string;
  aiRatingScore?: number;
  assessment?: string;
};

const PAGE_SIZE = 25;

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

async function getValues(
  page: number,
  symbolFilter?: string,
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
  const filter =
    symbolFilter && symbolFilter.trim().length > 0
      ? {
          symbol: {
            $regex: `^${escapeRegExp(symbolFilter.trim())}$`,
            $options: "i",
          },
        }
      : {};
  const docs = await db
    .collection(aiAssessmentsCollection)
    .find(filter)
    .sort({ aiRatingScore: -1, name: 1, symbol: 1})
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
  }));

  return { values, hasMore };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; q?: string; selected?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedPage = Number.parseInt(resolvedSearchParams?.page ?? "1", 10);
  const currentPage = Number.isNaN(requestedPage) ? 1 : Math.max(1, requestedPage);
  const query = resolvedSearchParams?.q?.trim() ?? "";
  const isSelected = resolvedSearchParams?.selected === "1";
  const isFiltered = isSelected && query.length > 0;
  const { values, hasMore } = await getValues(isFiltered ? 1 : currentPage, isFiltered ? query : undefined);

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg bg-white border-bottom fixed-top w-100 shadow-sm">
        <div className="container-fluid px-3">
          <div className="d-flex align-items-center gap-3 w-100">
            <span className="navbar-brand mb-0 h1"><a href="/" style={{ color: "inherit", textDecoration: "none" }}>valuesearch.app</a></span>
            <div className="ms-auto" style={{ minWidth: "280px", maxWidth: "460px", width: "100%" }}>
              <SearchBar initialQuery={query} />
            </div>
          </div>
        </div>
      </nav>
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <section className="card shadow-sm">
              <div className="card-body">
                {!isFiltered ? (
                  <nav aria-label="Results pages" className="d-flex justify-content-between mb-4">
                    {currentPage > 1 ? (
                      <Link
                        className="btn btn-outline-secondary"
                        href={`/?page=${currentPage - 1}`}
                      >
                        Previous 25
                      </Link>
                    ) : (
                      <span className="btn btn-outline-secondary disabled" aria-disabled="true">
                        Previous 25
                      </span>
                    )}
                    <span className="text-muted align-self-center">Page {currentPage}</span>
                    {hasMore ? (
                      <Link className="btn btn-outline-secondary" href={`/?page=${currentPage + 1}`}>
                        Next 25
                      </Link>
                    ) : (
                      <span className="btn btn-outline-secondary disabled" aria-disabled="true">
                        Next 25
                      </span>
                    )}
                  </nav>
                ) : null}
                {values.length === 0 ? (
                  <p className="text-muted mb-0">
                    No values found. Add documents to get started.
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
                                  {(item.name ? item.name:"") + (item.symbol ? " (" + item.symbol + ")" : "" + ")")}
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
                    {!isFiltered ? (
                      <nav aria-label="Results pages" className="d-flex justify-content-between mt-4">
                        {currentPage > 1 ? (
                          <Link
                            className="btn btn-outline-secondary"
                            href={`/?page=${currentPage - 1}`}
                          >
                            Previous 25
                          </Link>
                        ) : (
                          <span className="btn btn-outline-secondary disabled" aria-disabled="true">
                            Previous 25
                          </span>
                        )}
                        <span className="text-muted align-self-center">Page {currentPage}</span>
                        {hasMore ? (
                          <Link className="btn btn-outline-secondary" href={`/?page=${currentPage + 1}`}>
                            Next 25
                          </Link>
                        ) : (
                          <span className="btn btn-outline-secondary disabled" aria-disabled="true">
                            Next 25
                          </span>
                        )}
                      </nav>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
};
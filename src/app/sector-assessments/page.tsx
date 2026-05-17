import { cache } from "react";

import clientPromise from "@/lib/mongodb";
import AppNavbar from "../components/AppNavbar";

const COLLECTION = "stock-sector-industry-assessments";

type SectorIndustryAssessment = {
  _id: string;
  sector: string;
  industry: string;
  assessment: string;
  lastUpdated: string | null;
};

const getSectors = cache(async (): Promise<string[]> => {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  if (!dbName) throw new Error("Missing MONGODB_DB in environment.");

  const db = client.db(dbName);
  const docs = (await db
    .collection("stock-ai-sectors")
    .find({})
    .sort({ value: 1 })
    .toArray()) as { value?: string }[];

  return docs
    .map((d) => d.value)
    .filter((v): v is string => typeof v === "string");
});

async function getAssessments(sector?: string): Promise<SectorIndustryAssessment[]> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  if (!dbName) throw new Error("Missing MONGODB_DB in environment.");

  const db = client.db(dbName);
  const filter: Record<string, unknown> = {};
  if (sector && sector.trim().length > 0) {
    filter.sector = sector;
  }

  const docs = await db
    .collection(COLLECTION)
    .find(filter)
    .sort({ sector: 1, industry: 1 })
    .toArray();

  return docs.map((doc) => ({
    _id: doc._id.toString(),
    sector: typeof doc.sector === "string" ? doc.sector : "",
    industry: typeof doc.industry === "string" ? doc.industry : "",
    assessment: typeof doc.assessment === "string" ? doc.assessment : "",
    lastUpdated:
      doc.lastUpdated instanceof Date
        ? doc.lastUpdated.toISOString()
        : typeof doc.lastUpdated === "string"
          ? doc.lastUpdated
          : null,
  }));
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function groupBySector(
  assessments: SectorIndustryAssessment[],
): Map<string, SectorIndustryAssessment[]> {
  const map = new Map<string, SectorIndustryAssessment[]>();
  for (const a of assessments) {
    const key = a.sector || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return map;
}

export default async function SectorAssessmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ sector?: string }>;
}) {
  const resolved = await searchParams;
  const selectedSector = resolved?.sector?.trim() ?? "";

  const [sectors, assessments] = await Promise.all([
    getSectors(),
    getAssessments(selectedSector || undefined),
  ]);

  const grouped = groupBySector(assessments);
  const sectorKeys = Array.from(grouped.keys()).sort();

  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8">

            <section
              className="card glass-card mb-3 monthly-balances-page-heading"
              aria-label="Sector assessments"
            >
              <div className="card-body monthly-balances-page-heading-body py-3 px-3 px-sm-4">
                <h2 className="h5 mb-0">Sector &amp; Industry Assessments</h2>
              </div>
            </section>

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
                      <form method="get" action="/sector-assessments" className="row g-3">
                        <div className="col-md-6">
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
                            {sectors.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-12 d-flex justify-content-end gap-2 mt-2">
                          {selectedSector && (
                            <a
                              href="/sector-assessments"
                              className="btn btn-sm filter-clear-button"
                            >
                              Clear
                            </a>
                          )}
                          <button type="submit" className="btn btn-sm filter-apply-button">
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
                {assessments.length}{" "}
                {assessments.length === 1 ? "assessment" : "assessments"}
                {selectedSector ? ` in ${selectedSector}` : ""}
              </p>
            </section>

            <section className="card glass-card mb-4 pt-3">
              <div className="card-body pt-0">
                {assessments.length === 0 ? (
                  <p className="text-muted text-center mb-0">No assessments found</p>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {sectorKeys.map((sector) => {
                      const items = grouped.get(sector)!;
                      const sectorId = `sector-${sector.replace(/\W+/g, "-")}`;
                      return (
                        <div key={sector}>
                          <h3 className="h6 fw-semibold mb-2 ps-1" style={{ color: "var(--accent)" }}>
                            {sector}
                            <span
                              className="ms-2 badge rounded-pill"
                              style={{
                                background: "var(--accent)",
                                color: "#fff",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}
                            >
                              {items.length}
                            </span>
                          </h3>
                          <div
                            className="accordion stock-card__inner-accordion"
                            id={sectorId}
                          >
                            {items.map((item, idx) => {
                              const collapseId = `${sectorId}-industry-${idx}`;
                              const headingId = `${collapseId}-heading`;
                              return (
                                <div className="accordion-item" key={item._id}>
                                  <h4
                                    className="accordion-header"
                                    id={headingId}
                                  >
                                    <button
                                      className="accordion-button stock-card__inner-accordion-btn collapsed"
                                      type="button"
                                      data-bs-toggle="collapse"
                                      data-bs-target={`#${collapseId}`}
                                      aria-expanded="false"
                                      aria-controls={collapseId}
                                    >
                                      {item.industry}
                                    </button>
                                  </h4>
                                  <div
                                    id={collapseId}
                                    className="accordion-collapse collapse"
                                    aria-labelledby={headingId}
                                    data-bs-parent={`#${sectorId}`}
                                  >
                                    <div className="accordion-body stock-card__inner-accordion-body">
                                      <p className="mb-2 small lh-base">
                                        {item.assessment}
                                      </p>
                                      <p className="mb-0 text-muted" style={{ fontSize: "0.72rem" }}>
                                        Last updated: {formatDate(item.lastUpdated)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}

import { cache } from "react";
import ReactMarkdown from "react-markdown";

import clientPromise from "@/lib/mongodb";
import AppNavbar from "../components/AppNavbar";
import SectorFilterClient from "../components/SectorFilterClient";

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

  const countLabel =
    assessments.length === 1 ? "assessment" : "assessments";
  const countSuffix = selectedSector ? ` in ${selectedSector}` : "";

  return (
    <div
      className="min-vh-100"
    >
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div
          className="row justify-content-center"
        >
          <div className="col-lg-8 sector-assessments-page">

            <section
              className="card glass-card monthly-balances-page-heading sector-assessments-heading"
              aria-label="Sector assessments"
            >
              <div
                className="card-body monthly-balances-page-heading-body"
              >
                <h2 className="h5 mb-0">Sector &amp; Industry Assessments</h2>
                <p className="sector-assessments-lead mb-0">
                  AI-generated outlooks by sector and industry, refreshed on weekends.
                </p>
              </div>
            </section>

            <SectorFilterClient sectors={sectors} selectedSector={selectedSector}>
              <section
                className="sector-assessments-meta"
                aria-live="polite"
              >
                <p>
                  {assessments.length} {countLabel}
                  {countSuffix}
                </p>
              </section>

              <section
                className="card glass-card sector-assessments-results mb-4"
                aria-label="Assessment results"
              >
                <div
                  className="card-body sector-assessments-results-body"
                >
                  {assessments.length === 0 ? (
                    <p className="sector-assessments-empty text-muted text-center mb-0">
                      No assessments found
                    </p>
                  ) : (
                    <div
                      className="sector-assessments-sector-list"
                    >
                      {sectorKeys.map((sector) => {
                        const items = grouped.get(sector)!;
                        const sectorId = `sector-${sector.replace(/\W+/g, "-")}`;
                        return (
                          <div
                            key={sector}
                            className="sector-assessments-sector-group"
                          >
                            <h3 className="sector-assessments-sector-title">
                              <span>{sector}</span>
                              <span className="sector-assessments-sector-count">
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
                                    <h4 className="accordion-header" id={headingId}>
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
                                      <div
                                        className="accordion-body stock-card__inner-accordion-body"
                                      >
                                        <div className="sector-assessments-assessment-text stock-card__assessment-markdown mb-2">
                                          <ReactMarkdown>{item.assessment}</ReactMarkdown>
                                        </div>
                                        <p className="sector-assessments-updated mb-0">
                                          Last updated {formatDate(item.lastUpdated)}
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
            </SectorFilterClient>

          </div>
        </div>
      </main>
    </div>
  );
}

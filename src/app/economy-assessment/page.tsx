import { cache } from "react";
import ReactMarkdown from "react-markdown";

import clientPromise from "@/lib/mongodb";
import AppNavbar from "../components/AppNavbar";

const COLLECTION = "stock-economy-assessment";

type EconomySection = {
  number: string;
  heading: string;
  body: string;
};

type EconomyAssessmentDoc = {
  _id: string;
  assessment?: string;
  sections?: EconomySection[];
  dataCurrency?: string;
  sectorCount?: number;
  industryCount?: number;
  lastUpdated?: Date | string;
};

type EconomyAssessment = {
  sections: EconomySection[];
  // Raw fallback text — only used when the generator couldn't parse its own
  // output into `sections` at write-time, so we still show *something*
  // rather than an empty page.
  rawText: string | null;
  dataCurrency: string | null;
  sectorCount: number | null;
  industryCount: number | null;
  lastUpdated: string | null;
};

function toValidSections(value: unknown): EconomySection[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is EconomySection =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as EconomySection).number === "string" &&
      typeof (s as EconomySection).heading === "string" &&
      typeof (s as EconomySection).body === "string",
  );
}

const getAssessment = cache(async (): Promise<EconomyAssessment | null> => {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  if (!dbName) throw new Error("Missing MONGODB_DB in environment.");

  const db = client.db(dbName);
  const doc = await db
    .collection<EconomyAssessmentDoc>(COLLECTION)
    .findOne({ _id: "current" });

  if (!doc || typeof doc.assessment !== "string" || !doc.assessment.trim()) {
    return null;
  }

  const sections = toValidSections(doc.sections);

  return {
    sections,
    rawText: sections.length === 0 ? doc.assessment.trim() : null,
    dataCurrency: typeof doc.dataCurrency === "string" ? doc.dataCurrency : null,
    sectorCount: typeof doc.sectorCount === "number" ? doc.sectorCount : null,
    industryCount: typeof doc.industryCount === "number" ? doc.industryCount : null,
    lastUpdated:
      doc.lastUpdated instanceof Date
        ? doc.lastUpdated.toISOString()
        : typeof doc.lastUpdated === "string"
          ? doc.lastUpdated
          : null,
  };
});

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

export default async function EconomyAssessmentPage() {
  const assessment = await getAssessment();
  const hasContent =
    !!assessment && (assessment.sections.length > 0 || !!assessment.rawText);

  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8 economy-assessment-page">

            <section
              className="card glass-card monthly-balances-page-heading economy-assessment-heading"
              aria-label="Economy assessment"
            >
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Economy &amp; Market Assessment</h2>
                <p className="economy-assessment-lead mb-0">
                  AI-generated synthesis of every sector &amp; industry assessment, refreshed weekly.
                </p>
              </div>
            </section>

            {!assessment || !hasContent ? (
              <section
                className="card glass-card economy-assessment-results mb-4"
                aria-label="Assessment results"
              >
                <div className="card-body economy-assessment-results-body">
                  <p className="economy-assessment-empty text-muted text-center mb-0">
                    No economy assessment available yet.
                  </p>
                </div>
              </section>
            ) : (
              <>
                <section className="economy-assessment-meta" aria-live="polite">
                  <p>
                    {assessment.industryCount != null && assessment.sectorCount != null && (
                      <>
                        Based on {assessment.industryCount} industry assessments across{" "}
                        {assessment.sectorCount} sectors
                        {" · "}
                      </>
                    )}
                    Last updated {formatDate(assessment.lastUpdated)}
                    {assessment.dataCurrency && assessment.dataCurrency !== "Unknown" && (
                      <> {" · "} Data currency: {assessment.dataCurrency}</>
                    )}
                  </p>
                </section>

                <div className="economy-assessment-section-list">
                  {assessment.sections.length > 0 ? (
                    assessment.sections.map((section) => (
                      <section
                        key={section.number}
                        className="card glass-card economy-assessment-section mb-4"
                        aria-label={section.heading}
                      >
                        <div className="card-body economy-assessment-section-body">
                          <h3 className="economy-assessment-section-title">
                            <span className="economy-assessment-section-number">{section.number}</span>
                            <span>{section.heading}</span>
                          </h3>
                          <div className="economy-assessment-text stock-card__assessment-markdown">
                            <ReactMarkdown>{section.body}</ReactMarkdown>
                          </div>
                        </div>
                      </section>
                    ))
                  ) : (
                    <section
                      className="card glass-card economy-assessment-section mb-4"
                      aria-label="Full report"
                    >
                      <div className="card-body economy-assessment-section-body">
                        <div className="economy-assessment-text stock-card__assessment-markdown">
                          <ReactMarkdown>{assessment.rawText}</ReactMarkdown>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}

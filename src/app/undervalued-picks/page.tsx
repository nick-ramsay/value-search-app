import { cache } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

import clientPromise from "@/lib/mongodb";
import AppNavbar from "../components/AppNavbar";

const COLLECTION = "stock-undervalued-reports";

// No dynamic APIs are used on this page (no searchParams, cookies, etc.), so
// without this Next.js treats it as fully static — rendered once at build time
// and never refreshed, regardless of what generate_undervalued_report.py later
// writes to Mongo. ISR re-checks it hourly instead.
export const revalidate = 3600;

type UndervaluedPick = {
  rank: string;
  symbol: string;
  name: string;
  thesis: string;
  catalyst: string;
  bearCase: string;
};

type UndervaluedReportDoc = {
  _id: string;
  report?: string;
  picks?: UndervaluedPick[];
  portfolioNotes?: string | null;
  shortlist?: string[];
  candidateCount?: number;
  universeSize?: number;
  shortlistSize?: number;
  lastUpdated?: Date | string;
};

type UndervaluedReport = {
  picks: UndervaluedPick[];
  portfolioNotes: string | null;
  // Raw fallback text — only used when the generator couldn't parse its own
  // output into `picks` at write-time, so we still show *something* rather
  // than an empty page.
  rawText: string | null;
  candidateCount: number | null;
  universeSize: number | null;
  shortlistSize: number | null;
  lastUpdated: string | null;
};

function toValidPicks(value: unknown): UndervaluedPick[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is UndervaluedPick =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as UndervaluedPick).symbol === "string" &&
      typeof (p as UndervaluedPick).rank === "string",
  );
}

const getReport = cache(async (): Promise<UndervaluedReport | null> => {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  if (!dbName) throw new Error("Missing MONGODB_DB in environment.");

  const db = client.db(dbName);
  const doc = await db
    .collection<UndervaluedReportDoc>(COLLECTION)
    .findOne({ _id: "current" });

  if (!doc) return null;

  const picks = toValidPicks(doc.picks);
  const rawText =
    picks.length === 0 && typeof doc.report === "string" && doc.report.trim()
      ? doc.report.trim()
      : null;

  if (picks.length === 0 && !rawText) return null;

  return {
    picks,
    portfolioNotes:
      typeof doc.portfolioNotes === "string" && doc.portfolioNotes.trim()
        ? doc.portfolioNotes.trim()
        : null,
    rawText,
    candidateCount: typeof doc.candidateCount === "number" ? doc.candidateCount : null,
    universeSize: typeof doc.universeSize === "number" ? doc.universeSize : null,
    shortlistSize: typeof doc.shortlistSize === "number" ? doc.shortlistSize : null,
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

export default async function UndervaluedPicksPage() {
  const report = await getReport();
  const hasContent = !!report && (report.picks.length > 0 || !!report.rawText);

  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8 economy-assessment-page">

            <section
              className="card glass-card monthly-balances-page-heading economy-assessment-heading"
              aria-label="Undervalued picks"
            >
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Undervalued Picks</h2>
                <p className="economy-assessment-lead mb-0">
                  AI-ranked stocks whose price appears to understate their durable earning
                  power, refreshed weekly.
                </p>
              </div>
            </section>

            {!hasContent ? (
              <section
                className="card glass-card economy-assessment-results mb-4"
                aria-label="Report results"
              >
                <div className="card-body economy-assessment-results-body">
                  <p className="economy-assessment-empty text-muted text-center mb-0">
                    No undervalued report available yet.
                  </p>
                </div>
              </section>
            ) : (
              <>
                <section className="economy-assessment-meta" aria-live="polite">
                  <p>
                    {report.universeSize != null && report.candidateCount != null && (
                      <>
                        Screened {report.universeSize.toLocaleString()} assessed stocks down to{" "}
                        {report.candidateCount.toLocaleString()}
                        {report.shortlistSize != null && <>, then {report.shortlistSize}</>}
                        {" · "}
                      </>
                    )}
                    Last updated {formatDate(report.lastUpdated)}
                  </p>
                </section>

                <div className="economy-assessment-section-list">
                  {report.picks.length > 0 ? (
                    <>
                      {report.picks.map((pick) => (
                        <section
                          key={`${pick.rank}-${pick.symbol}`}
                          className="card glass-card economy-assessment-section undervalued-pick mb-4"
                          aria-label={`${pick.rank}. ${pick.symbol} — ${pick.name}`}
                        >
                          <div className="card-body economy-assessment-section-body">
                            <h3 className="economy-assessment-section-title undervalued-pick__title">
                              <span className="economy-assessment-section-number">
                                {pick.rank}
                              </span>
                              <span className="undervalued-pick__heading">
                                <Link
                                  href={`/?symbol=${encodeURIComponent(pick.symbol)}`}
                                  className="undervalued-pick__symbol"
                                >
                                  {pick.symbol}
                                </Link>
                                {pick.name && (
                                  <span className="undervalued-pick__name">{pick.name}</span>
                                )}
                              </span>
                            </h3>

                            <dl className="undervalued-pick__fields mb-0">
                              {pick.thesis && (
                                <div className="undervalued-pick__field">
                                  <dt className="undervalued-pick__label undervalued-pick__label--thesis">
                                    Thesis
                                  </dt>
                                  <dd className="undervalued-pick__value economy-assessment-text mb-0">
                                    {pick.thesis}
                                  </dd>
                                </div>
                              )}
                              {pick.catalyst && (
                                <div className="undervalued-pick__field">
                                  <dt className="undervalued-pick__label undervalued-pick__label--catalyst">
                                    Catalyst
                                  </dt>
                                  <dd className="undervalued-pick__value economy-assessment-text mb-0">
                                    {pick.catalyst}
                                  </dd>
                                </div>
                              )}
                              {pick.bearCase && (
                                <div className="undervalued-pick__field">
                                  <dt className="undervalued-pick__label undervalued-pick__label--bear">
                                    Bear case
                                  </dt>
                                  <dd className="undervalued-pick__value economy-assessment-text mb-0">
                                    {pick.bearCase}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        </section>
                      ))}

                      {report.portfolioNotes && (
                        <section
                          className="card glass-card economy-assessment-section undervalued-notes mb-4"
                          aria-label="Portfolio notes"
                        >
                          <div className="card-body economy-assessment-section-body">
                            <h3 className="economy-assessment-section-title">
                              <span aria-hidden className="undervalued-notes__icon">
                                <i className="bi bi-clipboard-data" />
                              </span>
                              <span>Portfolio Notes</span>
                            </h3>
                            <div className="economy-assessment-text stock-card__assessment-markdown">
                              <ReactMarkdown>{report.portfolioNotes}</ReactMarkdown>
                            </div>
                          </div>
                        </section>
                      )}
                    </>
                  ) : (
                    <section
                      className="card glass-card economy-assessment-section mb-4"
                      aria-label="Full report"
                    >
                      <div className="card-body economy-assessment-section-body">
                        <div className="economy-assessment-text stock-card__assessment-markdown">
                          <ReactMarkdown>{report.rawText}</ReactMarkdown>
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

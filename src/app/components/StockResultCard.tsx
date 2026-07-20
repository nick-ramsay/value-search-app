"use client";

import { Fragment, useState, useCallback, useRef, useId } from "react";
import { useSession } from "next-auth/react";
import { getRatingBadgeClass, toTitleCase } from "@/lib/ai-rating-display";
import type { ValueRecord, ValueSearchScoreDisplay } from "@/lib/value-search";
import ScoreModalTrigger, { VALUE_SCORE_MA_SUPPORT_KEY } from "./ScoreModalTrigger";
import { HistoryChartsPanel, HistoryChartsTrigger } from "./HistoryCharts";
import AssessmentPillButton from "./AssessmentPillButton";
import CardUserActions from "./CardUserActions";
import CardNotes from "./CardComments";
import ReactMarkdown from "react-markdown";

function getRatingAccentClass(rating: string): string {
  switch (rating.trim().toUpperCase()) {
    case "STRONG BUY":  return "stock-card--rating-strong-buy";
    case "BUY":         return "stock-card--rating-buy";
    case "NEUTRAL":     return "stock-card--rating-neutral";
    case "SELL":        return "stock-card--rating-sell";
    case "STRONG SELL": return "stock-card--rating-strong-sell";
    default:            return "";
  }
}

function getValueScoreBadgeClass(calculatedScorePercentage: number): string {
  if (calculatedScorePercentage > 0.66) return "badge bg-success text-white";
  if (calculatedScorePercentage >= 0.33) return "badge bg-warning text-dark";
  return "badge bg-danger text-white";
}

// ─── Research-inputs helpers ─────────────────────────────────────────────────

const KEY_LABELS: Record<string, string> = {
  trailingPE: "P/E (Trailing)",
  forwardPE: "P/E (Forward)",
  trailingEps: "EPS (Trailing)",
  forwardEps: "EPS (Forward)",
  priceToBook: "Price / Book",
  marketCap: "Market Cap",
  regularMarketPrice: "Price",
  currentPrice: "Price",
  fiftyTwoWeekHigh: "52w High",
  fiftyTwoWeekLow: "52w Low",
  fiftyDayAverage: "50d MA",
  twoHundredDayAverage: "200d MA",
  averageVolume: "Avg Volume",
  averageVolume10days: "Avg Vol (10d)",
  dividendYield: "Dividend Yield",
  payoutRatio: "Payout Ratio",
  debtToEquity: "Debt / Equity",
  currentRatio: "Current Ratio",
  quickRatio: "Quick Ratio",
  profitMargins: "Profit Margin",
  grossMargins: "Gross Margin",
  operatingMargins: "Operating Margin",
  earningsGrowth: "Earnings Growth",
  revenueGrowth: "Revenue Growth",
  earningsQuarterlyGrowth: "Quarterly EPS Growth",
  returnOnAssets: "Return on Assets",
  returnOnEquity: "Return on Equity",
  operatingCashflow: "Operating Cash Flow",
  freeCashflow: "Free Cash Flow",
  totalRevenue: "Total Revenue",
  revenuePerShare: "Revenue / Share",
  totalCash: "Total Cash",
  totalDebt: "Total Debt",
  netIncomeToCommon: "Net Income",
  investmentDescription: "Description",
};

function humanizeDataKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLargeCurrency(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatDataValue(key: string, raw: string): string {
  const n = Number(raw);
  if (!isFinite(n) || raw.trim() === "") return raw;
  const k = key.toLowerCase();
  // Large currency amounts
  if (/marketcap|totalrevenue|totaldebt|totalcash|freecashflow|operatingcashflow|ebitda|netincome/.test(k))
    return formatLargeCurrency(n);
  // Volume / share counts
  if (/volume|sharesoutstanding|sharesfloat/.test(k)) {
    const a = Math.abs(n);
    if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
    return Math.round(n).toLocaleString();
  }
  // Percentage fields stored as decimals (0.234 → 23.4%)
  if (/margin|growth|returnon|yield|payoutratio/.test(k) && Math.abs(n) <= 10)
    return `${(n * 100).toFixed(1)}%`;
  // Price / per-share fields
  if (/price$|high$|low$|open$|close$|average$|eps$|pershare$/.test(k))
    return `$${n.toFixed(2)}`;
  // Anything still large → abbreviate
  if (Math.abs(n) >= 1e6) return formatLargeCurrency(n);
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 100)  return n.toFixed(1);
  const twoDP = n.toFixed(2).replace(/\.?0+$/, "");
  return twoDP === "" ? "0" : twoDP;
}

/** Renders the LLM input data as a clean grouped definition list. */
function AssessmentDataPanel({
  data,
}: {
  data: {
    quote: Record<string, unknown> | null;
    fundamentals: Record<string, unknown> | null;
    industry: string | null;
    sector: string | null;
    country: string | null;
    investmentDescription: string | null;
  };
}) {
  type DataRow = { key: string; raw: string };

  const toRows = (obj: Record<string, unknown> | null): DataRow[] =>
    Object.entries(obj ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => ({
        key: k,
        raw: typeof v === "object" ? JSON.stringify(v) : String(v),
      }));

  const contextRows: DataRow[] = (
    [
      data.industry && { key: "Industry", raw: data.industry },
      data.sector   && { key: "Sector",   raw: data.sector   },
      data.country  && { key: "Country",  raw: data.country  },
    ] as (DataRow | false)[]
  ).filter((r): r is DataRow => Boolean(r));

  const quoteRows = toRows(data.quote);
  const fundRows  = toRows(data.fundamentals);
  const hasAny    = contextRows.length > 0 || data.investmentDescription || quoteRows.length > 0 || fundRows.length > 0;

  if (!hasAny) {
    return <p className="mb-0 small text-secondary">No data available for this symbol.</p>;
  }

  const renderRows = (rows: DataRow[]) =>
    rows.map(({ key, raw }) => (
      <div key={key} className="stock-card__detail-dl-row">
        <dt className="stock-card__detail-dl-label">{humanizeDataKey(key)}</dt>
        <dd className="stock-card__detail-dl-value">{formatDataValue(key, raw)}</dd>
      </div>
    ));

  const hasContext = data.industry || data.sector || data.country || data.investmentDescription;

  return (
    <div className="stock-card__assessment-detail">
      {hasContext && (
        <div>
          <p className="stock-card__detail-group-title">Context</p>
          {(data.industry || data.sector || data.country) && (
            <div className="research-context-tags">
              {data.industry && (
                <span className="research-context-tag">
                  <i className="bi bi-building research-context-tag__icon" aria-hidden />
                  {data.industry}
                </span>
              )}
              {data.sector && (
                <span className="research-context-tag">
                  <i className="bi bi-diagram-3 research-context-tag__icon" aria-hidden />
                  {data.sector}
                </span>
              )}
              {data.country && (
                <span className="research-context-tag">
                  <i className="bi bi-geo-alt research-context-tag__icon" aria-hidden />
                  {data.country}
                </span>
              )}
            </div>
          )}
          {data.investmentDescription && (
            <p className="stock-card__detail-description">{data.investmentDescription}</p>
          )}
        </div>
      )}
      {quoteRows.length > 0 && (
        <div>
          <p className="stock-card__detail-group-title">Quote</p>
          <dl className="mb-0">{renderRows(quoteRows)}</dl>
        </div>
      )}
      {fundRows.length > 0 && (
        <div>
          <p className="stock-card__detail-group-title">Fundamentals</p>
          <dl className="mb-0">{renderRows(fundRows)}</dl>
        </div>
      )}
    </div>
  );
}

/** Format date/time with a fixed locale so server and client render the same (avoids hydration mismatch). */
function formatLastUpdated(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const datePart = date.toLocaleDateString("en-US", {
      dateStyle: "medium",
    });
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart} ${timePart}`;
  } catch {
    return date.toISOString();
  }
}

type StockResultCardProps = {
  item: ValueRecord;
  compact?: boolean;
  /** Minimum height in pixels (e.g. for portfolio so card matches empty state size) */
  minHeight?: number;
};

export default function StockResultCard({
  item,
  compact = false,
  minHeight,
}: StockResultCardProps) {
  const instanceId = useId();
  const cardDomId = `${item._id}-${instanceId}`;
  const collapseId = `collapse-${cardDomId}`;
  const trendsCollapseId = `trends-${cardDomId}`;
  const notesCollapseId = `notes-${cardDomId}`;
  const assessmentDetailCollapseId = `assessment-detail-${cardDomId}`;
  const notesSlotId = `stock-card-notes-slot-${cardDomId}`;
  const accordionId = `stock-card-${cardDomId}`;
  const accordionParentId = `#${accordionId}`;
  const [companyDescExpanded, setCompanyDescExpanded] = useState(false);

  const { status: sessionStatus } = useSession();
  const isLoggedIn = sessionStatus === "authenticated";

  const cardRef = useRef<HTMLElement>(null);
  const [showPriceLastUpdated, setShowPriceLastUpdated] = useState(false);
  const [showAssessmentLastUpdated, setShowAssessmentLastUpdated] = useState(false);

  const [companyDesc, setCompanyDesc] = useState<{
    status: "idle" | "loading" | "loaded" | "error";
    text: string | null;
  }>({ status: "idle", text: null });
  const [assessmentDetail, setAssessmentDetail] = useState<{
    status: "idle" | "loading" | "loaded" | "error";
    data: {
      quote: Record<string, unknown> | null;
      fundamentals: Record<string, unknown> | null;
      industry: string | null;
      sector: string | null;
      country: string | null;
      investmentDescription: string | null;
    } | null;
  }>({ status: "idle", data: null });

  const handleToggleCompanyDesc = useCallback(() => {
    setCompanyDescExpanded((prev) => {
      const next = !prev;
      if (next) {
        setCompanyDesc((s) => {
          if (s.status !== "idle" || !item.symbol) return s;
          const startedAt = Date.now();
          // Panel open animation takes ~300ms, and local API calls can resolve
          // in well under that — enforce a minimum visible duration so the
          // loading skeleton is never swapped out before a user can see it.
          const MIN_LOADING_MS = 450;
          fetch(`/api/company-description?symbol=${encodeURIComponent(item.symbol)}`)
            .then((r) => r.json())
            .then(
              (data: {
                companyDescription?: string | null;
                investmentDescription?: string | null;
              }) => {
                const text =
                  data.companyDescription ?? data.investmentDescription ?? null;
                const elapsed = Date.now() - startedAt;
                const delay = Math.max(0, MIN_LOADING_MS - elapsed);
                setTimeout(() => {
                  setCompanyDesc({ status: "loaded", text: text ?? null });
                }, delay);
              }
            )
            .catch(() => {
              const elapsed = Date.now() - startedAt;
              const delay = Math.max(0, MIN_LOADING_MS - elapsed);
              setTimeout(() => {
                setCompanyDesc((s2) => ({ ...s2, status: "error" }));
              }, delay);
            });
          return { ...s, status: "loading" };
        });
      }
      return next;
    });
  }, [item.symbol]);

  const handleClosePanel = useCallback(async (panelId: string) => {
    const el = document.getElementById(panelId);
    if (!el) return;
    const bootstrap = await import(
      "bootstrap/dist/js/bootstrap.bundle.min.js"
    );
    const Collapse = (bootstrap as { Collapse?: { getInstance: (el: Element) => { hide: () => void } | null } }).Collapse;
    const instance = Collapse?.getInstance(el);
    instance?.hide();
  }, []);

  const closeAllOpenPanels = useCallback(async () => {
    const card = cardRef.current;
    if (!card) return;
    const openPanels = card.querySelectorAll(".collapse.show");
    if (openPanels.length === 0) return;
    const bootstrap = await import("bootstrap/dist/js/bootstrap.bundle.min.js");
    const Collapse = (bootstrap as { Collapse?: { getInstance: (el: Element) => { hide: () => void } | null } }).Collapse;
    openPanels.forEach((el) => Collapse?.getInstance(el)?.hide());
  }, []);

  const handleCardClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    // Interactive controls (incl. dedicated close buttons) handle their own behavior.
    if (target.closest('button, a, input, select, textarea, label, [data-bs-toggle], [role="button"]')) return;
    // Clicks inside an open panel's content must not close it — only the panel's
    // own close button (handled above) should. Covers the Bootstrap collapse
    // panels and the React-driven company-description panel.
    if (target.closest('.collapse, .stock-card__company-desc-outer')) return;
    // Only a click on genuinely empty space closes the panels: a structural
    // container element, never a piece of content (text, icon, image, badge…).
    const STRUCTURAL_TAGS = new Set(["ARTICLE", "HEADER", "SECTION", "DIV"]);
    if (!STRUCTURAL_TAGS.has(target.tagName)) return;
    closeAllOpenPanels();
  }, [closeAllOpenPanels]);

  return (
    <article
      ref={cardRef}
      id={accordionId}
      className={`stock-card${compact ? " stock-card--compact" : ""}${item.aiRating ? ` ${getRatingAccentClass(item.aiRating)}` : ""}`}
      data-symbol={item.symbol ?? undefined}
      style={{ position: "relative", ...(minHeight != null ? { minHeight: `${minHeight}px` } : {}) }}
      onClick={handleCardClick}
    >
      {/* Identity: ticker + company name + info button */}
      <header className="stock-card__head">
        <div className="stock-card__head-row">
          <div className="stock-card__identity">
            {item.symbol ? (
              <a
                href={
                  "https://finviz.com/quote.ashx?t=" +
                  item.symbol.replace(".", "-") +
                  "&ty=l&ta=0&p=w"
                }
                target="_blank"
                rel="noreferrer"
                className="stock-card__ticker-link"
              >
                <span className="stock-card__ticker">{item.symbol}</span>
                <i className="bi bi-box-arrow-up-right stock-card__title-icon" aria-hidden />
              </a>
            ) : (
              <span className="stock-card__ticker">{item.name}</span>
            )}
            {item.name && item.name !== item.symbol && (
              <p className="stock-card__company-name mb-0">{item.name}</p>
            )}
          </div>
          <button
            type="button"
            className="stock-card__company-info-btn"
            aria-expanded={companyDescExpanded}
            aria-label="Toggle company description"
            title="Company description"
            onClick={handleToggleCompanyDesc}
          >
            <i className="bi bi-info-circle" aria-hidden />
            <span className="stock-card__company-info-label" aria-hidden>About</span>
          </button>
        </div>
        {(() => {
          const metaItems = (
            [
              item.industry && { icon: "bi-building", label: "Industry", text: item.industry },
              item.sector && { icon: "bi-diagram-3", label: "Sector", text: item.sector },
              item.country && { icon: "bi-geo-alt", label: "Country", text: item.country },
            ] as ({ icon: string; label: string; text: string } | false | undefined)[]
          ).filter((m): m is { icon: string; label: string; text: string } => Boolean(m));

          if (metaItems.length === 0) return null;

          return (
            <p className="stock-card__meta-row mb-0">
              {metaItems.map((m, i) => (
                <Fragment key={m.text}>
                  {i > 0 && " • "}
                  <span title={m.label}>
                    <i className={`bi ${m.icon} stock-card__meta-icon`} aria-hidden />
                    {m.text}
                  </span>
                </Fragment>
              ))}
            </p>
          );
        })()}
      </header>

      {/* Company description panel – React state–driven so Bootstrap accordion cannot close it when another panel opens */}
      <div
        className={`stock-card__company-desc-outer${companyDescExpanded ? " stock-card__company-desc-outer--open" : ""}`}
        aria-label="Company description"
        aria-hidden={!companyDescExpanded}
      >
        <div className="stock-card__panel stock-card__panel--company-desc">
          <div className="stock-card__panel-inner stock-card__panel-inner--company-desc">
            {(companyDesc.status === "idle" || companyDesc.status === "loading") && (
              <div className="stock-card__about-skeleton-wrap" aria-hidden>
                <div className="stock-card__about-skeleton" />
                <div className="stock-card__about-skeleton" />
                <div className="stock-card__about-skeleton stock-card__about-skeleton--short" />
              </div>
            )}
            {companyDesc.status === "error" && (
              <p className="mb-0 stock-card__about-text stock-card__about-text--muted">
                Could not load description.
              </p>
            )}
            {companyDesc.status === "loaded" && (
              <p className="mb-0 stock-card__about-text">
                {companyDesc.text || "No description available."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Current price – row below name/symbol (from stock-quotes, quote.price) */}
      {typeof item.price === "number" && !Number.isNaN(item.price) ? (
        <div className="stock-card__price-row">
          <div className="stock-card__price-row-inner">
            <p
              className="stock-card__subheader"
              aria-label={`Price: $${item.price.toFixed(2)} USD`}
            >
              {`$${item.price.toFixed(2)} USD`}
            </p>
            {item.priceLastUpdated ? (
              <>
                <button
                  type="button"
                  className="stock-card__time-btn"
                  onClick={() => setShowPriceLastUpdated((prev) => !prev)}
                  aria-label={
                    showPriceLastUpdated
                      ? "Hide last updated time for this quote"
                      : "Show last updated time for this quote"
                  }
                >
                  <i
                    className="bi bi-clock-history stock-card__time-icon"
                    aria-hidden
                  />
                </button>
                {showPriceLastUpdated ? (
                  <span className="stock-card__time-text">
                    {formatLastUpdated(item.priceLastUpdated)}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* At-a-glance signals: AI rating, score, labels, buy/sell target (when logged in) */}
      <div className="stock-card__signals">
        {item.aiRating ? (
          <span
            className={`${getRatingBadgeClass(item.aiRating)} stock-card__badge`}
          >
            <span>{toTitleCase(item.aiRating)}</span>
            <button
              type="button"
              className="stock-card__time-btn ms-1"
              onClick={() =>
                setShowAssessmentLastUpdated((prev) => !prev)
              }
              aria-label={
                showAssessmentLastUpdated
                  ? "Hide last generated time for this AI assessment"
                  : "Show last generated time for this AI assessment"
              }
            >
              <i
                className="bi bi-clock-history stock-card__time-icon"
                aria-hidden
              />
            </button>
            {showAssessmentLastUpdated ? (
              <span className="stock-card__time-text ms-1">
                {item.aiAssessmentLastUpdated
                  ? formatLastUpdated(item.aiAssessmentLastUpdated)
                  : "Last generated time not available"}
              </span>
            ) : null}
          </span>
        ) : null}
        {item.valueSearchScore != null &&
          item.valueSearchScore.totalPossiblePoints > 0 &&
          typeof item.valueSearchScore.calculatedScorePercentage === "number" ? (
          <ScoreModalTrigger
            modalId={`score-modal-${item._id}`}
            name={item.name}
            symbol={item.symbol}
            valueSearchScore={
              item.valueSearchScore as ValueSearchScoreDisplay
            }
            buttonClassName={`${getValueScoreBadgeClass(
              item.valueSearchScore.calculatedScorePercentage
            )} stock-card__badge`}
            buttonLabel={`${(item.valueSearchScore.calculatedScorePercentage * 100).toFixed(0)}%`}
          />
        ) : null}
        <div
          className="stock-card__signals-slot"
          id={`stock-card-signals-slot-${cardDomId}`}
          aria-hidden="true"
        />
        <div
          className="stock-card__labels-slot"
          id={`stock-card-labels-slot-${cardDomId}`}
          aria-hidden="true"
        />
        {(() => {
          const vs = item.valueSearchScore as Record<string, unknown> | undefined;
          if (!vs) return null;
          const breakdown = vs.breakdown as Record<string, unknown> | undefined;
          const raw =
            vs[VALUE_SCORE_MA_SUPPORT_KEY] ??
            vs.moving_average_support ??
            breakdown?.[VALUE_SCORE_MA_SUPPORT_KEY] ??
            breakdown?.moving_average_support;
          const maSupport =
            raw === true ? 1 : typeof raw === "number" ? raw : Number(raw);
          const hasSupport = !Number.isNaN(maSupport) && maSupport >= 1;
          return hasSupport ? (
            <span
              className="badge stock-card__badge stock-card__ma-support-pill"
              title="Stock may have found moving average support"
              aria-label="Stock may have found moving average support"
            >
              <i className="bi bi-graph-up-arrow" aria-hidden />
            </span>
          ) : null;
        })()}
      </div>

      {/* Primary actions: View trends, Assessment, Edit (when logged in) */}
      <div className="stock-card__actions">
        <HistoryChartsTrigger
          collapseId={trendsCollapseId}
          symbol={item.symbol}
          compact={compact}
        />
        <AssessmentPillButton collapseId={collapseId} ariaLabel="Toggle AI assessment" />
        <div id={notesSlotId} />
        <div
          className="stock-card__actions-slot"
          id={`stock-card-actions-slot-${cardDomId}`}
          aria-hidden="true"
        />
      </div>

      {/* Trends panel – same level as other panels so it spans full card width */}
      <HistoryChartsPanel
        collapseId={trendsCollapseId}
        symbol={item.symbol}
        accordionParentId={accordionParentId}
        showInlineCloseAll
        onCloseThisPanel={() => handleClosePanel(trendsCollapseId)}
      />

      {/* AI Assessment panel */}
      <div
        id={collapseId}
        className="collapse stock-card__panel stock-card__panel--assessment"
        aria-label="AI Assessment"
        data-bs-parent={accordionParentId}
      >
        <div className="stock-card__panel-inner">
          <div className="stock-card__close-all-inline-wrap">
            <span className="stock-card__panel-heading">AI Assessment</span>
            <button
              type="button"
              className="stock-card__panel-close-btn"
              onClick={() => handleClosePanel(collapseId)}
              aria-label="Close this section"
            >
              <i className="bi bi-chevron-up" aria-hidden />
            </button>
          </div>
          {item.assessment ? (
            <div className="stock-card__assessment-text stock-card__assessment-markdown">
              <ReactMarkdown>{item.assessment}</ReactMarkdown>
            </div>
          ) : null}
          {item.aiAssessmentLastUpdated ? (
            <p className="stock-card__assessment-updated">
              Updated <span>{formatLastUpdated(item.aiAssessmentLastUpdated)}</span>
            </p>
          ) : null}

          {/* Data used for AI assessment – logged in only; header matches View trends / AI Assessment / Edit */}
          {isLoggedIn && (
          <div
            className="accordion mt-3 stock-card__inner-accordion stock-card__assessment-data-accordion"
            id={`accordion-detail-${cardDomId}`}
          >
              <div className="accordion-item border-0">
                <h3 className="accordion-header">
                  <button
                    type="button"
                    className="accordion-button collapsed stock-card__action stock-card__action--secondary stock-card__assessment-data-trigger"
                    data-bs-toggle="collapse"
                    data-bs-target={`#${assessmentDetailCollapseId}`}
                    aria-expanded="false"
                    aria-controls={assessmentDetailCollapseId}
                    onClick={() => {
                      if (
                        assessmentDetail.status === "idle" &&
                        item.symbol
                      ) {
                        setAssessmentDetail((s) => ({ ...s, status: "loading" }));
                        fetch(
                          `/api/assessment-detail?symbol=${encodeURIComponent(item.symbol)}`
                        )
                          .then((r) => r.json())
                          .then(
                            (data: {
                              quote?: Record<string, unknown> | null;
                              fundamentals?: Record<string, unknown> | null;
                              industry?: string | null;
                              sector?: string | null;
                              country?: string | null;
                              investmentDescription?: string | null;
                            }) => {
                              setAssessmentDetail({
                                status: "loaded",
                                data: {
                                  quote: data.quote ?? null,
                                  fundamentals: data.fundamentals ?? null,
                                  industry: data.industry ?? null,
                                  sector: data.sector ?? null,
                                  country: data.country ?? null,
                                  investmentDescription:
                                    data.investmentDescription ?? null,
                                },
                              });
                            }
                          )
                          .catch(() =>
                            setAssessmentDetail((s) => ({
                              ...s,
                              status: "error",
                            }))
                          );
                      }
                    }}
                  >
                    <span className="stock-card__action-label">Research inputs</span>
                    <i className="bi bi-chevron-down stock-card__action-chevron stock-card__assessment-data-chevron-down" aria-hidden />
                    <i className="bi bi-chevron-up stock-card__action-chevron stock-card__assessment-data-chevron-up" aria-hidden />
                  </button>
                </h3>
                <div
                  id={assessmentDetailCollapseId}
                  className="accordion-collapse collapse"
                  data-bs-parent={`#accordion-detail-${cardDomId}`}
                >
                  <div className="accordion-body stock-card__inner-accordion-body">
                    {assessmentDetail.status === "loading" && (
                      <p className="mb-0 text-secondary small">Loading…</p>
                    )}
                    {assessmentDetail.status === "error" && (
                      <p className="mb-0 text-secondary small">
                        Could not load data.
                      </p>
                    )}
                    {assessmentDetail.status === "loaded" &&
                      assessmentDetail.data && (
                      <AssessmentDataPanel data={assessmentDetail.data} />
                    )}
                    {assessmentDetail.status === "idle" && (
                      <p className="mb-0 text-secondary small">
                        The quote and fundamentals data used to generate this assessment.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
        </div>
      </div>

      {/* Notes panel (when logged in) */}
      <CardNotes
        symbol={item.symbol ?? ""}
        collapseId={notesCollapseId}
        compact={compact}
        notesSlotId={notesSlotId}
        accordionParentId={accordionParentId}
        onCloseThisPanel={() => handleClosePanel(notesCollapseId)}
      />

      {/* User status (when logged in) */}
      <CardUserActions
        symbol={item.symbol}
        cardId={cardDomId}
        recordId={item._id}
        compact={compact}
        actionBarSlotId={`stock-card-actions-slot-${cardDomId}`}
        targetPillSlotId={`stock-card-signals-slot-${cardDomId}`}
        labelsSlotId={`stock-card-labels-slot-${cardDomId}`}
        currentPrice={typeof item.price === "number" && !Number.isNaN(item.price) ? item.price : undefined}
        accordionParentId={accordionParentId}
        showInlineCloseAll
        onCloseThisPanel={() => handleClosePanel(`user-actions-${cardDomId}`)}
      />

    </article>
  );
}

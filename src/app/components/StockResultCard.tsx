"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useSession } from "next-auth/react";
import type { ValueRecord, ValueSearchScoreDisplay } from "@/lib/value-search";
import ScoreModalTrigger, { VALUE_SCORE_MA_SUPPORT_KEY } from "./ScoreModalTrigger";
import { HistoryChartsPanel, HistoryChartsTrigger } from "./HistoryCharts";
import AssessmentPillButton from "./AssessmentPillButton";
import CardUserActions from "./CardUserActions";

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function getRatingBadgeClass(rating: string) {
  const normalized = rating.trim().toUpperCase();
  switch (normalized) {
    case "STRONG BUY":
      return "badge badge-rating-strong-buy";
    case "BUY":
      return "badge badge-rating-buy";
    case "NEUTRAL":
      return "badge badge-rating-neutral";
    case "SELL":
      return "badge badge-rating-sell";
    case "STRONG SELL":
      return "badge badge-rating-strong-sell";
    default:
      return "badge badge-rating-neutral";
  }
}

function getValueScoreBadgeClass(calculatedScorePercentage: number): string {
  if (calculatedScorePercentage > 0.66) return "badge bg-success text-white";
  if (calculatedScorePercentage >= 0.33) return "badge bg-warning text-dark";
  return "badge bg-danger text-white";
}

/** Renders the LLM input data as a table (context, quote, fundamentals). */
function AssessmentDetailTable({
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
  const rows: { section: string; key: string; value: string }[] = [];

  if (data.industry != null && data.industry !== "")
    rows.push({ section: "Context", key: "Industry", value: String(data.industry) });
  if (data.sector != null && data.sector !== "")
    rows.push({ section: "Context", key: "Sector", value: String(data.sector) });
  if (data.country != null && data.country !== "")
    rows.push({ section: "Context", key: "Country", value: String(data.country) });
  if (data.investmentDescription != null && data.investmentDescription !== "")
    rows.push({
      section: "Context",
      key: "Investment description",
      value: String(data.investmentDescription),
    });

  const quote = data.quote && typeof data.quote === "object" ? data.quote : null;
  if (quote) {
    for (const [k, v] of Object.entries(quote)) {
      if (v === undefined || v === null) continue;
      rows.push({
        section: "Quote",
        key: k,
        value: typeof v === "object" ? JSON.stringify(v) : String(v),
      });
    }
  }

  const fund =
    data.fundamentals && typeof data.fundamentals === "object"
      ? data.fundamentals
      : null;
  if (fund) {
    for (const [k, v] of Object.entries(fund)) {
      if (v === undefined || v === null) continue;
      rows.push({
        section: "Fundamentals",
        key: k,
        value: typeof v === "object" ? JSON.stringify(v) : String(v),
      });
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mb-0 small text-secondary">
        No structured data available for this symbol.
      </p>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm table-borderless mb-0 stock-card__detail-table">
        <thead>
          <tr>
            <th scope="col" className="text-secondary small">Section</th>
            <th scope="col" className="text-secondary small">Key</th>
            <th scope="col" className="text-secondary small">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.section}-${row.key}-${i}`}>
              <td className="small text-secondary">{row.section}</td>
              <td className="small">{row.key}</td>
              <td className="small text-break" style={{ maxWidth: "20rem" }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const companyDescCollapseId = `company-desc-${cardDomId}`;
  const assessmentDetailCollapseId = `assessment-detail-${cardDomId}`;
  const [companyDescExpanded, setCompanyDescExpanded] = useState(false);

  const { status: sessionStatus } = useSession();
  const isLoggedIn = sessionStatus === "authenticated";

  const [hasAnyOpen, setHasAnyOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
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

  const updateAnyOpen = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const openPanels = card.querySelectorAll(".collapse.show");
    const count = openPanels.length;
    setOpenCount(count);
    setHasAnyOpen(count > 0);
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onShown = () => updateAnyOpen();
    const onHidden = () => updateAnyOpen();
    card.addEventListener("shown.bs.collapse", onShown);
    card.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      card.removeEventListener("shown.bs.collapse", onShown);
      card.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [updateAnyOpen]);

  useEffect(() => {
    const el = document.getElementById(companyDescCollapseId);
    if (!el) return;
    const onShown = () => {
      setCompanyDescExpanded(true);
      if (companyDesc.status === "idle" && item.symbol) {
        setCompanyDesc((s) => ({ ...s, status: "loading" }));
        fetch(
          `/api/company-description?symbol=${encodeURIComponent(item.symbol)}`
        )
          .then((r) => r.json())
          .then(
            (data: {
              companyDescription?: string | null;
              investmentDescription?: string | null;
            }) => {
              const text =
                data.companyDescription ?? data.investmentDescription ?? null;
              setCompanyDesc({
                status: "loaded",
                text: text ?? null,
              });
            }
          )
          .catch(() => setCompanyDesc((s) => ({ ...s, status: "error" })));
      }
    };
    const onHidden = () => setCompanyDescExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [companyDescCollapseId, item.symbol, companyDesc.status]);

  const handleCloseAll = useCallback(async () => {
    const card = cardRef.current;
    if (!card) return;

    // Immediately hide the "Close all" buttons while accordions animate closed
    setHasAnyOpen(false);
    setOpenCount(0);

    const bootstrap = await import(
      "bootstrap/dist/js/bootstrap.bundle.min.js"
    );
    const Collapse = (bootstrap as { Collapse?: { getInstance: (el: Element) => { hide: () => void } | null } }).Collapse;
    if (!Collapse) return;
    card.querySelectorAll(".collapse.show").forEach((el) => {
      const instance = Collapse.getInstance(el);
      instance?.hide();
    });
    // Only scroll if the name/symbol row is behind the navbar or outside the viewport
    const titleEl = card.querySelector(".stock-card__head");
    if (titleEl instanceof HTMLElement) {
      const rect = titleEl.getBoundingClientRect();
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue("--navbar-height")
        .trim();
      let navbarPx = 72;
      if (val) {
        const num = parseFloat(val);
        if (val.endsWith("rem"))
          navbarPx = num * parseFloat(getComputedStyle(document.documentElement).fontSize);
        else if (val.endsWith("px"))
          navbarPx = num;
      }
      const paddingBelowNavbar = 12;
      const minVisibleTop = navbarPx + paddingBelowNavbar;
      const isBehindNavbar = rect.top < minVisibleTop;
      const isAboveViewport = rect.bottom < 0;
      const isBelowViewport = rect.top > window.innerHeight;
      if (isBehindNavbar || isAboveViewport || isBelowViewport) {
        const targetScrollY = window.scrollY + rect.top - minVisibleTop;
        window.scrollTo({ top: Math.max(0, targetScrollY), behavior: "smooth" });
      }
    }
  }, []);

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

  return (
    <article
      ref={cardRef}
      className={`stock-card${compact ? " stock-card--compact" : ""}${hasAnyOpen ? " stock-card--has-open" : ""}`}
      data-symbol={item.symbol ?? undefined}
      style={{ position: "relative", ...(minHeight != null ? { minHeight: `${minHeight}px` } : {}) }}
    >
      {/* Identity: name/symbol + company info button */}
      <header className="stock-card__head">
        <div className="stock-card__head-row">
          {item.symbol ? (
            <a
              href={
                "https://finviz.com/quote.ashx?t=" +
                item.symbol.replace(".", "-") +
                "&ty=l&ta=0&p=w"
              }
              target="_blank"
              rel="noreferrer"
              className="stock-card__title"
            >
              <span className="stock-card__title-text">
                {item.name ?? item.symbol}
                {item.symbol ? ` (${item.symbol})` : ""}
              </span>
              <i className="bi bi-box-arrow-up-right stock-card__title-icon" aria-hidden />
            </a>
          ) : (
            <span className="stock-card__title-text">
              {item.name ?? item.symbol}
            </span>
          )}
          <button
            type="button"
            className="stock-card__company-info-btn"
            data-bs-toggle="collapse"
            data-bs-target={`#${companyDescCollapseId}`}
            aria-expanded={companyDescExpanded}
            aria-label="Toggle company description"
            title="Company description"
          >
            <i className="bi bi-info-circle" aria-hidden />
          </button>
        </div>
        {(item.industry ?? item.sector ?? item.country) && (
          <p className="stock-card__meta-row mb-0">
            {[item.industry, item.sector, item.country]
              .filter((v): v is string => typeof v === "string" && v.trim() !== "")
              .join(" • ")}
          </p>
        )}
      </header>

      {/* Company description panel – directly under name/symbol row */}
      <div
        id={companyDescCollapseId}
        className="collapse stock-card__panel stock-card__panel--company-desc"
        aria-label="Company description"
      >
        <div className="stock-card__panel-inner stock-card__panel-inner--company-desc">
          {companyDesc.status === "loading" && (
            <p className="mb-0 text-secondary small">Loading…</p>
          )}
          {companyDesc.status === "error" && (
            <p className="mb-0 text-secondary small">
              Could not load description.
            </p>
          )}
          {companyDesc.status === "loaded" && (
            <p className="mb-0 small stock-card__description-text">
              {companyDesc.text || "No description available."}
            </p>
          )}
          {companyDesc.status === "idle" && (
            <p className="mb-0 text-secondary small">
              Loading…
            </p>
          )}
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
            <span>AI: {toTitleCase(item.aiRating)}</span>
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
        showInlineCloseAll
        onCloseThisPanel={() => handleClosePanel(trendsCollapseId)}
      />

      {/* AI Assessment panel */}
      <div
        id={collapseId}
        className="collapse stock-card__panel"
        aria-label="AI Assessment"
      >
        <div className="stock-card__panel-inner">
          <div className="stock-card__close-all-inline-wrap">
            <span className="stock-card__panel-heading">AI Assessment</span>
            <button
              type="button"
              className="stock-card__close-all-inline"
              onClick={() => handleClosePanel(collapseId)}
              aria-label="Close this section"
            >
              <i className="bi bi-chevron-up" aria-hidden />
              Close
            </button>
          </div>
          {item.assessment ? (
            <p className="stock-card__assessment-text">{item.assessment}</p>
          ) : null}
          {item.aiAssessmentLastUpdated ? (
            <p className="stock-card__assessment-updated">
              - Last updated{" "}
              <span>{formatLastUpdated(item.aiAssessmentLastUpdated)}</span>
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
                    <span className="stock-card__action-label">Data used for AI assessment</span>
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
                      <AssessmentDetailTable data={assessmentDetail.data} />
                    )}
                    {assessmentDetail.status === "idle" && (
                      <p className="mb-0 text-secondary small">
                        Open to view the data fed into the LLM.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
        </div>
      </div>

      {/* User status + notes (when logged in) */}
      <CardUserActions
        symbol={item.symbol}
        cardId={cardDomId}
        recordId={item._id}
        compact={compact}
        actionBarSlotId={`stock-card-actions-slot-${cardDomId}`}
        targetPillSlotId={`stock-card-signals-slot-${cardDomId}`}
        labelsSlotId={`stock-card-labels-slot-${cardDomId}`}
        currentPrice={typeof item.price === "number" && !Number.isNaN(item.price) ? item.price : undefined}
        showInlineCloseAll
        onCloseThisPanel={() => handleClosePanel(`user-actions-${cardDomId}`)}
      />

      {/* Close all accordions – fixed to bottom when any is open */}
      {hasAnyOpen ? (
        <div className="stock-card__close-all-wrap">
          <button
            type="button"
            className="stock-card__close-all"
            onClick={handleCloseAll}
            aria-label="Close all"
          >
            <i className="bi bi-chevron-double-up" aria-hidden />
            Close all
          </button>
        </div>
      ) : null}
    </article>
  );
}

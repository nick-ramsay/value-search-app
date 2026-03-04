"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import type { ValueRecord, ValueSearchScoreDisplay } from "@/lib/value-search";
import ScoreModalTrigger from "./ScoreModalTrigger";
import HistoryCharts from "./HistoryCharts";
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

function formatLastUpdated(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const datePart = date.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const timePart = date.toLocaleTimeString(undefined, {
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

  const [hasAnyOpen, setHasAnyOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const [showPriceLastUpdated, setShowPriceLastUpdated] = useState(false);
  const [showAssessmentLastUpdated, setShowAssessmentLastUpdated] = useState(false);

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
      {/* Identity */}
      <header className="stock-card__head">
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
        ) : null}
      </header>

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

      {/* At-a-glance signals: AI rating, score, buy/sell target (when logged in) */}
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
      </div>

      {/* Inline labels row below rating/score */}
      <div
        className="stock-card__labels-slot"
        id={`stock-card-labels-slot-${cardDomId}`}
        aria-hidden="true"
      />

      {/* Primary actions: View trends, Assessment, Edit (when logged in) */}
      <div className="stock-card__actions">
        <HistoryCharts
          symbol={item.symbol}
          name={item.name ?? item.symbol}
          collapseId={trendsCollapseId}
          compact={compact}
          showInlineCloseAll={openCount >= 2}
          onCloseThisPanel={() => handleClosePanel(trendsCollapseId)}
        />
        <AssessmentPillButton collapseId={collapseId} ariaLabel="Toggle AI assessment" />
        <div
          className="stock-card__actions-slot"
          id={`stock-card-actions-slot-${cardDomId}`}
          aria-hidden="true"
        />
      </div>

      {/* AI Assessment panel */}
      <div
        id={collapseId}
        className="collapse stock-card__panel"
        aria-label="AI Assessment"
      >
        <div className="stock-card__panel-inner">
          <div className="stock-card__close-all-inline-wrap">
            <span className="stock-card__panel-heading">AI Assessment</span>
            {openCount >= 2 ? (
              <button
                type="button"
                className="stock-card__close-all-inline"
                onClick={() => handleClosePanel(collapseId)}
                aria-label="Close this section"
              >
                <i className="bi bi-chevron-up" aria-hidden />
                Close
              </button>
            ) : null}
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
        showInlineCloseAll={openCount >= 2}
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

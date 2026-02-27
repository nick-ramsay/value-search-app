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

type StockResultCardProps = {
  item: ValueRecord;
  compact?: boolean;
};

export default function StockResultCard({
  item,
  compact = false,
}: StockResultCardProps) {
  const instanceId = useId();
  const cardDomId = `${item._id}-${instanceId}`;
  const collapseId = `collapse-${cardDomId}`;
  const trendsCollapseId = `trends-${cardDomId}`;

  const [hasAnyOpen, setHasAnyOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const updateAnyOpen = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const anyOpen = card.querySelector(".collapse.show") != null;
    setHasAnyOpen(anyOpen);
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onShown = () => setHasAnyOpen(true);
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

  return (
    <article
      ref={cardRef}
      className={`stock-card${compact ? " stock-card--compact" : ""}${hasAnyOpen ? " stock-card--has-open" : ""}`}
      data-symbol={item.symbol ?? undefined}
      style={{ position: "relative" }}
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

      {/* At-a-glance signals */}
      <div className="stock-card__signals">
        {item.aiRating ? (
          <span
            className={`${getRatingBadgeClass(item.aiRating)} stock-card__badge`}
          >
            AI: {toTitleCase(item.aiRating)}
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
      </div>

      {/* Primary actions: View trends, Assessment, Edit (when logged in) */}
      <div className="stock-card__actions">
        <HistoryCharts
          symbol={item.symbol}
          name={item.name ?? item.symbol}
          collapseId={trendsCollapseId}
          compact={compact}
        />
        <AssessmentPillButton collapseId={collapseId} ariaLabel="Toggle assessment" />
        <div
          className="stock-card__actions-slot"
          id={`stock-card-actions-slot-${cardDomId}`}
          aria-hidden="true"
        />
      </div>

      {/* Assessment panel */}
      <div
        id={collapseId}
        className="collapse stock-card__panel"
        aria-label="Assessment"
      >
        <div className="stock-card__panel-inner">
          {item.assessment ? (
            <p className="stock-card__assessment-text">{item.assessment}</p>
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

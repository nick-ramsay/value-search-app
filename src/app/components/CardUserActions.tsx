"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import CardStatusSelect from "./CardStatusSelect";
import CardComments from "./CardComments";

const STATUS_LABELS: Record<string, string> = {
  "": "No status",
  Avoid: "Avoid",
  Watch: "Watch",
  Own: "Own",
  Hold: "Hold",
};

type CardUserActionsProps = {
  symbol: string | undefined;
  cardId: string;
  /** Stable identifier for the underlying stock record (e.g. database _id). */
  recordId?: string;
  compact?: boolean;
  /** When set, status + edit button are portaled into this element so they sit in the action row. */
  actionBarSlotId?: string;
};

export default function CardUserActions({
  symbol,
  cardId,
  recordId,
  compact = false,
  actionBarSlotId,
}: CardUserActionsProps) {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const commentsCollapseId = `comments-${cardId}`;
  const userActionsCollapseId = `user-actions-${cardId}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = document.getElementById(userActionsCollapseId);
    if (!el) return;
    const onShown = () => setExpanded(true);
    const onHidden = () => setExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [userActionsCollapseId]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !symbol) return;
    setStatusLoading(true);
    let cancelled = false;
    fetch(`/api/user-stock-data?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { status: "", comments: [] }))
      .then((data) => {
        if (!cancelled) {
          setStatus(data.status ?? "");
          setStatusLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("");
          setStatusLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, symbol]);

  if (sessionStatus !== "authenticated" || !symbol) return null;

  const statusLabel = (STATUS_LABELS[status] ?? status) || "No status";

  const pillStatusClass = status ? `stock-card__user-pill--${status.toLowerCase()}` : "";
  const handleStatusChangeEnd = () => setStatusUpdating(false);
  const handleStatusChange = (next: string) => {
    setStatus((prev) => {
      if (typeof window !== "undefined" && symbol) {
        window.dispatchEvent(
          new CustomEvent("portfolioStatusChange", {
            detail: {
              symbol,
              cardId,
              recordId,
              previousStatus: prev,
              nextStatus: next,
            },
          }),
        );
      }
      return next;
    });
  };
  const showStatusLoader = statusLoading || statusUpdating;
  const actionBarContent = (
    <div className={`stock-card__user-pill ${pillStatusClass}`}>
      {showStatusLoader ? (
        <span className="stock-card__status-loading" aria-hidden="true">
          <span className="spinner-border spinner-border-sm" role="status" aria-label={statusUpdating ? "Saving status" : "Loading status"}>
            <span className="visually-hidden">{statusUpdating ? "Saving status" : "Loading status"}</span>
          </span>
        </span>
      ) : status ? (
        <span
          className={`badge stock-card__status-badge stock-card__status-badge--${status.toLowerCase()}`}
          aria-label={`Status: ${statusLabel}`}
        >
          {statusLabel}
        </span>
      ) : null}
      <button
        type="button"
        className={`stock-card__action stock-card__action--secondary stock-card__action--inside-pill ${status ? "stock-card__action--icon" : ""}`}
        data-bs-toggle="collapse"
        data-bs-target={`#${userActionsCollapseId}`}
        aria-expanded={expanded}
        aria-controls={userActionsCollapseId}
        aria-label="Edit status and comments"
        title="Edit status and comments"
      >
        {!showStatusLoader && !status && <span className="stock-card__action-label">Edit</span>}
        <i
          className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} stock-card__action-chevron`}
          aria-hidden
        />
      </button>
    </div>
  );

  const collapseContent = (
    <div
      id={userActionsCollapseId}
      className="collapse stock-card__panel"
      aria-label="Status and comments"
    >
      <div className="stock-card__panel-inner">
        <div className="stock-card__user-form">
          <span className="stock-card__user-label">Status</span>
          <CardStatusSelect
            symbol={symbol}
            compact={compact}
            initialStatus={status}
            onStatusChange={handleStatusChange}
            onStatusUpdateStart={() => setStatusUpdating(true)}
            onStatusUpdateEnd={handleStatusChangeEnd}
          />
        </div>
        <div className="stock-card__comments-wrap">
          <CardComments
            symbol={symbol}
            collapseId={commentsCollapseId}
            compact={compact}
          />
        </div>
      </div>
    </div>
  );

  if (!actionBarSlotId) {
    return (
      <div className="stock-card__user">
        {actionBarContent}
        {collapseContent}
      </div>
    );
  }

  const slotEl = mounted && typeof document !== "undefined" ? document.getElementById(actionBarSlotId) : null;

  return (
    <>
      {slotEl && createPortal(actionBarContent, slotEl)}
      {collapseContent}
    </>
  );
}

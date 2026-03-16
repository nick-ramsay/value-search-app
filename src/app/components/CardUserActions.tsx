 "use client";

import { useEffect, useState, useCallback } from "react";
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

function formatTarget(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
}

/** Focus the next focusable element (input, select, button, textarea) within the container. */
function focusNextInContainer(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    "input:not([disabled]), select:not([disabled]), button:not([disabled]), textarea:not([disabled])",
  );
  const current = document.activeElement;
  const list = Array.from(focusable).filter((el) => el.offsetParent != null);
  const idx = list.indexOf(current as HTMLElement);
  if (idx >= 0 && idx < list.length - 1) {
    list[idx + 1].focus();
  }
}

type CardUserActionsProps = {
  symbol: string | undefined;
  cardId: string;
  /** Stable identifier for the underlying stock record (e.g. database _id). */
  recordId?: string;
  compact?: boolean;
  /** When set, status + edit button are portaled into this element so they sit in the action row. */
  actionBarSlotId?: string;
  /** When set, buy/sell target pill is portaled into this element (e.g. signals row). */
  targetPillSlotId?: string;
  /** When set, labels are portaled into this element (e.g. a row below signals). */
  labelsSlotId?: string;
  /** Current stock price (from quote); used to show fulfilled icon next to target pill. */
  currentPrice?: number;
  /** When true and this panel is open, show a small "Close" button inside the panel. */
  showInlineCloseAll?: boolean;
  /** Called when the inline "Close" is clicked (closes only this panel). */
  onCloseThisPanel?: () => void;
};

export default function CardUserActions({
  symbol,
  cardId,
  recordId,
  compact = false,
  actionBarSlotId,
  targetPillSlotId,
  labelsSlotId,
  currentPrice,
  showInlineCloseAll = false,
  onCloseThisPanel,
}: CardUserActionsProps) {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [buyTarget, setBuyTarget] = useState<number | undefined>(undefined);
  const [sellTarget, setSellTarget] = useState<number | undefined>(undefined);
  const [targetSaving, setTargetSaving] = useState(false);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelSaving, setLabelSaving] = useState(false);
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
      .then((r) =>
        r.ok
          ? r.json()
          : {
              status: "",
              comments: [],
              buyTarget: undefined,
              sellTarget: undefined,
            },
      )
      .then((data) => {
        if (!cancelled) {
          setStatus(data.status ?? "");
          setBuyTarget(data.buyTarget != null ? Number(data.buyTarget) : undefined);
          setSellTarget(data.sellTarget != null ? Number(data.sellTarget) : undefined);
          const serverLabels: string[] = Array.isArray(data.labels)
            ? data.labels.filter((l: unknown): l is string => typeof l === "string")
            : [];
          setLabels(serverLabels);
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

  const saveTarget = useCallback(
    (field: "buyTarget" | "sellTarget", value: number | null) => {
      if (!symbol) return;
      setTargetSaving(true);
      fetch("/api/user-stock-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, [field]: value }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (field === "buyTarget") {
            setBuyTarget(data?.buyTarget != null ? Number(data.buyTarget) : undefined);
          } else {
            setSellTarget(data?.sellTarget != null ? Number(data.sellTarget) : undefined);
          }
        })
        .finally(() => setTargetSaving(false));
    },
    [symbol],
  );

  const saveLabels = useCallback(
    (next: string[]) => {
      if (!symbol) return;
      const normalized = Array.from(
        new Set(
          next.map((l) => l.trim()).filter((l) => l.length > 0),
        ),
      );
      // Optimistic update
      setLabels(normalized);
      setLabelSaving(true);
      fetch("/api/user-stock-data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, labels: normalized }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const fromServerLabels: string[] =
            data && Array.isArray(data.labels)
              ? data.labels.filter(
                  (l: unknown): l is string => typeof l === "string",
                )
              : [];
          if (fromServerLabels.length > 0) {
            setLabels(fromServerLabels);
          }
        })
        .finally(() => setLabelSaving(false));
    },
    [symbol],
  );

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

  const showBuyTargetInput = status === "Avoid" || status === "Watch";
  const showSellTargetInput = status === "Own" || status === "Hold";
  const showStatusLoader = statusLoading || statusUpdating;
  const showTargetPill =
    (showBuyTargetInput && buyTarget != null && buyTarget > 0) ||
    (showSellTargetInput && sellTarget != null && sellTarget > 0);

  const buyFulfilled =
    showBuyTargetInput &&
    buyTarget != null &&
    typeof currentPrice === "number" &&
    !Number.isNaN(currentPrice) &&
    currentPrice < buyTarget;
  const sellFulfilled =
    showSellTargetInput &&
    sellTarget != null &&
    typeof currentPrice === "number" &&
    !Number.isNaN(currentPrice) &&
    currentPrice > sellTarget;
  const targetFulfilled = buyFulfilled || sellFulfilled;

  const fulfilledLabel = buyFulfilled
    ? `Buy target fulfilled (price below $${formatTarget(buyTarget ?? 0)})`
    : sellFulfilled
      ? `Sell target fulfilled (price above $${formatTarget(sellTarget ?? 0)})`
      : "";

  const targetPillContent = showTargetPill ? (
    <span
      className={`badge stock-card__target-pill stock-card__target-pill--${showBuyTargetInput ? "buy" : "sell"}${targetFulfilled ? " stock-card__target-pill--fulfilled" : ""}`}
      aria-label={targetFulfilled ? fulfilledLabel : showBuyTargetInput ? `Buy target: $${formatTarget(buyTarget ?? 0)}` : `Sell target: $${formatTarget(sellTarget ?? 0)}`}
      title={targetFulfilled ? fulfilledLabel : undefined}
    >
      {showBuyTargetInput ? `Buy @ $${formatTarget(buyTarget ?? 0)}` : `Sell @ $${formatTarget(sellTarget ?? 0)}`}
      {targetFulfilled ? (
        <i className="bi bi-check-circle-fill stock-card__target-pill-tick" aria-hidden />
      ) : null}
    </span>
  ) : null;

  const labelsInlineContent =
    labels.length > 0 ? (
      <div className="stock-card__labels-inline">
        {labels.map((name) => (
          <span key={name} className="stock-card__label-pill">
            <i className="bi bi-tag-fill stock-card__label-pill-icon" aria-hidden />
            <span className="stock-card__label-pill-text">{name}</span>
          </span>
        ))}
      </div>
    ) : null;

  const targetPillSlotEl =
    mounted && targetPillSlotId && typeof document !== "undefined"
      ? document.getElementById(targetPillSlotId)
      : null;

  const labelsSlotEl =
    mounted && labelsSlotId && typeof document !== "undefined"
      ? document.getElementById(labelsSlotId)
      : null;

  const actionBarContent = (
    <div className="stock-card__user-actions-row">
      {!targetPillSlotId && targetPillContent}
      <button
        type="button"
        className={`stock-card__user-pill stock-card__user-pill-trigger ${pillStatusClass}`}
        data-bs-toggle="collapse"
        data-bs-target={`#${userActionsCollapseId}`}
        aria-expanded={expanded}
        aria-controls={userActionsCollapseId}
        aria-label="Edit status and comments"
        title="Edit status and comments"
        disabled={showStatusLoader}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {showStatusLoader ? (
          <span className="stock-card__status-loading" aria-hidden="true">
            <span className="spinner-border spinner-border-sm" role="status" aria-label={statusUpdating ? "Saving status" : "Loading status"}>
              <span className="visually-hidden">{statusUpdating ? "Saving status" : "Loading status"}</span>
            </span>
          </span>
        ) : (
          <>
            {status ? (
              <span
                className={`badge stock-card__status-badge stock-card__status-badge--${status.toLowerCase()}`}
                aria-hidden
              >
                {statusLabel}
              </span>
            ) : (
              <span className="stock-card__action-label">Edit</span>
            )}
            <i
              className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} stock-card__action-chevron`}
              aria-hidden
            />
          </>
        )}
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
        <div className="stock-card__close-all-inline-wrap">
          <span className="stock-card__panel-heading">Edit Portfolio Entry</span>
          {showInlineCloseAll && onCloseThisPanel ? (
            <button
              type="button"
              className="stock-card__close-all-inline"
              onClick={onCloseThisPanel}
              aria-label="Close this section"
            >
              <i className="bi bi-chevron-up" aria-hidden />
              Close
            </button>
          ) : null}
        </div>
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
        {showBuyTargetInput ? (
          <div className="stock-card__user-form stock-card__user-form--target">
            <label htmlFor={`buy-target-${cardId}`} className="stock-card__user-label">
              Buy Target
            </label>
            <div className="stock-card__target-row">
              <div className="stock-card__target-input-wrap">
                <span className="stock-card__target-input-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  key={`buy-${cardId}-${buyTarget ?? "empty"}`}
                  id={`buy-target-${cardId}`}
                  type="number"
                  step="0.01"
                  min="0"
                  className="stock-card__target-input"
                  placeholder="Price to buy"
                  defaultValue={
                    buyTarget != null && buyTarget > 0 ? String(buyTarget) : ""
                  }
                  disabled={targetSaving}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const num = raw === "" ? null : parseFloat(raw);
                    if (num !== null && !Number.isNaN(num) && num > 0) {
                      setBuyTarget(num);
                      saveTarget("buyTarget", num);
                    } else if (raw === "") {
                      setBuyTarget(undefined);
                      saveTarget("buyTarget", null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const raw = (e.target as HTMLInputElement).value.trim();
                    const num = raw === "" ? null : parseFloat(raw);
                    if (num !== null && !Number.isNaN(num) && num > 0) {
                      setBuyTarget(num);
                      saveTarget("buyTarget", num);
                    } else if (raw === "") {
                      setBuyTarget(undefined);
                      saveTarget("buyTarget", null);
                    }
                    focusNextInContainer(userActionsCollapseId);
                  }}
                  aria-label="Buy target price in dollars"
                />
              </div>
              <button
                type="button"
                className="stock-card__target-clear-btn"
                onClick={() => {
                  if (targetSaving) return;
                  setBuyTarget(undefined);
                  saveTarget("buyTarget", null);
                }}
                disabled={targetSaving}
                aria-label="Clear buy target"
                title="Clear buy target"
              >
                <i className="bi bi-x-lg" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
        {showSellTargetInput ? (
          <div className="stock-card__user-form stock-card__user-form--target">
            <label htmlFor={`sell-target-${cardId}`} className="stock-card__user-label">
              Sell Target
            </label>
            <div className="stock-card__target-row">
              <div className="stock-card__target-input-wrap">
                <span className="stock-card__target-input-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  key={`sell-${cardId}-${sellTarget ?? "empty"}`}
                  id={`sell-target-${cardId}`}
                  type="number"
                  step="0.01"
                  min="0"
                  className="stock-card__target-input"
                  placeholder="Price to sell"
                  defaultValue={
                    sellTarget != null && sellTarget > 0 ? String(sellTarget) : ""
                  }
                  disabled={targetSaving}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const num = raw === "" ? null : parseFloat(raw);
                    if (num !== null && !Number.isNaN(num) && num > 0) {
                      setSellTarget(num);
                      saveTarget("sellTarget", num);
                    } else if (raw === "") {
                      setSellTarget(undefined);
                      saveTarget("sellTarget", null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const raw = (e.target as HTMLInputElement).value.trim();
                    const num = raw === "" ? null : parseFloat(raw);
                    if (num !== null && !Number.isNaN(num) && num > 0) {
                      setSellTarget(num);
                      saveTarget("sellTarget", num);
                    } else if (raw === "") {
                      setSellTarget(undefined);
                      saveTarget("sellTarget", null);
                    }
                    focusNextInContainer(userActionsCollapseId);
                  }}
                  aria-label="Sell target price in dollars"
                />
              </div>
              <button
                type="button"
                className="stock-card__target-clear-btn"
                onClick={() => {
                  if (targetSaving) return;
                  setSellTarget(undefined);
                  saveTarget("sellTarget", null);
                }}
                disabled={targetSaving}
                aria-label="Clear sell target"
                title="Clear sell target"
              >
                <i className="bi bi-x-lg" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
        <div className="stock-card__user-form stock-card__user-form--labels">
          <label htmlFor={`label-${cardId}`} className="stock-card__user-label">
            Label
          </label>
          <div className="stock-card__labels-editor d-flex flex-column gap-1">
            <div className="stock-card__labels-list">
              <>
                {labels.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="stock-card__label-pill"
                    onClick={() => {
                      if (labelSaving) return;
                      const next = labels.filter((l) => l !== name);
                      saveLabels(next);
                    }}
                    disabled={labelSaving}
                    aria-label={`Remove label ${name}`}
                  >
                    <span className="stock-card__label-pill-text">{name}</span>
                    <i
                      className="bi bi-x stock-card__label-pill-icon"
                      aria-hidden
                    />
                  </button>
                ))}
                {labels.length === 0 && (
                  <span className="stock-card__labels-empty">
                    No label selected
                  </span>
                )}
              </>
            </div>
            <select
              id={`label-${cardId}`}
              className="form-select form-select-sm glass-select stock-card__status-select"
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                const trimmed = value.trim();
                if (!trimmed || labels.includes(trimmed)) return;
                const next = [...labels, trimmed];
                saveLabels(next);
                e.target.value = "";
              }}
              disabled={labelSaving}
            >
              <option value="">Select label</option>
              <option value="KPP">KPP</option>
              <option value="Motley Fool">Motley Fool</option>
              <option value="CNBC">CNBC</option>
            </select>
          </div>
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
        {targetPillSlotId &&
          targetPillSlotEl &&
          targetPillContent &&
          createPortal(targetPillContent, targetPillSlotEl)}
        {labelsSlotEl &&
          labelsInlineContent &&
          createPortal(labelsInlineContent, labelsSlotEl)}
        {actionBarContent}
        {collapseContent}
      </div>
    );
  }

  const slotEl = mounted && typeof document !== "undefined" ? document.getElementById(actionBarSlotId) : null;

  return (
    <>
      {targetPillSlotEl &&
        targetPillContent &&
        createPortal(targetPillContent, targetPillSlotEl)}
      {labelsSlotEl &&
        labelsInlineContent &&
        createPortal(labelsInlineContent, labelsSlotEl)}
      {slotEl && createPortal(actionBarContent, slotEl)}
      {collapseContent}
    </>
  );
}

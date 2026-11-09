"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STATUS_OPTIONS = [
  { value: "Avoid",  label: "Avoid",  colorClass: "status-btn--avoid"  },
  { value: "Watch",  label: "Watch",  colorClass: "status-btn--watch"  },
  { value: "Queued", label: "Queued", colorClass: "status-btn--queued" },
  { value: "Own",    label: "Own",    colorClass: "status-btn--own"    },
  { value: "Hold",   label: "Hold",   colorClass: "status-btn--hold"   },
] as const;

type StatusValue = "" | "Avoid" | "Watch" | "Queued" | "Own" | "Hold";

type CardStatusSelectProps = {
  symbol: string;
  compact?: boolean;
  initialStatus?: string;
  onStatusChange?: (status: string) => void;
  onStatusUpdateStart?: () => void;
  onStatusUpdateEnd?: () => void;
};

export default function CardStatusSelect({
  symbol,
  compact = false,
  initialStatus,
  onStatusChange,
  onStatusUpdateStart,
  onStatusUpdateEnd,
}: CardStatusSelectProps) {
  const [status, setStatus] = useState<StatusValue>((initialStatus ?? "") as StatusValue);
  const [loading, setLoading] = useState(typeof initialStatus === "undefined");
  const [saving, setSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<StatusValue | null>(null);
  const [noteText, setNoteText] = useState("");
  const [mounted, setMounted] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMounted(true), []);

  // Focus the note field whenever the confirmation prompt opens.
  useEffect(() => {
    if (pendingStatus !== null) {
      const t = setTimeout(() => noteInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [pendingStatus]);

  useEffect(() => {
    if (typeof initialStatus !== "undefined") {
      setStatus((initialStatus ?? "") as StatusValue);
      return;
    }
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/user-stock-data?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { status: "" }))
      .then((data) => {
        if (!cancelled) {
          const s = (data.status ?? "") as StatusValue;
          setStatus(s);
          onStatusChange?.(s);
        }
      })
      .catch(() => { if (!cancelled) { setStatus(""); onStatusChange?.(""); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, initialStatus, onStatusChange]);

  const pick = (next: StatusValue) => {
    if (saving || pendingStatus !== null) return;
    // Clicking the active status clears it
    const value: StatusValue = next === status ? "" : next;
    setNoteText("");
    setPendingStatus(value);
  };

  const cancelPending = () => {
    setPendingStatus(null);
    setNoteText("");
  };

  const confirmPending = () => {
    if (pendingStatus === null || saving) return;
    const value = pendingStatus;
    const note = noteText.trim();
    setPendingStatus(null);
    setNoteText("");
    setSaving(true);
    onStatusUpdateStart?.();
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, status: value, ...(note ? { note } : {}) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = (data?.status ?? value) as StatusValue;
        setStatus(s);
        onStatusChange?.(s);
      })
      .finally(() => { setSaving(false); onStatusUpdateEnd?.(); });
  };

  if (loading) return <div className="status-btn-group status-btn-group--loading" aria-hidden />;

  const pendingLabel =
    pendingStatus === "" ? "Clear" : STATUS_OPTIONS.find((o) => o.value === pendingStatus)?.label;

  const confirmDialog =
    pendingStatus !== null && mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            <div className="status-confirm-backdrop" onClick={cancelPending} aria-hidden="true" />
            <div
              className="status-confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="status-confirm-title"
            >
              <div className="status-confirm-dialog__header">
                <h5 className="status-confirm-dialog__title" id="status-confirm-title">
                  {pendingStatus === ""
                    ? "Clear status?"
                    : `Set status to ${pendingLabel}?`}
                </h5>
                <button
                  type="button"
                  className="status-confirm-dialog__close"
                  onClick={cancelPending}
                  aria-label="Cancel"
                >
                  <i className="bi bi-x" aria-hidden />
                </button>
              </div>

              <textarea
                ref={noteInputRef}
                className="status-confirm-dialog__textarea"
                placeholder="Optional note about why (e.g. earnings miss, thesis changed)…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    confirmPending();
                  }
                  if (e.key === "Escape") cancelPending();
                }}
                aria-label="Optional note about this status change"
                rows={3}
              />

              <div className="status-confirm-dialog__footer">
                <button
                  type="button"
                  className="status-confirm-dialog__cancel"
                  onClick={cancelPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="status-confirm-dialog__confirm"
                  onClick={confirmPending}
                >
                  {pendingStatus === "" ? "Clear status" : `Set to ${pendingLabel}`}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={`status-btn-group${compact ? " status-btn-group--compact" : ""}${saving ? " status-btn-group--saving" : ""}`}
        role="group"
        aria-label="Stock status"
      >
        {STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`status-btn ${opt.colorClass}${active ? " status-btn--active" : ""}`}
              onClick={() => pick(opt.value)}
              disabled={saving}
              aria-pressed={active}
              aria-label={`Set status to ${opt.label}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {confirmDialog}
    </>
  );
}

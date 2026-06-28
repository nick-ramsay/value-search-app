"use client";

import { useEffect, useState } from "react";

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
    if (saving) return;
    // Clicking the active status clears it
    const value: StatusValue = next === status ? "" : next;
    setSaving(true);
    onStatusUpdateStart?.();
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, status: value }),
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

  return (
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
  );
}

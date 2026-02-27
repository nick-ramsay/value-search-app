"use client";

import { useEffect, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "No status" },
  { value: "Avoid", label: "Avoid" },
  { value: "Watch", label: "Watch" },
  { value: "Own", label: "Own" },
  { value: "Hold", label: "Hold" },
] as const;

type CardStatusSelectProps = {
  symbol: string;
  compact?: boolean;
  /** When provided, used as initial state and fetch is skipped (parent owns status). */
  initialStatus?: string;
  /** Called when status is updated (after load when not using initialStatus, or after PATCH). */
  onStatusChange?: (status: string) => void;
};

export default function CardStatusSelect({
  symbol,
  compact = false,
  initialStatus,
  onStatusChange,
}: CardStatusSelectProps) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [loading, setLoading] = useState(typeof initialStatus === "undefined");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof initialStatus !== "undefined") {
      setStatus(initialStatus);
      return;
    }
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/user-stock-data?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { status: "", comments: [] }))
      .then((data) => {
        if (!cancelled) {
          const s = data.status ?? "";
          setStatus(s);
          onStatusChange?.(s);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("");
          onStatusChange?.("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, initialStatus, onStatusChange]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as "" | "Avoid" | "Watch" | "Own" | "Hold";
    setSaving(true);
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, status: next }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.status ?? next;
        setStatus(s);
        onStatusChange?.(s);
      })
      .finally(() => setSaving(false));
  };

  if (loading) return null;

  return (
    <select
      className={`form-select form-select-sm glass-select stock-card__status-select ${compact ? "py-1 stock-card__status-select--compact" : ""}`}
      style={{ width: "auto", minWidth: compact ? "6rem" : "7rem", fontSize: compact ? "0.75rem" : "0.8rem" }}
      value={status}
      onChange={handleChange}
      disabled={saving}
      aria-label="Stock status"
      title="Change status"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value || "none"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

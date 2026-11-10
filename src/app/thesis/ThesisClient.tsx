"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ThesisDirection = "interested" | "avoid";
type ThesisStatusValue = "active" | "inactive";

type ThesisPointView = {
  id: string;
  text: string;
  direction: ThesisDirection;
  status: ThesisStatusValue;
  createdAt: string;
};

const CONFIRM_WORD = "confirmed";

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    const diffYears = Math.floor(diffMonths / 12);
    return `${diffYears}y ago`;
  } catch {
    return "";
  }
}

function formatFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function ThesisPointCard({
  point,
  busy,
  onToggle,
  onDelete,
}: {
  point: ThesisPointView;
  busy: boolean;
  onToggle: (point: ThesisPointView) => void;
  onDelete: (id: string) => void;
}) {
  const isActive = point.status === "active";
  return (
    <li className={`thesis-point-card${isActive ? "" : " thesis-point-card--inactive"}`}>
      <div className="thesis-point-card__top">
        <span
          className={`badge thesis-point-card__direction thesis-point-card__direction--${point.direction}`}
        >
          <i
            className={`bi ${point.direction === "interested" ? "bi-arrow-up-right" : "bi-slash-circle"}`}
            aria-hidden
          />
          {point.direction === "interested" ? "Interested" : "Avoid"}
        </span>
        <time
          className="thesis-point-card__date"
          dateTime={point.createdAt}
          title={formatFull(point.createdAt)}
        >
          {formatRelative(point.createdAt)}
        </time>
      </div>
      <p className="thesis-point-card__text">{point.text}</p>
      <div className="thesis-point-card__actions">
        <button
          type="button"
          className="thesis-point-card__action"
          onClick={() => onToggle(point)}
          disabled={busy}
        >
          <i className={`bi ${isActive ? "bi-archive" : "bi-arrow-counterclockwise"}`} aria-hidden />
          {isActive ? "Move to inactive" : "Reactivate"}
        </button>
        <button
          type="button"
          className="thesis-point-card__action thesis-point-card__action--danger"
          onClick={() => onDelete(point.id)}
          disabled={busy}
          aria-label="Delete thesis point"
          title="Delete"
        >
          <i className="bi bi-trash" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export default function ThesisClient() {
  const [points, setPoints] = useState<ThesisPointView[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<ThesisDirection>("interested");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    fetch("/api/thesis")
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((data) => setPoints(data.points ?? []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (pendingDeleteId) {
      setConfirmText("");
      const t = setTimeout(() => confirmInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [pendingDeleteId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    fetch("/api/thesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, direction }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.message ?? "Could not add thesis point.");
        }
        return r.json();
      })
      .then((point: ThesisPointView) => {
        setPoints((prev) => [point, ...prev]);
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const toggleStatus = (point: ThesisPointView) => {
    const nextStatus: ThesisStatusValue = point.status === "active" ? "inactive" : "active";
    setTogglingId(point.id);
    fetch(`/api/thesis/${point.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((updated: ThesisPointView | null) => {
        if (!updated) return;
        setPoints((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      })
      .finally(() => setTogglingId(null));
  };

  const openDeleteModal = (id: string) => setPendingDeleteId(id);
  const closeDeleteModal = () => {
    setPendingDeleteId(null);
    setConfirmText("");
  };
  const confirmDelete = () => {
    if (!pendingDeleteId || confirmText.trim().toLowerCase() !== CONFIRM_WORD) return;
    const id = pendingDeleteId;
    fetch(`/api/thesis/${id}`, { method: "DELETE" }).then((r) => {
      if (r.ok) setPoints((prev) => prev.filter((p) => p.id !== id));
    });
    closeDeleteModal();
  };

  const active = points.filter((p) => p.status === "active");
  const inactive = points.filter((p) => p.status === "inactive");
  const pendingPoint = pendingDeleteId ? points.find((p) => p.id === pendingDeleteId) : null;

  const deleteModal =
    pendingDeleteId && mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            <div className="note-delete-backdrop" onClick={closeDeleteModal} aria-hidden="true" />
            <div
              className="note-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="thesis-delete-title"
            >
              <div className="note-delete-dialog__header">
                <h5 className="note-delete-dialog__title" id="thesis-delete-title">
                  <i className="bi bi-trash note-delete-dialog__icon" aria-hidden />
                  Delete thesis point?
                </h5>
                <button
                  type="button"
                  className="note-delete-dialog__close"
                  onClick={closeDeleteModal}
                  aria-label="Cancel"
                >
                  <i className="bi bi-x" aria-hidden />
                </button>
              </div>

              {pendingPoint && (
                <blockquote className="note-delete-dialog__preview">{pendingPoint.text}</blockquote>
              )}

              <p className="note-delete-dialog__instruction">
                Type <strong>{CONFIRM_WORD}</strong> to permanently delete this thesis point.
              </p>

              <input
                ref={confirmInputRef}
                type="text"
                className="note-delete-dialog__input"
                placeholder={CONFIRM_WORD}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmDelete();
                  if (e.key === "Escape") closeDeleteModal();
                }}
                aria-label={`Type ${CONFIRM_WORD} to confirm deletion`}
                autoComplete="off"
                spellCheck={false}
              />

              <div className="note-delete-dialog__footer">
                <button type="button" className="note-delete-dialog__cancel" onClick={closeDeleteModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="note-delete-dialog__confirm"
                  onClick={confirmDelete}
                  disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD}
                >
                  Delete thesis point
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <section className="card glass-card thesis-page__form-card mt-4" aria-label="Add a thesis point">
        <div className="card-body">
          <form onSubmit={handleSubmit} className="thesis-page__form">
            <textarea
              ref={textareaRef}
              className="thesis-page__textarea"
              placeholder="e.g. AI infrastructure buildout still has runway into next year…"
              value={text}
              onChange={handleTextareaChange}
              disabled={submitting}
              aria-label="New thesis point"
              rows={2}
              maxLength={500}
            />
            <div className="thesis-page__form-footer">
              <div className="thesis-page__direction-toggle" role="radiogroup" aria-label="Direction">
                <button
                  type="button"
                  className={`thesis-page__direction-btn thesis-page__direction-btn--interested${direction === "interested" ? " thesis-page__direction-btn--active" : ""}`}
                  onClick={() => setDirection("interested")}
                  role="radio"
                  aria-checked={direction === "interested"}
                >
                  <i className="bi bi-arrow-up-right" aria-hidden /> Interested
                </button>
                <button
                  type="button"
                  className={`thesis-page__direction-btn thesis-page__direction-btn--avoid${direction === "avoid" ? " thesis-page__direction-btn--active" : ""}`}
                  onClick={() => setDirection("avoid")}
                  role="radio"
                  aria-checked={direction === "avoid"}
                >
                  <i className="bi bi-slash-circle" aria-hidden /> Avoid
                </button>
              </div>
              <button
                type="submit"
                className="glass-btn glass-btn-primary thesis-page__submit"
                disabled={submitting || !text.trim()}
              >
                Add
              </button>
            </div>
            {error && <p className="thesis-page__error mb-0">{error}</p>}
          </form>
        </div>
      </section>

      <section className="thesis-page__section mt-4" aria-label="Active thesis points">
        <h3 className="thesis-page__section-title">Active</h3>
        {loading ? (
          <p className="thesis-page__muted">Loading…</p>
        ) : active.length === 0 ? (
          <p className="thesis-page__muted">No active thesis points yet — add one above.</p>
        ) : (
          <ul className="thesis-point-list">
            {active.map((p) => (
              <ThesisPointCard
                key={p.id}
                point={p}
                busy={togglingId === p.id}
                onToggle={toggleStatus}
                onDelete={openDeleteModal}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="thesis-page__section thesis-page__section--inactive mt-4 mb-4" aria-label="Inactive thesis points">
        <h3 className="thesis-page__section-title">Inactive</h3>
        {!loading && inactive.length === 0 ? (
          <p className="thesis-page__muted">Retired thesis points are stored here.</p>
        ) : !loading ? (
          <ul className="thesis-point-list">
            {inactive.map((p) => (
              <ThesisPointCard
                key={p.id}
                point={p}
                busy={togglingId === p.id}
                onToggle={toggleStatus}
                onDelete={openDeleteModal}
              />
            ))}
          </ul>
        ) : null}
      </section>

      {deleteModal}
    </>
  );
}

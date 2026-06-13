"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";

type Note = { id: string; text: string; createdAt: string };

type CardNotesProps = {
  symbol: string;
  collapseId: string;
  compact?: boolean;
  /** ID of a slot element in the action bar to portal the trigger button into. */
  notesSlotId?: string;
  /** data-bs-parent selector for card-level accordion (closes other panels when this opens). */
  accordionParentId?: string;
  onCloseThisPanel?: () => void;
};

const CONFIRM_WORD = "confirmed";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export default function CardNotes({
  symbol,
  collapseId,
  compact = false,
  notesSlotId,
  accordionParentId,
  onCloseThisPanel,
}: CardNotesProps) {
  const { status: sessionStatus } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Delete confirmation modal state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const el = document.getElementById(collapseId);
    if (!el) return;
    const onShown = () => setExpanded(true);
    const onHidden = () => setExpanded(false);
    el.addEventListener("shown.bs.collapse", onShown);
    el.addEventListener("hidden.bs.collapse", onHidden);
    return () => {
      el.removeEventListener("shown.bs.collapse", onShown);
      el.removeEventListener("hidden.bs.collapse", onHidden);
    };
  }, [collapseId]);

  useEffect(() => {
    if (!symbol || sessionStatus !== "authenticated") return;
    fetch(`/api/user-stock-data?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((data) => setNotes(data.comments ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [symbol, sessionStatus]);

  // Focus the confirm input whenever the modal opens
  useEffect(() => {
    if (pendingDeleteId) {
      setConfirmText("");
      // Small delay so the portal has rendered
      const t = setTimeout(() => confirmInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [pendingDeleteId]);

  const persist = (nextNotes: Note[]) =>
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, comments: nextNotes }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.comments) setNotes(data.comments); });

  const addNote = () => {
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const next = [...notes, { id: generateId(), text, createdAt: new Date().toISOString() }];
    setNotes(next);
    setNewText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    persist(next).finally(() => setSubmitting(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addNote();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const openDeleteModal = (id: string) => setPendingDeleteId(id);

  const closeDeleteModal = () => {
    setPendingDeleteId(null);
    setConfirmText("");
  };

  const confirmDelete = () => {
    if (!pendingDeleteId || confirmText.trim().toLowerCase() !== CONFIRM_WORD) return;
    const next = notes.filter((n) => n.id !== pendingDeleteId);
    setNotes(next);
    persist(next);
    closeDeleteModal();
  };

  if (sessionStatus !== "authenticated" || !symbol) return null;

  const notesOldestFirst = [...notes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const pendingNote = pendingDeleteId ? notes.find((n) => n.id === pendingDeleteId) : null;

  const slotEl =
    mounted && notesSlotId && typeof document !== "undefined"
      ? document.getElementById(notesSlotId)
      : null;

  const triggerBtn = (
    <button
      type="button"
      className={`stock-card__action stock-card__action--secondary${compact ? " stock-card__action--compact" : ""}`}
      data-bs-toggle="collapse"
      data-bs-target={`#${collapseId}`}
      aria-expanded={expanded}
      aria-controls={collapseId}
      aria-label="Toggle notes"
    >
      <i className="bi bi-journal-text stock-card__action-icon" aria-hidden />
      <span className="stock-card__action-label stock-card__action-label--full">Notes</span>
      <span className="stock-card__action-label stock-card__action-label--short">Notes</span>
      {notes.length > 0 && !loading && (
        <span className="stock-card__notes-count">{notes.length}</span>
      )}
      <i
        className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"} stock-card__action-chevron`}
        aria-hidden
      />
    </button>
  );

  const deleteModal = pendingDeleteId && mounted && typeof document !== "undefined"
    ? createPortal(
        <>
          {/* Backdrop */}
          <div
            className="note-delete-backdrop"
            onClick={closeDeleteModal}
            aria-hidden="true"
          />
          {/* Dialog */}
          <div
            className="note-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-delete-title"
          >
            <div className="note-delete-dialog__header">
              <h5 className="note-delete-dialog__title" id="note-delete-title">
                <i className="bi bi-trash note-delete-dialog__icon" aria-hidden />
                Delete note?
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

            {pendingNote && (
              <blockquote className="note-delete-dialog__preview">
                {pendingNote.text}
              </blockquote>
            )}

            <p className="note-delete-dialog__instruction">
              Type <strong>{CONFIRM_WORD}</strong> to permanently delete this note.
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
              <button
                type="button"
                className="note-delete-dialog__cancel"
                onClick={closeDeleteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="note-delete-dialog__confirm"
                onClick={confirmDelete}
                disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD}
              >
                Delete note
              </button>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  const panel = (
    <div
      id={collapseId}
      className="collapse stock-card__panel"
      aria-label="Notes"
      data-bs-parent={accordionParentId}
    >
      <div className="stock-card__panel-inner">
        <div className="stock-card__close-all-inline-wrap">
          <span className="stock-card__panel-heading">Notes</span>
        </div>

        {loading ? (
          <p className="stock-card__muted small mt-2">Loading…</p>
        ) : (
          <>
            {notesOldestFirst.length > 0 && (
              <ul className="stock-card__notes-list">
                {notesOldestFirst.map((note) => (
                  <li key={note.id} className="stock-card__note-item">
                    <p className="stock-card__note-text">{note.text}</p>
                    <div className="stock-card__note-footer">
                      <time
                        className="stock-card__note-time"
                        dateTime={note.createdAt}
                        title={formatFull(note.createdAt)}
                      >
                        {formatRelative(note.createdAt)}
                      </time>
                      <button
                        type="button"
                        className="stock-card__note-delete"
                        onClick={() => openDeleteModal(note.id)}
                        disabled={submitting}
                        aria-label="Delete note"
                        title="Delete note"
                      >
                        <i className="bi bi-trash" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {notesOldestFirst.length === 0 && (
              <p className="stock-card__muted stock-card__notes-empty">
                No notes yet — add one below.
              </p>
            )}

            <div className="stock-card__note-form">
              <textarea
                ref={textareaRef}
                className="stock-card__note-input"
                placeholder="Write a note…"
                value={newText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={submitting}
                aria-label="New note"
                rows={2}
              />
              <div className="stock-card__note-form-footer">
                <span className="stock-card__note-hint">⌘↵ to save</span>
                <button
                  type="button"
                  className="stock-card__action stock-card__action--primary stock-card__action--compact"
                  onClick={addNote}
                  disabled={submitting || !newText.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
        {onCloseThisPanel && (
          <div className="stock-card__panel-close-row">
            <button
              type="button"
              className="stock-card__panel-close-btn"
              onClick={onCloseThisPanel}
              aria-label="Close this section"
            >
              Close <i className="bi bi-x" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {slotEl ? createPortal(triggerBtn, slotEl) : null}
      {panel}
      {deleteModal}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Comment = { id: string; text: string; createdAt: string };

type CardCommentsProps = {
  symbol: string;
  collapseId: string;
  compact?: boolean;
};

const DELETE_MODAL_ID_PREFIX = "card-comment-delete-modal-";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CardComments({
  symbol,
  collapseId,
  compact = false,
}: CardCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    commentId: string;
    commentText: string;
  } | null>(null);
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteModalId = `${DELETE_MODAL_ID_PREFIX}${symbol}`;

  const load = () => {
    if (!symbol) return;
    fetch(`/api/user-stock-data?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((data) => setComments(data.comments ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [symbol]);

  const addComment = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const newComment: Comment = {
      id: generateId(),
      text,
      createdAt: new Date().toISOString(),
    };
    const nextComments = [...comments, newComment];
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, comments: nextComments }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setComments(data.comments);
        setNewText("");
      })
      .finally(() => setSubmitting(false));
  };

  const confirmDelete = (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (comment) setDeleteModal({ commentId, commentText: comment.text });
  };

  const doDelete = () => {
    if (!deleteModal) return;
    const nextComments = comments.filter((c) => c.id !== deleteModal.commentId);
    setSubmitting(true);
    fetch("/api/user-stock-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, comments: nextComments }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setComments(data.comments);
        setDeleteModal(null);
      })
      .finally(() => setSubmitting(false));
  };

  useEffect(() => {
    if (!deleteModal) return;
    const t = setTimeout(() => {
      openTriggerRef.current?.click();
    }, 50);
    return () => clearTimeout(t);
  }, [deleteModal]);

  useEffect(() => {
    if (!deleteModal) return;
    const el = document.getElementById(deleteModalId);
    if (!el) return;
    const onHidden = () => {
      restoreBodyScroll();
      setDeleteModal(null);
    };
    el.addEventListener("hidden.bs.modal", onHidden);
    return () => el.removeEventListener("hidden.bs.modal", onHidden);
  }, [deleteModal, deleteModalId]);

  /** Restore body scroll when modals/collapse leave it stuck */
  const restoreBodyScroll = () => {
    if (typeof document === "undefined") return;
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    document.body.removeAttribute("inert");
    document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
  };

  useEffect(() => {
    const el = document.getElementById(collapseId);
    if (!el) return;
    const onCollapseHidden = () => restoreBodyScroll();
    el.addEventListener("hidden.bs.collapse", onCollapseHidden);
    return () => el.removeEventListener("hidden.bs.collapse", onCollapseHidden);
  }, [collapseId]);

  const handleModalHidden = () => setDeleteModal(null);

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const commentsNewestFirst = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const startExpanded = !loading && comments.length > 0;

  return (
    <>
      <div className="stock-card__disclosure">
        <button
          type="button"
          className="stock-card__disclosure-trigger"
          data-bs-toggle="collapse"
          data-bs-target={`#${collapseId}`}
          aria-expanded={startExpanded}
          aria-controls={collapseId}
          id={`${collapseId}-label`}
        >
          <i className="bi bi-chat-dots stock-card__disclosure-icon" aria-hidden />
          <span>Comments</span>
          {comments.length > 0 && (
            <span className="stock-card__disclosure-count">{comments.length}</span>
          )}
          <i className="bi bi-chevron-down stock-card__disclosure-chevron" aria-hidden />
        </button>
        <div
          id={collapseId}
          className={`collapse stock-card__disclosure-panel ${startExpanded ? "show" : ""}`}
          aria-labelledby={`${collapseId}-label`}
        >
          <div className="stock-card__disclosure-body">
            {loading ? (
              <p className="stock-card__muted">Loading…</p>
            ) : (
              <>
                <form onSubmit={addComment} className="stock-card__comment-form">
                  <input
                    type="text"
                    className="stock-card__comment-input"
                    placeholder="Add a comment…"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    disabled={submitting}
                    aria-label="New comment"
                  />
                  <button
                    type="submit"
                    className="stock-card__action stock-card__action--primary stock-card__action--compact"
                    disabled={submitting || !newText.trim()}
                  >
                    Add
                  </button>
                </form>
                <ul className="stock-card__comment-list">
                  {commentsNewestFirst.map((c) => (
                    <li key={c.id} className="stock-card__comment-item">
                      <div className="stock-card__comment-content">
                        <p className="stock-card__comment-text">{c.text}</p>
                        <span className="stock-card__comment-date">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="stock-card__comment-delete"
                        aria-label="Delete comment"
                        onClick={() => confirmDelete(c.id)}
                        disabled={submitting}
                      >
                        <i className="bi bi-trash" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {deleteModal &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              ref={openTriggerRef}
              type="button"
              className="d-none"
              data-bs-toggle="modal"
              data-bs-target={`#${deleteModalId}`}
              aria-hidden
            />
            <div
              className="modal fade"
              id={deleteModalId}
              tabIndex={-1}
              aria-labelledby={`${deleteModalId}-label`}
              aria-hidden="true"
              data-bs-backdrop="static"
            >
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content score-breakdown-modal">
                  <div className="modal-header">
                    <h5 className="modal-title" id={`${deleteModalId}-label`}>
                      Delete comment?
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      data-bs-dismiss="modal"
                      aria-label="Close"
                      onClick={handleModalHidden}
                    />
                  </div>
                  <div className="modal-body">
                    <p className="mb-0">Are you sure? This cannot be undone.</p>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn glass-btn glass-btn-secondary"
                      data-bs-dismiss="modal"
                      onClick={handleModalHidden}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn glass-btn glass-btn-primary"
                      onClick={() => {
                        doDelete();
                        const el = document.getElementById(deleteModalId);
                        if (el) {
                          el.classList.remove("show");
                          el.setAttribute("aria-hidden", "true");
                          el.style.display = "none";
                          const backdrop = document.querySelector(".modal-backdrop");
                          if (backdrop) backdrop.remove();
                          restoreBodyScroll();
                        }
                      }}
                      disabled={submitting}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

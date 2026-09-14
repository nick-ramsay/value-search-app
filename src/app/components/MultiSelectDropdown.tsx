"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MultiSelectDropdownProps = {
  id: string;
  label: string;
  placeholderAll: string;
  options: string[];
  selected: string[];
  /**
   * Called once, with the final set of checked values, when the dropdown
   * closes — not on every individual checkbox click. Checking/unchecking
   * options only updates a local draft while the menu is open, so picking
   * several values in a row doesn't trigger a navigation (and the loading
   * state that comes with it) per click.
   */
  onCommit: (values: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
};

/**
 * Checkbox-list dropdown for picking zero or more values from a fixed
 * option set, with a free-text filter and apply-on-close semantics.
 * Styled to match the single-select .glass-select it replaces.
 *
 * Opening/closing is still driven by Bootstrap's dropdown JS
 * (data-bs-toggle, auto-close="outside" so clicking a checkbox doesn't
 * close the menu), but this component also listens for Bootstrap's
 * show.bs.dropdown/hide.bs.dropdown events on the trigger to manage its
 * own draft selection — reset from `selected` on open, committed back to
 * the parent via onCommit on close (only if it actually changed).
 */
export default function MultiSelectDropdown({
  id,
  label,
  placeholderAll,
  options,
  selected,
  onCommit,
  disabled = false,
  emptyMessage = "No options available",
  searchPlaceholder = "Search…",
}: MultiSelectDropdownProps) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Refs so the show/hide listeners (attached once) always read the latest
  // values without needing to re-attach on every render. Refs may only be
  // read/written in effects or handlers, never during render itself, so
  // each is kept in sync via its own effect below.
  const draftRef = useRef(draft);
  const committedRef = useRef(selected);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { committedRef.current = selected; }, [selected]);

  // If the committed selection changes from outside (a chip removed
  // elsewhere, browser back/forward, another dropdown's cascade effect),
  // resync draft to match — the menu is always closed whenever that
  // happens, so there's no in-progress edit to preserve.
  //
  // Adjusted during render rather than in a useEffect (React's documented
  // pattern for "derive state from a prop, but allow local edits until it
  // changes again" — see react.dev/reference/react/useState, "Storing
  // information from previous renders"): `selected` is a brand-new array
  // reference from the parent on every render regardless of content, so
  // the previous value is tracked as a JSON-keyed string in state (not a
  // ref — refs can't be touched during render), only calling setDraft
  // when the content actually changed.
  const selectedKey = JSON.stringify(selected);
  const [lastSelectedKey, setLastSelectedKey] = useState(selectedKey);
  if (selectedKey !== lastSelectedKey) {
    setLastSelectedKey(selectedKey);
    setDraft(selected);
  }

  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;

    const handleShow = () => {
      setDraft(committedRef.current);
      setQuery("");
      // Bootstrap moves focus to the toggle on show; grab it back for the
      // search box on the next tick so typing works immediately.
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    };
    const handleHide = () => {
      const next = draftRef.current;
      const prev = committedRef.current;
      const changed = next.length !== prev.length || next.some((v) => !prev.includes(v));
      if (changed) {
        committedRef.current = next;
        onCommitRef.current(next);
      }
    };

    el.addEventListener("show.bs.dropdown", handleShow);
    el.addEventListener("hide.bs.dropdown", handleHide);
    return () => {
      el.removeEventListener("show.bs.dropdown", handleShow);
      el.removeEventListener("hide.bs.dropdown", handleHide);
    };
  }, []);

  const toggleDraftValue = (value: string) => {
    setDraft((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  // Trigger label reflects the committed selection (what's actually
  // applied), not the in-progress draft.
  const triggerLabel =
    selected.length === 0
      ? placeholderAll
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div className="dropdown multi-select-dropdown">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="form-select glass-select dropdown-toggle multi-select-dropdown__trigger"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        aria-expanded="false"
        aria-label={label}
        disabled={disabled}
      >
        <span className="multi-select-dropdown__trigger-label">{triggerLabel}</span>
      </button>
      <div
        className="dropdown-menu multi-select-dropdown__menu"
        aria-labelledby={id}
      >
        {options.length > 0 && (
          <div className="multi-select-dropdown__search">
            <i className="bi bi-search multi-select-dropdown__search-icon" aria-hidden />
            <input
              ref={searchInputRef}
              type="text"
              className="multi-select-dropdown__search-input"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Filter ${label} options`}
            />
          </div>
        )}
        {options.length === 0 ? (
          <p className="multi-select-dropdown__empty px-3 py-2 mb-0 text-muted small">
            {emptyMessage}
          </p>
        ) : filteredOptions.length === 0 ? (
          <p className="multi-select-dropdown__empty px-3 py-2 mb-0 text-muted small">
            No matches for &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="multi-select-dropdown__options">
            {filteredOptions.map((option) => {
              const optionId = `${id}-option-${option}`;
              const checked = draft.includes(option);
              return (
                <label
                  key={option}
                  htmlFor={optionId}
                  className="multi-select-dropdown__option dropdown-item"
                >
                  <input
                    type="checkbox"
                    id={optionId}
                    className="multi-select-dropdown__checkbox"
                    checked={checked}
                    onChange={() => toggleDraftValue(option)}
                    disabled={disabled}
                  />
                  <span className="multi-select-dropdown__option-text">{option}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

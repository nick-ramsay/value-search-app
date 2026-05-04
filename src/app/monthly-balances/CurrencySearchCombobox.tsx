"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  formatCurrencyOptionLabel,
  getCurrencyOptionsSorted,
  type CurrencyOption,
} from "@/lib/iso4217-currencies";

type CurrencySearchComboboxProps = {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
};

function filterOptions(options: CurrencyOption[], query: string): CurrencyOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.code.toLowerCase().includes(q) ||
      o.label.toLowerCase().includes(q),
  );
}

export default function CurrencySearchCombobox({
  id: idProp,
  value,
  onChange,
  disabled,
}: CurrencySearchComboboxProps) {
  const reactId = useId();
  const inputId = idProp ?? `mb-currency-search-${reactId}`;
  const listId = `${inputId}-listbox`;

  const allOptions = useMemo(() => getCurrencyOptionsSorted(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(
    () => (value ? formatCurrencyOptionLabel(value) : ""),
    [value],
  );

  const filtered = useMemo(
    () => filterOptions(allOptions, query),
    [allOptions, query],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="position-relative">
      <label htmlFor={inputId} className="form-label fw-semibold">
        Currency
      </label>
      <p className="small text-secondary mb-1">
        Selected:{" "}
        <span className="fw-semibold text-body">{selectedLabel || "—"}</span>
      </p>
      <input
        id={inputId}
        type="search"
        className="form-control search-input-glass"
        placeholder="Search by currency name or code…"
        autoComplete="off"
        disabled={disabled}
        value={open ? query : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {open && !disabled ? (
        <ul
          id={listId}
          className="list-group position-absolute top-100 start-0 end-0 mt-1 monthly-balances-currency-list suggestions-glass shadow"
          role="listbox"
          aria-label="Currencies"
        >
          {filtered.length === 0 ? (
            <li className="list-group-item suggestion-item-glass py-2 small text-secondary">
              No matches. Try another name or ISO code (for example EUR or JPY).
            </li>
          ) : (
            filtered.slice(0, 200).map((opt) => (
              <li key={opt.code} className="list-group-item p-0 border-0">
                <button
                  type="button"
                  role="option"
                  className="w-100 text-start suggestion-item-glass border-0 py-2 px-3"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.code);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
          {filtered.length > 200 ? (
            <li className="list-group-item suggestion-item-glass py-2 small text-secondary">
              Showing first 200 matches. Refine your search to see more.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

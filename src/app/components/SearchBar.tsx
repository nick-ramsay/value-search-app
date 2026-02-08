"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Suggestion = {
  symbol?: string;
  name?: string;
};

type SearchBarProps = {
  initialQuery?: string;
};

function formatSuggestionLabel(suggestion: Suggestion) {
  if (suggestion.name && suggestion.symbol) {
    return `${suggestion.name} (${suggestion.symbol})`;
  }
  return suggestion.symbol ?? suggestion.name ?? "";
}

function pickSearchValue(suggestion: Suggestion) {
  return suggestion.symbol ?? suggestion.name ?? "";
}

export default function SearchBar({ initialQuery = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectedMatch, setIsSelectedMatch] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const filteredSuggestions = useMemo(
    () => suggestions.filter((item) => formatSuggestionLabel(item).length > 0),
    [suggestions],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const shouldClear = window.sessionStorage.getItem("clearSearchInput") === "1";
      if (shouldClear) {
        setQuery("");
        window.sessionStorage.removeItem("clearSearchInput");
      }
    }
  }, []);

  useEffect(() => {
    if (!hasQuery) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/search-suggestions?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Suggestion request failed.");
        }

        const payload = (await response.json()) as { suggestions?: Suggestion[] };
        const nextSuggestions = payload.suggestions ?? [];
        setSuggestions(nextSuggestions);
        setIsOpen(nextSuggestions.length > 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setIsOpen(false);
        }
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [hasQuery, trimmedQuery]);

  const handleSelect = (suggestion: Suggestion) => {
    const value = pickSearchValue(suggestion);
    if (!value) {
      return;
    }

    setQuery(value);
    setIsOpen(false);
    setIsSelectedMatch(true);
    if (inputRef.current) {
      inputRef.current.value = value;
    }
    if (selectedRef.current) {
      selectedRef.current.value = "1";
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("clearSearchInput", "1");
    }
    formRef.current?.requestSubmit();
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    setIsSelectedMatch(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (selectedRef.current) {
      selectedRef.current.value = "";
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("clearSearchInput", "1");
      window.location.href = "/";
    }
  };

  return (
    <form
      ref={formRef}
      className="d-flex gap-2 position-relative"
      role="search"
      action="/"
      method="GET"
      autoComplete="off"
    >
      <input
        ref={inputRef}
        className="form-control"
        type="search"
        name="q"
        placeholder="Search symbol or name"
        aria-label="Search symbol or name"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onInput={() => {
          setIsSelectedMatch(false);
          if (selectedRef.current) {
            selectedRef.current.value = "";
          }
        }}
        onFocus={() => {
          if (filteredSuggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 100);
        }}
      />
      <button className="btn btn-outline-secondary" type="button" onClick={handleClear}>
        Clear
      </button>
      <input ref={selectedRef} type="hidden" name="selected" value={isSelectedMatch ? "1" : ""} />
      {isOpen ? (
        <div
          className="list-group position-absolute top-100 start-0 mt-1 shadow-sm w-100"
          role="listbox"
        >
          {filteredSuggestions.map((suggestion) => {
            const label = formatSuggestionLabel(suggestion);
            const value = pickSearchValue(suggestion);
            const key = `${value}-${label}`;

            return (
              <button
                key={key}
                type="button"
                className="list-group-item list-group-item-action"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {isLoading ? (
        <span className="visually-hidden" role="status" aria-live="polite">
          Loading suggestions
        </span>
      ) : null}
    </form>
  );
}

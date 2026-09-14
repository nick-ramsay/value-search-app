"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptionalHomeNavigation } from "./HomeNavigationContext";

type Suggestion = {
  symbol?: string;
  name?: string;
};

type SearchBarProps = {
  initialQuery?: string;
  /** Form submit URL (default "/"). Use "/portfolio" so search stays on portfolio. */
  formAction?: string;
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

export default function SearchBar({
  initialQuery = "",
  formAction = "/",
}: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const homeNav = useOptionalHomeNavigation();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectedMatch, setIsSelectedMatch] = useState(false);
  // -1 = nothing highlighted (arrow-key/hover position within the open
  // suggestions dropdown; Enter selects this item when one is highlighted).
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const filteredSuggestions = useMemo(
    () => suggestions.filter((item) => formatSuggestionLabel(item).length > 0),
    [suggestions],
  );

  // Keep the highlight in range (and cleared once the dropdown has nothing
  // to highlight) whenever the suggestion list itself changes.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredSuggestions]);

  useEffect(() => {
    if (!hasQuery || isSelectedMatch) {
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
  }, [hasQuery, trimmedQuery, isSelectedMatch]);

  /**
   * Homepage (and other non-portfolio forms): add the selected symbol to the
   * set of already-selected symbols in the URL (rather than replacing it),
   * so multiple individual stocks can be selected at once. Every other
   * current param (filters, page) is preserved as-is.
   */
  const addSymbolAndNavigate = (value: string) => {
    const upper = value.trim().toUpperCase();
    if (!upper) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const existing = params.getAll("symbol").map((s) => s.toUpperCase());
    if (!existing.includes(upper)) {
      params.append("symbol", upper);
    }
    const qs = params.toString();
    const href = qs ? `${formAction}?${qs}` : formAction;
    // Wrapped in the shared transition (when available — the home page's
    // HomeNavigationProvider) so picking a stock shows the same in-place
    // loading overlay as pagination/filters/chip-removal, rather than either
    // no loading indication or a jarring full-page Suspense fallback flash.
    if (homeNav) {
      homeNav.startTransition(() => {
        router.push(href);
      });
    } else {
      router.push(href);
    }

    setQuery("");
    setIsSelectedMatch(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleSelect = (suggestion: Suggestion) => {
    const value = pickSearchValue(suggestion);
    if (!value) {
      return;
    }

    setSuggestions([]);
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }

    if (formAction === "/portfolio") {
      // Keep existing (working) portfolio behavior
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("portfolioSymbolSelected", {
            detail: { symbol: value },
          }),
        );
        setQuery("");
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        setIsSelectedMatch(false);
      }
      return;
    }

    addSymbolAndNavigate(value);
  };

  /**
   * Resolves what Enter (or any other submit trigger) should do, in order:
   * the arrow-key/hover-highlighted suggestion, else the top suggestion in
   * an open dropdown (so typing an exact match and hitting Enter without
   * arrowing down still picks the right thing instead of submitting the
   * raw text as a literal symbol — which silently fails to find anything
   * whenever the query was a company name rather than its ticker), else
   * fall back to the raw typed text (e.g. the query matched nothing at all).
   */
  const submitCurrentSelection = () => {
    const value = trimmedQuery;
    if (!value) {
      return;
    }

    const resolved =
      highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length
        ? filteredSuggestions[highlightedIndex]
        : filteredSuggestions.length > 0
          ? filteredSuggestions[0]
          : null;

    if (resolved) {
      handleSelect(resolved);
      return;
    }

    // Common UX for both homepage and portfolio:
    // close dropdown and dismiss keyboard.
    setSuggestions([]);
    setIsOpen(false);
    setIsSelectedMatch(true);
    if (inputRef.current) {
      inputRef.current.blur();
    }

    if (formAction === "/portfolio") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("portfolioSymbolSelected", {
            detail: { symbol: value },
          }),
        );
        // Clear the input after hitting Enter in the portfolio view
        setQuery("");
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        setIsSelectedMatch(false);
      }
      return;
    }

    addSymbolAndNavigate(value);
  };

  return (
    <form
      className="d-flex gap-2 position-relative w-100"
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        submitCurrentSelection();
      }}
    >
      <input
        ref={inputRef}
        className="form-control flex-grow-1 search-input-glass"
        type="search"
        name="q"
        placeholder="Search symbol or name"
        aria-label="Search symbol or name"
        value={query}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="search-suggestions-listbox"
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `search-suggestion-${highlightedIndex}` : undefined
        }
        onChange={(event) => setQuery(event.target.value)}
        onInput={() => {
          setIsSelectedMatch(false);
        }}
        onFocus={() => {
          if (filteredSuggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 100);
        }}
        onKeyDown={(event) => {
          if (!isOpen || filteredSuggestions.length === 0) {
            if (event.key === "Escape") {
              setIsOpen(false);
            }
            return;
          }

          switch (event.key) {
            case "ArrowDown":
              event.preventDefault();
              setHighlightedIndex((current) => (current + 1) % filteredSuggestions.length);
              break;
            case "ArrowUp":
              event.preventDefault();
              setHighlightedIndex((current) =>
                current <= 0 ? filteredSuggestions.length - 1 : current - 1,
              );
              break;
            case "Escape":
              setIsOpen(false);
              setHighlightedIndex(-1);
              break;
            // Enter is handled by the form's onSubmit (submitCurrentSelection
            // already reads highlightedIndex), so no case needed here — just
            // don't fall through to anything else.
            default:
              break;
          }
        }}
      />
      {isOpen || isLoading ? (
        <div
          id="search-suggestions-listbox"
          className="position-absolute top-100 start-0 mt-2 w-100 suggestions-glass list-group list-group-flush"
          role="listbox"
        >
          {isLoading ? (
            <div className="list-group-item suggestion-item-glass d-flex align-items-center gap-2 py-3" role="status" aria-live="polite">
              <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <span>Loading suggestions</span>
            </div>
          ) : null}
          {filteredSuggestions.map((suggestion, index) => {
            const label = formatSuggestionLabel(suggestion);
            const value = pickSearchValue(suggestion);
            const key = `${value}-${label}`;

            return (
              <button
                key={key}
                id={`search-suggestion-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={`list-group-item list-group-item-action suggestion-item-glass py-3${
                  index === highlightedIndex ? " suggestion-item-glass--active" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(suggestion)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </form>
  );
}

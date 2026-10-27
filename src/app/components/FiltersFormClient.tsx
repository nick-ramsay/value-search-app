"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";
import MultiSelectDropdown from "./MultiSelectDropdown";
import InfoTooltip from "./InfoTooltip";
import { availableIndustriesForSectors, pruneIndustriesForSectors } from "@/lib/sectorIndustryFilter";
import { AI_RATING_OPTIONS } from "@/lib/ai-rating-display";

type Props = {
  industries: string[];
  sectors: string[];
  countries: string[];
  sectorIndustryMap: Record<string, string[]>;
  selectedIndustries: string[];
  selectedSectors: string[];
  selectedCountries: string[];
  selectedAiRatings: string[];
  excludeEtfsEnabled: boolean;
  bottomingEnabled: boolean;
  toppingChopEnabled: boolean;
  momentumEnabled: boolean;
  minPrice?: number;
  minScore?: number;
  symbols: string[];
};

export default function FiltersFormClient({
  industries,
  sectors,
  countries,
  sectorIndustryMap,
  selectedIndustries,
  selectedSectors,
  selectedCountries,
  selectedAiRatings,
  excludeEtfsEnabled,
  bottomingEnabled,
  toppingChopEnabled,
  momentumEnabled,
  minPrice,
  minScore,
  symbols,
}: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useHomeNavigation();

  const buildHref = (overrides: {
    industries?: string[];
    sectors?: string[];
    countries?: string[];
    aiRatings?: string[];
    excludeEtfs?: boolean;
    bottoming?: boolean;
    toppingChop?: boolean;
    momentum?: boolean;
    minPrice?: number;
    minScore?: number;
  }) => {
    const p = new URLSearchParams();
    const inds = overrides.industries ?? selectedIndustries;
    const secs = overrides.sectors ?? selectedSectors;
    const cous = overrides.countries ?? selectedCountries;
    const rats = overrides.aiRatings ?? selectedAiRatings;
    const exc = overrides.excludeEtfs ?? excludeEtfsEnabled;
    const bot = overrides.bottoming ?? bottomingEnabled;
    const top = overrides.toppingChop ?? toppingChopEnabled;
    const mom = overrides.momentum ?? momentumEnabled;
    // Presence check (not ??) so an explicit {minPrice: undefined} clears it
    // — see the identical pattern (and why) in page.tsx's buildHref.
    const mp = "minPrice" in overrides ? overrides.minPrice : minPrice;
    const ms = "minScore" in overrides ? overrides.minScore : minScore;
    for (const symbol of symbols) p.append("symbol", symbol);
    for (const industry of inds) p.append("industry", industry);
    for (const sector of secs) p.append("sector", sector);
    for (const country of cous) p.append("country", country);
    for (const rating of rats) p.append("aiRating", rating);
    if (!exc) p.set("excludeEtfs", "0");
    if (bot) p.set("bottoming", "1");
    if (top) p.set("toppingChop", "1");
    if (mom) p.set("momentum", "1");
    if (mp !== undefined) p.set("minPrice", mp.toString());
    if (ms !== undefined) p.set("minScore", ms.toString());
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const navigate = (href: string) => {
    startTransition(() => router.push(href));
  };

  // Industries are a subcategory of sector — once one or more sectors are
  // selected, only industries belonging to at least one of them are
  // pickable. Selecting/deselecting a sector re-validates the current
  // industry selection against the new sector set in the same navigation
  // (a sector being removed can just as easily invalidate a previously
  // valid industry as one being added can).
  const availableIndustries = availableIndustriesForSectors(industries, selectedSectors, sectorIndustryMap);

  // Each of these fires once when the dropdown closes (see
  // MultiSelectDropdown's onCommit), not per checkbox click — so checking
  // several options in a row only triggers one navigation.
  const handleCommitSectors = (nextSectors: string[]) => {
    const nextIndustries = pruneIndustriesForSectors(selectedIndustries, nextSectors, sectorIndustryMap);
    navigate(buildHref({ sectors: nextSectors, industries: nextIndustries }));
  };

  const handleCommitIndustries = (nextIndustries: string[]) => {
    navigate(buildHref({ industries: nextIndustries }));
  };

  const handleCommitCountries = (nextCountries: string[]) => {
    navigate(buildHref({ countries: nextCountries }));
  };

  const handleCommitAiRatings = (nextRatings: string[]) => {
    navigate(buildHref({ aiRatings: nextRatings }));
  };

  // Min price: local draft so typing doesn't navigate per keystroke — commits
  // (navigates) only on blur or Enter, same "don't apply until you're done"
  // principle as the dropdowns' commit-on-close. Resynced from the minPrice
  // prop when it changes externally (a chip removal, browser back/forward)
  // via the same render-time "previous prop" pattern MultiSelectDropdown
  // uses, for the same reason: refs can't be touched during render.
  const [minPriceDraft, setMinPriceDraft] = useState(minPrice !== undefined ? String(minPrice) : "");
  const [lastMinPriceProp, setLastMinPriceProp] = useState(minPrice);
  if (minPrice !== lastMinPriceProp) {
    setLastMinPriceProp(minPrice);
    setMinPriceDraft(minPrice !== undefined ? String(minPrice) : "");
  }

  const commitMinPrice = () => {
    const trimmed = minPriceDraft.trim();
    const parsed = trimmed === "" ? NaN : Number(trimmed);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    if (next !== minPrice) {
      navigate(buildHref({ minPrice: next }));
    }
    // Normalize what's displayed to what was actually committed (e.g. clears
    // a non-numeric or non-positive typo back to blank rather than leaving
    // invalid-looking text in the box).
    setMinPriceDraft(next !== undefined ? String(next) : "");
  };

  // Min score: identical local-draft/commit-on-blur-or-Enter pattern as Min
  // Price above, clamped to 0-100 (see page.tsx's getMinScore) instead of
  // "any positive number".
  const [minScoreDraft, setMinScoreDraft] = useState(minScore !== undefined ? String(minScore) : "");
  const [lastMinScoreProp, setLastMinScoreProp] = useState(minScore);
  if (minScore !== lastMinScoreProp) {
    setLastMinScoreProp(minScore);
    setMinScoreDraft(minScore !== undefined ? String(minScore) : "");
  }

  const commitMinScore = () => {
    const trimmed = minScoreDraft.trim();
    const parsed = trimmed === "" ? NaN : Number(trimmed);
    const next = Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : undefined;
    if (next !== minScore) {
      navigate(buildHref({ minScore: next }));
    }
    setMinScoreDraft(next !== undefined ? String(next) : "");
  };

  const hasActiveFilters =
    selectedIndustries.length > 0 ||
    selectedSectors.length > 0 ||
    selectedCountries.length > 0 ||
    selectedAiRatings.length > 0 ||
    !excludeEtfsEnabled ||
    bottomingEnabled ||
    toppingChopEnabled ||
    momentumEnabled ||
    minPrice !== undefined ||
    minScore !== undefined;

  return (
    <div className={`row g-3${isPending ? " filters-form--pending" : ""}`}>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="sector" className="form-label filter-form-label mb-0">
            Sector
          </label>
        </div>
        <MultiSelectDropdown
          id="sector"
          label="Sector"
          placeholderAll="All sectors"
          options={sectors}
          selected={selectedSectors}
          onCommit={handleCommitSectors}
          disabled={isPending}
          searchPlaceholder="Search sectors…"
        />
      </div>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="industry" className="form-label filter-form-label mb-0">
            Industry
          </label>
          <InfoTooltip text="Only industries belonging to the selected sector(s) are available to pick — choose a sector first to narrow this list." />
        </div>
        <MultiSelectDropdown
          id="industry"
          label="Industry"
          placeholderAll="All industries"
          options={availableIndustries}
          selected={selectedIndustries}
          onCommit={handleCommitIndustries}
          disabled={isPending}
          emptyMessage="No industries in the selected sector(s)"
          searchPlaceholder="Search industries…"
        />
      </div>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="country" className="form-label filter-form-label mb-0">
            Country
          </label>
        </div>
        <MultiSelectDropdown
          id="country"
          label="Country"
          placeholderAll="All countries"
          options={countries}
          selected={selectedCountries}
          onCommit={handleCommitCountries}
          disabled={isPending}
          searchPlaceholder="Search countries…"
        />
      </div>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="aiRating" className="form-label filter-form-label mb-0">
            AI Rating
          </label>
        </div>
        <MultiSelectDropdown
          id="aiRating"
          label="AI Rating"
          placeholderAll="All ratings"
          options={AI_RATING_OPTIONS}
          selected={selectedAiRatings}
          onCommit={handleCommitAiRatings}
          disabled={isPending}
          searchPlaceholder="Search ratings…"
        />
      </div>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="minPrice" className="form-label filter-form-label mb-0">
            Min Price
          </label>
        </div>
        <div className="min-price-input-wrap">
          <span className="min-price-input__prefix" aria-hidden>$</span>
          <input
            type="number"
            id="minPrice"
            className="form-control glass-select min-price-input"
            placeholder="e.g. 5"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={minPriceDraft}
            onChange={(e) => setMinPriceDraft(e.target.value)}
            onBlur={commitMinPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitMinPrice();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={isPending}
            aria-label="Minimum price"
          />
        </div>
      </div>
      <div className="col-md-3">
        <div className="filter-form-label-row">
          <label htmlFor="minScore" className="form-label filter-form-label mb-0">
            Min Score
          </label>
          <InfoTooltip text="Filters by the stock's overall value score — the same score shown on each stock card, out of 100." />
        </div>
        <div className="min-score-input-wrap">
          <input
            type="number"
            id="minScore"
            className="form-control glass-select min-score-input"
            placeholder="e.g. 70"
            min="0"
            max="100"
            step="1"
            inputMode="decimal"
            value={minScoreDraft}
            onChange={(e) => setMinScoreDraft(e.target.value)}
            onBlur={commitMinScore}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitMinScore();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={isPending}
            aria-label="Minimum score"
          />
          <span className="min-score-input__suffix" aria-hidden>%</span>
        </div>
      </div>
      <div className="col-12">
        <div className="filter-toggles-row">
          <div className="filter-toggle">
            <input
              type="checkbox"
              id="excludeEtfs"
              className="filter-toggle-input"
              checked={excludeEtfsEnabled}
              onChange={(e) => navigate(buildHref({ excludeEtfs: e.target.checked }))}
              disabled={isPending}
            />
            <label htmlFor="excludeEtfs" className="filter-toggle-label">
              <span className="filter-toggle-slider" aria-hidden />
              <span className="filter-toggle-label__text">Exclude ETFs</span>
            </label>
          </div>
          <div className="filter-toggle">
            <input
              type="checkbox"
              id="bottoming"
              className="filter-toggle-input"
              checked={bottomingEnabled}
              onChange={(e) => navigate(buildHref({ bottoming: e.target.checked }))}
              disabled={isPending}
            />
            <label htmlFor="bottoming" className="filter-toggle-label">
              <span className="filter-toggle-slider" aria-hidden />
              <span className="filter-toggle-label__text">Recently Bottomed</span>
            </label>
          </div>
          <div className="filter-toggle">
            <input
              type="checkbox"
              id="toppingChop"
              className="filter-toggle-input"
              checked={toppingChopEnabled}
              onChange={(e) => navigate(buildHref({ toppingChop: e.target.checked }))}
              disabled={isPending}
            />
            <label htmlFor="toppingChop" className="filter-toggle-label">
              <span className="filter-toggle-slider" aria-hidden />
              <span className="filter-toggle-label__text">Topping</span>
            </label>
          </div>
          <div className="filter-toggle">
            <input
              type="checkbox"
              id="momentum"
              className="filter-toggle-input"
              checked={momentumEnabled}
              onChange={(e) => navigate(buildHref({ momentum: e.target.checked }))}
              disabled={isPending}
            />
            <label htmlFor="momentum" className="filter-toggle-label">
              <span className="filter-toggle-slider" aria-hidden />
              <span className="filter-toggle-label__text">Momentum</span>
            </label>
          </div>
          {hasActiveFilters && (
            <div className="filter-toggles-actions">
              <button
                type="button"
                className="btn btn-sm filter-clear-button"
                onClick={() => navigate("/")}
                disabled={isPending}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

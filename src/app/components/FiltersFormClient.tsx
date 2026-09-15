"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";
import MultiSelectDropdown from "./MultiSelectDropdown";
import InfoTooltip from "./InfoTooltip";
import { availableIndustriesForSectors, pruneIndustriesForSectors } from "@/lib/sectorIndustryFilter";

type Props = {
  industries: string[];
  sectors: string[];
  countries: string[];
  sectorIndustryMap: Record<string, string[]>;
  selectedIndustries: string[];
  selectedSectors: string[];
  selectedCountries: string[];
  excludeEtfsEnabled: boolean;
  maSupportEnabled: boolean;
  minPrice?: number;
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
  excludeEtfsEnabled,
  maSupportEnabled,
  minPrice,
  symbols,
}: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useHomeNavigation();

  const buildHref = (overrides: {
    industries?: string[];
    sectors?: string[];
    countries?: string[];
    excludeEtfs?: boolean;
    maSupport?: boolean;
    minPrice?: number;
  }) => {
    const p = new URLSearchParams();
    const inds = overrides.industries ?? selectedIndustries;
    const secs = overrides.sectors ?? selectedSectors;
    const cous = overrides.countries ?? selectedCountries;
    const exc = overrides.excludeEtfs ?? excludeEtfsEnabled;
    const mas = overrides.maSupport ?? maSupportEnabled;
    // Presence check (not ??) so an explicit {minPrice: undefined} clears it
    // — see the identical pattern (and why) in page.tsx's buildHref.
    const mp = "minPrice" in overrides ? overrides.minPrice : minPrice;
    for (const symbol of symbols) p.append("symbol", symbol);
    for (const industry of inds) p.append("industry", industry);
    for (const sector of secs) p.append("sector", sector);
    for (const country of cous) p.append("country", country);
    if (!exc) p.set("excludeEtfs", "0");
    if (mas) p.set("maSupport", "1");
    if (mp !== undefined) p.set("minPrice", mp.toString());
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

  const hasActiveFilters =
    selectedIndustries.length > 0 ||
    selectedSectors.length > 0 ||
    selectedCountries.length > 0 ||
    !excludeEtfsEnabled ||
    maSupportEnabled ||
    minPrice !== undefined;

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
              id="maSupport"
              className="filter-toggle-input"
              checked={maSupportEnabled}
              onChange={(e) => navigate(buildHref({ maSupport: e.target.checked }))}
              disabled={isPending}
            />
            <label htmlFor="maSupport" className="filter-toggle-label">
              <span className="filter-toggle-slider" aria-hidden />
              <span className="filter-toggle-label__text">Moving average support</span>
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

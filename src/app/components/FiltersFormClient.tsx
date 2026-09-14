"use client";

import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";
import MultiSelectDropdown from "./MultiSelectDropdown";
import InfoTooltip from "./InfoTooltip";
import { availableIndustriesForSectors, pruneIndustriesForSectors, toggleValue } from "@/lib/sectorIndustryFilter";

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
  }) => {
    const p = new URLSearchParams();
    const inds = overrides.industries ?? selectedIndustries;
    const secs = overrides.sectors ?? selectedSectors;
    const cous = overrides.countries ?? selectedCountries;
    const exc = overrides.excludeEtfs ?? excludeEtfsEnabled;
    const mas = overrides.maSupport ?? maSupportEnabled;
    for (const symbol of symbols) p.append("symbol", symbol);
    for (const industry of inds) p.append("industry", industry);
    for (const sector of secs) p.append("sector", sector);
    for (const country of cous) p.append("country", country);
    if (!exc) p.set("excludeEtfs", "0");
    if (mas) p.set("maSupport", "1");
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

  const handleToggleSector = (sector: string) => {
    const nextSectors = toggleValue(selectedSectors, sector);
    const nextIndustries = pruneIndustriesForSectors(selectedIndustries, nextSectors, sectorIndustryMap);
    navigate(buildHref({ sectors: nextSectors, industries: nextIndustries }));
  };

  const handleToggleIndustry = (industry: string) => {
    navigate(buildHref({ industries: toggleValue(selectedIndustries, industry) }));
  };

  const handleToggleCountry = (country: string) => {
    navigate(buildHref({ countries: toggleValue(selectedCountries, country) }));
  };

  const hasActiveFilters =
    selectedIndustries.length > 0 ||
    selectedSectors.length > 0 ||
    selectedCountries.length > 0 ||
    !excludeEtfsEnabled ||
    maSupportEnabled;

  return (
    <div className={`row g-3${isPending ? " filters-form--pending" : ""}`}>
      <div className="col-md-4">
        <label htmlFor="sector" className="form-label filter-form-label">
          Sector
        </label>
        <MultiSelectDropdown
          id="sector"
          label="Sector"
          placeholderAll="All sectors"
          options={sectors}
          selected={selectedSectors}
          onToggle={handleToggleSector}
          disabled={isPending}
        />
      </div>
      <div className="col-md-4">
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
          onToggle={handleToggleIndustry}
          disabled={isPending}
          emptyMessage="No industries in the selected sector(s)"
        />
      </div>
      <div className="col-md-4">
        <label htmlFor="country" className="form-label filter-form-label">
          Country
        </label>
        <MultiSelectDropdown
          id="country"
          label="Country"
          placeholderAll="All countries"
          options={countries}
          selected={selectedCountries}
          onToggle={handleToggleCountry}
          disabled={isPending}
        />
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

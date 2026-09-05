"use client";

import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";

type Props = {
  industries: string[];
  sectors: string[];
  countries: string[];
  selectedIndustry: string;
  selectedSector: string;
  selectedCountry: string;
  excludeEtfsEnabled: boolean;
  maSupportEnabled: boolean;
  symbols: string[];
};

export default function FiltersFormClient({
  industries,
  sectors,
  countries,
  selectedIndustry,
  selectedSector,
  selectedCountry,
  excludeEtfsEnabled,
  maSupportEnabled,
  symbols,
}: Props) {
  const router = useRouter();
  const { isPending, startTransition } = useHomeNavigation();

  const buildHref = (overrides: {
    industry?: string;
    sector?: string;
    country?: string;
    excludeEtfs?: boolean;
    maSupport?: boolean;
  }) => {
    const p = new URLSearchParams();
    for (const symbol of symbols) p.append("symbol", symbol);
    const ind = "industry" in overrides ? overrides.industry : selectedIndustry;
    const sec = "sector" in overrides ? overrides.sector : selectedSector;
    const cou = "country" in overrides ? overrides.country : selectedCountry;
    const exc = "excludeEtfs" in overrides ? overrides.excludeEtfs : excludeEtfsEnabled;
    const mas = "maSupport" in overrides ? overrides.maSupport : maSupportEnabled;
    if (ind) p.set("industry", ind);
    if (sec) p.set("sector", sec);
    if (cou) p.set("country", cou);
    if (!exc) p.set("excludeEtfs", "0");
    if (mas) p.set("maSupport", "1");
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const navigate = (href: string) => {
    startTransition(() => router.push(href));
  };

  const hasActiveFilters =
    selectedIndustry || selectedSector || selectedCountry || !excludeEtfsEnabled || maSupportEnabled;

  return (
    <div className={`row g-3${isPending ? " filters-form--pending" : ""}`}>
      <div className="col-md-4">
        <label htmlFor="industry" className="form-label filter-form-label">
          Industry
        </label>
        <select
          id="industry"
          name="industry"
          className="form-select glass-select"
          value={selectedIndustry}
          onChange={(e) => navigate(buildHref({ industry: e.target.value }))}
          disabled={isPending}
        >
          <option value="">All industries</option>
          {industries.map((industry) => (
            <option key={industry} value={industry}>{industry}</option>
          ))}
        </select>
      </div>
      <div className="col-md-4">
        <label htmlFor="sector" className="form-label filter-form-label">
          Sector
        </label>
        <select
          id="sector"
          name="sector"
          className="form-select glass-select"
          value={selectedSector}
          onChange={(e) => navigate(buildHref({ sector: e.target.value }))}
          disabled={isPending}
        >
          <option value="">All sectors</option>
          {sectors.map((sector) => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
      </div>
      <div className="col-md-4">
        <label htmlFor="country" className="form-label filter-form-label">
          Country
        </label>
        <select
          id="country"
          name="country"
          className="form-select glass-select"
          value={selectedCountry}
          onChange={(e) => navigate(buildHref({ country: e.target.value }))}
          disabled={isPending}
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>
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

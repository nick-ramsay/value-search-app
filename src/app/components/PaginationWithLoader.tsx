"use client";

import { useRouter } from "next/navigation";
import { useHomeNavigation } from "./HomeNavigationContext";
import SkeletonStockCard from "./SkeletonStockCard";

const PENDING_SKELETON_COUNT = 4;

type PaginationWithLoaderProps = {
  currentPage: number;
  hasMore: boolean;
  isFiltered: boolean;
  symbols: string[];
  selectedIndustries: string[];
  selectedSectors: string[];
  selectedCountries: string[];
  excludeEtfsEnabled: boolean;
  maSupportEnabled: boolean;
  children: React.ReactNode;
};

function buildPageHref(
  page: number,
  params: {
    symbols: string[];
    selectedIndustries: string[];
    selectedSectors: string[];
    selectedCountries: string[];
    excludeEtfsEnabled: boolean;
    maSupportEnabled: boolean;
  }
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("page", page.toString());
  for (const symbol of params.symbols) searchParams.append("symbol", symbol);
  for (const industry of params.selectedIndustries) searchParams.append("industry", industry);
  for (const sector of params.selectedSectors) searchParams.append("sector", sector);
  for (const country of params.selectedCountries) searchParams.append("country", country);
  if (!params.excludeEtfsEnabled) searchParams.set("excludeEtfs", "0");
  if (params.maSupportEnabled) searchParams.set("maSupport", "1");
  const search = searchParams.toString();
  return search.length > 0 ? `/?${search}` : "/";
}

export default function PaginationWithLoader({
  currentPage,
  hasMore,
  isFiltered,
  symbols,
  selectedIndustries,
  selectedSectors,
  selectedCountries,
  excludeEtfsEnabled,
  maSupportEnabled,
  children,
}: PaginationWithLoaderProps) {
  const router = useRouter();
  const { isPending, startTransition } = useHomeNavigation();

  const params = {
    symbols,
    selectedIndustries,
    selectedSectors,
    selectedCountries,
    excludeEtfsEnabled,
    maSupportEnabled,
  };

  const prevHref = buildPageHref(currentPage - 1, params);
  const nextHref = buildPageHref(currentPage + 1, params);

  const goTo = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  const navContent = (
    <>
      {currentPage > 1 ? (
        <button
          type="button"
          className="pagination-nav-btn border-0 bg-transparent p-0"
          onClick={() => goTo(prevHref)}
          disabled={isPending}
          aria-label="Previous page"
        >
          <i className="page-change-icon bi bi-chevron-left" aria-hidden />
        </button>
      ) : (
        <span aria-hidden="true" className="pagination-nav-spacer" />
      )}
      <span className="pagination-page-label align-self-center">
        Page {currentPage}
      </span>
      {hasMore ? (
        <button
          type="button"
          className="pagination-nav-btn border-0 bg-transparent p-0"
          onClick={() => goTo(nextHref)}
          disabled={isPending}
          aria-label="Next page"
        >
          <i className="page-change-icon bi bi-chevron-right" aria-hidden />
        </button>
      ) : (
        <span aria-hidden="true" className="pagination-nav-spacer" />
      )}
    </>
  );

  return (
    <div className="position-relative">
      {!isFiltered ? (
        <nav
          aria-label="Results pages"
          className="d-flex align-items-center justify-content-between mb-3"
          style={{ pointerEvents: isPending ? "none" : undefined, opacity: isPending ? 0.7 : 1 }}
        >
          {navContent}
        </nav>
      ) : null}
      {isPending ? (
        <div className="d-flex flex-column gap-2" role="status" aria-live="polite" aria-busy="true">
          <span className="visually-hidden">Loading results…</span>
          {Array.from({ length: PENDING_SKELETON_COUNT }, (_, i) => (
            <SkeletonStockCard key={i} />
          ))}
        </div>
      ) : (
        children
      )}
      {!isFiltered && hasMore ? (
        <nav
          aria-label="Results pages"
          className="d-flex align-items-center justify-content-between mt-3"
          style={{ pointerEvents: isPending ? "none" : undefined, opacity: isPending ? 0.7 : 1 }}
        >
          {navContent}
        </nav>
      ) : null}
    </div>
  );
}

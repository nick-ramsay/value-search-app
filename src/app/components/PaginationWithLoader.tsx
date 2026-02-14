"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type PaginationWithLoaderProps = {
  currentPage: number;
  hasMore: boolean;
  isFiltered: boolean;
  query: string;
  isSelected: boolean;
  selectedIndustry: string;
  selectedSector: string;
  selectedCountry: string;
  children: React.ReactNode;
};

function buildPageHref(
  page: number,
  params: {
    query: string;
    isSelected: boolean;
    selectedIndustry: string;
    selectedSector: string;
    selectedCountry: string;
  }
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("page", page.toString());
  if (params.query) searchParams.set("q", params.query);
  if (params.isSelected) searchParams.set("selected", "1");
  if (params.selectedIndustry) searchParams.set("industry", params.selectedIndustry);
  if (params.selectedSector) searchParams.set("sector", params.selectedSector);
  if (params.selectedCountry) searchParams.set("country", params.selectedCountry);
  const search = searchParams.toString();
  return search.length > 0 ? `/?${search}` : "/";
}

export default function PaginationWithLoader({
  currentPage,
  hasMore,
  isFiltered,
  query,
  isSelected,
  selectedIndustry,
  selectedSector,
  selectedCountry,
  children,
}: PaginationWithLoaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const params = {
    query,
    isSelected,
    selectedIndustry,
    selectedSector,
    selectedCountry,
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
        <span aria-hidden="true" style={{ width: "40px" }} />
      )}
      <span className="align-self-center">Page {currentPage}</span>
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
        <span aria-hidden="true" style={{ width: "40px" }} />
      )}
    </>
  );

  return (
    <div className="position-relative">
      {isPending && (
        <div
          className="pagination-loading-overlay position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column align-items-center justify-content-center rounded"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="spinner-border" aria-hidden />
        </div>
      )}
      {!isFiltered ? (
        <nav
          aria-label="Results pages"
          className="d-flex align-items-center justify-content-between mb-4"
          style={{ pointerEvents: isPending ? "none" : undefined, opacity: isPending ? 0.7 : 1 }}
        >
          {navContent}
        </nav>
      ) : null}
      {children}
      {!isFiltered && hasMore ? (
        <nav
          aria-label="Results pages"
          className="d-flex align-items-center justify-content-between mt-4"
          style={{ pointerEvents: isPending ? "none" : undefined, opacity: isPending ? 0.7 : 1 }}
        >
          {navContent}
        </nav>
      ) : null}
    </div>
  );
}

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppNavbar from "./components/AppNavbar";
import SkeletonStockCard from "./components/SkeletonStockCard";

function PageLoadingContent() {
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const currentPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 page-loading-main flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section className="card-body pb-2 d-flex justify-content-center" aria-hidden="true">
              <span className="results-summary__count--skeleton" />
            </section>
            <section className="card glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
              <div className="card-body pt-0 page-loading-results-card-body">
                <nav
                  aria-label="Results pages"
                  className="d-flex align-items-center justify-content-between mb-3"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "1.75rem", cursor: "not-allowed" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-left" />
                  </span>
                  <span className="pagination-page-label align-self-center">
                    Page {currentPage}
                  </span>
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "1.75rem", cursor: "not-allowed" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-right" />
                  </span>
                </nav>
                <div className="d-flex flex-column gap-2" role="status" aria-live="polite">
                  <span className="visually-hidden">Loading results…</span>
                  {Array.from({ length: 4 }, (_, i) => (
                    <SkeletonStockCard key={i} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 page-loading-main flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section className="card-body pb-2 d-flex justify-content-center" aria-hidden="true">
              <span className="results-summary__count--skeleton" />
            </section>
            <section className="card glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
              <div className="card-body pt-0 page-loading-results-card-body">
                <nav
                  aria-label="Results pages"
                  className="d-flex align-items-center justify-content-between mb-3"
                  aria-busy="true"
                >
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "1.75rem" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-left" />
                  </span>
                  <span className="pagination-page-label align-self-center">
                    Page 1
                  </span>
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "1.75rem" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-right" />
                  </span>
                </nav>
                <div className="d-flex flex-column gap-2" role="status">
                  <span className="visually-hidden">Loading results…</span>
                  {Array.from({ length: 4 }, (_, i) => (
                    <SkeletonStockCard key={i} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Loading() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <PageLoadingContent />
    </Suspense>
  );
}
